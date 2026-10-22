import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import test from "node:test";
import express from "express";
import {
  computeReconnectDelayMs,
  createBoundedProbe,
  createDependencyHealthTracker,
  createReconciliationCoordinator,
  createWorkerHealthHandler,
  evaluateFixtureReadiness,
  evaluateFullReadiness,
  evaluateIngestionCapabilityReadiness,
  evaluateMongoCapabilityReadiness,
  isMongoDependencyError,
  trackOperation,
  withinTimeout,
} from "../src/dependency-lifecycle.js";
import { createApp, type HealthOptions } from "../src/health.js";
import { createIngestionQueue } from "../src/ingestion-queue.js";
import { connectWithRetry } from "../src/stores.js";

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function withAppServer(
  options: HealthOptions,
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server: Server = createServer(createApp(options));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("test server did not bind a TCP port");
  }
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

test("capability probes separate liveness, full readiness, fixture, mongo, and ingestion readiness with no-store headers", async () => {
  let mongoUp = true;
  let redisUp = true;
  let fixtureInit = true;
  const mongoInit = true;
  let ingestionSecretSet = true;
  let ingestionInit = true;
  let shuttingDown = false;

  await withAppServer(
    {
      checks: {
        mongo: async () => mongoUp,
        redis: async () => redisUp,
      },
      timeoutMs: 100,
      applicationReady: () =>
        !shuttingDown && fixtureInit && mongoInit && (!ingestionSecretSet || ingestionInit),
      fixtureReady: () =>
        evaluateFixtureReadiness({
          shuttingDown,
          startupComplete: fixtureInit,
          fixtureInitialized: fixtureInit,
        }),
      mongoCapabilityReady: () => !shuttingDown && mongoInit,
      ingestionCapabilityReady: () => !shuttingDown && ingestionSecretSet && ingestionInit,
    },
    async (baseUrl) => {
      const checkProbe = async (path: string, expectedStatus: number, expectedState: string) => {
        const response = await fetch(`${baseUrl}${path}`);
        assert.equal(response.status, expectedStatus, `${path} status`);
        assert.equal(response.headers.get("cache-control"), "no-store", `${path} cache-control`);
        assert.deepEqual(await response.json(), { status: expectedState }, `${path} body`);
      };

      // 1. All healthy and initialized
      await checkProbe("/health/live", 200, "alive");
      await checkProbe("/health/ready", 200, "ready");
      await checkProbe("/health/ready/fixture", 200, "ready");
      await checkProbe("/health/ready/mongo", 200, "ready");
      await checkProbe("/health/ready/ingestion", 200, "ready");

      // 2. Redis outage: full readiness is 503, but liveness, fixture, mongo, and durable ingestion stay 200
      redisUp = false;
      await checkProbe("/health/live", 200, "alive");
      await checkProbe("/health/ready", 503, "not_ready");
      await checkProbe("/health/ready/fixture", 200, "ready");
      await checkProbe("/health/ready/mongo", 200, "ready");
      await checkProbe("/health/ready/ingestion", 200, "ready");

      // 3. Mongo outage (with Redis restored): fixture stays 200, while full, mongo, and ingestion become 503
      redisUp = true;
      mongoUp = false;
      await checkProbe("/health/live", 200, "alive");
      await checkProbe("/health/ready", 503, "not_ready");
      await checkProbe("/health/ready/fixture", 200, "ready");
      await checkProbe("/health/ready/mongo", 503, "not_ready");
      await checkProbe("/health/ready/ingestion", 503, "not_ready");

      // 4. Mongo restored, but INGESTION_SECRET unset: full, fixture, mongo are 200; ingestion capability is 503
      mongoUp = true;
      ingestionSecretSet = false;
      ingestionInit = false;
      await checkProbe("/health/ready", 200, "ready");
      await checkProbe("/health/ready/fixture", 200, "ready");
      await checkProbe("/health/ready/mongo", 200, "ready");
      await checkProbe("/health/ready/ingestion", 503, "not_ready");

      // 5. INGESTION_SECRET configured, but ingestionStore not initialized: both full and ingestion are 503
      ingestionSecretSet = true;
      ingestionInit = false;
      await checkProbe("/health/ready", 503, "not_ready");
      await checkProbe("/health/ready/ingestion", 503, "not_ready");
      await checkProbe("/health/ready/fixture", 200, "ready");
      await checkProbe("/health/ready/mongo", 200, "ready");

      // 6. Uninitialized fixture: fixture and full readiness become 503
      ingestionInit = true;
      fixtureInit = false;
      await checkProbe("/health/ready", 503, "not_ready");
      await checkProbe("/health/ready/fixture", 503, "not_ready");
      await checkProbe("/health/ready/mongo", 200, "ready");

      // 7. Shutting down lowers all readiness probes while /health/live stays 200 until server close
      fixtureInit = true;
      shuttingDown = true;
      await checkProbe("/health/live", 200, "alive");
      await checkProbe("/health/ready", 503, "not_ready");
      await checkProbe("/health/ready/fixture", 503, "not_ready");
      await checkProbe("/health/ready/mongo", 503, "not_ready");
      await checkProbe("/health/ready/ingestion", 503, "not_ready");
    },
  );
});

