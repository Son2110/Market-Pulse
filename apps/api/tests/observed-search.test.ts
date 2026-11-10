import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import type { Db } from "mongodb";
import { createApp } from "../src/health.js";
import { digest } from "../src/ingestion-contract.js";
import { observedAssetProjection } from "../src/observed-history-contract.js";
import { createObservedSearchRouter, ObservedSearchService } from "../src/observed-search.js";
import { DependencyTimeoutError } from "../src/platform/health/dependency-probes.js";
import { observed } from "./observed-test-data.js";

function stored() {
  const payload = observed();
  return { record: payload.assets[0], rowDigest: digest(payload.assets[0]!), dataset: payload.dataset, schemaVersion: payload.schemaVersion, firstDeliveryId: "private" };
}

test("observed catalog reads exact indexed FPT identity with projection and bound, then matches normalized curated terms", async () => {
  const asset = stored(); let calls = 0;
  const db = { collection: (name: string) => {
    assert.equal(name, "observed_assets");
    return { find: (filter: unknown, options: unknown) => {
      calls++; assert.deepEqual(filter, { _id: { $in: ["VN:HOSE:FPT"] } });
      assert.deepEqual(options, { projection: observedAssetProjection, maxTimeMS: 123, singleBatch: true });
      return { limit: (size: number) => { assert.equal(size, 1); return { toArray: async () => [{ ...asset, _id: "VN:HOSE:FPT" }] }; } };
    } };
  } } as unknown as Db;
  const service = new ObservedSearchService(db, 123);
  for (const query of [" FpT ", "cong ty co phan fpt", "CÔNG TY CỔ PHẦN FPT", "F"]) {
    const response = await service.search(query); assert.equal(response.data.length, 1);
    assert.deepEqual(response.data[0]!.asset, observed().assets[0]);
    assert.equal(response.data[0]!.reference.origin, "curated_reference");
    assert.equal(response.meta.availability, "catalog_only"); assert.equal(response.meta.collectedAt, null);
    assert(!JSON.stringify(response).includes("private"));
  }
  for (const query of ["VNINDEX", "VCB", ".*", "$where", "[FPT]"]) assert.deepEqual((await service.search(query)).data, []);
  assert.equal(calls, 9);
});

test("observed catalog distinguishes absent assets from corrupt stored contracts", async () => {
  let document: unknown = null;
  const service = new ObservedSearchService({ collection: () => ({ find: () => ({ limit: () => ({ toArray: async () => document ? [{ ...(document as object), _id: "VN:HOSE:FPT" }] : [] }) }) }) } as unknown as Db);
  assert.deepEqual((await service.search("FPT")).data, []);
  assert.equal((await service.search("FPT")).meta.dataset, null);
  for (const mutate of [
    (row: ReturnType<typeof stored>) => { row.rowDigest = "bad"; },
    (row: ReturnType<typeof stored>) => { row.schemaVersion = "1.0.0" as never; },
    (row: ReturnType<typeof stored>) => { row.dataset.mode = "fixture" as never; },
    (row: ReturnType<typeof stored>) => { row.record!.currency = "USD"; row.rowDigest = digest(row.record!); },
    (row: ReturnType<typeof stored>) => { row.record!.symbol = "VCB"; row.rowDigest = digest(row.record!); },
  ]) {
    const row = stored(); mutate(row); document = row;
    await assert.rejects(service.search("FPT")); await assert.rejects(service.search("no match"));
  }
});

test("observed catalog bounds a Mongo operation that never settles", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const service = new ObservedSearchService({ collection: () => ({ find: () => ({ limit: () => ({ toArray: () => new Promise(() => undefined) }) }) }) } as unknown as Db, 25);
  const rejection = assert.rejects(service.search("FPT"), DependencyTimeoutError);
  t.mock.timers.tick(25);
  await rejection;
});

test("observed catalog returns sanitized 503 when Mongo remains pending", async t => {
  const service = new ObservedSearchService({ collection: () => ({ find: () => ({ limit: () => ({ toArray: () => new Promise(() => undefined) }) }) }) } as unknown as Db, 25);
  const server = createServer(createApp({ checks: { mongo: async () => true, redis: async () => true }, observedSearchRouter: createObservedSearchRouter(service) }));
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address(); assert(address && typeof address === "object");
  const response = await fetch(`http://127.0.0.1:${address.port}/api/observed/assets/search?q=FPT`, { signal: AbortSignal.timeout(1000) });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "observed_asset_search_unavailable" });
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("observed search validates query before readiness/read, sanitizes errors and is absent when disabled", async t => {
  let calls = 0; let ready = true;
  const router = createObservedSearchRouter({ search: async () => { calls++; throw new Error("private host/token"); } }, () => ready);
  const server = createServer(createApp({ checks: { mongo: async () => true, redis: async () => true }, observedSearchRouter: router }));
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address(); assert(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;
  for (const query of ["", "q=", "q=%20", "q=%CC%81", "q=FPT&q=FPT", "q[]=FPT", "q=FPT&limit=1", `q=${"x".repeat(101)}`]) {
    const response = await fetch(`${base}/api/observed/assets/search?${query}`);
    assert.equal(response.status, 400); assert.deepEqual(await response.json(), { error: "invalid_query" });
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  assert.equal(calls, 0);
  let response = await fetch(`${base}/api/observed/assets/search?q=FPT`);
  assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: "observed_asset_search_unavailable" }); assert.equal(calls, 1);
  ready = false; response = await fetch(`${base}/api/observed/assets/search?q=FPT`);
  assert.equal(response.status, 503); assert.equal(calls, 1);
  assert.equal((await fetch(`${base}/api/assets/search?q=FPT`)).status, 404);
});
