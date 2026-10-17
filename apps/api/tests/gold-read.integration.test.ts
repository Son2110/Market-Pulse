import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { resolve } from "node:path";
import test from "node:test";
import { MongoClient } from "mongodb";
import { createDailyHistoryRouter } from "../src/daily-history.js";
import { createFixtureMarketDataProvider } from "../src/fixture-market-data-provider.js";
import { createGoldReadRouter, goldHistoryPipeline, GoldReadService } from "../src/gold-read.js";
import { parseGoldHistoryQuery } from "../src/gold-read-contract.js";
import { createApp } from "../src/health.js";
import { digest, validatePayload, type Json } from "../src/ingestion-contract.js";
import { IngestionStore } from "../src/ingestion-store.js";
import { gold, goldOne, sealGold } from "./gold-test-data.js";

const mongoUrl = process.env.MONGODB_URL ?? "mongodb://127.0.0.1:27017/marketpulse";
const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
const baseQuery = "provider=marketpulse-fixture&product=gold_bar_sjc&from=2026-10-01&to=2026-10-31&region=H%E1%BB%93+Ch%C3%AD+Minh";
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function setup() {
  const client = new MongoClient(mongoUrl, { serverSelectionTimeoutMS: 1000, socketTimeoutMS: 2000 }); await client.connect();
  const db = client.db(`mp_gr_${randomUUID().replaceAll("-", "")}`);
  const store = new IngestionStore(db); await store.initialize();
  const accept = async (id: string, payload = goldOne()) => store.accept(id, digest(payload as unknown as Json), validatePayload(payload as unknown as Json));
  const persist = async (id: string, payload = goldOne()) => store.persist(await accept(id, payload));
  const server = createServer(createApp({ checks: { mongo: async () => true, redis: async () => true }, dailyHistoryRouter: createDailyHistoryRouter(createFixtureMarketDataProvider()), goldReadRouter: createGoldReadRouter(new GoldReadService(db)) }));
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert(address && typeof address === "object"); const base = `http://127.0.0.1:${address.port}`;
  const get = (endpoint = "history", query = baseQuery) => fetch(`${base}/api/gold/quotes/${endpoint}?${query}`);
  const close = async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
    try { await client.connect(); await db.dropDatabase(); } finally { await client.close(); }
  };
  return { client, db, store, persist, accept, get, base, close };
}
function version(collectedAt: string, sourceAsOf: string | null = "2026-10-15T02:00:00.000000Z", index = 0) {
  const payload = goldOne(index); const row = payload.observations[0]!;
  row.time.collectedAt = collectedAt; row.time.sourceAsOf = sourceAsOf;
  row.time.referenceDate = new Date(Date.parse(sourceAsOf ?? collectedAt) + 7 * 3600_000).toISOString().slice(0, 10);
  row.time.referenceDateType = sourceAsOf === null ? "collected_date" : "source_date";
  row.qualityFlags.sourceTimestampStatus = sourceAsOf === null ? "unknown" : "verified";
  sealGold(row); return payload;
}

