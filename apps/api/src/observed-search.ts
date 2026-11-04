import { Router } from "express";
import type { Db, Document } from "mongodb";
import { observedAssetProjection, validatedObservedAsset } from "./observed-history-contract.js";
import type { Dataset, ObservedAsset } from "./ingestion-contract.js";
import { STOCK_REFERENCE_CATALOG } from "./stock-reference-catalog.js";
import { normalizeSearchText, parseSearchQuery } from "./stock-search.js";

export interface ObservedSearchResponse {
  data: Array<{ asset: ObservedAsset; companyName: string; aliases: string[]; reference: { origin: "curated_reference"; officialSources: string[]; reviewedOn: string } }>;
  meta: { scope: "stored observed equities"; label: "STORED OBSERVED ASSET CATALOG — COVERAGE LIMITED TO FPT"; provider: "KBS";
    dataset: Dataset | null; sourceAsOf: null; collectedAt: null; freshness: "unknown"; coverage: ["FPT"]; availability: "catalog_only"; assetOrigin: "stored_observed_asset" };
}
export interface ObservedSearchReader { search(query: string): Promise<ObservedSearchResponse> }

export class ObservedSearchService implements ObservedSearchReader {
  constructor(private readonly db: Db, private readonly timeoutMs = 1000) {}
  async search(query: string): Promise<ObservedSearchResponse> {
    const document = await this.db.collection<Document & { _id: string }>("observed_assets")
      .findOne({ _id: "VN:HOSE:FPT" }, { projection: observedAssetProjection, maxTimeMS: this.timeoutMs });
    const stored = document ? validatedObservedAsset("FPT", document) : null;
    const entry = STOCK_REFERENCE_CATALOG.find(item => item.symbol === "FPT");
    if (!entry) throw new Error("missing_reference");
    const normalized = normalizeSearchText(query);
    const match = [entry.symbol, entry.companyName, ...entry.aliases].some(term => normalizeSearchText(term).includes(normalized));
    return {
      data: stored && match ? [{ asset: stored.asset, companyName: entry.companyName, aliases: [...entry.aliases],
        reference: { origin: "curated_reference", officialSources: [...entry.officialSources], reviewedOn: entry.reviewedOn } }] : [],
      meta: { scope: "stored observed equities", label: "STORED OBSERVED ASSET CATALOG — COVERAGE LIMITED TO FPT", provider: "KBS",
        dataset: stored?.dataset ?? null, sourceAsOf: null, collectedAt: null, freshness: "unknown", coverage: ["FPT"], availability: "catalog_only", assetOrigin: "stored_observed_asset" },
    };
  }
}

export function createObservedSearchRouter(reader: ObservedSearchReader, isReady: () => boolean = () => true) {
  const router = Router();
  router.get("/search", async (request, response) => {
    response.set("Cache-Control", "no-store");
    const parsed = parseSearchQuery(request.originalUrl);
    if (!parsed) { response.status(400).json({ error: "invalid_query" }); return; }
    try {
      if (!isReady()) throw new Error("not_ready");
      response.status(200).json(await reader.search(parsed.query));
    } catch { response.status(503).json({ error: "observed_asset_search_unavailable" }); }
  });
  return router;
}