test("saturated probe preserves healthy dependency state while a successful check holds a raw operation slot", async () => {
  const tracker = createDependencyHealthTracker({ mongo: true, redis: true });
  const results: boolean[] = [];
  let checksStarted = 0;
  let releaseOperation!: () => void;
  const heldOperation = new Promise<void>((resolve) => {
    releaseOperation = resolve;
  });
  const boundedProbe = createBoundedProbe(
    () => {
      checksStarted += 1;
      if (checksStarted === 1) {
        void trackOperation(() => heldOperation);
      }
      return true;
    },
    {
      timeoutMs: 1000,
      maxInFlight: 1,
      onResult: (ready) => {
        results.push(ready);
        tracker.markMongo(ready);
      },
    },
  );

  try {
    assert.equal(await boundedProbe.probe(), true);
    assert.equal(boundedProbe.inFlight, 1);
    assert.deepEqual(results, [true]);
    assert.equal(await boundedProbe.probe(), false);
    assert.equal(checksStarted, 1, "saturation must not start another dependency check");
    assert.deepEqual(results, [true], "saturation must not report a dependency failure");
    assert.equal(tracker.isMongoHealthy(), true);
  } finally {
    releaseOperation();
  }

  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(boundedProbe.inFlight, 0);
  assert.equal(await boundedProbe.probe(), true);
  assert.equal(checksStarted, 2);
  assert.deepEqual(results, [true, true]);
  assert.equal(tracker.isMongoHealthy(), true);
  assert.equal(boundedProbe.inFlight, 0);
});

