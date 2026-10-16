import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { test } from "node:test";
import { MongoClient } from "mongodb";
import { createApp } from "../src/health.js";
import { createIngestionApi } from "../src/ingestion-api.js";
import { digest, strictJson, validatePayload, type Json, type Payload } from "../src/ingestion-contract.js";
import { type GoldPayload } from "../src/gold-contract.js";
import { createIngestionQueue, DeliveryQueue, jobId } from "../src/ingestion-queue.js";
import { IngestionStore } from "../src/ingestion-store.js";
import { startIngestionWorker } from "../src/ingestion-worker.js";
import { gold, goldOne, sealGold, asJson } from "./gold-test-data.js";
import { observed } from "./observed-test-data.js";

const mongoUrl = process.env.MONGODB_URL ?? "mongodb://127.0.0.1:27017/marketpulse";
const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
async function eventually(check: () => Promise<boolean>, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 50)); }
  assert.fail("Gold ingestion did not reach expected state");
}
async function setup() {
  const unique = randomUUID().replaceAll("-", ""); const name = `gold-test-${unique}`;
  const client = new MongoClient(mongoUrl, { serverSelectionTimeoutMS: 1000 }); await client.connect();
  const store = new IngestionStore(client.db(`mp_gold_test_${unique}`)); await store.initialize();
  const producer = createIngestionQueue(redisUrl, name); await producer.queue.waitUntilReady();
  const deliveries = new DeliveryQueue(store, producer.queue);
  const accept = async (id: string, payload: Payload = goldOne()) => store.accept(id, digest(payload as unknown as Json), validatePayload(payload as unknown as Json));
  const terminal = (id: string, status = "success") => eventually(async () => (await store.deliveries.findOne({ _id: id }))?.status === status);
  const close = async () => { await producer.queue.obliterate({ force: true }); await producer.close(); await store.db.dropDatabase(); await client.close(); };
  return { store, producer, deliveries, accept, terminal, close, name };
}
function version(collected: string, source: string | null = "2026-10-15T02:00:00.000000Z", index = 0): GoldPayload {
  const payload = goldOne(index); const row = payload.observations[0]!;
  row.time.collectedAt = collected; row.time.sourceAsOf = source;
  row.time.referenceDate = new Date(Date.parse(source ?? collected) + 7 * 3600_000).toISOString().slice(0, 10);
  row.time.referenceDateType = source === null ? "collected_date" : "source_date";
  row.qualityFlags.sourceTimestampStatus = source === null ? "unknown" : "verified";
  sealGold(row); return payload;
}

