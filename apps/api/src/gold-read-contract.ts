import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import { Decimal } from "decimal.js";
import { goldAsset, goldAssetIdentity, validateGoldPayload, type GoldDataset, type GoldObservation } from "./gold-contract.js";
import { canonicalJson, digest, type Json } from "./ingestion-contract.js";
import { validObservedDate } from "./observed-history-contract.js";

export interface GoldReadQuery {
  provider: string;
  product?: string;
  region?: string;
  unit: "vnd_per_tael" | "vnd_per_chi";
  page: number;
  limit: number;
  offset: number;
}
export interface GoldHistoryQuery extends GoldReadQuery {
  provider: string; product: string; brand: string; purity: string; region: string | undefined; from: string; to: string; assetId: string;
}
const schema = JSON.parse(readFileSync(new URL("../../../packages/schemas/gold-quotes-v1.schema.json", import.meta.url), "utf8"));
const ajv = new Ajv2020({ strict: true });
const regionShape = ajv.compile(schema.$defs.region);
const datasetShape = ajv.compile(schema.properties.dataset);
const ExactDecimal = Decimal.clone({ precision: 300 });
const assetFields = ["assetId", "provider", "brand", "product", "purity", "region"];
const recordFields = [...assetFields, "snapshotId", "contentDigest", "requestedRegion", "quotes", "time", "qualityFlags", "provenance"];
const nestedFields = {
  quotes: ["buy", "sell", "spread", "currency", "unit"],
  time: ["sourceAsOf", "collectedAt", "referenceDate", "referenceDateType", "timezone"],
  qualityFlags: ["sourceTimestampStatus", "regionStatus", "priceIntegrity"],
  provenance: ["provider", "originalBuy", "originalSell", "originalUnit", "conversionFactor", "sourceUrl", "adapterVersion", "schemaVersion"],
};
const datasetFields = ["mode", "label", "freshness", "timezone"];
export const goldFixtureDataset: GoldDataset = { mode: "fixture", label: "SYNTHETIC FIXTURE — NOT MARKET DATA", freshness: "fixture / unknown", timezone: "Asia/Ho_Chi_Minh" };
function invalid(): never { throw new Error("gold_invalid_storage"); }
function object(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return invalid();
  return input as Record<string, unknown>;
}
function pick(input: unknown, fields: string[]): Record<string, Json> {
  const value = object(input);
  return Object.fromEntries(fields.map(key => [key, value[key]])) as Record<string, Json>;
}
function parameters(originalUrl: string, history: boolean): URLSearchParams | null {
  const params = new URL(originalUrl, "http://localhost").searchParams;
  const allowed = ["provider", "product", "region", "unit", "limit", "page", ...(history ? ["brand", "purity", "from", "to"] : [])];
  for (const [key, value] of params) {
    if (!allowed.includes(key) || params.getAll(key).length !== 1 || value === "") return null;
  }
  return params;
}
function baseQuery(params: URLSearchParams): GoldReadQuery | null {
  const provider = params.get("provider") ?? "marketpulse-fixture"; const product = params.get("product") ?? undefined;
  const region = params.get("region") ?? undefined; const unit = params.get("unit") ?? "vnd_per_tael";
  const limitText = params.get("limit") ?? "100"; const pageText = params.get("page") ?? "1";
  if (provider !== "marketpulse-fixture" || (product !== undefined && !["gold_bar_sjc", "plain_ring_9999"].includes(product))
    || (region !== undefined && !regionShape(region)) || !["vnd_per_tael", "vnd_per_chi"].includes(unit)
    || !/^[1-9][0-9]{0,5}$(?![\s\S])/.test(limitText) || !/^[1-9][0-9]{0,5}$(?![\s\S])/.test(pageText)) return null;
  const limit = Number(limitText); const page = Number(pageText); const offset = (page - 1) * limit;
  if (limit > 500 || offset > 100000) return null;
  return { provider, product, region, unit: unit as "vnd_per_tael" | "vnd_per_chi", limit, page, offset };
}
export function parseGoldLatestQuery(originalUrl: string): GoldReadQuery | null {
  const params = parameters(originalUrl, false);
  return params ? baseQuery(params) : null;
}
export function parseGoldHistoryQuery(originalUrl: string): GoldHistoryQuery | null {
  const params = parameters(originalUrl, true); if (!params) return null;
  const query = baseQuery(params); const from = params.get("from"); const to = params.get("to");
  if (!query || !params.has("provider") || !query.product || !from || !to || !validObservedDate(from) || !validObservedDate(to)) return null;
  const days = (Date.parse(to) - Date.parse(from)) / 86400_000;
  const brand = params.get("brand") ?? (query.product === "gold_bar_sjc" ? "SJC" : "PNJ"); const purity = params.get("purity") ?? "999.9";
  if (days < 0 || days > 31 || brand !== (query.product === "gold_bar_sjc" ? "SJC" : "PNJ") || purity !== "999.9") return null;
  return { ...query, provider: query.provider, product: query.product, region: query.region, brand, purity, from, to,
    assetId: digest(["gold_asset", query.provider, brand, query.product, purity, query.region ?? null]) };
}
const projection = (fields: string[], prefix: string) => Object.fromEntries(fields.map(key => [`${prefix}.${key}`, 1]));
export const goldAssetReadProjection = { _id: 1, schemaVersion: 1, rowDigest: 1, ...projection(assetFields, "record"), ...projection(datasetFields, "dataset") };
export const goldQuoteReadProjection = { _id: 1, schemaVersion: 1, assetId: 1, snapshotId: 1, contentDigest: 1, sourceVerified: 1, sourceOrder: 1, collectedOrder: 1,
  ...projection(recordFields.filter(key => !(key in nestedFields)), "record"), ...projection(datasetFields, "dataset"),
  ...Object.assign({}, ...Object.entries(nestedFields).map(([key, fields]) => projection(fields, `record.${key}`))) };
