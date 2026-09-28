import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import test from "node:test";
import { createDailyHistoryRouter } from "../src/daily-history.js";
import { createFixtureMarketDataProvider } from "../src/fixture-market-data-provider.js";
import { createApp, type HealthChecks } from "../src/health.js";
import type { MarketDataProvider } from "../src/market-data.js";

const checks: HealthChecks = { mongo: async () => true, redis: async () => true };
const fixture = JSON.parse(await (await import("node:fs/promises")).readFile(
  new URL("../../../fixtures/market/mp-02-synthetic.json", import.meta.url), "utf8",
)) as {
  dataset: Record<string, unknown>;
  assets: Array<Record<string, unknown> & { symbol: string; assetId: string }>;
  candles: Array<Record<string, unknown> & { assetId: string; tradingDate: string }>;
};

async function withServer(
  run: (baseUrl: string) => Promise<void>,
  options: { provider?: MarketDataProvider; applicationReady?: () => boolean } = {},
): Promise<void> {
  const provider = options.provider ?? createFixtureMarketDataProvider();
  const server: Server = createServer(createApp({
    checks,
    applicationReady: options.applicationReady,
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

test("public FPT history returns an exact canonical fixture subset and honest metadata", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/assets/fpt/history`);
    const body = await response.json();
    const asset = fixture.assets.find((item) => item.symbol === "FPT");
    const candles = fixture.candles.filter((item) => item.assetId === asset?.assetId);

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(body.data, {
      schemaVersion: "1.0.0",
      dataset: fixture.dataset,
      assets: [asset],
      candles,
      quotes: [],
      indexObservations: [],
    });
    assert.deepEqual(body.meta, {
      status: "available",
      provider: "marketpulse-fixture",
      interval: "1d",
      requestedRange: { from: null, to: null },
      availableRange: { from: "2026-09-21", to: "2026-09-23" },
      asOf: "2026-09-23T15:00:00+07:00",
    });
  });
});

test("history bounds include both requested dates and preserve the full available range", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/assets/FPT/history?from=2026-09-22&to=2026-09-23`);
    const body = await response.json();
    const asset = fixture.assets.find((item) => item.symbol === "FPT");
    const candles = fixture.candles.filter((item) => item.assetId === asset?.assetId && item.tradingDate >= "2026-09-22");

    assert.equal(response.status, 200);
    assert.deepEqual(body.data.candles, candles);
    assert.deepEqual(body.meta.requestedRange, { from: "2026-09-22", to: "2026-09-23" });
    assert.equal(body.meta.asOf, "2026-09-23T15:00:00+07:00");
    assert.equal(body.meta.availableRange.from, "2026-09-21");
  });
});

test("to-only history bounds set asOf to the latest returned candle", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/assets/FPT/history?to=2026-09-21`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.data.candles.length, 1);
    assert.equal(body.data.candles[0].tradingDate, "2026-09-21");
    assert.deepEqual(body.meta.requestedRange, { from: null, to: "2026-09-21" });
    assert.equal(body.meta.asOf, "2026-09-21T15:00:00+07:00");
  });
});

test("no matching dates return a known asset with empty candles and null asOf", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/assets/FPT/history?from=2026-09-24&to=2026-09-24`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.meta.status, "no_data");
    assert.equal(body.data.assets[0].symbol, "FPT");
    assert.deepEqual(body.data.candles, []);
    assert.equal(body.meta.asOf, null);
    assert.deepEqual(body.meta.availableRange, { from: "2026-09-21", to: "2026-09-23" });
  });
});

test("VNINDEX history preserves null volume and non-currency units", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/assets/VNINDEX/history`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.data.assets[0].currency, null);
    assert.equal(body.data.assets[0].unit, "index_point");
    assert.ok(body.data.candles.every((candle: { volume: number | null; volumeUnit: string }) => candle.volume === null && candle.volumeUnit === "not_available"));
  });
});

test("optional query fields work independently and default to daily history", async () => {
  await withServer(async (baseUrl) => {
    const expectedCounts = new Map([["", 3], ["?interval=1d", 3], ["?from=2026-09-22", 2], ["?to=2026-09-22", 2]]);
    for (const [suffix, count] of expectedCounts) {
      const response = await fetch(`${baseUrl}/api/assets/FPT/history${suffix}`);
      assert.equal(response.status, 200, suffix || "no query");
      const body = await response.json();
      assert.equal(body.data.candles.length, count, suffix || "no query");
    }
  });
});

test("unknown symbols return 404 after case normalization", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/assets/NOPE/history`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "asset_not_found" });
  });
});

test("unsupported, repeated, nested, unknown, reversed and invalid date queries return 400", async () => {
  await withServer(async (baseUrl) => {
    const invalid = [
      "?interval=5m",
      "?from=2026-02-29",
      "?from=2024-02-30",
      "?from=0000-01-01",
      "?from=2026-09-23&to=2026-09-22",
      "?from=2026-09-21&from=2026-09-22",
      "?from%5Bday%5D=2026-09-21",
      "?other=1",
      "?interval=",
    ];
    for (const suffix of invalid) {
      const response = await fetch(`${baseUrl}/api/assets/FPT/history${suffix}`);
      assert.equal(response.status, 400, suffix);
      assert.deepEqual(await response.json(), { error: "invalid_query" }, suffix);
    }
    assert.equal((await fetch(`${baseUrl}/api/assets/FPT/history?from=2024-02-29`)).status, 200);
  });
});

test("unsafe or overlong symbols return 400", async () => {
  await withServer(async (baseUrl) => {
    for (const symbol of ["%24FPT", `${"A".repeat(33)}`]) {
      const response = await fetch(`${baseUrl}/api/assets/${symbol}/history`);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: "invalid_symbol" });
    }
  });
});

test("provider failures return a sanitized error", async () => {
  const provider = {
    getDailyHistory: async () => { throw new Error("private path E:/secret/fixture.json"); },
  };
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/assets/FPT/history`);
    const body = await response.text();
    assert.equal(response.status, 503);
    assert.deepEqual(JSON.parse(body), { error: "market_data_unavailable" });
    assert.equal(body.includes("E:/secret/fixture.json"), false);
  }, { provider });
});

test("missing fixture keeps readiness false and history unavailable without leaking its path", async () => {
  const privatePath = "E:/private/market-fixture.json";
  const provider = createFixtureMarketDataProvider(new URL("file:///E:/private/market-fixture.json"));
  await assert.rejects(provider.initialize());
  await withServer(async (baseUrl) => {
    const [readyResponse, historyResponse] = await Promise.all([
      fetch(`${baseUrl}/health/ready`),
      fetch(`${baseUrl}/api/assets/FPT/history`),
    ]);
    const historyBody = await historyResponse.text();
    assert.equal(readyResponse.status, 503);
    assert.deepEqual(await readyResponse.json(), { status: "not_ready" });
    assert.equal(historyResponse.status, 503);
    assert.deepEqual(JSON.parse(historyBody), { error: "market_data_unavailable" });
    assert.equal(historyBody.includes(privatePath), false);
  }, { provider, applicationReady: () => provider.ready });
});
