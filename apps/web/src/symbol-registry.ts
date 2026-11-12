export type SymbolAssetType = "equity" | "index";

export interface SymbolProfile {
  symbol: string;
  assetType: SymbolAssetType;
  exchange: string;
  assetId: string;
  currency: "VND" | null;
  unit: "VND" | "index_point";
  adjustmentBasis: "unknown" | "not_applicable";
}

export interface SymbolRegistry {
  readonly symbols: readonly SymbolProfile[];
  profile(symbol: string): SymbolProfile | null;
  profileByAssetId(assetId: string): SymbolProfile | null;
}

export interface SymbolRegistryDocument {
  version: number;
  symbols: Array<{ symbol: string; assetType: string; exchange: string }>;
}

const SYMBOL = /^[A-Z0-9]{1,12}$/u;
const EXCHANGES = new Set(["HOSE", "HNX", "UPCOM", "INDEX"]);

/** Validates a raw symbol registry entry and derives its canonical asset profile. */
function profile(entry: { symbol: string; assetType: string; exchange: string }): SymbolProfile {
  const index = entry.assetType === "index";
  if (!SYMBOL.test(entry.symbol) || !EXCHANGES.has(entry.exchange) || (entry.assetType !== "equity" && !index) || (index !== (entry.exchange === "INDEX"))) {
    throw new Error("Invalid symbol registry entry");
  }
  return {
    symbol: entry.symbol,
    assetType: index ? "index" : "equity",
    exchange: entry.exchange,
    assetId: `VN:${entry.exchange}:${entry.symbol}`,
    currency: index ? null : "VND",
    unit: index ? "index_point" : "VND",
    adjustmentBasis: index ? "not_applicable" : "unknown",
  };
}

/** Validates a registry document and derives each symbol's canonical profile. */
export function createSymbolRegistry(document: SymbolRegistryDocument): SymbolRegistry {
  if (document.version !== 1 || !Array.isArray(document.symbols) || document.symbols.length === 0) {
    throw new Error("Invalid symbol registry");
  }
  const bySymbol = new Map<string, SymbolProfile>();
  for (const entry of document.symbols) {
    const item = profile(entry);
    if (bySymbol.has(item.symbol)) throw new Error("Duplicate symbol registry entry");
    bySymbol.set(item.symbol, item);
  }
  const symbols = Object.freeze([...bySymbol.values()]);
  return {
    symbols,
    profile: symbol => bySymbol.get(symbol) ?? null,
    profileByAssetId: assetId => symbols.find(item => item.assetId === assetId) ?? null,
  };
}

const DEFAULT_DOCUMENT: SymbolRegistryDocument = {
  version: 1,
  symbols: [
    { symbol: "FPT", assetType: "equity", exchange: "HOSE" },
    { symbol: "VNINDEX", assetType: "index", exchange: "INDEX" },
  ],
};

/** Default frontend symbol registry synchronized with packages/schemas/symbol-registry-v1.json. */
export const DEFAULT_SYMBOL_REGISTRY: SymbolRegistry = createSymbolRegistry(DEFAULT_DOCUMENT);

/** Registered symbols in registry order. */
export const REGISTERED_SYMBOLS: readonly SymbolProfile[] = DEFAULT_SYMBOL_REGISTRY.symbols;

/** Registered equity symbols in registry order. */
export const REGISTERED_EQUITY_SYMBOLS: readonly string[] = Object.freeze(
  REGISTERED_SYMBOLS.filter(item => item.assetType === "equity").map(item => item.symbol),
);

/** Look up an already-normalized upper-case symbol; unregistered symbols return null. */
export function symbolProfile(symbol: string, registry: SymbolRegistry = DEFAULT_SYMBOL_REGISTRY): SymbolProfile | null {
  return registry.profile(symbol);
}

/** Look up a registered equity symbol profile; returns null for indices or unregistered symbols. */
export function equityProfile(symbol: string, registry: SymbolRegistry = DEFAULT_SYMBOL_REGISTRY): SymbolProfile | null {
  const item = registry.profile(symbol);
  return item?.assetType === "equity" ? item : null;
}

/** Builds the canonical observed equity asset object for a registered equity symbol. */
export function observedEquityAsset(profileItem: SymbolProfile): {
  assetId: string;
  symbol: string;
  assetType: "equity";
  currency: "VND";
  unit: "VND";
  timezone: "Asia/Ho_Chi_Minh";
} {
  return {
    assetId: profileItem.assetId,
    symbol: profileItem.symbol,
    assetType: "equity",
    currency: "VND",
    unit: "VND",
    timezone: "Asia/Ho_Chi_Minh",
  };
}
