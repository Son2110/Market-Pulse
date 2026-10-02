import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { closingChart, closingSummary, DetailError, fetchHistory, isHistoryResponse, stockRoute, type DailyCandle, type HistoryResponse } from "../src/stock-detail.js";

function response(): HistoryResponse {
  const fixture = JSON.parse(readFileSync(new URL("../../../fixtures/market/mp-02-synthetic.json", import.meta.url), "utf8")) as HistoryResponse["data"];
  return {
    data: { ...fixture, assets: [fixture.assets[0]], candles: fixture.candles.filter((candle) => candle.assetId === "VN:HOSE:FPT"), quotes: [], indexObservations: [] },
    meta: { status: "available", provider: "marketpulse-fixture", interval: "1d", requestedRange: { from: null, to: null }, availableRange: { from: "2026-09-21", to: "2026-09-23" }, asOf: "2026-09-23T15:00:00+07:00" },
  };
}

test("route normalizes lowercase and rejects unsafe paths, malformed encoding and unsupported index", () => {
  assert.deepEqual(stockRoute("/"), { kind: "search" });
  assert.deepEqual(stockRoute("/stocks/fpt"), { kind: "detail", symbol: "FPT" });
  assert.deepEqual(stockRoute("/stocks/%46PT/"), { kind: "detail", symbol: "FPT" });
  for (const path of ["/stocks", "/stocks/", "/stocks/FPT/extra", "/stocks/%", "/stocks/%2F", "/stocks/%252F", "/stocks/%3Cscript%3E", "/stocks/%20FPT", "/stocks/VNINDEX", "/stocks/" + "A".repeat(33)]) {
    assert.deepEqual(stockRoute(path), { kind: "invalid" }, path);
  }
});

test("history guard accepts the committed fixture, empty and single-observation envelopes", () => {
  const body = response();
  assert.ok(isHistoryResponse(body, "FPT"));
  body.data.candles = body.data.candles.slice(-1);
  assert.ok(isHistoryResponse(body, "FPT"));
  body.data.candles = [];
  body.meta.status = "no_data";
  body.meta.asOf = null;
  assert.ok(isHistoryResponse(body, "FPT"));
  body.meta.status = "available";
  assert.equal(isHistoryResponse(body, "FPT"), false);
});

test("history guard rejects asset, provenance, units, OHLCV, chronology and metadata corruption", () => {
  const mutations: ((body: HistoryResponse) => void)[] = [
    (body) => { body.data.assets[0].symbol = "VCB"; },
    (body) => { body.data.assets[0].assetId = "VN:HOSE:WRONG"; },
    (body) => { body.data.assets[0].assetType = "index" as never; },
    (body) => { body.data.assets[0].currency = "USD" as never; },
    (body) => { body.data.candles[0].assetId = "VN:HOSE:VCB"; },
    (body) => { body.data.candles[0].timezone = "UTC" as never; },
    (body) => { body.data.candles[0].volume = null as never; },
    (body) => { body.data.candles[0].volume = 1.5; },
    (body) => { body.data.candles[0].volume = -1; },
    (body) => { body.data.candles[0].volumeUnit = "not_available" as never; },
    (body) => { body.data.candles[0].close = 0; },
    (body) => { body.data.candles[0].high = 1; },
    (body) => { body.data.candles[0].low = Number.POSITIVE_INFINITY; },
    (body) => { body.data.candles[0].adjustmentBasis = "split_adjusted"; },
    (body) => { body.data.candles[0].adjustmentBasis = "not_applicable" as never; },
    (body) => { body.data.candles.reverse(); },
    (body) => { body.data.candles[1] = body.data.candles[0]; },
    (body) => { body.data.candles[0].source.provider = "live" as never; },
    (body) => { body.data.candles[0].source.mode = "observed" as never; },
    (body) => { body.data.candles[0].source.recordId = ""; },
    (body) => { body.data.dataset.label = "MARKET DATA" as never; },
    (body) => { body.data.dataset.freshness = "current" as never; },
    (body) => { body.data.dataset.sessionCalendar = "verified" as never; },
    (body) => { body.meta.provider = "live" as never; },
    (body) => { body.meta.asOf = "2026-09-22T15:00:00+07:00"; },
    (body) => { body.meta.status = "no_data"; },
    (body) => { body.meta.availableRange.to = "2026-09-22"; },
    (body) => { body.meta.availableRange.from = null; },
  ];
  for (const mutate of mutations) {
    const body = response();
    mutate(body);
    assert.equal(isHistoryResponse(body, "FPT"), false, mutate.toString());
  }
  for (const body of [null, {}, { data: null, meta: {} }]) assert.equal(isHistoryResponse(body, "FPT"), false);
  assert.equal(isHistoryResponse(response(), "VCB"), false);
});

