import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createFixtureMarketDataProvider } from "../src/fixture-market-data-provider.js";
import { createApp, type HealthChecks } from "../src/health.js";
import { createDailyHistoryRouter } from "../src/daily-history.js";
import type { AssetCatalogProvider, CanonicalAsset, MarketDataProvider } from "../src/market-data.js";
import { createStockSearchRouter, StockSearchService } from "../src/stock-search.js";
import { STOCK_REFERENCE_CATALOG, type StockReferenceEntry } from "../src/stock-reference-catalog.js";

const checks: HealthChecks = { mongo: async () => true, redis: async () => true };
const fixture = JSON.parse(await readFile(
  new URL("../../../fixtures/market/mp-02-synthetic.json", import.meta.url),
  "utf8",
)) as { assets: CanonicalAsset[] };

async function withServer(
  run: (baseUrl: string) => Promise<void>,
  options: {
    provider?: MarketDataProvider & AssetCatalogProvider;
    service?: StockSearchService;
    initializeSearch?: boolean;
  } = {},
): Promise<void> {
  const provider = options.provider ?? createFixtureMarketDataProvider();
  const service = options.service ?? new StockSearchService(provider);
  if (options.initializeSearch !== false && !service.ready) await service.initialize();
  const server: Server = createServer(createApp({
    checks,
    applicationReady: () => service.ready,
    stockSearchRouter: createStockSearchRouter(service),
    dailyHistoryRouter: createDailyHistoryRouter(provider),
  }));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server did not bind a TCP port");
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

function canonicalEquity(symbol: string): CanonicalAsset {
  return {
    assetId: `VN:HOSE:${symbol}`,
    symbol,
    assetType: "equity",
    exchange: "HOSE",
    currency: "VND",
    unit: "VND",
    timezone: "Asia/Ho_Chi_Minh",
  };
}

test("fixture asset reads preserve the canonical fixture and return isolated copies", async () => {
  const provider = createFixtureMarketDataProvider();
  const first = await provider.getAssets();
  assert.deepEqual(first, fixture.assets);
  assert.equal(first.filter((asset) => asset.assetType === "equity").length, 10);
  assert.ok(first.some((asset) => asset.symbol === "VNINDEX" && asset.assetType === "index"));
  first[0]!.symbol = "CHANGED";
  assert.deepEqual(await provider.getAssets(), fixture.assets);
});

test("search returns only joined canonical equities with reference provenance and no market as-of", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/assets/search?q=fpt`);
    const body = await response.json();
    const canonicalFpt = fixture.assets.find((asset) => asset.symbol === "FPT");

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(body.data[0].asset, canonicalFpt);
    assert.equal(body.data[0].companyName, "Công ty Cổ phần FPT");
    assert.deepEqual(body.data[0].aliases, ["FPT"]);
    assert.deepEqual(body.data[0].reference, {
      officialSources: ["https://fpt.com/vi/nha-dau-tu/thong-tin-co-phieu"],
      reviewedOn: "2026-09-29",
    });
    assert.deepEqual(body.meta, {
      scope: "fixture equities",
      dataset: "fixture / unknown",
      label: "SYNTHETIC FIXTURE — NOT MARKET DATA",
      provider: "marketpulse-fixture",
      asOf: null,
    });
    assert.ok(body.data.every((result: { asset: CanonicalAsset }) => (
      result.asset.assetType === "equity"
      && fixture.assets.some((asset) => asset.assetId === result.asset.assetId)
    )));
    assert.ok(body.data.every((result: { asset: CanonicalAsset }) => result.asset.symbol !== "VNINDEX"));
  });
});

test("search matches symbols, company names, aliases and Vietnamese text independent of accents", async () => {
  await withServer(async (baseUrl) => {
    const cases = [
      ["fPt", "FPT"],
      ["Vietcombank", "VCB"],
      ["NGÂN HÀNG TMCP NGOẠI THƯƠNG VIỆT NAM", "VCB"],
      ["Hoà Phát", "HPG"],
      ["dau tu", "BID"],
      ["Đầu tư", "BID"],
      ["Thế Giới Di Động", "MWG"],
    ] as const;
    for (const [query, symbol] of cases) {
      const response = await fetch(`${baseUrl}/api/assets/search?q=${encodeURIComponent(query)}`);
      const body = await response.json();
      assert.equal(response.status, 200, query);
      assert.ok(body.data.some((result: { asset: CanonicalAsset }) => result.asset.symbol === symbol), query);
    }
  });
});

test("search query text is literal and unknown queries return an empty list", async () => {
  await withServer(async (baseUrl) => {
    for (const query of [".*", "[FPT]", "not-a-company", "VNINDEX"]) {
      const response = await fetch(`${baseUrl}/api/assets/search?q=${encodeURIComponent(query)}`);
      const body = await response.json();
      assert.equal(response.status, 200, query);
      assert.deepEqual(body.data, [], query);
    }
  });
});

test("search ranks exact symbol, symbol prefix, then other literal matches alphabetically", async () => {
  const symbols = ["BA", "AZ", "A", "AB", "CA", "DA", "EA", "FA", "GA", "HA"];
  const provider: AssetCatalogProvider & { getDailyHistory: () => Promise<never> } = {
    getAssets: async () => symbols.map(canonicalEquity),
    getDailyHistory: async () => { throw new Error("history must not be requested by search"); },
  };
  const catalog = [...symbols].reverse().map((symbol): StockReferenceEntry => ({
    symbol,
    companyName: `Company ${symbol}`,
    aliases: [`Alias ${symbol}`],
    officialSources: [`https://example.com/${symbol}`],
    reviewedOn: "2026-09-29",
  }));
  const service = new StockSearchService(provider, catalog);
  await service.initialize();
  const results = service.search("a");
  assert.deepEqual(results.map((result) => result.asset.symbol), ["A", "AB", "AZ", "BA", "CA", "DA", "EA", "FA", "GA", "HA"]);
});

