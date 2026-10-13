import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import test from "node:test";
import { MongoClient } from "mongodb";
import { createApp } from "../src/health.js";
import { digest, validatePayload, type Json } from "../src/ingestion-contract.js";
import { IngestionStore, type DeliveryStatus } from "../src/ingestion-store.js";
import { createObservedHistoryRouter, ObservedHistoryService } from "../src/observed-history.js";
import { observed, rehash } from "./observed-test-data.js";

test("real MongoDB collection status reports selected mixed receipts for both symbols, missing refs and empty ranges; failures are sanitized", async t => {
  const client = new MongoClient(process.env.MONGODB_URL ?? "mongodb://127.0.0.1:27017/marketpulse", { serverSelectionTimeoutMS: 1000 }); await client.connect();
  const db = client.db(`mp_collection_status_test_${randomUUID().replaceAll("-", "")}`);
  t.after(async () => { try { await client.connect(); await db.dropDatabase(); } finally { await client.close(); } });
  const store = new IngestionStore(db); await store.initialize();
  const server = createServer(createApp({ checks: { mongo: async () => true, redis: async () => true }, observedHistoryRouter: createObservedHistoryRouter(new ObservedHistoryService(db)) }));
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address(); assert(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}/api/observed/assets`;
  const get = (symbol = "FPT", bounds = "from=2026-10-01&to=2026-10-06") => fetch(`${base}/${symbol}/collection-status?${bounds}`);
  assert.equal((await get()).status, 404);
  for (const index of [false, true]) {
    const symbol = index ? "VNINDEX" : "FPT";
    const states: DeliveryStatus[] = ["success", "running", "failure", "accepted", "queued"];
    for (const [position, status] of states.entries()) {
      const payload = observed(index); const row = payload.candles[0]!;
      row.tradingDate = `2026-10-0${position + 1}`; row.providerTimeLabel = `${row.tradingDate} 07:00`;
      row.barId = digest(["KBS", row.assetId, "1d", row.tradingDate, row.adjustmentBasis]);
      row.collectedAt = position === 0 ? "2026-10-06T14:00:00.000001+08:00" : `2026-10-06T06:00:00.00000${position + 1}Z`;
      if (position === 0) {
        const repeat = structuredClone(row); repeat.tradingDate = "2026-10-06"; repeat.providerTimeLabel = "2026-10-06 07:00";
        repeat.barId = digest(["KBS", repeat.assetId, "1d", repeat.tradingDate, repeat.adjustmentBasis]); payload.candles.push(repeat);
      }
      rehash(payload);
      const delivery = await store.accept(`${symbol}-${status}`, digest(payload as unknown as Json), validatePayload(payload as unknown as Json));
      await store.persist(delivery); await store.deliveries.updateOne({ _id: delivery._id }, { $set: { status } });
    }
    let response = await get(symbol.toLowerCase()); assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
    let result = await response.json();
    assert.deepEqual(result.meta.candleCountsByDeliveryStatus, { accepted: 1, queued: 1, running: 1, success: 2, failure: 1, unknown: 0 });
    assert.equal(result.meta.selectedCandleCount, 6); assert.equal(result.meta.completeness, "unknown");
    assert.deepEqual(result.meta.returnedRange, { from: "2026-10-01", to: "2026-10-06" });
    assert.deepEqual(result.meta.collectedAtRange, { from: "2026-10-06T14:00:00.000001+08:00", to: "2026-10-06T06:00:00.000005Z" });
    assert(!/(deliveryId|payload|Digest|collectedOrder|_id|"open"|"close")/.test(JSON.stringify(result)));
    await store.deliveries.deleteOne({ _id: `${symbol}-success` });
    result = await (await get(symbol)).json(); assert.equal(result.meta.candleCountsByDeliveryStatus.success, 0); assert.equal(result.meta.candleCountsByDeliveryStatus.unknown, 2);
    // Receipt corruption remains unknown; no arbitrary raw fields are exposed.
    await store.deliveries.updateOne({ _id: `${symbol}-running` }, { $set: { schemaVersion: "1.0.0", errorCode: "private-error" } }, { bypassDocumentValidation: true });
    result = await (await get(symbol)).json(); assert.equal(result.meta.candleCountsByDeliveryStatus.running, 0); assert.equal(result.meta.candleCountsByDeliveryStatus.unknown, 3); assert(!JSON.stringify(result).includes("private"));
    await store.deliveries.updateOne({ _id: `${symbol}-accepted` }, { $set: { provider: "marketpulse-fixture" } }, { bypassDocumentValidation: true });
    await store.deliveries.updateOne({ _id: `${symbol}-queued` }, { $set: { "dataset.freshness": "current" } }, { bypassDocumentValidation: true });
    result = await (await get(symbol)).json(); assert.equal(result.meta.candleCountsByDeliveryStatus.accepted, 0); assert.equal(result.meta.candleCountsByDeliveryStatus.queued, 0); assert.equal(result.meta.candleCountsByDeliveryStatus.unknown, 5);
    response = await get(symbol, "from=2026-10-07&to=2026-10-07"); result = await response.json();
    assert.equal(response.status, 200); assert.equal(result.meta.status, "no_stored_bars"); assert.equal(result.meta.selectedCandleCount, 0); assert.equal(result.meta.collectedAtRange, null); assert.equal(result.meta.returnedRange, null);
  }
  const empty = await get("FPT", "from=2026-10-01&to=2026-11-01"); assert.equal(empty.status, 200);
  assert.equal((await get("FPT", "from=2026-10-01&to=2026-11-02")).status, 400);
  const selected = await store.observed.latest.findOne({ "record.assetId": "VN:HOSE:FPT" }); assert(selected);
  await db.collection("observed_candles_latest").updateOne({ barId: selected.barId }, { $set: { contentDigest: "a".repeat(64) } }, { bypassDocumentValidation: true });
  let response = await get(); assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: "observed_collection_status_unavailable" });
  await db.collection("observed_candles_latest").updateOne({ barId: selected.barId }, { $set: { contentDigest: selected.contentDigest } }, { bypassDocumentValidation: true });
  const asset = await store.observed.assets.findOne({ _id: "VN:HOSE:FPT" }); assert(asset);
  await store.observed.assets.updateOne({ _id: asset._id }, { $set: { rowDigest: "a".repeat(64) } }, { bypassDocumentValidation: true });
  response = await get(); assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: "observed_collection_status_unavailable" });
  await store.observed.assets.updateOne({ _id: asset._id }, { $set: { rowDigest: asset.rowDigest } }, { bypassDocumentValidation: true });
  await client.close(); response = await get(); assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: "observed_collection_status_unavailable" });
});

test("real MongoDB collection status bounds 32 distinct receipts and ignores an older successful retrieval", async t => {
  const client = new MongoClient(process.env.MONGODB_URL ?? "mongodb://127.0.0.1:27017/marketpulse", { serverSelectionTimeoutMS: 1000 }); await client.connect();
  const db = client.db(`mp_status_bounds_test_${randomUUID().replaceAll("-", "")}`);
  t.after(async () => { try { await db.dropDatabase(); } finally { await client.close(); } });
  const store = new IngestionStore(db); await store.initialize();
  for (let position = 0; position < 32; position++) {
    const payload = observed(); const row = payload.candles[0]!;
    payload.request.end = "2026-11-01";
    row.tradingDate = new Date(Date.UTC(2026, 9, 1 + position)).toISOString().slice(0, 10);
    row.providerTimeLabel = `${row.tradingDate} 07:00`;
    row.barId = digest(["KBS", row.assetId, "1d", row.tradingDate, row.adjustmentBasis]);
    rehash(payload);
    const delivery = await store.accept(`bar-${position}`, digest(payload as unknown as Json), validatePayload(payload as unknown as Json));
    await store.persist(delivery); await store.deliveries.updateOne({ _id: delivery._id }, { $set: { status: "success" } });
  }
  const service = new ObservedHistoryService(db);
  const bounds = { from: "2026-10-01", to: "2026-11-01" };
  let result = await service.collectionStatus("FPT", bounds); assert(result);
  assert.equal(result.meta.selectedCandleCount, 32); assert.equal(result.meta.candleCountsByDeliveryStatus.success, 32);
  const latest = observed(); const row = latest.candles[0]!;
  row.tradingDate = bounds.from; row.providerTimeLabel = `${bounds.from} 07:00`;
  row.barId = digest(["KBS", row.assetId, "1d", row.tradingDate, row.adjustmentBasis]);
  row.collectedAt = "2026-10-07T06:00:00.000001Z"; rehash(latest);
  const delivery = await store.accept("newer-failure", digest(latest as unknown as Json), validatePayload(latest as unknown as Json));
  await store.persist(delivery); await store.deliveries.updateOne({ _id: delivery._id }, { $set: { status: "failure" } });
  result = await service.collectionStatus("FPT", bounds); assert(result);
  assert.equal(result.meta.selectedCandleCount, 32); assert.equal(result.meta.candleCountsByDeliveryStatus.success, 31); assert.equal(result.meta.candleCountsByDeliveryStatus.failure, 1);
  assert.equal(result.meta.collectedAtRange?.to, row.collectedAt);
  assert.equal(await store.observed.revisions.countDocuments({ barId: row.barId }), 1);
});
