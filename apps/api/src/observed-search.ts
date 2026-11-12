import { Router } from "express";
import type { Db, Document } from "mongodb";
import { observedAssetProjection, validatedObservedAsset } from "./observed-history-contract.js";
import type { Dataset, ObservedAsset } from "./ingestion-contract.js";
import { OBSERVED_STOCK_REFERENCE_CATALOG, type StockReferenceEntry } from "./stock-reference-catalog.js";
import { normalizeSearchText, parseSearchQuery } from "./stock-search.js";
import { withinTimeout } from "./platform/health/dependency-probes.js";
import { DEFAULT_SYMBOL_REGISTRY, type SymbolProfile, type SymbolRegistry } from "./symbol-registry.js";

export interface ObservedSearchResponse {
  data: Array<{
    asset: ObservedAsset;
    companyName: string;
    aliases: string[];
    hasData: boolean;
    reference: { origin: "curated_reference"; officialSources: string[]; reviewedOn: string };
  }>;
  meta: { scope: "stored observed equities"; label: string; provider: "KBS";
    dataset: Dataset | null; sourceAsOf: null; collectedAt: null; freshness: "unknown"; coverage: string[]; availability: "catalog_only"; assetOrigin: "stored_observed_asset" };
}
export interface ObservedSearchReader { search(query: string): Promise<ObservedSearchResponse> }

/** Builds the canonical observed equity asset object for a registered equity symbol profile. */
function canonicalObservedEquityAsset(profile: SymbolProfile): ObservedAsset {
  return {
    assetId: profile.assetId,
    symbol: profile.symbol,
    assetType: "equity",
    currency: "VND",
    unit: "VND",
    timezone: "Asia/Ho_Chi_Minh",
  };
}

/** Builds the ordered list of registered equity catalog entries paired with their curated company references. */
function buildCatalogEntries(registry: SymbolRegistry, catalog: readonly StockReferenceEntry[]) {
  return registry.symbols
    .filter(profile => profile.assetType === "equity")
    .flatMap(profile => {
      const entry = catalog.find(item => item.symbol === profile.symbol);
      return entry ? [{ profile, entry }] : [];
    });
}

export class ObservedSearchService implements ObservedSearchReader {
  private readonly entries: ReturnType<typeof buildCatalogEntries>;
  private readonly coverage: string[];
  constructor(
    private readonly db: Db,
    private readonly timeoutMs = 1000,
    private readonly registry: SymbolRegistry = DEFAULT_SYMBOL_REGISTRY,
    private readonly catalog: readonly StockReferenceEntry[] = OBSERVED_STOCK_REFERENCE_CATALOG,
  ) {
    this.entries = buildCatalogEntries(this.registry, this.catalog);
    this.coverage = this.entries.map(item => item.profile.symbol);
  }
  /** Searches registered observed equities against curated company names and aliases, annotating each hit with stored data availability. */
  async search(query: string): Promise<ObservedSearchResponse> {
    const ids = this.entries.map(item => item.profile.assetId);
    const documents = await withinTimeout(() => this.db.collection<Document & { _id: string }>("observed_assets")
      .find({ _id: { $in: ids } }, { projection: observedAssetProjection, maxTimeMS: this.timeoutMs, singleBatch: true }).limit(ids.length).toArray(), this.timeoutMs);
    const byId = new Map(documents.map(document => [(document.record as { assetId?: unknown } | undefined)?.assetId, document]));
    const normalized = normalizeSearchText(query);
    const data: ObservedSearchResponse["data"] = [];
    let dataset: Dataset | null = null;
    for (const { profile, entry } of this.entries) {
      const document = byId.get(profile.assetId);
      const stored = document ? validatedObservedAsset(profile.symbol, document, this.registry) : null;
      if (stored) dataset ??= stored.dataset;
      if ([entry.symbol, entry.companyName, ...entry.aliases].some(term => normalizeSearchText(term).includes(normalized))) {
        data.push({
          asset: stored ? stored.asset : canonicalObservedEquityAsset(profile),
          companyName: entry.companyName,
          aliases: [...entry.aliases],
          hasData: Boolean(stored),
          reference: { origin: "curated_reference", officialSources: [...entry.officialSources], reviewedOn: entry.reviewedOn },
        });
      }
    }
    return {
      data,
      meta: { scope: "stored observed equities", label: `STORED OBSERVED ASSET CATALOG — COVERAGE LIMITED TO ${this.coverage.join(", ")}`, provider: "KBS",
        dataset, sourceAsOf: null, collectedAt: null, freshness: "unknown", coverage: [...this.coverage], availability: "catalog_only", assetOrigin: "stored_observed_asset" },
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
