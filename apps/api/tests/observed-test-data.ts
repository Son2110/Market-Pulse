import { readFileSync } from "node:fs";
import { digest, observedContent, type Json, type ObservedPayload } from "../src/ingestion-contract.js";

interface Corpus { baseline: ObservedPayload; index: ObservedPayload; cases: { name: string; valid: boolean; sets: [(string | number)[], Json][]; rehash: boolean }[] }
export const corpus = JSON.parse(readFileSync("apps/api/tests/observed-parity.json", "utf8")) as Corpus;
export const observed = (index = false): ObservedPayload => structuredClone(index ? corpus.index : corpus.baseline);
export function rehash(payload: ObservedPayload): ObservedPayload {
  for (const row of payload.candles) row.contentDigest = digest(observedContent(row));
  return payload;
}