test("bounded probe holds slots across multiple timeout cycles until real settlement, ignores late resolve/reject, and recovers", async () => {
  const baseState = {
    shuttingDown: false,
    startupComplete: true,
    fixtureInitialized: true,
    mongoInitialized: true,
    ingestionSecretConfigured: true,
    ingestionInitialized: true,
    mongoProbe: async () => true,
    redisProbe: async () => true,
  };
  assert.equal(await evaluateFullReadiness(baseState), true);
  assert.equal(await evaluateFullReadiness({ ...baseState, redisProbe: async () => false }), false);
  assert.equal(await evaluateMongoCapabilityReadiness(baseState), true);
  assert.equal(
    await evaluateIngestionCapabilityReadiness({ ...baseState, ingestionSecretConfigured: false }),
    false,
  );

  for (const check of [
    () => false,
    () => { throw new Error("secret://mongo-internal-uri"); },
    () => Promise.reject(new Error("dependency rejected")),
  ]) {
    const results: boolean[] = [];
    const failedProbe = createBoundedProbe(check, { onResult: (ready) => results.push(ready) });
    assert.equal(await failedProbe.probe(), false);
    assert.deepEqual(results, [false]);
    assert.equal(failedProbe.inFlight, 0);
  }

  // Multi-cycle timeout regression: slots remain held until real operations settle
  const tracker = createDependencyHealthTracker({ mongo: true, redis: true });
  const results: boolean[] = [];
  let activeUnderlying = 0;
  let maxConcurrentUnderlying = 0;
  let totalUnderlyingStarted = 0;
  let shouldHang = true;
  const pendingOperations: Array<{
    resolve: (value: boolean) => void;
    reject: (reason?: unknown) => void;
  }> = [];

  const boundedProbe = createBoundedProbe(
    () => {
      totalUnderlyingStarted += 1;
      activeUnderlying += 1;
      maxConcurrentUnderlying = Math.max(maxConcurrentUnderlying, activeUnderlying);
      if (!shouldHang) {
        activeUnderlying -= 1;
        return Promise.resolve(true);
      }
      return new Promise<boolean>((resolve, reject) => {
        pendingOperations.push({
          resolve: (val) => {
            activeUnderlying -= 1;
            resolve(val);
          },
          reject: (err) => {
            activeUnderlying -= 1;
            reject(err);
          },
        });
      });
    },
    {
      timeoutMs: 30,
      maxInFlight: 2,
      onResult: (ok) => {
        results.push(ok);
        tracker.markMongo(ok);
      },
    },
  );

  // Cycle 1: 2 probes start and time out while underlying operations remain pending
  const cycle1 = await Promise.all([boundedProbe.probe(), boundedProbe.probe()]);
  assert.deepEqual(cycle1, [false, false]);
  assert.equal(tracker.isMongoHealthy(), false);
  assert.deepEqual(results, [false, false], "timed-out checks must report dependency failure");
  assert.equal(boundedProbe.inFlight, 2, "slots must NOT be released on timeout before operation settles");
  assert.equal(activeUnderlying, 2);
  assert.equal(totalUnderlyingStarted, 2);

  // Cycles 2, 3, and 4: repeated probe bursts across multiple timeout windows must NOT start new operations
  for (let cycle = 2; cycle <= 4; cycle += 1) {
    const burst = await Promise.all([
      boundedProbe.probe(),
      boundedProbe.probe(),
      boundedProbe.probe(),
    ]);
    assert.deepEqual(burst, [false, false, false], `cycle ${cycle} must fail closed`);
    assert.equal(
      totalUnderlyingStarted,
      2,
      `cycle ${cycle} must not start extra operations while timed-out operations are still unsettled`,
    );
    assert.equal(maxConcurrentUnderlying, 2);
    assert.equal(boundedProbe.inFlight, 2);
    await pause(35);
  }

  // Late resolve of timed-out operation #1 with `true` must NOT mark tracker healthy, and releases exactly 1 slot
  pendingOperations[0]!.resolve(true);
  await pause(15);
  assert.equal(
    tracker.isMongoHealthy(),
    false,
    "late resolve after timeout must NOT mark dependency healthy",
  );
  assert.equal(boundedProbe.inFlight, 1);
  assert.equal(activeUnderlying, 1);

  // Late reject of timed-out operation #2 must NOT cause unhandledRejection and releases the remaining slot
  pendingOperations[1]!.reject(new Error("late socket error after timeout"));
  await pause(15);
  assert.equal(tracker.isMongoHealthy(), false);
  assert.equal(boundedProbe.inFlight, 0);
  assert.equal(activeUnderlying, 0);

  // Recovery: once hung operations have settled, a healthy operation runs and restores readiness
  shouldHang = false;
  assert.equal(await boundedProbe.probe(), true);
  assert.equal(tracker.isMongoHealthy(), true);
  assert.equal(boundedProbe.inFlight, 0);
  assert.equal(totalUnderlyingStarted, 3);
  assert.equal(maxConcurrentUnderlying, 2);
  assert.deepEqual(results, [false, false, true]);
});

test("nested bounded probes and trackOperation hold both outer and inner slots until raw I/O settles and prevent late-resolve races", async () => {
  const tracker = createDependencyHealthTracker({ mongo: true, redis: true });
  let rawActive = 0;
  let maxRawActive = 0;
  let totalRawStarted = 0;
  let hangRaw = true;
  const rawControllers: Array<{
    resolve: (ok: boolean) => void;
    reject: (err: unknown) => void;
  }> = [];

  const innerProbe = createBoundedProbe(
    async () => {
      const p1 = trackOperation(
        () =>
          new Promise<boolean>((resolve, reject) => {
            totalRawStarted += 1;
            rawActive += 1;
            maxRawActive = Math.max(maxRawActive, rawActive);
            if (!hangRaw) {
              rawActive -= 1;
              resolve(true);
              return;
            }
            rawControllers.push({
              resolve: (ok) => {
                rawActive -= 1;
                resolve(ok);
              },
              reject: (err) => {
                rawActive -= 1;
                reject(err);
              },
            });
          }),
      );
      return await p1;
    },
    {
      timeoutMs: 30,
      maxInFlight: 2,
      onResult: (ok) => tracker.markMongo(ok),
    },
  );

  const outerProbe = createBoundedProbe(() => innerProbe.probe(), {
    timeoutMs: 30,
    maxInFlight: 2,
  });

  // Start 2 concurrent calls through outerProbe -> innerProbe -> raw I/O
  const firstBatch = await Promise.all([outerProbe.probe(), outerProbe.probe()]);
  assert.deepEqual(firstBatch, [false, false]);
  assert.equal(tracker.isMongoHealthy(), false);
  assert.equal(
    innerProbe.inFlight,
    2,
    "inner probe must hold slots after timeout while raw I/O is pending",
  );
  assert.equal(
    outerProbe.inFlight,
    2,
    "outer probe must hold slots after inner timeout while raw I/O is pending",
  );

  // Additional calls across multiple timeout cycles cannot exceed maxInFlight=2
  for (let i = 0; i < 3; i += 1) {
    assert.equal(await outerProbe.probe(), false);
    assert.equal(totalRawStarted, 2);
    assert.equal(maxRawActive, 2);
    await pause(20);
  }

  // Settle raw operations (one late resolve true, one late reject)
  rawControllers[0]!.resolve(true);
  rawControllers[1]!.reject(new Error("late raw error"));
  await pause(15);
  assert.equal(tracker.isMongoHealthy(), false, "late resolve must not flip tracker to true");
  assert.equal(innerProbe.inFlight, 0);
  assert.equal(outerProbe.inFlight, 0);

  // Recovery after raw operations settle
  hangRaw = false;
  assert.equal(await outerProbe.probe(), true);
  assert.equal(tracker.isMongoHealthy(), true);
  assert.equal(innerProbe.inFlight, 0);
  assert.equal(outerProbe.inFlight, 0);
});

