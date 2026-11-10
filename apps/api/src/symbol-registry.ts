import { readFileSync } from "node:fs";

export type SymbolAssetType = "equity" | "index";
export interface SymbolProfile {
  symbol: string; assetType: SymbolAssetType; exchange: string; assetId: string;
  currency: "VND" | null; unit: "VND" | "index_point"; adjustmentBasis: "unknown" | "not_applicable";
}

const SYMBOL = /^[A-Z0-9]{1,12}$/u;
const EXCHANGES = new Set(["HOSE", "HNX", "UPCOM", "INDEX"]);

function profile(entry: { symbol: string; assetType: string; exchange: string }): SymbolProfile {
  const index = entry.assetType === "index";
  if (!SYMBOL.test(entry.symbol) || !EXCHANGES.has(entry.exchange) || (entry.assetType !== "equity" && !index) || (index !== (entry.exchange === "INDEX"))) {
    throw new Error("Invalid symbol registry entry");
  }
  return {
    symbol: entry.symbol, assetType: index ? "index" : "equity", exchange: entry.exchange,
    assetId: `VN:${entry.exchange}:${entry.symbol}`, currency: index ? null : "VND",
    unit: index ? "index_point" : "VND", adjustmentBasis: index ? "not_applicable" : "unknown",
  };
}

export interface SymbolRegistry {
  readonly symbols: readonly SymbolProfile[];
  profile(symbol: string): SymbolProfile | null;
  profileByAssetId(assetId: string): SymbolProfile | null;
}
export interface SymbolRegistryDocument { version: number; symbols: Array<{ symbol: string; assetType: string; exchange: string }> }

/** Validates a registry document and derives each symbol's canonical profile. */
export function createSymbolRegistry(document: SymbolRegistryDocument): SymbolRegistry {
  if (document.version !== 1 || !Array.isArray(document.symbols) || document.symbols.length === 0) throw new Error("Invalid symbol registry");
  const bySymbol = new Map<string, SymbolProfile>();
  for (const entry of document.symbols) {
    const item = profile(entry);
    if (bySymbol.has(item.symbol)) throw new Error("Duplicate symbol registry entry");
    bySymbol.set(item.symbol, item);
  }
  const symbols = Object.freeze([...bySymbol.values()]);
  return { symbols, profile: symbol => bySymbol.get(symbol) ?? null, profileByAssetId: assetId => symbols.find(item => item.assetId === assetId) ?? null };
}

const registry = createSymbolRegistry(JSON.parse(readFileSync(new URL("../../../packages/schemas/symbol-registry-v1.json", import.meta.url), "utf8")) as SymbolRegistryDocument);

/** Registered symbols in registry order. */
export const REGISTERED_SYMBOLS: readonly SymbolProfile[] = registry.symbols;
/** Look up an already-normalized upper-case symbol; unregistered symbols return null. */
export const symbolProfile = (symbol: string): SymbolProfile | null => registry.profile(symbol);
/** Look up a stored canonical asset ID. */
export const symbolProfileByAssetId = (assetId: string): SymbolProfile | null => registry.profileByAssetId(assetId);
