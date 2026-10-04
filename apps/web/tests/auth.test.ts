import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { AuthError, authenticate, authErrorMessage, fetchUser, isAuthResponse, isSession, isUser, normalizedEmail, passwordError, revokeSession } from "../src/auth.js";
import { AccountSession, readSession, SESSION_KEY, type SessionStorage } from "../src/auth-session.js";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const now = Date.parse("2026-10-04T00:00:00.000Z");
const session = { token: "A".repeat(43), expiresAt: "2026-10-04T08:00:00.000Z" };
const user = { id: "a".repeat(24), email: "demo@example.com", role: "USER" as const, createdAt: "2026-10-03T00:00:00.000Z" };
const result = { ...session, tokenType: "Bearer", user };
const password = "  mật khẩu 😀 đủ dài  ";
function json(value: unknown, status = 200): Response { return new Response(JSON.stringify(value), { status }); }
function memory(): SessionStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); }, removeItem: (key) => { data.delete(key); } };
}
function stored(storage: SessionStorage): void { storage.setItem(SESSION_KEY, JSON.stringify({ version: 1, ...session })); }
function hasCode(code: string): (error: unknown) => boolean { return (error) => error instanceof AuthError && error.code === code; }

test("guarded invalidation never deletes a replacement tab token or invalidates a different memory token", () => {
  const storage = memory(); stored(storage); const manager = new AccountSession(() => storage, () => now);
  manager.state = { phase: "authenticated", session, user, notice: "", warning: "" };
  manager.invalidate("B".repeat(43)); assert.equal(manager.state.session?.token, session.token);
  const replacement = { ...session, token: "B".repeat(43) };
  storage.setItem(SESSION_KEY, JSON.stringify({ version: 1, ...replacement })); manager.invalidate(session.token);
  assert.equal(manager.state.session, null); assert.deepEqual(readSession(storage, now), replacement); manager.stop();
});

test("email normalization follows backend bounds and password Unicode codepoints preserve spaces", () => {
  assert.equal(normalizedEmail(" Demo@EXAMPLE.COM "), "demo@example.com");
  for (const value of ["", "@example.com", "demo@example", "de mo@example.com", "a".repeat(250) + "@x.co"]) assert.equal(normalizedEmail(value), undefined);
  assert.ok(normalizedEmail("a".repeat(249) + "@x.co"));
  assert.ok(passwordError("a".repeat(14))); assert.equal(passwordError("a".repeat(15)), undefined);
  assert.equal(passwordError("😀".repeat(128)), undefined); assert.ok(passwordError("😀".repeat(129)));
  assert.ok(passwordError("a".repeat(129))); assert.equal(passwordError(password), undefined);
});

test("response guards reject malformed identity, session and impossible calendar dates", () => {
  assert.ok(isSession(session)); assert.ok(isUser(user)); assert.ok(isAuthResponse(result));
  for (const value of [null, [], {}, { ...session, token: "bad" }, { ...session, expiresAt: "2026-02-30T00:00:00.000Z" }]) assert.equal(isSession(value), false);
  for (const value of [{ ...user, id: "bad" }, { ...user, email: " DEMO@example.com " }, { ...user, role: "ADMIN" }, { ...user, createdAt: "yesterday" }]) assert.equal(isUser(value), false);
  assert.equal(isAuthResponse({ ...result, tokenType: "Cookie" }), false);
});

test("credential POST sends only normalized email and unchanged password with fixed no-store URL", async () => {
  for (const mode of ["login", "register"] as const) {
    let calls = 0;
    globalThis.fetch = async (input, init) => {
      calls++; assert.equal(input, `/api/auth/${mode}`); assert.equal(init?.method, "POST");
      assert.equal(init?.cache, "no-store"); assert.equal(init?.credentials, "same-origin"); assert.equal(init?.redirect, "error");
      assert.deepEqual(init?.headers, { "Content-Type": "application/json", Accept: "application/json" });
      assert.deepEqual(JSON.parse(String(init?.body)), { email: user.email, password });
      return json(result, mode === "register" ? 201 : 200);
    };
    assert.deepEqual(await authenticate(mode, " DEMO@EXAMPLE.COM ", password), result); assert.equal(calls, 1);
  }
});

