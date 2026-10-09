import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";
import test from "node:test";
import { MongoClient } from "mongodb";
import { createDailyHistoryRouter } from "../src/daily-history.js";
import { createFixtureMarketDataProvider } from "../src/fixture-market-data-provider.js";
import { createApp } from "../src/health.js";
import { digest, validatePayload, type Json, type ObservedPayload } from "../src/ingestion-contract.js";
import { IngestionStore } from "../src/ingestion-store.js";
import { createObservedHistoryRouter, ObservedHistoryService } from "../src/observed-history.js";
import { observed, rehash } from "./observed-test-data.js";

const mongoUrl = process.env.MONGODB_URL ?? "mongodb://127.0.0.1:27017/marketpulse";
const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function setup() {
  const client = new MongoClient(mongoUrl, { serverSelectionTimeoutMS: 1000 }); await client.connect();
  const db = client.db(`mp_observed_history_test_${randomUUID().replaceAll("-", "")}`);
  const store = new IngestionStore(db); await store.initialize();
  const persist = async (id: string, payload = observed()) => {
    const delivery = await store.accept(id, digest(payload as unknown as Json), validatePayload(payload as unknown as Json));
    await store.persist(delivery);
  };
  return { client, db, store, persist, close: async () => { await db.dropDatabase(); await client.close(); } };
}
function version(close: string, collectedAt: string) {
  const payload = observed(); payload.candles[0]!.close = close; payload.candles[0]!.collectedAt = collectedAt; return rehash(payload);
}
function addDate(payload: ObservedPayload, date: string) {
  const row = structuredClone(payload.candles[0]!); row.tradingDate = date; row.providerTimeLabel = `${date} 07:00`;
  row.barId = digest(["KBS", row.assetId, "1d", date, row.adjustmentBasis]); payload.candles.push(row); return rehash(payload);
}

test("real MongoDB observed HTTP preserves revisions/refetch, bounds/gaps/partial data and exact fixture isolation", async t => {
  const c = await setup(); t.after(c.close);
  const server = createServer(createApp({ checks: { mongo: async () => true, redis: async () => true }, dailyHistoryRouter: createDailyHistoryRouter(createFixtureMarketDataProvider()), observedHistoryRouter: createObservedHistoryRouter(new ObservedHistoryService(c.db)) }));
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve)); t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address(); assert(address && typeof address === "object"); const base = `http://127.0.0.1:${address.port}`;
  const get = (symbol = "FPT", bounds = "from=2026-10-01&to=2026-10-06") => fetch(`${base}/api/observed/assets/${symbol}/history?${bounds}`);
  assert.equal((await get()).status, 404);
  const empty = observed(true); empty.candles = []; await c.persist("empty-index", empty);
  let body = await (await get("vnindex")).json(); assert.equal(body.meta.status, "no_data"); assert.deepEqual(body.data.candles, []); assert.equal(body.meta.returnedRange, null); assert.equal(body.data.asset.currency, null);
  await c.persist("index", observed(true));
  body = await (await get("vnindex")).json(); assert.deepEqual(body.data.candles, observed(true).candles); assert.equal(body.meta.sourceAsOf, null);
  await c.persist("a", observed()); await c.persist("b", version("1350", "2026-10-06T08:00:00Z"));
  const refetch = version("1300", "2026-10-06T14:00:00.000001+07:00");
  await c.persist("older-a", refetch); // Earlier collection must not displace B.
  assert.equal((await (await get()).json()).data.candles[0].close, "1350");
  refetch.candles[0]!.collectedAt = "2026-10-06T09:00:00.123456Z"; await c.persist("latest-a", refetch);
  body = await (await get("fpt")).json(); assert.deepEqual(body.data.candles, refetch.candles);
  assert.equal(await c.store.observed.revisions.countDocuments({ barId: refetch.candles[0]!.barId }), 2);
  const partial = addDate(addDate(observed(), "2026-10-04"), "2026-10-05");
  const delivery = await c.store.accept("partial", digest(partial as unknown as Json), validatePayload(partial as unknown as Json));
  let count = 0;
  await assert.rejects(c.store.observed.persist(delivery, partial, async () => { if (++count === 3) throw new Error("test interrupted after second bar"); }));
  await c.store.deliveries.updateOne({ _id: "partial" }, { $set: { status: "failure", attempts: 3 } });
  body = await (await get()).json(); assert.deepEqual(body.data.candles.map((row: { tradingDate: string }) => row.tradingDate), ["2026-10-02", "2026-10-04"]); assert.equal(body.meta.completeness, "unknown");
  body = await (await get("FPT", "from=2026-10-02&to=2026-10-04&interval=1d")).json(); assert.equal(body.data.candles.length, 2); assert.deepEqual(body.meta.returnedRange, { from: "2026-10-02", to: "2026-10-04" });
  body = await (await get("FPT", "from=2026-10-03&to=2026-10-03")).json(); assert.equal(body.meta.status, "no_data"); assert.equal(body.meta.returnedRange, null);
  const fixture = JSON.parse(readFileSync("fixtures/market/mp-02-synthetic.json", "utf8"));
  for (const symbol of ["FPT", "VNINDEX"]) {
    const asset = fixture.assets.find((row: { symbol: string }) => row.symbol === symbol);
    const response = await fetch(`${base}/api/assets/${symbol}/history`); assert.equal(response.status, 200);
    const result = await response.json();
    assert.deepEqual(result.data, { schemaVersion: "1.0.0", dataset: fixture.dataset, assets: [asset], candles: fixture.candles.filter((row: { assetId: string }) => row.assetId === asset.assetId), quotes: [], indexObservations: [] });
  }
  assert.equal(await c.store.assets.countDocuments(), 0); assert.equal(await c.store.observations.countDocuments(), 0);
  const stored = await c.store.observed.latest.findOne({ barId: refetch.candles[0]!.barId }); assert(stored);
  const noStore = await get(); assert.equal(noStore.headers.get("cache-control"), "no-store"); assert(!/(deliveryId|collectedOrder|firstDeliveryId|rowDigest|_id)/.test(await noStore.text()));
  // Test-only corruption bypasses Mongo's validator; public reads must still fail closed.
  await c.db.collection("observed_candles_latest").updateOne({ barId: stored.barId }, { $set: { "record.close": "9999" } }, { bypassDocumentValidation: true });
  let response = await get(); assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: "observed_history_unavailable" });
  await c.db.collection("observed_candles_latest").updateOne({ barId: stored.barId }, { $set: { record: stored.record } }, { bypassDocumentValidation: true });
  await c.client.close(); response = await get(); assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: "observed_history_unavailable" });
  await c.client.connect();
});

