import type { ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { MongoClient } from "mongodb";
import { spawnOwnedNode, stopOwnedNode } from "./owned-process.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const identity = randomUUID().replaceAll("-", "");
const database = `marketpulse_e2e_${identity}`;
const children: ChildProcess[] = [];
const listening = new Set<ChildProcess>();
let mongo: MongoClient | undefined;
let stopping = false;
let ownedDatabase = false;
let interrupted = false;
let testChild: ChildProcess | undefined;

function localUrl(value: string, protocols: string[]): URL {
  const url = new URL(value);
  if (!protocols.includes(url.protocol) || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
    throw new Error("E2E dependencies must use a single loopback MongoDB or Redis endpoint.");
  }
  return url;
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Cannot allocate an E2E loopback port.");
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

function start(args: string[], env: NodeJS.ProcessEnv, output = false, marker?: string): ChildProcess {
  if (interrupted) throw new Error("E2E interrupted.");
  const child = spawnOwnedNode(args, { cwd: root, env, stdio: output ? "inherit" : ["ignore", "pipe", "ignore"] });
  children.push(child);
  let tail = "";
  child.stdout?.on("data", (chunk: Buffer) => {
    tail = (tail + chunk.toString()).slice(-8192);
    if (marker && tail.includes(marker)) listening.add(child);
  });
  child.on("error", () => { /* Readiness/exit checks report a sanitized failure. */ });
  return child;
}

function exited(child: ChildProcess): boolean { return child.exitCode !== null || child.signalCode !== null; }

async function ready(url: string, child: ChildProcess): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline && !interrupted && !exited(child)) {
    if (!listening.has(child)) { await delay(100); continue; }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (response.ok && !exited(child)) return;
    } catch { /* Dependency startup is bounded below. */ }
    await delay(200);
  }
  throw new Error("E2E stack did not become ready; check loopback MongoDB/Redis and available ports. App output is withheld to protect credentials.");
}

async function cleanup(): Promise<void> {
  if (stopping) return;
  stopping = true;
  let failed = false;
  for (const child of [...children].reverse()) {
    try { await stopOwnedNode(child); } catch { failed = true; }
  }
  try {
    if (ownedDatabase && mongo && !failed) {
      const db = mongo.db(database);
      const marker = await db.collection("e2e_ownership").findOne({ identity });
      if (database !== `marketpulse_e2e_${identity}` || !/^marketpulse_e2e_[a-f0-9]{32}$/.test(database) || marker?.identity !== identity) {
        throw new Error("E2E database identity verification failed; refusing cleanup.");
      }
      await db.dropDatabase();
      console.info("E2E owned database removed; owned application processes stopped.");
    }
  } catch { failed = true; }
  finally { await mongo?.close(); }
  if (failed) throw new Error("E2E cleanup failed; inspect only this run's generated database and child processes.");
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    interrupted = true;
    // Keep application parents alive until their complete trees can be stopped.
    if (testChild) void stopOwnedNode(testChild).catch(() => { process.exitCode = 1; });
  });
}

try {
  let mongoUrl: URL;
  let redisUrl: URL;
  try {
    mongoUrl = localUrl(process.env.E2E_MONGODB_URL ?? "mongodb://127.0.0.1:27017", ["mongodb:"]);
    mongoUrl.pathname = `/${database}`;
    redisUrl = localUrl(process.env.E2E_REDIS_URL ?? "redis://127.0.0.1:6379", ["redis:"]);
    mongo = new MongoClient(mongoUrl.toString(), { serverSelectionTimeoutMS: 2000, connectTimeoutMS: 2000, socketTimeoutMS: 3000 });
  } catch { throw new Error("E2E dependency configuration is invalid; use single loopback MongoDB/Redis URLs."); }
  try { await mongo.connect(); }
  catch { throw new Error("E2E requires reachable loopback MongoDB (E2E_MONGODB_URL); no tests were skipped."); }
  const db = mongo.db(database);
  if ((await db.listCollections({}, { nameOnly: true }).toArray()).length) throw new Error("E2E generated database already exists; refusing reuse.");
  await db.collection("e2e_ownership").insertOne({ identity });
  ownedDatabase = true;
  const apiPort = await freePort();
  let webPort = await freePort();
  while (webPort === apiPort) webPort = await freePort();
  const apiURL = `http://127.0.0.1:${apiPort}`;
  const webURL = `http://127.0.0.1:${webPort}`;
  const env: NodeJS.ProcessEnv = {};
  for (const key of ["PATH", "Path", "SystemRoot", "WINDIR", "ComSpec", "PATHEXT", "TEMP", "TMP", "USERPROFILE", "HOME", "LOCALAPPDATA", "APPDATA", "CI", "PLAYWRIGHT_BROWSERS_PATH"]) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  Object.assign(env, { HOST: "127.0.0.1", PORT: String(apiPort), MONGODB_URL: mongoUrl.toString(), REDIS_URL: redisUrl.toString(), INGESTION_SECRET: "", OBSERVED_READS_ENABLED: "false", CONNECT_ATTEMPTS: "2", CONNECT_DELAY_MS: "100", API_PROXY_TARGET: apiURL, MP_E2E_BASE_URL: webURL, NO_COLOR: "1", PLAYWRIGHT_NO_COPY_PROMPT: "1" });
  const api = start(["--import", "tsx", "apps/api/src/server.ts"], env, false, JSON.stringify({ event: "api_listening", port: apiPort }));
  await ready(`${apiURL}/health/ready`, api);
  const web = start(["node_modules/vite/bin/vite.js", "apps/web", "--config", "apps/web/vite.config.ts", "--host", "127.0.0.1", "--port", String(webPort), "--strictPort"], env, false, `${webURL}/`);
  await ready(webURL, web);
  // Confirm that the test web server reaches this run's API, before opening a browser.
  const proxy = await fetch(`${webURL}/api/assets/FPT/history`, { signal: AbortSignal.timeout(3000) });
  if (!proxy.ok) throw new Error("E2E same-origin API proxy is unavailable.");
  if (exited(api) || exited(web)) throw new Error("E2E owned application process exited during startup.");
  const test = start(["node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(2)], env, true);
  testChild = test;
  const code = await new Promise<number>((resolve) => {
    test.once("exit", (value) => resolve(value ?? 1));
    test.once("error", () => resolve(1));
  });
  process.exitCode = interrupted ? 1 : code;
} catch (error) {
  console.error(error instanceof Error && error.message.startsWith("E2E") ? error.message : "E2E setup failed; check local dependencies. No tests were skipped.");
  process.exitCode = 1;
} finally {
  try { await cleanup(); }
  catch { console.error("E2E cleanup failed; inspect only this run's generated database and child processes."); process.exitCode = 1; }
}
