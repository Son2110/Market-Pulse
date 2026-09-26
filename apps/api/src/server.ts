import { createServer } from "node:http";
import { readConfig } from "./config.js";
import { createApp } from "./health.js";
import { connectWithRetry, createStores } from "./stores.js";

const config = readConfig();
const stores = createStores(config);
let connectedBefore = false;
let shuttingDown = false;
let startupPromise: Promise<boolean> | undefined;
const shutdownController = new AbortController();

stores.redis.on("error", () => {
  console.warn(JSON.stringify({ event: "dependency_error", service: "redis" }));
  if (connectedBefore) void shutdown("redis_error", 1);
});
stores.redis.on("end", () => {
  if (connectedBefore && !shuttingDown) void shutdown("redis_disconnected", 1);
});

const server = createServer(createApp({ checks: stores.checks, timeoutMs: config.dependencyTimeoutMs }));
server.listen(config.port, config.host, () => {
  console.info(JSON.stringify({ event: "api_listening", port: config.port }));
  startupPromise = connectStores();
  void startupPromise.then((ready) => {
    if (!ready && !shuttingDown) void shutdown("dependency_unavailable", 1);
  });
});

async function connectStores(): Promise<boolean> {
  const [mongoReady, redisReady] = await Promise.all([
    connectWithRetry("mongodb", () => stores.mongo.connect(), config.connectAttempts, config.connectDelayMs, shutdownController.signal),
    connectWithRetry("redis", () => stores.redis.connect(), config.connectAttempts, config.connectDelayMs, shutdownController.signal),
  ]);
  connectedBefore = mongoReady && redisReady;
  return connectedBefore;
}

async function shutdown(signal: string, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  shutdownController.abort();
  console.info(JSON.stringify({ event: "api_shutdown", signal }));
  const forceExit = setTimeout(() => process.exit(exitCode), 5000);
  await Promise.all([
    new Promise<void>((resolve) => {
      if (!server.listening) return resolve();
      server.close(() => resolve());
    }),
    (async () => {
      await startupPromise?.catch(() => false);
      await Promise.allSettled([
        stores.mongo.close(),
        stores.redis.isOpen ? stores.redis.quit() : Promise.resolve(),
      ]);
    })(),
  ]);
  clearTimeout(forceExit);
  process.exitCode = exitCode;
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