test("real gold HTTP reads stored A-B-A/replay winners and separates exact series, gaps, pages and unknown products", async t => {
  const c = await setup(); t.after(c.close);
  assert.equal((await c.get()).status, 404);
  let response = await c.get("latest", ""); assert.equal(response.status, 200); assert.equal((await response.json()).metadata.totalRecords, 0);
  for (let index = 0; index < 3; index++) await c.persist(`aba-${index}`, goldOne(index));
  await c.persist("replay", goldOne(2));
  let body = await (await c.get()).json(); assert.equal(body.metadata.totalRecords, 1); assert.equal(body.data[0].quotes.buy, goldOne(2).observations[0]!.quotes.buy);
  assert.equal(body.data[0].time.collectedAt, goldOne(2).observations[0]!.time.collectedAt);
  assert.equal(await c.store.gold.revisions.countDocuments(), 2);
  await c.persist("all-fixture", gold());
  body = await (await c.get()).json(); assert(body.data.every((row: { assetId: string }) => row.assetId === goldOne().observations[0]!.assetId));
  const all = await (await c.get("latest", "")).json();
  assert.equal(all.metadata.totalRecords, new Set(gold().observations.map(row => row.assetId)).size);
  const ids = all.data.map((row: { assetId: string }) => row.assetId); assert.deepEqual(ids, [...ids].sort());
  const page = await (await c.get("latest", "limit=1&page=2&unit=vnd_per_chi")).json();
  assert.equal(page.metadata.count, 1); assert.equal(page.metadata.totalRecords, ids.length); assert.equal(page.data[0].assetId, ids[1]);
  assert.equal(page.data[0].quotes.unit, "vnd_per_chi"); assert.equal(page.metadata.presentationConversionFactor, "0.1");
  body = await (await c.get("history", `${baseQuery}&limit=1&page=2`)).json(); assert.equal(body.metadata.count, 1); assert.equal(body.metadata.page, 2); assert(body.metadata.totalRecords >= 2);
  response = await c.get("history", baseQuery.replace("2026-10-31", "2026-10-01")); body = await response.json(); assert.equal(response.status, 200); assert.equal(body.metadata.status, "no_data"); assert.deepEqual(body.data, []);
  assert.equal((await c.get("history", baseQuery.replace("H%E1%BB%93+Ch%C3%AD+Minh", "unknown"))).status, 404);
  assert.equal((await c.get("history", baseQuery.replace("&region=H%E1%BB%93+Ch%C3%AD+Minh", ""))).status, 404);
  const nullSeries = version("2026-10-15T05:00:00.000000Z");
  nullSeries.observations[0]!.region = null;
  nullSeries.observations[0]!.qualityFlags.regionStatus = "unverified";
  sealGold(nullSeries.observations[0]!); await c.persist("null-series", nullSeries);
  response = await c.get("history", baseQuery.replace("&region=H%E1%BB%93+Ch%C3%AD+Minh", ""));
  body = await response.json(); assert.equal(response.status, 200); assert.equal(body.data.length, 1); assert.equal(body.data[0].region, null);
  assert.equal((await c.get("history", baseQuery.replace("H%E1%BB%93+Ch%C3%AD+Minh", "null"))).status, 404);
  const ringQuery = baseQuery.replace("gold_bar_sjc", "plain_ring_9999");
  body = await (await c.get("history", ringQuery)).json();
  assert(body.data.every((row: { brand: string; product: string }) => row.brand === "PNJ" && row.product === "plain_ring_9999"));
  response = await c.get(); assert.equal(response.headers.get("cache-control"), "no-store");
  assert(!/"(?:contentDigest|deliveryId|rowDigest|sourceOrder|collectedOrder|_id)"/.test(await response.text()));
  for (const symbol of ["FPT", "VNINDEX"]) {
    response = await fetch(`${c.base}/api/assets/${symbol}/history`); assert.equal(response.status, 200); const fixture = await response.json(); assert.equal(fixture.data.schemaVersion, "1.0.0"); assert.equal(fixture.data.candles.length, 3);
  }
  assert.equal(await c.store.assets.countDocuments(), 0); assert.equal(await c.store.observed.assets.countDocuments(), 0);
});

