import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import type { Db } from "mongodb";
import { createApp } from "../src/health.js";
import { collectedOrder, digest } from "../src/ingestion-contract.js";
import { observedCollectionStatusResponse, observedDeliveryStatusProjection } from "../src/observed-collection-status-contract.js";
import { observedAssetProjection, observedCandleProjection, observedHistoryResponse } from "../src/observed-history-contract.js";
import { createObservedHistoryRouter, ObservedHistoryService } from "../src/observed-history.js";
import { observed } from "./observed-test-data.js";

const range = { from: "2026-10-01", to: "2026-10-06" };
function stored(index = false) {
  const payload = observed(index);
  const asset = { record: payload.assets[0], dataset: payload.dataset, schemaVersion: payload.schemaVersion, rowDigest: digest(payload.assets[0]!) };
  const rows = payload.candles.map(row => ({ record: row, dataset: payload.dataset, schemaVersion: payload.schemaVersion, barId: row.barId, contentDigest: row.contentDigest, collectedAt: row.collectedAt, collectedOrder: collectedOrder(row.collectedAt), deliveryId: "private-delivery" }));
  return { payload, asset, rows, history: observedHistoryResponse(payload.request.symbol, range, asset, rows) };
}
const receipt = (id: string, status: string) => ({ _id: id, status, schemaVersion: "2.0.0", provider: "KBS", dataset: observed().dataset, payload: "private-payload", errorCode: "private-error", payloadDigest: "private-digest" });

test("collection status counts candles, including repeated delivery references and every state, without exposing private fields or prices", () => {
  for (const index of [false, true]) {
    const data = stored(index);
    const states = ["accepted", "queued", "running", "success", "failure"];
    const rows = [...states.map(deliveryId => ({ deliveryId })), { deliveryId: "success" }, { deliveryId: "missing" }, {}];
    const result = observedCollectionStatusResponse(data.history, rows, states.map(status => receipt(status, status)));
    assert.deepEqual(result.meta.candleCountsByDeliveryStatus, { accepted: 1, queued: 1, running: 1, success: 2, failure: 1, unknown: 2 });
    assert.equal(result.meta.selectedCandleCount, 8);
    assert.deepEqual(result.data, { dataset: data.payload.dataset, asset: data.payload.assets[0] });
    assert.equal(result.meta.sourceAsOf, null); assert.equal(result.meta.freshness, "unknown");
    assert.equal(result.meta.completeness, "unknown"); assert.equal(result.meta.sessionCalendar, "unverified");
    assert.equal(result.meta.consistency, "non_atomic_read"); assert.equal(result.meta.statusSemantics, "referenced_delivery_status_at_read_time");
    assert(!/(private|deliveryId|payload|Digest|collectedOrder|_id|"open"|"close"|"high"|"low")/.test(JSON.stringify(result)));
  }
});

test("missing, malformed and incompatible delivery references never imply success", () => {
  const data = stored();
  const deliveries = [
    { ...receipt("fixture", "success"), schemaVersion: "1.0.0" },
    { ...receipt("provider", "success"), provider: "marketpulse-fixture" },
    { ...receipt("dataset", "success"), dataset: { ...data.payload.dataset, freshness: "current" } },
    { ...receipt("extra", "success"), dataset: { ...data.payload.dataset, extra: true } },
    { ...receipt("bad-dataset", "success"), dataset: null }, receipt("status", "retrying"),
  ];
  const rows = [...deliveries.map(row => ({ deliveryId: row._id })), {}, { deliveryId: 1 }, { deliveryId: "bad.ref" }, { deliveryId: "a".repeat(101) }];
  const result = observedCollectionStatusResponse(data.history, rows, deliveries);
  assert.equal(result.meta.candleCountsByDeliveryStatus.unknown, rows.length); assert.equal(result.meta.candleCountsByDeliveryStatus.success, 0);
});

