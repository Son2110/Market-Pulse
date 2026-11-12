import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
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
import { createObservedSearchRouter, ObservedSearchService } from "../src/observed-search.js";
import { createSymbolRegistry } from "../src/symbol-registry.js";
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
  const c = await setup(); t.after(c.close); await c.persist("preseed"); await c.persist("preseed-index", observed(true));
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
    for (const symbol of ["fpt", "vnindex"]) {
      const latestResponse = await fetch(`${base}/api/observed/assets/${symbol}/latest-window`);
      assert.equal(latestResponse.status, flag === "true" ? 200 : 404);
      if (flag === "true") assert.deepEqual((await latestResponse.json()).meta.range, { from: "2026-09-03", to: "2026-10-02" });
    }
    const searchResponse = await fetch(`${base}/api/observed/assets/search?q=FPT`);
    assert.equal(searchResponse.status, flag === "true" ? 200 : 404);
    if (flag === "true") assert.deepEqual((await searchResponse.json()).data[0].asset, observed().assets[0]);
    const statusResponse = await fetch(`${base}/api/observed/assets/fpt/collection-status?from=2026-10-01&to=2026-10-06`);
    assert.equal(statusResponse.status, flag === "true" ? 200 : 404);
    if (flag === "true") {
      const status = await statusResponse.json();
      assert.equal(status.meta.selectedCandleCount, 1);
      assert.equal(status.meta.candleCountsByDeliveryStatus.unknown, 1);
      assert.equal(status.meta.candleCountsByDeliveryStatus.success, 0);
    }
    assert.equal((await fetch(`${base}/api/assets/FPT/history`)).status, 200);
    assert.equal((await fetch(`${base}/internal/ingestion/deliveries/missing`)).status, 503);
    assert.equal(await c.store.observed.latest.countDocuments(), 2);
    assert.equal(await c.store.observed.revisions.countDocuments(), 2);
    child.kill("SIGKILL"); await exited;
  }
});

test("real Mongo latest window selects max trading date over collection time for FPT and VNINDEX and fails closed on stored corruption", async t => {
  const c = await setup(); t.after(c.close);
  const reader = new ObservedHistoryService(c.db);
  const server = createServer(createApp({ checks: { mongo: async () => true, redis: async () => true }, observedHistoryRouter: createObservedHistoryRouter(reader) }));
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve)); t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address(); assert(address && typeof address === "object");
  const get = (symbol = "FPT") => fetch(`http://127.0.0.1:${address.port}/api/observed/assets/${symbol}/latest-window`);
  assert.equal(await reader.latestWindow("FPT"), null);
  assert.equal(await reader.latestWindow("VNINDEX"), null);
  assert.equal((await get("FPT")).status, 404);
  assert.equal((await get("VNINDEX")).status, 404);
  for (const [symbol, index, latestDate, expectedFrom] of [["FPT", false, "2026-10-03", "2026-09-04"], ["VNINDEX", true, "2026-10-05", "2026-09-06"]] as const) {
    const assetId = index ? "VN:INDEX:VNINDEX" : "VN:HOSE:FPT";
    const adjustmentBasis = index ? "not_applicable" : "unknown";
    const empty = observed(index); empty.candles = []; await c.persist(`empty-${symbol}`, empty);
    const knownEmpty = await reader.latestWindow(symbol); assert(knownEmpty);
    assert.equal(knownEmpty.meta.status, "no_data"); assert.equal(knownEmpty.meta.latestTradingDate, null); assert.equal(knownEmpty.meta.range, null);
    const emptyResponse = await get(symbol.toLowerCase()); assert.equal(emptyResponse.status, 200); assert.equal(emptyResponse.headers.get("cache-control"), "no-store"); assert.deepEqual(await emptyResponse.json(), knownEmpty);
    await c.persist(`baseline-${symbol}`, observed(index));
    const dates = addDate(addDate(observed(index), "2026-09-02"), "2026-09-03");
    dates.request.start = "2026-09-02"; dates.request.end = "2026-10-02"; dates.candles.sort((a, b) => a.tradingDate.localeCompare(b.tradingDate));
    for (const row of dates.candles) row.collectedAt = "2026-12-01T00:00:00Z";
    await c.persist(`old-day-refetch-${symbol}`, rehash(dates));
    const latest = addDate(observed(index), latestDate); latest.request.end = latestDate; await c.persist(`new-day-${symbol}`, latest);
    const result = await reader.latestWindow(symbol); assert(result);
    assert.equal(result.data.asset.symbol, symbol);
    assert.equal(result.meta.latestTradingDate, latestDate); assert.deepEqual(result.meta.range, { from: expectedFrom, to: latestDate });
    assert.equal(result.meta.freshness, "unknown"); assert.equal(result.meta.sourceAsOf, null);
    assert(!/(deliveryId|collectedOrder|firstDeliveryId|rowDigest|_id)/.test(JSON.stringify(result)));
    const history = await reader.read(symbol, result.meta.range!); assert(history); assert.deepEqual(history.data.candles.map(row => row.tradingDate), ["2026-10-02", latestDate]);
    const query = c.db.collection("observed_candles_latest").find({ "record.assetId": assetId, "record.source.provider": "KBS", "record.interval": "1d", "record.adjustmentBasis": adjustmentBasis }, { hint: "asset_daily_history" }).sort({ "record.tradingDate": -1 }).limit(1);
    const plan = JSON.stringify(await query.explain("executionStats")); assert(plan.includes('"indexName":"asset_daily_history"')); assert(plan.includes('"direction":"backward"')); assert(!plan.includes('"stage":"SORT"'));
    const row = await c.store.observed.latest.findOne({ "record.tradingDate": latestDate, "record.assetId": assetId }); assert(row);
    await c.store.observed.latest.updateOne({ _id: row._id }, { $set: { "record.close": "9999" } }, { bypassDocumentValidation: true });
    await assert.rejects(reader.latestWindow(symbol), /observed_history_invalid_storage/);
    const invalidResponse = await get(symbol); assert.equal(invalidResponse.status, 503); assert.deepEqual(await invalidResponse.json(), { error: "observed_latest_window_unavailable" });
    await c.store.observed.latest.replaceOne({ _id: row._id }, row);
    const asset = await c.db.collection("observed_assets").findOne({ _id: assetId } as never); assert(asset);
    await c.db.collection("observed_assets").updateOne({ _id: asset._id }, { $set: { rowDigest: "bad" } }, { bypassDocumentValidation: true }); await assert.rejects(reader.latestWindow(symbol), /observed_history_invalid_storage/);
    await c.db.collection("observed_assets").replaceOne({ _id: asset._id }, asset);
  }
  // Verify FPT and VNINDEX latest windows remain independent of each other's max tradingDate.
  assert.equal((await reader.latestWindow("FPT"))?.meta.latestTradingDate, "2026-10-03");
  assert.equal((await reader.latestWindow("VNINDEX"))?.meta.latestTradingDate, "2026-10-05");
  await c.client.close(); await assert.rejects(reader.latestWindow("VNINDEX")); assert.equal((await get("VNINDEX")).status, 503); await c.client.connect();
});

