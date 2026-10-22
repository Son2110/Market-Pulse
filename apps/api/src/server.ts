import { createServer } from "node:http";
import { createAuthApi } from "./auth.js";
import { readConfig } from "./config.js";
import { createDailyHistoryRouter } from "./daily-history.js";
import { evaluateFixtureReadiness, withinTimeout } from "./dependency-lifecycle.js";
import { capabilitySnapshot } from "./platform/health/capability-state.js";
import { createFixtureMarketDataProvider } from "./fixture-market-data-provider.js";
import { createGoldReadRouter, GoldReadService } from "./gold-read.js";
import { createApp } from "./health.js";
import { createIngestionApi } from "./ingestion-api.js";
import { createIngestionQueue, DeliveryQueue } from "./ingestion-queue.js";
import { IngestionStore } from "./ingestion-store.js";
import { createObservedHistoryRouter, ObservedHistoryService } from "./observed-history.js";
import { createStockSearchRouter, StockSearchService } from "./stock-search.js";
import { connectWithRetry, createStores } from "./stores.js";
import { createWatchlistApi } from "./watchlists.js";

const config = readConfig();
const stores = createStores(config);
const marketData = createFixtureMarketDataProvider();
const stockSearch = new StockSearchService(marketData);
let connectedBefore = false;
let authReady = false;
let marketDataReady = false;
let stockSearchReady = false;
let watchlistReady = false;
let shuttingDown = false;
let startupPromise: Promise<boolean> | undefined;
let ingestionReady = false;
const queueName = process.env.WORKER_QUEUE_NAME || undefined;
const ingestionStore = new IngestionStore(stores.mongo.db());
let ingestionQueue: ReturnType<typeof createIngestionQueue> | undefined;
let deliveries: DeliveryQueue | undefined;
if (!config.ingestionSecret) console.info(JSON.stringify({ event: "ingestion_disabled" }));
const shutdownController = new AbortController();

const auth = createAuthApi({
  db: stores.mongo.db(),
  isReady: () => !shuttingDown && authReady && stores.tracker.isMongoHealthy(),
  rateLimitMax: config.authRateLimitMax,
  rateLimitWindowMs: config.authRateLimitWindowMs,
  kdfConcurrency: config.authKdfConcurrency,
});
const watchlists = createWatchlistApi({
  db: stores.mongo.db(),
  authenticate: auth.authenticate,
  provider: marketData,
  isReady: () =>
    !shuttingDown
    && authReady
    && marketDataReady
    && watchlistReady
    && stores.tracker.isMongoHealthy(),
});

const server = createServer(
  createApp({
    checks: stores.checks,
    timeoutMs: config.dependencyTimeoutMs,
    capabilitySnapshot: async () => {
      const [mongoReady, redisReady] = await Promise.all([stores.checks.mongo(), stores.checks.redis()]);
      return capabilitySnapshot({
        fixtureReady: marketDataReady && stockSearchReady,
        mongoInitialized: connectedBefore && authReady && watchlistReady,
        mongoReady, redisReady,
        queueReady: Boolean(ingestionQueue?.raw.isReady),
        observedEnabled: config.observedReadsEnabled, goldEnabled: config.goldReadsEnabled,
        ingestionEnabled: Boolean(config.ingestionSecret), ingestionInitialized: ingestionReady, shuttingDown,
      });
    },
    applicationReady: () =>
      !shuttingDown
      && connectedBefore
      && authReady
      && marketDataReady
      && stockSearchReady
      && watchlistReady
      && (!config.ingestionSecret || ingestionReady && Boolean(ingestionQueue?.raw.isReady)),
    fixtureReady: () =>
      evaluateFixtureReadiness({
        shuttingDown,
        startupComplete: marketDataReady && stockSearchReady,
        fixtureInitialized: marketData.ready && stockSearch.ready,
      }),
    mongoCapabilityReady: () =>
      !shuttingDown
      && connectedBefore
      && authReady
      && marketDataReady
      && watchlistReady,
    ingestionCapabilityReady: () =>
      !shuttingDown
      && connectedBefore
      && Boolean(config.ingestionSecret)
      && ingestionReady,
    beforeMongoRoute: async () => {
      if (!shuttingDown && connectedBefore && !stores.tracker.isMongoHealthy()) {
        await stores.checks.mongo();
      }
    },
    onMongoDependencyError: () => {
      stores.tracker.markMongo(false);
    },
    authRouter: auth.router,
    stockSearchRouter: createStockSearchRouter(stockSearch),
    dailyHistoryRouter: createDailyHistoryRouter(marketData),
    observedHistoryRouter: config.observedReadsEnabled
      ? createObservedHistoryRouter(
        new ObservedHistoryService(stores.mongo.db(), config.dependencyTimeoutMs),
        () => connectedBefore && !shuttingDown,
      )
      : undefined,
    goldReadRouter: config.goldReadsEnabled
      ? createGoldReadRouter(
        new GoldReadService(stores.mongo.db()),
        () => connectedBefore && !shuttingDown,
      )
      : undefined,
    watchlistRouter: watchlists.router,
    ingestionRouter: createIngestionApi({
      store: ingestionStore,
      secret: config.ingestionSecret,
      isReady: () => !shuttingDown && connectedBefore && Boolean(config.ingestionSecret) && ingestionReady,
      enqueue: async (id, digest, signal) => {
        await deliveries?.enqueue(id, digest, signal);
      },
      onMongoResult: (ready) => stores.tracker.markMongo(ready),
    }),
  }),
);

