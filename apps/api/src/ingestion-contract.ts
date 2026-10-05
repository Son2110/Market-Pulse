import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import { Decimal } from "decimal.js";

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export interface Asset { [key: string]: Json; assetId: string; symbol: string; assetType: string; exchange: string; currency: Json; unit: string; timezone: string }
export interface Observation { [key: string]: Json; assetId: string; tradingDate: string; adjustmentBasis: string; asOf: string; ingestedAt: string; source: { provider: string; mode: string; recordId: string } }
export interface Payload { schemaVersion: string; dataset: { mode: string; label: string; freshness: string; sessionCalendar: string }; assets: Asset[]; candles: Observation[]; quotes: Observation[]; indexObservations: Observation[] }
export class ContractError extends Error { constructor() { super("invalid_contract"); } }
function fail(): never { throw new ContractError(); }

// JSON primitives use ECMAScript serialization; key ordering is UTF-16 as required by JCS.
export function canonicalJson(value: Json): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key]!)}`).join(",")}}`;
  if (typeof value === "number" && (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))) fail();
  if (typeof value === "string" && /[\uD800-\uDFFF]/u.test(value)) fail();
  return JSON.stringify(value);
}
export const digest = (value: Json): string => createHash("sha256").update(canonicalJson(value)).digest("hex");

export function strictJson(text: string): Json {
  let index = 0;
  const whitespace = () => { while (/[\t\n\r ]/.test(text[index] ?? "x")) index++; };
  const string = (): string => {
    const start = index++;
    while (index < text.length) {
      if (text[index] === "\\") { index += 2; continue; }
      if (text[index++] === '"') { const value: unknown = JSON.parse(text.slice(start, index)); if (typeof value !== "string") fail(); canonicalJson(value); return value; }
    }
    return fail();
  };
  const value = (depth: number): Json => {
    if (depth > 32) fail();
    whitespace();
    if (text[index] === '"') return string();
    if (text[index] === "{" || text[index] === "[") {
      const object = text[index++] === "{";
      const result: { [key: string]: Json } = Object.create(null) as { [key: string]: Json };
      const items: Json[] = [];
      whitespace();
      const end = object ? "}" : "]";
      if (text[index] === end) { index++; return object ? result : items; }
      while (index < text.length) {
        if (object) {
          if (text[index] !== '"') fail();
          const key = string(); whitespace();
          if (text[index++] !== ":" || Object.hasOwn(result, key)) fail();
          result[key] = value(depth + 1);
        } else items.push(value(depth + 1));
        whitespace();
        if (text[index] === end) { index++; return object ? result : items; }
        if (text[index++] !== ",") fail();
        whitespace();
      }
      return fail();
    }
    const token = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(index))?.[0];
    if (!token) return fail();
    index += token.length;
    const parsed = JSON.parse(token) as Json;
    canonicalJson(parsed);
    return parsed;
  };
  const result = value(0); whitespace();
  if (index !== text.length) fail();
  return result;
}

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
const seriesKey = (row: Observation) => JSON.stringify([row.assetId, row.source.provider, "1d", row.adjustmentBasis]);
const decimal = (value: Json | undefined): Decimal => typeof value === "number" ? new Decimal(value) : fail();
function micros(value: string): bigint {
  const fraction = /\.(\d+)/.exec(value)?.[1] ?? "";
  const whole = value.replace(/\.\d+/, "");
  return BigInt(Date.parse(whole)) * 1000n + BigInt(fraction.slice(0, 6).padEnd(6, "0"));
}

export function validatePayload(input: Json): Payload {
  if (!validateSchema(input)) fail();
  const payload = input as unknown as Payload;
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