test("reconnect backoff caps at 1000ms and stops on shutdown, worker producer disables offline queue, and connectWithRetry respects abort", async () => {
  let active = true;
  assert.equal(computeReconnectDelayMs(0, { canReconnect: () => active }), 100);
  assert.equal(computeReconnectDelayMs(1, { canReconnect: () => active }), 200);
  assert.equal(computeReconnectDelayMs(4, { canReconnect: () => active }), 500);
  assert.equal(computeReconnectDelayMs(9, { canReconnect: () => active }), 1000);
  assert.equal(computeReconnectDelayMs(50, { canReconnect: () => active }), 1000);
  active = false;
  assert.equal(computeReconnectDelayMs(0, { canReconnect: () => active }), false);

  // Verify createIngestionQueue defaults producer=true (disableOfflineQueue: true) so disconnected commands fail fast
  const producerQueue = createIngestionQueue("redis://127.0.0.1:6399", "a4-offline-queue-check");
  try {
    await assert.rejects(
      () => producerQueue.raw.ping(),
      /offline|closed|ClientOfflineError|ClientClosedError/i,
    );
  } finally {
    await producerQueue.close();
  }

  let attempts = 0;
  const failedAll = await connectWithRetry(
    "redis-test",
    async () => {
      attempts += 1;
      throw new Error("ECONNREFUSED");
    },
    3,
    10,
  );
  assert.equal(failedAll, false);
  assert.equal(attempts, 3);

  const controller = new AbortController();
  let abortedAttempts = 0;
  const abortedPromise = connectWithRetry(
    "mongo-test",
    async () => {
      abortedAttempts += 1;
      controller.abort();
      throw new Error("ECONNREFUSED");
    },
    5,
    500,
    controller.signal,
  );
  assert.equal(await abortedPromise, false);
  assert.equal(abortedAttempts, 1);
});

test("Mongo dependency error boundary fails closed with 503 not_ready and recovers via beforeMongoRoute", async () => {
  const tracker = createDependencyHealthTracker({ mongo: true, redis: true });
  assert.equal(isMongoDependencyError(Object.assign(new Error("Server selection timed out"), { name: "MongoServerSelectionError" })), true);
  assert.equal(isMongoDependencyError(Object.assign(new Error("E11000 duplicate key"), { name: "MongoServerError", code: 11000 })), false);

  let failNextQuery = true;
  let mongoPingUp = false;
  const authRouter = express.Router();
  authRouter.post("/login", async (_request, response) => {
    if (!tracker.isMongoHealthy()) {
      response.set("Cache-Control", "no-store");
      response.status(503).json({ error: "not_ready" });
      return;
    }
    if (failNextQuery) {
      throw Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:27017"), {
        name: "MongoNetworkError",
      });
    }
    response.set("Cache-Control", "no-store");
    response.status(200).json({ ok: true });
  });

  await withAppServer(
    {
      checks: {
        mongo: async () => {
          tracker.markMongo(mongoPingUp);
          return mongoPingUp;
        },
        redis: async () => true,
      },
      beforeMongoRoute: async () => {
        if (!tracker.isMongoHealthy()) {
          tracker.markMongo(mongoPingUp);
        }
      },
      onMongoDependencyError: () => {
        tracker.markMongo(false);
      },
      authRouter,
    },
    async (baseUrl) => {
      const first = await fetch(`${baseUrl}/api/auth/login`, { method: "POST" });
      assert.equal(first.status, 503);
      assert.equal(first.headers.get("cache-control"), "no-store");
      assert.deepEqual(await first.json(), { error: "not_ready" });
      assert.equal(tracker.isMongoHealthy(), false);

      const second = await fetch(`${baseUrl}/api/auth/login`, { method: "POST" });
      assert.equal(second.status, 503);

      failNextQuery = false;
      mongoPingUp = true;
      const recovered = await fetch(`${baseUrl}/api/auth/login`, { method: "POST" });
      assert.equal(recovered.status, 200);
      assert.deepEqual(await recovered.json(), { ok: true });
      assert.equal(tracker.isMongoHealthy(), true);
    },
  );
});

