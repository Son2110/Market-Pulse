import assert from "node:assert/strict";
import test from "node:test";
import { digest, observedContent, validateObservedPayload, type Json } from "../src/ingestion-contract.js";
import { REGISTERED_SYMBOLS, createSymbolRegistry, symbolProfile, symbolProfileByAssetId } from "../src/symbol-registry.js";
import { observed } from "./observed-test-data.js";

test("registry derives canonical equity and index profiles for VN30, representative HNX/UPCOM equities and VNINDEX", () => {
  assert.equal(REGISTERED_SYMBOLS.length, 34);
  assert.equal(REGISTERED_SYMBOLS.filter(item => item.hotBasket === true).length, 31);
  assert.deepEqual(REGISTERED_SYMBOLS.filter(item => item.hotBasket === false).map(item => item.symbol), ["SHS", "PVS", "BSR"]);
  assert.deepEqual(symbolProfile("FPT"), { symbol: "FPT", assetType: "equity", exchange: "HOSE", assetId: "VN:HOSE:FPT", currency: "VND", unit: "VND", adjustmentBasis: "unknown", hotBasket: true });
  assert.deepEqual(symbolProfile("SHS"), { symbol: "SHS", assetType: "equity", exchange: "HNX", assetId: "VN:HNX:SHS", currency: "VND", unit: "VND", adjustmentBasis: "unknown", hotBasket: false });
  assert.deepEqual(symbolProfile("BSR"), { symbol: "BSR", assetType: "equity", exchange: "HOSE", assetId: "VN:HOSE:BSR", currency: "VND", unit: "VND", adjustmentBasis: "unknown", hotBasket: false });
  assert.deepEqual(symbolProfile("VNINDEX"), { symbol: "VNINDEX", assetType: "index", exchange: "INDEX", assetId: "VN:INDEX:VNINDEX", currency: null, unit: "index_point", adjustmentBasis: "not_applicable", hotBasket: true });
  assert.equal(symbolProfileByAssetId("VN:HOSE:FPT")?.symbol, "FPT");
  assert.equal(symbolProfileByAssetId("VN:HNX:SHS")?.symbol, "SHS");
  assert.equal(symbolProfileByAssetId("VN:HOSE:BSR")?.symbol, "BSR");
  assert.equal(symbolProfile("fpt"), null);
  assert.equal(symbolProfile("AAA"), null);
  assert.equal(symbolProfileByAssetId("VN:HOSE:AAA"), null);
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

test("observed contract accepts registered symbols unchanged, preserves exact FPT and VNINDEX digests, and allows custom registries", () => {
  const fpt = observed();
  const vnindex = observed(true);
  assert.doesNotThrow(() => validateObservedPayload(fpt as unknown as Json));
  assert.doesNotThrow(() => validateObservedPayload(vnindex as unknown as Json));
  for (const payload of [fpt, vnindex]) {
    for (const row of payload.candles) {
      assert.equal(row.barId, digest(["KBS", row.assetId, row.interval, row.tradingDate, row.adjustmentBasis]));
      assert.equal(row.contentDigest, digest(observedContent(row)));
    }
    assert.match(digest(payload as unknown as Json), /^[a-f0-9]{64}$/);
  }
  const payload = observed();
  payload.request.symbol = "AAA";
  payload.assets[0]!.symbol = "AAA";
  payload.assets[0]!.assetId = "VN:HOSE:AAA";
  for (const row of payload.candles) {
    row.assetId = "VN:HOSE:AAA";
    row.barId = digest(["KBS", row.assetId, row.interval, row.tradingDate, row.adjustmentBasis]);
    row.contentDigest = digest(observedContent(row));
  }
  assert.throws(() => validateObservedPayload(payload as unknown as Json));
  const customRegistry = createSymbolRegistry({
    version: 1,
    symbols: [
      { symbol: "FPT", assetType: "equity", exchange: "HOSE" },
      { symbol: "AAA", assetType: "equity", exchange: "HOSE" },
      { symbol: "VNINDEX", assetType: "index", exchange: "INDEX" },
    ],
  });
  assert.doesNotThrow(() => validateObservedPayload(payload as unknown as Json, customRegistry));
});
