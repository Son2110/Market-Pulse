import assert from "node:assert/strict";
import test from "node:test";
import { compareDecimal, detailHref, detailMode, fetchObservedHistory, isObservedHistory, observedChart, ObservedError, observedErrorMessage, sampleRange, validatedSearch, validObservedRange, type ObservedCandle, type ObservedHistory } from "../src/observed-detail.js";

function response(): ObservedHistory {
  const candle: ObservedCandle = {
    assetId: "VN:HOSE:FPT", tradingDate: "2026-09-28", interval: "1d", currency: "VND", unit: "VND", timezone: "Asia/Ho_Chi_Minh", adjustmentBasis: "unknown",
    open: "99999.99999999999999999", high: "100001", low: "99998", close: "100000.00000000000000001", volume: null, volumeUnit: "not_available",
    providerTimeLabel: "2026-09-28 00:00:00", timeProvenance: "provider_naive_calendar_label", sourceAsOf: null, collectedAt: "2026-10-08T04:30:00.123456Z",
    source: { provider: "KBS", connector: "vnstock", connectorVersion: "4.0.8", dependencyVersion: "2.6.2", mode: "observed" }, barId: "a".repeat(64), contentDigest: "b".repeat(64),
  };
  return { data: { asset: { assetId: "VN:HOSE:FPT", symbol: "FPT", assetType: "equity", currency: "VND", unit: "VND", timezone: "Asia/Ho_Chi_Minh" },
    dataset: { mode: "observed", label: "OBSERVED KBS DAILY CANDLES — FRESHNESS UNKNOWN", freshness: "unknown", sessionCalendar: "unverified" }, candles: [candle] },
    meta: { provider: "KBS", interval: "1d", status: "available", requestedRange: { ...sampleRange }, returnedRange: { from: candle.tradingDate, to: candle.tradingDate }, sourceAsOf: null, completeness: "unknown", selectionSemantics: "per_bar_max_collected_at_utc_microseconds_then_content_digest" } };
}
function series(prices: string[], dates = ["2026-09-28", "2026-09-29", "2026-10-02"]): ObservedCandle[] {
  return prices.map((close, index) => ({ ...response().data.candles[0], open: close, high: close, low: close, close, tradingDate: dates[index] }));
}