test("worker loopback health handler catches sync throws, rejections, timeouts, and shutdown state with sanitized 503", async () => {
  let mode: "ready" | "throw" | "reject" | "timeout" = "ready";
  let shuttingDown = false;
  const pendingResolvers: Array<() => void> = [];
  const server = createServer(
    createWorkerHealthHandler(
      () => {
        if (mode === "throw") throw new Error("sync worker probe failure");
        if (mode === "reject") return Promise.reject(new Error("async worker probe failure"));
        if (mode === "timeout") {
          return new Promise<boolean>((resolve) => {
            pendingResolvers.push(() => resolve(true));
          });
        }
        return Promise.resolve(true);
      },
      { timeoutMs: 35, maxInFlight: 2, isShuttingDown: () => shuttingDown },
    ),
  );
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address === "object");
  const url = `http://127.0.0.1:${address.port}/health/ready`;
  try {
    let res = await fetch(url);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.deepEqual(await res.json(), { status: "ready" });

    for (const nextMode of ["throw", "reject", "timeout"] as const) {
      mode = nextMode;
      res = await fetch(url);
      assert.equal(res.status, 503, `worker probe mode=${nextMode}`);
      assert.equal(res.headers.get("cache-control"), "no-store");
      assert.deepEqual(await res.json(), { status: "not_ready" });
    }

    // Release timed-out probe operation and verify recovery before shutdown
    while (pendingResolvers.length > 0) {
      pendingResolvers.pop()?.();
    }
    await pause(15);

    mode = "ready";
    res = await fetch(url);
    assert.equal(res.status, 200);

    shuttingDown = true;
    res = await fetch(url);
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { status: "not_ready" });

    let releaseExpectedTimeout: (() => void) | undefined;
    await assert.rejects(
      withinTimeout(
        () =>
          new Promise<void>((resolve) => {
            releaseExpectedTimeout = resolve;
          }),
        20,
        "expected_timeout",
      ),
      /expected_timeout/,
    );
    releaseExpectedTimeout?.();
  } finally {
    while (pendingResolvers.length > 0) {
      pendingResolvers.pop()?.();
    }
    server.close();
    await once(server, "close");
  }
});

