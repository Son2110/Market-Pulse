import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import test from "node:test";
import { createApp, type HealthChecks } from "../src/health.js";

async function startServer(checks: HealthChecks): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer(createApp({ checks, timeoutMs: 50 }));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server did not bind a TCP port");
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function withServer(checks: HealthChecks, run: (baseUrl: string) => Promise<void>) {
  const { server, baseUrl } = await startServer(checks);
  try {
    await run(baseUrl);
  } finally {
    server.close();
    await once(server, "close");
  }
}

test("live health is independent of MongoDB and Redis", async () => {
  let calls = 0;
  await withServer({ mongo: async () => { calls += 1; throw new Error("down"); }, redis: async () => { calls += 1; return false; } }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health/live`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "alive" });
  });
  assert.equal(calls, 0);
});

test("ready health succeeds only when MongoDB and Redis checks succeed", async () => {
  await withServer({ mongo: async () => true, redis: async () => true }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health/ready`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ready" });
  });
});

test("ready health fails when MongoDB is unavailable", async () => {
  await withServer({ mongo: async () => { throw new Error("private Mongo error"); }, redis: async () => true }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health/ready`);
    const body = await response.json();
    assert.equal(response.status, 503);
    assert.deepEqual(body, { status: "not_ready" });
    assert.equal(JSON.stringify(body).includes("private Mongo error"), false);
  });
});

test("ready health fails when Redis is unavailable", async () => {
  await withServer({ mongo: async () => true, redis: async () => { throw new Error("private Redis error"); } }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health/ready`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { status: "not_ready" });
  });
});

test("ready health fails when both dependencies are unavailable", async () => {
  await withServer({ mongo: async () => false, redis: async () => false }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health/ready`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { status: "not_ready" });
  });
});

test("ready health fails within the configured check timeout", async () => {
  await withServer({ mongo: () => new Promise(() => {}), redis: async () => true }, async (baseUrl) => {
    const started = Date.now();
    const response = await fetch(`${baseUrl}/health/ready`);
    assert.equal(response.status, 503);
    assert.ok(Date.now() - started < 500);
  });
});
