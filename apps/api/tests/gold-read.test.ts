import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { goldAsset } from "../src/gold-contract.js";
import { goldReadResponse, parseGoldHistoryQuery, parseGoldLatestQuery } from "../src/gold-read-contract.js";
import { createGoldReadRouter, type GoldReader } from "../src/gold-read.js";
import { createApp } from "../src/health.js";
import { digest, type Json } from "../src/ingestion-contract.js";
import { goldOne, sealGold } from "./gold-test-data.js";

const bounds = "provider=marketpulse-fixture&product=gold_bar_sjc&from=2026-10-01&to=2026-10-31";
const history = (suffix = "") => parseGoldHistoryQuery(`/history?${bounds}${suffix}`)!;
function stored(index = 0) {
  const payload = goldOne(index); const row = payload.observations[0]!;
  const definition = goldAsset(row);
  return { payload, asset: { _id: row.assetId, record: definition, rowDigest: digest(definition), dataset: payload.dataset, schemaVersion: payload.schemaVersion, firstDeliveryId: "private" },
    document: { _id: row.snapshotId, assetId: row.assetId, snapshotId: row.snapshotId, contentDigest: row.contentDigest, sourceVerified: row.time.sourceAsOf !== null,
      sourceOrder: row.time.sourceAsOf ?? "", collectedOrder: row.time.collectedAt, record: row, dataset: payload.dataset, schemaVersion: payload.schemaVersion, deliveryId: "private" } };
}
test("gold query parsing is exact and bounds explicit series, calendar and pagination", () => {
  assert.equal(history().region, undefined);
  assert.equal(history().assetId, digest(["gold_asset", "marketpulse-fixture", "SJC", "gold_bar_sjc", "999.9", null]));
  assert.notEqual(history("&region=null").assetId, history().assetId);
  assert.equal(history("&region=H%E1%BB%93+Ch%C3%AD+Minh").region, "Hồ Chí Minh");
  assert.notEqual(history("&region=%C3%A9").assetId, history("&region=e%CC%81").assetId);
  assert(history(`&region=${"a".repeat(128)}`));
  assert.equal(parseGoldHistoryQuery(`/?${bounds}&region=${"a".repeat(129)}`), null);
  assert.equal(parseGoldHistoryQuery("/?provider=marketpulse-fixture&product=plain_ring_9999&from=0001-01-01&to=0001-01-01")!.brand, "PNJ");
  assert(parseGoldHistoryQuery("/?provider=marketpulse-fixture&product=gold_bar_sjc&from=2024-02-29&to=2024-03-31"));
  for (const suffix of ["&provider=marketpulse-fixture", "&brand=PNJ", "&purity=9999", "&unit=VND", "&region=", "&region=+north", "&region=north%0A", "&region=%C2%A0north", "&limit=0", "&limit=01", "&limit=501", "&limit=1e2", "&limit=1.0", "&page=0", "&page=-1", "&page=100002&limit=1", "&page=201&limit=500&limit=500", "&source=fixture", "&revisions=true", "&assetId=x", "&refresh=true", "&region[]=north", "&page=%201"]) assert.equal(parseGoldHistoryQuery(`/?${bounds}${suffix}`), null, suffix);
  for (const [from, to] of [["0000-01-01", "0000-01-01"], ["2026-02-29", "2026-03-01"], ["2026-10-02", "2026-10-01"], ["2026-10-01", "2026-11-02"], ["2026-1-01", "2026-01-01"]]) assert.equal(parseGoldHistoryQuery(`/?provider=marketpulse-fixture&product=gold_bar_sjc&from=${from}&to=${to}`), null);
  for (const query of ["", "?provider=marketpulse-fixture", "?product=gold_bar_sjc", "?from=2026-10-01&to=2026-10-02"]) assert.equal(parseGoldHistoryQuery(`/${query}`), null);
  assert.equal(parseGoldLatestQuery("/")!.limit, 100);
  assert.equal(parseGoldLatestQuery("/?limit=500&page=201")!.offset, 100000);
  assert.equal(parseGoldLatestQuery("/?limit=500&page=202"), null);
  for (const query of ["provider=other", "product=GOLD_BAR_SJC", "brand=SJC", "from=2026-10-01", "page=1&page=1", "page=1%0A", "limit=1%0D%0A", "unit=", "unit=chi", "unit=tael", "unknown=x"]) assert.equal(parseGoldLatestQuery(`/?${query}`), null, query);
});

test("gold public rows recursively whitelist fields and retain identity, nullable quotes, source and original provenance", () => {
  const c = stored();
  Object.assign(c.document, { private: "private" });
  (c.document.record.quotes as Record<string, Json>).extra = "private";
  (c.document.record.provenance as Record<string, Json>).token = "private";
  const result = goldReadResponse(history("&region=H%E1%BB%93+Ch%C3%AD+Minh"), [c.document], 1, [c.asset], history("&region=H%E1%BB%93+Ch%C3%AD+Minh"));
  const row = result.data[0]!;
  assert.equal(row.assetId, c.document.assetId); assert.equal(row.snapshotId, c.document.snapshotId);
  assert.equal(row.requestedRegion, "01"); assert.equal(row.time.collectedAt, c.document.record.time.collectedAt);
  assert.equal(row.provenance.sourceUrl, "https://marketpulse.invalid/gold/synthetic");
  assert(!/(private|"contentDigest"|"deliveryId"|"firstDeliveryId"|"rowDigest"|"collectedOrder"|"sourceOrder"|"sourceVerified"|"_id"|"extra"|"token")/.test(JSON.stringify(result)));
  assert.equal(result.metadata.completeness, "unknown"); assert.equal(result.metadata.freshness, "fixture / unknown");
  const empty = goldReadResponse(history(), [], 0, [{ ...c.asset, _id: history().assetId, record: { ...c.asset.record, region: null, assetId: history().assetId }, rowDigest: digest({ ...c.asset.record, region: null, assetId: history().assetId }) }], history());
  assert.equal(empty.metadata.status, "no_data"); assert.equal(empty.metadata.totalPages, 0);
});