test("reconciliation coordinator holds mutex across multiple timeout cycles until real settlement, ignores late resolve/reject, and drains on close", async () => {
  let clock = 10_000;
  let totalRuns = 0;
  let activeRuns = 0;
  let maxConcurrentRuns = 0;
  let errors = 0;
  let failMode: "none" | "throw" | "hang" = "none";
  const pendingReconciles: Array<{
    resolve: () => void;
    reject: (reason?: unknown) => void;
  }> = [];

  const coordinator = createReconciliationCoordinator({
    intervalMs: 100,
    timeoutMs: 35,
    now: () => clock,
    onError: () => {
      errors += 1;
    },
    runReconcile: async () => {
      totalRuns += 1;
      activeRuns += 1;
      maxConcurrentRuns = Math.max(maxConcurrentRuns, activeRuns);
      try {
        if (failMode === "throw") {
          throw new Error("reconcile_failed");
        }
        if (failMode === "hang") {
          await new Promise<void>((resolve, reject) => {
            pendingReconciles.push({ resolve, reject });
          });
        }
      } finally {
        activeRuns -= 1;
      }
    },
  });

  assert.equal(coordinator.isHealthy(), false, "uninitialized coordinator must not be healthy");
  assert.equal(coordinator.inFlight, false);

  // 1. Non-overlapping concurrent reconcile calls share a single underlying execution
  failMode = "hang";
  const first = coordinator.reconcile();
  const second = coordinator.reconcile();
  await pause(10);
  assert.equal(totalRuns, 1, "concurrent reconcile calls must not overlap");
  assert.equal(maxConcurrentRuns, 1);
  assert.equal(coordinator.inFlight, true);
  pendingReconciles.shift()!.resolve();
  await Promise.all([first, second]);
  assert.equal(coordinator.isHealthy(), true);
  assert.equal(coordinator.inFlight, false);

  // 2. Staleness beyond intervalMs * 3 lowers readiness, and healthy run restores it
  clock += 301;
  assert.equal(coordinator.isHealthy(), false, "stale reconciliation must lower readiness");
  failMode = "none";
  await coordinator.reconcile();
  assert.equal(coordinator.isHealthy(), true);
  assert.equal(totalRuns, 2);

  // 3. Reconcile synchronous/async throw immediately lowers readiness
  failMode = "throw";
  await coordinator.reconcile();
  assert.equal(coordinator.isHealthy(), false);
  assert.equal(coordinator.inFlight, false);
  assert.equal(errors, 1);
  assert.equal(totalRuns, 3);

  // 4. Multi-cycle timeout with late resolve: mutex stays held across cycles until underlying operation settles
  failMode = "hang";
  await coordinator.reconcile();
  assert.equal(coordinator.isHealthy(), false, "timeout must immediately lower readiness");
  assert.equal(coordinator.inFlight, true, "mutex must remain held after timeout while operation is pending");
  assert.equal(errors, 2);
  assert.equal(totalRuns, 4);
  assert.equal(activeRuns, 1);

  // Trigger 3 additional reconcile cycles while run #4 is still hung after timeout
  for (let cycle = 1; cycle <= 3; cycle += 1) {
    await coordinator.reconcile();
    assert.equal(
      totalRuns,
      4,
      `timeout cycle ${cycle} must NOT start an overlapping reconcile while previous run is unsettled`,
    );
    assert.equal(maxConcurrentRuns, 1);
    assert.equal(coordinator.isHealthy(), false);
    assert.equal(coordinator.inFlight, true);
    await pause(20);
  }

  // Late resolve of timed-out run #4 must NOT restore readiness, and must release the mutex
  pendingReconciles.shift()!.resolve();
  await pause(15);
  assert.equal(
    coordinator.isHealthy(),
    false,
    "late resolve of a timed-out reconcile must NOT mark coordinator healthy",
  );
  assert.equal(coordinator.inFlight, false);
  assert.equal(activeRuns, 0);

  // 5. Multi-cycle timeout with late reject: mutex stays held, late reject does not double-count error or throw
  await coordinator.reconcile();
  assert.equal(coordinator.isHealthy(), false);
  assert.equal(coordinator.inFlight, true);
  assert.equal(errors, 3);
  assert.equal(totalRuns, 5);
  await coordinator.reconcile();
  assert.equal(totalRuns, 5, "must not overlap during second hung run");
  pendingReconciles.shift()!.reject(new Error("late reconcile rejection after timeout"));
  await pause(15);
  assert.equal(coordinator.isHealthy(), false);
  assert.equal(coordinator.inFlight, false);
  assert.equal(errors, 3, "late rejection after timeout must not double-trigger onError");

  // 6. Recovery on next scheduled run after hung operation settled restores readiness
  failMode = "none";
  await coordinator.reconcile();
  assert.equal(coordinator.isHealthy(), true);
  assert.equal(coordinator.inFlight, false);
  assert.equal(totalRuns, 6);
  assert.equal(maxConcurrentRuns, 1);

  // 7. Shutdown (close) waits for an already timed-out but still unsettled operation to drain
  failMode = "hang";
  await coordinator.reconcile();
  assert.equal(coordinator.inFlight, true);
  let closeFinished = false;
  const closePromise = coordinator.close(300).then(() => {
    closeFinished = true;
  });
  await pause(20);
  assert.equal(closeFinished, false, "close() must wait for unsettled timed-out operation");
  pendingReconciles.shift()!.resolve();
  await closePromise;
  assert.equal(closeFinished, true);
  assert.equal(coordinator.isHealthy(), false);
  assert.equal(coordinator.inFlight, false);
});
