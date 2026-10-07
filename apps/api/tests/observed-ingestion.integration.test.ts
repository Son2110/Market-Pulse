import assert from "node:assert/strict";
import { execFile, fork, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { delimiter, resolve } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { MongoClient } from "mongodb";
import { createApp } from "../src/health.js";
import { createDailyHistoryRouter } from "../src/daily-history.js";
import { createFixtureMarketDataProvider } from "../src/fixture-market-data-provider.js";
import { createIngestionApi } from "../src/ingestion-api.js";
import { collectedOrder, digest, strictJson, validatePayload, type Json, type ObservedPayload } from "../src/ingestion-contract.js";
import { createIngestionQueue, DeliveryQueue, jobId } from "../src/ingestion-queue.js";
import { IngestionStore } from "../src/ingestion-store.js";
import { startIngestionWorker } from "../src/ingestion-worker.js";
import { observed, rehash } from "./observed-test-data.js";

const execute = promisify(execFile);
const mongoUrl = process.env.MONGODB_URL ?? "mongodb://127.0.0.1:27017/marketpulse";
const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function eventually(check: () => Promise<boolean>, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await check()) return; await pause(50); }
  assert.fail("Observed ingestion did not reach expected state");
}
async function setup() {
  const unique = randomUUID().replaceAll("-", ""); const name = `observed-test-${unique}`;
  const client = new MongoClient(mongoUrl, { serverSelectionTimeoutMS: 1000 }); await client.connect();
  const store = new IngestionStore(client.db(`mp_observed_test_${unique}`)); await store.initialize();
  const producer = createIngestionQueue(redisUrl, name); await producer.queue.waitUntilReady();
  const deliveries = new DeliveryQueue(store, producer.queue);
  const accept = async (id: string, payload = observed()) => store.accept(id, digest(payload as unknown as Json), validatePayload(payload as unknown as Json));
  const terminal = (id: string, status = "success") => eventually(async () => (await store.deliveries.findOne({ _id: id }))?.status === status);
  const close = async () => { await producer.queue.obliterate({ force: true }); await producer.close(); await store.db.dropDatabase(); await client.close(); };
  return { client, store, producer, deliveries, accept, terminal, close, name };
}
function version(close: string, time: string): ObservedPayload {
  const payload = observed(); payload.candles[0]!.close = close; payload.candles[0]!.collectedAt = time;
  return rehash(payload);
}
test("observed Python HTTP transport, auth/validation, concurrent replay, fixture isolation and revision/refetch", async t => {
  const c = await setup(); t.after(c.close);
  const runtime = await startIngestionWorker(c.store, redisUrl, { name: c.name, reconcileMs: 100 }); t.after(() => runtime.close());
  const secret = "e".repeat(64);
  const server = createServer(createApp({ checks: { mongo: async () => true, redis: async () => true }, dailyHistoryRouter: createDailyHistoryRouter(createFixtureMarketDataProvider()), ingestionRouter: createIngestionApi({ store: c.store, secret, isReady: () => true, enqueue: (id, hash) => c.deliveries.enqueue(id, hash) }) }));
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve)); t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address(); assert(address && typeof address === "object"); const url = `http://127.0.0.1:${address.port}/internal/ingestion/deliveries`;
  const send = (payload: ObservedPayload, id: string) => fetch(url, { method: "POST", headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" }, body: JSON.stringify({ deliveryId: id, payloadDigest: digest(payload as unknown as Json), payload }) });
  assert.equal((await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{broken" })).status, 401);
  const invalid = observed(); invalid.candles[0]!.collectedAt += "x";
  assert.equal((await send(invalid, "invalid")).status, 400); assert.equal(await c.store.deliveries.countDocuments(), 0);
  const env = { ...process.env, PYTHONPATH: `${resolve("services/collector")}${delimiter}${process.cwd()}`, INGESTION_ENDPOINT: url, INGESTION_SECRET: secret };
  const python = "import json; from collector.transport import submit; from scripts.validate_observed_candles import validate_observed_candles; p=json.load(open('apps/api/tests/observed-parity.json',encoding='utf-8'))['baseline']; assert not validate_observed_candles(p); print(json.dumps(submit(p,poll_seconds=10)))";
  const run = () => execute("python", ["-c", python], { env });
  const report = JSON.parse((await run()).stdout) as { deliveryId: string; payloadDigest: string; status: string };
  assert.equal(report.status, "success"); assert.equal(report.payloadDigest, digest(observed() as unknown as Json));
  const acceptedRaw = await c.store.deliveries.findOne({ _id: report.deliveryId }); assert.deepEqual(acceptedRaw?.payload, observed()); assert.equal(acceptedRaw?.schemaVersion, "2.0.0"); assert.equal(acceptedRaw?.provider, "KBS");
  await run(); assert.equal(await c.store.deliveries.countDocuments(), 1);
  assert((await Promise.all(Array.from({ length: 8 }, () => send(observed(), "concurrent")))).every(response => response.status === 202)); await c.terminal("concurrent");
  assert.equal((await send(version("1350", "2026-10-06T08:00:00Z"), "concurrent")).status, 409);
  const refetch = version("1300", "2026-10-06T08:00:00Z"); assert.equal((await send(refetch, "refetch")).status, 202); await c.terminal("refetch");
  assert.equal(await c.store.observed.revisions.countDocuments(), 1);
  const revised = version("1350", "2026-10-06T09:00:00Z"); await send(revised, "revision"); await c.terminal("revision");
  const back = version("1300", "2026-10-06T10:00:00Z"); await send(back, "back-to-a"); await c.terminal("back-to-a");
  assert.equal(await c.store.observed.revisions.countDocuments(), 2);
  const latest = await c.store.observed.latest.findOne({ _id: back.candles[0]!.barId }); assert.deepEqual(latest?.record, back.candles[0]); assert.equal(latest?.deliveryId, "back-to-a");
  const revision = await c.store.observed.revisions.findOne({ contentDigest: back.candles[0]!.contentDigest }); assert(revision); assert(!("collectedAt" in (revision.record as Record<string, Json>)));
  const index = observed(true); await send(index, "index"); await c.terminal("index");
  const empty = observed(); empty.candles = []; await send(empty, "empty"); await c.terminal("empty");
  assert.deepEqual((await c.store.deliveries.findOne({ _id: "empty" }))?.counts, { assets: 1, observations: 0 });
  const fixture = validatePayload(strictJson(readFileSync("fixtures/market/mp-02-synthetic.json", "utf8")));
  const delivery = await c.store.accept("fixture", digest(fixture as unknown as Json), fixture); await c.deliveries.enqueue(delivery._id, delivery.payloadDigest); await c.terminal("fixture");
  assert.equal(await c.store.assets.countDocuments(), 11); assert.equal(await c.store.observations.countDocuments(), 44); assert.equal(await c.store.observed.assets.countDocuments(), 2); assert.equal(await c.store.observed.latest.countDocuments(), 2);
  assert.deepEqual((await c.store.observed.latest.findOne({ _id: back.candles[0]!.barId }))?.record, back.candles[0]);
  const publicHistory = await fetch(`http://127.0.0.1:${address.port}/api/assets/FPT/history`); assert.equal(publicHistory.status, 200); const publicText = await publicHistory.text(); assert(publicText.includes("102500")); assert(publicText.includes("fixture"));
  const receipt = await fetch(`${url}/${report.deliveryId}`, { headers: { Authorization: `Bearer ${secret}` } }); assert(!("payload" in (await receipt.json() as object)));
});
test("concurrent observed writes choose exact UTC/digest max across out-of-order, equal offsets and submilliseconds", async t => {
  const c = await setup(); t.after(c.close);
  const payloads = [version("1300", "2026-10-06T07:00:00.000001Z"), version("1350", "2026-10-06T07:00:00Z"), version("1400", "2026-10-06T14:00:00.000001+07:00")];
  const accepted = await Promise.all(payloads.map((payload, i) => c.accept(`parallel-${i}`, payload)));
  await Promise.all(accepted.map(delivery => c.store.persist(delivery)));
  const winner = [payloads[0]!, payloads[2]!].sort((a, b) => a.candles[0]!.contentDigest.localeCompare(b.candles[0]!.contentDigest)).at(-1)!;
  let latest = await c.store.observed.latest.findOne({ _id: winner.candles[0]!.barId }); assert.deepEqual(latest?.record, winner.candles[0]); assert.equal(latest?.collectedOrder, "2026-10-06T07:00:00.000001Z");
  await c.store.persist(accepted[1]!); latest = await c.store.observed.latest.findOne({ _id: winner.candles[0]!.barId }); assert.deepEqual(latest?.record, winner.candles[0]);
  const refetch = version("1350", "2026-10-06T07:00:00.000002Z"); await c.store.persist(await c.accept("latest-refetch", refetch));
  latest = await c.store.observed.latest.findOne({ _id: refetch.candles[0]!.barId }); assert.deepEqual(latest?.record, refetch.candles[0]); assert.equal(latest?.collectedOrder, collectedOrder(refetch.candles[0]!.collectedAt));
  assert.equal(await c.store.observed.revisions.countDocuments(), 3); assert.equal(await c.store.observed.latest.countDocuments(), 1);
  await assert.rejects(c.store.observed.latest.insertOne({ _id: "invalid" } as never));
});
test("observed raw outbox acceptance survives enqueue loss, and exhausted partial batches retain honest counts", async t => {
  const c = await setup(); t.after(c.close);
  const payload = observed(); const row = structuredClone(payload.candles[0]!); row.tradingDate = "2026-10-03"; row.providerTimeLabel = "2026-10-03 07:00"; row.barId = digest(["KBS", row.assetId, row.interval, row.tradingDate, row.adjustmentBasis]); payload.candles.push(row); rehash(payload);
  await c.accept("partial", payload);
  const runtime = await startIngestionWorker(c.store, redisUrl, { name: c.name, reconcileMs: 100, hooks: { afterWrite: async count => { if (count === 2) throw new Error("synthetic partial failure"); } } }); t.after(() => runtime.close());
  await c.terminal("partial", "failure"); const raw = await c.store.deliveries.findOne({ _id: "partial" }); assert.equal(raw?.attempts, 3); assert.deepEqual(raw?.counts, { assets: 1, observations: 1 });
  assert.equal(await c.store.observed.revisions.countDocuments(), 1); assert.equal(await c.store.observed.latest.countDocuments(), 1); assert.deepEqual((await c.store.observed.latest.findOne({ _id: payload.candles[0]!.barId }))?.record, payload.candles[0]);
  await c.deliveries.reconcile(); assert.equal((await c.store.deliveries.findOne({ _id: "partial" }))?.status, "failure");
});
for (const boundary of ["revision", "observed-write", "success"]) test(`observed worker killed at ${boundary} repairs revision/projection and respects durable terminal success`, async t => {
  const c = await setup(); t.after(c.close); const payload = observed(); await c.accept("crash", payload);
  const child: ChildProcess = fork(resolve("apps/api/tests/ingestion-child.ts"), [mongoUrl, c.store.db.databaseName, redisUrl, c.name, boundary], { execArgv: ["--import", "tsx"], stdio: ["ignore", "ignore", "ignore", "ipc"] });
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); });
  await new Promise<void>((resolve, reject) => { const timer = setTimeout(() => reject(new Error("Child fault boundary timeout")), 12000); child.on("message", message => { if ((message as { stage: string }).stage === (boundary === "observed-write" ? "write" : boundary)) { clearTimeout(timer); resolve(); } }); child.once("error", reject); });
  assert.equal(await c.store.observed.revisions.countDocuments(), 1); assert.equal(await c.store.observed.latest.countDocuments(), boundary === "revision" ? 0 : 1);
  const exited = new Promise<void>(resolve => child.once("exit", () => resolve())); child.kill("SIGKILL"); await exited;
  const runtime = await startIngestionWorker(c.store, redisUrl, { name: c.name, reconcileMs: 100, lockDuration: 1000, stalledInterval: 1000 }); t.after(() => runtime.close());
  await c.terminal("crash"); await eventually(async () => (await c.producer.queue.getJob(jobId("crash")))?.getState().then(state => state === "completed") ?? false);
  assert.deepEqual((await c.store.observed.latest.findOne({ _id: payload.candles[0]!.barId }))?.record, payload.candles[0]);
  assert.equal(await c.store.observed.revisions.countDocuments(), 1); assert.equal(await c.store.observed.latest.countDocuments(), 1);
  const raw = await c.store.deliveries.findOne({ _id: "crash" }); assert.deepEqual(raw?.counts, { assets: 1, observations: 1 }); assert.equal(raw?.attempts, boundary === "success" ? 1 : 2);
});