test("authenticated requests carry bearer only in headers and logout does not parse its body", async () => {
  globalThis.fetch = async (input, init) => {
    assert.equal(init?.cache, "no-store"); assert.equal(init?.body, undefined);
    assert.equal(new Headers(init?.headers).get("Authorization"), `Bearer ${session.token}`);
    if (input === "/api/auth/me") { assert.equal(init?.method, "GET"); return json({ user }); }
    assert.equal(input, "/api/auth/logout"); assert.equal(init?.method, "POST");
    assert.equal(new Headers(init?.headers).has("Content-Type"), false);
    return new Response(null, { status: 204 });
  };
  assert.deepEqual(await fetchUser(session.token), user); await revokeSession(session.token);
});

test("API status errors map by operation without replaying credential POST", async () => {
  for (const [status, code] of [[400, "input"], [401, "credentials"], [409, "duplicate"], [429, "limited"], [503, "unavailable"], [500, "unavailable"], [202, "invalid"]] as const) {
    let calls = 0; globalThis.fetch = async () => { calls++; return json({ error: "sensitive raw text" }, status); };
    await assert.rejects(authenticate("login", user.email, password), hasCode(code)); assert.equal(calls, 1);
    assert.equal(authErrorMessage(new AuthError(code)).includes("sensitive"), false);
  }
  globalThis.fetch = async () => json({}, 401);
  await assert.rejects(fetchUser(session.token), hasCode("session"));
  await assert.rejects(revokeSession(session.token), hasCode("session"));
});

test("invalid JSON, malformed success and network errors expose safe errors", async () => {
  globalThis.fetch = async () => new Response("not-json", { status: 200 });
  await assert.rejects(authenticate("login", user.email, password), hasCode("invalid"));
  globalThis.fetch = async () => json({ ...result, user: null });
  await assert.rejects(authenticate("login", user.email, password), hasCode("invalid"));
  globalThis.fetch = async () => { throw new Error("secret host/token"); };
  await assert.rejects(authenticate("login", user.email, password), hasCode("network"));
  assert.match(authErrorMessage(new AuthError("timeout"), "register"), /có thể đã được tạo/u);
});

test("timeout and caller abort cancel requests even if transport never settles", async () => {
  let signal: AbortSignal | undefined;
  globalThis.fetch = (_input, init) => { signal = init?.signal ?? undefined; return new Promise<Response>(() => {}); };
  await assert.rejects(fetchUser(session.token, undefined, 5), hasCode("timeout")); assert.equal(signal?.aborted, true);
  const controller = new AbortController(); const pending = fetchUser(session.token, controller.signal); controller.abort();
  await assert.rejects(pending, hasCode("aborted")); assert.equal(signal?.aborted, true);
  let calls = 0; globalThis.fetch = async () => { calls++; return json({ user }); };
  await assert.rejects(fetchUser(session.token, controller.signal), hasCode("aborted")); assert.equal(calls, 0);
});

test("invalid credentials are rejected before network access", async () => {
  globalThis.fetch = async () => { throw new Error("must not fetch"); };
  await assert.rejects(authenticate("register", "invalid", password), hasCode("input"));
  await assert.rejects(authenticate("login", user.email, "short"), hasCode("input"));
});

test("storage accepts only versioned token/expiry and discards corrupt, expired or identity-bearing data", () => {
  const storage = memory(); assert.equal(readSession(storage, now), null); stored(storage);
  assert.deepEqual(readSession(storage, now), session);
  for (const value of ["{broken", JSON.stringify(session), JSON.stringify({ version: 2, ...session }), JSON.stringify({ version: 1, ...session, user }), JSON.stringify({ version: 1, ...session, expiresAt: new Date(now).toISOString() })]) {
    storage.setItem(SESSION_KEY, value); assert.equal(readSession(storage, now), null); assert.equal(storage.data.has(SESSION_KEY), false);
  }
});

test("restore reveals no cached identity until server me validates it", async () => {
  const storage = memory(); stored(storage); const manager = new AccountSession(() => storage, () => now);
  let finish!: (response: Response) => void;
  globalThis.fetch = () => new Promise<Response>((resolve) => { finish = resolve; });
  try {
    const pending = manager.start(); assert.equal(manager.state.phase, "checking"); assert.equal(manager.state.user, null);
    finish(json({ user })); await pending; assert.equal(manager.state.phase, "authenticated"); assert.deepEqual(manager.state.user, user);
  } finally { manager.stop(); }
});

test("restore failures retain token and block credential overwrite; explicit verify retry succeeds", async () => {
  const storage = memory(); stored(storage); const manager = new AccountSession(() => storage, () => now);
  try {
    let calls = 0; globalThis.fetch = async () => { calls++; return json({}, 503); };
    await manager.start(); assert.equal(manager.state.phase, "unverified"); assert.equal(manager.state.user, null);
    assert.deepEqual(manager.state.session, session); assert.ok(storage.data.has(SESSION_KEY));
    await manager.signIn("login", user.email, password); assert.equal(calls, 1);
    globalThis.fetch = async () => json({ user }); await manager.verify(); assert.equal(manager.state.phase, "authenticated");
  } finally { manager.stop(); }
});

