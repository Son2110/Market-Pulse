import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { canonicalJson, digest, strictJson, type Json } from "../src/ingestion-contract.js";
import { validatePayload } from "../src/ingestion-contract.js";
import { validateGoldPayload } from "../src/gold-contract.js";
import { gold, goldOne, sealGold, asJson } from "./gold-test-data.js";

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

test("gold Node/Python shared mutation corpus preserves decimal, microsecond and calendar parity", () => {
  assert.doesNotThrow(() => validatePayload(asJson(gold())));
  const cases = JSON.parse(readFileSync("apps/api/tests/gold-parity.json", "utf8")) as { name: string; index: number; sets: [(string | number)[], Json][]; seal: boolean; valid: boolean }[];
  for (const entry of cases) {
    const payload = goldOne(entry.index); const row = payload.observations[0]!;
    for (const [path, value] of entry.sets) {
      let cursor = row as unknown as Record<string | number, Json>;
      for (const part of path.slice(0, -1)) cursor = cursor[part] as Record<string | number, Json>;
      cursor[path.at(-1)!] = value;
    }
    if (entry.seal) sealGold(row);
    if (entry.valid) assert.doesNotThrow(() => validatePayload(asJson(payload)), entry.name);
    else assert.throws(() => validatePayload(asJson(payload)), Error, entry.name);
  }
});

test("gold closed objects, array bound, fixture labels and exclusive routing reject mixed envelopes", () => {
  for (const path of [[], ["dataset"], ["observations", 0], ...["quotes", "time", "qualityFlags", "provenance"].map(key => ["observations", 0, key])] as (string | number)[][]) {
    const payload = asJson(goldOne()); let cursor = payload as Record<string | number, Json>;
    for (const part of path) cursor = cursor[part] as Record<string | number, Json>;
    cursor.extra = "unexpected"; assert.throws(() => validateGoldPayload(payload)); delete cursor.extra;
    delete cursor[Object.keys(cursor)[0]!]; assert.throws(() => validateGoldPayload(payload));
  }
  const empty = goldOne(); empty.observations = []; assert.throws(() => validatePayload(asJson(empty)));
  const bounded = goldOne(); bounded.observations = Array.from({ length: 500 }, () => bounded.observations[0]!);
  assert.doesNotThrow(() => validatePayload(asJson(bounded))); bounded.observations.push(bounded.observations[0]!); assert.throws(() => validatePayload(asJson(bounded)));
  const fixture = strictJson(readFileSync("fixtures/market/mp-02-synthetic.json", "utf8")) as Record<string, Json>;
  fixture.observations = asJson(goldOne()); assert.throws(() => validatePayload(fixture));
  const mixed = { ...goldOne(), assets: [] }; assert.throws(() => validatePayload(mixed as unknown as Json));
  for (const [group, field, value] of [["dataset", "mode", "observed"], ["dataset", "label", "market data"], ["dataset", "freshness", "fresh"], ["dataset", "timezone", "UTC"]]) {
    const payload = asJson(goldOne()) as Record<string, Json>; (payload[group!] as Record<string, Json>)[field!] = value!; assert.throws(() => validatePayload(payload));
  }
  for (const [field, value] of [["provider", "PNJ"], ["brand", "PNJ"], ["product", "world_gold"], ["purity", "995"], ["region", ""], ["region", " region"], ["requestedRegion", "region\n"]]) {
    const payload = goldOne(); payload.observations[0]![field!] = value!; assert.throws(() => validatePayload(asJson(payload)));
  }
});
