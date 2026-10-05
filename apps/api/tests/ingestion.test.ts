import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { test } from "node:test";
import { canonicalJson, digest, strictJson, validatePayload, type Json, type Payload } from "../src/ingestion-contract.js";
import { createIngestionApi } from "../src/ingestion-api.js";
import { createApp } from "../src/health.js";
import { type IngestionStore, type Delivery } from "../src/ingestion-store.js";

const fixture = () => strictJson(readFileSync("fixtures/market/mp-02-synthetic.json", "utf8"));
type Mutation = { name: string; path?: (string | number)[]; value?: Json; sets?: [(string | number)[], Json][] };
const cases = JSON.parse(readFileSync("apps/api/tests/ingestion-parity.json", "utf8")) as Mutation[];
function mutate(input: Json, path: (string | number)[], value: Json) { let cursor = input; for (const part of path.slice(0, -1)) cursor = (cursor as Record<string | number, Json>)[part]!; (cursor as Record<string | number, Json>)[path.at(-1)!] = value; }
test("full fixture contract and shared negative parity corpus", () => {
  assert.equal(validatePayload(fixture()).candles.length, 33);
  for (const entry of cases) { const input = fixture(); for (const [path, value] of entry.sets ?? [[entry.path!, entry.value!]]) mutate(input, path, value); assert.throws(() => validatePayload(input), Error, entry.name); }
});
test("strict JSON detects duplicates, malformed primitives, unsafe numbers and Unicode", () => {
  for (const text of ['{"x":1,"x":2}', '{"x":{"a":1,"a":2}}', '[1,]', '01', '1e400', '9007199254740992', '1e20', '"\\ud800"', '{"x":NaN}', '{"x":true} garbage']) assert.throws(() => strictJson(text), Error, text);
  assert.equal(canonicalJson(strictJson('{"b":1.0,"a":"😀"}')), '{"a":"😀","b":1}');
  assert.equal(canonicalJson(strictJson('{"z":1,"10":2,"2":3}')), '{"10":2,"2":3,"z":1}');
  assert.equal(digest(strictJson('{"b":1.0,"a":2}')), digest(strictJson('{"a":2,"b":1}')));
  assert.notEqual(digest([1, 2]), digest([2, 1]));
});
test("internal authentication precedes parsing; envelope/media/digest failures never persist", async t => {
  let writes = 0;
  let hangEnqueue = false;
  const payload = validatePayload(fixture()); const secret = "a".repeat(64);
  const store = { accept: async (id: string, hash: string, data: Payload) => { writes++; return { _id: id, payloadDigest: hash, payload: data, provider: "marketpulse-fixture", status: "accepted", attempts: 0, counts: { assets: 0, observations: 0 }, serverReceivedAt: new Date(), updatedAt: new Date() } as Delivery; }, deliveries: { findOne: async () => null } } as unknown as IngestionStore;
  const router = createIngestionApi({ store, secret, isReady: () => true, enqueue: async () => { if (hangEnqueue) await new Promise<void>(() => undefined); else throw new Error("offline"); } });
  const server = createServer(createApp({ checks: { mongo: async () => true, redis: async () => true }, ingestionRouter: router }));
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address(); assert(address && typeof address === "object"); const url = `http://127.0.0.1:${address.port}/internal/ingestion/deliveries`;
  const send = (body: string, headers: Record<string, string> = {}) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body });
  assert.equal((await send("{broken")).status, 401);
  assert.equal((await send("{broken", { Authorization: `Bearer ${"é".repeat(64)}` })).status, 401);
  const auth = { Authorization: `Bearer ${secret}` };
  assert.equal((await send("{broken", auth)).status, 400);
  assert.equal((await send("{}", { ...auth, "Content-Type": "text/plain" })).status, 415);
  assert.equal((await send("{}", { ...auth, "Content-Encoding": "gzip" })).status, 415);
  assert.equal((await send("x".repeat(1024 * 1024 + 1), auth)).status, 413);
  const envelope = { deliveryId: "test", payloadDigest: digest(payload as unknown as Json), payload };
  for (const invalid of [{ ...envelope, extra: 1 }, { ...envelope, deliveryId: "bad:id" }, { ...envelope, payloadDigest: "0".repeat(64) }]) assert.equal((await send(JSON.stringify(invalid), auth)).status, 400);
  assert.equal(writes, 0);
  const result = await send(JSON.stringify(envelope), auth); assert.equal(result.status, 202); assert.equal((await result.json() as {status: string}).status, "accepted"); assert.equal(writes, 1);
  hangEnqueue = true;
  const started = Date.now(); const bounded = await send(JSON.stringify(envelope), auth);
  assert.equal(bounded.status, 202); assert.equal((await bounded.json() as { status: string }).status, "accepted");
  assert(Date.now() - started >= 1400 && Date.now() - started < 3000, "hung enqueue returns a durable receipt within its deadline");
});
