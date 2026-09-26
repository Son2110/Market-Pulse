import assert from "node:assert/strict";
import test from "node:test";
import { readConfig } from "../src/config.js";

test("API defaults use local MongoDB and Redis with bounded retries", () => {
  const config = readConfig({});
  assert.equal(config.port, 3001);
  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.mongoUrl, "mongodb://127.0.0.1:27017/marketpulse");
  assert.equal(config.redisUrl, "redis://127.0.0.1:6379");
  assert.equal(config.connectAttempts, 5);
  assert.equal(config.dependencyTimeoutMs, 1000);
});

test("invalid ports and dependency URLs are rejected without echoing values", () => {
  assert.throws(() => readConfig({ PORT: "99999" }), /Invalid PORT configuration/);
  assert.throws(() => readConfig({ MONGODB_URL: "not-a-url" }), /Invalid MONGODB_URL configuration/);
  assert.throws(() => readConfig({ REDIS_URL: "https://private-token.invalid" }), /Invalid REDIS_URL configuration/);
  assert.throws(() => readConfig({ HOST: "0.0.0.0;bad" }), /Invalid HOST configuration/);
});
