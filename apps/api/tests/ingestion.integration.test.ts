import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFile, fork, spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { delimiter, resolve } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { MongoClient } from "mongodb";
import { createIngestionApi } from "../src/ingestion-api.js";
import { digest, strictJson, validatePayload, type Json } from "../src/ingestion-contract.js";
import { createApp } from "../src/health.js";
import { createIngestionQueue, DeliveryQueue, jobId } from "../src/ingestion-queue.js";
import { IngestionStore } from "../src/ingestion-store.js";
import { startIngestionWorker } from "../src/ingestion-worker.js";

const execute = promisify(execFile);
const fixture = () => validatePayload(strictJson(readFileSync("fixtures/market/mp-02-synthetic.json", "utf8")));
const mongoUrl = process.env.MONGODB_URL ?? "mongodb://127.0.0.1:27017/marketpulse";
const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
const pause = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));
async function eventually(check: () => Promise<boolean>, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await check()) return; await pause(50); }
  assert.fail("Condition did not become true within timeout");
}
async function setup() {
  const unique = randomUUID().replaceAll("-", ""); const name = `ingestion-test-${unique}`;
  const client = new MongoClient(mongoUrl, { serverSelectionTimeoutMS: 1000, socketTimeoutMS: 2000 }); await client.connect();
  const store = new IngestionStore(client.db(`mp_ingestion_test_${unique}`)); await store.initialize();
  const producer = createIngestionQueue(redisUrl, name); await producer.queue.waitUntilReady();
  const deliveries = new DeliveryQueue(store, producer.queue);
  const accept = async (id: string, payload = fixture()) => store.accept(id, digest(payload as unknown as Json), payload);
  const terminal = (id: string, status = "success") => eventually(async () => (await store.deliveries.findOne({ _id: id }))?.status === status);
  const counts = async () => [await store.deliveries.countDocuments(), await store.assets.countDocuments(), await store.observations.countDocuments()];
  return { store, producer, deliveries, accept, terminal, counts, name, client, close: async () => { await producer.queue.obliterate({ force: true }); await producer.close(); await store.db.dropDatabase(); await client.close(); } };
}
test("collector HTTP submission, concurrent replay, digest golden and immutable canonical identity", async t => {
  const context = await setup(); t.after(context.close);
  const runtime = await startIngestionWorker(context.store, redisUrl, { name: context.name, reconcileMs: 250 }); t.after(() => runtime.close());
  const secret = "b".repeat(64);
  const server = createServer(createApp({ checks: { mongo: async () => true, redis: async () => true }, ingestionRouter: createIngestionApi({ store: context.store, secret, isReady: () => true, enqueue: (id, hash) => context.deliveries.enqueue(id, hash) }) }));
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve)); t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address(); assert(address && typeof address === "object"); const url = `http://127.0.0.1:${address.port}/internal/ingestion/deliveries`;
  const env = { ...process.env, PYTHONPATH: `${resolve("services/collector")}${delimiter}${process.cwd()}`, INGESTION_SECRET: secret, INGESTION_ENDPOINT: url };
  const runCollector = () => execute("python", ["-m", "collector.cli", "fixtures/market/mp-02-synthetic.json", "--submit", "--poll-seconds", "10"], { env });
  const result = await runCollector(); const report = JSON.parse(result.stdout) as { deliveryId: string; payloadDigest: string; status: string };
  const golden = '{"numbers":[1.0,-0.0,1e-7,1e-6,333333333.3333333,4.5,0.002],"keys":{"😀":1,"é":2,"a":3}}';
  const pythonGolden = await execute("python", ["-c", "import json,hashlib,rfc8785,sys; print(hashlib.sha256(rfc8785.dumps(json.loads(sys.argv[1]))).hexdigest())", golden]);
  assert.equal(pythonGolden.stdout.trim(), digest(strictJson(golden)));
  assert.equal(report.status, "success"); assert.equal(report.payloadDigest, digest(fixture() as unknown as Json)); assert.deepEqual(await context.counts(), [1, 11, 44]);
  await runCollector(); assert.deepEqual(await context.counts(), [1, 11, 44]);
  const payload = fixture(); const envelope = { deliveryId: "concurrent", payloadDigest: digest(payload as unknown as Json), payload };
  const send = (body: unknown) => fetch(url, { method: "POST", headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const responses = await Promise.all(Array.from({ length: 8 }, () => send(envelope))); assert(responses.every(response => response.status === 202)); await context.terminal("concurrent"); assert.deepEqual(await context.counts(), [2, 11, 44]);
  const modified = fixture(); modified.candles[0]!.source.recordId += "-revision";
  const revised = { deliveryId: "concurrent", payloadDigest: digest(modified as unknown as Json), payload: modified };
  assert.equal((await send(revised)).status, 409);
  const old = await context.store.observations.findOne({ kind: "candle", assetId: modified.candles[0]!.assetId, tradingDate: modified.candles[0]!.tradingDate });
  assert.equal((await send({ ...revised, deliveryId: "conflict" })).status, 202); await context.terminal("conflict", "failure");
  assert.equal((await context.store.deliveries.findOne({ _id: "conflict" }))?.errorCode, "canonical_identity_conflict");
  assert.deepEqual(await context.store.observations.findOne({ _id: old!._id }), old); assert.deepEqual(await context.counts(), [3, 11, 44]);
  const conflict = await context.store.deliveries.findOne({ _id: "conflict" }); assert.equal(conflict?.counts.assets, 11);
  await context.producer.queue.clean(0, 100, "completed"); await context.deliveries.enqueue(report.deliveryId, report.payloadDigest); await runCollector(); assert.deepEqual(await context.counts(), [3, 11, 44]);
  const receiptResponse = await fetch(`${url}/${report.deliveryId}`, { headers: { Authorization: `Bearer ${secret}` } }); const receipt = await receiptResponse.json() as Record<string, unknown>; assert.equal(receipt.status, "success"); assert(!("payload" in receipt)); assert(!("source" in receipt));
});
test("durable accepted receipt survives enqueue outage and worker startup reconciles it", async t => {
  const context = await setup(); t.after(context.close);
  const secret = "c".repeat(64);
  const server = createServer(createApp({ checks: { mongo: async () => true, redis: async () => true }, ingestionRouter: createIngestionApi({ store: context.store, secret, isReady: () => true, enqueue: async () => { throw new Error("test enqueue outage"); } }) }));
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve)); t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address(); assert(address && typeof address === "object");
  const payload = fixture(); const response = await fetch(`http://127.0.0.1:${address.port}/internal/ingestion/deliveries`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` }, body: JSON.stringify({ deliveryId: "outbox", payloadDigest: digest(payload as unknown as Json), payload }) });
  assert.equal(response.status, 202); assert.equal((await response.json() as { status: string }).status, "accepted"); assert.deepEqual(await context.counts(), [1, 0, 0]);
  const runtime = await startIngestionWorker(context.store, redisUrl, { name: context.name, reconcileMs: 100 }); t.after(() => runtime.close());
  await context.terminal("outbox"); assert.deepEqual(await context.counts(), [1, 11, 44]); assert.equal(await runtime.ready(), true);
  await runtime.close(); assert.equal(await runtime.ready(), false);
});
test("real BullMQ retry resumes partial canonical writes and exhaustion becomes terminal", async t => {
  const context = await setup(); t.after(context.close);
  await context.accept("retry"); await context.accept("exhausted");
  const runtime = await startIngestionWorker(context.store, redisUrl, { name: context.name, reconcileMs: 100, hooks: { afterWrite: async (count, id) => { const delivery = await context.store.deliveries.findOne({ _id: id }); if (count === 12 && (id === "exhausted" || delivery?.attempts === 1)) throw new Error("test fault"); } } }); t.after(() => runtime.close());
  await context.terminal("retry"); await context.terminal("exhausted", "failure");
  assert.equal((await context.store.deliveries.findOne({ _id: "retry" }))?.attempts, 2);
  assert.equal((await context.store.deliveries.findOne({ _id: "exhausted" }))?.attempts, 3);
  assert.equal((await context.store.deliveries.findOne({ _id: "exhausted" }))?.counts.observations, 1);
  await context.deliveries.reconcile(); await pause(500); assert.equal((await context.store.deliveries.findOne({ _id: "exhausted" }))?.attempts, 3); assert.deepEqual(await context.counts(), [2, 11, 44]);
});
for (const boundary of ["write", "success"] as const) test(`killed child worker recovers after ${boundary} boundary without duplicate canonical records`, async t => {
  const context = await setup(); t.after(context.close); await context.accept("crash");
  const child: ChildProcess = fork(resolve("apps/api/tests/ingestion-child.ts"), [mongoUrl, context.store.db.databaseName, redisUrl, context.name, boundary], { execArgv: ["--import", "tsx"], stdio: ["ignore", "ignore", "ignore", "ipc"] });
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); });
  await new Promise<void>((resolve, reject) => { const timer = setTimeout(() => reject(new Error("Child boundary timeout")), 15000); child.on("message", message => { if ((message as {stage?: string}).stage === boundary) { clearTimeout(timer); resolve(); } }); child.on("error", reject); child.on("exit", code => { if (code !== null) reject(new Error(`Child exited ${code}`)); }); });
  if (boundary === "write") assert.deepEqual(await context.counts(), [1, 11, 1]); else { await context.terminal("crash"); assert.equal(await (await context.producer.queue.getJob(jobId("crash")))?.getState(), "active"); }
  await new Promise<void>(resolve => { child.once("exit", () => resolve()); child.kill("SIGKILL"); });
  const runtime = await startIngestionWorker(context.store, redisUrl, { name: context.name, reconcileMs: 100, lockDuration: 1000, stalledInterval: 1000 }); t.after(() => runtime.close());
  await context.terminal("crash"); await eventually(async () => (await context.producer.queue.getJob(jobId("crash")))?.getState().then(state => state === "completed") ?? false);
  assert.deepEqual(await context.counts(), [1, 11, 44]); assert.equal((await context.store.deliveries.findOne({ _id: "crash" }))?.attempts, boundary === "write" ? 2 : 1);
});
test("reconciliation handles completed/failed/missing queue records and preserves terminal authority", async t => {
  const context = await setup(); t.after(context.close);
  await context.accept("missing"); await context.accept("completed"); await context.accept("failed");
  await context.store.deliveries.updateOne({ _id: "missing" }, { $set: { status: "running", attempts: 3 } });
  await context.deliveries.reconcile(); assert.equal((await context.store.deliveries.findOne({ _id: "missing" }))?.status, "failure");
  const completed = await context.producer.queue.getJob(jobId("completed")); const failed = await context.producer.queue.getJob(jobId("failed")); assert(completed && failed);
  await completed.remove(); await failed.remove();
  await context.deliveries.reconcile(); assert(await context.producer.queue.getJob(jobId("completed"))); assert(await context.producer.queue.getJob(jobId("failed")));
  const runtime = await startIngestionWorker(context.store, redisUrl, { name: context.name, reconcileMs: 100 }); t.after(() => runtime.close());
  await context.terminal("completed"); await context.terminal("failed");
  await context.store.deliveries.updateOne({ _id: "completed" }, { $set: { status: "running" } });
  await eventually(async () => (await context.producer.queue.getJob(jobId("completed")))?.getState().then(state => state === "completed") ?? false);
  await context.deliveries.reconcile(); await context.terminal("completed");
  await context.store.terminal("completed", "failure", { assets: 0, observations: 0 }, "late_failure", 1); assert.equal((await context.store.deliveries.findOne({ _id: "completed" }))?.status, "success");
  await context.client.close(); assert.equal(await runtime.ready(), false); await context.client.connect();
});
test("failed queue history becomes terminal and old attempts cannot change newer progress", async t => {
  const context = await setup(); t.after(context.close); await context.accept("failed-history");
  const runtime = await startIngestionWorker(context.store, redisUrl, { name: context.name, reconcileMs: 100, hooks: { afterWrite: async () => { throw new Error("test exhaustion"); } } }); t.after(() => runtime.close());
  await context.terminal("failed-history", "failure");
  await eventually(async () => (await context.producer.queue.getJob(jobId("failed-history")))?.getState().then(state => state === "failed") ?? false);
  await context.store.deliveries.updateOne({ _id: "failed-history" }, { $set: { status: "queued" } });
  await context.deliveries.reconcile(); await context.terminal("failed-history", "failure");
  assert.equal((await context.store.deliveries.findOne({ _id: "failed-history" }))?.errorCode, "queue_attempts_exhausted");
  await context.accept("fenced"); await context.store.deliveries.updateOne({ _id: "fenced" }, { $set: { status: "running", attempts: 2 } });
  await context.store.terminal("fenced", "failure", { assets: 0, observations: 0 }, "old_attempt", 1);
  assert.equal((await context.store.deliveries.findOne({ _id: "fenced" }))?.status, "running");
});

test("API ingestion initialization failure exits for restart; repaired and disabled ingestion become ready", { timeout: 30000 }, async t => {
  const name = `mp_startup_test_${randomUUID().replaceAll("-", "")}`;
  const client = new MongoClient(mongoUrl, { serverSelectionTimeoutMS: 1000, socketTimeoutMS: 2000 });
  await client.connect();
  const db = client.db(name);
  t.after(async () => { await db.dropDatabase(); await client.close(); });
  // A view rejects collection validation/index initialization without modifying shared data.
  await db.createCollection("ingestion_deliveries", { viewOn: "startup_source", pipeline: [] });
  const startupMongoUrl = new URL(mongoUrl);
  startupMongoUrl.pathname = `/${name}`;
  const secret = "d".repeat(64);
  async function start(ingestionSecret: string) {
    const reservation = createServer();
    await new Promise<void>(resolve => reservation.listen(0, "127.0.0.1", resolve));
    const address = reservation.address(); assert(address && typeof address === "object");
    await new Promise<void>(resolve => reservation.close(() => resolve()));
    const child = spawn(process.execPath, ["--import", "tsx", resolve("apps/api/src/server.ts")], {
      env: { ...process.env, HOST: "127.0.0.1", PORT: String(address.port), MONGODB_URL: startupMongoUrl.href, REDIS_URL: redisUrl, CONNECT_ATTEMPTS: "1", INGESTION_SECRET: ingestionSecret },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", chunk => { output += String(chunk); });
    child.stderr.on("data", chunk => { output += String(chunk); });
    const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code, signal) => resolve({ code, signal }));
    });
    t.after(async () => {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      await exited;
    });
    return { child, exited, output: () => output, url: `http://127.0.0.1:${address.port}` };
  }
  const failed = await start(secret);
  const deadline = setTimeout(() => failed.child.kill("SIGKILL"), 8000);
  let result;
  try { result = await failed.exited; } finally { clearTimeout(deadline); }
  assert.deepEqual(result, { code: 1, signal: null });
  assert(failed.output().includes('"event":"ingestion_initialization_failed"'));
  assert(failed.output().includes('"event":"api_shutdown","signal":"dependency_unavailable"'));

  await db.collection("ingestion_deliveries").drop();
  const repaired = await start(secret);
  await eventually(async () => {
    assert.equal(repaired.child.exitCode, null);
    return fetch(`${repaired.url}/health/ready`).then(response => response.status === 200).catch(() => false);
  }, 8000);
  const receipt = await fetch(`${repaired.url}/internal/ingestion/deliveries/missing`, { headers: { Authorization: `Bearer ${secret}` } });
  assert.equal(receipt.status, 404);
  repaired.child.kill("SIGKILL"); await repaired.exited;

  await db.collection("ingestion_deliveries").drop();
  await db.createCollection("ingestion_deliveries", { viewOn: "startup_source", pipeline: [] });
  const disabled = await start("");
  await eventually(async () => {
    assert.equal(disabled.child.exitCode, null);
    return fetch(`${disabled.url}/health/ready`).then(response => response.status === 200).catch(() => false);
  }, 8000);
  assert.equal((await fetch(`${disabled.url}/api/assets/FPT/history`)).status, 200);
  assert.equal((await fetch(`${disabled.url}/internal/ingestion/deliveries/missing`)).status, 503);
  assert(disabled.output().includes('"event":"ingestion_disabled"'));
  disabled.child.kill("SIGKILL"); await disabled.exited;
});
