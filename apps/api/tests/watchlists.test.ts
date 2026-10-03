import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, request as httpRequest } from "node:http";
import test from "node:test";
import type { RequestHandler } from "express";
import { ObjectId, type Db } from "mongodb";
import { createFixtureMarketDataProvider } from "../src/fixture-market-data-provider.js";
import { createApp } from "../src/health.js";
import type { AssetCatalogProvider } from "../src/market-data.js";
import { createWatchlistApi } from "../src/watchlists.js";

const ownerId = new ObjectId();
const id = new ObjectId().toHexString();
const authenticate: RequestHandler = (request, response, next) => {
  if (request.headers.authorization !== "Bearer test") {
    response.status(401).json({ error: "unauthorized" });
    return;
  }
  response.locals.authenticatedUser = { _id: ownerId };
  next();
};

async function withApi(
  run: (baseUrl: string, writes: Record<string, unknown>[]) => Promise<void>,
  options: { ready?: boolean; initialize?: boolean; failure?: boolean; indexFailure?: boolean; provider?: AssetCatalogProvider } = {},
) {
  const writes: Record<string, unknown>[] = [];
  const collection = {
    createIndex: async () => { if (options.indexFailure) throw new Error("private database detail"); },
    findOne: async () => { if (options.failure) throw new Error("private database detail"); return null; },
    insertOne: async (record: Record<string, unknown>) => { writes.push(record); },
    findOneAndUpdate: async () => { throw new Error("unexpected database call"); },
    deleteOne: async () => { throw new Error("unexpected database call"); },
  };
  const provider = options.provider ?? createFixtureMarketDataProvider();
  const api = createWatchlistApi({
    db: { collection: () => collection } as unknown as Db,
    authenticate, provider, isReady: () => options.ready ?? true, now: () => Date.parse("2026-10-03T00:00:00Z"),
  });
  let initialized = false;
  if (options.initialize !== false) {
    if (options.indexFailure) await assert.rejects(api.initialize());
    else { await api.initialize(); initialized = true; }
  }
  const server = createServer(createApp({
    checks: { mongo: async () => true, redis: async () => true }, watchlistRouter: api.router,
    applicationReady: () => initialized && (options.ready ?? true),
  }));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server did not bind");
  try { await run(`http://127.0.0.1:${address.port}`, writes); }
  finally { server.close(); await once(server, "close"); }
}

async function send(base: string, path = "", method = "GET", body?: string, contentType = "application/json") {
  return fetch(`${base}/api/watchlists${path}`, {
    method, headers: { Authorization: "Bearer test", "Content-Type": contentType }, ...(body === undefined ? {} : { body }),
  });
}

async function error(response: globalThis.Response, status: number, message: string) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { error: message });
}

test("watchlist GET returns an empty collection and creation exposes only public fields", async () => {
  await withApi(async (base, writes) => {
    const empty = await send(base);
    assert.equal(empty.status, 200);
    assert.deepEqual(await empty.json(), { data: [] });
    const created = await send(base, "", "POST", JSON.stringify({ name: "  Theo dõi Việt Nam  " }));
    assert.equal(created.status, 201);
    assert.equal(created.headers.get("cache-control"), "no-store");
    const body = await created.json();
    assert.deepEqual(Object.keys(body.data).sort(), ["createdAt", "id", "name", "symbols", "updatedAt"]);
    assert.equal(body.data.name, "Theo dõi Việt Nam");
    assert.deepEqual(body.data.symbols, []);
    assert.equal(body.data.createdAt, "2026-10-03T00:00:00.000Z");
    assert.equal(body.data.updatedAt, body.data.createdAt);
    assert.ok((writes[0]?.userId as ObjectId).equals(ownerId));
  });
});

test("name validation rejects unsafe fields, shapes, controls and codepoint overflow", async () => {
  await withApi(async (base, writes) => {
    const invalid = ["null", "[]", '"name"', "{}", '{"name":3}', '{"name":" "}', '{"name":"ok","userId":"other"}',
      '{"name":"ok","__proto__":{}}', '{"name":"ok","constructor":{}}', '{"name":"ok","prototype":{}}',
      JSON.stringify({ name: "a".repeat(101) }), JSON.stringify({ name: "😀".repeat(101) }),
      JSON.stringify({ name: "\nname" }), JSON.stringify({ name: "na\u0000me" }), JSON.stringify({ name: "na\u0085me" })];
    for (const body of invalid) {
      for (const [method, path] of [["POST", ""], ["PATCH", `/${id}`]]) {
        await error(await send(base, path, method, body), 400, "invalid_request");
      }
    }
    for (const name of ["a", "😀".repeat(100), "a".repeat(100)]) {
      assert.equal((await send(base, "", "POST", JSON.stringify({ name }))).status, 201);
    }
    assert.equal(writes.length, 3);
  });
});

test("JSON routes enforce media, malformed input and the 8kb limit with sanitized errors", async () => {
  await withApi(async (base, writes) => {
    for (const [method, path] of [["POST", ""], ["PATCH", `/${id}`]]) {
      await error(await send(base, path, method, '{"name":', "application/json"), 400, "invalid_json");
      await error(await send(base, path, method, '{"name":"ok"}', "text/plain"), 415, "unsupported_media_type");
      await error(await send(base, path, method, '{"name":"ok"}', "application/json; charset=iso-8859-1"), 415, "unsupported_media_type");
      await error(await send(base, path, method, JSON.stringify({ name: "x".repeat(9000) })), 413, "payload_too_large");
    }
    assert.equal(writes.length, 0);
  });
});

