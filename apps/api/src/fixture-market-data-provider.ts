import { open } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  MarketDataUnavailableError,
  type AssetCatalogProvider,
  type CanonicalAsset,
  type CanonicalCandle,
  type CanonicalDataset,
  type DailyHistoryRequest,
  type DailyHistorySeries,
  type MarketDataProvider,
} from "./market-data.js";

const FIXTURE_URL = new URL("../../../fixtures/market/mp-02-synthetic.json", import.meta.url);
const MAX_FIXTURE_BYTES = 1024 * 1024;
const MAX_ASSETS = 32;
const MAX_OBSERVATIONS = 1000;

interface FixtureDocument {
  schemaVersion: "1.0.0";
  dataset: CanonicalDataset;
  assets: CanonicalAsset[];
  candles: CanonicalCandle[];
  quotes: unknown[];
  indexObservations: unknown[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (year < 1 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return daysInMonth !== undefined && day >= 1 && day <= daysInMonth;
}

function validAsset(value: unknown): value is CanonicalAsset {
  if (!isRecord(value)) return false;
  return typeof value.assetId === "string"
    && /^VN:(HOSE|HNX|UPCOM|INDEX):[A-Z0-9._-]+$/.test(value.assetId)
    && typeof value.symbol === "string"
    && /^[A-Z0-9._-]{1,32}$/.test(value.symbol)
    && ["equity", "index"].includes(String(value.assetType))
    && ["HOSE", "HNX", "UPCOM", "INDEX"].includes(String(value.exchange))
    && (value.currency === "VND" || value.currency === null)
    && ["VND", "index_point"].includes(String(value.unit))
    && value.timezone === "Asia/Ho_Chi_Minh";
}

function validCandle(value: unknown, assets: Map<string, CanonicalAsset>): value is CanonicalCandle {
  if (!isRecord(value) || typeof value.assetId !== "string") return false;
  const asset = assets.get(value.assetId);
  if (!asset) return false;
  if (value.interval !== "1d" || !isCalendarDate(value.tradingDate)) return false;
  if (![value.open, value.high, value.low, value.close].every((price) => typeof price === "number" && Number.isFinite(price) && price > 0)) return false;
  if (!(value.volume === null || (typeof value.volume === "number" && Number.isInteger(value.volume) && value.volume >= 0))) return false;
  if (!(value.volumeUnit === "shares" || value.volumeUnit === "not_available")) return false;
  if (value.currency !== asset.currency || value.unit !== asset.unit || value.timezone !== asset.timezone) return false;
  if (!(value.adjustmentBasis === "unadjusted" || value.adjustmentBasis === "split_adjusted" || value.adjustmentBasis === "total_return_adjusted" || value.adjustmentBasis === "not_applicable")) return false;
  if (typeof value.asOf !== "string" || typeof value.ingestedAt !== "string") return false;
  if (!isRecord(value.source) || value.source.provider !== "marketpulse-fixture" || value.source.mode !== "fixture" || typeof value.source.recordId !== "string" || !value.source.recordId.startsWith("synthetic-")) return false;
  return true;
}

function validateFixture(value: unknown): FixtureDocument {
  if (!isRecord(value) || value.schemaVersion !== "1.0.0" || !isRecord(value.dataset)) throw new Error();
  const dataset = value.dataset;
  if (dataset.mode !== "fixture" || dataset.label !== "SYNTHETIC FIXTURE — NOT MARKET DATA" || dataset.freshness !== "fixture / unknown" || dataset.sessionCalendar !== "unverified") throw new Error();
  if (!Array.isArray(value.assets) || value.assets.length === 0 || value.assets.length > MAX_ASSETS) throw new Error();
  if (!Array.isArray(value.candles) || value.candles.length > MAX_OBSERVATIONS) throw new Error();
  if (!Array.isArray(value.quotes) || value.quotes.length > MAX_OBSERVATIONS) throw new Error();
  if (!Array.isArray(value.indexObservations) || value.indexObservations.length > MAX_OBSERVATIONS) throw new Error();

  const assets = new Map<string, CanonicalAsset>();
  const symbols = new Set<string>();
  for (const asset of value.assets) {
    if (!validAsset(asset) || assets.has(asset.assetId) || symbols.has(asset.symbol)) throw new Error();
    assets.set(asset.assetId, asset);
    symbols.add(asset.symbol);
  }
  const candleIdentities = new Set<string>();
  for (const candle of value.candles) {
    if (!validCandle(candle, assets)) throw new Error();
    const identity = JSON.stringify([
      candle.assetId,
      candle.source.provider,
      candle.interval,
      candle.tradingDate,
      candle.adjustmentBasis,
    ]);
    if (candleIdentities.has(identity)) throw new Error();
    candleIdentities.add(identity);
  }
  return value as unknown as FixtureDocument;
}

export class FixtureMarketDataProvider implements MarketDataProvider, AssetCatalogProvider {
  private fixturePromise: Promise<FixtureDocument> | undefined;
  private loaded = false;

  constructor(private readonly fixtureUrl: URL = FIXTURE_URL) {}

  get ready(): boolean {
    return this.loaded;
  }

  async initialize(): Promise<void> {
    await this.loadOnce();
  }

  async getDailyHistory(request: DailyHistoryRequest): Promise<DailyHistorySeries | null> {
    const fixture = await this.loadOnce();
    const sourceAsset = fixture.assets.find((asset) => asset.symbol === request.symbol);
    if (!sourceAsset) return null;

    const sourceCandles = fixture.candles
      .filter((candle) => candle.assetId === sourceAsset.assetId)
      .sort((left, right) => left.tradingDate.localeCompare(right.tradingDate));
    const inRange = sourceCandles.filter((candle) => (
      (request.range.from === null || candle.tradingDate >= request.range.from)
      && (request.range.to === null || candle.tradingDate <= request.range.to)
    ));

    return {
      dataset: structuredClone(fixture.dataset),
      asset: structuredClone(sourceAsset),
      candles: structuredClone(inRange),
      availableRange: {
        from: sourceCandles[0]?.tradingDate ?? null,
        to: sourceCandles.at(-1)?.tradingDate ?? null,
      },
    };
  }

  async getAssets(): Promise<CanonicalAsset[]> {
    const fixture = await this.loadOnce();
    return structuredClone(fixture.assets);
  }

  private loadOnce(): Promise<FixtureDocument> {
    if (!this.fixturePromise) {
      this.fixturePromise = this.readFixture().then((fixture) => {
        this.loaded = true;
        return fixture;
      });
    }
    return this.fixturePromise.catch(() => {
      throw new MarketDataUnavailableError();
    });
  }

  private async readFixture(): Promise<FixtureDocument> {
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      handle = await open(fileURLToPath(this.fixtureUrl), "r");
      const metadata = await handle.stat();
      if (!metadata.isFile() || metadata.size > MAX_FIXTURE_BYTES) throw new Error();
      return validateFixture(JSON.parse(await handle.readFile("utf8")) as unknown);
    } catch {
      throw new MarketDataUnavailableError();
    } finally {
      await handle?.close().catch(() => undefined);
    }
  }
}

export function createFixtureMarketDataProvider(fixtureUrl?: URL): FixtureMarketDataProvider {
  return new FixtureMarketDataProvider(fixtureUrl);
}
