import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fetchIndexHistory, indexClosingSummary, indexErrorMessage, IndexHistoryError, isIndexHistoryResponse, isMarketRoute, type IndexHistoryResponse } from "../src/market-overview.js";
import { isHistoryResponse, stockRoute } from "../src/stock-detail.js";

function response(): IndexHistoryResponse {
  const fixture = JSON.parse(readFileSync(new URL("../../../fixtures/market/mp-02-synthetic.json", import.meta.url), "utf8")) as IndexHistoryResponse["data"];
  const asset = fixture.assets.find((item) => item.symbol === "VNINDEX")!;
  return {
    data: { ...fixture, assets: [asset], candles: fixture.candles.filter((candle) => candle.assetId === asset.assetId), quotes: [], indexObservations: [] },
    meta: { status: "available", provider: "marketpulse-fixture", interval: "1d", requestedRange: { from: null, to: null }, availableRange: { from: "2026-09-21", to: "2026-09-23" }, asOf: "2026-09-23T15:00:00+07:00" },
  };
}

test("market route accepts only the dedicated page and preserves stock index rejection", () => {
  for (const path of ["/market", "/market/"]) assert.equal(isMarketRoute(path), true);
  for (const path of ["/", "/markets", "/market/extra", "/Market", "/market//", "/stocks/VNINDEX"]) assert.equal(isMarketRoute(path), false);
  assert.deepEqual(stockRoute("/stocks/VNINDEX"), { kind: "invalid" });
  assert.equal(isHistoryResponse(response(), "VNINDEX"), false);
});

test("index guard accepts canonical fixture, one observation, and no-data without as-of", () => {
  const body = response();
  assert.ok(isIndexHistoryResponse(body));
  assert.deepEqual(body.data.candles.map((candle) => candle.close), [1300, 1310, 1308]);
  body.data.candles = body.data.candles.slice(-1);
  assert.ok(isIndexHistoryResponse(body));
  body.data.candles = [];
  body.meta.status = "no_data";
  body.meta.asOf = null;
  assert.ok(isIndexHistoryResponse(body));
  body.meta.availableRange = { from: null, to: null };
  assert.ok(isIndexHistoryResponse(body));
  body.meta.asOf = "2026-09-23T15:00:00+07:00";
  assert.equal(isIndexHistoryResponse(body), false);
});

test("index guard rejects wrong identity, equity units, missing volume semantics and corrupt envelope metadata", () => {
  const mutations: ((body: IndexHistoryResponse) => void)[] = [
    (body) => { body.data.schemaVersion = "2.0.0" as never; },
    (body) => { body.data.assets = [] as never; },
    (body) => { body.data.assets.push(body.data.assets[0]); },
    (body) => { body.data.assets[0].symbol = "FPT" as never; },
    (body) => { body.data.assets[0].assetId = "VN:HOSE:FPT" as never; },
    (body) => { body.data.assets[0].assetType = "equity" as never; },
    (body) => { body.data.assets[0].exchange = "HOSE" as never; },
    (body) => { body.data.assets[0].currency = "VND" as never; },
    (body) => { body.data.assets[0].unit = "VND" as never; },
    (body) => { body.data.assets[0].timezone = "UTC" as never; },
    (body) => { body.data.candles[0].assetId = "VN:HOSE:FPT" as never; },
    (body) => { body.data.candles[0].interval = "1h" as never; },
    (body) => { body.data.candles[0].currency = "VND" as never; },
    (body) => { body.data.candles[0].unit = "VND" as never; },
    (body) => { body.data.candles[0].timezone = "UTC" as never; },
    (body) => { body.data.candles[0].volume = 0 as never; },
    (body) => { body.data.candles[0].volumeUnit = "shares" as never; },
    (body) => { body.data.candles[0].adjustmentBasis = "unadjusted" as never; },
    (body) => { body.data.dataset.mode = "observed" as never; },
    (body) => { body.data.dataset.label = "MARKET DATA" as never; },
    (body) => { body.data.dataset.freshness = "current" as never; },
    (body) => { body.data.dataset.sessionCalendar = "verified" as never; },
    (body) => { body.data.quotes = [{}] as never; },
    (body) => { body.data.indexObservations = [{}] as never; },
    (body) => { body.meta.provider = "live" as never; },
    (body) => { body.meta.interval = "1h" as never; },
    (body) => { body.meta.requestedRange.from = "2026-09-21" as never; },
    (body) => { body.meta.availableRange.from = null; },
    (body) => { body.meta.availableRange.to = "2026-09-22"; },
    (body) => { body.meta.availableRange.from = "2026-09-24"; },
    (body) => { body.meta.asOf = "2026-09-22T15:00:00+07:00"; },
    (body) => { body.meta.status = "no_data"; },
  ];
  for (const mutate of mutations) {
    const body = response();
    mutate(body);
    assert.equal(isIndexHistoryResponse(body), false, mutate.toString());
  }
  for (const body of [null, {}, { data: null, meta: {} }]) assert.equal(isIndexHistoryResponse(body), false);
});

