import assert from "node:assert/strict";
import { test } from "node:test";
import { collectedOrder, digest, observedContent, strictJson, validatePayload, type Json, type ObservedCandle } from "../src/ingestion-contract.js";

import { corpus, observed, rehash } from "./observed-test-data.js";
test("observed v2 shared Python/Node contract corpus", () => {
  for (const input of [corpus.baseline, corpus.index]) assert.equal(validatePayload(input as unknown as Json).schemaVersion, "2.0.0");
  for (const entry of corpus.cases) {
    const input = observed();
    for (const [path, value] of entry.sets) {
      let cursor = input as unknown as Record<string | number, Json>;
      for (const part of path.slice(0, -1)) cursor = cursor[part] as Record<string | number, Json>;
      cursor[path.at(-1)!] = value;
    }
    if (entry.rehash) rehash(input);
    if (entry.valid) assert.doesNotThrow(() => validatePayload(input as unknown as Json), entry.name);
    else assert.throws(() => validatePayload(input as unknown as Json), Error, entry.name);
  }
});
test("collection ordering preserves offsets and microseconds independently of revision content", () => {
  assert.equal(collectedOrder("2026-10-06T14:00:00.123456+07:00"), "2026-10-06T07:00:00.123456Z");
  assert(collectedOrder("2026-10-06T07:00:00.000001Z") > collectedOrder("2026-10-06T07:00:00Z"));
  const a = observed(); const b = observed(); b.candles[0]!.collectedAt = "2026-10-06T14:00:00.123456+07:00";
  assert.notEqual(digest(a as unknown as Json), digest(b as unknown as Json));
  assert.equal(digest(observedContent(a.candles[0]!)), digest(observedContent(b.candles[0]!)));
  assert.equal(digest(strictJson(JSON.stringify(observedContent(a.candles[0] as ObservedCandle)))), a.candles[0]!.contentDigest);
});