test("gold authenticated HTTP receipt validates before persistence and isolates fixture/observed families", async t => {
  const c = await setup();
  const runtime = await startIngestionWorker(c.store, redisUrl, { name: c.name, reconcileMs: 100 });
  const secret = "e".repeat(64);
  const server = createServer(createApp({ checks: { mongo: async () => true, redis: async () => true }, ingestionRouter: createIngestionApi({ store: c.store, secret, isReady: () => true, enqueue: (id, hash) => c.deliveries.enqueue(id, hash) }) }));
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await runtime.close(); await c.close(); });
  const address = server.address(); assert(address && typeof address === "object"); const url = `http://127.0.0.1:${address.port}/internal/ingestion/deliveries`;
  const send = (payload: Json, id: string) => fetch(url, { method: "POST", headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" }, body: JSON.stringify({ deliveryId: id, payloadDigest: digest(payload), payload }) });
  assert.equal((await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{broken" })).status, 401);
  const invalid = goldOne(); invalid.observations[0]!.quotes.buy = "1";
  assert.equal((await send(asJson(invalid), "invalid")).status, 400);
  const mixed = { ...goldOne(), assets: [] } as unknown as Json;
  assert.equal((await send(mixed, "mixed")).status, 400);
  assert.equal(await c.store.deliveries.countDocuments(), 0);
  assert((await Promise.all(Array.from({ length: 8 }, () => send(asJson(gold()), "gold")))).every(response => response.status === 202)); await c.terminal("gold");
  const delivery = await c.store.deliveries.findOne({ _id: "gold" }); assert.deepEqual(delivery?.payload, gold()); assert.equal(delivery?.schemaVersion, "1.0.0");
  assert.deepEqual(delivery?.counts, { assets: new Set(gold().observations.map(row => row.assetId)).size, observations: 11 });
  const before = await c.store.gold.latest.find().sort({ _id: 1 }).toArray();
  const fixture = strictJson(readFileSync("fixtures/market/mp-02-synthetic.json", "utf8"));
  assert.equal((await send(fixture, "gold")).status, 409);
  assert.equal((await send(fixture, "fixture")).status, 202); await c.terminal("fixture");
  assert.equal((await send(observed() as unknown as Json, "observed")).status, 202); await c.terminal("observed");
  assert.deepEqual(await c.store.gold.latest.find().sort({ _id: 1 }).toArray(), before);
  assert.equal(await c.store.assets.countDocuments(), 11); assert.equal(await c.store.observations.countDocuments(), 44);
  assert.equal(await c.store.observed.assets.countDocuments(), 1); assert.equal(await c.store.observed.latest.countDocuments(), 1);
  const response = await fetch(`${url}/gold`, { headers: { Authorization: `Bearer ${secret}` } });
  const receipt = await response.json() as { counts: { observations: number } }; assert.equal(receipt.counts.observations, 11); assert(!("payload" in receipt));
  assert.equal((await fetch(`http://127.0.0.1:${address.port}/api/gold/quotes/latest`)).status, 404);
});

test("gold A-B-A retains full first revision and converges both projections with exact replay", async t => {
  const c = await setup(); t.after(c.close);
  for (const index of [0, 1, 2]) await c.store.persist(await c.accept(`aba-${index}`, goldOne(index)));
  const rows = gold().observations; const first = rows[0]!; const last = rows[2]!;
  assert.equal(await c.store.gold.revisions.countDocuments(), 2);
  const revision = await c.store.gold.revisions.findOne({ _id: digest([first.snapshotId, first.contentDigest]) });
  assert.deepEqual(revision?.record, first); assert.equal(revision?.firstDeliveryId, "aba-0");
  const snapshot = await c.store.gold.snapshots.findOne({ _id: last.snapshotId }); const latest = await c.store.gold.latest.findOne({ _id: last.assetId });
  assert.deepEqual(snapshot?.record, last); assert.deepEqual(latest?.record, last); assert.equal(snapshot?.deliveryId, "aba-2"); assert.equal(latest?.deliveryId, "aba-2");
  const replay = await c.accept("replay", goldOne(2)); await c.store.persist(replay);
  assert.deepEqual(await c.store.gold.snapshots.findOne({ _id: last.snapshotId }), snapshot);
  assert.deepEqual(await c.store.gold.latest.findOne({ _id: last.assetId }), latest);
  assert.deepEqual(await c.store.gold.revisions.findOne({ _id: revision!._id }), revision);
  await c.store.persist(await c.accept("later-source", goldOne(3)));
  const older = version("2026-10-15T10:00:00.000000Z"); await c.store.persist(await c.accept("older-source-late", older));
  assert.deepEqual((await c.store.gold.latest.findOne({ _id: first.assetId }))?.record, rows[3]);
  assert.deepEqual((await c.store.gold.snapshots.findOne({ _id: first.snapshotId }))?.record, older.observations[0]);
});

test("gold verified latest outranks unknown, unknown refetch snapshots remain distinct", async t => {
  const c = await setup(); t.after(c.close);
  const unknown = version("2026-10-15T10:00:00.000001Z", null); const refetch = version("2026-10-15T10:00:00.000002Z", null);
  await c.store.persist(await c.accept("unknown", unknown)); await c.store.persist(await c.accept("refetch", refetch));
  const assetId = unknown.observations[0]!.assetId;
  assert.deepEqual((await c.store.gold.latest.findOne({ _id: assetId }))?.record, refetch.observations[0]);
  assert.equal(await c.store.gold.snapshots.countDocuments(), 2); assert.equal(await c.store.gold.revisions.countDocuments(), 2);
  await c.store.persist(await c.accept("verified", goldOne()));
  assert.deepEqual((await c.store.gold.latest.findOne({ _id: assetId }))?.record, goldOne().observations[0]);
  await c.store.persist(await c.accept("unknown-again", version("2026-10-15T11:00:00.000000Z", null)));
  assert.deepEqual((await c.store.gold.latest.findOne({ _id: assetId }))?.record, goldOne().observations[0]);
});

test("gold concurrent first upserts, source microseconds and digest ties deterministically select winners", async t => {
  const c = await setup(); t.after(c.close);
  const payloads = [version("2026-10-15T03:00:00.000001Z"), version("2026-10-15T03:00:00.000001Z", undefined, 1), version("2026-10-15T03:00:00.000000Z")];
  const accepted = await Promise.all(payloads.map((payload, i) => c.accept(`race-${i}`, payload)));
  await Promise.all(accepted.map(delivery => c.store.persist(delivery)));
  const winner = payloads.slice(0, 2).sort((a, b) => a.observations[0]!.contentDigest.localeCompare(b.observations[0]!.contentDigest)).at(-1)!.observations[0]!;
  assert.deepEqual((await c.store.gold.latest.findOne({ _id: winner.assetId }))?.record, winner);
  assert.deepEqual((await c.store.gold.snapshots.findOne({ _id: winner.snapshotId }))?.record, winner);
  const newerSource = version("2026-10-15T03:00:00.000000Z", "2026-10-15T02:00:00.000001Z");
  await c.store.persist(await c.accept("source-micro", newerSource));
  assert.deepEqual((await c.store.gold.latest.findOne({ _id: winner.assetId }))?.record, newerSource.observations[0]);
  const next = version("2026-10-15T03:00:00.000002Z"); await c.store.persist(await c.accept("collection-micro", next));
  assert.deepEqual((await c.store.gold.snapshots.findOne({ _id: winner.snapshotId }))?.record, next.observations[0]);
  assert.deepEqual((await c.store.gold.latest.findOne({ _id: winner.assetId }))?.record, newerSource.observations[0]);
});

test("gold Mongo validators reject nested types, extra fields, conditional brand and oversized raw arrays", async t => {
  const c = await setup(); t.after(c.close); await c.store.persist(await c.accept("valid"));
  const latest = await c.store.gold.latest.findOne({}); assert(latest);
  for (const mutate of [
    (row: typeof latest) => { row.record.quotes.buy = 1 as never; },
    (row: typeof latest) => { row.record.provenance.originalBuy = "1e3"; },
    (row: typeof latest) => { row.record.time.collectedAt = "2026-10-15T02:00:01Z"; },
    (row: typeof latest) => { row.record.brand = "PNJ"; },
    (row: typeof latest) => { (row.record.quotes as Record<string, Json>).extra = "bad"; },
  ]) { const invalid = structuredClone(latest); mutate(invalid); await assert.rejects(c.store.gold.latest.replaceOne({ _id: latest._id }, invalid)); }
  for (const collection of [c.store.gold.assets, c.store.gold.revisions, c.store.gold.snapshots, c.store.gold.latest]) await assert.rejects(collection.insertOne({ _id: "invalid" } as never));
  const delivery = await c.store.deliveries.findOne({ _id: "valid" }); assert(delivery);
  const oversized = goldOne(); oversized.observations = Array.from({ length: 501 }, () => oversized.observations[0]!);
  await assert.rejects(c.store.deliveries.insertOne({ ...delivery, _id: "oversized", payload: oversized }));
  const index = await c.store.gold.revisions.indexes(); assert(index.some(value => value.name === "snapshot_content_revision" && value.unique));
});

test("gold exhausted partial delivery keeps honest unique asset and completed observation counts", async t => {
  const c = await setup(); const payload = goldOne(); payload.observations.push(gold().observations[1]!);
  await c.accept("partial", payload);
  const runtime = await startIngestionWorker(c.store, redisUrl, { name: c.name, reconcileMs: 100, hooks: { afterWrite: async count => { if (count === 2) throw new Error("synthetic partial failure"); } } });
  t.after(async () => { await runtime.close(); await c.close(); }); await c.terminal("partial", "failure");
  const delivery = await c.store.deliveries.findOne({ _id: "partial" }); assert.equal(delivery?.attempts, 3); assert.deepEqual(delivery?.counts, { assets: 1, observations: 1 });
  assert.equal(await c.store.gold.revisions.countDocuments(), 1); assert.equal(await c.store.gold.snapshots.countDocuments(), 1); assert.equal(await c.store.gold.latest.countDocuments(), 1);
  await c.deliveries.reconcile(); assert.equal((await c.store.deliveries.findOne({ _id: "partial" }))?.status, "failure");
});

for (const boundary of ["revision", "snapshot", "success"]) test(`gold worker killed after ${boundary} recovers every projection and terminal receipt`, async t => {
  const c = await setup(); await c.accept("crash");
  const child = fork(resolve("apps/api/tests/ingestion-child.ts"), [mongoUrl, c.store.db.databaseName, redisUrl, c.name, boundary], { execArgv: ["--import", "tsx"], stdio: ["ignore", "ignore", "ignore", "ipc"] });
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); });
  await new Promise<void>((resolve, reject) => { const timer = setTimeout(() => reject(new Error("Child fault boundary timeout")), 12000); child.on("message", message => { if ((message as { stage: string }).stage === boundary) { clearTimeout(timer); resolve(); } }); child.once("error", reject); });
  assert.equal(await c.store.gold.revisions.countDocuments(), 1); assert.equal(await c.store.gold.snapshots.countDocuments(), boundary === "revision" ? 0 : 1); assert.equal(await c.store.gold.latest.countDocuments(), boundary === "success" ? 1 : 0);
  const exited = new Promise<void>(resolve => child.once("exit", () => resolve())); child.kill("SIGKILL"); await exited;
  const runtime = await startIngestionWorker(c.store, redisUrl, { name: c.name, reconcileMs: 100, lockDuration: 1000, stalledInterval: 1000 });
  t.after(async () => { await runtime.close(); await c.close(); }); await c.terminal("crash");
  await eventually(async () => (await c.producer.queue.getJob(jobId("crash")))?.getState().then(state => state === "completed") ?? false);
  assert.equal(await c.store.gold.revisions.countDocuments(), 1); assert.equal(await c.store.gold.snapshots.countDocuments(), 1); assert.equal(await c.store.gold.latest.countDocuments(), 1);
  const row = goldOne().observations[0]!; assert.deepEqual((await c.store.gold.snapshots.findOne({ _id: row.snapshotId }))?.record, row); assert.deepEqual((await c.store.gold.latest.findOne({ _id: row.assetId }))?.record, row);
  const delivery = await c.store.deliveries.findOne({ _id: "crash" }); assert.deepEqual(delivery?.counts, { assets: 1, observations: 1 }); assert.equal(delivery?.attempts, boundary === "success" ? 1 : 2);
});