test("collectedAt bounds compare UTC instants at microsecond precision and preserve original offsets; empty is no stored bars", () => {
  const data = stored();
  const times = ["2026-10-06T06:00:00.000002Z", "2026-10-06T14:00:00.000001+08:00", "2026-10-05T23:00:00.000003-07:00"];
  data.history.data.candles = times.map(collectedAt => ({ ...data.history.data.candles[0]!, collectedAt }));
  const result = observedCollectionStatusResponse(data.history, times.map(() => ({})), []);
  assert.deepEqual(result.meta.collectedAtRange, { from: times[1], to: times[2] });
  const empty = observedCollectionStatusResponse({ ...data.history, data: { ...data.history.data, candles: [] }, meta: { ...data.history.meta, returnedRange: null } }, [], []);
  assert.equal(empty.meta.status, "no_stored_bars"); assert.equal(empty.meta.selectedCandleCount, 0);
  assert.equal(empty.meta.collectedAtRange, null); assert.equal(empty.meta.returnedRange, null);
  assert.deepEqual(empty.meta.candleCountsByDeliveryStatus, { accepted: 0, queued: 0, running: 0, success: 0, failure: 0, unknown: 0 });
});

test("collection status reuses bounded indexed selection and deduplicates the projected receipt lookup without changing history projection", async () => {
  const data = stored(); let calls = 0; let withDelivery = true;
  const db = { collection(name: string) {
    if (name === "observed_assets") return { findOne: async (filter: unknown, options: unknown) => {
      assert.deepEqual(filter, { _id: "VN:HOSE:FPT" }); assert.deepEqual(options, { projection: observedAssetProjection, maxTimeMS: 321 }); return data.asset;
    } };
    return { find(filter: unknown, options: unknown) {
      if (name === "ingestion_deliveries") {
        calls++; assert.deepEqual(filter, { _id: { $in: ["private-delivery"] } });
        assert.deepEqual(options, { projection: observedDeliveryStatusProjection, maxTimeMS: 321 });
        return { limit: (limit: number) => { assert.equal(limit, 32); return { toArray: async () => [receipt("private-delivery", "running")] }; } };
      }
      assert.equal(name, "observed_candles_latest");
      assert.deepEqual(filter, { "record.assetId": "VN:HOSE:FPT", "record.tradingDate": { $gte: range.from, $lte: range.to }, "record.source.provider": "KBS", "record.interval": "1d", "record.adjustmentBasis": "unknown" });
      assert.deepEqual(options, { projection: withDelivery ? { ...observedCandleProjection, deliveryId: 1 } : observedCandleProjection, maxTimeMS: 321 });
      return { sort: (sort: unknown) => { assert.deepEqual(sort, { "record.tradingDate": 1 }); return { limit: (limit: number) => { assert.equal(limit, 33); return { toArray: async () => data.rows }; } }; } };
    } };
  } } as unknown as Db;
  const service = new ObservedHistoryService(db, 321);
  assert.equal((await service.collectionStatus("FPT", range))!.meta.candleCountsByDeliveryStatus.running, 1);
  assert.equal(calls, 1);
  withDelivery = false; assert.deepEqual(await service.read("FPT", range), data.history); assert.equal(calls, 1);
});

test("collection status HTTP validates input, normalizes symbols and sanitizes storage/readiness failures with no-store", async t => {
  let calls = 0; let ready = true;
  const router = createObservedHistoryRouter({ read: async () => null, collectionStatus: async (symbol) => { calls++; assert.equal(symbol, "FPT"); throw new Error("private database and credential"); } }, () => ready);
  const server = createServer(createApp({ checks: { mongo: async () => true, redis: async () => true }, observedHistoryRouter: router }));
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address(); assert(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}/api/observed/assets`;
  for (const [path, status, error] of [["FPT/collection-status", 400, "invalid_query"], ["%ZZ/collection-status?from=2026-10-01&to=2026-10-06", 400, "invalid_symbol"], ["VCB/collection-status?from=2026-10-01&to=2026-10-06", 404, "asset_not_found"], ["fpt/collection-status?from=2026-10-01&to=2026-10-06", 503, "observed_collection_status_unavailable"], ["FPT/collection-status?from=2026-10-01&to=2026-10-01&from=2026-10-01", 400, "invalid_query"], ["FPT/collection-status?from=2026-10-01&to=2026-11-02", 400, "invalid_query"]] as const) {
    const response = await fetch(`${base}/${path}`); assert.equal(response.status, status); assert.equal(response.headers.get("cache-control"), "no-store"); assert.deepEqual(await response.json(), { error });
  }
  assert.equal(calls, 1); ready = false;
  const response = await fetch(`${base}/FPT/collection-status?from=2026-10-01&to=2026-10-06`);
  assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: "observed_collection_status_unavailable" }); assert.equal(calls, 1);
});