test("latest-window CSOT expires an exhausted pool checkout without running queued reads later", { timeout: 15000 }, async t => {
  const c = await setup(); t.after(c.close); await c.persist("pool-test");
  const capped = await c.db.createCollection("pool_blocker", { capped: true, size: 4096 });
  await capped.insertOne({ value: 1 });
  const client = new MongoClient(mongoUrl, { maxPoolSize: 1, waitQueueTimeoutMS: 0, serverSelectionTimeoutMS: 1000, monitorCommands: true });
  await client.connect(); t.after(() => client.close());
  const db = client.db(c.db.databaseName);
  const blocker = db.collection("pool_blocker").find({}, { tailable: true, awaitData: true, maxAwaitTimeMS: 5000, batchSize: 1 });
  t.after(() => blocker.close());
  assert.equal((await blocker.next())?.value, 1);
  const getMoreStarted = new Promise<void>(resolve => {
    client.on("commandStarted", event => { if (event.commandName === "getMore") resolve(); });
  });
  const blockedRead = blocker.next();
  await getMoreStarted;
  const commands: string[] = [];
  client.on("commandStarted", event => { if (event.commandName === "find") commands.push(String(event.command.find)); });
  const checkoutFailed = once(client, "connectionCheckOutFailed", { signal: AbortSignal.timeout(2000) });
  await assert.rejects(new ObservedHistoryService(db, 100).latestWindow(), /dependency_timeout|Timed out/);
  const [failure] = await checkoutFailed;
  assert.equal(failure.reason, "timeout");
  assert.deepEqual(commands, []);
  await capped.insertOne({ value: 2 });
  assert.equal((await blockedRead)?.value, 2);
  await pause(100);
  assert.deepEqual(commands, []);
  assert.equal((await new ObservedHistoryService(db).latestWindow())?.meta.latestTradingDate, "2026-10-02");
  assert.deepEqual(commands, ["observed_assets", "observed_candles_latest"]);
});