test("all route queries, malformed IDs and noncanonical symbols are rejected", async () => {
  await withApi(async (base, writes) => {
    const routes = [["GET", ""], ["POST", ""], ["PATCH", `/${id}`], ["DELETE", `/${id}`],
      ["PUT", `/${id}/symbols/FPT`], ["DELETE", `/${id}/symbols/FPT`]];
    for (const [method, path] of routes) {
      for (const query of ["?userId=other", "?token=secret", "?name=x&name=y", "?__proto__[id]=x", "?constructor=x"]) {
        await error(await send(base, path + query, method, method === "POST" || method === "PATCH" ? '{"name":"ok"}' : undefined), 400, "invalid_request");
      }
    }
    for (const invalidId of ["bad", "x".repeat(24), "1".repeat(23), "1".repeat(25)]) {
      await error(await send(base, `/${invalidId}`, "PATCH", '{"name":"ok"}'), 400, "invalid_request");
      await error(await send(base, `/${invalidId}`, "DELETE"), 400, "invalid_request");
      await error(await send(base, `/${invalidId}/symbols/FPT`, "PUT"), 400, "invalid_request");
    }
    for (const symbol of ["fpt", "VNINDEX", "UNKNOWN", "FPT%20", "%24where"]) {
      for (const method of ["PUT", "DELETE"]) await error(await send(base, `/${id}/symbols/${symbol}`, method), 400, "invalid_request");
    }
    assert.equal(writes.length, 0);
  });
});

test("bodyless routes reject both content-length and chunked payloads without parsing", async () => {
  await withApi(async (base) => {
    for (const [method, path] of [["DELETE", `/${id}`], ["PUT", `/${id}/symbols/FPT`], ["DELETE", `/${id}/symbols/FPT`]]) {
      await error(await send(base, path, method, '{"userId":"other"}'), 400, "invalid_request");
      await error(await send(base, path, method, "x".repeat(9000), "text/plain"), 400, "invalid_request");
    }
    for (const method of ["GET", "DELETE", "PUT"]) {
      const path = method === "GET" ? "" : method === "DELETE" ? `/${id}` : `/${id}/symbols/FPT`;
      const result = await new Promise<{ status: number | undefined; cache: string | undefined; body: string }>((resolve, reject) => {
        const request = httpRequest(`${base}/api/watchlists${path}`, {
          method, headers: { Authorization: "Bearer test", "Transfer-Encoding": "chunked" },
        }, (response) => {
          let body = "";
          response.on("data", (chunk: Buffer) => { body += chunk.toString(); });
          response.on("end", () => resolve({ status: response.statusCode, cache: response.headers["cache-control"], body }));
        });
        request.on("error", reject);
        request.end('{"userId":"other"}');
      });
      assert.equal(result.status, 400);
      assert.equal(result.cache, "no-store");
      assert.deepEqual(JSON.parse(result.body), { error: "invalid_request" });
    }
  });
});

test("authentication precedes validation and errors are never cached", async () => {
  await withApi(async (base) => {
    const response = await fetch(`${base}/api/watchlists?userId=forged`, { method: "POST", body: "malformed" });
    await error(response, 401, "unauthorized");
  });
});

test("uninitialized catalogs, failed indexes and external readiness keep watchlists unavailable", async () => {
  for (const options of [{ initialize: false }, { ready: false }, { indexFailure: true }]) {
    await withApi(async (base, writes) => {
      await error(await send(base), 503, "not_ready");
      await error(await send(base, "", "POST", '{"name":"ok"}'), 503, "not_ready");
      assert.equal(writes.length, 0);
      assert.equal((await fetch(`${base}/health/live`)).status, 200);
      const readiness = await fetch(`${base}/health/ready`);
      assert.equal(readiness.status, 503);
      assert.deepEqual(await readiness.json(), { status: "not_ready" });
    }, options);
  }
});

test("catalog initialization rejects missing, duplicate or overlarge equity universes", async () => {
  const assets = await createFixtureMarketDataProvider().getAssets();
  const equities = assets.filter((asset) => asset.assetType === "equity");
  for (const invalid of [equities.slice(1), [...equities, { ...equities[0]!, symbol: "EXTRA", assetId: "EXTRA" }],
    [...equities.slice(1), equities[1]!], equities.map((asset, index) => index === 0 ? { ...asset, symbol: "fpt" } : asset)]) {
    const api = createWatchlistApi({
      db: { collection: () => ({ createIndex: async () => { throw new Error("must not create index"); } }) } as unknown as Db,
      authenticate, provider: { getAssets: async () => invalid }, isReady: () => true,
    });
    await assert.rejects(api.initialize(), /catalog unavailable/u);
  }
});

test("database failures return sanitized JSON with no-store", async () => {
  await withApi(async (base) => { await error(await send(base), 500, "internal_error"); }, { failure: true });
});
