import { MongoServerError, type Collection, type Db, type Document } from "mongodb";
import { digest, type Json, type Payload } from "./ingestion-contract.js";
import { ObservedStore, observedCollectionSchemas } from "./observed-store.js";

export const ACTIVE_STATUSES: DeliveryStatus[] = ["accepted", "queued", "running"];
export const MAX_ATTEMPTS = 3;
export type DeliveryStatus = "accepted" | "queued" | "running" | "success" | "failure";
export interface Counts { assets: number; observations: number }
export interface Delivery {
  _id: string; payloadDigest: string; payload: Payload; provider: string; schemaVersion: string;
  dataset: Payload["dataset"]; serverReceivedAt: Date; updatedAt: Date; status: DeliveryStatus;
  attempts: number; counts: Counts; startedAt?: Date; finishedAt?: Date; errorCode?: string;
}
interface Canonical extends Document { _id: string; rowDigest: string; record: Json; dataset: Payload["dataset"]; firstDeliveryId: string }
export class IdentityConflict extends Error { constructor() { super("canonical_identity_conflict"); } }
export class DeliveryConflict extends Error { constructor() { super("delivery_identity_conflict"); } }
function duplicate(error: unknown): boolean { return error instanceof MongoServerError && error.code === 11000; }

export class IngestionStore {
  readonly deliveries: Collection<Delivery>;
  readonly assets: Collection<Canonical>;
  readonly observations: Collection<Canonical>;
  readonly observed: ObservedStore;
  constructor(readonly db: Db) {
    this.deliveries = db.collection<Delivery>("ingestion_deliveries");
    this.assets = db.collection<Canonical>("canonical_assets");
    this.observations = db.collection<Canonical>("canonical_observations");
    this.observed = new ObservedStore(db);
  }
  async initialize(): Promise<void> {
    const definitions = [
      ["ingestion_deliveries", {
        bsonType: "object", required: ["_id", "payloadDigest", "payload", "provider", "schemaVersion", "dataset", "serverReceivedAt", "updatedAt", "status", "attempts", "counts"],
        properties: { _id: { bsonType: "string", maxLength: 100 }, payloadDigest: { bsonType: "string", pattern: "^[a-f0-9]{64}$" },
          payload: { bsonType: "object", properties: { assets: { bsonType: "array", maxItems: 32 }, candles: { bsonType: "array", maxItems: 1000 }, quotes: { bsonType: "array", maxItems: 1000 }, indexObservations: { bsonType: "array", maxItems: 1000 } } },
          status: { enum: [...ACTIVE_STATUSES, "success", "failure"] }, attempts: { bsonType: ["int", "double"], minimum: 0 },
          serverReceivedAt: { bsonType: "date" }, updatedAt: { bsonType: "date" }, counts: { bsonType: "object" }, errorCode: { bsonType: "string", maxLength: 64 } },
      }],
      ...["canonical_assets", "canonical_observations"].map(name => [name, { bsonType: "object", required: ["_id", "rowDigest", "record", "dataset", "firstDeliveryId"], properties: { _id: { bsonType: "string" }, rowDigest: { bsonType: "string", pattern: "^[a-f0-9]{64}$" }, record: { bsonType: "object" }, dataset: { bsonType: "object" }, firstDeliveryId: { bsonType: "string" } } }]),
      ...observedCollectionSchemas,
    ] as const;
    for (const [name, schema] of definitions) {
      const validator = { $jsonSchema: schema };
      try { await this.db.createCollection(name as string, { validator, validationAction: "error", validationLevel: "strict" }); }
      catch (error) { if (!(error instanceof MongoServerError) || error.code !== 48) throw error; await this.db.command({ collMod: name, validator, validationAction: "error", validationLevel: "strict" }); }
    }
    await this.deliveries.createIndex({ status: 1, updatedAt: 1 }, { name: "outbox_nonterminal" });
    await this.observed.initialize();
  }
  async accept(id: string, payloadDigest: string, payload: Payload): Promise<Delivery> {
    const now = new Date();
    const delivery: Delivery = { _id: id, payloadDigest, payload, provider: payload.schemaVersion === "2.0.0" ? "KBS" : "marketpulse-fixture", schemaVersion: payload.schemaVersion,
      dataset: payload.dataset, serverReceivedAt: now, updatedAt: now, status: "accepted", attempts: 0, counts: { assets: 0, observations: 0 } };
    try { await this.deliveries.insertOne(delivery, { writeConcern: { w: 1, j: true } }); return delivery; }
    catch (error) {
      if (!duplicate(error)) throw error;
      const existing = await this.deliveries.findOne({ _id: id });
      if (!existing || existing.payloadDigest !== payloadDigest) throw new DeliveryConflict();
      return existing;
    }
  }
  async terminal(id: string, status: "success" | "failure", counts: Counts, errorCode?: string, attempt?: number): Promise<void> {
    await this.deliveries.updateOne({ _id: id, status: { $in: ACTIVE_STATUSES }, ...(attempt === undefined ? {} : { attempts: attempt }) }, { $set: { status, counts, finishedAt: new Date(), updatedAt: new Date(), ...(errorCode ? { errorCode } : {}) }, ...(errorCode ? {} : { $unset: { errorCode: "" } }) });
  }
  async persist(delivery: Delivery, afterWrite?: (count: number) => Promise<void>, afterRevision?: () => Promise<void>): Promise<Counts> {
    const counts = { assets: 0, observations: 0 };
    const insert = async (collection: Collection<Canonical>, id: string, record: Json, natural: Document) => {
      const rowDigest = digest({ record, dataset: delivery.dataset });
      try { await collection.insertOne({ _id: id, rowDigest, record, dataset: delivery.dataset, firstDeliveryId: delivery._id, ...natural }); }
      catch (error) {
        if (!duplicate(error)) throw error;
        const existing = await collection.findOne({ _id: id }, { projection: { rowDigest: 1 } });
        if (!existing || existing.rowDigest !== rowDigest) throw new IdentityConflict();
      }
    };
    const progress = async () => { await this.deliveries.updateOne({ _id: delivery._id, status: "running", attempts: delivery.attempts }, { $set: { counts, updatedAt: new Date() } }); await afterWrite?.(counts.assets + counts.observations); };
    if (delivery.payload.schemaVersion === "2.0.0") {
      await this.observed.persist(delivery, delivery.payload, async kind => { counts[kind]++; await progress(); }, afterRevision);
      return counts;
    }
    for (const asset of delivery.payload.assets) { await insert(this.assets, asset.assetId, asset, { assetId: asset.assetId }); counts.assets++; await progress(); }
    for (const [kind, rows] of [["candle", delivery.payload.candles], ["quote", delivery.payload.quotes], ["index", delivery.payload.indexObservations]] as const) for (const row of rows) {
      const identity: Json[] = kind === "candle" ? [kind, row.assetId, row.source.provider, "1d", row.tradingDate, row.adjustmentBasis] : [kind, row.assetId, row.source.provider, row.tradingDate];
      await insert(this.observations, digest(identity), row, { kind, assetId: row.assetId, provider: row.source.provider, tradingDate: row.tradingDate, ...(kind === "candle" ? { interval: "1d", adjustmentBasis: row.adjustmentBasis } : {}) });
      counts.observations++; await progress();
    }
    return counts;
  }
}
export function receipt(delivery: Delivery) {
  return { deliveryId: delivery._id, payloadDigest: delivery.payloadDigest, status: delivery.status, provider: delivery.provider,
    attempts: delivery.attempts, counts: delivery.counts, serverReceivedAt: delivery.serverReceivedAt, updatedAt: delivery.updatedAt,
    ...(delivery.finishedAt ? { finishedAt: delivery.finishedAt } : {}), ...(delivery.errorCode ? { errorCode: delivery.errorCode } : {}) };
}
