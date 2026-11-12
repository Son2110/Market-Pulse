import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import test from "node:test";
import { MongoClient, type CommandStartedEvent } from "mongodb";
import { createApp } from "../src/health.js";
import { digest, validatePayload, type Json } from "../src/ingestion-contract.js";
import { IngestionStore } from "../src/ingestion-store.js";
import { createObservedSearchRouter, ObservedSearchService } from "../src/observed-search.js";
import { observedAssetProjection } from "../src/observed-history-contract.js";
import { REGISTERED_SYMBOLS } from "../src/symbol-registry.js";
import { observed } from "./observed-test-data.js";

test("real Mongo observed catalog verifies hasData true/false across catalog equities, corrupt records, indexed bounded projection and outage", async t => {
  const client = new MongoClient(process.env.MONGODB_URL ?? "mongodb://127.0.0.1:27017/marketpulse", { serverSelectionTimeoutMS: 1000, monitorCommands: true });
  await client.connect();
  const db = client.db(`mp_observed_search_test_${randomUUID().replaceAll("-", "")}`);
  t.after(async () => { await client.connect(); await db.dropDatabase(); await client.close(); });
  const store = new IngestionStore(db); await store.initialize();
  const server = createServer(createApp({ checks: { mongo: async () => true, redis: async () => true }, observedSearchRouter: createObservedSearchRouter(new ObservedSearchService(db, 456)) }));
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address(); assert(address && typeof address === "object");
  const get = (query = "FPT") => fetch(`http://127.0.0.1:${address.port}/api/observed/assets/search?q=${encodeURIComponent(query)}`);
  let response = await get(); assert.equal(response.status, 200);
  const initialBody = await response.json();
  assert.equal(initialBody.data.length, 1);
  assert.equal(initialBody.data[0].asset.symbol, "FPT");
  assert.equal(initialBody.data[0].hasData, false);
  assert.equal(initialBody.meta.dataset, null);
  for (const index of [true, false]) {
    const payload = observed(index); payload.candles = [];
    const delivery = await store.accept(`asset-${index}`, digest(payload as unknown as Json), validatePayload(payload as unknown as Json)); await store.persist(delivery);
    response = await get(index ? "VNINDEX" : "cong ty co phan fpt");
    const body = await response.json(); assert.equal(response.status, 200); assert.equal(body.data.length, index ? 0 : 1);
    if (!index) assert.equal(body.data[0].hasData, true);
  }
  assert.equal(await store.observed.latest.countDocuments(), 0);
  const expectedIds = REGISTERED_SYMBOLS.filter(item => item.assetType === "equity").map(item => item.assetId);
  const commands: CommandStartedEvent[] = []; const capture = (event: CommandStartedEvent) => commands.push(event);
  client.on("commandStarted", capture);
  response = await get(); assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json(); assert.equal(body.data[0].asset.symbol, "FPT"); assert.equal(body.data[0].hasData, true); assert.equal(body.meta.availability, "catalog_only");
  assert(!/(firstDeliveryId|rowDigest|_id|candles|collectedOrder)/.test(JSON.stringify(body.data)));
  client.off("commandStarted", capture);
  assert.equal(commands.length, 1); const command = commands[0]!.command;
  assert.equal(command.find, "observed_assets"); assert.deepEqual(command.filter, { _id: { $in: expectedIds } });
  assert.deepEqual(command.projection, { ...observedAssetProjection, _id: 1 }); assert.equal(command.limit, expectedIds.length); assert.equal(command.singleBatch, true); assert.equal(command.maxTimeMS, 456);
  const explanation = await db.collection("observed_assets").find({ _id: { $in: expectedIds } } as never).explain("executionStats");
  assert.equal(explanation.executionStats.totalDocsExamined, 1); assert(explanation.executionStats.totalKeysExamined <= 2);
  const vcbBody = await (await get("VCB")).json();
  assert.equal(vcbBody.data.length, 1);
  assert.equal(vcbBody.data[0].asset.symbol, "VCB");
  assert.equal(vcbBody.data[0].hasData, false);
  const shsBody = await (await get("SHS")).json();
  assert.equal(shsBody.data.length, 1);
  assert.equal(shsBody.data[0].asset.assetId, "VN:HNX:SHS");
  assert.equal(shsBody.data[0].hasData, false);
  for (const query of ["AAA", "VNINDEX", ".*"]) assert.deepEqual((await (await get(query)).json()).data, []);
  const asset = await db.collection("observed_assets").findOne({ "record.symbol": "FPT" }); assert(asset);
  for (const corruption of [{ rowDigest: "bad" }, { schemaVersion: "future" }, { "record.currency": "USD" }, { "dataset.mode": "fixture" }]) {
    await db.collection("observed_assets").updateOne({ _id: asset._id }, { $set: corruption }, { bypassDocumentValidation: true });
    response = await get(); assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: "observed_asset_search_unavailable" });
    await db.collection("observed_assets").replaceOne({ _id: asset._id }, asset, { bypassDocumentValidation: true });
  }
  await client.close(); response = await get(); assert.equal(response.status, 503);
});
