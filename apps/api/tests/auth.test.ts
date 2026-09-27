import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import test from "node:test";
import type { Db } from "mongodb";
import { createAuthApi } from "../src/auth.js";
import { readConfig } from "../src/config.js";
import { createApp } from "../src/health.js";

interface TestOptions {
  db?: unknown;
  rateLimitMax?: number;
  now?: () => number;
}

async function withServer(options: TestOptions, run: (baseUrl: string) => Promise<void>): Promise<void> {
  const db = (options.db ?? { collection: () => ({}) }) as Db;
  let ready = true;
  const auth = createAuthApi({
    db,
    isReady: () => ready,
    rateLimitMax: options.rateLimitMax ?? 20,
    rateLimitWindowMs: 60_000,
    kdfConcurrency: 2,
    now: options.now,
  });
  const app = createApp({
    checks: { mongo: async () => true, redis: async () => true },
    applicationReady: () => ready,
    authRouter: auth.router,
  });
  const server: Server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server did not bind a TCP port");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await run(baseUrl);
  } finally {
    ready = false;
    server.close();
    await once(server, "close");
  }
}

async function post(baseUrl: string, path: string, body: string, contentType = "application/json"): Promise<Response> {
  return fetch(`${baseUrl}/api/auth/${path}`, {
    method: "POST",
    headers: { "Content-Type": contentType },
    body,
  });
}

async function beforeDeadline<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("test operation exceeded its deadline")), milliseconds);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

test("auth input rejects non-string fields, invalid bounds, arrays and client role fields", async () => {
  const invalidBodies = [
    { email: {}, password: "long enough password" },
    { email: "person@example.com", password: [] },
    { email: "person@example.com", password: "short" },
    { email: "not-an-email", password: "long enough password" },
    { email: "person@example.com", password: "long enough password", role: "ADMIN" },
    null,
    [],
  ];
  await withServer({}, async (baseUrl) => {
    for (const body of invalidBodies) {
      const response = await post(baseUrl, "register", JSON.stringify(body));
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: "invalid_request" });
    }
  });
});

test("auth rejects non-JSON media types with a sanitized response", async () => {
  await withServer({}, async (baseUrl) => {
    const response = await post(baseUrl, "register", "{}", "application/vnd.example+json");
    assert.equal(response.status, 415);
    assert.deepEqual(await response.json(), { error: "unsupported_media_type" });
    assert.equal(response.headers.get("cache-control"), "no-store");
  });
});

test("malformed and oversized JSON receive safe client errors", async () => {
  await withServer({}, async (baseUrl) => {
    const malformed = await post(baseUrl, "register", "{");
    assert.equal(malformed.status, 400);
    assert.deepEqual(await malformed.json(), { error: "invalid_json" });

    const oversized = await post(baseUrl, "register", JSON.stringify({ email: "a@example.com", password: "x".repeat(9000) }));
    assert.equal(oversized.status, 413);
    assert.deepEqual(await oversized.json(), { error: "payload_too_large" });
  });
});

