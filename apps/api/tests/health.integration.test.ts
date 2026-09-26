import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import test from "node:test";
import { readConfig } from "../src/config.js";
import { createApp } from "../src/health.js";
import { createStores } from "../src/stores.js";

test("real MongoDB and Redis readiness plus isolated round trips", async () => {
  const config = readConfig();
  const stores = createStores(config);
  const suffix = randomUUID().replaceAll("-", "");
  const collectionName = `mp03_${suffix}`;
  const redisKey = `marketpulse:mp03:${suffix}`;
  let mongoConnected = false;
  let redisConnected = false;
  let collectionCreated = false;
  let keyCreated = false;
  let server: Server | undefined;
  stores.redis.on("error", () => {});

  try {
    try {
      await stores.mongo.connect();
      mongoConnected = true;
      await stores.redis.connect();
      redisConnected = true;
    } catch {
      throw new Error("MP-03 integration requires reachable MongoDB and Redis at MONGODB_URL and REDIS_URL.");
    }

    const collection = stores.mongo.db("marketpulse_mp03_test").collection(collectionName);
    await collection.insertOne({ marker: suffix });
    collectionCreated = true;
    const stored = await collection.findOne({ marker: suffix });
    assert.equal(stored?.marker, suffix, "MongoDB must round-trip this test's unique record");

    await stores.redis.set(redisKey, suffix);
    keyCreated = true;
    assert.equal(await stores.redis.get(redisKey), suffix, "Redis must round-trip this test's unique key");

    server = createServer(createApp({ checks: {
      mongo: async () => { await stores.mongo.db().command({ ping: 1 }); return true; },
      redis: async () => (await stores.redis.ping()) === "PONG",
    } }));
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("integration server did not bind a TCP port");
    const response = await fetch(`http://127.0.0.1:${address.port}/health/ready`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ready" });

    await stores.redis.quit();
    redisConnected = false;
    const unavailable = await fetch(`http://127.0.0.1:${address.port}/health/ready`);
    assert.equal(unavailable.status, 503, "readiness must fail during a real Redis outage");
    await stores.redis.connect();
    redisConnected = true;
    const recovered = await fetch(`http://127.0.0.1:${address.port}/health/ready`);
    assert.equal(recovered.status, 200, "readiness must recover after Redis reconnects");
  } finally {
    if (server) {
      server.close();
      await once(server, "close");
    }
    if (mongoConnected && collectionCreated) {
      await stores.mongo.db("marketpulse_mp03_test").dropCollection(collectionName).catch(() => undefined);
    }
    if (redisConnected && keyCreated && stores.redis.isOpen) await stores.redis.del(redisKey).catch(() => undefined);
    await Promise.allSettled([stores.mongo.close(), stores.redis.isOpen ? stores.redis.quit() : Promise.resolve()]);
  }
});
