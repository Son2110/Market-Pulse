import { createServer } from "node:http";
import { createAuthApi } from "./auth.js";
import { readConfig } from "./config.js";
import { createDailyHistoryRouter } from "./daily-history.js";
import { createFixtureMarketDataProvider } from "./fixture-market-data-provider.js";
import { createApp } from "./health.js";
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
const shutdownController = new AbortController();
const auth = createAuthApi({
  db: stores.mongo.db(),
  isReady: () => authReady,
  rateLimitMax: config.authRateLimitMax,
  rateLimitWindowMs: config.authRateLimitWindowMs,
  kdfConcurrency: config.authKdfConcurrency,
});
const watchlists = createWatchlistApi({
  db: stores.mongo.db(),
  authenticate: auth.authenticate,
  provider: marketData,
  isReady: () => authReady && marketDataReady && watchlistReady,
});

stores.redis.on("error", () => {
  console.warn(JSON.stringify({ event: "dependency_error", service: "redis" }));
  if (connectedBefore) void shutdown("redis_error", 1);
});
stores.redis.on("end", () => {
  if (connectedBefore && !shuttingDown) void shutdown("redis_disconnected", 1);
});

const server = createServer(createApp({
  checks: stores.checks,
  timeoutMs: config.dependencyTimeoutMs,
  applicationReady: () => authReady && marketDataReady && stockSearchReady && watchlistReady,
  authRouter: auth.router,
  stockSearchRouter: createStockSearchRouter(stockSearch),
  dailyHistoryRouter: createDailyHistoryRouter(marketData),
  watchlistRouter: watchlists.router,
}));
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
  if (!connectedBefore) return false;
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
  }
  if (marketDataReady) {
    try {
      await stockSearch.initialize();
      stockSearchReady = true;
    } catch {
      console.warn(JSON.stringify({ event: "asset_search_catalog_unavailable" }));
    }
    try {
      await watchlists.initialize();
      watchlistReady = true;
    } catch {
      console.warn(JSON.stringify({ event: "watchlist_initialization_unavailable" }));
    }
  }
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