test("database errors are sanitized and do not expose submitted values", async () => {
  const sessions = { findOne: async () => { throw new Error("private Mongo connection string"); } };
  const db = { collection: (name: string) => name === "sessions" ? sessions : {} };
  const secretToken = "A".repeat(43);
  await withServer({ db }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/me`, { headers: { Authorization: `Bearer ${secretToken}` } });
    const body = await response.text();
    assert.equal(response.status, 500);
    assert.equal(body, JSON.stringify({ error: "internal_error" }));
    assert.equal(body.includes(secretToken), false);
    assert.equal(body.includes("private Mongo connection string"), false);
    assert.equal(response.headers.get("cache-control"), "no-store");
  });
});

test("sessions are accepted only from a well-formed Authorization bearer header", async () => {
  let sessionLookups = 0;
  const sessions = { findOne: async () => { sessionLookups += 1; return null; } };
  const db = { collection: (name: string) => name === "sessions" ? sessions : {} };
  const token = "A".repeat(43);
  await withServer({ db }, async (baseUrl) => {
    const requests = [
      fetch(`${baseUrl}/api/auth/me`),
      fetch(`${baseUrl}/api/auth/me`, { headers: { Authorization: "Bearer malformed" } }),
      fetch(`${baseUrl}/api/auth/me?token=${token}`),
      fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: `session=${token}` } }),
    ];
    for (const response of await Promise.all(requests)) {
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { error: "unauthorized" });
    }
    assert.equal(sessionLookups, 0);
  });
});

test("shared KDF concurrency rejects excess work and releases capacity", async () => {
  let lookupCount = 0;
  let signalStarted!: () => void;
  let releaseLookup!: () => void;
  const bothStarted = new Promise<void>((resolve) => { signalStarted = resolve; });
  const lookupGate = new Promise<void>((resolve) => { releaseLookup = resolve; });
  const users = {
    findOne: async () => {
      lookupCount += 1;
      if (lookupCount === 2) signalStarted();
      await lookupGate;
      return null;
    },
  };
  const db = { collection: (name: string) => name === "users" ? users : {} };
  await withServer({ db, rateLimitMax: 10 }, async (baseUrl) => {
    const requestBody = JSON.stringify({ email: "person@example.com", password: "correct horse battery staple" });
    const first = post(baseUrl, "login", requestBody);
    const second = post(baseUrl, "login", requestBody);
    try {
      await beforeDeadline(bothStarted, 5000);
      const saturated = await post(baseUrl, "login", requestBody);
      assert.equal(saturated.status, 429);
      assert.equal(saturated.headers.get("retry-after"), "1");

      releaseLookup();
      const initialResults = await Promise.all([first, second]);
      assert.deepEqual(initialResults.map((response) => response.status), [401, 401]);
      const afterRelease = await post(baseUrl, "login", requestBody);
      assert.equal(afterRelease.status, 401);
    } finally {
      releaseLookup();
      await Promise.allSettled([first, second]);
    }
  });
});

test("per-process auth rate limit returns Retry-After and resets at the window boundary", async () => {
  let clock = 10_000;
  await withServer({ rateLimitMax: 1, now: () => clock }, async (baseUrl) => {
    const first = await post(baseUrl, "login", "{}", "text/plain");
    assert.equal(first.status, 415);
    const blocked = await post(baseUrl, "login", "{}", "text/plain");
    assert.equal(blocked.status, 429);
    assert.equal(blocked.headers.get("retry-after"), "60");

    clock += 60_000;
    const afterWindow = await post(baseUrl, "login", "{}", "text/plain");
    assert.equal(afterWindow.status, 415);
  });
});

test("auth routes and readiness require initialized auth indexes", async () => {
  const ready = false;
  const auth = createAuthApi({
    db: { collection: () => ({}) } as unknown as Db,
    isReady: () => ready,
    rateLimitMax: 20,
    rateLimitWindowMs: 60_000,
    kdfConcurrency: 2,
  });
  const app = createApp({
    checks: { mongo: async () => true, redis: async () => true },
    applicationReady: () => ready,
    authRouter: auth.router,
  });
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server did not bind a TCP port");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/auth/me`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "not_ready" });
    const health = await fetch(`http://127.0.0.1:${address.port}/health/ready`);
    assert.equal(health.status, 503);
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("auth config exposes bounded rate and KDF concurrency settings", () => {
  const defaults = readConfig({});
  assert.equal(defaults.authRateLimitMax, 20);
  assert.equal(defaults.authRateLimitWindowMs, 60_000);
  assert.equal(defaults.authKdfConcurrency, 2);
  assert.throws(() => readConfig({ AUTH_RATE_LIMIT_MAX: "0" }), /Invalid AUTH_RATE_LIMIT_MAX configuration/);
  assert.throws(() => readConfig({ AUTH_RATE_LIMIT_WINDOW_MS: "999" }), /Invalid AUTH_RATE_LIMIT_WINDOW_MS configuration/);
  assert.throws(() => readConfig({ AUTH_KDF_CONCURRENCY: "3" }), /Invalid AUTH_KDF_CONCURRENCY configuration/);
});
