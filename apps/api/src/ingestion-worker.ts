import { Worker, UnrecoverableError, type Job } from "bullmq";
import { IdentityConflict, IngestionStore, ACTIVE_STATUSES, MAX_ATTEMPTS } from "./ingestion-store.js";
import { createIngestionQueue, DeliveryQueue, queueConnection, QUEUE_NAME, safeJob, type DeliveryJob } from "./ingestion-queue.js";

export interface WorkerHooks { afterWrite?: (count: number, id: string) => Promise<void>; beforeComplete?: (id: string) => Promise<void> }
export async function startIngestionWorker(store: IngestionStore, redisUrl: string, options: { name?: string; reconcileMs?: number; lockDuration?: number; stalledInterval?: number; hooks?: WorkerHooks } = {}) {
  await store.initialize();
  const producer = createIngestionQueue(redisUrl, options.name);
  await producer.queue.waitUntilReady();
  const deliveries = new DeliveryQueue(store, producer.queue);
  const { raw, connection } = queueConnection(redisUrl);
  let closing = false; let initialized = false; let lastReconciled = 0; let reconciliation: Promise<void> | undefined;
  const process = async (job: Job<DeliveryJob>) => {
    const started = Date.now();
    const delivery = await store.deliveries.findOne({ _id: job.data.deliveryId });
    if (!delivery || delivery.payloadDigest !== job.data.payloadDigest) throw new UnrecoverableError("delivery_mismatch");
    if (!ACTIVE_STATUSES.includes(delivery.status)) return;
    const current = await store.deliveries.findOneAndUpdate({ _id: delivery._id, status: { $in: ACTIVE_STATUSES }, attempts: { $lt: MAX_ATTEMPTS } }, { $inc: { attempts: 1 }, $set: { status: "running", startedAt: new Date(), updatedAt: new Date() } }, { returnDocument: "after" });
    if (!current) { await store.terminal(delivery._id, "failure", delivery.counts, "attempts_exhausted"); throw new UnrecoverableError("attempts_exhausted"); }
    console.info(JSON.stringify({ event: "ingestion_running", ...safeJob(job), status: "running", attempt: current.attempts }));
    try {
      const counts = await store.persist(current, count => options.hooks?.afterWrite?.(count, current._id) ?? Promise.resolve());
      await store.terminal(current._id, "success", counts, undefined, current.attempts);
      console.info(JSON.stringify({ event: "ingestion_success", ...safeJob(job), status: "success", attempt: current.attempts, durationMs: Date.now() - started, counts }));
      await options.hooks?.beforeComplete?.(current._id);
    } catch (error) {
      const permanent = error instanceof IdentityConflict;
      const code = permanent ? "canonical_identity_conflict" : "persistence_unavailable";
      const confirmed = await store.deliveries.findOne({ _id: current._id });
      if (permanent || current.attempts >= MAX_ATTEMPTS) await store.terminal(current._id, "failure", confirmed?.counts ?? current.counts, code, current.attempts);
      else await store.deliveries.updateOne({ _id: current._id, status: "running", attempts: current.attempts }, { $set: { status: "queued", updatedAt: new Date(), errorCode: code } });
      console.warn(JSON.stringify({ event: "ingestion_attempt_failed", ...safeJob(job), status: permanent || current.attempts >= MAX_ATTEMPTS ? "failure" : "queued", attempt: current.attempts, durationMs: Date.now() - started, errorCode: code }));
      if (permanent) throw new UnrecoverableError(code);
      throw new Error(code);
    }
  };
  const worker = new Worker<DeliveryJob>(options.name ?? QUEUE_NAME, process, { connection, concurrency: 1, autorun: false, lockDuration: options.lockDuration ?? 30_000, stalledInterval: options.stalledInterval ?? 30_000, maxStalledCount: 2 });
  worker.on("error", () => { console.warn(JSON.stringify({ event: "ingestion_worker_error" })); });
  worker.on("failed", job => { console.warn(JSON.stringify({ event: "ingestion_job_failed", ...safeJob(job) })); });
  const reconcile = () => {
    if (closing || reconciliation) return reconciliation ?? Promise.resolve();
    reconciliation = deliveries.reconcile().then(() => { lastReconciled = Date.now(); initialized = true; }).catch(() => { lastReconciled = 0; console.warn(JSON.stringify({ event: "ingestion_reconciliation_failed" })); }).finally(() => { reconciliation = undefined; });
    return reconciliation;
  };
  await worker.waitUntilReady();
  await reconcile(); initialized = lastReconciled > 0;
  void worker.run().catch(() => { initialized = false; console.warn(JSON.stringify({ event: "ingestion_worker_stopped" })); });
  const intervalMs = options.reconcileMs ?? 5000;
  const timer = setInterval(() => { void reconcile(); }, intervalMs);
  return { worker, queue: producer.queue, reconcile, ready: async () => {
    if (closing || !initialized || Date.now() - lastReconciled > intervalMs * 3 || !raw.isReady || !producer.raw.isReady || !worker.isRunning()) return false;
    try { await store.db.command({ ping: 1 }); return true; } catch { return false; }
  }, close: async () => { closing = true; clearInterval(timer); await reconciliation; await worker.close(); await producer.close(); if (raw.isOpen) raw.destroy(); } };
}
