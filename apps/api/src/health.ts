import express, { type ErrorRequestHandler, type Express, type RequestHandler, type Router } from "express";
import { createBoundedProbe } from "./platform/health/dependency-probes.js";
import { isMongoDependencyError } from "./platform/dependencies/dependency-status.js";
import type { capabilitySnapshot } from "./platform/health/capability-state.js";

export interface HealthChecks {
  mongo: () => Promise<boolean>;
  redis: () => Promise<boolean>;
}

export interface HealthOptions {
  checks: HealthChecks;
  timeoutMs?: number;
  maxInFlightProbes?: number;
  applicationReady?: () => boolean;
  capabilitySnapshot?: () => Promise<ReturnType<typeof capabilitySnapshot>>;
  fixtureReady?: () => boolean;
  mongoCapabilityReady?: () => boolean;
  ingestionCapabilityReady?: () => boolean;
  beforeMongoRoute?: () => Promise<void>;
  onMongoDependencyError?: () => void;
  authRouter?: Router;
  stockSearchRouter?: Router;
  dailyHistoryRouter?: Router;
  watchlistRouter?: Router;
  ingestionRouter?: Router;
  observedHistoryRouter?: Router;
  goldReadRouter?: Router;
}

function safeFlag(predicate: (() => boolean) | undefined, fallback: boolean): boolean {
  if (!predicate) return fallback;
  try {
    return Boolean(predicate());
  } catch {
    return false;
  }
}

export function createApp({
  checks,
  timeoutMs = 1000,
  maxInFlightProbes = 4,
  applicationReady = () => true,
  capabilitySnapshot,
  fixtureReady,
  mongoCapabilityReady,
  ingestionCapabilityReady,
  beforeMongoRoute,
  onMongoDependencyError,
  authRouter,
  stockSearchRouter,
  dailyHistoryRouter,
  watchlistRouter,
  ingestionRouter,
  observedHistoryRouter,
  goldReadRouter,
}: HealthOptions): Express {
  const app = express();
  app.disable("x-powered-by");

  const mongoProbe = createBoundedProbe(() => checks.mongo(), {
    timeoutMs,
    maxInFlight: maxInFlightProbes,
  });
  const redisProbe = createBoundedProbe(() => checks.redis(), {
    timeoutMs,
    maxInFlight: maxInFlightProbes,
  });

  app.get("/health/live", (_request, response) => {
    response.set("Cache-Control", "no-store");
    response.status(200).json({ status: "alive" });
  });

  app.get("/health/ready", async (_request, response) => {
    response.set("Cache-Control", "no-store");
    if (!safeFlag(applicationReady, true)) {
      response.status(503).json({ status: "not_ready" });
      return;
    }
    const [mongoReady, redisReady] = await Promise.all([
      mongoProbe.probe(),
      redisProbe.probe(),
    ]);
    const ready = mongoReady && redisReady && safeFlag(applicationReady, true);
    response.status(ready ? 200 : 503).json({ status: ready ? "ready" : "not_ready" });
  });

  app.get(["/health/read-ready", "/health/ready/fixture"], (_request, response) => {
    response.set("Cache-Control", "no-store");
    const ready = fixtureReady
      ? safeFlag(fixtureReady, false)
      : safeFlag(applicationReady, true);
    response.status(ready ? 200 : 503).json({ status: ready ? "ready" : "not_ready" });
  });

  app.get("/health/capabilities", async (_request, response) => {
    response.set("Cache-Control", "no-store");
    if (!capabilitySnapshot) { response.status(503).json({ status: "unavailable" }); return; }
    response.status(200).json(await capabilitySnapshot());
  });

  app.get("/health/ready/mongo", async (_request, response) => {
    response.set("Cache-Control", "no-store");
    const capabilityReady = mongoCapabilityReady
      ? safeFlag(mongoCapabilityReady, false)
      : safeFlag(applicationReady, true);
    if (!capabilityReady) {
      response.status(503).json({ status: "not_ready" });
      return;
    }
    const mongoReady = await mongoProbe.probe();
    response.status(mongoReady ? 200 : 503).json({ status: mongoReady ? "ready" : "not_ready" });
  });

  app.get("/health/ready/ingestion", async (_request, response) => {
    response.set("Cache-Control", "no-store");
    if (!safeFlag(ingestionCapabilityReady, false)) {
      response.status(503).json({ status: "not_ready" });
      return;
    }
    const mongoReady = await mongoProbe.probe();
    response.status(mongoReady ? 200 : 503).json({ status: mongoReady ? "ready" : "not_ready" });
  });

  const mongoPreGate: RequestHandler | undefined = beforeMongoRoute
    ? async (_request, _response, next) => {
      try {
        await beforeMongoRoute();
      } catch {
        // downstream route/handler will fail closed
      }
      next();
    }
    : undefined;

  if (authRouter) {
    if (mongoPreGate) app.use("/api/auth", mongoPreGate, authRouter);
    else app.use("/api/auth", authRouter);
  }
  if (stockSearchRouter) app.use("/api/assets", stockSearchRouter);
  if (dailyHistoryRouter) app.use("/api/assets", dailyHistoryRouter);
  if (observedHistoryRouter) app.use("/api/observed/assets", observedHistoryRouter);
  app.use("/api/gold/quotes", (_request, response, next) => {
    response.set("Cache-Control", "no-store");
    next();
  });
  if (goldReadRouter) app.use("/api/gold/quotes", goldReadRouter);
  if (watchlistRouter) {
    if (mongoPreGate) app.use("/api/watchlists", mongoPreGate, watchlistRouter);
    else app.use("/api/watchlists", watchlistRouter);
  }
  if (ingestionRouter) app.use("/internal/ingestion", ingestionRouter);
  app.use("/api", (_request, response) => response.status(404).json({ error: "not_found" }));
  app.use(createApiErrorHandler(onMongoDependencyError));

  return app;
}

export function createApiErrorHandler(onMongoDependencyError?: () => void): ErrorRequestHandler {
  return (error: unknown, _request, response, next) => {
    if (response.headersSent) {
      next(error);
      return;
    }
    response.set("Cache-Control", "no-store");
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
    if (isMongoDependencyError(error)) {
      onMongoDependencyError?.();
      response.status(503).json({ error: "not_ready" });
      return;
    }
    response.status(500).json({ error: "internal_error" });
  };
}