test("history guard rejects rolled-over dates, invalid timestamps and inconsistent local observation times", () => {
  for (const invalid of ["2026-02-30", "0000-01-01", "2026-13-01"]) {
    const body = response();
    body.data.candles[0].tradingDate = invalid;
    assert.equal(isHistoryResponse(body, "FPT"), false);
  }
  for (const invalid of ["2026-02-30T15:00:00+07:00", "2026-09-21T24:00:00+07:00", "2026-09-21T15:60:00+07:00", "2026-09-21T15:00:60+07:00", "2026-09-21T15:00:00+07:60", "2026-09-21", "2026-09-20T15:00:00+07:00"]) {
    const body = response();
    body.data.candles[0].asOf = invalid;
    assert.equal(isHistoryResponse(body, "FPT"), false, invalid);
  }
  const body = response();
  body.data.candles[0].ingestedAt = "2026-09-21T14:59:00+07:00";
  assert.equal(isHistoryResponse(body, "FPT"), false);
});

function series(prices: number[], dates = ["2026-09-21", "2026-09-22", "2026-09-23"]): DailyCandle[] {
  return prices.map((close, index) => ({ ...response().data.candles[0], close, open: close, high: close, low: close, tradingDate: dates[index] }));
}

test("closing analytics use the previous available observation and preserve missing baseline", () => {
  const fixture = closingSummary(response().data.candles);
  assert.equal(fixture.change, 1500);
  assert.equal(fixture.previous?.tradingDate, "2026-09-22");
  assert.equal(new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(fixture.changePercent!), "1,49");
  const negative = closingSummary(series([100, 75], ["2026-09-18", "2026-09-23"]));
  assert.equal(negative.change, -25);
  assert.equal(negative.changePercent, -25);
  assert.equal(negative.previous?.tradingDate, "2026-09-18");
  assert.equal(closingSummary(series([100, 100])).changePercent, 0);
  assert.deepEqual(closingSummary([]), { latest: null, previous: null, change: null, changePercent: null });
  assert.equal(closingSummary(series([100])).change, null);
  assert.equal(closingSummary(series([0, 100])).changePercent, null);
});

test("chart places dates proportionally, breaks calendar gaps and never fills missing observations", () => {
  const chart = closingChart(series([100, 110, 120], ["2026-09-18", "2026-09-21", "2026-09-22"]));
  assert.equal(chart.points.length, 3);
  assert.deepEqual(chart.points.map((point) => point.x), [80, 500, 640]);
  assert.deepEqual(chart.segments.map((segment) => segment.length), [1, 2]);
  assert.equal(chart.hasGaps, true);
  assert.equal(closingChart(response().data.candles).hasGaps, false);
  const narrow = closingChart(response().data.candles, 246);
  assert.deepEqual(narrow.points.map((point) => point.x), [65, 135.5, 206]);
  assert.equal(narrow.points.length, 3);
});

test("empty, single and flat charts stay finite and show actual markers", () => {
  assert.deepEqual(closingChart([]).points, []);
  const single = closingChart(series([100]));
  assert.equal(single.points[0].x, 360);
  assert.equal(single.segments[0].length, 1);
  const flat = closingChart(series([100, 100, 100]));
  assert.ok(flat.points.every((point) => Number.isFinite(point.y) && point.y === flat.points[0].y));
  assert.ok(flat.ticks.every((tick) => Number.isFinite(tick.price)));
});

test("history request uses normalized same-origin path, no-store and rejects invalid input without fetching", async () => {
  const body = response();
  const request: typeof fetch = async (url, options) => {
    assert.equal(url, "/api/assets/FPT/history");
    assert.equal(options?.cache, "no-store");
    return Response.json(body);
  };
  assert.deepEqual(await fetchHistory("fpt", new AbortController().signal, request), body);
  await assert.rejects(fetchHistory("../FPT", new AbortController().signal, async () => { throw new Error("Should not fetch"); }), (error) => error instanceof DetailError && error.kind === "invalid");
});

test("history request distinguishes HTTP, malformed JSON, malformed data and network errors", async () => {
  const cases: [typeof fetch, string][] = [
    [async () => new Response(null, { status: 400 }), "invalid"],
    [async () => new Response(null, { status: 404 }), "unknown"],
    [async () => new Response(null, { status: 503 }), "unavailable"],
    [async () => new Response("invalid JSON"), "response"],
    [async () => Response.json({ data: [] }), "response"],
    [async () => { throw new TypeError("network"); }, "network"],
  ];
  for (const [request, kind] of cases) {
    await assert.rejects(fetchHistory("FPT", new AbortController().signal, request), (error) => error instanceof DetailError && error.kind === kind);
  }
});

const waitingRequest: typeof fetch = async (_url, options) => new Promise((_resolve, reject) => {
  const signal = options?.signal;
  if (signal?.aborted) reject(signal.reason);
  else signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
});

test("history request times out and propagates caller cancellation independently", async () => {
  await assert.rejects(fetchHistory("FPT", new AbortController().signal, waitingRequest, 5), (error) => error instanceof DetailError && error.kind === "timeout");
  const controller = new AbortController();
  const pending = fetchHistory("FPT", controller.signal, waitingRequest);
  controller.abort();
  await assert.rejects(pending, (error) => error instanceof DOMException && error.name === "AbortError");
});