test("gold history microsecond chronology differs from verified latest priority, with deterministic timestamp ties", async t => {
  const c = await setup(); t.after(c.close);
  const verified = version("2026-10-15T03:00:00.000000Z");
  const knownMicro = version("2026-10-15T03:00:00.000000Z", "2026-10-15T02:00:00.000001Z");
  const unknown = version("2026-10-15T10:00:00.000001Z", null);
  const unknownMicro = version("2026-10-15T10:00:00.000002Z", null);
  const tie = version("2026-10-15T10:00:00.000001Z", "2026-10-15T10:00:00.000001Z");
  for (const [i, payload] of [unknownMicro, knownMicro, unknown, verified, tie].entries()) await c.persist(`order-${i}`, payload);
  let body = await (await c.get()).json();
  const expected = [verified, knownMicro, unknown, unknownMicro, tie].map(p => p.observations[0]!).sort((a, b) => {
    const left = a.time.sourceAsOf ?? a.time.collectedAt; const right = b.time.sourceAsOf ?? b.time.collectedAt;
    return left < right ? -1 : left > right ? 1 : a.snapshotId < b.snapshotId ? -1 : 1;
  });
  assert.deepEqual(body.data.map((row: { snapshotId: string }) => row.snapshotId), expected.map(row => row.snapshotId));
  body = await (await c.get("latest", "")).json(); assert.equal(body.data[0].snapshotId, tie.observations[0]!.snapshotId);
  await c.store.gold.latest.deleteMany({});
  await c.persist("old-verified", verified); await c.persist("new-unknown", unknownMicro);
  body = await (await c.get("latest", "")).json(); assert.equal(body.data[0].snapshotId, verified.observations[0]!.snapshotId);
});

test("gold reads expose partial projection divergence without repair and use the existing bounded history index", async t => {
  const c = await setup(); t.after(c.close); await c.persist("initial");
  const partial = version("2026-10-16T03:00:00.000000Z", "2026-10-16T02:00:00.000000Z"); const delivery = await c.accept("partial", partial);
  await assert.rejects(c.store.gold.persist(delivery, partial, async () => {}, undefined, async () => { throw new Error("stop before latest"); }));
  const beforeLatest = await c.store.gold.latest.find().toArray(); const beforeSnapshots = await c.store.gold.snapshots.find().toArray(); const beforeRevisions = await c.store.gold.revisions.find().toArray();
  const latest = await (await c.get("latest", "")).json(); const history = await (await c.get()).json();
  assert.equal(history.metadata.totalRecords, 2); assert.equal(latest.data[0].snapshotId, goldOne().observations[0]!.snapshotId);
  assert.equal(history.metadata.consistency, "eventual_per_record_projections_non_atomic_no_read_repair");
  assert.deepEqual(await c.store.gold.latest.find().toArray(), beforeLatest); assert.deepEqual(await c.store.gold.snapshots.find().toArray(), beforeSnapshots); assert.deepEqual(await c.store.gold.revisions.find().toArray(), beforeRevisions);
  const query = parseGoldHistoryQuery(`/?${baseQuery}`)!;
  const explanation = await c.db.collection("gold_quote_snapshots").aggregate(goldHistoryPipeline(query), { maxTimeMS: 1000, allowDiskUse: false }).explain("executionStats");
  assert(JSON.stringify(explanation).includes("asset_reference_history"));
  assert.equal((await c.store.gold.snapshots.indexes()).length, 2);
});