test("index guard rejects invalid OHLC, duplicate or unsorted observations and invalid provenance", () => {
  const mutations: ((body: IndexHistoryResponse) => void)[] = [
    (body) => { body.data.candles[0].close = 0; },
    (body) => { body.data.candles[0].open = -1; },
    (body) => { body.data.candles[0].high = Number.POSITIVE_INFINITY; },
    (body) => { body.data.candles[0].low = Number.NaN; },
    (body) => { body.data.candles[0].high = 1000; },
    (body) => { body.data.candles[0].low = 1400; },
    (body) => { body.data.candles.reverse(); },
    (body) => { body.data.candles[1] = body.data.candles[0]; },
    (body) => { body.data.candles[0].source.provider = "live" as never; },
    (body) => { body.data.candles[0].source.mode = "observed" as never; },
    (body) => { body.data.candles[0].source.recordId = "synthetic-"; },
    (body) => { body.data.candles[1].source.recordId = body.data.candles[0].source.recordId; },
    (body) => { body.data.candles[0].ingestedAt = "2026-09-21T14:59:59+07:00"; },
  ];
  for (const mutate of mutations) {
    const body = response();
    mutate(body);
    assert.equal(isIndexHistoryResponse(body), false, mutate.toString());
  }
  for (const invalid of ["0000-01-01", "2026-02-30", "2026-13-01"]) {
    const body = response();
    body.data.candles[0].tradingDate = invalid;
    assert.equal(isIndexHistoryResponse(body), false);
  }
  for (const invalid of ["2026-02-30T15:00:00+07:00", "2026-09-21T24:00:00+07:00", "2026-09-21T15:60:00+07:00", "2026-09-21T15:00:60+07:00", "2026-09-21T15:00:00+07:60", "2026-09-21", "2026-09-20T15:00:00+07:00"]) {
    const body = response();
    body.data.candles[0].asOf = invalid;
    assert.equal(isIndexHistoryResponse(body), false, invalid);
  }
});

test("summary derives fixture -2 points and -0.15 percent from previous available date", () => {
  const summary = indexClosingSummary(response().data.candles);
  assert.equal(summary.latest?.close, 1308);
  assert.equal(summary.previous?.tradingDate, "2026-09-22");
  assert.equal(summary.change, -2);
  assert.equal(new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(summary.changePercent!), "-0,15");
  const body = response();
  body.data.candles = [body.data.candles[0], body.data.candles[2]];
  assert.ok(isIndexHistoryResponse(body));
  assert.equal(indexClosingSummary(body.data.candles).previous?.tradingDate, "2026-09-21");
  assert.equal(indexClosingSummary(body.data.candles).change, 8);
});

test("summary preserves missing baseline and distinguishes negative, zero and positive changes", () => {
  const candle = response().data.candles[0];
  for (const [close, expected] of [[75, -25], [100, 0], [125, 25]]) {
    const summary = indexClosingSummary([{ ...candle, close: 100 }, { ...candle, close }]);
    assert.equal(summary.change, expected);
    assert.equal(summary.changePercent, expected);
  }
  assert.deepEqual(indexClosingSummary([]), { latest: null, previous: null, change: null, changePercent: null });
  assert.deepEqual(indexClosingSummary([candle]), { latest: candle, previous: null, change: null, changePercent: null });
  assert.equal(indexClosingSummary([{ ...candle, close: 0 }, candle]).changePercent, null);
});

test("index request uses the same-origin history API with no-store and JSON", async () => {
  const body = response();
  const request: typeof fetch = async (url, options) => {
    assert.equal(url, "/api/assets/VNINDEX/history");
    assert.equal(options?.cache, "no-store");
    assert.deepEqual(options?.headers, { Accept: "application/json" });
    assert.ok(options?.signal);
    return Response.json(body);
  };
  assert.deepEqual(await fetchIndexHistory(new AbortController().signal, request), body);
});

test("index request distinguishes missing index, unavailable, malformed JSON/data and network errors", async () => {
  const cases: [typeof fetch, IndexHistoryError["kind"]][] = [
    [async () => new Response(null, { status: 404 }), "missing"],
    [async () => new Response(null, { status: 503 }), "unavailable"],
    [async () => new Response(null, { status: 400 }), "unavailable"],
    [async () => new Response("invalid JSON"), "response"],
    [async () => Response.json({ data: [] }), "response"],
    [async () => { throw new TypeError("network"); }, "network"],
  ];
  for (const [request, kind] of cases) {
    await assert.rejects(fetchIndexHistory(new AbortController().signal, request), (error) => error instanceof IndexHistoryError && error.kind === kind);
    assert.ok(indexErrorMessage(new IndexHistoryError(kind)).includes("VN-Index"));
  }
});

const waitingRequest: typeof fetch = async (_url, options) => new Promise((_resolve, reject) => {
  const signal = options?.signal;
  if (signal?.aborted) reject(signal.reason);
  else signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
});

test("index request times out independently of caller cancellation", async () => {
  await assert.rejects(fetchIndexHistory(new AbortController().signal, waitingRequest, 5), (error) => error instanceof IndexHistoryError && error.kind === "timeout");
  const controller = new AbortController();
  const pending = fetchIndexHistory(controller.signal, waitingRequest);
  controller.abort();
  await assert.rejects(pending, (error) => error instanceof DOMException && error.name === "AbortError");
});