test("unauthorized restore clears the session", async () => {
  const storage = memory(); stored(storage); const manager = new AccountSession(() => storage, () => now);
  try { globalThis.fetch = async () => json({}, 401); await manager.start(); assert.equal(manager.state.session, null); assert.equal(storage.data.has(SESSION_KEY), false); }
  finally { manager.stop(); }
});

test("storage unavailable before POST blocks credentials", async () => {
  let calls = 0; globalThis.fetch = async () => { calls++; return json(result); };
  const manager = new AccountSession(() => { throw new Error("denied"); }, () => now);
  await manager.start(); await manager.signIn("login", user.email, password);
  assert.equal(calls, 0); assert.equal(manager.state.phase, "guest"); assert.match(manager.state.notice, /quyền riêng tư/u);
  const storage = memory(); storage.setItem = () => { throw new Error("quota"); };
  const other = new AccountSession(() => storage, () => now); await other.start(); await other.signIn("register", user.email, password); assert.equal(calls, 0);
});

test("late storage write failure retains memory session and revocation handle", async () => {
  const storage = memory(); const setItem = storage.setItem;
  storage.setItem = (key, value) => { if (key === SESSION_KEY) throw new Error("quota"); setItem(key, value); };
  const manager = new AccountSession(() => storage, () => now);
  try {
    globalThis.fetch = async () => json(result); await manager.start(); await manager.signIn("login", user.email, password);
    assert.equal(manager.state.phase, "authenticated"); assert.deepEqual(manager.state.session, session); assert.match(manager.state.warning, /bộ nhớ/u);
    globalThis.fetch = async () => new Response(null, { status: 204 }); await manager.signOut(); assert.equal(manager.state.session, null);
  } finally { manager.stop(); }
});

test("login persists only version, token and expiry", async () => {
  const storage = memory(); const manager = new AccountSession(() => storage, () => now);
  try { globalThis.fetch = async () => json(result); await manager.start(); await manager.signIn("login", user.email, password);
    assert.deepEqual(JSON.parse(storage.data.get(SESSION_KEY)!), { version: 1, ...session }); assert.equal(storage.data.size, 1);
  } finally { manager.stop(); }
});

test("failed logout retains session until 204 or already-invalid 401", async () => {
  for (const completion of [204, 401]) {
    const storage = memory(); stored(storage); const manager = new AccountSession(() => storage, () => now);
    try {
      globalThis.fetch = async () => json({ user }); await manager.start();
      globalThis.fetch = async () => json({}, 503); await manager.signOut(); assert.deepEqual(manager.state.session, session); assert.ok(storage.data.has(SESSION_KEY));
      assert.match(manager.state.notice, /Chưa xác nhận đăng xuất/u);
      globalThis.fetch = async () => completion === 204 ? new Response(null, { status: 204 }) : json({}, 401);
      await manager.signOut(); assert.equal(manager.state.session, null); assert.equal(storage.data.has(SESSION_KEY), false);
    } finally { manager.stop(); }
  }
});

test("clock check expires session immediately and stale verification cannot restore identity", async () => {
  let clock = now; const storage = memory(); stored(storage); const manager = new AccountSession(() => storage, () => clock);
  let finish!: (response: Response) => void;
  globalThis.fetch = () => new Promise<Response>((resolve) => { finish = resolve; });
  try {
    const pending = manager.start(); clock = Date.parse(session.expiresAt); assert.equal(manager.checkExpiry(), true);
    finish(json({ user })); await pending; assert.equal(manager.state.session, null); assert.equal(manager.state.user, null); assert.match(manager.state.notice, /hết hạn/u);
  } finally { manager.stop(); }
});

test("stop/start suppresses stale response across StrictMode cleanup", async () => {
  const storage = memory(); stored(storage); const manager = new AccountSession(() => storage, () => now);
  const finishes: Array<(response: Response) => void> = [];
  globalThis.fetch = () => new Promise<Response>((resolve) => { finishes.push(resolve); });
  try {
    const first = manager.start(); manager.stop(); const second = manager.start();
    finishes[0](json({ user: { ...user, email: "old@example.com" } })); finishes[1](json({ user }));
    await Promise.all([first, second]); assert.deepEqual(manager.state.user, user);
  } finally { manager.stop(); }
});