function validatedDataset(input: unknown): GoldDataset {
  const dataset = pick(input, datasetFields) as GoldDataset;
  if (!datasetShape(dataset)) invalid();
  return dataset;
}
export function validateGoldReadAsset(input: unknown, expectedId: string) {
  const stored = object(input); const asset = pick(stored.record, assetFields);
  validatedDataset(stored.dataset);
  const expectedBrand = asset.product === "gold_bar_sjc" ? "SJC" : asset.product === "plain_ring_9999" ? "PNJ" : null;
  if (stored.schemaVersion !== "1.0.0" || stored._id !== expectedId || asset.assetId !== expectedId
    || asset.provider !== "marketpulse-fixture" || asset.brand !== expectedBrand || expectedBrand === null || asset.purity !== "999.9"
    || !regionShape(asset.region) || digest(goldAssetIdentity(asset as GoldObservation)) !== expectedId || stored.rowDigest !== digest(asset)) invalid();
  return asset;
}
export function validateGoldReadRow(input: unknown, latest: boolean): GoldObservation {
  const stored = object(input); const row = pick(stored.record, recordFields) as GoldObservation;
  for (const [key, fields] of Object.entries(nestedFields)) row[key] = pick(row[key], fields);
  const dataset = validatedDataset(stored.dataset);
  validateGoldPayload({ schemaVersion: stored.schemaVersion as Json, dataset, observations: [row] });
  if (stored._id !== (latest ? row.assetId : row.snapshotId) || stored.assetId !== row.assetId || stored.snapshotId !== row.snapshotId
    || stored.contentDigest !== row.contentDigest || stored.sourceVerified !== (row.time.sourceAsOf !== null)
    || stored.sourceOrder !== (row.time.sourceAsOf ?? "") || stored.collectedOrder !== row.time.collectedAt) invalid();
  return row;
}
export function goldReadResponse(query: GoldReadQuery, documents: unknown[], totalRecords: number, assetDocuments: unknown[], history?: GoldHistoryQuery) {
  if (!Number.isSafeInteger(totalRecords) || totalRecords < 0 || documents.length > query.limit || documents.length > totalRecords) invalid();
  const assets = new Map(assetDocuments.map(document => {
    const stored = object(document);
    const id = stored._id;
    if (typeof id !== "string") return invalid();
    return [id, validateGoldReadAsset(document, id)];
  }));
  if (history && !assets.has(history.assetId)) invalid();
  let previous = "";
  const rows = documents.map(document => {
    const row = validateGoldReadRow(document, !history); const asset = assets.get(row.assetId);
    if (!asset || canonicalJson(asset) !== canonicalJson(goldAsset(row)) || row.provider !== query.provider
      || (query.product !== undefined && row.product !== query.product) || (query.region !== undefined && row.region !== query.region)) invalid();
    const order = history ? `${row.time.sourceAsOf ?? row.time.collectedAt}:${row.snapshotId}` : row.assetId;
    if (order <= previous || (history && (row.assetId !== history.assetId || row.time.referenceDate < history.from || row.time.referenceDate > history.to))) invalid();
    previous = order;
    const { contentDigest: _digest, ...publicRow } = row;
    void _digest;
    const quotes = { ...row.quotes, unit: query.unit };
    if (query.unit === "vnd_per_chi") {
      for (const side of ["buy", "sell", "spread"] as const) {
        if (quotes[side] !== null) quotes[side] = new ExactDecimal(quotes[side]!).dividedBy(10).toFixed();
      }
    }
    return { ...publicRow, quotes, dataset: { ...goldFixtureDataset } };
  });
  return { data: rows, metadata: {
    status: rows.length ? "available" : "no_data", count: rows.length, page: query.page, limit: query.limit, totalRecords,
    totalPages: Math.ceil(totalRecords / query.limit), hasMore: query.offset + rows.length < totalRecords,
    dataset: { ...goldFixtureDataset }, freshness: "fixture / unknown", completeness: "unknown", unit: query.unit, presentationConversionFactor: query.unit === "vnd_per_chi" ? "0.1" : "1",
    selectionSemantics: history ? "stored_snapshot_winners_chronological_source_as_of_or_collected_at_then_snapshot_id" : "stored_latest_verified_source_then_source_as_of_then_collected_at_then_content_digest",
    consistency: "eventual_per_record_projections_non_atomic_no_read_repair",
    ...(history ? { series: assets.get(history.assetId), requestedRange: { from: history.from, to: history.to } } : {}),
  } };
}
export type GoldReadResponse = ReturnType<typeof goldReadResponse>;
