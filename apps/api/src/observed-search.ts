import { Router } from "express";
import type { Db, Document } from "mongodb";
import { observedAssetProjection, validatedObservedAsset } from "./observed-history-contract.js";
import type { Dataset, ObservedAsset } from "./ingestion-contract.js";
import { STOCK_REFERENCE_CATALOG } from "./stock-reference-catalog.js";
import { normalizeSearchText, parseSearchQuery } from "./stock-search.js";
import { withinTimeout } from "./platform/health/dependency-probes.js";
import { REGISTERED_SYMBOLS } from "./symbol-registry.js";

export interface ObservedSearchResponse {
  data: Array<{ asset: ObservedAsset; companyName: string; aliases: string[]; reference: { origin: "curated_reference"; officialSources: string[]; reviewedOn: string } }>;
  meta: { scope: "stored observed equities"; label: string; provider: "KBS";
    dataset: Dataset | null; sourceAsOf: null; collectedAt: null; freshness: "unknown"; coverage: string[]; availability: "catalog_only"; assetOrigin: "stored_observed_asset" };
}
export interface ObservedSearchReader { search(query: string): Promise<ObservedSearchResponse> }

// Equities in the symbol registry that also have a curated company reference; indexes are never catalog entries.
const catalogEntries = REGISTERED_SYMBOLS
  .filter(profile => profile.assetType === "equity")
  .flatMap(profile => { const entry = STOCK_REFERENCE_CATALOG.find(item => item.symbol === profile.symbol); return entry ? [{ profile, entry }] : []; });
const COVERAGE = catalogEntries.map(item => item.profile.symbol);

export class ObservedSearchService implements ObservedSearchReader {
  constructor(private readonly db: Db, private readonly timeoutMs = 1000) {}
  /** Searches stored observed equities in the symbol registry against curated company names and aliases. */
  async search(query: string): Promise<ObservedSearchResponse> {
    const ids = catalogEntries.map(item => item.profile.assetId);
    const documents = await withinTimeout(() => this.db.collection<Document & { _id: string }>("observed_assets")
      .find({ _id: { $in: ids } }, { projection: observedAssetProjection, maxTimeMS: this.timeoutMs, singleBatch: true }).limit(ids.length).toArray(), this.timeoutMs);
    const byId = new Map(documents.map(document => [(document.record as { assetId?: unknown } | undefined)?.assetId, document]));
    const normalized = normalizeSearchText(query);
    const data: ObservedSearchResponse["data"] = [];
    let dataset: Dataset | null = null;
    for (const { profile, entry } of catalogEntries) {
      const document = byId.get(profile.assetId);
      const stored = document ? validatedObservedAsset(profile.symbol, document) : null;
      if (!stored) continue;
      dataset ??= stored.dataset;
      if ([entry.symbol, entry.companyName, ...entry.aliases].some(term => normalizeSearchText(term).includes(normalized))) {
        data.push({ asset: stored.asset, companyName: entry.companyName, aliases: [...entry.aliases],
          reference: { origin: "curated_reference", officialSources: [...entry.officialSources], reviewedOn: entry.reviewedOn } });
      }
    }
    return {
      data,
      meta: { scope: "stored observed equities", label: `STORED OBSERVED ASSET CATALOG — COVERAGE LIMITED TO ${COVERAGE.join(", ")}`, provider: "KBS",
        dataset, sourceAsOf: null, collectedAt: null, freshness: "unknown", coverage: [...COVERAGE], availability: "catalog_only", assetOrigin: "stored_observed_asset" },
    };
  }
}

/** Creates the Express router for the stored observed asset catalog search endpoint. */
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
