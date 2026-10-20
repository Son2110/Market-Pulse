import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import { Decimal } from "decimal.js";
import { validateGoldPayload, type GoldDataset, type GoldPayload } from "./gold-contract.js";
import { ContractError, canonicalJson, digest, type Json } from "./platform/contracts/json.js";

export { ContractError, canonicalJson, digest, strictJson, type Json } from "./platform/contracts/json.js";

export interface Asset { [key: string]: Json; assetId: string; symbol: string; assetType: string; exchange: string; currency: Json; unit: string; timezone: string }
export interface Observation { [key: string]: Json; assetId: string; tradingDate: string; adjustmentBasis: string; asOf: string; ingestedAt: string; source: { provider: string; mode: string; recordId: string } }
export interface Dataset { [key: string]: Json; mode: string; label: string; freshness: string; sessionCalendar: string }
export interface FixturePayload { schemaVersion: "1.0.0"; dataset: Dataset; assets: Asset[]; candles: Observation[]; quotes: Observation[]; indexObservations: Observation[] }
export interface ObservedAsset { [key: string]: Json; assetId: string; symbol: string; assetType: string; currency: Json; unit: string; timezone: string }
export interface ObservedCandle { [key: string]: Json; assetId: string; tradingDate: string; interval: string; adjustmentBasis: string; collectedAt: string; barId: string; contentDigest: string; source: { provider: string; connector: string; connectorVersion: string; dependencyVersion: string; mode: string } }
export interface ObservedPayload { schemaVersion: "2.0.0"; dataset: Dataset; request: { symbol: string; start: string; end: string; interval: string }; assets: ObservedAsset[]; candles: ObservedCandle[] }
export type Payload = FixturePayload | ObservedPayload | GoldPayload;
export type PayloadFamily = "fixture-market" | "observed-candle" | "synthetic-gold";
export type ClassifiedPayload =
  | { family: "fixture-market"; provider: "marketpulse-fixture"; schemaVersion: "1.0.0"; dataset: Dataset; payload: FixturePayload }
  | { family: "observed-candle"; provider: "KBS"; schemaVersion: "2.0.0"; dataset: Dataset; payload: ObservedPayload }
  | { family: "synthetic-gold"; provider: "marketpulse-fixture"; schemaVersion: "1.0.0"; dataset: GoldDataset; payload: GoldPayload };
export const isGoldPayload = (payload: Payload): payload is GoldPayload =>
  payload.schemaVersion === "1.0.0" && Object.hasOwn(payload, "observations") && !Object.hasOwn(payload, "assets") && !Object.hasOwn(payload, "candles") && !Object.hasOwn(payload, "request");
export const isObservedPayload = (payload: Payload): payload is ObservedPayload =>
  payload.schemaVersion === "2.0.0" && Object.hasOwn(payload, "request") && Object.hasOwn(payload, "assets") && Object.hasOwn(payload, "candles") && !Object.hasOwn(payload, "quotes") && !Object.hasOwn(payload, "indexObservations") && !Object.hasOwn(payload, "observations");
export const isFixturePayload = (payload: Payload): payload is FixturePayload =>
  payload.schemaVersion === "1.0.0" && Object.hasOwn(payload, "assets") && Object.hasOwn(payload, "candles") && Object.hasOwn(payload, "quotes") && !Object.hasOwn(payload, "request") && !Object.hasOwn(payload, "observations") && Object.hasOwn(payload, "indexObservations");
function fail(): never { throw new ContractError(); }

function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !value.startsWith("0000-") && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function validTime(value: string): boolean {
  const parts = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  return !!parts && validDate(parts[1]!) && Number(parts[2]) < 24 && Number(parts[3]) < 60 && Number(parts[4]) < 60
    && (!parts[6] || (Number(parts[6]) < 24 && Number(parts[7]) < 60)) && parts[5] !== "-00:00" && Number.isFinite(Date.parse(value));
}
const ajv = new Ajv2020({ strict: true, allErrors: false });
ajv.addFormat("date", validDate); ajv.addFormat("date-time", validTime);
const validateSchema = ajv.compile(JSON.parse(readFileSync(new URL("../../../packages/schemas/market-data-v1.schema.json", import.meta.url), "utf8")));
const validateObservedSchema = ajv.compile(JSON.parse(readFileSync(new URL("../../../packages/schemas/observed-candles-v2.schema.json", import.meta.url), "utf8")));
const seriesKey = (row: Observation) => JSON.stringify([row.assetId, row.source.provider, "1d", row.adjustmentBasis]);
const decimal = (value: Json | undefined): Decimal => typeof value === "number" ? new Decimal(value) : fail();
function micros(value: string): bigint {
  const fraction = /\.(\d+)/.exec(value)?.[1] ?? "";
  const whole = value.replace(/\.\d+/, "");
  return BigInt(Date.parse(whole)) * 1000n + BigInt(fraction.slice(0, 6).padEnd(6, "0"));
}