test("real Mongo multi-symbol registry proof persists and serves VCB alongside FPT while failing closed on unregistered symbols", async t => {
  const c = await setup(); t.after(c.close);
  const multiRegistry = createSymbolRegistry({
    version: 1,
    symbols: [
      { symbol: "FPT", assetType: "equity", exchange: "HOSE" },
      { symbol: "VCB", assetType: "equity", exchange: "HOSE" },
      { symbol: "SHS", assetType: "equity", exchange: "HNX" },
      { symbol: "VNINDEX", assetType: "index", exchange: "INDEX" },
    ],
  });
  const store = new IngestionStore(c.db, multiRegistry);
  const historyReader = new ObservedHistoryService(c.db, 1000, multiRegistry);
  const searchReader = new ObservedSearchService(c.db, 1000, multiRegistry);
  const server = createServer(createApp({
    checks: { mongo: async () => true, redis: async () => true },
    observedHistoryRouter: createObservedHistoryRouter(historyReader, () => true, multiRegistry),
    observedSearchRouter: createObservedSearchRouter(searchReader),
  }));
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address(); assert(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;

  const fptPayload = observed();
  const fptDelivery = await store.accept("multi-fpt", digest(fptPayload as unknown as Json), validatePayload(fptPayload as unknown as Json, multiRegistry));
  await store.persist(fptDelivery);
  await store.terminal("multi-fpt", "success", { assets: 1, observations: 1 });

  const vcbPayload = observed();
  vcbPayload.request.symbol = "VCB";
  vcbPayload.assets[0] = { assetId: "VN:HOSE:VCB", symbol: "VCB", assetType: "equity", currency: "VND", unit: "VND", timezone: "Asia/Ho_Chi_Minh" };
  vcbPayload.candles[0]!.assetId = "VN:HOSE:VCB";
  vcbPayload.candles[0]!.tradingDate = "2026-10-03";
  vcbPayload.candles[0]!.providerTimeLabel = "2026-10-03 07:00";
  vcbPayload.candles[0]!.open = "91000";
  vcbPayload.candles[0]!.high = "92500";
  vcbPayload.candles[0]!.low = "90500";
  vcbPayload.candles[0]!.close = "91200.5";
  vcbPayload.candles[0]!.barId = digest(["KBS", "VN:HOSE:VCB", "1d", "2026-10-03", "unknown"]);
  rehash(vcbPayload);
  const vcbDelivery = await store.accept("multi-vcb", digest(vcbPayload as unknown as Json), validatePayload(vcbPayload as unknown as Json, multiRegistry));
  await store.persist(vcbDelivery);
  await store.terminal("multi-vcb", "success", { assets: 1, observations: 1 });

  const shsEmptyPayload = observed();
  shsEmptyPayload.request.symbol = "SHS";
  shsEmptyPayload.assets[0] = { assetId: "VN:HNX:SHS", symbol: "SHS", assetType: "equity", currency: "VND", unit: "VND", timezone: "Asia/Ho_Chi_Minh" };
  shsEmptyPayload.candles = [];
  const shsDelivery = await store.accept("multi-shs-empty", digest(shsEmptyPayload as unknown as Json), validatePayload(shsEmptyPayload as unknown as Json, multiRegistry));
  await store.persist(shsDelivery);

  const searchRes = await fetch(`${base}/api/observed/assets/search?q=Vietcombank`);
  assert.equal(searchRes.status, 200);
  const searchJson = await searchRes.json();
  assert.deepEqual(searchJson.meta.coverage, ["FPT", "VCB"]);
  assert.equal(searchJson.meta.label, "STORED OBSERVED ASSET CATALOG — COVERAGE LIMITED TO FPT, VCB");
  assert.equal(searchJson.data.length, 1);
  assert.equal(searchJson.data[0].asset.symbol, "VCB");

  const vcbWindowRes = await fetch(`${base}/api/observed/assets/vcb/latest-window`);
  assert.equal(vcbWindowRes.status, 200);
  const vcbWindow = await vcbWindowRes.json();
  assert.equal(vcbWindow.data.asset.assetId, "VN:HOSE:VCB");
  assert.deepEqual(vcbWindow.meta.range, { from: "2026-09-04", to: "2026-10-03" });

  const vcbHistoryRes = await fetch(`${base}/api/observed/assets/vcb/history?from=2026-10-01&to=2026-10-06`);
  assert.equal(vcbHistoryRes.status, 200);
  const vcbHistory = await vcbHistoryRes.json();
  assert.equal(vcbHistory.data.asset.symbol, "VCB");
  assert.equal(vcbHistory.data.candles.length, 1);
  assert.equal(vcbHistory.data.candles[0].close, "91200.5");

  const vcbStatusRes = await fetch(`${base}/api/observed/assets/vcb/collection-status?from=2026-10-01&to=2026-10-06`);
  assert.equal(vcbStatusRes.status, 200);
  const vcbStatus = await vcbStatusRes.json();
  assert.equal(vcbStatus.data.asset.symbol, "VCB");
  assert.equal(vcbStatus.meta.selectedCandleCount, 1);
  assert.equal(vcbStatus.meta.candleCountsByDeliveryStatus.success, 1);

  const shsWindowRes = await fetch(`${base}/api/observed/assets/shs/latest-window`);
  assert.equal(shsWindowRes.status, 200);
  const shsWindow = await shsWindowRes.json();
  assert.equal(shsWindow.meta.status, "no_data");
  assert.equal(shsWindow.meta.range, null);

  for (const endpoint of ["latest-window", "history?from=2026-10-01&to=2026-10-06", "collection-status?from=2026-10-01&to=2026-10-06"]) {
    const hpgRes = await fetch(`${base}/api/observed/assets/HPG/${endpoint}`);
    assert.equal(hpgRes.status, 404);
    assert.deepEqual(await hpgRes.json(), { error: "asset_not_found" });
  }
});
