import { Queue, createNodeRedisClient, type Job } from "bullmq";
import { createClient } from "redis";
import { digest } from "./ingestion-contract.js";
import { ACTIVE_STATUSES, IngestionStore, MAX_ATTEMPTS } from "./ingestion-store.js";

export interface DeliveryJob { deliveryId: string; payloadDigest: string }
export const QUEUE_NAME = "marketpulse-ingestion-v1";
export const jobId = (id: string) => `delivery-${digest(id)}`;
export function queueConnection(url: string, producer = false) {
  const raw = createClient({ url, disableOfflineQueue: producer, socket: { connectTimeout: 1000, reconnectStrategy: producer ? false : retries => Math.min(100 * (retries + 1), 1000) } });
  raw.on("error", () => { console.warn(JSON.stringify({ event: "ingestion_queue_connection_error" })); });
  return { raw, connection: createNodeRedisClient(raw) };
}
export function createIngestionQueue(url: string, name = QUEUE_NAME, producer = false) {
  const { raw, connection } = queueConnection(url, producer);
  const queue = new Queue<DeliveryJob>(name, { connection, defaultJobOptions: { attempts: MAX_ATTEMPTS, backoff: { type: "exponential", delay: 250 }, removeOnComplete: { age: 86400, count: 1000 }, removeOnFail: { age: 604800, count: 1000 } } });
  queue.on("error", () => { console.warn(JSON.stringify({ event: "ingestion_queue_error" })); });
  return { raw, connection, queue, close: async () => { await queue.close(); if (raw.isOpen) raw.destroy(); } };
}
export class DeliveryQueue {
  constructor(readonly store: IngestionStore, readonly queue: Queue<DeliveryJob>) {}
  async enqueue(id: string, payloadDigest: string): Promise<void> {
    const delivery = await this.store.deliveries.findOne({ _id: id });
    if (!delivery || delivery.payloadDigest !== payloadDigest || !ACTIVE_STATUSES.includes(delivery.status)) return;
    const existing = await this.queue.getJob(jobId(id));
    if (existing) {
      const state = await existing.getState();
      if (state === "failed") {
        await this.store.terminal(id, "failure", delivery.counts, "queue_attempts_exhausted"); return;
      }
      if (state === "completed") await existing.remove();
      else if (state !== "unknown") return;
    }
    if (delivery.attempts >= MAX_ATTEMPTS) { await this.store.terminal(id, "failure", delivery.counts, "attempts_exhausted"); return; }
    await this.queue.add("persist-fixture", { deliveryId: id, payloadDigest }, { jobId: jobId(id), attempts: MAX_ATTEMPTS - delivery.attempts });
    const updated = await this.store.deliveries.updateOne({ _id: id, status: "accepted" }, { $set: { status: "queued", updatedAt: new Date() } });
    if (updated.modifiedCount) console.info(JSON.stringify({ event: "ingestion_queued", deliveryId: id, provider: delivery.provider, status: "queued", attempt: delivery.attempts }));
  }
  async reconcile(): Promise<void> {
    const cursor = this.store.deliveries.find({ status: { $in: ACTIVE_STATUSES } }, { projection: { _id: 1, payloadDigest: 1 } }).sort({ updatedAt: 1 }).limit(100);
    for await (const delivery of cursor) await this.enqueue(delivery._id, delivery.payloadDigest);
  }
}
export function safeJob(job: Job<DeliveryJob> | undefined) { return { deliveryId: job?.data.deliveryId, provider: "marketpulse-fixture" }; }