export function validatePayload(input: Json): Payload {
  if (input !== null && !Array.isArray(input) && typeof input === "object" && Object.hasOwn(input, "observations")) return validateGoldPayload(input);
  if (input !== null && !Array.isArray(input) && typeof input === "object" && (Object.hasOwn(input, "request") || (input.schemaVersion === "2.0.0" && !Object.hasOwn(input, "quotes") && !Object.hasOwn(input, "indexObservations")))) return validateObservedPayload(input);
  if (!validateSchema(input)) fail();
  const payload = input as unknown as FixturePayload;
  const { dataset, assets, candles, quotes, indexObservations } = payload;
  if (dataset.mode !== "fixture" || dataset.label !== "SYNTHETIC FIXTURE — NOT MARKET DATA" || dataset.freshness !== "fixture / unknown" || dataset.sessionCalendar !== "unverified") fail();
  if (assets.length > 32 || candles.length > 1000 || quotes.length > 1000 || indexObservations.length > 1000) fail();
  if (assets.length !== 11 || candles.length !== 33 || quotes.length !== 10 || indexObservations.length !== 1) fail();
  const expected = new Set(["FPT", "VCB", "HPG", "VNM", "SSI", "VIC", "VHM", "MSN", "MWG", "BID", "VNINDEX"]);
  const assetMap = new Map<string, Asset>();
  for (const asset of assets) {
    if (assetMap.has(asset.assetId) || !expected.delete(asset.symbol) || asset.assetId !== `VN:${asset.exchange}:${asset.symbol}`) fail();
    const isIndex = asset.assetType === "index";
    if (isIndex ? asset.exchange !== "INDEX" || asset.currency !== null || asset.unit !== "index_point" : asset.exchange === "INDEX" || asset.currency !== "VND" || asset.unit !== "VND") fail();
    assetMap.set(asset.assetId, asset);
  }
  const series = new Map<string, Observation[]>();
  for (const [group, rows] of [["candles", candles], ["quotes", quotes], ["indexObservations", indexObservations]] as const) {
    const identities = new Set<string>();
    for (const row of rows) {
      const asset = assetMap.get(row.assetId); if (!asset) fail();
      const isIndex = asset.assetType === "index";
      if (row.currency !== asset.currency || row.unit !== asset.unit || row.timezone !== asset.timezone
        || (group === "quotes" && isIndex) || (group === "indexObservations" && !isIndex)
        || (isIndex ? row.adjustmentBasis !== "not_applicable" : row.adjustmentBasis === "not_applicable")) fail();
      if (row.source.mode !== "fixture" || row.source.provider !== "marketpulse-fixture" || !row.source.recordId.startsWith("synthetic-")) fail();
      if (micros(row.ingestedAt) < micros(row.asOf) || new Date(Date.parse(row.asOf) + 7 * 3600_000).toISOString().slice(0, 10) !== row.tradingDate) fail();
      if (group !== "indexObservations" && (isIndex ? row.volume !== null || row.volumeUnit !== "not_available" : !Number.isSafeInteger(row.volume) || row.volumeUnit !== "shares")) fail();
      const identity = JSON.stringify(group === "candles" ? [seriesKey(row), row.tradingDate] : [row.assetId, row.source.provider, row.tradingDate]);
      if (identities.has(identity)) fail(); identities.add(identity);
      if (group === "candles") {
        if (decimal(row.low).gt(decimal(row.open)) || decimal(row.open).gt(decimal(row.high)) || decimal(row.low).gt(decimal(row.close)) || decimal(row.close).gt(decimal(row.high))) fail();
        const key = seriesKey(row); const items = series.get(key) ?? [];
        if (items.length && items.at(-1)!.tradingDate >= row.tradingDate) fail();
        items.push(row); series.set(key, items);
      }
    }
  }
  for (const [group, rows] of [["quotes", quotes], ["indexObservations", indexObservations]] as const) for (const row of rows) {
    const items = series.get(seriesKey(row)); const latest = items?.at(-1); const prior = items?.at(-2);
    const current = decimal(row[group === "quotes" ? "lastPrice" : "indexValue"]);
    if (!latest || row.tradingDate !== latest.tradingDate || micros(row.asOf) !== micros(latest.asOf) || !current.eq(decimal(latest.close))) fail();
    if (group === "quotes" && (row.volume !== latest.volume || row.volumeUnit !== latest.volumeUnit)) fail();
    if (!prior) { if ([row.previousTradingDate, row.previousClose, row.change, row.changePercent].some(value => value !== null)) fail(); }
    else {
      const previous = decimal(prior.close); const change = current.minus(previous);
      if (row.previousTradingDate !== prior.tradingDate || !decimal(row.previousClose).eq(previous) || !decimal(row.change).eq(change)
        || !decimal(row.changePercent).eq(change.div(previous).times(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP))) fail();
    }
  }
  return payload;
}

