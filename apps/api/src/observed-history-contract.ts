import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import { Decimal } from "decimal.js";
import { canonicalJson, collectedOrder, digest, observedContent, type Dataset, type Json, type ObservedAsset, type ObservedCandle } from "./ingestion-contract.js";

export interface ObservedHistoryRange { from: string; to: string }
export interface ObservedHistoryResponse {
  data: { dataset: Dataset; asset: ObservedAsset; candles: ObservedCandle[] };
  meta: {
    status: "available" | "no_data"; provider: "KBS"; interval: "1d";
    requestedRange: ObservedHistoryRange; returnedRange: ObservedHistoryRange | null;
    sourceAsOf: null; completeness: "unknown";
    selectionSemantics: "per_bar_max_collected_at_utc_microseconds_then_content_digest";
  };
}

export function validObservedDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !value.startsWith("0000-")
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

export function parseObservedHistoryQuery(originalUrl: string): ObservedHistoryRange | null {
  const parameters = new URL(originalUrl, "http://localhost").searchParams;
  for (const key of parameters.keys()) if (!["from", "to", "interval"].includes(key) || parameters.getAll(key).length !== 1) return null;
  const from = parameters.get("from"); const to = parameters.get("to"); const interval = parameters.get("interval");
  if (!from || !to || !validObservedDate(from) || !validObservedDate(to) || (interval !== null && interval !== "1d")) return null;
  const days = (Date.parse(to) - Date.parse(from)) / 86400_000;
  return days >= 0 && days <= 31 ? { from, to } : null;
}

const schema = JSON.parse(readFileSync(new URL("../../../packages/schemas/observed-candles-v2.schema.json", import.meta.url), "utf8"));
const ajv = new Ajv2020({ strict: true });
ajv.addFormat("date", validObservedDate);
ajv.addFormat("date-time", (value: string) => { try { collectedOrder(value); return true; } catch { return false; } });
ajv.addSchema(schema);
const assetShape = ajv.compile({ $ref: `${schema.$id}#/$defs/asset` });
const candleShape = ajv.compile({ $ref: `${schema.$id}#/$defs/candle` });
const datasetShape = ajv.compile(schema.properties.dataset);
const assetFields = Object.keys(schema.$defs.asset.properties) as string[];
const candleFields = Object.keys(schema.$defs.candle.properties) as string[];
const datasetFields = Object.keys(schema.properties.dataset.properties) as string[];
const sourceFields = Object.keys(schema.$defs.candle.properties.source.properties) as string[];
const projection = (fields: string[], prefix: string) => Object.fromEntries(fields.map(field => [`${prefix}.${field}`, 1]));
export const observedAssetProjection = { _id: 0, schemaVersion: 1, rowDigest: 1, ...projection(datasetFields, "dataset"), ...projection(assetFields, "record") };
export const observedCandleProjection = {
  _id: 0, schemaVersion: 1, barId: 1, contentDigest: 1, collectedAt: 1, collectedOrder: 1,
  ...projection(datasetFields, "dataset"), ...projection(candleFields.filter(field => field !== "source"), "record"), ...projection(sourceFields, "record.source"),
};

function invalid(): never { throw new Error("observed_history_invalid_storage"); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}
function pick(value: unknown, fields: string[]): Record<string, Json> {
  const input = object(value);
  return Object.fromEntries(fields.map(field => [field, input[field]])) as Record<string, Json>;
}

// Only the explicit public contract is projected; internal delivery/storage fields never escape.
export function observedHistoryResponse(symbol: string, range: ObservedHistoryRange, assetDocument: unknown, documents: unknown[]): ObservedHistoryResponse {
  const storedAsset = object(assetDocument);
  const asset = pick(storedAsset.record, assetFields) as ObservedAsset;
  const dataset = pick(storedAsset.dataset, datasetFields) as Dataset;
  const equity = symbol === "FPT";
  const expected = { assetId: `VN:${equity ? "HOSE" : "INDEX"}:${symbol}`, symbol, assetType: equity ? "equity" : "index", currency: equity ? "VND" : null, unit: equity ? "VND" : "index_point", timezone: "Asia/Ho_Chi_Minh" };
  if (storedAsset.schemaVersion !== "2.0.0" || !assetShape(asset) || !datasetShape(dataset)
    || canonicalJson(asset) !== canonicalJson(expected) || storedAsset.rowDigest !== digest(asset) || documents.length > 32) invalid();
  let previous = "";
  const candles = documents.map(document => {
    const stored = object(document);
    const row = pick(stored.record, candleFields) as ObservedCandle;
    row.source = pick(row.source, sourceFields) as ObservedCandle["source"];
    if (stored.schemaVersion !== "2.0.0" || !datasetShape(stored.dataset) || canonicalJson(stored.dataset as Json) !== canonicalJson(dataset) || !candleShape(row)) invalid();
    if (["assetId", "currency", "unit", "timezone"].some(key => row[key] !== asset[key])
      || row.adjustmentBasis !== (equity ? "unknown" : "not_applicable") || row.tradingDate < range.from || row.tradingDate > range.to || row.tradingDate <= previous) invalid();
    previous = row.tradingDate;
    const label = row.providerTimeLabel as string;
    try { collectedOrder(`${label.replace(" ", "T")}${label.length === 16 ? ":00" : ""}Z`); } catch { invalid(); }
    if (label.slice(0, 10) !== row.tradingDate || stored.collectedAt !== row.collectedAt || stored.collectedOrder !== collectedOrder(row.collectedAt)
      || stored.barId !== row.barId || stored.contentDigest !== row.contentDigest
      || row.barId !== digest(["KBS", row.assetId, row.interval, row.tradingDate, row.adjustmentBasis]) || row.contentDigest !== digest(observedContent(row))) invalid();
    const [open, high, low, close] = [row.open, row.high, row.low, row.close].map(value => new Decimal(value as string)) as [Decimal, Decimal, Decimal, Decimal];
    if ([open, high, low, close].some(value => value.lte(0)) || low.gt(open) || low.gt(close) || high.lt(open) || high.lt(close)) invalid();
    return row;
  });
  return {
    data: { dataset, asset, candles },
    meta: {
      status: candles.length ? "available" : "no_data", provider: "KBS", interval: "1d", requestedRange: range,
      returnedRange: candles.length ? { from: candles[0]!.tradingDate, to: candles.at(-1)!.tradingDate } : null,
      sourceAsOf: null, completeness: "unknown", selectionSemantics: "per_bar_max_collected_at_utc_microseconds_then_content_digest",
    },
  };
}