test("search reads the cached asset catalog once and returns mutation-isolated results", async () => {
  let assetReads = 0;
  let historyReads = 0;
  const provider: AssetCatalogProvider & { getDailyHistory: () => Promise<null> } = {
    getAssets: async () => {
      assetReads += 1;
      return structuredClone(fixture.assets);
    },
    getDailyHistory: async () => {
      historyReads += 1;
      return null;
    },
  };
  const service = new StockSearchService(provider);
  await service.initialize();
  const first = service.search("FPT");
  first[0]!.asset.symbol = "CHANGED";
  first[0]!.reference.officialSources.push("https://example.com/changed");
  const second = service.search("FPT");

  assert.equal(assetReads, 1);
  assert.equal(historyReads, 0);
  assert.equal(second[0]?.asset.symbol, "FPT");
  assert.deepEqual(second[0]?.reference.officialSources, ["https://fpt.com/vi/nha-dau-tu/thong-tin-co-phieu"]);
});

test("search rejects missing, blank, duplicate, nested, unknown, overlong and normalized-empty q values", async () => {
  await withServer(async (baseUrl) => {
    const invalid = [
      "/api/assets/search",
      "/api/assets/search?q=",
      "/api/assets/search?q=%20%09",
      "/api/assets/search?q=A&q=B",
      "/api/assets/search?q%5B%5D=A",
      "/api/assets/search?q=A&debug=1",
      `/api/assets/search?q=${"A".repeat(101)}`,
      "/api/assets/search?q=%CC%81",
      "/api/assets/search?q=%CC%81%20%20",
    ];
    for (const path of invalid) {
      const response = await fetch(`${baseUrl}${path}`);
      assert.equal(response.status, 400, path);
      assert.equal(response.headers.get("cache-control"), "no-store", path);
      assert.deepEqual(await response.json(), { error: "invalid_query" }, path);
    }
    const maxLength = await fetch(`${baseUrl}/api/assets/search?q=${"x".repeat(100)}`);
    assert.equal(maxLength.status, 200);
    assert.deepEqual((await maxLength.json()).data, []);
  });
});

test("search result symbol remains directly usable by canonical history without altering history", async () => {
  await withServer(async (baseUrl) => {
    const before = await fetch(`${baseUrl}/api/assets/HPG/history`).then((response) => response.json());
    const search = await fetch(`${baseUrl}/api/assets/search?q=H%C3%B2a%20Ph%C3%A1t`).then((response) => response.json());
    const symbol = search.data[0].asset.symbol;
    const after = await fetch(`${baseUrl}/api/assets/${symbol}/history`).then((response) => response.json());
    assert.equal(symbol, "HPG");
    assert.deepEqual(after, before);
  });
});

test("catalog duplicates or fixture coverage mismatches fail closed", async () => {
  const provider: AssetCatalogProvider = { getAssets: async () => structuredClone(fixture.assets) };
  const duplicateCatalog = STOCK_REFERENCE_CATALOG.map((entry) => ({ ...entry }));
  duplicateCatalog[1] = { ...duplicateCatalog[1]!, symbol: duplicateCatalog[0]!.symbol };
  const cases = [
    new StockSearchService(provider, duplicateCatalog),
    new StockSearchService({
      getAssets: async () => fixture.assets.filter((asset) => asset.symbol !== "FPT"),
    }),
  ];
  for (const service of cases) {
    await assert.rejects(service.initialize(), (error: unknown) => (
      error instanceof Error && error.message === "Stock search is unavailable."
    ));
    assert.equal(service.ready, false);
  }
});

test("unavailable search provider returns a sanitized no-store response and readiness stays false", async () => {
  const secret = "E:/private/catalog-path.json";
  const provider: MarketDataProvider & AssetCatalogProvider = {
    getAssets: async () => { throw new Error(secret); },
    getDailyHistory: async () => null,
  };
  const service = new StockSearchService(provider);
  await assert.rejects(service.initialize(), (error: unknown) => (
    error instanceof Error && error.message === "Stock search is unavailable." && !error.message.includes(secret)
  ));
  await withServer(async (baseUrl) => {
    const [ready, response] = await Promise.all([
      fetch(`${baseUrl}/health/ready`),
      fetch(`${baseUrl}/api/assets/search?q=FPT`),
    ]);
    const body = await response.text();
    assert.equal(ready.status, 503);
    assert.deepEqual(await ready.json(), { status: "not_ready" });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(JSON.parse(body), { error: "asset_search_unavailable" });
    assert.equal(body.includes(secret), false);
  }, { provider, service, initializeSearch: false });
});
