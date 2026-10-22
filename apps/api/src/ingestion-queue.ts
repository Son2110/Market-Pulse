import { Queue, createNodeRedisClient, type Job } from "bullmq";
import { createClient } from "redis";
import { withinTimeout } from "./platform/health/dependency-probes.js";
import { computeReconnectDelayMs, logDependencyTransitions } from "./platform/recovery/redis-lifecycle.js";
import { type ClassifiedPayload, type PayloadFamily } from "./ingestion-contract.js";
import { ContractError, digest } from "./platform/contracts/json.js";
import { ACTIVE_STATUSES, classifyDelivery, IngestionStore, MAX_ATTEMPTS } from "./ingestion-store.js";

export interface DeliveryJob { deliveryId: string; payloadDigest: string }
export type IngestionJobName = "persist-fixture" | "persist-observed" | "persist-gold";
export const FAMILY_JOB_NAMES: Readonly<Record<PayloadFamily, IngestionJobName>> = {
  "fixture-market": "persist-fixture",
  "observed-candle": "persist-observed",
  "synthetic-gold": "persist-gold",
};
export const queueJobName = (family: PayloadFamily): IngestionJobName => FAMILY_JOB_NAMES[family];
export const QUEUE_NAME = "marketpulse-ingestion-v1";
export const jobId = (id: string) => `delivery-${digest(id)}`;

export function queueConnection(url: string, producer = false, canReconnect: () => boolean = () => true, role: "api" | "worker" = "worker") {
  const raw = createClient({
    url,
    disableOfflineQueue: producer,
    commandsQueueMaxLength: producer ? 256 : undefined,
    socket: {
      connectTimeout: 1000,
      reconnectStrategy: (retries) => computeReconnectDelayMs(retries, { canReconnect }),
    },
  });
  const transition = logDependencyTransitions("redis", role);
  raw.on("error", () => transition(false));
  raw.on("ready", () => transition(true));
  raw.on("end", () => transition(false));
  return { raw, connection: createNodeRedisClient(raw) };
}

export function createIngestionQueue(url: string, name = QUEUE_NAME, producer = true, role: "api" | "worker" = "worker") {
  let closing = false;
  const { raw, connection } = queueConnection(url, producer, () => !closing, role);
  const queue = new Queue<DeliveryJob>(name, {
    connection,
    defaultJobOptions: {
      attempts: MAX_ATTEMPTS,
      backoff: { type: "exponential", delay: 250 },
      removeOnComplete: { age: 86400, count: 1000 },
      removeOnFail: { age: 604800, count: 1000 },
    },
  });
  queue.on("error", () => {});
  return {
    raw,
    connection,
    queue,
    close: async () => {
      closing = true;
      await withinTimeout(() => queue.close(), 1500, "queue_close_timeout").catch(() => undefined);
      if (raw.isOpen) {
        try {
          raw.destroy();
        } catch {
          // ignore destroy errors on teardown
        }
      }
    },
  };
}

export class DeliveryQueue {
  constructor(readonly store: IngestionStore, readonly queue: Queue<DeliveryJob>) {}
  async enqueue(id: string, payloadDigest: string, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    const delivery = await this.store.deliveries.findOne({ _id: id });
    signal?.throwIfAborted();
    if (!delivery || delivery.payloadDigest !== payloadDigest || !ACTIVE_STATUSES.includes(delivery.status)) return;
    let classified: ClassifiedPayload;
    try { classified = classifyDelivery(delivery); }
    catch (error) {
      if (error instanceof ContractError) { await this.store.terminal(id, "failure", delivery.counts, "invalid_contract"); return; }
      throw error;
    }
    const existing = await this.queue.getJob(jobId(id));
    signal?.throwIfAborted();
    if (existing) {
      const state = await existing.getState();
      signal?.throwIfAborted();
      if (state === "failed") {
        await this.store.terminal(id, "failure", delivery.counts, "queue_attempts_exhausted"); return;
      }
      if (state === "completed") await existing.remove();
      else if (state !== "unknown") return;
    }
    if (delivery.attempts >= MAX_ATTEMPTS) { await this.store.terminal(id, "failure", delivery.counts, "attempts_exhausted"); return; }
    signal?.throwIfAborted();
    await this.queue.add(queueJobName(classified.family), { deliveryId: id, payloadDigest }, { jobId: jobId(id), attempts: MAX_ATTEMPTS - delivery.attempts });
    const updated = await this.store.deliveries.updateOne({ _id: id, status: "accepted" }, { $set: { status: "queued", updatedAt: new Date() } });
    if (updated.modifiedCount) console.info(JSON.stringify({ event: "ingestion_queued", deliveryId: id, provider: delivery.provider, status: "queued", attempt: delivery.attempts }));
  }
  async reconcile(): Promise<number> {
    let scanned = 0;
    const cursor = this.store.deliveries
      .find({ status: { $in: ACTIVE_STATUSES } }, { projection: { _id: 1, payloadDigest: 1 }, maxTimeMS: 2000 })
      .sort({ updatedAt: 1 })
      .limit(100);
    try { for await (const delivery of cursor) { scanned += 1; await this.enqueue(delivery._id, delivery.payloadDigest); } }
    finally { await cursor.close(); }
    return scanned;
  }
}

export function safeJob(job: Job<DeliveryJob> | undefined, provider?: string) {
  return { deliveryId: job?.data.deliveryId, ...(provider ? { provider } : {}) };
}
