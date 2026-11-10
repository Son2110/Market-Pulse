import assert from "node:assert/strict";
import test from "node:test";
import { validateObservedPayload, type Json } from "../src/ingestion-contract.js";
import { REGISTERED_SYMBOLS, createSymbolRegistry, symbolProfile, symbolProfileByAssetId } from "../src/symbol-registry.js";
import { observed } from "./observed-test-data.js";

test("registry derives canonical equity and index profiles for FPT and VNINDEX", () => {
  assert.deepEqual(REGISTERED_SYMBOLS.map(item => item.symbol), ["FPT", "VNINDEX"]);
  assert.deepEqual(symbolProfile("FPT"), { symbol: "FPT", assetType: "equity", exchange: "HOSE", assetId: "VN:HOSE:FPT", currency: "VND", unit: "VND", adjustmentBasis: "unknown" });
  assert.deepEqual(symbolProfile("VNINDEX"), { symbol: "VNINDEX", assetType: "index", exchange: "INDEX", assetId: "VN:INDEX:VNINDEX", currency: null, unit: "index_point", adjustmentBasis: "not_applicable" });
  assert.equal(symbolProfileByAssetId("VN:HOSE:FPT")?.symbol, "FPT");
  assert.equal(symbolProfile("fpt"), null);
  assert.equal(symbolProfile("VCB"), null);
  assert.equal(symbolProfileByAssetId("VN:HOSE:VCB"), null);
});

test("registry factory supports other exchanges and rejects malformed or duplicate entries", () => {
  const registry = createSymbolRegistry({ version: 1, symbols: [
    { symbol: "VCB", assetType: "equity", exchange: "HOSE" }, { symbol: "SHS", assetType: "equity", exchange: "HNX" },
    { symbol: "BSR", assetType: "equity", exchange: "UPCOM" }, { symbol: "VN30", assetType: "index", exchange: "INDEX" },
  ] });
  assert.deepEqual(registry.symbols.map(item => item.assetId), ["VN:HOSE:VCB", "VN:HNX:SHS", "VN:UPCOM:BSR", "VN:INDEX:VN30"]);
  assert.equal(registry.profile("SHS")?.adjustmentBasis, "unknown");
  assert.equal(registry.profile("VN30")?.currency, null);
  const entry = { symbol: "VCB", assetType: "equity", exchange: "HOSE" };
  for (const document of [
    { version: 2, symbols: [entry] }, { version: 1, symbols: [] }, { version: 1, symbols: [entry, entry] },
    { version: 1, symbols: [{ ...entry, symbol: "vcb" }] }, { version: 1, symbols: [{ ...entry, symbol: "ABCDEFGHIJKLM" }] },
    { version: 1, symbols: [{ ...entry, exchange: "NYSE" }] }, { version: 1, symbols: [{ ...entry, exchange: "INDEX" }] },
    { version: 1, symbols: [{ symbol: "X", assetType: "index", exchange: "HOSE" }] }, { version: 1, symbols: [{ ...entry, assetType: "fund" }] },
  ]) assert.throws(() => createSymbolRegistry(document));
});

test("observed contract accepts registered symbols unchanged and rejects schema-valid unregistered symbols", () => {
  assert.doesNotThrow(() => validateObservedPayload(observed() as unknown as Json));
  assert.doesNotThrow(() => validateObservedPayload(observed(true) as unknown as Json));
  const payload = observed();
  payload.request.symbol = "VCB";
  payload.assets[0]!.symbol = "VCB";
  payload.assets[0]!.assetId = "VN:HOSE:VCB";
  for (const row of payload.candles) row.assetId = "VN:HOSE:VCB";
  assert.throws(() => validateObservedPayload(payload as unknown as Json));
});
