import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { readConfig } from "../src/config.js";
import { createApp } from "../src/health.js";
import { collectedOrder, digest, type ObservedPayload } from "../src/ingestion-contract.js";
import { observedHistoryResponse, parseObservedHistoryQuery } from "../src/observed-history-contract.js";
import { createObservedHistoryRouter, type ObservedHistoryReader } from "../src/observed-history.js";
import { observed, rehash } from "./observed-test-data.js";

const range = { from: "2026-10-01", to: "2026-10-06" };
function stored(payload = observed()) {
  return {
    asset: { record: payload.assets[0], dataset: payload.dataset, schemaVersion: payload.schemaVersion, rowDigest: digest(payload.assets[0]!), _id: "private", firstDeliveryId: "private" },
    rows: payload.candles.map(row => ({ record: row, dataset: payload.dataset, schemaVersion: payload.schemaVersion, barId: row.barId, contentDigest: row.contentDigest, collectedAt: row.collectedAt, collectedOrder: collectedOrder(row.collectedAt), deliveryId: "private", _id: "private" })),
  };
}

test("observed reads require strict explicit configuration independent of ingestion secret", () => {
  assert.equal(readConfig({}).observedReadsEnabled, false);
  assert.equal(readConfig({ OBSERVED_READS_ENABLED: "false" }).observedReadsEnabled, false);
  const enabled = readConfig({ OBSERVED_READS_ENABLED: "true" });
  assert.equal(enabled.observedReadsEnabled, true); assert.equal(enabled.ingestionSecret, undefined);
  for (const value of ["", "1", "TRUE", "true ", "yes"]) assert.throws(() => readConfig({ OBSERVED_READS_ENABLED: value }), /^Error: Invalid OBSERVED_READS_ENABLED configuration\.$/);
});

test("observed range parsing requires inclusive calendar bounds, daily interval and at most 31 days difference", () => {
  const query = (text: string) => parseObservedHistoryQuery(`/path${text}`);
  assert.deepEqual(query("?from=2024-02-29&to=2024-03-31"), { from: "2024-02-29", to: "2024-03-31" });
  assert.deepEqual(query("?from=0001-01-01&to=0001-01-01&interval=1d"), { from: "0001-01-01", to: "0001-01-01" });
  for (const text of ["", "?from=2026-10-01", "?to=2026-10-06", "?from=2026-02-29&to=2026-03-01", "?from=2024-02-30&to=2024-03-01", "?from=0000-01-01&to=0000-01-02", "?from=2026-10-06&to=2026-10-01", "?from=2026-10-01&to=2026-11-02", "?from=2026-10-01&to=2026-10-01&interval=5m", "?from=2026-10-01&to=2026-10-01&interval=", "?from=2026-10-01&to=2026-10-01&from=2026-10-01", "?from=2026-10-01&to=2026-10-01&interval=1d&interval=1d", "?from=2026-10-01&to=2026-10-01&cursor=x", "?from[day]=2026-10-01&to=2026-10-01", "?from=&to=2026-10-01"]) assert.equal(query(text), null, text);
});

test("read response preserves exact strings, nulls, time and complete provenance with an explicit public projection", () => {
  for (const index of [false, true]) {
    const payload = observed(index);
    const row = payload.candles[0]!;
    row.open = "1200.123456789123456789"; row.close = "1300.987654321987654321";
    rehash(payload);
    const data = stored(payload);
    const result = observedHistoryResponse(payload.request.symbol, range, data.asset, data.rows);
    assert.deepEqual(result.data, { dataset: payload.dataset, asset: payload.assets[0], candles: payload.candles });
    assert.deepEqual(result.meta, { status: "available", provider: "KBS", interval: "1d", requestedRange: range, returnedRange: { from: "2026-10-02", to: "2026-10-02" }, sourceAsOf: null, completeness: "unknown", selectionSemantics: "per_bar_max_collected_at_utc_microseconds_then_content_digest" });
    assert(!JSON.stringify(result).includes("private"));
    assert(!("request" in result.data)); assert(!("schemaVersion" in result.data)); assert(!("quotes" in result.data));
    const empty = observedHistoryResponse(payload.request.symbol, range, data.asset, []);
    assert.equal(empty.meta.status, "no_data"); assert.equal(empty.meta.returnedRange, null); assert.equal(empty.meta.sourceAsOf, null);
  }
});

test("stored contract rejects invalid values, consistency, hashes, duplicate dates, order and row overflow", () => {
  const invalidPayloads: Array<(payload: ObservedPayload) => void> = [
    p => { p.candles[0]!.close = "1300.00"; }, p => { p.candles[0]!.close = 1300; },
    p => { p.candles[0]!.low = "1400"; }, p => { p.candles[0]!.sourceAsOf = "2026-10-01T00:00:00Z"; },
    p => { p.candles[0]!.adjustmentBasis = "not_applicable"; }, p => { p.candles[0]!.unit = "index_point"; },
    p => { p.candles[0]!.providerTimeLabel = "2026-10-03 07:00"; }, p => { p.candles[0]!.providerTimeLabel = "2026-10-02 25:00"; },
    p => { p.candles[0]!.source.connectorVersion = "future"; }, p => { p.candles[0]!.tradingDate = "2026-10-07"; },
  ];
  for (const mutate of invalidPayloads) {
    const payload = observed(); mutate(payload); rehash(payload); const data = stored(payload);
    assert.throws(() => observedHistoryResponse("FPT", range, data.asset, data.rows));
  }
  const data = stored();
  for (const key of ["collectedAt", "collectedOrder", "barId", "contentDigest", "schemaVersion"] as const) {
    const rows = structuredClone(data.rows); Object.assign(rows[0]!, { [key]: "bad" });
    assert.throws(() => observedHistoryResponse("FPT", range, data.asset, rows), key);
  }
  assert.throws(() => observedHistoryResponse("FPT", range, { ...data.asset, rowDigest: "bad" }, data.rows));
  assert.throws(() => observedHistoryResponse("FPT", range, data.asset, [data.rows[0], data.rows[0]]));
  assert.throws(() => observedHistoryResponse("FPT", range, data.asset, Array(33).fill(data.rows[0])));
  const second = structuredClone(observed().candles[0]!); second.tradingDate = "2026-10-03"; second.providerTimeLabel = "2026-10-03 07:00";
  second.barId = digest(["KBS", second.assetId, "1d", second.tradingDate, "unknown"]);
  const two = observed(); two.candles.push(second); rehash(two);
  assert.throws(() => observedHistoryResponse("FPT", range, data.asset, stored(two).rows.reverse()));
});

test("observed HTTP validates inputs before reads and sanitizes failures with no-store", async t => {
  let called = 0;
  const reader: ObservedHistoryReader = { read: async () => { called++; throw new Error("private database host and token"); } };
  const server = createServer(createApp({ checks: { mongo: async () => true, redis: async () => true }, observedHistoryRouter: createObservedHistoryRouter(reader) }));
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address(); assert(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}/api/observed/assets`;
  for (const [path, status, error] of [["FPT/history", 400, "invalid_query"], ["%24FPT/history?from=2026-10-01&to=2026-10-06", 400, "invalid_symbol"], ["%ZZ/history?from=2026-10-01&to=2026-10-06", 400, "invalid_symbol"], ["VCB/history?from=2026-10-01&to=2026-10-06", 404, "asset_not_found"], ["fpt/history?from=2026-10-01&to=2026-10-06", 503, "observed_history_unavailable"]] as const) {
    const response = await fetch(`${base}/${path}`); assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { error }); assert.equal(response.headers.get("cache-control"), "no-store");
  }
  assert.equal(called, 1);
});
