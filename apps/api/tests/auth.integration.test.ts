import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import test from "node:test";
import { MongoClient, type Db } from "mongodb";
import { createAuthApi } from "../src/auth.js";
import { readConfig } from "../src/config.js";
import { createApp } from "../src/health.js";

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const password = "correct horse battery staple";

test("auth uses unique Mongo indexes, server-side sessions, expiration, and logout revocation", async () => {
  const config = readConfig();
  const client = new MongoClient(config.mongoUrl, { serverSelectionTimeoutMS: 1500 });
  const suffix = randomUUID().replaceAll("-", "");
  const dbName = `marketpulse_auth_test_${suffix}`;
  let connected = false;
  let ready = false;
  let clock = Date.now();
  let server: Server | undefined;

  try {
    try {
      await client.connect();
      connected = true;
    } catch {
      throw new Error("Auth integration requires a reachable MongoDB at MONGODB_URL.");
    }

    const db: Db = client.db(dbName);
    const auth = createAuthApi({
      db,
      isReady: () => ready,
      rateLimitMax: config.authRateLimitMax,
      rateLimitWindowMs: config.authRateLimitWindowMs,
      kdfConcurrency: config.authKdfConcurrency,
      now: () => clock,
    });
    await auth.initialize();
    ready = true;
    const app = createApp({
      checks: { mongo: async () => { await db.command({ ping: 1 }); return true; }, redis: async () => true },
      applicationReady: () => ready,
      authRouter: auth.router,
    });
    server = createServer(app);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("integration server did not bind a TCP port");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const emailA = `user-${suffix}@example.com`;
    const emailB = `other-${suffix}@example.com`;

    const registrationRace = await Promise.all([
      fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailA, password }),
      }),
      fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailA.toUpperCase(), password }),
      }),
    ]);
    assert.deepEqual(registrationRace.map((response) => response.status).sort((a, b) => a - b), [201, 409]);
    const createdAResponse = registrationRace.find((response) => response.status === 201);
    assert.ok(createdAResponse);
    const createdA = await createdAResponse.json() as { token: string; tokenType: string; expiresAt: string; user: Record<string, unknown> };
    assert.match(createdA.token, /^[A-Za-z0-9_-]{43}$/u);
    assert.equal(createdA.tokenType, "Bearer");
    assert.equal(Date.parse(createdA.expiresAt), clock + SESSION_TTL_MS);
    assert.deepEqual(Object.keys(createdA.user).sort(), ["createdAt", "email", "id", "role"]);
    assert.equal(createdA.user.email, emailA);
    assert.equal(createdA.user.role, "USER");

    const registrationB = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emailB, password }),
    });
    assert.equal(registrationB.status, 201);
    const createdB = await registrationB.json() as { token: string; user: { id: string } };
    assert.match(createdB.token, /^[A-Za-z0-9_-]{43}$/u);

    const users = db.collection("users");
    const storedA = await users.findOne({ email: emailA });
    const storedB = await users.findOne({ email: emailB });
    assert.ok(storedA && storedB);
    assert.match(String(storedA.passwordHash), /^scrypt\$131072\$8\$1\$/u);
    assert.notEqual(storedA.passwordHash, password);
    assert.notEqual(storedA.passwordHash, storedB.passwordHash, "same passwords must receive independent salts");
    assert.equal(JSON.stringify(storedA).includes(password), false);
    assert.equal(storedA.role, "USER");
    assert.equal(storedA.email, emailA);

    const sessions = db.collection("sessions");
    const hashToken = (token: string) => createHash("sha256").update(token, "ascii").digest("hex");
    const sessionA = await sessions.findOne({ tokenHash: hashToken(createdA.token) });
    const sessionB = await sessions.findOne({ tokenHash: hashToken(createdB.token) });
    assert.ok(sessionA && sessionB);
    assert.equal("token" in sessionA, false);
    assert.equal(JSON.stringify(sessionA).includes(createdA.token), false);
    assert.match(String(sessionA.tokenHash), /^[0-9a-f]{64}$/u);
    const userIndexes = await users.listIndexes().toArray();
    const sessionIndexes = await sessions.listIndexes().toArray();
    assert.ok(userIndexes.some((index) => index.name === "email_unique" && index.unique === true));
    assert.ok(sessionIndexes.some((index) => index.name === "token_hash_unique" && index.unique === true));
    assert.ok(sessionIndexes.some((index) => index.name === "session_expiry_ttl" && index.expireAfterSeconds === 0));

    const badPassword = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emailA, password: "incorrect horse battery staple!" }),
    });
    const unknownEmail = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `missing-${suffix}@example.com`, password }),
    });
    assert.equal(badPassword.status, 401);
    assert.equal(unknownEmail.status, 401);
    const badPasswordBody = await badPassword.json();
    assert.deepEqual(badPasswordBody, await unknownEmail.json());
    assert.deepEqual(badPasswordBody, { error: "invalid_credentials" });

    const meA = await fetch(`${baseUrl}/api/auth/me`, { headers: { Authorization: `Bearer ${createdA.token}` } });
    assert.equal(meA.status, 200);
    const meABody = await meA.json() as { user: Record<string, unknown> };
    assert.deepEqual(meABody.user, createdA.user);
    assert.equal(meA.headers.get("cache-control"), "no-store");
    const impersonationAttempt = await fetch(`${baseUrl}/api/auth/me?userId=${createdA.user.id}`, {
      headers: { Authorization: `Bearer ${createdB.token}`, "X-User-Id": String(createdA.user.id) },
    });
    assert.equal(impersonationAttempt.status, 200);
    const impersonationBody = await impersonationAttempt.json() as { user: { id: string; email: string } };
    assert.equal(impersonationBody.user.id, createdB.user.id);
    assert.equal(impersonationBody.user.email, emailB);

    const expiringLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emailB, password }),
    });
    assert.equal(expiringLogin.status, 200);
    const expiring = await expiringLogin.json() as { token: string };
    const expirySession = await sessions.findOne({ tokenHash: hashToken(expiring.token) });
    assert.ok(expirySession);
    clock += SESSION_TTL_MS + 1;
    assert.ok(await sessions.findOne({ _id: expirySession._id }), "Mongo TTL cleanup must not be required for expiry enforcement");
    const expiredMe = await fetch(`${baseUrl}/api/auth/me`, { headers: { Authorization: `Bearer ${expiring.token}` } });
    assert.equal(expiredMe.status, 401);
    assert.deepEqual(await expiredMe.json(), { error: "unauthorized" });
    clock = Date.now();

    const logout = await fetch(`${baseUrl}/api/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${createdA.token}` },
    });
    assert.equal(logout.status, 204);
    assert.equal(await sessions.findOne({ tokenHash: hashToken(createdA.token) }), null);
    const replay = await fetch(`${baseUrl}/api/auth/me`, { headers: { Authorization: `Bearer ${createdA.token}` } });
    assert.equal(replay.status, 401);
    assert.deepEqual(await replay.json(), { error: "unauthorized" });
  } finally {
    ready = false;
    if (server) {
      server.close();
      await once(server, "close");
    }
    if (connected) {
      await client.db(dbName).dropDatabase().catch(() => undefined);
      await client.close();
    }
  }
});