server.listen(config.port, config.host, () => {
  console.info(JSON.stringify({ event: "api_listening", port: config.port }));
  startupPromise = connectStores();
  void startupPromise.then((ready) => {
    if (!ready && !shuttingDown) void shutdown("dependency_unavailable", 1);
  });
});

async function connectStores(): Promise<boolean> {
  const mongoReady = await connectWithRetry("mongodb", () => stores.mongo.connect(), config.connectAttempts, config.connectDelayMs, shutdownController.signal);
  connectedBefore = mongoReady;
  if (!connectedBefore) return false;
  stores.tracker.markMongo(true);
  if (config.ingestionSecret) {
    try {
      await ingestionStore.initialize();
    } catch {
      console.warn(JSON.stringify({ event: "ingestion_initialization_failed" }));
      return false;
    }
  }
  try {
    await auth.initialize();
    authReady = true;
  } catch {
    console.warn(JSON.stringify({ event: "auth_indexes_unavailable" }));
    return false;
  }
  try {
    await marketData.initialize();
    marketDataReady = true;
  } catch {
    console.warn(JSON.stringify({ event: "market_data_fixture_unavailable" }));
    return false;
  }
  try {
    await stockSearch.initialize();
    stockSearchReady = true;
  } catch {
    console.warn(JSON.stringify({ event: "asset_search_catalog_unavailable" }));
    return false;
  }
  try {
    await watchlists.initialize();
    watchlistReady = true;
  } catch {
    console.warn(JSON.stringify({ event: "watchlist_initialization_unavailable" }));
    return false;
  }
  if (shuttingDown) return false;
  // Missing Redis DNS must not compete with required Mongo startup on a cold API.
  stores.startRedisRecovery();
  if (config.ingestionSecret) {
    ingestionQueue = createIngestionQueue(config.redisUrl, queueName, true, "api");
    deliveries = new DeliveryQueue(ingestionStore, ingestionQueue.queue);
    ingestionReady = true;
  }
  return connectedBefore && authReady && marketDataReady && stockSearchReady && watchlistReady && (!config.ingestionSecret || ingestionReady);
}

async function shutdown(signal: string, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  shutdownController.abort();
  console.info(JSON.stringify({ event: "api_shutdown", signal }));
  const forceExit = setTimeout(() => process.exit(exitCode), 5000);
  forceExit.unref?.();
  await Promise.all([
    withinTimeout(
      () =>
        new Promise<void>((resolve) => {
          if (!server.listening) return resolve();
          server.close(() => resolve());
          server.closeAllConnections?.();
        }),
      1500,
      "api_http_close_timeout",
    ).catch(() => undefined),
    (async () => {
      await startupPromise?.catch(() => false);
      await Promise.allSettled([
        ingestionQueue?.close() ?? Promise.resolve(),
        stores.close(),
      ]);
    })(),
  ]);
  clearTimeout(forceExit);
  process.exit(exitCode);
}

process.on("SIGINT", () => void shutdown("SIGINT", 0));
process.on("SIGTERM", () => void shutdown("SIGTERM", 0));
process.on("message", (message) => {
  if (message === "SIGINT" || message === "SIGTERM") {
    void shutdown(message, 0);
  }
});
