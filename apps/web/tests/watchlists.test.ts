import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { readFileSync } from "node:fs";
import { AccountSession, SESSION_KEY, type SessionStorage } from "../src/auth-session.js";
import { fetchWatchlist, mutateWatchlist, isWatchlist, isWatchlistsResponse, watchlistName, WATCHLIST_SYMBOLS, WatchlistError, type Watchlist } from "../src/watchlist-api.js";
import { WatchlistSession, type WatchlistServices } from "../src/watchlist-session.js";
import type { HistoryResponse } from "../src/stock-detail.js";
import type { SearchResponse } from "../src/stock-search.js";
import { isWatchlistsRoute } from "../src/Watchlists.js";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const now = Date.parse("2026-10-04T00:00:00.000Z");
const token = "A".repeat(43), id = "a".repeat(24);
const user = { id, email: "demo@example.com", role: "USER" as const, createdAt: "2026-10-03T00:00:00.000Z" };
const list: Watchlist = { id: "b".repeat(24), name: "Theo dõi", symbols: ["FPT"], createdAt: "2026-10-03T00:00:00.000Z", updatedAt: "2026-10-04T00:00:00.000Z" };
function json(value: unknown, status = 200): Response { return new Response(JSON.stringify(value), { status }); }
const signal = () => new AbortController().signal;
const hasCode = (code: string) => (error: unknown) => error instanceof WatchlistError && error.code === code;
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
async function settle() { await new Promise<void>((resolve) => setImmediate(resolve)); }
function history(): HistoryResponse {
  const fixture = JSON.parse(readFileSync(new URL("../../../fixtures/market/mp-02-synthetic.json", import.meta.url), "utf8")) as HistoryResponse["data"];
  return { data: { ...fixture, assets: [fixture.assets[0]], candles: fixture.candles.filter((candle) => candle.assetId === "VN:HOSE:FPT"), quotes: [], indexObservations: [] }, meta: { status: "available", provider: "marketpulse-fixture", interval: "1d", requestedRange: { from: null, to: null }, availableRange: { from: "2026-09-21", to: "2026-09-23" }, asOf: "2026-09-23T15:00:00+07:00" } };
}
const searchResult: SearchResponse = { data: [], meta: { scope: "fixture equities", dataset: "fixture / unknown", label: "SYNTHETIC FIXTURE — NOT MARKET DATA", provider: "marketpulse-fixture", asOf: null } };
function setup(services: Partial<WatchlistServices> = {}, clock: () => number = () => now) {
  const data = new Map<string, string>();
  const storage: SessionStorage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); }, removeItem: (key) => { data.delete(key); } };
  const account = new AccountSession(() => storage, clock);
  account.state = { phase: "authenticated", session: { token, expiresAt: "2026-10-04T08:00:00.000Z" }, user, notice: "", warning: "" };
  const manager = new WatchlistSession(account, { read: async () => list, write: async () => list, search: async () => searchResult, history: async () => history(), ...services });
  const unsubscribe = account.subscribe((state) => manager.acceptAccount(state));
  return { account, manager, storage, data, stop: () => { unsubscribe(); manager.stop(); account.stop(); } };
}

