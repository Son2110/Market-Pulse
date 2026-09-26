import { MongoClient } from "mongodb";
import { createClient } from "redis";
import type { ApiConfig } from "./config.js";
import type { HealthChecks } from "./health.js";

const CONNECT_TIMEOUT_MS = 1000;
const SOCKET_TIMEOUT_MS = 2000;

export function createStores(config: ApiConfig) {
  const mongo = new MongoClient(config.mongoUrl, {
    connectTimeoutMS: CONNECT_TIMEOUT_MS,
    serverSelectionTimeoutMS: CONNECT_TIMEOUT_MS,
    socketTimeoutMS: SOCKET_TIMEOUT_MS,
  });
  const redis = createClient({
    url: config.redisUrl,
    socket: { connectTimeout: CONNECT_TIMEOUT_MS, reconnectStrategy: false },
  });

  return {
    mongo,
    redis,
    checks: {
      mongo: async () => {
        await mongo.db().command({ ping: 1 });
        return true;
      },
      redis: async () => (await redis.ping()) === "PONG",
    } satisfies HealthChecks,
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
      if (attempt < attempts) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, delayMs);
          signal?.addEventListener("abort", () => {
            clearTimeout(timer);
            resolve();
          }, { once: true });
        });
      }
    }
  }
  return false;
}
