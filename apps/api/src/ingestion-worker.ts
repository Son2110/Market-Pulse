import { Worker, UnrecoverableError, type Job } from "bullmq";
import {
  createBoundedProbe,
  trackOperation,
  withinTimeout,
} from "./platform/health/dependency-probes.js";
import { createReconciliationCoordinator } from "./platform/recovery/reconciliation.js";
import { ContractError } from "./platform/contracts/json.js";
import { classifyDelivery, IdentityConflict, IngestionStore, ACTIVE_STATUSES, MAX_ATTEMPTS } from "./ingestion-store.js";
import { createIngestionQueue, DeliveryQueue, queueConnection, queueJobName, QUEUE_NAME, safeJob, type DeliveryJob } from "./ingestion-queue.js";

export interface WorkerHooks {
  afterWrite?: (count: number, id: string) => Promise<void>;
  afterRevision?: (id: string) => Promise<void>;
  afterSnapshot?: (id: string) => Promise<void>;
  beforeComplete?: (id: string) => Promise<void>;
}

export async function startIngestionWorker(
  store: IngestionStore,
  redisUrl: string,
  options: {
    name?: string;
    reconcileMs?: number;
    reconcileTimeoutMs?: number;
    probeTimeoutMs?: number;
    lockDuration?: number;
    stalledInterval?: number;
    hooks?: WorkerHooks;
  } = {},
) {
  await store.initialize();
  let closing = false;
  const producer = createIngestionQueue(redisUrl, options.name, true);
  await producer.queue.waitUntilReady();
  const deliveries = new DeliveryQueue(store, producer.queue);
  const { raw, connection } = queueConnection(redisUrl, false, () => !closing);
  const intervalMs = options.reconcileMs ?? 5000;
  const reconcileTimeoutMs = options.reconcileTimeoutMs ?? Math.max(intervalMs * 2, 2000);
  const probeTimeoutMs = options.probeTimeoutMs ?? 1000;

  let reconciliationFailed = false;
  let previousCount = -1;
  let scannedCount = 0;
  const coordinator = createReconciliationCoordinator({
    intervalMs,
    timeoutMs: reconcileTimeoutMs,
    runReconcile: async () => {
      scannedCount = await deliveries.reconcile();
    },
    onStart: () => {
      if (reconciliationFailed || previousCount !== 0) console.info(JSON.stringify({ event: "outbox_reconciliation_started", role: "worker", service: "outbox", limit: 100 }));
    },
    onSuccess: () => {
      if (reconciliationFailed || previousCount !== scannedCount) console.info(JSON.stringify({ event: "outbox_reconciliation_succeeded", role: "worker", service: "outbox", scanned: scannedCount }));
      previousCount = scannedCount;
      reconciliationFailed = false;
    },
    onError: () => {
      if (!reconciliationFailed) console.warn(JSON.stringify({ event: "outbox_reconciliation_failed", role: "worker", service: "outbox", limit: 100 }));
      reconciliationFailed = true;
    },
  });

  const process = async (job: Job<DeliveryJob>) => {
    const started = Date.now();
    const delivery = await store.deliveries.findOne({ _id: job.data.deliveryId });
    if (!delivery || delivery.payloadDigest !== job.data.payloadDigest) throw new UnrecoverableError("delivery_mismatch");
    if (!ACTIVE_STATUSES.includes(delivery.status)) return;
    const current = await store.deliveries.findOneAndUpdate(
      { _id: delivery._id, status: { $in: ACTIVE_STATUSES }, attempts: { $lt: MAX_ATTEMPTS } },
      { $inc: { attempts: 1 }, $set: { status: "running", startedAt: new Date(), updatedAt: new Date() } },
      { returnDocument: "after" },
    );
    if (!current) {
      await store.terminal(delivery._id, "failure", delivery.counts, "attempts_exhausted");
      throw new UnrecoverableError("attempts_exhausted");
    }
    console.info(JSON.stringify({ event: "ingestion_running", ...safeJob(job, current.provider), status: "running", attempt: current.attempts }));
    try {
      const classified = classifyDelivery(current);
      if (job.name !== queueJobName(classified.family)) throw new ContractError();
      const counts = await store.persist(
        current,
        (count) => options.hooks?.afterWrite?.(count, current._id) ?? Promise.resolve(),
        () => options.hooks?.afterRevision?.(current._id) ?? Promise.resolve(),
        () => options.hooks?.afterSnapshot?.(current._id) ?? Promise.resolve(),
      );
      await store.terminal(current._id, "success", counts, undefined, current.attempts);
      console.info(JSON.stringify({ event: "ingestion_success", ...safeJob(job, current.provider), status: "success", attempt: current.attempts, durationMs: Date.now() - started, counts }));
      await options.hooks?.beforeComplete?.(current._id);
    } catch (error) {
      const contract = error instanceof ContractError;
      const permanent = error instanceof IdentityConflict || contract;
      const code = contract ? "invalid_contract" : permanent ? "canonical_identity_conflict" : "persistence_unavailable";
      const confirmed = await store.deliveries.findOne({ _id: current._id }).catch(() => null);
      if (permanent || current.attempts >= MAX_ATTEMPTS) {
        await store.terminal(current._id, "failure", confirmed?.counts ?? current.counts, code, current.attempts);
      } else {
        await store.deliveries.updateOne(
          { _id: current._id, status: "running", attempts: current.attempts },
          { $set: { status: "queued", updatedAt: new Date(), errorCode: code } },
        );
      }
      console.warn(JSON.stringify({ event: "ingestion_attempt_failed", ...safeJob(job, current.provider), status: permanent || current.attempts >= MAX_ATTEMPTS ? "failure" : "queued", attempt: current.attempts, durationMs: Date.now() - started, errorCode: code }));
      if (permanent) throw new UnrecoverableError(code);
      throw new Error(code);
    }
  };

  const worker = new Worker<DeliveryJob>(options.name ?? QUEUE_NAME, process, {
    connection,
    concurrency: 1,
    autorun: false,
    lockDuration: options.lockDuration ?? 30_000,
    stalledInterval: options.stalledInterval ?? 30_000,
    maxStalledCount: 2,
  });
  worker.on("error", () => {
    console.warn(JSON.stringify({ event: "ingestion_worker_error" }));
  });
  worker.on("failed", (job) => {
    console.warn(JSON.stringify({ event: "ingestion_job_failed", ...safeJob(job) }));
  });

  const reconcile = () => coordinator.reconcile();

  await worker.waitUntilReady();
  await reconcile();
  void worker.run().catch(() => {
    coordinator.markStopped();
    console.warn(JSON.stringify({ event: "ingestion_worker_stopped" }));
  });
  const timer = setInterval(() => {
    void reconcile();
  }, intervalMs);
  timer.unref?.();

  const readyProbe = createBoundedProbe(
    async () => {
      if (
        closing
        || !coordinator.isHealthy()
        || !raw.isReady
        || !producer.raw.isReady
        || !worker.isRunning()
      ) {
        return false;
      }
      const mongoPing = trackOperation(() => store.db.command({ ping: 1 }));
      const workerPing = trackOperation(() => raw.ping());
      const producerPing = trackOperation(() => producer.raw.ping());
      const [mongoResult, workerPong, producerPong] = await Promise.all([
        mongoPing,
        workerPing,
        producerPing,
      ]);
      return mongoResult.ok === 1 && workerPong === "PONG" && producerPong === "PONG";
    },
    {
      timeoutMs: probeTimeoutMs,
      maxInFlight: 4,
      onResult: (() => {
        let previous: boolean | undefined;
        return (ready: boolean) => {
          if (ready !== previous) console.info(JSON.stringify({ event: ready ? "worker_restored" : "worker_unavailable", role: "worker", service: "ingestion" }));
          previous = ready;
        };
      })(),
    },
  );

  return {
    worker,
    queue: producer.queue,
    reconcile,
    ready: readyProbe.probe,
    close: async () => {
      if (closing) return;
      closing = true;
      clearInterval(timer);
      await Promise.allSettled([
        coordinator.close(1500),
        withinTimeout(() => worker.close(), 1200, "worker_close_timeout").catch(async () => {
          await withinTimeout(() => worker.close(true), 500, "worker_force_close_timeout").catch(() => undefined);
        }),
        withinTimeout(() => producer.close(), 1500, "producer_close_timeout").catch(() => undefined),
      ]);
      if (raw.isOpen) {
        try {
          raw.destroy();
        } catch {
          // ignore destroy errors during teardown
        }
      }
    },
  };
}