export function classifyPayload(input: Json | Payload): ClassifiedPayload {
  const payload = validatePayload(input as unknown as Json);
  if (isGoldPayload(payload)) return { family: "synthetic-gold", provider: "marketpulse-fixture", schemaVersion: payload.schemaVersion, dataset: payload.dataset, payload };
  if (isObservedPayload(payload)) return { family: "observed-candle", provider: "KBS", schemaVersion: payload.schemaVersion, dataset: payload.dataset, payload };
  if (isFixturePayload(payload)) return { family: "fixture-market", provider: "marketpulse-fixture", schemaVersion: payload.schemaVersion, dataset: payload.dataset, payload };
  return fail();
}

// Whole seconds are calendar-normalized; fractions retain exact microsecond precision.
export function collectedOrder(value: string): string {
  const parts = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!parts || !validTime(value)) return fail();
  const utc = new Date(`${parts[1]}${parts[3]}`).toISOString();
  if (!/^\d{4}-/.test(utc) || utc.startsWith("0000-")) return fail();
  return `${utc.slice(0, 19)}.${(parts[2] ?? "").padEnd(6, "0")}Z`;
}
export function observedContent(row: ObservedCandle): { [key: string]: Json } {
  return Object.fromEntries(Object.entries(row).filter(([key]) => !["collectedAt", "barId", "contentDigest"].includes(key)));
}
export function validateObservedPayload(input: Json): ObservedPayload {
  if (!validateObservedSchema(input)) fail();
  const payload = input as unknown as ObservedPayload;
  const { request, candles } = payload;
  const days = (Date.parse(request.end) - Date.parse(request.start)) / 86400_000;
  if (days < 0 || days > 31) fail();
  const equity = request.symbol === "FPT";
  const expected = { assetId: `VN:${equity ? "HOSE" : "INDEX"}:${request.symbol}`, symbol: request.symbol, assetType: equity ? "equity" : "index", currency: equity ? "VND" : null, unit: equity ? "VND" : "index_point", timezone: "Asia/Ho_Chi_Minh" };
  if (canonicalJson(payload.assets[0]!) !== canonicalJson(expected)) fail();
  let previous = "";
  for (const row of candles) {
    collectedOrder(row.collectedAt);
    if (row.tradingDate < request.start || row.tradingDate > request.end || row.tradingDate <= previous) fail();
    previous = row.tradingDate;
    const label = row.providerTimeLabel as string;
    if (!validTime(`${label.replace(" ", "T")}${label.length === 16 ? ":00" : ""}Z`) || label.slice(0, 10) !== row.tradingDate) fail();
    if (["assetId", "currency", "unit", "timezone"].some(key => row[key] !== expected[key as keyof typeof expected]) || row.adjustmentBasis !== (equity ? "unknown" : "not_applicable")) fail();
    const values = ["open", "high", "low", "close"].map(key => new Decimal(row[key] as string));
    const [open, high, low, close] = values as [Decimal, Decimal, Decimal, Decimal];
    if (values.some(value => value.lte(0)) || low.gt(open) || low.gt(close) || high.lt(open) || high.lt(close)) fail();
    if (row.barId !== digest(["KBS", row.assetId, row.interval, row.tradingDate, row.adjustmentBasis]) || row.contentDigest !== digest(observedContent(row))) fail();
  }
  return payload;
}
