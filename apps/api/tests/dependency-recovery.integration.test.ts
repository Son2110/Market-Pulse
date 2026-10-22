import assert from "node:assert/strict";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { MongoClient } from "mongodb";
import { digest, type Json } from "../src/platform/contracts/json.js";
import { IngestionStore, type Delivery } from "../src/ingestion-store.js";
import { startIngestionWorker } from "../src/ingestion-worker.js";
import { goldOne, sealGold } from "./gold-test-data.js";
import { observed, rehash } from "./observed-test-data.js";

const execFileAsync = promisify(execFile);
const docker = process.env.DOCKER_PATH ?? "docker";
const composeFile = resolve("compose.a4-test.yaml");
const pause = (ms: number) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

async function reserveLoopbackPort(): Promise<number> {
  const srv = createServer();
  await new Promise<void>((resolvePromise) => srv.listen(0, "127.0.0.1", resolvePromise));
  const address = srv.address();
  assert(address && typeof address === "object");
  const port = address.port;
  await new Promise<void>((resolvePromise) => srv.close(() => resolvePromise()));
  return port;
}

async function eventually(
  check: () => Promise<boolean>,
  timeoutMs = 20_000,
  stepMs = 100,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      if (await check()) return;
    } catch (error) {
      lastError = error;
    }
    await pause(stepMs);
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`Condition not met within ${timeoutMs}ms`);
}

async function runCompose(
  projectName: string,
  env: Record<string, string>,
  args: string[],
): Promise<string> {
  assert(
    projectName.startsWith("mp-a4-test-"),
    `Refusing to run compose on non-isolated project: ${projectName}`,
  );
  assert(
    !args.includes("-v") && !args.includes("--volumes"),
    "Refusing to run compose with -v / --volumes; remove only verified task-owned volumes.",
  );
  const { stdout } = await execFileAsync(
    docker,
    ["compose", "-p", projectName, "-f", composeFile, ...args],
    {
      env: { ...process.env, ...env },
      timeout: 180_000,
    },
  );
  return stdout.trim();
}

async function verifyIsolatedService(
  projectName: string,
  env: Record<string, string>,
  service: "mongodb" | "redis",
  expectedHostPort: number,
): Promise<{ containerId: string; volumeName: string }> {
  const containerId = await runCompose(projectName, env, ["ps", "-q", service]);
  assert(containerId, `Expected container ID for isolated service ${service}`);
  const { stdout } = await execFileAsync(docker, ["inspect", containerId], { timeout: 15_000 });
  const info = JSON.parse(stdout) as Array<{
    Config?: { Labels?: Record<string, string> };
    HostConfig?: { PortBindings?: Record<string, Array<{ HostIp?: string; HostPort?: string }>> };
    Mounts?: Array<{ Type?: string; Name?: string }>;
  }>;
  const labels = info[0]?.Config?.Labels ?? {};
  assert.equal(labels["com.docker.compose.project"], projectName);
  assert.equal(labels["com.marketpulse.suite"], "a4-recovery-test");
  const portKey = service === "mongodb" ? "27017/tcp" : "6379/tcp";
  const binding = info[0]?.HostConfig?.PortBindings?.[portKey]?.[0];
  assert.equal(binding?.HostIp, "127.0.0.1");
  assert.equal(Number(binding?.HostPort), expectedHostPort);
  assert.notEqual(expectedHostPort, 27017);
  assert.notEqual(expectedHostPort, 6379);

  const expectedVolume = `${projectName}_${service === "mongodb" ? "a4-mongo-data" : "a4-redis-data"}`;
  const mount = info[0]?.Mounts?.find((m) => m.Type === "volume" && m.Name === expectedVolume);
  assert(mount?.Name, `Expected isolated volume ${expectedVolume} on ${service}`);
  const { stdout: volStdout } = await execFileAsync(docker, ["volume", "inspect", expectedVolume], {
    timeout: 15_000,
  });
  const volInfo = JSON.parse(volStdout) as Array<{ Labels?: Record<string, string> }>;
  const volLabels = volInfo[0]?.Labels ?? {};
  assert.equal(volLabels["com.docker.compose.project"], projectName);
  assert.equal(volLabels["com.marketpulse.suite"], "a4-recovery-test");
  return { containerId, volumeName: expectedVolume };
}

async function cleanupTaskOwnedVolumes(projectName: string, volumeNames: string[]): Promise<void> {
  assert(projectName.startsWith("mp-a4-test-"));
  for (const volumeName of volumeNames) {
    assert(volumeName.startsWith(`${projectName}_a4-`));
    try {
      const { stdout } = await execFileAsync(docker, ["volume", "inspect", volumeName], {
        timeout: 10_000,
      });
      const info = JSON.parse(stdout) as Array<{ Labels?: Record<string, string> }>;
      const labels = info[0]?.Labels ?? {};
      if (
        labels["com.docker.compose.project"] === projectName
        && labels["com.marketpulse.suite"] === "a4-recovery-test"
      ) {
        await execFileAsync(docker, ["volume", "rm", volumeName], { timeout: 10_000 });
      }
    } catch {
      // volume already absent
    }
  }
}

interface SpawnedProcess {
  child: ChildProcess;
  url: string;
  output: () => string;
  exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
  gracefulStop: (signal: "SIGTERM" | "SIGINT") => Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
  kill: () => Promise<void>;
}

function spawnNodeArgs(
  args: string[],
  env: Record<string, string | undefined>,
  url: string,
  useIpc = true,
): SpawnedProcess {
  const mergedEnv: NodeJS.ProcessEnv = { ...process.env };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete mergedEnv[key];
    else mergedEnv[key] = value;
  }
  const child = spawn(process.execPath, args, {
    cwd: resolve("."),
    env: mergedEnv,
    windowsHide: true,
    stdio: useIpc ? ["ignore", "pipe", "pipe", "ipc"] : ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  child.stdout?.on("data", (chunk) => {
    logs += String(chunk);
  });
  child.stderr?.on("data", (chunk) => {
    logs += String(chunk);
  });
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolvePromise, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolvePromise({ code, signal }));
  });
  const gracefulStop = async (signal: "SIGTERM" | "SIGINT") => {
    if (child.exitCode === null && child.signalCode === null) {
      if (process.platform === "win32" && child.connected) {
        child.send(signal);
      } else {
        child.kill(signal);
      }
    }
    const timer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
      }
    }, 8000);
    try {
      return await exited;
    } finally {
      clearTimeout(timer);
    }
  };
  const kill = async () => {
    if (child.exitCode === null && child.signalCode === null) {
      if (process.platform === "win32" && child.pid) {
        await execFileAsync(
          `${process.env.SystemRoot ?? "C:/Windows"}/System32/taskkill.exe`,
          ["/PID", String(child.pid), "/T", "/F"],
          { windowsHide: true, timeout: 5000 },
        ).catch(() => {
          child.kill("SIGKILL");
        });
      } else {
        child.kill("SIGKILL");
      }
    }
    await exited.catch(() => undefined);
  };
  return { child, url, output: () => logs, exited, gracefulStop, kill };
}

