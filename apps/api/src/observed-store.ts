import { readFileSync } from "node:fs";
import { MongoServerError, type Collection, type Db, type Document } from "mongodb";
import { collectedOrder, digest, observedContent, type Json, type ObservedPayload } from "./ingestion-contract.js";
import { IdentityConflict, type Delivery } from "./ingestion-store.js";

interface StoredObserved extends Document { _id: string; record: Json; dataset: ObservedPayload["dataset"]; schemaVersion: string; firstDeliveryId: string }
export interface LatestObserved extends Document { _id: string; barId: string; contentDigest: string; collectedOrder: string; collectedAt: string; record: Json; dataset: ObservedPayload["dataset"]; schemaVersion: string; deliveryId: string }
const duplicate = (error: unknown) => error instanceof MongoServerError && error.code === 11000;

// The JSON contract uses the subset supported by Mongo's validator; dates stay strings.
function mongoSchema(input: Document): Document {
  const output: Document = {};
  for (const [key, value] of Object.entries(input)) {
    if (key === "format") continue;
    if (key === "type") output.bsonType = value;
    else if (key === "const") output.enum = [value];
    else if (key === "properties") output.properties = Object.fromEntries(Object.entries(value as Document).map(([name, property]) => [name, mongoSchema(property as Document)]));
    else if (key === "$ref") output.$ref = value;
    else output[key] = value;
  }
  return output;
}
const schema = JSON.parse(readFileSync(new URL("../../../packages/schemas/observed-candles-v2.schema.json", import.meta.url), "utf8")) as Document;
const definitions = schema.$defs as Document;
function recordSchema(name: string, revision = false): Document {
  const original = structuredClone(definitions[name]) as Document;
  for (const [key, value] of Object.entries(original.properties as Document)) if ((value as Document).$ref) (original.properties as Document)[key] = definitions.decimal;
  if (revision) {
    original.required = (original.required as string[]).filter(key => !["barId", "contentDigest", "collectedAt"].includes(key));
    for (const key of ["barId", "contentDigest", "collectedAt"]) delete (original.properties as Document)[key];
  }
  return mongoSchema(original);
}
const hash = { bsonType: "string", pattern: "^[a-f0-9]{64}$" };
const id = { bsonType: "string", pattern: "^[a-zA-Z0-9_-]{1,100}$" };
function documentSchema(properties: Document): Document {
  return { bsonType: "object", additionalProperties: false, required: Object.keys(properties), properties };
}
export const observedCollectionSchemas: [string, Document][] = [
  ["observed_assets", documentSchema({ _id: { bsonType: "string", maxLength: 32 }, record: recordSchema("asset"), rowDigest: hash, dataset: mongoSchema(schema.properties.dataset), schemaVersion: { enum: ["2.0.0"] }, firstDeliveryId: id })],
  ["observed_candle_revisions", documentSchema({ _id: hash, barId: hash, contentDigest: hash, record: recordSchema("candle", true), dataset: mongoSchema(schema.properties.dataset), schemaVersion: { enum: ["2.0.0"] }, firstDeliveryId: id })],
  ["observed_candles_latest", documentSchema({ _id: hash, barId: hash, contentDigest: hash, record: recordSchema("candle"), dataset: mongoSchema(schema.properties.dataset), schemaVersion: { enum: ["2.0.0"] }, deliveryId: id, collectedAt: mongoSchema(definitions.candle.properties.collectedAt), collectedOrder: { bsonType: "string", pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{6}Z$" } })],
];

export class ObservedStore {
  readonly assets: Collection<StoredObserved>;
  readonly revisions: Collection<StoredObserved>;
  readonly latest: Collection<LatestObserved>;
  constructor(db: Db) {
    this.assets = db.collection("observed_assets"); this.revisions = db.collection("observed_candle_revisions"); this.latest = db.collection("observed_candles_latest");
  }
  async initialize(): Promise<void> {
    await this.revisions.createIndex({ barId: 1, contentDigest: 1 }, { unique: true, name: "bar_content_revision" });
    await this.latest.createIndex({ "record.assetId": 1, "record.tradingDate": 1 }, { name: "asset_daily_history" });
  }
  async persist(delivery: Delivery, payload: ObservedPayload, progress: (kind: "assets" | "observations") => Promise<void>, afterRevision?: () => Promise<void>): Promise<void> {
    const immutable = async (collection: Collection<StoredObserved>, document: StoredObserved, field: string) => {
      try { await collection.insertOne(document); }
      catch (error) {
        if (!duplicate(error)) throw error;
        const existing = await collection.findOne({ _id: document._id });
        if (!existing || existing[field] !== document[field]) throw new IdentityConflict();
      }
    };
    for (const asset of payload.assets) {
      await immutable(this.assets, { _id: asset.assetId, rowDigest: digest(asset), record: asset, dataset: payload.dataset, schemaVersion: payload.schemaVersion, firstDeliveryId: delivery._id }, "rowDigest");
      await progress("assets");
    }
    for (const row of payload.candles) {
      await immutable(this.revisions, { _id: digest([row.barId, row.contentDigest]), barId: row.barId, contentDigest: row.contentDigest, record: observedContent(row), dataset: payload.dataset, schemaVersion: payload.schemaVersion, firstDeliveryId: delivery._id }, "contentDigest");
      await afterRevision?.();
      const projection: LatestObserved = { _id: row.barId, barId: row.barId, contentDigest: row.contentDigest, record: row, dataset: payload.dataset, schemaVersion: payload.schemaVersion, collectedAt: row.collectedAt, collectedOrder: collectedOrder(row.collectedAt), deliveryId: delivery._id };
      // Every retrieval advances by an exact UTC/digest tuple, including a reused revision.
      const pipeline = [{ $replaceWith: { $cond: [{ $or: [{ $eq: [{ $type: "$collectedOrder" }, "missing"] }, { $lt: ["$collectedOrder", projection.collectedOrder] }, { $and: [{ $eq: ["$collectedOrder", projection.collectedOrder] }, { $lt: ["$contentDigest", row.contentDigest] }] }] }, { $literal: projection }, "$$ROOT"] } }];
      try { await this.latest.updateOne({ _id: row.barId }, pipeline, { upsert: true }); }
      catch (error) { if (!duplicate(error)) throw error; await this.latest.updateOne({ _id: row.barId }, pipeline); }
      await progress("observations");
    }
  }
}