test("gold chi presentation is exact at 128-character precision and tiny fractions without mutating storage", () => {
  for (const [buy, sell, spread] of [["9".repeat(128), "9".repeat(128), "0"], [`0.${"0".repeat(125)}1`, null, null], ["11", "1", "-10"]] as const) {
    const c = stored(); const row = c.payload.observations[0]!;
    row.quotes = { ...row.quotes, buy, sell, spread };
    row.provenance = { ...row.provenance, originalBuy: buy, originalSell: sell, originalUnit: "vnd_per_tael", conversionFactor: "1" };
    row.qualityFlags.priceIntegrity = spread === "-10" ? "spread_inverted" : "valid";
    sealGold(row); Object.assign(c.document, { contentDigest: row.contentDigest });
    const before = structuredClone(c.document);
    const query = parseGoldLatestQuery("/?unit=vnd_per_chi")!;
    const result = goldReadResponse(query, [{ ...c.document, _id: row.assetId }], 1, [c.asset]);
    const actual = result.data[0]!;
    assert.equal(actual.quotes.buy, buy.length === 128 && buy[0] === "9" ? `${"9".repeat(127)}.9` : buy.startsWith("0.") ? `0.${"0".repeat(126)}1` : "1.1");
    assert.equal(actual.quotes.sell, sell === null ? null : sell === "1" ? "0.1" : `${"9".repeat(127)}.9`);
    assert.equal(actual.quotes.spread, spread === null ? null : spread === "-10" ? "-1" : "0");
    assert.equal(actual.provenance.conversionFactor, "1"); assert.equal(actual.quotes.unit, "vnd_per_chi");
    assert.equal(result.metadata.presentationConversionFactor, "0.1"); assert.deepEqual(c.document, before);
    assert(!JSON.stringify(actual).includes("contentDigest"));
  }
});

test("gold selected stored canonical values, identities, datasets and ordering fail closed", () => {
  for (const mutate of [
    (c: ReturnType<typeof stored>) => { c.document.dataset.label = "real"; },
    (c: ReturnType<typeof stored>) => { c.asset.rowDigest = "bad"; },
    (c: ReturnType<typeof stored>) => { c.asset.record.region = "other"; },
    (c: ReturnType<typeof stored>) => { c.document._id = "bad"; },
    (c: ReturnType<typeof stored>) => { c.document.assetId = "bad"; },
    (c: ReturnType<typeof stored>) => { c.document.contentDigest = "bad"; },
    (c: ReturnType<typeof stored>) => { c.document.sourceVerified = false; },
    (c: ReturnType<typeof stored>) => { c.document.sourceOrder = "bad"; },
    (c: ReturnType<typeof stored>) => { c.document.collectedOrder = "bad"; },
    (c: ReturnType<typeof stored>) => { c.document.record.time.collectedAt = "2026-02-30T00:00:00.000000Z"; sealGold(c.document.record); },
    (c: ReturnType<typeof stored>) => { c.document.record.quotes.buy = "1"; },
  ]) { const c = stored(); mutate(c); assert.throws(() => goldReadResponse(history("&region=H%E1%BB%93+Ch%C3%AD+Minh"), [c.document], 1, [c.asset], history("&region=H%E1%BB%93+Ch%C3%AD+Minh"))); }
  const c = stored(); const query = history("&region=H%E1%BB%93+Ch%C3%AD+Minh");
  assert.throws(() => goldReadResponse(query, [c.document, c.document], 2, [c.asset], query));
  assert.throws(() => goldReadResponse(query, [c.document], 1, [], query));
});

test("gold HTTP validates before reading and returns sanitized no-store errors and disabled 404", async t => {
  let called = 0;
  const reader: GoldReader = { latest: async () => { called++; throw new Error("private token"); }, history: async () => { called++; return null; } };
  const server = createServer(createApp({ checks: { mongo: async () => true, redis: async () => true }, goldReadRouter: createGoldReadRouter(reader) }));
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address(); assert(address && typeof address === "object"); const base = `http://127.0.0.1:${address.port}/api/gold/quotes`;
  for (const [path, status, error] of [["latest?source=fixture", 400, "invalid_query"], ["history", 400, "invalid_query"], ["latest", 503, "gold_latest_unavailable"], [`history?${bounds}`, 404, "product_not_found"]] as const) {
    const response = await fetch(`${base}/${path}`); assert.equal(response.status, status); assert.deepEqual(await response.json(), { error }); assert.equal(response.headers.get("cache-control"), "no-store");
  }
  assert.equal(called, 2);
  const unavailable = createServer(createApp({ checks: { mongo: async () => true, redis: async () => true }, goldReadRouter: createGoldReadRouter(reader, () => false) }));
  await new Promise<void>(resolve => unavailable.listen(0, "127.0.0.1", resolve)); t.after(() => new Promise<void>(resolve => unavailable.close(() => resolve())));
  const unavailableAddress = unavailable.address(); assert(unavailableAddress && typeof unavailableAddress === "object");
  const response = await fetch(`http://127.0.0.1:${unavailableAddress.port}/api/gold/quotes/history?${bounds}`);
  assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: "gold_history_unavailable" }); assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(called, 2);
});
