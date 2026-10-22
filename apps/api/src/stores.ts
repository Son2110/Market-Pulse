import { MongoClient } from "mongodb";
import { createClient } from "redis";
import type { ApiConfig } from "./config.js";
import { createBoundedProbe, withinTimeout } from "./platform/health/dependency-probes.js";
import { computeReconnectDelayMs, logDependencyTransitions } from "./platform/recovery/redis-lifecycle.js";
import { createDependencyHealthTracker } from "./platform/dependencies/dependency-status.js";
import type { HealthChecks } from "./health.js";

const CONNECT_TIMEOUT_MS = 1000;
const SOCKET_TIMEOUT_MS = 2000;

export function createStores(config: ApiConfig, role: "api" | "worker" = "api") {
  const transitions = { mongodb: logDependencyTransitions("mongodb", role), redis: logDependencyTransitions("redis", role) };
  const tracker = createDependencyHealthTracker({}, (service, ready) => transitions[service](ready));
  let autoReconnect = false;
  let closing = false;

  const mongo = new MongoClient(config.mongoUrl, {
    connectTimeoutMS: CONNECT_TIMEOUT_MS,
    serverSelectionTimeoutMS: CONNECT_TIMEOUT_MS,
    socketTimeoutMS: SOCKET_TIMEOUT_MS,
  });
  mongo.on("serverHeartbeatSucceeded", () => {
    if (!closing) tracker.markMongo(true);
  });
  mongo.on("serverHeartbeatFailed", () => {
    tracker.markMongo(false);
  });
  mongo.on("topologyClosed", () => {
    tracker.markMongo(false);
  });

  const redis = createClient({
    url: config.redisUrl,
    disableOfflineQueue: true,
    socket: {
      connectTimeout: CONNECT_TIMEOUT_MS,
      reconnectStrategy: (retries) =>
        computeReconnectDelayMs(retries, {
          canReconnect: () => autoReconnect && !closing,
        }),
    },
  });
  redis.on("ready", () => {
    if (!closing) {
      autoReconnect = true;
      tracker.markRedis(true);
    }
  });
  redis.on("error", () => {
    tracker.markRedis(false);
  });
  redis.on("end", () => {
    tracker.markRedis(false);
  });

  const mongoProbe = createBoundedProbe(
    async () => {
      if (closing) return false;
      const result = await mongo.db().command({ ping: 1 });
      return result.ok === 1;
    },
    {
      timeoutMs: config.dependencyTimeoutMs,
      maxInFlight: 4,
      onResult: (ok) => tracker.markMongo(ok),
    },
  );

  const redisProbe = createBoundedProbe(
    async () => {
      if (closing || !redis.isOpen || !redis.isReady) return false;
      return (await redis.ping()) === "PONG";
    },
    {
      timeoutMs: config.dependencyTimeoutMs,
      maxInFlight: 4,
      onResult: (ok) => tracker.markRedis(ok),
    },
  );

  return {
    mongo,
    redis,
    tracker,
    startRedisRecovery: () => {
      autoReconnect = true;
      // node-redis owns one cancellable reconnect loop, including cold-start failure.
      if (!closing && !redis.isOpen) void redis.connect().catch(() => tracker.markRedis(false));
    },
    checks: {
      mongo: mongoProbe.probe,
      redis: redisProbe.probe,
    } satisfies HealthChecks,
    close: async () => {
      closing = true;
      autoReconnect = false;
      tracker.markMongo(false);
      tracker.markRedis(false);
      await Promise.allSettled([
        withinTimeout(async () => {
          if (redis.isOpen) {
            try {
              await redis.quit();
            } catch {
              redis.destroy();
            }
          }
        }, 1500, "redis_close_timeout").catch(() => {
          try {
            if (redis.isOpen) redis.destroy();
          } catch {
            // ignore teardown error
          }
        }),
        withinTimeout(() => mongo.close(true), 1500, "mongo_close_timeout").catch(() => undefined),
      ]);
    },
  };
}

export async function connectWithRetry(
  name: string,
  connect: () => Promise<unknown>,
  attempts: number,
  delayMs: number,
  signal?: AbortSignal,
): Promise<boolean> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (signal?.aborted) return false;
    try {
      await connect();
      console.info(JSON.stringify({ event: "dependency_connected", service: name }));
      return true;
    } catch {
      console.warn(JSON.stringify({ event: "dependency_connect_failed", service: name, attempt }));
      if (attempt < attempts && !signal?.aborted) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, delayMs);
          signal?.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              resolve();
            },
            { once: true },
          );
        });
      }
    }
  }
  return false;
}
