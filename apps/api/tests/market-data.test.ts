import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { createFixtureMarketDataProvider } from "../src/fixture-market-data-provider.js";

const fixture = JSON.parse(await (await import("node:fs/promises")).readFile(
  new URL("../../../fixtures/market/mp-02-synthetic.json", import.meta.url), "utf8",
)) as {
  dataset: { label: string; freshness: string };
  assets: Array<{ symbol: string; assetId: string }>;
  candles: Array<Record<string, unknown> & { assetId: string; tradingDate: string }>;
};

test("fixture provider returns the exact FPT canonical records and provenance", async () => {
  const provider = createFixtureMarketDataProvider();
  const result = await provider.getDailyHistory({ symbol: "FPT", interval: "1d", range: { from: null, to: null } });
  const asset = fixture.assets.find((item) => item.symbol === "FPT");
  const candles = fixture.candles.filter((item) => item.assetId === asset?.assetId);

  assert.equal(provider.ready, true);
  assert.deepEqual(result?.asset, asset);
  assert.deepEqual(result?.candles, candles);
  assert.deepEqual(result?.dataset, fixture.dataset);
  assert.deepEqual(result?.availableRange, { from: "2026-09-21", to: "2026-09-23" });
  assert.ok(result?.candles.every((candle) => (candle.source as { provider: string }).provider === "marketpulse-fixture"));
});

test("fixture provider preserves the VNINDEX null volume observation", async () => {
  const provider = createFixtureMarketDataProvider();
  const result = await provider.getDailyHistory({ symbol: "VNINDEX", interval: "1d", range: { from: null, to: null } });

  assert.equal(result?.asset.currency, null);
  assert.equal(result?.asset.unit, "index_point");
  assert.equal(result?.candles.length, 3);
  assert.ok(result?.candles.every((candle) => candle.volume === null && candle.volumeUnit === "not_available"));
});

test("mutating one result cannot change later fixture reads", async () => {
  const provider = createFixtureMarketDataProvider();
  const request = { symbol: "FPT", interval: "1d" as const, range: { from: null, to: null } };
  const first = await provider.getDailyHistory(request);
  assert.ok(first);
  first.asset.symbol = "CHANGED";
  first.dataset.label = "changed";
  first.candles[0]!.source.recordId = "changed";

  const second = await provider.getDailyHistory(request);
  assert.equal(second?.asset.symbol, "FPT");
  assert.equal(second?.dataset.label, "SYNTHETIC FIXTURE — NOT MARKET DATA");
  assert.equal(second?.candles[0]?.source.recordId, "synthetic-FPT-2026-09-21");
});

test("missing fixture errors are sanitized and keep the provider unready", async () => {
  const unavailablePath = join(tmpdir(), "market-pulse-fixture-that-does-not-exist.json");
  const provider = createFixtureMarketDataProvider(pathToFileURL(unavailablePath));

  await assert.rejects(provider.initialize(), (error: unknown) => (
    error instanceof Error
    && error.message === "Market data is unavailable."
    && !error.message.includes(unavailablePath)
  ));
  assert.equal(provider.ready, false);
});

test("malformed local fixture shape fails closed without exposing its path", async () => {
  const directory = await mkdtemp(join(tmpdir(), "market-pulse-fixture-"));
  const fixturePath = join(directory, "malformed.json");
  await writeFile(fixturePath, JSON.stringify({ schemaVersion: "9.9.9" }), "utf8");
  try {
    const provider = createFixtureMarketDataProvider(pathToFileURL(fixturePath));
    await assert.rejects(provider.initialize(), (error: unknown) => (
      error instanceof Error
      && error.message === "Market data is unavailable."
      && !error.message.includes(fixturePath)
    ));
    assert.equal(provider.ready, false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
