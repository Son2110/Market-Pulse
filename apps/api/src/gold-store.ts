import { readFileSync } from "node:fs";
import { MongoServerError, type Collection, type Db, type Document } from "mongodb";
import { digest, type Json } from "./platform/contracts/json.js";
import { goldAsset, type GoldDataset, type GoldObservation, type GoldPayload } from "./gold-contract.js";
import { IdentityConflict, type Delivery } from "./ingestion-store.js";

interface StoredGold extends Document { _id: string; record: Json; dataset: GoldDataset; schemaVersion: string; firstDeliveryId: string }
export interface GoldProjection extends Document {
  _id: string; assetId: string; snapshotId: string; contentDigest: string; record: GoldObservation;
  dataset: GoldDataset; schemaVersion: string; deliveryId: string;
  sourceVerified: boolean; sourceOrder: string; collectedOrder: string;
}
const duplicate = (error: unknown) => error instanceof MongoServerError && error.code === 11000;
const schema = JSON.parse(readFileSync(new URL("../../../packages/schemas/gold-quotes-v1.schema.json", import.meta.url), "utf8")) as Document;

// Resolve every nested reference; Mongo's JSON Schema dialect has no if/then/else.
function mongoSchema(input: Document): Document {
  if (input.$ref) return mongoSchema(schema.$defs[(input.$ref as string).split("/").at(-1)!] as Document);
  const output: Document = {};
  for (const [key, value] of Object.entries(input)) {
    if (key === "type") output.bsonType = value;
    else if (key === "const") output.enum = [value];
    else if (key === "properties") output.properties = Object.fromEntries(Object.entries(value as Document).map(([name, property]) => [name, mongoSchema(property as Document)]));
    else if (key === "allOf") output.allOf = (value as Document[]).map(clause => clause.if ? { anyOf: [
      { allOf: [mongoSchema(clause.if), mongoSchema(clause.then)] },
      { allOf: [{ not: mongoSchema(clause.if) }, mongoSchema(clause.else)] },
    ] } : mongoSchema(clause));
    else if (["anyOf", "oneOf"].includes(key)) output[key] = (value as Document[]).map(mongoSchema);
    else if (key === "items") output.items = mongoSchema(value as Document);
    else output[key] = value;
  }
  return output;
}
const hash = mongoSchema(schema.$defs.hash);
const deliveryId = { bsonType: "string", pattern: "^[a-zA-Z0-9_-]{1,100}$" };
const timestamp = mongoSchema(schema.$defs.timestamp);
const record = mongoSchema(schema.$defs.observation);
const dataset = mongoSchema(schema.properties.dataset);
const documentSchema = (properties: Document): Document => ({ bsonType: "object", additionalProperties: false, required: Object.keys(properties), properties });
const common = { record, dataset, schemaVersion: { enum: ["1.0.0"] } };
const projection = { ...common, assetId: hash, snapshotId: hash, contentDigest: hash, deliveryId, sourceVerified: { bsonType: "bool" }, sourceOrder: { anyOf: [timestamp, { enum: [""] }] }, collectedOrder: timestamp };
const assetProperties = Object.fromEntries(["assetId", "provider", "brand", "product", "purity", "region"].map(key => [key, record.properties[key]]));
export const goldCollectionSchemas: [string, Document][] = [
  ["gold_assets", documentSchema({ _id: hash, ...common, record: { ...documentSchema(assetProperties), allOf: record.allOf }, rowDigest: hash, firstDeliveryId: deliveryId })],
  ["gold_quote_revisions", documentSchema({ _id: hash, ...common, snapshotId: hash, contentDigest: hash, firstDeliveryId: deliveryId })],
  ["gold_quote_snapshots", documentSchema({ _id: hash, ...projection })],
  ["gold_quotes_latest", documentSchema({ _id: hash, ...projection })],
];