test("gold HTTP fails closed on corrupt selected storage and disconnection with sanitized no-store responses", async t => {
  const c = await setup(); t.after(c.close); await c.persist("initial");
  const stored = await c.store.gold.snapshots.findOne({}); assert(stored);
  for (const [field, value] of [["dataset.mode", "live"], ["sourceOrder", "bad"], ["record.time.collectedAt", "2026-02-30T00:00:00.000000Z"], ["contentDigest", "0".repeat(64)]] as const) {
    await c.store.gold.snapshots.updateOne({ _id: stored._id }, { $set: { [field]: value } }, { bypassDocumentValidation: true });
    const response = await c.get(); assert.equal(response.status, 503, field); assert.deepEqual(await response.json(), { error: "gold_history_unavailable" }); assert.equal(response.headers.get("cache-control"), "no-store");
    await c.store.gold.snapshots.replaceOne({ _id: stored._id }, stored);
  }
  const asset = await c.store.gold.assets.findOne({}); assert(asset);
  await c.store.gold.assets.updateOne({ _id: asset._id }, { $set: { rowDigest: "0".repeat(64) } });
  for (const endpoint of ["history", "latest"]) { const response = await c.get(endpoint, endpoint === "latest" ? "" : baseQuery); assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: `gold_${endpoint}_unavailable` }); }
  await c.store.gold.assets.replaceOne({ _id: asset._id }, asset);
  const latest = await c.store.gold.latest.findOne({}); assert(latest);
  for (const [field, value] of [["sourceOrder", "bad"], ["contentDigest", "0".repeat(64)], ["dataset.freshness", "current"]] as const) {
    await c.store.gold.latest.updateOne({ _id: latest._id }, { $set: { [field]: value } }, { bypassDocumentValidation: true });
    const response = await c.get("latest", "");
    assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: "gold_latest_unavailable" });
    await c.store.gold.latest.replaceOne({ _id: latest._id }, latest);
  }
  await c.client.close();
  for (const endpoint of ["history", "latest"]) { const response = await c.get(endpoint, endpoint === "latest" ? "" : baseQuery); assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: `gold_${endpoint}_unavailable` }); assert.equal(response.headers.get("cache-control"), "no-store"); }
});

test("actual server registers gold reads only for literal true with no ingestion secret or initialization", { timeout: 45000 }, async t => {
  const c = await setup(); t.after(c.close); await c.persist("preseed");
  await c.db.collection("ingestion_deliveries").drop(); await c.db.createCollection("ingestion_deliveries", { viewOn: "startup_source", pipeline: [] });
  const url = new URL(mongoUrl); url.pathname = `/${c.db.databaseName}`;
  for (const flag of [undefined, "false", "true"]) {
    const reservation = createServer(); await new Promise<void>(resolve => reservation.listen(0, "127.0.0.1", resolve));
    const address = reservation.address(); assert(address && typeof address === "object"); await new Promise<void>(resolve => reservation.close(() => resolve()));
    const env = { ...process.env, HOST: "127.0.0.1", PORT: String(address.port), MONGODB_URL: url.href, REDIS_URL: redisUrl, CONNECT_ATTEMPTS: "1", INGESTION_SECRET: "", GOLD_READS_ENABLED: flag, OBSERVED_READS_ENABLED: "false" };
    if (flag === undefined) delete env.GOLD_READS_ENABLED;
    const child = spawn(process.execPath, ["--import", "tsx", resolve("apps/api/src/server.ts")], { env, stdio: ["ignore", "pipe", "pipe"] });
    let output = ""; child.stdout.on("data", chunk => { output += String(chunk); }); child.stderr.on("data", chunk => { output += String(chunk); });
    const exited = new Promise<void>((resolve, reject) => { child.once("error", reject); child.once("close", () => resolve()); });
    t.after(async () => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); await exited; });
    const base = `http://127.0.0.1:${address.port}`; const deadline = Date.now() + 12000; let ready = false;
    while (Date.now() < deadline) { assert.equal(child.exitCode, null); ready = await fetch(`${base}/health/ready`).then(r => r.status === 200).catch(() => false); if (ready) break; await pause(50); }
    assert(ready, `server readiness without ingestion initialization: ${output}`);
    for (const endpoint of ["history", "latest"]) {
      const response = await fetch(`${base}/api/gold/quotes/${endpoint}${endpoint === "history" ? `?${baseQuery}` : ""}`);
      assert.equal(response.status, flag === "true" ? 200 : 404); assert.equal(response.headers.get("cache-control"), "no-store");
    }
    assert.equal((await fetch(`${base}/api/assets/FPT/history`)).status, 200);
    assert.equal((await fetch(`${base}/api/observed/assets/FPT/history?from=2026-10-01&to=2026-10-31`)).status, 404);
    assert.equal((await fetch(`${base}/internal/ingestion/deliveries/missing`)).status, 503);
    assert.equal(await c.store.gold.snapshots.countDocuments(), 1);
    child.kill("SIGKILL"); await exited;
  }
});
