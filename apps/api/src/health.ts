import express, { type Express } from "express";

export interface HealthChecks {
  mongo: () => Promise<boolean>;
  redis: () => Promise<boolean>;
}

export interface HealthOptions {
  checks: HealthChecks;
  timeoutMs?: number;
}

function within<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("health check timed out")), timeoutMs);
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

export function createApp({ checks, timeoutMs = 1000 }: HealthOptions): Express {
  const app = express();
  app.disable("x-powered-by");

  app.get("/health/live", (_request, response) => {
    response.status(200).json({ status: "alive" });
  });

  app.get("/health/ready", async (_request, response) => {
    const checksResult = await Promise.allSettled([
      within(checks.mongo(), timeoutMs),
      within(checks.redis(), timeoutMs),
    ]);
    const ready = checksResult.every((result) => result.status === "fulfilled" && result.value);
    response.status(ready ? 200 : 503).json({ status: ready ? "ready" : "not_ready" });
  });

  return app;
}