function spawnNodeService(
  entryPath: string,
  env: Record<string, string | undefined>,
  url: string,
): SpawnedProcess {
  return spawnNodeArgs(["--import", "tsx", resolve(entryPath)], env, url, true);
}

async function startViteServer(targetBaseUrl: string): Promise<SpawnedProcess> {
  const webPort = await reserveLoopbackPort();
  const webUrl = `http://127.0.0.1:${webPort}`;
  const viteProc = spawnNodeArgs(
    [
      resolve("node_modules/vite/bin/vite.js"),
      "apps/web",
      "--config",
      "apps/web/vite.config.ts",
      "--host",
      "127.0.0.1",
      "--port",
      String(webPort),
      "--strictPort",
    ],
    {
      API_PROXY_TARGET: targetBaseUrl,
      NO_COLOR: "1",
    },
    webUrl,
    false,
  );
  await eventually(async () => {
    assert.equal(viteProc.child.exitCode, null, `Vite exited early: ${viteProc.output()}`);
    if (!viteProc.output().includes(`${webUrl}/`)) return false;
    const res = await fetch(`${webUrl}/`, { signal: AbortSignal.timeout(1000) }).catch(() => null);
    if (!res?.ok) return false;
    const html = await res.text();
    return html.includes('<div id="root"></div>');
  }, 25_000);
  return viteProc;
}

