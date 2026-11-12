import assert from "node:assert/strict";
import test from "node:test";
import { detailHref, detailMode, searchReturnHref } from "../src/observed-detail.js";
import { fetchSearch, isObservedSearchResponse, isSearchResponse, searchHref, searchSource, type SearchResponse } from "../src/stock-search.js";

function response(): SearchResponse {
  return {
    data: [{ asset: { assetId: "VN:HOSE:FPT", symbol: "FPT", assetType: "equity", currency: "VND", unit: "VND", timezone: "Asia/Ho_Chi_Minh" }, companyName: "Công ty Cổ phần FPT", aliases: ["FPT"],
      reference: { origin: "curated_reference", officialSources: ["https://fpt.com/vi/nha-dau-tu/thong-tin-co-phieu"], reviewedOn: "2026-09-29" } }],
    meta: { scope: "stored observed equities", label: "STORED OBSERVED ASSET CATALOG — COVERAGE LIMITED TO FPT", provider: "KBS",
      dataset: { mode: "observed", label: "OBSERVED KBS DAILY CANDLES — FRESHNESS UNKNOWN", freshness: "unknown", sessionCalendar: "unverified" }, sourceAsOf: null, collectedAt: null, freshness: "unknown", coverage: ["FPT"], availability: "catalog_only", assetOrigin: "stored_observed_asset" },
  };
}

test("observed response requires catalog-only provenance, covered symbols and separate curated attribution", () => {
  const body = response(); assert(isObservedSearchResponse(body)); assert(!isSearchResponse(response()));
  assert(isObservedSearchResponse({ ...body, data: [], meta: { ...body.meta, dataset: null } }));
  assert(isObservedSearchResponse({
    data: [...body.data, { asset: { assetId: "VN:HOSE:VCB", symbol: "VCB", assetType: "equity", currency: "VND", unit: "VND", timezone: "Asia/Ho_Chi_Minh" }, companyName: "Vietcombank", aliases: ["VCB"],
      hasData: false,
      reference: { origin: "curated_reference", officialSources: ["https://vietcombank.com.vn"], reviewedOn: "2026-09-29" } }],
    meta: { ...body.meta, label: "STORED OBSERVED ASSET CATALOG — COVERAGE LIMITED TO FPT, VCB", coverage: ["FPT", "VCB"] },
  }));
  assert(isObservedSearchResponse({
    data: [{ asset: { assetId: "VN:HOSE:VCB", symbol: "VCB", assetType: "equity", currency: "VND", unit: "VND", timezone: "Asia/Ho_Chi_Minh" }, companyName: "Vietcombank", aliases: ["VCB"],
      hasData: false,
      reference: { origin: "curated_reference", officialSources: ["https://vietcombank.com.vn"], reviewedOn: "2026-09-29" } }],
    meta: { ...body.meta, label: "STORED OBSERVED ASSET CATALOG — COVERAGE LIMITED TO FPT, VCB", coverage: ["FPT", "VCB"], dataset: null },
  }));
  assert(!isObservedSearchResponse({
    data: [{ ...body.data[0], hasData: true }],
    meta: { ...body.meta, dataset: null },
  }));
  for (const mutate of [
    (value: SearchResponse) => { value.data[0].asset.symbol = "VCB"; },
    (value: SearchResponse) => { value.data[0].asset.exchange = "HOSE"; },
    (value: SearchResponse) => { delete value.data[0].reference.origin; },
    (value: SearchResponse) => { value.data[0].reference.officialSources = ["javascript:alert(1)"]; },
    (value: SearchResponse) => { value.data.push(value.data[0]); },
    (value: SearchResponse) => { Object.assign(value.meta, { sourceAsOf: "2026-11-04", freshness: "fresh" }); },
    (value: SearchResponse) => { Object.assign(value.meta, { collectedAt: "2026-11-04T00:00:00Z" }); },
    (value: SearchResponse) => { Object.assign(value.meta, { dataset: null }); },
    (value: SearchResponse) => { Object.assign(value.meta, { coverage: ["FPT", "VCB"] }); },
  ]) { const value = response(); mutate(value); assert(!isObservedSearchResponse(value)); }
});

test("source and query survive reload URLs and independent detail source toggles", () => {
  assert.equal(searchSource(""), "fixture"); assert.equal(searchSource("?source=observed"), "observed");
  for (const query of ["?source=unknown", "?source=observed&source=fixture", "?source="]) assert.equal(searchSource(query), null);
  const href = searchHref("Cổ phần FPT", "observed"); assert.equal(new URL(href, "http://localhost").searchParams.get("q"), "Cổ phần FPT");
  const detail = detailHref("FPT", "observed", "Cổ phần FPT", undefined, "observed");
  const parameters = new URL(detail, "http://localhost").search;
  assert.equal(detailMode(parameters, "FPT").kind, "latest"); assert.equal(searchReturnHref(parameters), href);
  const fixtureDetail = detailHref("FPT", "fixture", "Cổ phần FPT", undefined, "observed");
  assert.equal(detailMode(new URL(fixtureDetail, "http://localhost").search, "FPT").kind, "fixture");
  assert.equal(searchReturnHref(new URL(fixtureDetail, "http://localhost").search), href);
  assert.equal(searchReturnHref("?searchSource=observed"), "/?source=observed");
  assert.equal(detailMode(`${parameters}&searchSource=fixture`, "FPT").kind, "invalid");
});

test("observed fetch uses only same-origin catalog endpoint and rejects fixture substitution", async () => {
  let calls = 0;
  const request: typeof fetch = async (input, options) => {
    calls++; assert.equal(input, "/api/observed/assets/search?q=C%E1%BB%95%20ph%E1%BA%A7n%20FPT");
    assert.equal(options?.cache, "no-store"); return Response.json(response());
  };
  const result = await fetchSearch("Cổ phần FPT", new AbortController().signal, request, 1000, "observed");
  assert.equal(result.data[0].asset.symbol, "FPT"); assert.equal(calls, 1);
  for (const status of [404, 503]) {
    calls = 0;
    await assert.rejects(fetchSearch("FPT", new AbortController().signal, async () => { calls++; return new Response("", { status }); }, 1000, "observed"));
    assert.equal(calls, 1);
  }
  await assert.rejects(fetchSearch("FPT", new AbortController().signal, async () => Response.json({ data: [], meta: { scope: "fixture equities" } }), 1000, "observed"));
});