test("actual API registers observed reads only when enabled and runs with no ingestion secret", { timeout: 45000 }, async t => {
  const c = await setup(); t.after(c.close); await c.persist("preseed");
  await c.db.collection("ingestion_deliveries").drop();
  await c.db.createCollection("ingestion_deliveries", { viewOn: "startup_source", pipeline: [] });
  const url = new URL(mongoUrl); url.pathname = `/${c.db.databaseName}`;
  for (const flag of [undefined, "false", "true"]) {
    const reservation = createServer(); await new Promise<void>(resolve => reservation.listen(0, "127.0.0.1", resolve));
    const address = reservation.address(); assert(address && typeof address === "object"); await new Promise<void>(resolve => reservation.close(() => resolve()));
    const env = { ...process.env, HOST: "127.0.0.1", PORT: String(address.port), MONGODB_URL: url.href, REDIS_URL: redisUrl, CONNECT_ATTEMPTS: "1", INGESTION_SECRET: "", OBSERVED_READS_ENABLED: flag };
    if (flag === undefined) delete env.OBSERVED_READS_ENABLED;
    const child = spawn(process.execPath, ["--import", "tsx", resolve("apps/api/src/server.ts")], { env, stdio: ["ignore", "pipe", "pipe"] });
    let output = ""; child.stdout.on("data", chunk => { output += String(chunk); }); child.stderr.on("data", chunk => { output += String(chunk); });
    const exited = new Promise<void>((resolve, reject) => { child.once("error", reject); child.once("close", () => resolve()); });
    t.after(async () => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); await exited; });
    const base = `http://127.0.0.1:${address.port}`; const deadline = Date.now() + 12000; let ready = false; let last = "";
    while (Date.now() < deadline) { assert.equal(child.exitCode, null); ready = await fetch(`${base}/health/ready`).then(r => { last = String(r.status); return r.status === 200; }).catch(error => { last = String(error); return false; }); if (ready) break; await pause(50); }
    assert(ready, `actual API must become ready without ingestion initialization (${last}): ${output}`);
    const response = await fetch(`${base}/api/observed/assets/fpt/history?from=2026-10-01&to=2026-10-06`);
    assert.equal(response.status, flag === "true" ? 200 : 404);
    if (flag === "true") assert.deepEqual((await response.json()).data.candles, observed().candles);
    assert.equal((await fetch(`${base}/api/assets/FPT/history`)).status, 200);
    assert.equal((await fetch(`${base}/internal/ingestion/deliveries/missing`)).status, 503);
    assert.equal(await c.store.observed.latest.countDocuments(), 1);
    assert.equal(await c.store.observed.revisions.countDocuments(), 1);
    child.kill("SIGKILL"); await exited;
  }
});