test("detail defaults to fixture and explicit observed requires FPT, dates and one source", () => {
  assert.deepEqual(detailMode("", "FPT"), { kind: "fixture" });
  assert.deepEqual(detailMode("?search=fpt", "VCB"), { kind: "fixture" });
  assert.deepEqual(detailMode("?source=fixture&search=FPT", "FPT"), { kind: "fixture" });
  assert.deepEqual(detailMode("?source=observed&from=2026-09-28&to=2026-10-07", "FPT"), { kind: "observed", range: sampleRange });
  for (const query of ["?source=", "?source=unknown", "?from=2026-09-28", "?source=fixture&to=2026-10-07", "?source=observed", "?source=observed&source=fixture&from=2026-09-28&to=2026-10-07", "?source=observed&from=2026-09-28&from=2026-09-28&to=2026-10-07", "?source=observed&from=2026-09-28&to=2026-10-07&to=2026-10-07", "?source=observed&from=2026-09-28&to=2026-10-07&interval=5d"])
    assert.equal(detailMode(query, "FPT").kind, "invalid", query);
  for (const symbol of [null, "VCB", "VNINDEX"]) assert.equal(detailMode("?source=observed&from=2026-09-28&to=2026-10-07", symbol).kind, "invalid");
});
test("inclusive range accepts 31 day difference and leap dates, rejects 32 and rollover", () => {
  assert.equal(validObservedRange({ from: "2026-01-01", to: "2026-02-01" }), true);
  assert.equal(validObservedRange({ from: "2026-01-01", to: "2026-02-02" }), false);
  assert.equal(validObservedRange({ from: "2024-02-29", to: "2024-02-29" }), true);
  for (const range of [{ from: "2026-02-29", to: "2026-03-01" }, { from: "0000-01-01", to: "0000-01-02" }, { from: "2026-10-07", to: "2026-09-28" }, { from: "", to: "2026-09-28" }, { from: "2026-02-30", to: "2026-03-01" }]) assert.equal(validObservedRange(range), false);
});
test("links preserve validated search and label the fixed sample range through URL", () => {
  assert.equal(validatedSearch("?search=H%C3%B2a+Ph%C3%A1t"), "Hòa Phát");
  for (const query of ["?search=", "?search=%20", "?search=a&search=b", "?search=" + "a".repeat(101)]) assert.equal(validatedSearch(query), null);
  assert.equal(detailHref("FPT", "fixture", "Hòa Phát"), "/stocks/FPT?search=H%C3%B2a+Ph%C3%A1t");
  assert.equal(detailHref("FPT", "observed", null), "/stocks/FPT?source=observed&from=2026-09-28&to=2026-10-07");
});
test("decimal comparison preserves precision beyond floating point without altering prices", () => {
  assert.equal(compareDecimal("100000.00000000000000001", "100000"), 1);
  assert.equal(compareDecimal("9.999999999999999999999999", "10"), -1);
  assert.equal(compareDecimal("0.00001", "0.00002"), -1);
  assert.equal(compareDecimal("100000", "100000"), 0);
  const body = response(); assert.ok(isObservedHistory(body, sampleRange));
  assert.equal(body.data.candles[0].close, "100000.00000000000000001");
  body.data.candles[0].high = "100000";
  assert.equal(isObservedHistory(body, sampleRange), false);
});
test("observed guard accepts empty/single and rejects status/range inconsistency", () => {
  const body = response(); assert.ok(isObservedHistory(body, sampleRange));
  body.data.candles = []; body.meta.status = "no_data"; body.meta.returnedRange = null;
  assert.ok(isObservedHistory(body, sampleRange));
  body.meta.status = "available"; assert.equal(isObservedHistory(body, sampleRange), false);
  const single = response(); single.meta.returnedRange!.to = "2026-10-07"; assert.equal(isObservedHistory(single, sampleRange), false);
  single.meta.returnedRange!.to = "2026-09-28"; single.meta.requestedRange.from = "2026-09-29"; assert.equal(isObservedHistory(single, sampleRange), false);
});
test("guard rejects corrupt identity, provenance, precision, null semantics and extra fields", () => {
  const mutations: ((body: ObservedHistory) => void)[] = [
    body => { body.data.asset.symbol = "VCB" as never; }, body => { body.data.asset.assetType = "index" as never; }, body => { body.data.asset.currency = null as never; },
    body => { body.data.dataset.mode = "fixture" as never; }, body => { body.data.dataset.freshness = "current" as never; }, body => { body.data.dataset.label = "changed" as never; },
    body => { body.data.candles[0].assetId = "VN:HOSE:VCB" as never; }, body => { body.data.candles[0].currency = "USD" as never; }, body => { body.data.candles[0].unit = "index_point" as never; }, body => { body.data.candles[0].timezone = "UTC" as never; },
    body => { body.data.candles[0].adjustmentBasis = "unadjusted" as never; }, body => { body.data.candles[0].source.provider = "VCI" as never; }, body => { body.data.candles[0].source.connectorVersion = "5" as never; },
    body => { body.data.candles[0].volume = 0 as never; }, body => { body.data.candles[0].volumeUnit = "shares" as never; }, body => { body.data.candles[0].sourceAsOf = "2026-09-28T00:00:00Z" as never; }, body => { body.data.candles[0].timeProvenance = "UTC" as never; },
    body => { body.data.candles[0].close = 100000 as never; }, body => { body.data.candles[0].close = "0"; }, body => { body.data.candles[0].low = "100001"; }, body => { body.data.candles[0].high = "99999"; },
    body => { body.data.candles[0].close = "01"; }, body => { body.data.candles[0].close = "1.0"; }, body => { body.data.candles[0].close = "1e5"; }, body => { body.data.candles[0].close = "1".repeat(129); },
    body => { body.data.candles[0].close = "100000\n"; }, body => { body.data.candles[0].open = "99999\r\n"; }, body => { body.data.candles[0].barId = "a".repeat(64) + "\n"; },
    body => { body.data.candles[0].barId = "bad"; }, body => { body.meta.sourceAsOf = "2026-09-28T00:00:00Z" as never; }, body => { body.meta.completeness = "complete" as never; }, body => { body.meta.provider = "VCI" as never; },
    body => { Object.assign(body.data.candles[0], { extra: "unexpected" }); }, body => { Object.assign(body.meta, { asOf: "unexpected" }); },
  ];
  for (const mutate of mutations) { const body = response(); mutate(body); assert.equal(isObservedHistory(body, sampleRange), false, mutate.toString()); }
  for (const body of [null, {}, { data: null }, { data: [], meta: {} }]) assert.equal(isObservedHistory(body, sampleRange), false);
});
test("guard rejects bad timestamps, date ordering/range, and more than 32 bars", () => {
  for (const value of ["2026-02-30 00:00:00", "2026-09-28 24:00:00", "2026-09-28 00:60:00", "2026-09-28 00:00:60", "2026-09-29 00:00:00", "2026-09-28T00:00:00Z", "2026-09-28 00:00:00\n"]) {
    const body = response(); body.data.candles[0].providerTimeLabel = value; assert.equal(isObservedHistory(body, sampleRange), false, value);
  }
  for (const value of ["2026-02-30T00:00:00Z", "2026-09-28T24:00:00Z", "2026-09-28T00:00:60Z", "2026-09-28T00:00:00+07:60", "2026-09-28T00:00:00+24:00", "2026-09-28 00:00:00Z", "2026-09-28T00:00Z", "2026-09-28T00:00:00Z\n", "2026-09-28T00:00:00-00:00", "0001-01-01T00:00:00+00:01", "9999-12-31T23:59:59-00:01"]) {
    const body = response(); body.data.candles[0].collectedAt = value; assert.equal(isObservedHistory(body, sampleRange), false, value);
  }
  const fractional = response(); fractional.data.candles[0].providerTimeLabel = "2026-09-28T00:00:00.123456"; fractional.data.candles[0].collectedAt = "2026-10-08T04:30:00.123456+07:00"; assert.ok(isObservedHistory(fractional, sampleRange));
  for (const dates of [["2026-09-29", "2026-09-28"], ["2026-09-28", "2026-09-28"], ["2026-09-27", "2026-09-28"], ["2026-09-28", "2026-10-08"]]) {
    const body = response(); body.data.candles = series(["100", "110"], dates).map(row => ({ ...row, providerTimeLabel: row.tradingDate + " 00:00:00" }));
    body.meta.returnedRange = { from: dates[0], to: dates[1] }; assert.equal(isObservedHistory(body, sampleRange), false);
  }
  const tooMany = response(); tooMany.data.candles = Array.from({ length: 33 }, () => tooMany.data.candles[0]); assert.equal(isObservedHistory(tooMany, sampleRange), false);
});
test("chart keeps calendar spacing and gaps, empty/single/flat and narrow geometry finite", () => {
  assert.deepEqual(observedChart([]).points, []);
  const single = observedChart(series(["100"])); assert.equal(single.points[0].x, 360); assert.equal(single.segments[0].length, 1);
  const flat = observedChart(series(["100", "100", "100"])); assert.ok(flat.reliable); assert.equal(new Set(flat.points.map(point => point.y)).size, 1);
  const gap = observedChart(series(["100", "110", "120"]), 246);
  assert.ok(gap.reliable); assert.deepEqual(gap.points.map(point => point.x), [32, 77.5, 214]); assert.deepEqual(gap.segments.map(segment => segment.length), [2, 1]); assert.ok(gap.hasGaps);
  assert.ok(gap.points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y)));
});
test("chart hides unreliable number conversion or collapsed distinct prices", () => {
  for (const prices of [["100000.00000000000000001", "100000.00000000000000002"], ["1" + "0".repeat(309)], ["0." + "0".repeat(325) + "1"], ["1", "1.000000000000001", "100000000000000000000"]]) {
    const chart = observedChart(series(prices)); assert.equal(chart.reliable, false, prices.join(",")); assert.equal(chart.points.length, 0);
  }
});
test("fetch uses bounded observed URL, no-store, and validates input before request", async () => {
  const body = response(); const request: typeof fetch = async (url, options) => {
    assert.equal(url, "/api/observed/assets/FPT/history?from=2026-09-28&to=2026-10-07"); assert.equal(options?.cache, "no-store"); assert.equal((options?.headers as Record<string, string>).Accept, "application/json"); return Response.json(body);
  };
  assert.deepEqual(await fetchObservedHistory("FPT", sampleRange, new AbortController().signal, request), body);
  for (const [symbol, range] of [["VCB", sampleRange], ["FPT", { from: "2026-01-01", to: "2026-02-02" }]] as const)
    await assert.rejects(fetchObservedHistory(symbol, range, new AbortController().signal, async () => { throw new Error("Must not fetch"); }), error => error instanceof ObservedError && error.kind === "invalid");
});
test("fetch distinguishes errors, 404 wording does not guess flag status, cancellation and timeout", async () => {
  const cases: [typeof fetch, string][] = [[async () => new Response(null, { status: 400 }), "invalid"], [async () => new Response(null, { status: 404 }), "missing"], [async () => new Response(null, { status: 503 }), "unavailable"], [async () => new Response("bad json"), "response"], [async () => Response.json({}), "response"], [async () => { throw new TypeError("offline"); }, "network"]];
  for (const [request, kind] of cases) await assert.rejects(fetchObservedHistory("FPT", sampleRange, new AbortController().signal, request), error => error instanceof ObservedError && error.kind === kind);
  assert.equal(observedErrorMessage(new ObservedError("missing")), "Dữ liệu đã lưu chưa khả dụng cho mã này.");
  const waiting: typeof fetch = async (_url, options) => new Promise((_resolve, reject) => { const signal = options?.signal; if (signal?.aborted) reject(signal.reason); else signal?.addEventListener("abort", () => reject(signal.reason), { once: true }); });
  await assert.rejects(fetchObservedHistory("FPT", sampleRange, new AbortController().signal, waiting, 5), error => error instanceof ObservedError && error.kind === "timeout");
  const controller = new AbortController(); const pending = fetchObservedHistory("FPT", sampleRange, controller.signal, waiting); controller.abort(); await assert.rejects(pending, error => error instanceof DOMException && error.name === "AbortError");
});
