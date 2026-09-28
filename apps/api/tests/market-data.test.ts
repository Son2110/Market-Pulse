import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { createFixtureMarketDataProvider } from "../src/fixture-market-data-provider.js";

const fixtureSource = await readFile(new URL("../../../fixtures/market/mp-02-synthetic.json", import.meta.url), "utf8");
const fixture = JSON.parse(fixtureSource) as {
  dataset: { label: string; freshness: string };
  assets: Array<Record<string, unknown> & { symbol: string; assetId: string }>;
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

test("duplicate candle identities fail closed when record id or OHLC differs", async () => {
  const firstFptCandle = fixture.candles.find((candle) => candle.assetId === "VN:HOSE:FPT");
  assert.ok(firstFptCandle);
  const source = firstFptCandle.source as { provider: string; mode: string; recordId: string };
  const duplicateVariants = [
    {
      name: "record-id",
      candle: {
        ...structuredClone(firstFptCandle),
        source: { ...source, recordId: `${source.recordId}-duplicate` },
      },
    },
    {
      name: "ohlc",
      candle: { ...structuredClone(firstFptCandle), high: (firstFptCandle.high as number) + 1 },
    },
  ];
  const directory = await mkdtemp(join(tmpdir(), "market-pulse-duplicate-candle-"));

  try {
    for (const variant of duplicateVariants) {
      const invalidFixture = structuredClone(fixture);
      invalidFixture.candles.push(variant.candle);
      const fixturePath = join(directory, `${variant.name}.json`);
      await writeFile(fixturePath, JSON.stringify(invalidFixture), "utf8");
      const provider = createFixtureMarketDataProvider(pathToFileURL(fixturePath));
      const isSanitizedUnavailable = (error: unknown) => (
        error instanceof Error
        && error.message === "Market data is unavailable."
        && !error.message.includes(fixturePath)
      );

      await assert.rejects(provider.initialize(), isSanitizedUnavailable);
      assert.equal(provider.ready, false);
      await assert.rejects(provider.getDailyHistory({
        symbol: "FPT",
        interval: "1d",
        range: { from: null, to: null },
      }), isSanitizedUnavailable);
      assert.equal(provider.ready, false);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("candle identity allows separate adjustment bases, assets, and dates", async () => {
  const expandedFixture = structuredClone(fixture);
  const firstFptCandle = expandedFixture.candles.find((candle) => candle.assetId === "VN:HOSE:FPT");
  const fptAsset = expandedFixture.assets.find((asset) => asset.assetId === "VN:HOSE:FPT");
  assert.ok(firstFptCandle);
  assert.ok(fptAsset);
  const source = firstFptCandle.source as { provider: string; mode: string; recordId: string };
  const alternateAsset = { ...fptAsset, assetId: "VN:HOSE:TST", symbol: "TST" };
  expandedFixture.assets.push(alternateAsset);

  const differentBasis = structuredClone(firstFptCandle);
  differentBasis.adjustmentBasis = "split_adjusted";
  differentBasis.source = { ...source, recordId: `${source.recordId}-split-adjusted` };

  const differentDate = structuredClone(firstFptCandle);
  differentDate.tradingDate = "2026-09-20";
  differentDate.asOf = "2026-09-20T15:00:00+07:00";
  differentDate.ingestedAt = "2026-09-20T15:05:00+07:00";
  differentDate.source = { ...source, recordId: `${source.recordId}-different-date` };

  const differentAsset = structuredClone(firstFptCandle);
  differentAsset.assetId = alternateAsset.assetId;
  differentAsset.source = { ...source, recordId: `${source.recordId}-different-asset` };
  expandedFixture.candles.push(differentBasis, differentDate, differentAsset);
  expandedFixture.candles.sort((left, right) => (
    left.assetId.localeCompare(right.assetId)
    || left.tradingDate.localeCompare(right.tradingDate)
    || String(left.adjustmentBasis).localeCompare(String(right.adjustmentBasis))
  ));

  const directory = await mkdtemp(join(tmpdir(), "market-pulse-distinct-candle-"));
  const fixturePath = join(directory, "distinct-identities.json");

  try {
    await writeFile(fixturePath, JSON.stringify(expandedFixture), "utf8");
    const provider = createFixtureMarketDataProvider(pathToFileURL(fixturePath));
    await provider.initialize();
    assert.equal(provider.ready, true);

    const fptHistory = await provider.getDailyHistory({
      symbol: "FPT",
      interval: "1d",
      range: { from: null, to: null },
    });
    assert.equal(fptHistory?.candles.length, 5);
    assert.ok(fixture.candles
      .filter((candle) => candle.assetId === "VN:HOSE:FPT")
      .every((original) => fptHistory?.candles.some((candle) => JSON.stringify(candle) === JSON.stringify(original))));
    assert.ok(fptHistory?.candles.some((candle) => candle.adjustmentBasis === "split_adjusted"));
    assert.ok(fptHistory?.candles.some((candle) => candle.tradingDate === "2026-09-20"));

    const alternateHistory = await provider.getDailyHistory({
      symbol: "TST",
      interval: "1d",
      range: { from: null, to: null },
    });
    assert.deepEqual(alternateHistory?.candles, [differentAsset]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
