import express, { type ErrorRequestHandler, type Express, type Router } from "express";

export interface HealthChecks {
  mongo: () => Promise<boolean>;
  redis: () => Promise<boolean>;
}

export interface HealthOptions {
  checks: HealthChecks;
  timeoutMs?: number;
  applicationReady?: () => boolean;
  authRouter?: Router;
  stockSearchRouter?: Router;
  dailyHistoryRouter?: Router;
  watchlistRouter?: Router;
  ingestionRouter?: Router;
}

function within<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("health check timed out")), timeoutMs);
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

export function createApp({ checks, timeoutMs = 1000, applicationReady = () => true, authRouter, stockSearchRouter, dailyHistoryRouter, watchlistRouter, ingestionRouter }: HealthOptions): Express {
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
    const ready = checksResult.every((result) => result.status === "fulfilled" && result.value) && applicationReady();
    response.status(ready ? 200 : 503).json({ status: ready ? "ready" : "not_ready" });
  });

  if (authRouter) app.use("/api/auth", authRouter);
  if (stockSearchRouter) app.use("/api/assets", stockSearchRouter);
  if (dailyHistoryRouter) app.use("/api/assets", dailyHistoryRouter);
  if (watchlistRouter) app.use("/api/watchlists", watchlistRouter);
  if (ingestionRouter) app.use("/internal/ingestion", ingestionRouter);
  app.use("/api", (_request, response) => response.status(404).json({ error: "not_found" }));
  app.use(apiErrorHandler);

  return app;
}

const apiErrorHandler: ErrorRequestHandler = (error: unknown, _request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }
  const type = typeof error === "object" && error !== null && "type" in error ? error.type : undefined;
  if (type === "entity.too.large") {
    response.status(413).json({ error: "payload_too_large" });
    return;
  }
  if (type === "entity.parse.failed") {
    response.status(400).json({ error: "invalid_json" });
    return;
  }
  if (type === "charset.unsupported" || type === "encoding.unsupported") {
    response.status(415).json({ error: "unsupported_media_type" });
    return;
  }
  response.status(500).json({ error: "internal_error" });
};
