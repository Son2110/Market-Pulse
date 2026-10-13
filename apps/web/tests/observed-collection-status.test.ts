import assert from "node:assert/strict";
import test from "node:test";
import { CollectionStatusError, collectionStatusErrorMessage, fetchObservedCollectionStatus, isObservedCollectionStatus, type ObservedCollectionStatus } from "../src/observed-collection-status.js";
import { sampleRange } from "../src/observed-detail.js";

function response(): ObservedCollectionStatus {
  return { data: { asset: { assetId: "VN:HOSE:FPT", symbol: "FPT", assetType: "equity", currency: "VND", unit: "VND", timezone: "Asia/Ho_Chi_Minh" },
    dataset: { mode: "observed", label: "OBSERVED KBS DAILY CANDLES — FRESHNESS UNKNOWN", freshness: "unknown", sessionCalendar: "unverified" } },
    meta: { status: "available", provider: "KBS", interval: "1d", requestedRange: { ...sampleRange }, returnedRange: { from: "2026-09-28", to: "2026-10-03" },
      sourceAsOf: null, completeness: "unknown", freshness: "unknown", sessionCalendar: "unverified", selectionSemantics: "per_bar_max_collected_at_utc_microseconds_then_content_digest",
      selectedCandleCount: 6, collectedAtRange: { from: "2026-10-08T04:30:00.123456Z", to: "2026-10-08T11:30:00.123457+07:00" },
      candleCountsByDeliveryStatus: { accepted: 1, queued: 1, running: 1, success: 1, failure: 1, unknown: 1 },
      statusSemantics: "referenced_delivery_status_at_read_time", consistency: "non_atomic_read" } };
}
test("accepts independent mixed, unknown, success, failure and empty projections", () => {
  assert.equal(isObservedCollectionStatus(response(), sampleRange), true);
  for (const status of ["unknown", "success", "failure"] as const) {
    const value = response(); for (const bucket of Object.keys(value.meta.candleCountsByDeliveryStatus)) value.meta.candleCountsByDeliveryStatus[bucket as typeof status] = 0;
    value.meta.candleCountsByDeliveryStatus[status] = 6; assert.equal(isObservedCollectionStatus(value, sampleRange), true);
  }
  const empty = response(); empty.meta.status = "no_stored_bars"; empty.meta.selectedCandleCount = 0; empty.meta.returnedRange = null; empty.meta.collectedAtRange = null;
  empty.meta.candleCountsByDeliveryStatus = { accepted: 0, queued: 0, running: 0, success: 0, failure: 0, unknown: 0 };
  assert.equal(isObservedCollectionStatus(empty, sampleRange), true);
  // No history response participates in validation; a separate read may select a different count.
  const single = response(); single.meta.selectedCandleCount = 1; single.meta.candleCountsByDeliveryStatus = { accepted: 0, queued: 0, running: 0, success: 0, failure: 0, unknown: 1 };
  single.meta.returnedRange = { from: "2026-10-03", to: "2026-10-03" }; assert.equal(isObservedCollectionStatus(single, sampleRange), true);
});
test("rejects extra or missing keys at every contract object boundary", () => {
  const paths = [[], ["data"], ["data", "asset"], ["data", "dataset"], ["meta"], ["meta", "requestedRange"], ["meta", "returnedRange"], ["meta", "collectedAtRange"], ["meta", "candleCountsByDeliveryStatus"]];
  for (const path of paths) for (const operation of ["extra", "missing"]) {
    const value = response(); let object = value as unknown as Record<string, unknown>;
    for (const key of path) object = object[key] as Record<string, unknown>;
    if (operation === "extra") object.extra = "unexpected"; else delete object[Object.keys(object)[0]];
    assert.equal(isObservedCollectionStatus(value, sampleRange), false, `${path.join(".")} ${operation}`);
  }
  for (const value of [null, [], {}, { data: [], meta: {} }]) assert.equal(isObservedCollectionStatus(value, sampleRange), false);
});
test("rejects altered identity, metadata, semantic literals and null contracts", () => {
  const changes: ["asset" | "dataset" | "meta", string, unknown][] = [
    ["asset", "assetId", "VN:INDEX:VNINDEX"], ["asset", "symbol", "VCB"], ["asset", "assetType", "index"], ["asset", "currency", null], ["asset", "unit", "index_point"], ["asset", "timezone", "UTC"],
    ["dataset", "mode", "fixture"], ["dataset", "label", "OBSERVED"], ["dataset", "freshness", "fresh"], ["dataset", "sessionCalendar", "verified"],
    ["meta", "provider", "OTHER"], ["meta", "interval", "1h"], ["meta", "sourceAsOf", "2026-10-08T00:00:00Z"], ["meta", "completeness", "complete"], ["meta", "freshness", "fresh"], ["meta", "sessionCalendar", "verified"],
    ["meta", "selectionSemantics", "latest"], ["meta", "statusSemantics", "job_status"], ["meta", "consistency", "atomic"], ["meta", "status", "no_stored_bars"],
    ["meta", "returnedRange", null], ["meta", "collectedAtRange", null], ["meta", "candleCountsByDeliveryStatus", null],
  ];
  for (const [section, key, field] of changes) {
    const value = response(); const object = section === "meta" ? value.meta : value.data[section];
    (object as unknown as Record<string, unknown>)[key] = field;
    assert.equal(isObservedCollectionStatus(value, sampleRange), false, `${section}.${key}`);
  }
});
test("counts are bounded safe integers, six buckets sum to selected count and fit calendar ranges", () => {
  for (const count of [-1, 1.5, "6", null, NaN, Infinity, 33, Number.MAX_SAFE_INTEGER + 1]) {
    const value = response(); (value.meta as unknown as Record<string, unknown>).selectedCandleCount = count;
    assert.equal(isObservedCollectionStatus(value, sampleRange), false);
    const bucket = response(); (bucket.meta.candleCountsByDeliveryStatus as unknown as Record<string, unknown>).accepted = count;
    assert.equal(isObservedCollectionStatus(bucket, sampleRange), false);
  }
  const wrongSum = response(); wrongSum.meta.candleCountsByDeliveryStatus.unknown = 0; assert.equal(isObservedCollectionStatus(wrongSum, sampleRange), false);
  const tooMany = response(); tooMany.meta.selectedCandleCount = 11; tooMany.meta.candleCountsByDeliveryStatus.unknown = 6; assert.equal(isObservedCollectionStatus(tooMany, sampleRange), false);
  const smallReturned = response(); smallReturned.meta.returnedRange = { from: "2026-09-28", to: "2026-09-29" }; assert.equal(isObservedCollectionStatus(smallReturned, sampleRange), false);
  for (const returned of [{ from: "2026-09-27", to: "2026-10-03" }, { from: "2026-09-28", to: "2026-10-08" }, { from: "2026-10-03", to: "2026-09-28" }, { from: "2026-02-30", to: "2026-10-03" }]) {
    const value = response(); value.meta.returnedRange = returned; assert.equal(isObservedCollectionStatus(value, sampleRange), false);
  }
  const mismatch = response(); mismatch.meta.requestedRange.to = "2026-10-06"; assert.equal(isObservedCollectionStatus(mismatch, sampleRange), false);
  const zero = response(); zero.meta.selectedCandleCount = 0; zero.meta.candleCountsByDeliveryStatus = { accepted: 0, queued: 0, running: 0, success: 0, failure: 0, unknown: 0 };
  assert.equal(isObservedCollectionStatus(zero, sampleRange), false); zero.meta.status = "no_stored_bars"; assert.equal(isObservedCollectionStatus(zero, sampleRange), false);
  zero.meta.returnedRange = null; assert.equal(isObservedCollectionStatus(zero, sampleRange), false); zero.meta.collectedAtRange = null; assert.equal(isObservedCollectionStatus(zero, sampleRange), true);
  const maxRange = { from: "2026-01-01", to: "2026-02-01" }; const max = response(); max.meta.requestedRange = maxRange; max.meta.returnedRange = maxRange;
  max.meta.selectedCandleCount = 32; max.meta.candleCountsByDeliveryStatus = { accepted: 0, queued: 0, running: 0, success: 32, failure: 0, unknown: 0 };
  assert.equal(isObservedCollectionStatus(max, maxRange), true); assert.equal(isObservedCollectionStatus(max, { from: "2026-01-01", to: "2026-02-02" }), false);
});
test("collected timestamps keep UTC microsecond ordering across offsets and reject invalid precision/calendar", () => {
  const value = response();
  for (const [from, to, valid] of [
    ["2026-10-08T04:30:00.123457Z", "2026-10-08T04:30:00.123456Z", false],
    ["2026-10-08T11:30:00.123456+07:00", "2026-10-08T04:30:00.123457Z", true],
    ["2026-10-08T11:30:00.123457+07:00", "2026-10-08T04:30:00.123456Z", false],
    ["2026-10-08T04:30:00.1Z", "2026-10-08T11:30:00.100000+07:00", true],
    ["1960-01-01T00:00:00.000001Z", "1960-01-01T00:00:00.000002Z", true],
  ] as const) { value.meta.collectedAtRange = { from, to }; assert.equal(isObservedCollectionStatus(value, sampleRange), valid, `${from} -> ${to}`); }
  for (const timestamp of ["2026-02-30T00:00:00Z", "0000-01-01T00:00:00Z", "0001-01-01T00:00:00+01:00", "9999-12-31T23:59:59-01:00", "2026-10-08 04:30:00Z", "2026-10-08T04:30Z", "2026-10-08T24:00:00Z", "2026-10-08T00:60:00Z", "2026-10-08T00:00:60Z", "2026-10-08T00:00:00-00:00", "2026-10-08T00:00:00+24:00", "2026-10-08T00:00:00+07:60", "2026-10-08T00:00:00.1234567Z", "2026-10-08T00:00:00Z\n", "2026-10-08T00:00:00"]) {
    value.meta.collectedAtRange = { from: timestamp, to: timestamp }; assert.equal(isObservedCollectionStatus(value, sampleRange), false, timestamp);
  }
});
test("fetch uses exact same-origin status route, no-store and JSON Accept; invalid inputs never fetch", async () => {
  const value = response(); const request: typeof fetch = async (url, options) => {
    assert.equal(url, "/api/observed/assets/FPT/collection-status?from=2026-09-28&to=2026-10-07");
    assert.equal(options?.cache, "no-store"); assert.deepEqual(options?.headers, { Accept: "application/json" }); assert.ok(options?.signal);
    return Response.json(value);
  };
  assert.deepEqual(await fetchObservedCollectionStatus("FPT", sampleRange, new AbortController().signal, request), value);
  for (const [symbol, range] of [["VNINDEX", sampleRange], ["VCB", sampleRange], ["FPT", { from: "2026-01-01", to: "2026-02-02" }], ["FPT", { from: "2026-02-30", to: "2026-03-01" }]] as const)
    await assert.rejects(fetchObservedCollectionStatus(symbol, range, new AbortController().signal, async () => { throw new Error("Must not fetch"); }), error => error instanceof CollectionStatusError && error.kind === "invalid");
});
test("fetch separates 400/404/503, JSON/contract/network errors, timeout and caller abort", async () => {
  const cases: [typeof fetch, string][] = [[async () => new Response(null, { status: 400 }), "invalid"], [async () => new Response(null, { status: 404 }), "missing"], [async () => new Response(null, { status: 503 }), "unavailable"], [async () => new Response("bad json"), "response"], [async () => Response.json({}), "response"], [async () => { throw new TypeError("offline"); }, "network"]];
  for (const [request, kind] of cases) await assert.rejects(fetchObservedCollectionStatus("FPT", sampleRange, new AbortController().signal, request), error => error instanceof CollectionStatusError && error.kind === kind);
  assert.equal(collectionStatusErrorMessage(new CollectionStatusError("missing")), "Trạng thái thu thập đã lưu chưa khả dụng cho mã này.");
  const waiting: typeof fetch = async (_url, options) => new Promise((_resolve, reject) => { const signal = options?.signal; if (signal?.aborted) reject(signal.reason); else signal?.addEventListener("abort", () => reject(signal.reason), { once: true }); });
  await assert.rejects(fetchObservedCollectionStatus("FPT", sampleRange, new AbortController().signal, waiting, 5), error => error instanceof CollectionStatusError && error.kind === "timeout");
  const controller = new AbortController(); const pending = fetchObservedCollectionStatus("FPT", sampleRange, controller.signal, waiting); controller.abort();
  await assert.rejects(pending, error => error instanceof DOMException && error.name === "AbortError");
});
