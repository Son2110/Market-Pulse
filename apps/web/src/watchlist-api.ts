import { validDate } from "./auth.js";

export const WATCHLIST_SYMBOLS = ["BID", "FPT", "HPG", "MSN", "MWG", "SSI", "VCB", "VHM", "VIC", "VNM"] as const;
export interface Watchlist { id: string; name: string; symbols: string[]; createdAt: string; updatedAt: string }
export type WatchlistMutation = { kind: "create"; name: string } | { kind: "rename"; id: string; name: string }
  | { kind: "delete"; id: string } | { kind: "add" | "remove"; id: string; symbol: string };
export type WatchlistErrorCode = "input" | "session" | "missing" | "exists" | "unavailable" | "invalid" | "network" | "timeout" | "aborted";
export class WatchlistError extends Error {
  constructor(public readonly code: WatchlistErrorCode) { super(code); }
}
export function watchlistName(value: string): string | undefined {
  if (/\p{Cc}/u.test(value)) return undefined;
  const name = value.trim(), length = Array.from(name).length;
  return length >= 1 && length <= 100 ? name : undefined;
}
export function isWatchlistSymbol(value: unknown): value is string {
  return typeof value === "string" && (WATCHLIST_SYMBOLS as readonly string[]).includes(value);
}
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
export function isWatchlist(value: unknown): value is Watchlist {
  return record(value) && Object.keys(value).length === 5 && typeof value.id === "string" && /^[a-f0-9]{24}$/u.test(value.id)
    && typeof value.name === "string" && watchlistName(value.name) === value.name
    && validDate(value.createdAt) && validDate(value.updatedAt) && value.createdAt <= value.updatedAt
    && Array.isArray(value.symbols) && value.symbols.length <= 10
    && value.symbols.every((symbol, index, symbols) => isWatchlistSymbol(symbol) && (index === 0 || symbols[index - 1] < symbol));
}
export function isWatchlistsResponse(value: unknown): value is { data: Watchlist[] } {
  return record(value) && Object.keys(value).length === 1 && Array.isArray(value.data) && value.data.length <= 1 && value.data.every(isWatchlist);
}

async function request(token: string, mutation: WatchlistMutation | null, signal: AbortSignal, timeoutMs: number): Promise<Watchlist | null> {
  if (signal.aborted) throw new WatchlistError("aborted");
  if (!/^[A-Za-z0-9_-]{43}$/u.test(token)) throw new WatchlistError("input");
  let path = "/api/watchlists", method = "GET", body: string | undefined;
  if (mutation) {
    if (mutation.kind !== "create") {
      if (!/^[a-f0-9]{24}$/u.test(mutation.id)) throw new WatchlistError("input");
      path += `/${mutation.id}`;
    }
    if (mutation.kind === "create" || mutation.kind === "rename") {
      const name = watchlistName(mutation.name);
      if (!name) throw new WatchlistError("input");
      body = JSON.stringify({ name }); method = mutation.kind === "create" ? "POST" : "PATCH";
    } else if (mutation.kind === "delete") method = "DELETE";
    else {
      if (!isWatchlistSymbol(mutation.symbol)) throw new WatchlistError("input");
      path += `/symbols/${mutation.symbol}`; method = mutation.kind === "add" ? "PUT" : "DELETE";
    }
  }
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel: (() => void) | undefined;
  const interrupted = new Promise<never>((_resolve, reject) => {
    cancel = () => { controller.abort(); reject(new WatchlistError("aborted")); };
    signal.addEventListener("abort", cancel, { once: true });
    timer = setTimeout(() => { controller.abort(); reject(new WatchlistError("timeout")); }, timeoutMs);
  });
  try {
    return await Promise.race([interrupted, (async () => {
      const headers: Record<string, string> = { Accept: "application/json", Authorization: `Bearer ${token}` };
      if (body !== undefined) headers["Content-Type"] = "application/json";
      const response = await fetch(path, { method, headers, ...(body !== undefined ? { body } : {}), signal: controller.signal, cache: "no-store", credentials: "same-origin", redirect: "error" });
      const expected = mutation?.kind === "create" ? 201 : mutation?.kind === "delete" ? 204 : 200;
      if (response.status !== expected) throw new WatchlistError(response.status === 401 ? "session" : response.status === 400 ? "input"
        : response.status === 404 ? "missing" : response.status === 409 ? "exists" : response.status >= 500 ? "unavailable" : "invalid");
      if (expected === 204) return null;
      let value: unknown;
      try { value = await response.json(); } catch { throw new WatchlistError("invalid"); }
      if (!mutation) {
        if (!isWatchlistsResponse(value)) throw new WatchlistError("invalid");
        return value.data[0] ?? null;
      }
      if (!record(value) || Object.keys(value).length !== 1 || !isWatchlist(value.data)) throw new WatchlistError("invalid");
      const list = value.data;
      if (mutation.kind !== "create" && list.id !== mutation.id) throw new WatchlistError("invalid");
      if ((mutation.kind === "create" || mutation.kind === "rename") && list.name !== watchlistName(mutation.name)) throw new WatchlistError("invalid");
      if (mutation.kind === "create" && list.symbols.length !== 0) throw new WatchlistError("invalid");
      if ((mutation.kind === "add" && !list.symbols.includes(mutation.symbol)) || (mutation.kind === "remove" && list.symbols.includes(mutation.symbol))) throw new WatchlistError("invalid");
      return list;
    })()]);
  } catch (error) {
    if (error instanceof WatchlistError) throw error;
    throw new WatchlistError(signal.aborted ? "aborted" : "network");
  } finally { clearTimeout(timer); if (cancel) signal.removeEventListener("abort", cancel); }
}
export function fetchWatchlist(token: string, signal: AbortSignal, timeoutMs = 10_000): Promise<Watchlist | null> { return request(token, null, signal, timeoutMs); }
export function mutateWatchlist(token: string, mutation: WatchlistMutation, signal: AbortSignal, timeoutMs = 10_000): Promise<Watchlist | null> { return request(token, mutation, signal, timeoutMs); }
export function watchlistErrorMessage(error: unknown): string {
  const code = error instanceof WatchlistError ? error.code : "network";
  return code === "input" ? "Tên cần 1–100 ký tự, không chứa ký tự điều khiển; mã phải thuộc danh mục demo."
    : code === "session" ? "Phiên không còn hiệu lực. Vui lòng đăng nhập lại."
      : code === "timeout" ? "Yêu cầu quá thời gian chờ."
        : code === "invalid" ? "Phản hồi danh sách không hợp lệ."
          : code === "missing" || code === "exists" ? "Danh sách đã thay đổi trên máy chủ."
            : code === "unavailable" ? "Dịch vụ danh sách tạm thời chưa sẵn sàng." : "Không thể kết nối dịch vụ danh sách.";
}