test(
  "A4 real process and isolated container recovery across Redis outage, Mongo outage, outbox reconciliation, and graceful signals",
  { timeout: 300_000 },
  async (t) => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
    const projectName = `mp-a4-test-${suffix}`;
    const mongoPort = await reserveLoopbackPort();
    const redisPort = await reserveLoopbackPort();
    const composeEnv = {
      A4_MONGO_PORT: String(mongoPort),
      A4_REDIS_PORT: String(redisPort),
    };
    const dbName = `mp_a4_${suffix}`;
    const mongoUrl = `mongodb://127.0.0.1:${mongoPort}/${dbName}`;
    const redisUrl = `redis://127.0.0.1:${redisPort}`;
    const queueName = `marketpulse-ingestion-a4-${suffix}`;
    const secret = "a".repeat(64);
    const ownedVolumes: string[] = [];

    await runCompose(projectName, composeEnv, ["up", "-d"]);
    t.after(async () => {
      await runCompose(projectName, composeEnv, ["down", "--remove-orphans"]).catch(
        () => undefined,
      );
      await cleanupTaskOwnedVolumes(projectName, ownedVolumes);
    });

    const mongoMeta = await verifyIsolatedService(projectName, composeEnv, "mongodb", mongoPort);
    const redisMeta = await verifyIsolatedService(projectName, composeEnv, "redis", redisPort);
    ownedVolumes.push(mongoMeta.volumeName, redisMeta.volumeName);

    // Wait for MongoDB and Redis in isolated stack to be reachable
    await eventually(async () => {
      const client = new MongoClient(mongoUrl, { serverSelectionTimeoutMS: 500 });
      try {
        await client.connect();
        await client.db().command({ ping: 1 });
        return true;
      } catch {
        return false;
      } finally {
        await client.close().catch(() => undefined);
      }
    }, 30_000);

    await t.test("cold-start fails closed on unreachable dependency or init failure and enforces flag/secret capability matrix", async () => {
      const deadPort = await reserveLoopbackPort();
      const apiFailPort = await reserveLoopbackPort();
      const failedApi = spawnNodeService(
        "apps/api/src/server.ts",
        {
          HOST: "127.0.0.1",
          PORT: String(apiFailPort),
          MONGODB_URL: `mongodb://127.0.0.1:${deadPort}/${dbName}`,
          REDIS_URL: redisUrl,
          CONNECT_ATTEMPTS: "2",
          CONNECT_DELAY_MS: "50",
          INGESTION_SECRET: "",
        },
        `http://127.0.0.1:${apiFailPort}`,
      );
      const failedApiExit = await failedApi.exited;
      assert.equal(failedApiExit.code, 1, "API must exit non-zero when cold-start Mongo fails");

      const workerFailPort = await reserveLoopbackPort();
      const failedWorker = spawnNodeService(
        "apps/api/src/worker.ts",
        {
          MONGODB_URL: mongoUrl,
          REDIS_URL: `redis://127.0.0.1:${deadPort}`,
          CONNECT_ATTEMPTS: "2",
          CONNECT_DELAY_MS: "50",
          WORKER_HEALTH_PORT: String(workerFailPort),
        },
        `http://127.0.0.1:${workerFailPort}`,
      );
      const failedWorkerExit = await failedWorker.exited;
      assert.equal(failedWorkerExit.code, 1, "Worker must exit non-zero when cold-start Redis fails");

      // Cold-start initialization failure when ingestion collection is blocked by a conflicting view
      const brokenDbName = `${dbName}_broken_init`;
      const initClient = new MongoClient(mongoUrl, { serverSelectionTimeoutMS: 1000 });
      await initClient.connect();
      try {
        await initClient.db(brokenDbName).createCollection("ingestion_deliveries", {
          viewOn: "nonexistent_source",
          pipeline: [],
        });
        const initFailPort = await reserveLoopbackPort();
        const initFailApi = spawnNodeService(
          "apps/api/src/server.ts",
          {
            HOST: "127.0.0.1",
            PORT: String(initFailPort),
            MONGODB_URL: `mongodb://127.0.0.1:${mongoPort}/${brokenDbName}`,
            REDIS_URL: redisUrl,
            CONNECT_ATTEMPTS: "2",
            CONNECT_DELAY_MS: "50",
            INGESTION_SECRET: secret,
            WORKER_QUEUE_NAME: `${queueName}-broken-init`,
          },
          `http://127.0.0.1:${initFailPort}`,
        );
        const initFailExit = await initFailApi.exited;
        assert.equal(initFailExit.code, 1, "API must exit non-zero when ingestion initialization fails");
      } finally {
        await initClient.db(brokenDbName).dropDatabase().catch(() => undefined);
        await initClient.close();
      }

      // Flag matrix with INGESTION_SECRET unset and observed/gold reads disabled
      const flagsPort = await reserveLoopbackPort();
      const flagsApi = spawnNodeService(
        "apps/api/src/server.ts",
        {
          HOST: "127.0.0.1",
          PORT: String(flagsPort),
          MONGODB_URL: mongoUrl,
          REDIS_URL: redisUrl,
          CONNECT_ATTEMPTS: "3",
          CONNECT_DELAY_MS: "100",
          INGESTION_SECRET: "",
          OBSERVED_READS_ENABLED: "false",
          GOLD_READS_ENABLED: "false",
        },
        `http://127.0.0.1:${flagsPort}`,
      );
      try {
        await eventually(async () => {
          const res = await fetch(`${flagsApi.url}/health/ready`).catch(() => null);
          return res?.status === 200;
        }, 15_000);
        assert.equal((await fetch(`${flagsApi.url}/health/ready/fixture`)).status, 200);
        assert.equal((await fetch(`${flagsApi.url}/health/ready/mongo`)).status, 200);
        const ingProbe = await fetch(`${flagsApi.url}/health/ready/ingestion`);
        assert.equal(ingProbe.status, 503);
        assert.deepEqual(await ingProbe.json(), { status: "not_ready" });
        assert.equal((await fetch(`${flagsApi.url}/internal/ingestion/deliveries/test`)).status, 503);
        assert.equal((await fetch(`${flagsApi.url}/api/observed/assets/FPT/history`)).status, 404);
        assert.equal((await fetch(`${flagsApi.url}/api/gold/quotes/latest`)).status, 404);
        await verifyIsolatedService(projectName, composeEnv, "redis", redisPort);
        await runCompose(projectName, composeEnv, ["stop", "redis"]);
        await eventually(async () => (await fetch(`${flagsApi.url}/health/ready`)).status === 503);
        let snapshot = await (await fetch(`${flagsApi.url}/health/capabilities`)).json();
        assert.equal(snapshot.capabilities.ingestionAcceptance, "disabled");
        await runCompose(projectName, composeEnv, ["start", "redis"]);
        await eventually(async () => (await fetch(`${flagsApi.url}/health/ready`)).status === 200);
        snapshot = await (await fetch(`${flagsApi.url}/health/capabilities`)).json();
        for (const key of ["ingestionAcceptance", "queueDispatch", "observedRead", "goldRead"]) assert.equal(snapshot.capabilities[key], "disabled");
        assert.equal((await fetch(`${flagsApi.url}/api/gold/quotes/latest`)).status, 404);
        assert.equal((await fetch(`${flagsApi.url}/api/observed/assets/FPT/history`)).status, 404);
      } finally {
        await flagsApi.kill();
      }
    });

    // Main API + Worker + real Vite dev server used across Redis and Mongo outage/recovery scenarios
    const apiPort = await reserveLoopbackPort();
    const workerHealthPort = await reserveLoopbackPort();
    const api = spawnNodeService(
      "apps/api/src/server.ts",
      {
        HOST: "127.0.0.1",
        PORT: String(apiPort),
        MONGODB_URL: mongoUrl,
        REDIS_URL: redisUrl,
        CONNECT_ATTEMPTS: "5",
        CONNECT_DELAY_MS: "200",
        DEPENDENCY_TIMEOUT_MS: "1000",
        INGESTION_SECRET: secret,
        OBSERVED_READS_ENABLED: "true",
        GOLD_READS_ENABLED: "true",
        WORKER_QUEUE_NAME: queueName,
      },
      `http://127.0.0.1:${apiPort}`,
    );
    t.after(() => api.kill());

    const worker = spawnNodeService(
      "apps/api/src/worker.ts",
      {
        MONGODB_URL: mongoUrl,
        REDIS_URL: redisUrl,
        CONNECT_ATTEMPTS: "5",
        CONNECT_DELAY_MS: "200",
        DEPENDENCY_TIMEOUT_MS: "1000",
        WORKER_HEALTH_PORT: String(workerHealthPort),
        WORKER_RECONCILE_MS: "400",
        WORKER_QUEUE_NAME: queueName,
      },
      `http://127.0.0.1:${workerHealthPort}`,
    );
    t.after(() => worker.kill());

    await eventually(async () => {
      assert.equal(api.child.exitCode, null, `API exited early: ${api.output()}`);
      const res = await fetch(`${api.url}/health/ready`).catch(() => null);
      return res?.status === 200;
    }, 20_000);

    await eventually(async () => {
      assert.equal(worker.child.exitCode, null, `Worker exited early: ${worker.output()}`);
      const res = await fetch(`${worker.url}/health/ready`).catch(() => null);
      return res?.status === 200;
    }, 20_000);

    const vite = await startViteServer(api.url);
    t.after(() => vite.kill());

    const apiPid = api.child.pid;
    const workerPid = worker.child.pid;
    const vitePid = vite.child.pid;
    assert(apiPid, "API PID must be defined");
    assert(workerPid, "Worker PID must be defined");
    assert(vitePid, "Vite PID must be defined");

    const postDelivery = async (id: string, payload: unknown, customDigest?: string) => {
      const payloadDigest = customDigest ?? digest(payload as Json);
      return fetch(`${api.url}/internal/ingestion/deliveries`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ deliveryId: id, payloadDigest, payload }),
      });
    };

    const getDeliveryStatus = async (id: string) => {
      const res = await fetch(`${api.url}/internal/ingestion/deliveries/${id}`, {
        headers: { Authorization: `Bearer ${secret}` },
      });
      if (res.status !== 200) return null;
      return (await res.json()) as { status: string; attempts: number; errorCode?: string };
    };

    const fixturePayload = JSON.parse(readFileSync("fixtures/market/mp-02-synthetic.json", "utf8")) as Record<string, unknown>;
    let authToken = "";
    let watchlistId = "";

    await t.test("healthy baseline serves probes directly, proxies /api through real Vite, and ingests initial data", async () => {
      for (const path of ["/health/live", "/health/ready", "/health/ready/fixture", "/health/ready/mongo", "/health/ready/ingestion"]) {
        const res = await fetch(`${api.url}${path}`);
        assert.equal(res.status, 200, `baseline ${path}`);
        assert.equal(res.headers.get("cache-control"), "no-store");
      }
      // Real Vite server only proxies /api; /health/ready on Vite serves SPA HTML shell, not API health JSON
      const viteHealthRes = await fetch(`${vite.url}/health/ready`);
      assert.match(viteHealthRes.headers.get("content-type") ?? "", /text\/html/i);
      assert.match(await viteHealthRes.text(), /<div id="root"><\/div>/);

      const regRes = await fetch(`${vite.url}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "a4-user@example.com", password: "correct horse battery staple" }),
      });
      assert.equal(regRes.status, 201);
      const regBody = (await regRes.json()) as { token: string };
      authToken = regBody.token;

      const wlRes = await fetch(`${vite.url}/api/watchlists`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ name: "A4 Watchlist" }),
      });
      assert.equal(wlRes.status, 201);
      watchlistId = ((await wlRes.json()) as { data: { id: string } }).data.id;

      const addSym = await fetch(`${vite.url}/api/watchlists/${watchlistId}/symbols/FPT`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${authToken}` },
      });
      assert.equal(addSym.status, 200);

      // Seed initial observed and gold deliveries
      assert.equal((await postDelivery("baseline-observed", observed())).status, 202);
      assert.equal((await postDelivery("baseline-gold", goldOne(0))).status, 202);
      await eventually(async () => {
        const obs = await getDeliveryStatus("baseline-observed");
        const gld = await getDeliveryStatus("baseline-gold");
        return obs?.status === "success" && gld?.status === "success";
      }, 15_000);
    });

    await t.test("Redis container stop and start: API stays alive on same PID, direct + real Vite /api reads and durable outbox work during outage, and reconcile recovers automatically", async () => {
      await verifyIsolatedService(projectName, composeEnv, "redis", redisPort);
      await runCompose(projectName, composeEnv, ["stop", "redis"]);

      // Wait for /health/ready and worker readiness to report 503 not_ready
      await eventually(async () => {
        const apiReady = await fetch(`${api.url}/health/ready`);
        const workerReady = await fetch(`${worker.url}/health/ready`);
        return apiReady.status === 503 && workerReady.status === 503;
      }, 10_000);

      // Process PIDs must be unchanged and running
      assert.equal(api.child.exitCode, null);
      assert.equal(api.child.pid, apiPid);
      assert.equal(worker.child.exitCode, null);
      assert.equal(worker.child.pid, workerPid);
      assert.equal(vite.child.exitCode, null);
      assert.equal(vite.child.pid, vitePid);

      // Liveness, fixture capability, Mongo capability, and ingestion capability remain 200
      assert.equal((await fetch(`${api.url}/health/live`)).status, 200);
      assert.equal((await fetch(`${api.url}/health/ready/fixture`)).status, 200);
      assert.equal((await fetch(`${api.url}/health/ready/mongo`)).status, 200);
      assert.equal((await fetch(`${api.url}/health/ready/ingestion`)).status, 200);

      // Direct HTTP and real Vite /api proxy reads + account/watchlist mutations continue working during Redis outage
      for (const base of [api.url, vite.url]) {
        const me = await fetch(`${base}/api/auth/me`, { headers: { Authorization: `Bearer ${authToken}` } });
        assert.equal(me.status, 200);
        assert.equal((await fetch(`${base}/api/assets/search?q=FPT`)).status, 200);
        assert.equal((await fetch(`${base}/api/assets/FPT/history`)).status, 200);
        assert.equal((await fetch(`${base}/api/observed/assets/FPT/history?from=2026-10-01&to=2026-10-06`)).status, 200);
        assert.equal((await fetch(`${base}/api/gold/quotes/latest`)).status, 200);
        const wlRead = await fetch(`${base}/api/watchlists`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        assert.equal(wlRead.status, 200);
      }
      const loginRes = await fetch(`${vite.url}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "a4-user@example.com", password: "correct horse battery staple" }),
      });
      assert.equal(loginRes.status, 200);
      const addVcb = await fetch(`${vite.url}/api/watchlists/${watchlistId}/symbols/VCB`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${authToken}` },
      });
      assert.equal(addVcb.status, 200);

      // Durable ingestion acceptance across all 3 families (including gold A -> B -> A) while Redis is stopped
      const updatedObserved = observed();
      updatedObserved.candles[0]!.close = "1420";
      updatedObserved.candles[0]!.collectedAt = "2026-10-06T10:00:00Z";
      rehash(updatedObserved);

      const goldA1 = goldOne(0);
      goldA1.observations[0]!.time.sourceAsOf = "2026-10-16T08:00:00.000000Z";
      goldA1.observations[0]!.time.referenceDate = "2026-10-16";
      goldA1.observations[0]!.quotes.buy = "89000000";
      goldA1.observations[0]!.quotes.sell = "91000000";
      goldA1.observations[0]!.quotes.spread = "2000000";
      goldA1.observations[0]!.provenance.originalBuy = "8900";
      goldA1.observations[0]!.provenance.originalSell = "9100";
      goldA1.observations[0]!.time.collectedAt = "2026-10-16T09:00:00.000000Z";
      sealGold(goldA1.observations[0]!);

      const goldB1 = goldOne(0);
      goldB1.observations[0]!.time.sourceAsOf = "2026-10-16T08:00:00.000000Z";
      goldB1.observations[0]!.time.referenceDate = "2026-10-16";
      goldB1.observations[0]!.quotes.buy = "89500000";
      goldB1.observations[0]!.quotes.sell = "91500000";
      goldB1.observations[0]!.quotes.spread = "2000000";
      goldB1.observations[0]!.provenance.originalBuy = "8950";
      goldB1.observations[0]!.provenance.originalSell = "9150";
      goldB1.observations[0]!.time.collectedAt = "2026-10-16T10:00:00.000000Z";
      sealGold(goldB1.observations[0]!);

      const goldA2 = goldOne(0);
      goldA2.observations[0]!.time.sourceAsOf = "2026-10-16T08:00:00.000000Z";
      goldA2.observations[0]!.time.referenceDate = "2026-10-16";
      goldA2.observations[0]!.quotes.buy = "89000000";
      goldA2.observations[0]!.quotes.sell = "91000000";
      goldA2.observations[0]!.quotes.spread = "2000000";
      goldA2.observations[0]!.provenance.originalBuy = "8900";
      goldA2.observations[0]!.provenance.originalSell = "9100";
      goldA2.observations[0]!.time.collectedAt = "2026-10-16T11:00:00.000000Z";
      sealGold(goldA2.observations[0]!);

      for (const [id, payload] of [
        ["redis-outage-fixture", fixturePayload],
        ["redis-outage-observed", updatedObserved],
        ["redis-outage-gold-a1", goldA1],
        ["redis-outage-gold-b1", goldB1],
        ["redis-outage-gold-a2", goldA2],
      ] as const) {
        const acceptRes = await postDelivery(id, payload);
        assert.equal(acceptRes.status, 202, `expected 202 for ${id}`);
        assert.equal(((await acceptRes.json()) as { status: string }).status, "accepted");
      }

      assert(
        api.output().includes('"event":"ingestion_enqueue_deferred"'),
        "API must log ingestion_enqueue_deferred when Redis is down",
      );

      // Idempotent replay, conflict, and invalid contract during Redis outage
      const replayRes = await postDelivery("redis-outage-observed", updatedObserved);
      assert.equal(replayRes.status, 202);

      const conflictPayload = structuredClone(updatedObserved);
      conflictPayload.candles[0]!.close = "1499";
      rehash(conflictPayload);
      const conflictRes = await postDelivery("redis-outage-observed", conflictPayload);
      assert.equal(conflictRes.status, 409);
      assert.deepEqual(await conflictRes.json(), { error: "delivery_identity_conflict" });

      const invalidRes = await postDelivery("redis-outage-invalid", { bad: true }, "0".repeat(64));
      assert.equal(invalidRes.status, 400);
      assert.deepEqual(await invalidRes.json(), { error: "invalid_contract" });

      // Start Redis container back up and verify automatic recovery on the SAME PIDs
      await runCompose(projectName, composeEnv, ["start", "redis"]);

      await eventually(async () => {
        const apiReady = await fetch(`${api.url}/health/ready`);
        const workerReady = await fetch(`${worker.url}/health/ready`);
        return apiReady.status === 200 && workerReady.status === 200;
      }, 20_000);

      assert.equal(api.child.pid, apiPid);
      assert.equal(worker.child.pid, workerPid);

      // All 5 deferred deliveries must reconcile and complete with status "success"
      await eventually(async () => {
        const statuses = await Promise.all([
          getDeliveryStatus("redis-outage-fixture"),
          getDeliveryStatus("redis-outage-observed"),
          getDeliveryStatus("redis-outage-gold-a1"),
          getDeliveryStatus("redis-outage-gold-b1"),
          getDeliveryStatus("redis-outage-gold-a2"),
        ]);
        return statuses.every((s) => s?.status === "success");
      }, 20_000);

      const obsAfter = await (
        await fetch(`${vite.url}/api/observed/assets/FPT/history?from=2026-10-01&to=2026-10-06`)
      ).json();
      assert.equal(obsAfter.data.candles[0].close, "1420");

      const goldAfter = await (await fetch(`${vite.url}/api/gold/quotes/latest`)).json();
      assert.equal(goldAfter.data[0].quotes.buy, "89000000");

      // Verify gold A -> B -> A retained 2 unique revisions for that snapshotId while projections converged to A
      const checkClient = new MongoClient(mongoUrl, { serverSelectionTimeoutMS: 1000 });
      await checkClient.connect();
      try {
        const snapId = goldA1.observations[0]!.snapshotId;
        const revCount = await checkClient
          .db(dbName)
          .collection("gold_quote_revisions")
          .countDocuments({ snapshotId: snapId });
        assert.equal(revCount, 2, "A -> B -> A must retain 2 distinct content revisions");
      } finally {
        await checkClient.close();
      }
    });

    await t.test("A4-T10 real Redis disconnect during an in-flight enqueue remains bounded and durable", async () => {
      await verifyIsolatedService(projectName, composeEnv, "redis", redisPort);
      await runCompose(projectName, composeEnv, ["exec", "-T", "redis", "redis-cli", "CLIENT", "PAUSE", "10000", "ALL"]);
      const started = Date.now();
      const responsePromise = postDelivery("mid-enqueue-disconnect", fixturePayload);
      const client = new MongoClient(mongoUrl, { serverSelectionTimeoutMS: 1000 });
      await client.connect();
      try {
        await eventually(async () => Boolean(await client.db().collection("ingestion_deliveries").findOne({ _id: "mid-enqueue-disconnect" as never })), 3000, 20);
        await runCompose(projectName, composeEnv, ["stop", "redis"]);
        const response = await responsePromise;
        assert.equal(response.status, 202);
        assert(Date.now() - started < 8000, "HTTP enqueue must not wait for the paused Redis command");
        assert.equal(api.child.exitCode, null);
      } finally { await client.close(); }
      await runCompose(projectName, composeEnv, ["start", "redis"]);
      await eventually(async () => (await getDeliveryStatus("mid-enqueue-disconnect"))?.status === "success");
    });

    await t.test("A4-NFR-04 third Redis cycle and prolonged outage preserve PID and recover automatically", async () => {
      for (let cycle = 2; cycle <= 3; cycle += 1) {
        await verifyIsolatedService(projectName, composeEnv, "redis", redisPort);
        await runCompose(projectName, composeEnv, ["stop", "redis"]);
        await eventually(async () => (await fetch(`${api.url}/health/ready`)).status === 503);
        // Longer than this process's configured startup retry window (5 * 1s + 4 * 200ms).
        if (cycle === 3) await pause(7000);
        assert.equal((await fetch(`${api.url}/health/read-ready`)).status, 200);
        assert.equal((await fetch(`${vite.url}/api/assets/search?q=FPT`)).status, 200);
        assert.equal(api.child.pid, apiPid);
        assert.equal(worker.child.pid, workerPid);
        await runCompose(projectName, composeEnv, ["start", "redis"]);
        await eventually(async () => (await fetch(`${api.url}/health/ready`)).status === 200 && (await fetch(worker.url)).status === 200);
      }
      for (const proc of [api, worker]) {
        assert(!proc.output().includes(secret), "Logs must not contain ingestion secret");
        assert(!proc.output().includes(mongoUrl), "Logs must not contain Mongo URL");
        assert(!proc.output().includes(redisUrl), "Logs must not contain Redis URL");
        for (const event of ["dependency_unavailable", "capability_restored"]) assert(proc.output().includes(event), event);
      }
      assert(worker.output().includes("outbox_reconciliation_succeeded"));
      assert(worker.output().includes("worker_unavailable"));
      assert(worker.output().includes("worker_restored"));
    });

    await t.test("Mongo container stop and start: fixture reads survive, Mongo routes fail closed with 503, and requests/probes recover on same PIDs", async () => {
      await verifyIsolatedService(projectName, composeEnv, "mongodb", mongoPort);
      await runCompose(projectName, composeEnv, ["stop", "mongodb"]);

      await eventually(async () => {
        const fullReady = await fetch(`${api.url}/health/ready`);
        const mongoReady = await fetch(`${api.url}/health/ready/mongo`);
        const ingReady = await fetch(`${api.url}/health/ready/ingestion`);
        const workerReady = await fetch(`${worker.url}/health/ready`);
        return (
          fullReady.status === 503
          && mongoReady.status === 503
          && ingReady.status === 503
          && workerReady.status === 503
        );
      }, 10_000);

      assert.equal(api.child.exitCode, null);
      assert.equal(api.child.pid, apiPid);
      assert.equal(worker.child.exitCode, null);
      assert.equal(worker.child.pid, workerPid);

      // Liveness and fixture capability stay 200, and fixture reads still work directly and via real Vite /api proxy
      assert.equal((await fetch(`${api.url}/health/live`)).status, 200);
      assert.equal((await fetch(`${api.url}/health/ready/fixture`)).status, 200);
      for (const base of [api.url, vite.url]) {
        assert.equal((await fetch(`${base}/api/assets/search?q=FPT`)).status, 200);
        assert.equal((await fetch(`${base}/api/assets/FPT/history`)).status, 200);
      }

      // Mongo-backed routes fail closed with 503 and Cache-Control: no-store both directly and via real Vite /api proxy
      for (const base of [api.url, vite.url]) {
        for (const password of ["wrong password value here", "correct horse battery staple"]) {
          const loginDuringOutage = await fetch(`${base}/api/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: "a4-user@example.com", password }),
          });
          assert.equal(loginDuringOutage.status, 503);
          assert.equal(loginDuringOutage.headers.get("cache-control"), "no-store");
          assert.deepEqual(await loginDuringOutage.json(), { error: "not_ready" });
        }

        const wlDuringOutage = await fetch(`${base}/api/watchlists`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        assert.equal(wlDuringOutage.status, 503);
        assert.deepEqual(await wlDuringOutage.json(), { error: "not_ready" });

        const obsDuringOutage = await fetch(
          `${base}/api/observed/assets/FPT/history?from=2026-10-01&to=2026-10-06`,
        );
        assert.equal(obsDuringOutage.status, 503);
        assert.deepEqual(await obsDuringOutage.json(), { error: "observed_history_unavailable" });

        const goldDuringOutage = await fetch(`${base}/api/gold/quotes/latest`);
        assert.equal(goldDuringOutage.status, 503);
        assert.deepEqual(await goldDuringOutage.json(), { error: "gold_latest_unavailable" });
      }

      const ingestDuringOutage = await postDelivery("mongo-outage-rejected", goldOne(2));
      assert.equal(ingestDuringOutage.status, 503);
      assert.deepEqual(await ingestDuringOutage.json(), { error: "ingestion_unavailable" });

      // Restart MongoDB container and verify real requests + probes recover on the SAME PIDs
      await runCompose(projectName, composeEnv, ["start", "mongodb"]);

      // Wait for MongoDB container to accept connections
      await eventually(async () => {
        const client = new MongoClient(mongoUrl, { serverSelectionTimeoutMS: 500 });
        try {
          await client.connect();
          await client.db().command({ ping: 1 });
          return true;
        } catch {
          return false;
        } finally {
          await client.close().catch(() => undefined);
        }
      }, 20_000);

      // First real request (/api/auth/login via real Vite proxy) recovers immediately via beforeMongoRoute
      const recoveredLogin = await fetch(`${vite.url}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "a4-user@example.com", password: "correct horse battery staple" }),
      });
      assert.equal(recoveredLogin.status, 200);

      await eventually(async () => {
        const fullReady = await fetch(`${api.url}/health/ready`);
        const mongoReady = await fetch(`${api.url}/health/ready/mongo`);
        const ingReady = await fetch(`${api.url}/health/ready/ingestion`);
        const workerReady = await fetch(`${worker.url}/health/ready`);
        return (
          fullReady.status === 200
          && mongoReady.status === 200
          && ingReady.status === 200
          && workerReady.status === 200
        );
      }, 20_000);

      assert.equal(api.child.pid, apiPid);
      assert.equal(worker.child.pid, workerPid);

      for (const base of [api.url, vite.url]) {
        assert.equal(
          (await fetch(`${base}/api/watchlists`, { headers: { Authorization: `Bearer ${authToken}` } })).status,
          200,
        );
        assert.equal(
          (await fetch(`${base}/api/observed/assets/FPT/history?from=2026-10-01&to=2026-10-06`)).status,
          200,
        );
        assert.equal((await fetch(`${base}/api/gold/quotes/latest`)).status, 200);
      }

      const postRecoveryGold = goldOne(2);
      const postRecRes = await postDelivery("mongo-outage-rejected", postRecoveryGold);
      assert.equal(postRecRes.status, 202);
      await eventually(async () => {
        const st = await getDeliveryStatus("mongo-outage-rejected");
        return st?.status === "success";
      }, 15_000);
    });

    await t.test("malformed legacy family isolation and 3-attempt retry exhaustion preserve terminal failure authority", async () => {
      const client = new MongoClient(mongoUrl, { serverSelectionTimeoutMS: 1000 });
      await client.connect();
      try {
        const db = client.db(dbName);
        const rawDeliveries = db.collection<Omit<Delivery, "family"> & { family: unknown }>(
          "ingestion_deliveries",
        );
        const now = new Date();
        await rawDeliveries.insertOne({
          _id: "malformed-legacy-family",
          payloadDigest: digest(fixturePayload as Json),
          family: "unknown",
          payload: fixturePayload as unknown as Delivery["payload"],
          provider: "marketpulse-fixture",
          schemaVersion: "1.0.0",
          dataset: fixturePayload.dataset as Delivery["dataset"],
          serverReceivedAt: now,
          updatedAt: now,
          status: "accepted",
          attempts: 0,
          counts: { assets: 0, observations: 0 },
        });

        await rawDeliveries.insertOne({
          _id: "pre-exhausted-attempts",
          payloadDigest: digest(fixturePayload as Json),
          family: "fixture-market",
          payload: fixturePayload as unknown as Delivery["payload"],
          provider: "marketpulse-fixture",
          schemaVersion: "1.0.0",
          dataset: fixturePayload.dataset as Delivery["dataset"],
          serverReceivedAt: now,
          updatedAt: now,
          status: "accepted",
          attempts: 3,
          counts: { assets: 0, observations: 0 },
        });

        const freshGold = goldOne(0);
        freshGold.observations[0]!.time.collectedAt = "2026-10-15T12:00:00.000000Z";
        sealGold(freshGold.observations[0]!);
        assert.equal((await postDelivery("healthy-after-legacy", freshGold)).status, 202);

        await eventually(async () => {
          const malformed = await getDeliveryStatus("malformed-legacy-family");
          const preExhausted = await getDeliveryStatus("pre-exhausted-attempts");
          const healthy = await getDeliveryStatus("healthy-after-legacy");
          return (
            malformed?.status === "failure"
            && malformed?.errorCode === "invalid_contract"
            && preExhausted?.status === "failure"
            && preExhausted?.errorCode === "attempts_exhausted"
            && healthy?.status === "success"
          );
        }, 15_000);

        // 3-attempt runtime exhaustion in isolated database & worker queue
        const exhaustDb = client.db(`${dbName}_exhaust`);
        const exhaustStore = new IngestionStore(exhaustDb);
        await exhaustStore.initialize();
        const exhaustQueueName = `${queueName}-exhaust`;
        const exhaustPayload = goldOne(1);
        const exhaustDigest = digest(exhaustPayload as unknown as Json);
        await exhaustStore.accept("exhaust-3-attempts", exhaustDigest, exhaustPayload);
        const exhaustWorker = await startIngestionWorker(exhaustStore, redisUrl, {
          name: exhaustQueueName,
          reconcileMs: 200,
          hooks: {
            afterWrite: async () => {
              throw new Error("simulated_transient_failure");
            },
          },
        });
        try {
          await eventually(async () => {
            const doc = await exhaustStore.deliveries.findOne({ _id: "exhaust-3-attempts" });
            return (
              doc?.status === "failure"
              && doc?.attempts === 3
              && doc?.errorCode === "persistence_unavailable"
            );
          }, 15_000);
        } finally {
          await exhaustWorker.close();
          await exhaustDb.dropDatabase().catch(() => undefined);
        }
      } finally {
        await client.close();
      }
    });

    await t.test("SIGTERM and SIGINT shut down API and Worker cleanly during active reconcile, startup retry, and dependency outage", async () => {
      // 1. Clean SIGINT / SIGTERM on the active API and Worker
      const workerExit = await worker.gracefulStop("SIGINT");
      assert.equal(workerExit.code, 0, "Worker must exit 0 on SIGINT");

      const apiExit = await api.gracefulStop("SIGTERM");
      assert.equal(apiExit.code, 0, "API must exit 0 on SIGTERM");

      // 2. Clean SIGTERM during cold-start retry
      const deadPort = await reserveLoopbackPort();
      const startupPort = await reserveLoopbackPort();
      const startingApi = spawnNodeService(
        "apps/api/src/server.ts",
        {
          HOST: "127.0.0.1",
          PORT: String(startupPort),
          MONGODB_URL: `mongodb://127.0.0.1:${deadPort}/${dbName}`,
          REDIS_URL: redisUrl,
          CONNECT_ATTEMPTS: "10",
          CONNECT_DELAY_MS: "1000",
          INGESTION_SECRET: "",
        },
        `http://127.0.0.1:${startupPort}`,
      );
      await eventually(async () => startingApi.output().includes("dependency_connect_failed"), 5000);
      const startupSigExit = await startingApi.gracefulStop("SIGTERM");
      assert.equal(startupSigExit.code, 0, "API must exit 0 when SIGTERM arrives during startup retry");

      // 3. Clean SIGTERM during an active Redis outage
      const outagePort = await reserveLoopbackPort();
      const outageWorkerPort = await reserveLoopbackPort();
      const outageApi = spawnNodeService(
        "apps/api/src/server.ts",
        {
          HOST: "127.0.0.1",
          PORT: String(outagePort),
          MONGODB_URL: mongoUrl,
          REDIS_URL: redisUrl,
          CONNECT_ATTEMPTS: "3",
          CONNECT_DELAY_MS: "100",
          INGESTION_SECRET: secret,
          WORKER_QUEUE_NAME: `${queueName}-outage`,
        },
        `http://127.0.0.1:${outagePort}`,
      );
      const outageWorker = spawnNodeService(
        "apps/api/src/worker.ts",
        {
          MONGODB_URL: mongoUrl,
          REDIS_URL: redisUrl,
          CONNECT_ATTEMPTS: "3",
          CONNECT_DELAY_MS: "100",
          WORKER_HEALTH_PORT: String(outageWorkerPort),
          WORKER_RECONCILE_MS: "300",
          WORKER_QUEUE_NAME: `${queueName}-outage`,
        },
        `http://127.0.0.1:${outageWorkerPort}`,
      );
      try {
        await eventually(async () => {
          const r1 = await fetch(`${outageApi.url}/health/ready`).catch(() => null);
          const r2 = await fetch(`${outageWorker.url}/health/ready`).catch(() => null);
          return r1?.status === 200 && r2?.status === 200;
        }, 15_000);

        await runCompose(projectName, composeEnv, ["stop", "redis"]);
        await eventually(async () => {
          const r1 = await fetch(`${outageApi.url}/health/ready`).catch(() => null);
          return r1?.status === 503;
        }, 10_000);

        const [outageApiExit, outageWorkerExit] = await Promise.all([
          outageApi.gracefulStop("SIGINT"),
          outageWorker.gracefulStop("SIGTERM"),
        ]);
        assert.equal(outageApiExit.code, 0, "API must exit 0 on SIGINT during Redis outage");
        assert.equal(outageWorkerExit.code, 0, "Worker must exit 0 on SIGTERM during Redis outage");
      } finally {
        await outageApi.kill();
        await outageWorker.kill();
      }
    });
  },
);


