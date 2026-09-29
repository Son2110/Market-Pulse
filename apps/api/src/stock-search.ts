import type { Router } from "express";
import { Router as createRouter } from "express";
import type { AssetCatalogProvider, CanonicalAsset } from "./market-data.js";
import { STOCK_REFERENCE_CATALOG, type StockReferenceEntry } from "./stock-reference-catalog.js";

export const MAX_SEARCH_QUERY_CODEPOINTS = 100;
const EXPECTED_EQUITY_COUNT = 10;

export interface StockSearchResult {
  asset: CanonicalAsset;
  companyName: string;
  aliases: string[];
  reference: {
    officialSources: string[];
    reviewedOn: string;
  };
}

interface IndexedStock extends StockSearchResult {
  normalizedSymbol: string;
  normalizedTerms: string[];
}

function normalizeSearchText(value: string): string {
  return value.normalize("NFD")
    .toLocaleLowerCase("vi-VN")
    .replace(/\p{M}/gu, "")
    .replace(/đ/gu, "d")
    .replace(/ß/gu, "ss")
    .replace(/ς/gu, "σ")
    .replace(/\s+/gu, " ")
    .trim();
}

function validCatalogEntry(entry: StockReferenceEntry): boolean {
  if (!/^[A-Z0-9][A-Z0-9._-]{0,31}$/.test(entry.symbol)) return false;
  if (typeof entry.companyName !== "string" || entry.companyName.trim().length === 0) return false;
  if (!Array.isArray(entry.aliases) || entry.aliases.some((alias) => typeof alias !== "string" || alias.trim().length === 0)) return false;
  if (!Array.isArray(entry.officialSources) || entry.officialSources.length === 0) return false;
  if (entry.officialSources.some((source) => {
    try {
      return new URL(source).protocol !== "https:";
    } catch {
      return true;
    }
  })) return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(entry.reviewedOn);
}

function alphabetical(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export class StockSearchUnavailableError extends Error {
  constructor() {
    super("Stock search is unavailable.");
    this.name = "StockSearchUnavailableError";
  }
}

export class StockSearchService {
  private indexedStocks: IndexedStock[] | undefined;

  constructor(
    private readonly provider: AssetCatalogProvider,
    private readonly catalog: readonly StockReferenceEntry[] = STOCK_REFERENCE_CATALOG,
  ) {}

  get ready(): boolean {
    return this.indexedStocks !== undefined;
  }

  async initialize(): Promise<void> {
    this.indexedStocks = undefined;
    try {
      if (this.catalog.length !== EXPECTED_EQUITY_COUNT) throw new Error();
      const catalogSymbols = new Set<string>();
      for (const entry of this.catalog) {
        if (!validCatalogEntry(entry) || catalogSymbols.has(entry.symbol)) throw new Error();
        catalogSymbols.add(entry.symbol);
      }

      const assets = await this.provider.getAssets();
      if (!Array.isArray(assets)) throw new Error();
      const equities = assets.filter((asset) => asset.assetType === "equity");
      if (equities.length !== EXPECTED_EQUITY_COUNT) throw new Error();

      const assetsBySymbol = new Map<string, CanonicalAsset>();
      const assetIds = new Set<string>();
      for (const asset of equities) {
        if (!asset.symbol || !asset.assetId || assetsBySymbol.has(asset.symbol) || assetIds.has(asset.assetId)) throw new Error();
        assetsBySymbol.set(asset.symbol, asset);
        assetIds.add(asset.assetId);
      }
      if (assetsBySymbol.size !== catalogSymbols.size || [...catalogSymbols].some((symbol) => !assetsBySymbol.has(symbol))) throw new Error();

      this.indexedStocks = this.catalog.map((entry) => {
        const asset = assetsBySymbol.get(entry.symbol);
        if (!asset) throw new Error();
        return {
          asset: structuredClone(asset),
          companyName: entry.companyName,
          aliases: [...entry.aliases],
          reference: {
            officialSources: [...entry.officialSources],
            reviewedOn: entry.reviewedOn,
          },
          normalizedSymbol: normalizeSearchText(asset.symbol),
          normalizedTerms: [entry.companyName, ...entry.aliases].map(normalizeSearchText),
        };
      });
    } catch {
      this.indexedStocks = undefined;
      throw new StockSearchUnavailableError();
    }
  }

  search(query: string): StockSearchResult[] {
    if (!this.indexedStocks) throw new StockSearchUnavailableError();
    const normalizedQuery = normalizeSearchText(query);
    const matches = this.indexedStocks.filter((stock) => (
      stock.normalizedSymbol.includes(normalizedQuery)
      || stock.normalizedTerms.some((term) => term.includes(normalizedQuery))
    ));

    return matches.sort((left, right) => {
      const rank = (stock: IndexedStock) => (
        stock.normalizedSymbol === normalizedQuery ? 0
          : stock.normalizedSymbol.startsWith(normalizedQuery) ? 1
            : 2
      );
      return rank(left) - rank(right) || alphabetical(left.asset.symbol, right.asset.symbol);
    }).map((stock) => ({
      asset: structuredClone(stock.asset),
      companyName: stock.companyName,
      aliases: [...stock.aliases],
      reference: {
        officialSources: [...stock.reference.officialSources],
        reviewedOn: stock.reference.reviewedOn,
      },
    }));
  }
}

interface ParsedSearchQuery {
  query: string;
}

function parseSearchQuery(originalUrl: string): ParsedSearchQuery | null {
  const parameters = new URL(originalUrl, "http://localhost").searchParams;
  const keys = [...parameters.keys()];
  if (keys.length !== 1 || keys[0] !== "q") return null;
  const values = parameters.getAll("q");
  if (values.length !== 1) return null;
  const query = values[0];
  if (query === undefined || query.trim().length === 0) return null;
  if (Array.from(query).length > MAX_SEARCH_QUERY_CODEPOINTS) return null;
  if (normalizeSearchText(query).length === 0) return null;
  return { query };
}

export function createStockSearchRouter(service: StockSearchService): Router {
  const router = createRouter();
  router.get("/search", (request, response) => {
    response.set("Cache-Control", "no-store");
    const parsed = parseSearchQuery(request.originalUrl);
    if (!parsed) {
      response.status(400).json({ error: "invalid_query" });
      return;
    }
    try {
      const data = service.search(parsed.query);
      response.status(200).json({
        data,
        meta: {
          scope: "fixture equities",
          dataset: "fixture / unknown",
          label: "SYNTHETIC FIXTURE — NOT MARKET DATA",
          provider: "marketpulse-fixture",
          asOf: null,
        },
      });
    } catch {
      response.status(503).json({ error: "asset_search_unavailable" });
    }
  });
  return router;
}
