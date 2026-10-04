import type { AccountSession, AccountState } from "./auth-session.js";
import { fetchHistory, detailErrorMessage, type HistoryResponse } from "./stock-detail.js";
import { fetchSearch, errorMessage, queryError, type SearchResponse } from "./stock-search.js";
import { fetchWatchlist, mutateWatchlist, WatchlistError, watchlistErrorMessage, type Watchlist, type WatchlistMutation } from "./watchlist-api.js";

export interface WatchlistState {
  phase: "blocked" | "loading" | "ready" | "error" | "reconciling";
  list: Watchlist | null; busy: boolean; notice: string;
  search: { phase: "initial" | "loading" | "ready" | "error"; query: string; response: SearchResponse | null; message: string };
  rows: Record<string, { phase: "loading" | "ready" | "error"; response: HistoryResponse | null; message: string }>;
}
const empty = (): WatchlistState => ({ phase: "blocked", list: null, busy: false, notice: "", search: { phase: "initial", query: "", response: null, message: "" }, rows: {} });
export interface WatchlistServices { read: typeof fetchWatchlist; write: typeof mutateWatchlist; search: typeof fetchSearch; history: typeof fetchHistory }
export class WatchlistSession {
  state = empty();
  private listeners = new Set<(state: WatchlistState) => void>();
  private identity: { token: string; owner: string } | null = null;
  private generation = 0;
  private controllers = new Set<AbortController>();
  private searchController: AbortController | null = null;
  private rowControllers = new Map<string, AbortController>();
  constructor(private readonly account: AccountSession, private readonly services: WatchlistServices = { read: fetchWatchlist, write: mutateWatchlist, search: fetchSearch, history: fetchHistory }) {}
  subscribe(listener: (state: WatchlistState) => void): () => void { this.listeners.add(listener); listener(this.state); return () => { this.listeners.delete(listener); }; }
  private update(patch: Partial<WatchlistState>): void { this.state = { ...this.state, ...patch }; for (const listener of this.listeners) listener(this.state); }
  stop(): void {
    this.generation++; for (const controller of this.controllers) controller.abort(); this.controllers.clear();
    this.rowControllers.clear(); this.searchController = null; this.identity = null; this.update(empty());
  }
  acceptAccount(state: AccountState): void {
    const identity = state.phase === "authenticated" && state.session && state.user ? { token: state.session.token, owner: state.user.id } : null;
    if (!identity) { this.stop(); return; }
    if (identity.token === this.identity?.token && identity.owner === this.identity.owner) return;
    this.stop(); this.identity = identity; void this.load();
  }
  private current(generation: number): boolean {
    if (generation !== this.generation || !this.identity) return false;
    if (this.account.checkExpiry()) return false;
    const state = this.account.state;
    return state.phase === "authenticated" && state.session?.token === this.identity.token && state.user?.id === this.identity.owner;
  }
  private controller(): AbortController { const controller = new AbortController(); this.controllers.add(controller); return controller; }
  private sessionError(error: unknown, token: string): boolean {
    if (error instanceof WatchlistError && error.code === "session") { this.account.invalidate(token); return true; }
    return false;
  }
  private commit(list: Watchlist | null, notice: string): void {
    this.searchController?.abort(); this.searchController = null;
    for (const controller of this.rowControllers.values()) { controller.abort(); this.controllers.delete(controller); }
    this.rowControllers.clear();
    this.update({ list, phase: "ready", busy: false, rows: {}, notice, search: empty().search });
    for (const symbol of list?.symbols ?? []) void this.loadRow(symbol);
  }
  async load(reconcile = false): Promise<void> {
    const generation = this.generation;
    if (!this.current(generation) || (this.state.busy && !reconcile)) return;
    const token = this.identity!.token, controller = this.controller();
    this.searchController?.abort(); this.searchController = null;
    this.update({ phase: reconcile ? "reconciling" : "loading", list: null, rows: {}, busy: true, notice: reconcile ? "Chưa xác nhận thay đổi. Đang đọc lại danh sách từ máy chủ…" : "Đang tải danh sách…" });
    try {
      const list = await this.services.read(token, controller.signal);
      if (this.current(generation)) this.commit(list, reconcile ? "Đã đọc lại danh sách. Hãy kiểm tra kết quả trước khi thao tác tiếp." : "Đã tải danh sách.");
    } catch (error) {
      if (!this.current(generation)) return;
      if (!this.sessionError(error, token)) this.update({ phase: "error", busy: false, list: null, rows: {}, notice: `${watchlistErrorMessage(error)} Hãy tải lại danh sách trước khi thao tác.` });
    } finally { this.controllers.delete(controller); }
  }
  async mutate(mutation: WatchlistMutation): Promise<void> {
    const generation = this.generation;
    if (!this.current(generation) || this.state.phase !== "ready" || this.state.busy) return;
    if (mutation.kind === "create" ? this.state.list !== null : mutation.id !== this.state.list?.id) return;
    const token = this.identity!.token, controller = this.controller();
    this.update({ busy: true, notice: "Đang lưu thay đổi…" });
    try {
      const list = await this.services.write(token, mutation, controller.signal);
      if (this.current(generation)) this.commit(list, mutation.kind === "delete" ? "Đã xóa danh sách." : "Đã lưu thay đổi trên máy chủ.");
    } catch (error) {
      if (!this.current(generation)) return;
      if (this.sessionError(error, token)) return;
      if (error instanceof WatchlistError && error.code === "input") this.update({ busy: false, notice: watchlistErrorMessage(error) });
      else await this.load(true);
    } finally { this.controllers.delete(controller); }
  }
  async search(query: string): Promise<void> {
    const generation = this.generation;
    if (!this.current(generation) || this.state.phase !== "ready" || !this.state.list || this.state.busy) return;
    this.searchController?.abort();
    const invalid = queryError(query);
    if (invalid) { this.searchController = null; this.update({ search: { phase: "error", query, response: null, message: invalid } }); return; }
    const controller = this.controller(); this.searchController = controller;
    this.update({ search: { phase: "loading", query, response: null, message: "Đang tìm cổ phiếu…" } });
    try {
      const response = await this.services.search(query, controller.signal);
      if (this.current(generation) && this.searchController === controller && this.state.list) this.update({ search: { phase: "ready", query, response, message: response.data.length ? `${response.data.length} kết quả trong danh mục demo.` : "Chưa tìm thấy kết quả. Thử mã hoặc tên khác." } });
    } catch (error) {
      if (this.current(generation) && this.searchController === controller && this.state.list) this.update({ search: { phase: "error", query, response: null, message: errorMessage(error) } });
    } finally { this.controllers.delete(controller); }
  }
  async loadRow(symbol: string): Promise<void> {
    const generation = this.generation, listId = this.state.list?.id;
    if (!this.current(generation) || !this.state.list?.symbols.includes(symbol) || this.state.phase !== "ready") return;
    this.rowControllers.get(symbol)?.abort(); const controller = this.controller(); this.rowControllers.set(symbol, controller);
    this.update({ rows: { ...this.state.rows, [symbol]: { phase: "loading", response: null, message: "Đang tải giá…" } } });
    const currentRow = () => this.current(generation) && this.rowControllers.get(symbol) === controller && this.state.phase === "ready" && this.state.list?.id === listId && !!this.state.list?.symbols.includes(symbol);
    try {
      const response = await this.services.history(symbol, controller.signal);
      if (currentRow()) this.update({ rows: { ...this.state.rows, [symbol]: { phase: "ready", response, message: "" } } });
    } catch (error) {
      if (currentRow()) this.update({ rows: { ...this.state.rows, [symbol]: { phase: "error", response: null, message: detailErrorMessage(error) } } });
    } finally { this.controllers.delete(controller); }
  }
}