test("A4-T03/T04/T17 actual Compose cold Redis-down read routing and health survive loss, with durable recovery and CLI replay", { timeout: 600_000 }, async t => {
  const project = `mp-a4-test-compose-${randomUUID().slice(0, 8)}`;
  const apiPort = await reserveLoopbackPort();
  const webPort = await reserveLoopbackPort();
  const mongoPort = await reserveLoopbackPort();
  const redisPort = await reserveLoopbackPort();
  const env = {
    A4_API_PORT: String(apiPort), A4_WEB_PORT: String(webPort),
    A4_MONGO_PORT: String(mongoPort), A4_REDIS_PORT: String(redisPort),
    A4_INGESTION_SECRET: "b".repeat(64),
  };
  const volumes: string[] = [];
  const inspect = async (service: string) => {
    const id = await runCompose(project, env, ["ps", "-a", "-q", service]);
    assert(id);
    const { stdout } = await execFileAsync(docker, ["inspect", id]);
    const data = JSON.parse(stdout)[0];
    assert.equal(data.Config.Labels["com.docker.compose.project"], project);
    assert.equal(data.Config.Labels["com.marketpulse.suite"], "a4-recovery-test");
    if (service === "api" || service === "web") {
      const binding = data.HostConfig.PortBindings[service === "api" ? "3001/tcp" : "5173/tcp"][0];
      assert.equal(binding.HostIp, "127.0.0.1");
      assert.equal(Number(binding.HostPort), service === "api" ? apiPort : webPort);
    }
    return data;
  };
  t.after(async () => {
    // Verify every extant container belongs to this suite before stopping its project.
    for (const service of ["api", "web", "worker", "redis", "mongodb"]) {
      const id = await runCompose(project, env, ["ps", "-a", "-q", service]);
      if (id) {
        const data = await inspect(service);
        t.diagnostic(JSON.stringify({ project, service, id, state: data.State.Status, exitCode: data.State.ExitCode, health: data.State.Health?.Status }));
      }
    }
    const logs = await runCompose(project, env, ["logs", "--no-color", "--tail", "40", "api", "worker"]);
    t.diagnostic(logs.replaceAll(env.A4_INGESTION_SECRET, "[redacted]"));
    await runCompose(project, env, ["--profile", "routing", "down", "--remove-orphans"]);
    await cleanupTaskOwnedVolumes(project, volumes);
  });
  await runCompose(project, env, ["up", "-d", "--wait", "mongodb"]);
  const mongo = await verifyIsolatedService(project, env, "mongodb", mongoPort);
  volumes.push(mongo.volumeName);
  await runCompose(project, env, ["--profile", "routing", "up", "--build", "-d", "api", "web"]);
  const base = `http://127.0.0.1:${apiPort}`;
  const proxy = `http://127.0.0.1:${webPort}`;
  await eventually(async () => (await fetch(`${base}/health/read-ready`)).status === 200, 40_000);
  await eventually(async () => (await inspect("api")).State.Health.Status === "healthy", 40_000);
  const api = await inspect("api");
  const pid = api.State.Pid;
  assert(api.Config.Healthcheck.Test.join(" ").includes("/health/read-ready"));
  assert.equal((await fetch(`${base}/health/ready`)).status, 503);
  const snapshot = await (await fetch(`${base}/health/capabilities`)).json();
  assert.equal(snapshot.capabilities.fixtureRead, "ready");
  assert.equal(snapshot.capabilities.ingestionAcceptance, "ready");
  assert.equal(snapshot.capabilities.queueDispatch, "unavailable");
  assert.equal(snapshot.capabilities.worker, "unknown");
  assert.equal(await runCompose(project, env, ["ps", "-q", "redis"]), "", "Redis must not have started indirectly");
  // Beyond the configured five-attempt startup window; routing and health stay available.
  await pause(8000);
  await eventually(async () => (await fetch(`${proxy}/api/assets/search?q=FPT`)).status === 200);
  assert.equal((await fetch(`${proxy}/api/assets/FPT/history`)).status, 200);
  const payload = JSON.parse(readFileSync("fixtures/market/mp-02-synthetic.json", "utf8"));
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${env.A4_INGESTION_SECRET}` };
  const accepted = await fetch(`${base}/internal/ingestion/deliveries`, {
    method: "POST", headers, body: JSON.stringify({ deliveryId: "cold-compose", payloadDigest: digest(payload), payload }),
  });
  assert.equal(accepted.status, 202);
  assert.equal((await accepted.json()).status, "accepted");
  await runCompose(project, env, ["up", "-d", "--wait", "redis"]);
  const redis = await verifyIsolatedService(project, env, "redis", redisPort);
  volumes.push(redis.volumeName);
  await runCompose(project, env, ["--profile", "routing", "up", "--build", "-d", "worker"]);
  await eventually(async () => (await fetch(`${base}/health/ready`)).status === 200, 30_000);
  await eventually(async () => {
    const response = await fetch(`${base}/internal/ingestion/deliveries/cold-compose`, { headers });
    return (await response.json()).status === "success";
  }, 30_000);
  assert.equal((await inspect("api")).State.Pid, pid);
  // Verify runtime health/routing too, rather than only a host Vite proxy.
  await verifyIsolatedService(project, env, "redis", redisPort);
  await runCompose(project, env, ["stop", "redis"]);
  await eventually(async () => (await fetch(`${base}/health/ready`)).status === 503);
  assert.equal((await fetch(`${proxy}/api/assets/search?q=FPT`)).status, 200);
  assert.equal((await inspect("api")).State.Health.Status, "healthy");
  assert.equal((await inspect("api")).State.Pid, pid);
  await runCompose(project, env, ["start", "redis"]);
  await eventually(async () => (await fetch(`${base}/health/ready`)).status === 200);
  await runCompose(project, env, ["--profile", "routing", "build", "collector"]);
  await runCompose(project, env, ["--profile", "collector", "run", "--rm", "collector"]);
  for (let i = 0; i < 2; i += 1) await runCompose(project, env, ["--profile", "collector", "run", "--rm", "collector", "fixtures/market/mp-02-synthetic.json", "--submit", "--poll-seconds", "10"]);
  const client = new MongoClient(`mongodb://127.0.0.1:${mongoPort}/marketpulse`);
  await client.connect();
  try {
    assert.equal(await client.db().collection("canonical_assets").countDocuments(), 11);
    assert.equal(await client.db().collection("canonical_observations").countDocuments(), 44);
    assert.equal(await client.db().collection("ingestion_deliveries").countDocuments({ status: "success" }), 2);
  } finally { await client.close(); }
  const logs = await runCompose(project, env, ["logs", "--no-color", "api", "worker"]);
  assert(!logs.includes(env.A4_INGESTION_SECRET));
  t.diagnostic(JSON.stringify({ project, apiPid: pid, coldAndRuntimeHealth: "healthy", direct: base, proxy, canonicalAssets: 11, canonicalObservations: 44 }));
});
