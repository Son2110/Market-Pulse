import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import test from "node:test";
import { MongoClient, ObjectId } from "mongodb";
import { createAuthApi } from "../src/auth.js";
import { readConfig } from "../src/config.js";
import { createFixtureMarketDataProvider } from "../src/fixture-market-data-provider.js";
import { createApp } from "../src/health.js";
import { createWatchlistApi } from "../src/watchlists.js";

interface PublicWatchlist {
  id: string;
  name: string;
  symbols: string[];
  createdAt: string;
  updatedAt: string;
}

test("real Mongo watchlists enforce owner isolation, atomic membership, uniqueness and session lifecycle", async (t) => {
  const config = readConfig();
  const client = new MongoClient(config.mongoUrl, { serverSelectionTimeoutMS: 1500 });
  const dbName = `marketpulse_watchlist_test_${randomUUID().replaceAll("-", "")}`;
  let connected = false;
  let ready = false;
  let clock = Date.now();
  let server: Server | undefined;
  try {
    try { await client.connect(); connected = true; }
    catch { throw new Error("Watchlist integration requires a reachable MongoDB at MONGODB_URL."); }
    const db = client.db(dbName);
    const auth = createAuthApi({
      db, isReady: () => ready, rateLimitMax: config.authRateLimitMax,
      rateLimitWindowMs: config.authRateLimitWindowMs, kdfConcurrency: 1, now: () => clock,
    });
    const provider = createFixtureMarketDataProvider();
    const watchlists = createWatchlistApi({ db, authenticate: auth.authenticate, provider, isReady: () => ready, now: () => clock });
    await auth.initialize();
    await provider.initialize();
    await watchlists.initialize();
    ready = true;
    server = createServer(createApp({
      checks: { mongo: async () => { await db.command({ ping: 1 }); return true; }, redis: async () => true },
      authRouter: auth.router, watchlistRouter: watchlists.router, applicationReady: () => ready,
    }));
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("integration server did not bind");
    const base = `http://127.0.0.1:${address.port}`;
    const register = async (email: string) => {
      const response = await fetch(`${base}/api/auth/register`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: "correct horse battery staple" }),
      });
      assert.equal(response.status, 201);
      return await response.json() as { token: string; user: { id: string } };
    };
    const userA = await register("watchlist-a@example.com");
    const userB = await register("watchlist-b@example.com");
    const send = async (method: string, path = "", token?: string, body?: Record<string, unknown>, extraHeaders: Record<string, string> = {}) => {
      const response = await fetch(`${base}/api/watchlists${path}`, {
        method,
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extraHeaders },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      assert.equal(response.headers.get("cache-control"), "no-store");
      return response;
    };
    const read = async (token: string): Promise<PublicWatchlist[]> => {
      const response = await send("GET", "", token);
      assert.equal(response.status, 200);
      return (await response.json() as { data: PublicWatchlist[] }).data;
    };
    const collection = db.collection("watchlists");
    let list: PublicWatchlist;

    await t.test("simultaneous creates persist exactly one watchlist per user", async () => {
      assert.deepEqual(await read(userA.token), []);
      const responses = await Promise.all(Array.from({ length: 6 }, (_, index) => send("POST", "", userA.token, { name: `  Danh sách ${index}  ` })));
      assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409, 409, 409, 409, 409]);
      for (const response of responses) {
        const body = await response.json();
        if (response.status === 201) list = body.data;
        else assert.deepEqual(body, { error: "watchlist_already_exists" });
      }
      assert.ok(list!);
      assert.deepEqual(Object.keys(list).sort(), ["createdAt", "id", "name", "symbols", "updatedAt"]);
      assert.deepEqual(list.symbols, []);
      assert.equal(list.createdAt, new Date(clock).toISOString());
      assert.deepEqual(await read(userA.token), [list]);
      assert.equal(await collection.countDocuments({ userId: new ObjectId(userA.user.id) }), 1);
      const stored = await collection.findOne({ _id: new ObjectId(list.id) });
      assert.ok(stored?.userId instanceof ObjectId && stored.userId.equals(new ObjectId(userA.user.id)));
      assert.deepEqual(Object.keys(stored).sort(), ["_id", "createdAt", "name", "symbols", "updatedAt", "userId"]);
      const indexes = await collection.listIndexes().toArray();
      assert.ok(indexes.some((index) => index.name === "watchlist_user_unique" && index.unique === true && index.key.userId === 1));
    });

    const routes = () => [
      { method: "GET", path: "" }, { method: "POST", path: "", body: { name: "Other" } },
      { method: "PATCH", path: `/${list.id}`, body: { name: "Renamed" } }, { method: "DELETE", path: `/${list.id}` },
      { method: "PUT", path: `/${list.id}/symbols/FPT` }, { method: "DELETE", path: `/${list.id}/symbols/FPT` },
    ];

    await t.test("all routes require valid server sessions", async () => {
      for (const route of routes()) {
        for (const token of [undefined, "invalid", "A".repeat(43)]) {
          const response = await send(route.method, route.path, token, route.body);
          assert.equal(response.status, 401);
          assert.deepEqual(await response.json(), { error: "unauthorized" });
        }
      }
    });

    await t.test("foreign and missing IDs give identical errors, and client owner claims cannot override ownership", async () => {
      assert.deepEqual(await read(userB.token), []);
      const before = await collection.findOne({ _id: new ObjectId(list.id) });
      const missingId = new ObjectId().toHexString();
      for (const route of routes().slice(2)) {
        for (const path of [route.path, route.path.replace(list.id, missingId)]) {
          const response = await send(route.method, path, userB.token, route.body, { "X-User-Id": userA.user.id });
          assert.equal(response.status, 404);
          assert.deepEqual(await response.json(), { error: "not_found" });
        }
      }
      for (const route of routes()) {
        const query = await send(route.method, `${route.path}?userId=${userA.user.id}`, userB.token, route.body);
        assert.equal(query.status, 400);
        assert.deepEqual(await query.json(), { error: "invalid_request" });
      }
      for (const field of ["userId", "ownerId", "_id", "symbols", "createdAt", "updatedAt", "role", "token"]) {
        for (const [method, path] of [["POST", ""], ["PATCH", `/${list.id}`]]) {
          const response = await send(method!, path!, userB.token, { name: "Forged", [field]: userA.user.id });
          assert.equal(response.status, 400);
          await response.json();
        }
      }
      for (const route of routes().filter((route) => route.method === "DELETE" || route.method === "PUT")) {
        const response = await send(route.method, route.path, userB.token, { userId: userA.user.id });
        assert.equal(response.status, 400);
        await response.json();
      }
      const forgedHeaderRead = await send("GET", "", userB.token, undefined, { "X-User-Id": userA.user.id });
      assert.deepEqual(await forgedHeaderRead.json(), { data: [] });
      const createB = await send("POST", "", userB.token, { name: "B" }, { "X-User-Id": userA.user.id });
      assert.equal(createB.status, 201);
      const bodyB = await createB.json();
      assert.notEqual(bodyB.data.id, list.id);
      assert.equal(await collection.countDocuments({ userId: new ObjectId(userB.user.id) }), 1);
      assert.deepEqual(await collection.findOne({ _id: new ObjectId(list.id) }), before);
    });

    await t.test("rename preserves creation time and simultaneous adds lose neither distinct nor duplicate symbols", async () => {
      clock += 1000;
      const renamed = await send("PATCH", `/${list.id}`, userA.token, { name: "  Theo dõi  " });
      assert.equal(renamed.status, 200);
      list = (await renamed.json()).data;
      assert.equal(list.name, "Theo dõi");
      assert.equal(Date.parse(list.updatedAt) - Date.parse(list.createdAt), 1000);
      clock += 1000;
      const adds = await Promise.all(["FPT", "VCB", "HPG", "FPT", "VCB", "VNM"].map((symbol) => send("PUT", `/${list.id}/symbols/${symbol}`, userA.token)));
      for (const response of adds) { assert.equal(response.status, 200); await response.json(); }
      list = (await read(userA.token))[0]!;
      assert.deepEqual(list.symbols, ["FPT", "HPG", "VCB", "VNM"]);
      assert.equal(list.updatedAt, new Date(clock).toISOString());
      const equities = (await provider.getAssets()).filter((asset) => asset.assetType === "equity").map((asset) => asset.symbol);
      for (const symbol of equities) {
        const response = await send("PUT", `/${list.id}/symbols/${symbol}`, userA.token);
        assert.equal(response.status, 200); await response.json();
      }
      for (const symbol of ["UNKNOWN", "VNINDEX", "fpt"]) {
        const response = await send("PUT", `/${list.id}/symbols/${symbol}`, userA.token);
        assert.equal(response.status, 400); assert.deepEqual(await response.json(), { error: "invalid_request" });
      }
      assert.deepEqual((await read(userA.token))[0]!.symbols, equities.sort());
      const stored = await collection.findOne({ _id: new ObjectId(list.id) });
      assert.equal(stored?.symbols.length, 10);
      assert.equal(new Set(stored?.symbols).size, 10);
    });

    await t.test("removal is idempotent and deleting then recreating produces a new ID", async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        const response = await send("DELETE", `/${list.id}/symbols/FPT`, userA.token);
        assert.equal(response.status, 200);
        assert.equal((await response.json()).data.symbols.includes("FPT"), false);
      }
      const oldId = list.id;
      const removed = await send("DELETE", `/${oldId}`, userA.token);
      assert.equal(removed.status, 204); assert.equal(await removed.text(), "");
      assert.deepEqual(await read(userA.token), []);
      const missing = await send("DELETE", `/${oldId}`, userA.token);
      assert.equal(missing.status, 404); assert.deepEqual(await missing.json(), { error: "not_found" });
      const created = await send("POST", "", userA.token, { name: "New" });
      assert.equal(created.status, 201);
      list = (await created.json()).data;
      assert.notEqual(list.id, oldId);
      assert.deepEqual(list.symbols, []);
    });

    await t.test("expired and logged-out sessions cannot read or mutate the watchlist", async () => {
      const before = await collection.findOne({ _id: new ObjectId(list.id) });
      clock += 8 * 60 * 60 * 1000 + 1;
      for (const route of routes()) {
        const response = await send(route.method, route.path, userA.token, route.body);
        assert.equal(response.status, 401); assert.deepEqual(await response.json(), { error: "unauthorized" });
      }
      clock -= 8 * 60 * 60 * 1000 + 1;
      const logout = await fetch(`${base}/api/auth/logout`, { method: "POST", headers: { Authorization: `Bearer ${userA.token}` } });
      assert.equal(logout.status, 204);
      for (const route of routes()) {
        const response = await send(route.method, route.path, userA.token, route.body);
        assert.equal(response.status, 401); assert.deepEqual(await response.json(), { error: "unauthorized" });
      }
      assert.deepEqual(await collection.findOne({ _id: new ObjectId(list.id) }), before);
    });
  } finally {
    ready = false;
    if (server) { server.close(); await once(server, "close"); }
    if (connected) { await client.db(dbName).dropDatabase(); }
    await client.close();
  }
});
