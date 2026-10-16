import { readFileSync } from "node:fs";
import { digest, type Json } from "../src/ingestion-contract.js";
import { goldAssetIdentity, goldContent, goldSnapshotIdentity, type GoldObservation, type GoldPayload } from "../src/gold-contract.js";

export const gold = (): GoldPayload => JSON.parse(readFileSync("fixtures/gold/mp-gold-synthetic.json", "utf8")) as GoldPayload;
export function sealGold(row: GoldObservation): GoldObservation {
  row.assetId = digest(goldAssetIdentity(row)); row.snapshotId = digest(goldSnapshotIdentity(row)); row.contentDigest = digest(goldContent(row)); return row;
}
export function goldOne(index = 0): GoldPayload {
  const payload = gold(); payload.observations = [payload.observations[index]!]; return payload;
}
export const asJson = (value: GoldPayload): Json => value as unknown as Json;
