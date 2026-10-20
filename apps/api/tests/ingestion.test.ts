import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { test } from "node:test";
import { classifyPayload, ContractError, canonicalJson, digest, isFixturePayload, isGoldPayload, isObservedPayload, strictJson, validatePayload, type Json, type Payload } from "../src/ingestion-contract.js";
import * as json from "../src/platform/contracts/json.js";
import { validateGoldPayload } from "../src/gold-contract.js";
import { createIngestionApi } from "../src/ingestion-api.js";
import { FAMILY_JOB_NAMES, jobId, queueJobName } from "../src/ingestion-queue.js";
import { createApp } from "../src/health.js";
import { classifyDelivery, receipt, type IngestionStore, type Delivery } from "../src/ingestion-store.js";

const fixture = () => strictJson(readFileSync("fixtures/market/mp-02-synthetic.json", "utf8"));
type Mutation = { name: string; path?: (string | number)[]; value?: Json; sets?: [(string | number)[], Json][] };
const cases = JSON.parse(readFileSync("apps/api/tests/ingestion-parity.json", "utf8")) as Mutation[];
function mutate(input: Json, path: (string | number)[], value: Json) { let cursor = input; for (const part of path.slice(0, -1)) cursor = (cursor as Record<string | number, Json>)[part]!; (cursor as Record<string | number, Json>)[path.at(-1)!] = value; }
test("full fixture contract and shared negative parity corpus", () => {
  const validated = validatePayload(fixture()); assert("candles" in validated); assert.equal(validated.candles.length, 33);
  for (const entry of cases) { const input = fixture(); for (const [path, value] of entry.sets ?? [[entry.path!, entry.value!]]) mutate(input, path, value); assert.throws(() => validatePayload(input), Error, entry.name); }
});
test("strict JSON detects duplicates, malformed primitives, unsafe numbers and Unicode", () => {
  for (const text of ['{"x":1,"x":2}', '{"x":{"a":1,"a":2}}', '[1,]', '01', '1e400', '9007199254740992', '1e20', '"\\ud800"', '{"x":NaN}', '{"x":true} garbage']) assert.throws(() => strictJson(text), Error, text);
  assert.equal(canonicalJson(strictJson('{"b":1.0,"a":"😀"}')), '{"a":"😀","b":1}');
  assert.equal(canonicalJson(strictJson('{"z":1,"10":2,"2":3}')), '{"10":2,"2":3,"z":1}');
  assert.equal(digest(strictJson('{"b":1.0,"a":2}')), digest(strictJson('{"a":2,"b":1}')));
  assert.notEqual(digest([1, 2]), digest([2, 1]));
});
test("shared JSON exports retain function and ContractError identity", () => {
  assert.equal(ContractError, json.ContractError);
  assert.equal(canonicalJson, json.canonicalJson);
  assert.equal(digest, json.digest);
  assert.equal(strictJson, json.strictJson);
  for (const parse of [strictJson, json.strictJson]) assert.throws(() => parse('{"a":1,"a":2}'), ContractError);
  assert.throws(() => validateGoldPayload({}), json.ContractError);
  assert.throws(() => validatePayload({ observations: [] }), json.ContractError);
  assert.throws(() => validatePayload({}), json.ContractError);
});
test("strict JSON retains depth boundaries, own __proto__ keys and native string syntax errors", () => {
  const nested = (depth: number, leaf: string) => "[".repeat(depth) + leaf + "]".repeat(depth);
  assert.doesNotThrow(() => strictJson(nested(32, "0")));
  assert.throws(() => strictJson(nested(33, "0")), ContractError);
  assert.doesNotThrow(() => strictJson(nested(33, "")));
  assert.throws(() => strictJson(nested(34, "")), ContractError);
  const object = strictJson('{"__proto__":{"safe":true},"constructor":1}') as Record<string, Json>;
  assert.equal(Object.getPrototypeOf(object), null);
  assert(Object.hasOwn(object, "__proto__"));
  assert.equal(Object.getPrototypeOf(object.__proto__), null);
  assert.equal(canonicalJson(object), '{"__proto__":{"safe":true},"constructor":1}');
  assert.throws(() => strictJson('{"__proto__":1,"__proto__":2}'), ContractError);
  for (const text of ['"\\x"', '"\\uZZZZ"', '"\n"']) {
    assert.throws(() => strictJson(text), error => error instanceof SyntaxError && !(error instanceof ContractError));
  }
  assert.throws(() => strictJson('"unterminated\\'), ContractError);
});
test("pre-extraction payload digests, queue ID and persisted identities stay fixed", () => {
  const market = validatePayload(fixture());
  const corpus = strictJson(readFileSync("apps/api/tests/observed-parity.json", "utf8")) as { baseline: Json };
  const observed = validatePayload(corpus.baseline);
  const gold = validatePayload(strictJson(readFileSync("fixtures/gold/mp-gold-synthetic.json", "utf8")));
  assert.equal(digest(market as unknown as Json), "816e6393f6268274ed16516651ab88f125a7e18836d718b45e6a284168b27433");
  assert.equal(digest(observed as unknown as Json), "3c0ecdde27ff9d0a0ab632b0df0970038487401562a9e0aedaa727414e839d73");
  assert.equal(digest(gold as unknown as Json), "7d4af217e8b8e833245d64741055ba8f2be57e94d7f511c09cf38144c5c74ac9");
  assert.equal(jobId("a2-identity-baseline"), "delivery-6d4280e1108429857e35653ff92c4aaa35c4186804fb9b8d974c87fe97905ddd");
  assert("candles" in market && market.schemaVersion === "1.0.0");
  assert("candles" in observed && observed.schemaVersion === "2.0.0");
  assert("observations" in gold);
  const candle = market.candles[0]!;
  assert.equal(digest(["candle", candle.assetId, candle.source.provider, "1d", candle.tradingDate, candle.adjustmentBasis]), "3288ebc2b1b7565651e539221af3538ef722de676ac10b41703ac7edc67d64e1");
  const bar = observed.candles[0]!;
  assert.equal(digest([bar.barId, bar.contentDigest]), "c511660e3b4b6733e07a6da9c8d58d25affa26025647152d679fea464ddf1780");
  const quote = gold.observations[0]!;
  assert.equal(digest([quote.snapshotId, quote.contentDigest]), "7faf155951e67728251391c49245cd63e3e53a94dabe52ff38394c4da343e5a8");
});
test("family classification validates before dispatch, rejects wire discriminators and derives legacy outbox rows", () => {
  const corpus = strictJson(readFileSync("apps/api/tests/observed-parity.json", "utf8")) as { baseline: Json };
  const rawMarket = fixture() as Record<string, Json>;
  const rawObserved = structuredClone(corpus.baseline) as Record<string, Json>;
  const rawGold = strictJson(readFileSync("fixtures/gold/mp-gold-synthetic.json", "utf8")) as Record<string, Json>;
  const market = classifyPayload(rawMarket);
  const observed = classifyPayload(rawObserved);
  const gold = classifyPayload(rawGold);
  assert.equal(market.family, "fixture-market"); assert.equal(market.provider, "marketpulse-fixture"); assert.equal(market.schemaVersion, "1.0.0");
  assert.equal(observed.family, "observed-candle"); assert.equal(observed.provider, "KBS"); assert.equal(observed.schemaVersion, "2.0.0");
  assert.equal(gold.family, "synthetic-gold"); assert.equal(gold.provider, "marketpulse-fixture"); assert.equal(gold.schemaVersion, "1.0.0");
  assert(isFixturePayload(market.payload) && !isObservedPayload(market.payload) && !isGoldPayload(market.payload));
  assert(isObservedPayload(observed.payload) && !isFixturePayload(observed.payload) && !isGoldPayload(observed.payload));
  assert(isGoldPayload(gold.payload) && !isFixturePayload(gold.payload) && !isObservedPayload(gold.payload));
  assert.deepEqual(FAMILY_JOB_NAMES, { "fixture-market": "persist-fixture", "observed-candle": "persist-observed", "synthetic-gold": "persist-gold" });
  assert.equal(queueJobName(market.family), "persist-fixture");
  assert.equal(queueJobName(observed.family), "persist-observed");
  assert.equal(queueJobName(gold.family), "persist-gold");

  for (const invalid of [
    { schemaVersion: "1.0.0" },
    { schemaVersion: "2.0.0" },
    { ...rawMarket, schemaVersion: "2.0.0" },
    { ...rawObserved, schemaVersion: "1.0.0" },
    { ...rawGold, schemaVersion: "2.0.0" },
    { ...rawMarket, family: "fixture-market" },
    { ...rawObserved, family: "observed-candle" },
    { ...rawGold, family: "synthetic-gold" },
    { ...rawMarket, observations: rawGold.observations },
    { ...rawObserved, quotes: rawMarket.quotes },
  ] as Json[]) assert.throws(() => classifyPayload(invalid), ContractError);

  for (const item of [market, observed, gold]) {
    const now = new Date();
    const legacy: Delivery = {
      _id: `legacy-${item.family}`, payloadDigest: digest(item.payload as unknown as Json), payload: item.payload,
      provider: item.provider, schemaVersion: item.schemaVersion, dataset: item.dataset,
      serverReceivedAt: now, updatedAt: now, status: "accepted", attempts: 0, counts: { assets: 0, observations: 0 },
    };
    assert.equal(legacy.family, undefined);
    const derived = classifyDelivery(legacy);
    assert.equal(derived.family, item.family);
    assert.equal(derived.provider, item.provider);
    assert.equal(derived.schemaVersion, item.schemaVersion);
    assert.equal(classifyDelivery({ ...legacy, family: item.family }).family, item.family);
    const projected = receipt({ ...legacy, family: item.family });
    assert(!("family" in projected));
    assert.throws(() => classifyDelivery({ ...legacy, payloadDigest: "0".repeat(64) }), ContractError);
    assert.throws(() => classifyDelivery({ ...legacy, provider: item.provider === "KBS" ? "marketpulse-fixture" : "KBS" }), ContractError);
    assert.throws(() => classifyDelivery({ ...legacy, schemaVersion: item.schemaVersion === "2.0.0" ? "1.0.0" : "2.0.0" }), ContractError);
    assert.throws(() => classifyDelivery({ ...legacy, dataset: { ...item.dataset, freshness: "tampered" } }), ContractError);
    assert.throws(() => classifyDelivery({ ...legacy, family: item.family === "synthetic-gold" ? "fixture-market" : "synthetic-gold" }), ContractError);
  }
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
  const discriminatedPayload = { ...(payload as unknown as Record<string, Json>), family: "fixture-market" };
  for (const invalid of [
    { ...envelope, extra: 1 },
    { ...envelope, family: "fixture-market" },
    { deliveryId: "test", payloadDigest: digest(discriminatedPayload), payload: discriminatedPayload },
    { ...envelope, deliveryId: "bad:id" },
    { ...envelope, payloadDigest: "0".repeat(64) },
  ]) assert.equal((await send(JSON.stringify(invalid), auth)).status, 400);
  assert.equal(writes, 0);
  const result = await send(JSON.stringify(envelope), auth); assert.equal(result.status, 202); assert.equal((await result.json() as {status: string}).status, "accepted"); assert.equal(writes, 1);
  hangEnqueue = true;
  const started = Date.now(); const bounded = await send(JSON.stringify(envelope), auth);
  assert.equal(bounded.status, 202); assert.equal((await bounded.json() as { status: string }).status, "accepted");
  assert(Date.now() - started >= 1400 && Date.now() - started < 3000, "hung enqueue returns a durable receipt within its deadline");
});
