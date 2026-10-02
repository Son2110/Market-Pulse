import assert from "node:assert/strict";
import test from "node:test";
import { fetchSearch, isSearchResponse, queryError, SearchError } from "../src/stock-search.js";

function response() {
  return {
    data: ["VHM", "VIC", "VNM"].map((symbol) => ({
      asset: { assetId: `VN:HOSE:${symbol}`, symbol, assetType: "equity", exchange: "HOSE", currency: "VND", unit: "VND", timezone: "Asia/Ho_Chi_Minh" },
      companyName: `Tên ${symbol}`, aliases: [],
      reference: { officialSources: ["https://example.com/source"], reviewedOn: "2026-09-29" },
    })),
    meta: { scope: "fixture equities", dataset: "fixture / unknown", label: "SYNTHETIC FIXTURE — NOT MARKET DATA", provider: "marketpulse-fixture", asOf: null },
  };
}

test("query validation uses Unicode codepoints before normalization", () => {
  for (const query of ["", " \t\n", "\u0301 \u0300"]) assert.ok(queryError(query));
  assert.equal(queryError("😀".repeat(100)), null);
  assert.ok(queryError("😀".repeat(101)));
  assert.ok(queryError(" ".repeat(100) + "FPT"));
  assert.equal(queryError("Hòa Phát"), null);
});

test("response guard retains API order, exact names and empty results", () => {
  const body = response();
  assert.ok(isSearchResponse(body));
  assert.deepEqual(body.data.map((item) => item.asset.symbol), ["VHM", "VIC", "VNM"]);
  assert.equal(body.data[0].companyName, "Tên VHM");
  assert.ok(isSearchResponse({ ...body, data: [] }));
});

test("response guard rejects unsupported provenance, asset mismatches and malformed dates", () => {
  for (const mutate of [
    (body: ReturnType<typeof response>) => { body.meta.asOf = "2026-09-29" as never; },
    (body: ReturnType<typeof response>) => { body.meta.provider = "live"; },
    (body: ReturnType<typeof response>) => { body.data[0].asset.currency = "USD"; },
    (body: ReturnType<typeof response>) => { body.data[0].asset.assetId = "VN:HOSE:WRONG"; },
    (body: ReturnType<typeof response>) => { body.data[0].reference.reviewedOn = "2026-02-30"; },
    (body: ReturnType<typeof response>) => { body.data[0].companyName = " "; },
    (body: ReturnType<typeof response>) => { body.data.push(body.data[0]); },
  ]) {
    const body = response();
    mutate(body);
    assert.equal(isSearchResponse(body), false);
  }
  for (const body of [null, {}, { data: null, meta: {} }]) assert.equal(isSearchResponse(body), false);
});

test("response guard accepts HTTPS links and rejects unsafe or invalid source URLs", () => {
  for (const source of ["javascript:alert(1)", "http://example.com", "//example.com", "not a url", "https://user:password@example.com"]) {
    const body = response();
    body.data[0].reference.officialSources = [source];
    assert.equal(isSearchResponse(body), false);
  }
  const body = response();
  body.data[0].reference.officialSources = [];
  assert.equal(isSearchResponse(body), false);
});

test("request encodes query and uses same-origin URL and no-store", async () => {
  const body = response();
  const request: typeof fetch = async (url, options) => {
    assert.equal(url, "/api/assets/search?q=H%C3%B2a%20%26%20Ph%C3%A1t");
    assert.equal(options?.cache, "no-store");
    return Response.json(body);
  };
  assert.deepEqual(await fetchSearch("Hòa & Phát", new AbortController().signal, request), body);
});

test("request classifies invalid query, unavailable, malformed and network failures", async () => {
  const cases: [typeof fetch, string][] = [
    [async () => new Response(null, { status: 400 }), "invalid"],
    [async () => new Response(null, { status: 503 }), "unavailable"],
    [async () => Response.json({ data: [] }), "response"],
    [async () => new Response("invalid JSON"), "response"],
    [async () => { throw new TypeError("network"); }, "network"],
  ];
  for (const [request, kind] of cases) {
    await assert.rejects(fetchSearch("FPT", new AbortController().signal, request), (error) => error instanceof SearchError && error.kind === kind);
  }
});

const waitingRequest: typeof fetch = async (_url, options) => new Promise((_resolve, reject) => {
  const signal = options?.signal;
  if (signal?.aborted) reject(signal.reason);
  else signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
});

test("request bounds pending fetches with a finite timeout", async () => {
  await assert.rejects(fetchSearch("FPT", new AbortController().signal, waitingRequest, 5), (error) => error instanceof SearchError && error.kind === "timeout");
});

test("caller cancellation propagates independently of timeout errors", async () => {
  const controller = new AbortController();
  const pending = fetchSearch("FPT", controller.signal, waitingRequest);
  controller.abort();
  await assert.rejects(pending, (error) => error instanceof DOMException && error.name === "AbortError");
});