function newer(candidate: GoldProjection, fields: (keyof GoldProjection)[]): Document {
  return { $or: fields.map((field, index) => ({ $and: [
    ...fields.slice(0, index).map(prior => ({ $eq: [`$${prior}`, candidate[prior]] })),
    { $lt: [`$${field}`, candidate[field]] },
  ] })) };
}
export class GoldStore {
  readonly assets: Collection<StoredGold>;
  readonly revisions: Collection<StoredGold>;
  readonly snapshots: Collection<GoldProjection>;
  readonly latest: Collection<GoldProjection>;
  constructor(db: Db) {
    this.assets = db.collection("gold_assets"); this.revisions = db.collection("gold_quote_revisions");
    this.snapshots = db.collection("gold_quote_snapshots"); this.latest = db.collection("gold_quotes_latest");
  }
  async initialize(): Promise<void> {
    await this.revisions.createIndex({ snapshotId: 1, contentDigest: 1 }, { unique: true, name: "snapshot_content_revision" });
    await this.snapshots.createIndex({ assetId: 1, "record.time.referenceDate": 1 }, { name: "asset_reference_history" });
  }
  async persist(delivery: Delivery, payload: GoldPayload, progress: (kind: "assets" | "observations") => Promise<void>, afterRevision?: () => Promise<void>, afterSnapshot?: () => Promise<void>): Promise<void> {
    const immutable = async (collection: Collection<StoredGold>, document: StoredGold, field: string) => {
      try { await collection.insertOne(document); }
      catch (error) {
        if (!duplicate(error)) throw error;
        const existing = await collection.findOne({ _id: document._id });
        if (!existing || existing[field] !== document[field]) throw new IdentityConflict();
      }
    };
    const project = async (collection: Collection<GoldProjection>, candidate: GoldProjection, fields: (keyof GoldProjection)[]) => {
      // Identity-only filters make first-upsert races retryable without overwriting a winner.
      const pipeline = [{ $replaceWith: { $cond: [{ $or: [{ $eq: [{ $type: "$collectedOrder" }, "missing"] }, newer(candidate, fields)] }, { $literal: candidate }, "$$ROOT"] } }];
      try { await collection.updateOne({ _id: candidate._id }, pipeline, { upsert: true }); }
      catch (error) { if (!duplicate(error)) throw error; await collection.updateOne({ _id: candidate._id }, pipeline); }
    };
    const assets = new Set<string>();
    for (const row of payload.observations) {
      if (assets.has(row.assetId)) continue;
      const definition = goldAsset(row);
      await immutable(this.assets, { _id: row.assetId, record: definition, rowDigest: digest(definition), dataset: payload.dataset, schemaVersion: payload.schemaVersion, firstDeliveryId: delivery._id }, "rowDigest");
      assets.add(row.assetId); await progress("assets");
    }
    for (const row of payload.observations) {
      await immutable(this.revisions, { _id: digest([row.snapshotId, row.contentDigest]), snapshotId: row.snapshotId, contentDigest: row.contentDigest, record: row, dataset: payload.dataset, schemaVersion: payload.schemaVersion, firstDeliveryId: delivery._id }, "contentDigest");
      await afterRevision?.();
      const candidate: GoldProjection = { _id: row.snapshotId, assetId: row.assetId, snapshotId: row.snapshotId, contentDigest: row.contentDigest, record: row,
        dataset: payload.dataset, schemaVersion: payload.schemaVersion, deliveryId: delivery._id,
        sourceVerified: row.time.sourceAsOf !== null, sourceOrder: row.time.sourceAsOf ?? "", collectedOrder: row.time.collectedAt };
      // Reused economic revisions still repair and advance both projections on every retrieval.
      await project(this.snapshots, candidate, ["collectedOrder", "contentDigest"]);
      await afterSnapshot?.();
      await project(this.latest, { ...candidate, _id: row.assetId }, ["sourceVerified", "sourceOrder", "collectedOrder", "contentDigest"]);
      await progress("observations");
    }
  }
}
