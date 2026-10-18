import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import { Decimal } from "decimal.js";
import { ContractError, canonicalJson, digest, type Json } from "./platform/contracts/json.js";

export interface GoldDataset { [key: string]: Json; mode: string; label: string; freshness: string; timezone: string }
export interface GoldObservation {
  [key: string]: Json;
  assetId: string; snapshotId: string; contentDigest: string;
  provider: string; brand: string; product: string; purity: string; region: string | null; requestedRegion: string | null;
  quotes: { buy: string | null; sell: string | null; spread: string | null; currency: string; unit: string };
  time: { sourceAsOf: string | null; collectedAt: string; referenceDate: string; referenceDateType: string; timezone: string };
  qualityFlags: { sourceTimestampStatus: string; regionStatus: string; priceIntegrity: string };
  provenance: { provider: string; originalBuy: string | null; originalSell: string | null; originalUnit: string; conversionFactor: string; sourceUrl: string; adapterVersion: string; schemaVersion: string };
}
export interface GoldPayload { schemaVersion: "1.0.0"; dataset: GoldDataset; observations: GoldObservation[] }
const validateSchema = new Ajv2020({ strict: true }).compile(JSON.parse(readFileSync(new URL("../../../packages/schemas/gold-quotes-v1.schema.json", import.meta.url), "utf8")));
const ExactDecimal = Decimal.clone({ precision: 300 });
const fail = (): never => { throw new ContractError(); };
export function goldAsset(row: GoldObservation): { [key: string]: Json } {
  return Object.fromEntries(["assetId", "provider", "brand", "product", "purity", "region"].map(key => [key, row[key]!]));
}
export function goldAssetIdentity(row: GoldObservation): Json[] {
  return ["gold_asset", row.provider, row.brand, row.product, row.purity, row.region];
}
export function goldSnapshotIdentity(row: GoldObservation): Json[] {
  return [row.assetId, row.time.sourceAsOf === null ? `observation:${row.time.collectedAt}` : `source:${row.time.sourceAsOf}`];
}
export function goldContent(row: GoldObservation): Json {
  return { assetId: row.assetId, sourceAsOf: row.time.sourceAsOf,
    quotes: Object.fromEntries(["buy", "sell", "spread", "currency", "unit"].map(key => [key, row.quotes[key as keyof typeof row.quotes]])),
    provenance: Object.fromEntries(["provider", "originalBuy", "originalSell", "originalUnit", "conversionFactor"].map(key => [key, row.provenance[key as keyof typeof row.provenance]])) };
}
function timestamp(value: string): bigint {
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{6}Z$/.test(value) || value.startsWith("0000-")) fail();
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== `${value.slice(0, 23)}Z`) fail();
  return BigInt(milliseconds) * 1000n + BigInt(value.slice(23, 26));
}
export function validateGoldPayload(input: Json): GoldPayload {
  if (!validateSchema(input)) fail();
  canonicalJson(input);
  const payload = input as unknown as GoldPayload;
  for (const row of payload.observations) {
    const { quotes, time, qualityFlags: quality, provenance } = row;
    const collected = timestamp(time.collectedAt);
    const source = time.sourceAsOf === null ? null : timestamp(time.sourceAsOf);
    if (source !== null && source > collected) fail();
    const reference = new Date(Date.parse(time.sourceAsOf ?? time.collectedAt) + 7 * 3600_000).toISOString().slice(0, 10);
    if (!/^[0-9]{4}-/.test(reference) || reference.startsWith("0000-") || time.referenceDate !== reference
      || time.referenceDateType !== (source === null ? "collected_date" : "source_date")
      || quality.sourceTimestampStatus !== (source === null ? "unknown" : "verified")) fail();
    if ((row.region !== null) !== (quality.regionStatus === "verified") || (quality.regionStatus === "not_applicable" && row.requestedRegion !== null)) fail();
    const factor = ({ thousand_vnd_per_chi: "10000", thousand_vnd_per_tael: "1000", vnd_per_tael: "1" } as Record<string, string>)[provenance.originalUnit];
    if (provenance.provider !== row.provider || provenance.conversionFactor !== factor) fail();
    for (const side of ["buy", "sell"] as const) {
      const original = provenance[side === "buy" ? "originalBuy" : "originalSell"];
      if ((original === null) !== (quotes[side] === null) || (original !== null && !new ExactDecimal(original).times(factor!).eq(quotes[side]!))) fail();
    }
    const spread = quotes.buy === null || quotes.sell === null ? null : new ExactDecimal(quotes.sell).minus(quotes.buy);
    if ((spread === null) !== (quotes.spread === null) || (spread !== null && !spread.eq(quotes.spread!))
      || quality.priceIntegrity !== (spread !== null && spread.lt(0) ? "spread_inverted" : "valid")) fail();
    if (row.assetId !== digest(goldAssetIdentity(row)) || row.snapshotId !== digest(goldSnapshotIdentity(row)) || row.contentDigest !== digest(goldContent(row))) fail();
  }
  return payload;
}
