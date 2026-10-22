import { createServer } from "node:http";
import { readConfig } from "./config.js";
import { createWorkerHealthHandler, withinTimeout } from "./dependency-lifecycle.js";
import { IngestionStore } from "./ingestion-store.js";
import { startIngestionWorker } from "./ingestion-worker.js";
import { connectWithRetry, createStores } from "./stores.js";

const config = readConfig();
const stores = createStores(config, "worker");
const shutdownController = new AbortController();
let runtime: Awaited<ReturnType<typeof startIngestionWorker>> | undefined;
let shuttingDown = false;

const healthPort = process.env.WORKER_HEALTH_PORT ? Number(process.env.WORKER_HEALTH_PORT) : 3002;
const reconcileMs = process.env.WORKER_RECONCILE_MS ? Number(process.env.WORKER_RECONCILE_MS) : undefined;
const queueName = process.env.WORKER_QUEUE_NAME || undefined;

const health = createServer(
  createWorkerHealthHandler(() => runtime?.ready() ?? false, {
    timeoutMs: config.dependencyTimeoutMs,
    maxInFlight: 4,
    isShuttingDown: () => shuttingDown,
  }),
);
health.listen(healthPort, "127.0.0.1");

const startup = (async () => {
  const [mongoReady, redisReady] = await Promise.all([
    connectWithRetry(
      "mongodb",
      () => stores.mongo.connect(),
      config.connectAttempts,
      config.connectDelayMs,
      shutdownController.signal,
    ),
    connectWithRetry(
      "redis",
      () => stores.redis.connect(),
      config.connectAttempts,
      config.connectDelayMs,
      shutdownController.signal,
    ),
  ]);
  if (shuttingDown) return;
  if (!mongoReady || !redisReady) {
    throw new Error("worker_dependencies_unavailable");
  }
  runtime = await startIngestionWorker(new IngestionStore(stores.mongo.db()), config.redisUrl, {
    name: queueName,
    reconcileMs,
    probeTimeoutMs: config.dependencyTimeoutMs,
  });
  console.info(JSON.stringify({ event: "ingestion_worker_initialized" }));
})();

void startup.catch((error: unknown) => {
  if (shuttingDown) return;
  console.warn(JSON.stringify({ event: "ingestion_worker_startup_failed", errorType: error instanceof Error ? error.name.replace(/[^A-Za-z]/g, "").slice(0, 60) : "unknown", code: typeof error === "object" && error !== null && "code" in error && typeof error.code === "number" ? error.code : undefined }));
  void shutdown(1, "startup_failed");
});

async function shutdown(code = 0, signal = "SIGTERM") {
  if (shuttingDown) return;
  shuttingDown = true;
  shutdownController.abort();
  console.info(JSON.stringify({ event: "ingestion_worker_shutdown", signal }));
  const force = setTimeout(() => process.exit(code || 1), 5000);
  force.unref?.();
  await withinTimeout(
    () =>
      new Promise<void>((resolve) => {
        if (!health.listening) {
          resolve();
          return;
        }
        health.close(() => resolve());
        health.closeAllConnections?.();
      }),
    1500,
    "worker_health_close_timeout",
  ).catch(() => undefined);
  await startup.catch(() => undefined);
  await Promise.allSettled([
    runtime
      ? withinTimeout(() => runtime!.close(), 2000, "worker_runtime_close_timeout").catch(() => undefined)
      : Promise.resolve(),
    stores.close(),
  ]);
  clearTimeout(force);
  process.exit(code);
}

process.on("SIGTERM", () => {
  void shutdown(0, "SIGTERM");
});
process.on("SIGINT", () => {
  void shutdown(0, "SIGINT");
});
process.on("message", (message) => {
  if (message === "SIGTERM" || message === "SIGINT") {
    void shutdown(0, message);
  }
});
