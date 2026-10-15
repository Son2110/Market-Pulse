import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { canonicalJson, digest, strictJson, type Json } from "../src/ingestion-contract.js";

type GoldRow = {
  assetId: string; snapshotId: string; contentDigest: string;
  provider: string; brand: string; product: string; purity: string; region: string | null;
  time: { sourceAsOf: string | null; collectedAt: string };
  quotes: Record<string, Json>; provenance: Record<string, Json>;
};
const rows = (strictJson(readFileSync("fixtures/gold/mp-gold-synthetic.json", "utf8")) as unknown as { observations: GoldRow[] }).observations;
const series = (row: GoldRow): Json[] => ["gold_asset", row.provider, row.brand, row.product, row.purity, row.region];
const snapshot = (row: GoldRow): Json[] => [row.assetId, row.time.sourceAsOf === null ? `observation:${row.time.collectedAt}` : `source:${row.time.sourceAsOf}`];
const content = (row: GoldRow): Json => ({
  assetId: row.assetId, sourceAsOf: row.time.sourceAsOf,
  quotes: Object.fromEntries(["buy", "sell", "spread", "currency", "unit"].map(key => [key, row.quotes[key]!])),
  provenance: Object.fromEntries(["provider", "originalBuy", "originalSell", "originalUnit", "conversionFactor"].map(key => [key, row.provenance[key]!])),
});

test("gold RFC 8785 Unicode and committed Python golden identities agree", () => {
  const first = rows[0]!;
  assert.equal(canonicalJson(series(first)), '["gold_asset","marketpulse-fixture","SJC","gold_bar_sjc","999.9","Hồ Chí Minh"]');
  assert.equal(digest(series(first)), "2904f49d38ee84fe6e091f593fad4fbc24712573280be3a603ddbed0f49b65f8");
  assert.equal(digest(snapshot(first)), "a5142ae6f8869ebdddcb7bd03b417c186e5d9508047cbf80761bcb54920c2b40");
  assert.equal(digest(content(first)), "f9886eda80332388a22daebe2bd65f826b118fdd67206a000b2a2340314c3861");
  for (const row of rows) {
    assert.equal(digest(series(row)), row.assetId);
    assert.equal(digest(snapshot(row)), row.snapshotId);
    assert.equal(digest(content(row)), row.contentDigest);
  }
  const unknown = rows[5]!;
  assert.ok(canonicalJson(series(unknown)).endsWith(",null]"));
  assert.notEqual(digest(series(unknown)), digest(series({ ...unknown, region: "null" })));
});

test("gold snapshot keys distinguish known source time, unknown refetch and replay", () => {
  const first = rows[0]!;
  const unknown = { ...first, time: { sourceAsOf: null, collectedAt: first.time.sourceAsOf! } };
  assert.notEqual(digest(snapshot(first)), digest(snapshot(unknown)));
  assert.notEqual(rows[9]!.snapshotId, rows[10]!.snapshotId);
  assert.equal(rows[9]!.contentDigest, rows[10]!.contentDigest);
  assert.equal(digest(snapshot(structuredClone(rows[9]!))), rows[9]!.snapshotId);
});

test("gold economic digest preserves A-B-A and excludes collection metadata", () => {
  assert.equal(rows[0]!.snapshotId, rows[1]!.snapshotId);
  assert.equal(rows[0]!.snapshotId, rows[2]!.snapshotId);
  assert.notEqual(rows[0]!.contentDigest, rows[1]!.contentDigest);
  assert.equal(rows[0]!.contentDigest, rows[2]!.contentDigest);
  assert.notEqual(rows[0]!.snapshotId, rows[3]!.snapshotId);
  const changed = structuredClone(rows[0]!);
  changed.time.collectedAt = "2026-10-15T05:00:00.000000Z";
  changed.provenance.adapterVersion = "1.0.1";
  changed.provenance.sourceUrl = "https://marketpulse.invalid/gold/replay";
  assert.equal(digest(content(changed)), rows[0]!.contentDigest);
  changed.quotes.spread = "0.5";
  assert.notEqual(digest(content(changed)), rows[0]!.contentDigest);
});