test("watchlist route accepts only exact slash variants", () => {
  for (const path of ["/watchlists", "/watchlists/"]) assert.equal(isWatchlistsRoute(path), true);
  for (const path of ["/watchlists/a", "/watchlists//", "/Watchlists", "/watchlists%2F"]) assert.equal(isWatchlistsRoute(path), false);
});
test("names use Unicode codepoint bounds and reject controls before trimming", () => {
  assert.equal(watchlistName("  Theo dõi 😀  "), "Theo dõi 😀"); assert.ok(watchlistName("😀".repeat(100)));
  for (const name of ["", " ", "😀".repeat(101), "a".repeat(101), "\tTên", "Tên\n", "a\u0000b", "Tên\u007f"]) assert.equal(watchlistName(name), undefined);
});
test("response guards enforce cardinality, complete public shape, chronology and canonical sorted unique capacity", () => {
  assert.ok(isWatchlist(list)); assert.ok(isWatchlistsResponse({ data: [list] })); assert.ok(isWatchlistsResponse({ data: [] }));
  assert.ok(isWatchlist({ ...list, symbols: [...WATCHLIST_SYMBOLS] }));
  for (const value of [null, [], {}, { data: null }, { data: [list, list] }, { data: [list], owner: id }]) assert.equal(isWatchlistsResponse(value), false);
  for (const value of [{ ...list, id: "bad" }, { ...list, userId: id }, { ...list, name: " Name " }, { ...list, createdAt: "2026-02-30T00:00:00.000Z" }, { ...list, updatedAt: "2026-10-02T00:00:00.000Z" }, { ...list, symbols: ["fpt"] }, { ...list, symbols: ["VNINDEX"] }, { ...list, symbols: ["ABC"] }, { ...list, symbols: ["VCB", "FPT"] }, { ...list, symbols: ["FPT", "FPT"] }, { ...list, symbols: [...WATCHLIST_SYMBOLS, "VNM"] }]) assert.equal(isWatchlist(value), false);
});
test("private requests use exact methods paths headers JSON only when needed and no-store", async () => {
  const cases = [
    { mutation: null, path: "", method: "GET", status: 200, response: { data: [list] }, body: undefined },
    { mutation: { kind: "create", name: " Theo dõi " } as const, path: "", method: "POST", status: 201, response: { data: { ...list, symbols: [] } }, body: { name: "Theo dõi" } },
    { mutation: { kind: "rename", id: list.id, name: " Mới " } as const, path: `/${list.id}`, method: "PATCH", status: 200, response: { data: { ...list, name: "Mới" } }, body: { name: "Mới" } },
    { mutation: { kind: "delete", id: list.id } as const, path: `/${list.id}`, method: "DELETE", status: 204, response: null, body: undefined },
    { mutation: { kind: "add", id: list.id, symbol: "VCB" } as const, path: `/${list.id}/symbols/VCB`, method: "PUT", status: 200, response: { data: { ...list, symbols: ["FPT", "VCB"] } }, body: undefined },
    { mutation: { kind: "remove", id: list.id, symbol: "FPT" } as const, path: `/${list.id}/symbols/FPT`, method: "DELETE", status: 200, response: { data: { ...list, symbols: [] } }, body: undefined },
  ];
  for (const item of cases) {
    let calls = 0;
    globalThis.fetch = async (input, init) => {
      calls++; assert.equal(input, `/api/watchlists${item.path}`); assert.equal(init?.method, item.method); assert.equal(init?.cache, "no-store"); assert.equal(init?.redirect, "error"); assert.equal(init?.credentials, "same-origin");
      const headers = new Headers(init?.headers); assert.equal(headers.get("Authorization"), `Bearer ${token}`); assert.equal(headers.get("Accept"), "application/json");
      if (item.body) { assert.equal(headers.get("Content-Type"), "application/json"); assert.deepEqual(JSON.parse(String(init?.body)), item.body); }
      else { assert.equal(headers.has("Content-Type"), false); assert.equal(init?.body, undefined); }
      return item.status === 204 ? new Response(null, { status: 204 }) : json(item.response, item.status);
    };
    const result = item.mutation ? await mutateWatchlist(token, item.mutation, signal()) : await fetchWatchlist(token, signal());
    assert.equal(result?.id ?? null, item.status === 204 ? null : list.id); assert.equal(calls, 1);
  }
});
test("request status failures are classified without automatic write retries", async () => {
  for (const [status, code] of [[400, "input"], [401, "session"], [404, "missing"], [409, "exists"], [500, "unavailable"], [503, "unavailable"], [202, "invalid"]] as const) {
    let calls = 0; globalThis.fetch = async () => { calls++; return json({ error: "private raw payload" }, status); };
    await assert.rejects(mutateWatchlist(token, { kind: "delete", id: list.id }, signal()), hasCode(code)); assert.equal(calls, 1);
  }
});
test("malformed successes wrong returned IDs and unapplied operations are ambiguous invalid responses", async () => {
  for (const value of [{ data: { ...list, id: "c".repeat(24) } }, { data: list }, { data: null }]) {
    globalThis.fetch = async () => json(value); await assert.rejects(mutateWatchlist(token, { kind: "rename", id: list.id, name: "Mới" }, signal()), hasCode("invalid"));
  }
  globalThis.fetch = async () => new Response("not-json"); await assert.rejects(fetchWatchlist(token, signal()), hasCode("invalid"));
  globalThis.fetch = async () => json({ data: list }); await assert.rejects(mutateWatchlist(token, { kind: "add", id: list.id, symbol: "VCB" }, signal()), hasCode("invalid"));
});
test("invalid paths symbols and names reject before network", async () => {
  let calls = 0; globalThis.fetch = async () => { calls++; return json({}); };
  await assert.rejects(mutateWatchlist(token, { kind: "delete", id: "../owner" }, signal()), hasCode("input"));
  for (const symbol of ["fpt", "FPT?x=1", "VNINDEX", "ABC"]) await assert.rejects(mutateWatchlist(token, { kind: "add", id: list.id, symbol }, signal()), hasCode("input"));
  await assert.rejects(mutateWatchlist(token, { kind: "create", name: "\nTên" }, signal()), hasCode("input")); assert.equal(calls, 0);
});
test("timeout and cancellation settle even when transport ignores abort", async () => {
  let requestSignal: AbortSignal | null | undefined;
  globalThis.fetch = (_input, init) => { requestSignal = init?.signal; return new Promise<Response>(() => {}); };
  await assert.rejects(fetchWatchlist(token, signal(), 5), hasCode("timeout")); assert.equal(requestSignal?.aborted, true);
  const controller = new AbortController(); const pending = fetchWatchlist(token, controller.signal); controller.abort(); await assert.rejects(pending, hasCode("aborted")); assert.equal(requestSignal?.aborted, true);
  let calls = 0; globalThis.fetch = async () => { calls++; return json({ data: [] }); }; await assert.rejects(fetchWatchlist(token, controller.signal), hasCode("aborted")); assert.equal(calls, 0);
});
test("unverified account never sends a private request", async () => {
  let calls = 0; const env = setup({ read: async () => { calls++; return list; } });
  try { await settle(); assert.equal(calls, 1); env.account.state = { ...env.account.state, phase: "unverified", user: null }; env.manager.acceptAccount(env.account.state); await env.manager.load(); await env.manager.mutate({ kind: "delete", id: list.id }); assert.equal(calls, 1); assert.equal(env.manager.state.list, null); } finally { env.stop(); }
});
test("single synchronous mutation lock prevents double-click writes", async () => {
  const write = deferred<Watchlist | null>(); let calls = 0; const env = setup({ write: async () => { calls++; return write.promise; } });
  try { await settle(); const first = env.manager.mutate({ kind: "delete", id: list.id }); const second = env.manager.mutate({ kind: "rename", id: list.id, name: "Next" }); assert.equal(calls, 1); assert.equal(env.manager.state.busy, true); write.resolve(null); await Promise.all([first, second]); assert.equal(env.manager.state.list, null); } finally { env.stop(); }
});
for (const code of ["network", "timeout", "invalid", "unavailable", "missing", "exists"] as const) test(`${code} write withholds old list until successful read reconciliation`, async () => {
  const read = deferred<Watchlist | null>(); let reads = 0, writes = 0;
  const env = setup({ read: async () => ++reads === 1 ? list : read.promise, write: async () => { writes++; throw new WatchlistError(code); } });
  try { await settle(); const pending = env.manager.mutate({ kind: "remove", id: list.id, symbol: "FPT" }); await settle(); assert.equal(env.manager.state.phase, "reconciling"); assert.equal(env.manager.state.list, null); assert.deepEqual(env.manager.state.rows, {}); await env.manager.mutate({ kind: "create", name: "No" }); assert.equal(writes, 1); read.resolve({ ...list, symbols: [] }); await pending; assert.equal(env.manager.state.phase, "ready"); assert.deepEqual((env.manager.state.list as Watchlist | null)?.symbols, []); assert.equal(reads, 2); } finally { env.stop(); }
});
test("failed reconciliation blocks writes until explicit read succeeds", async () => {
  let reads = 0, writes = 0; const env = setup({ read: async () => { if (++reads === 2) throw new WatchlistError("network"); return list; }, write: async () => { writes++; throw new WatchlistError("timeout"); } });
  try { await settle(); await env.manager.mutate({ kind: "delete", id: list.id }); assert.equal(env.manager.state.phase, "error"); assert.equal(env.manager.state.list, null); await env.manager.mutate({ kind: "create", name: "No" }); assert.equal(writes, 1); await env.manager.load(); assert.equal(env.manager.state.phase, "ready"); assert.equal(reads, 3); } finally { env.stop(); }
});
test("definitive input rejection preserves list without a read or success notice", async () => {
  let reads = 0; const env = setup({ read: async () => { reads++; return list; }, write: async () => { throw new WatchlistError("input"); } });
  try { await settle(); await env.manager.mutate({ kind: "rename", id: list.id, name: "bad" }); assert.equal(env.manager.state.list, list); assert.equal(env.manager.state.busy, false); assert.equal(reads, 1); assert.match(env.manager.state.notice, /1–100/u); } finally { env.stop(); }
});
test("private 401 invalidates only issuing token and clears all private state", async () => {
  const env = setup({ write: async () => { throw new WatchlistError("session"); } });
  try { await settle(); env.storage.setItem(SESSION_KEY, JSON.stringify({ version: 1, token: "B".repeat(43), expiresAt: "2026-10-04T08:00:00.000Z" })); await env.manager.mutate({ kind: "delete", id: list.id }); assert.equal(env.account.state.phase, "guest"); assert.equal(env.manager.state.list, null); assert.deepEqual(env.manager.state.rows, {}); assert.ok(env.data.get(SESSION_KEY)?.includes("B".repeat(43))); } finally { env.stop(); }
});
test("late list and unauthorized write replies cannot affect replacement owner token", async () => {
  const oldRead = deferred<Watchlist | null>(); let reads = 0; const oldWrite = deferred<Watchlist | null>();
  const env = setup({ read: async () => ++reads === 1 ? oldRead.promise : { ...list, name: "B" }, write: async () => oldWrite.promise });
  try {
    env.account.state = { ...env.account.state, session: { token: "B".repeat(43), expiresAt: "2026-10-04T08:00:00.000Z" }, user: { ...user, id: "c".repeat(24) } }; env.manager.acceptAccount(env.account.state); await settle(); oldRead.resolve(list); await settle(); assert.equal(env.manager.state.list?.name, "B");
    const pending = env.manager.mutate({ kind: "delete", id: list.id }); env.account.state = { ...env.account.state, session: { token: "C".repeat(43), expiresAt: "2026-10-04T08:00:00.000Z" }, user: { ...user, id: "d".repeat(24) } }; env.manager.acceptAccount(env.account.state); await settle(); oldWrite.reject(new WatchlistError("session")); await pending; assert.equal(env.account.state.session?.token, "C".repeat(43)); assert.equal(env.manager.state.list?.name, "B");
  } finally { env.stop(); }
});
test("expiry clears rows and late reads cannot restore the list", async () => {
  let clock = now; const read = deferred<Watchlist | null>(); const env = setup({ read: async () => read.promise }, () => clock);
  try { clock = Date.parse("2026-10-04T08:00:00.000Z"); read.resolve(list); await settle(); assert.equal(env.account.state.phase, "guest"); assert.equal(env.manager.state.list, null); assert.deepEqual(env.manager.state.rows, {}); } finally { env.stop(); }
});
test("logout and page teardown ignore late list row and search callbacks", async () => {
  for (const logout of [false, true]) {
    const row = deferred<HistoryResponse>(), search = deferred<SearchResponse>(); const env = setup({ history: async () => row.promise, search: async () => search.promise });
    try { await settle(); const pending = env.manager.search("FPT"); if (logout) env.account.invalidate(token); else env.manager.stop(); row.resolve(history()); search.resolve(searchResult); await pending; await settle(); assert.equal(env.manager.state.phase, "blocked"); assert.equal(env.manager.state.list, null); assert.equal(env.manager.state.search.response, null); assert.deepEqual(env.manager.state.rows, {}); } finally { env.stop(); }
  }
});
test("removed symbols cannot reappear through late row replies", async () => {
  const row = deferred<HistoryResponse>(); const env = setup({ history: async () => row.promise, write: async () => ({ ...list, symbols: [] }) });
  try { await settle(); await env.manager.mutate({ kind: "remove", id: list.id, symbol: "FPT" }); row.resolve(history()); await settle(); assert.deepEqual(env.manager.state.rows, {}); assert.deepEqual(env.manager.state.list?.symbols, []); } finally { env.stop(); }
});
test("delete and recreate abort old search and row replies even under the same identity", async () => {
  const row = deferred<HistoryResponse>(), search = deferred<SearchResponse>(); let writes = 0;
  const env = setup({ history: async () => row.promise, search: async () => search.promise, write: async () => ++writes === 1 ? null : { ...list, id: "d".repeat(24), symbols: [] } });
  try { await settle(); const pending = env.manager.search("FPT"); await env.manager.mutate({ kind: "delete", id: list.id }); await env.manager.mutate({ kind: "create", name: list.name }); row.resolve(history()); search.resolve(searchResult); await pending; await settle(); assert.equal(env.manager.state.list?.id, "d".repeat(24)); assert.equal(env.manager.state.search.phase, "initial"); assert.deepEqual(env.manager.state.rows, {}); } finally { env.stop(); }
});
test("row errors are independent and explicit retry can return no observations", async () => {
  let calls = 0; const empty = history(); empty.data.candles = []; empty.meta.status = "no_data"; empty.meta.asOf = null;
  const env = setup({ history: async () => { if (++calls === 1) throw new Error("private raw error"); return empty; } });
  try { await settle(); assert.equal(env.manager.state.phase, "ready"); assert.equal(env.manager.state.rows.FPT.phase, "error"); assert.equal(env.manager.state.rows.FPT.message.includes("private"), false); await env.manager.loadRow("FPT"); assert.equal(env.manager.state.rows.FPT.phase, "ready"); assert.deepEqual(env.manager.state.rows.FPT.response?.data.candles, []); } finally { env.stop(); }
});
