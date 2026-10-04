import { AuthError, authenticate, authErrorMessage, fetchUser, isSession, revokeSession, type AuthMode, type AuthSession, type AuthUser } from "./auth.js";

export const SESSION_KEY = "marketpulse.auth.v1";
const STORAGE_MESSAGE = "Trình duyệt không thể lưu phiên đăng nhập trong tab này. Hãy cho phép dữ liệu trang web hoặc kiểm tra cài đặt quyền riêng tư rồi thử lại.";
const MEMORY_WARNING = "Không thể lưu phiên vào tab. Phiên đang được giữ trong bộ nhớ trang; hãy đăng xuất trước khi rời hoặc tải lại trang.";
export interface SessionStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }
export interface AccountState {
  phase: "initial" | "guest" | "checking" | "submitting" | "authenticated" | "unverified" | "logging-out";
  session: AuthSession | null; user: AuthUser | null; notice: string; warning: string;
}

export function readSession(storage: SessionStorage, now = Date.now()): AuthSession | null {
  const raw = storage.getItem(SESSION_KEY);
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value === "object" && value !== null && "version" in value && value.version === 1
      && Object.keys(value).length === 3 && isSession(value) && Date.parse(value.expiresAt) > now) {
      return { token: value.token, expiresAt: value.expiresAt };
    }
  } catch { /* Invalid stored data is discarded without displaying it. */ }
  storage.removeItem(SESSION_KEY);
  return null;
}

export class AccountSession {
  state: AccountState = { phase: "initial", session: null, user: null, notice: "", warning: "" };
  private listeners = new Set<(state: AccountState) => void>();
  private generation = 0;
  private controller: AbortController | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(private readonly storage: () => SessionStorage, private readonly now: () => number = Date.now) {}

  subscribe(listener: (state: AccountState) => void): () => void {
    this.listeners.add(listener); listener(this.state);
    return () => { this.listeners.delete(listener); };
  }
  private update(patch: Partial<AccountState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener(this.state);
  }
  stop(): void { this.generation += 1; this.controller?.abort(); clearTimeout(this.timer); }
  private begin(): { id: number; signal: AbortSignal } {
    this.controller?.abort(); this.controller = new AbortController();
    return { id: ++this.generation, signal: this.controller.signal };
  }
  private current(id: number): boolean { return id === this.generation; }
  private schedule(): void {
    clearTimeout(this.timer);
    const session = this.state.session;
    if (session) this.timer = setTimeout(() => { if (!this.checkExpiry()) this.schedule(); }, Math.min(2_147_483_647, Math.max(0, Date.parse(session.expiresAt) - this.now())));
  }
  private clear(notice: string): void {
    const token = this.state.session?.token;
    this.stop();
    let warning = "";
    try {
      const raw = this.storage().getItem(SESSION_KEY);
      if (raw !== null) {
        let stored: unknown;
        try { stored = JSON.parse(raw); } catch { stored = null; }
        if (!stored || (typeof stored === "object" && "token" in stored && stored.token === token)) this.storage().removeItem(SESSION_KEY);
      }
    } catch { warning = "Không thể xóa dữ liệu phiên trong tab; phiên này không còn được sử dụng trên trang."; }
    this.update({ phase: "guest", session: null, user: null, notice, warning });
  }
  invalidate(expectedToken: string): void {
    if (this.state.session?.token === expectedToken) this.clear("Phiên đã hết hạn hoặc không còn hiệu lực. Vui lòng đăng nhập lại.");
  }
  checkExpiry(): boolean {
    if (!this.state.session || Date.parse(this.state.session.expiresAt) > this.now()) return false;
    this.clear("Phiên đã hết hạn. Vui lòng đăng nhập lại."); return true;
  }
  async start(): Promise<void> {
    if (!this.state.session) {
      try { this.update({ session: readSession(this.storage(), this.now()) }); }
      catch { this.update({ phase: "guest", notice: STORAGE_MESSAGE }); return; }
    }
    if (this.state.session) { this.schedule(); await this.verify(); }
    else this.update({ phase: "guest" });
  }
  async verify(): Promise<void> {
    if (!this.state.session || this.checkExpiry() || this.state.phase === "logging-out" || this.state.phase === "submitting") return;
    const session = this.state.session;
    const { id, signal } = this.begin();
    this.update({ phase: "checking", user: null, notice: "Đang kiểm tra phiên…" });
    try {
      const user = await fetchUser(session.token, signal);
      if (!this.current(id) || this.checkExpiry()) return;
      this.update({ phase: "authenticated", user, notice: "Phiên tài khoản đang hoạt động." });
    } catch (error) {
      if (!this.current(id) || this.checkExpiry()) return;
      if (error instanceof AuthError && error.code === "session") this.clear(authErrorMessage(error));
      else this.update({ phase: "unverified", user: null, notice: `${authErrorMessage(error)} Phiên được giữ để kiểm tra lại hoặc đăng xuất.` });
    }
  }
  async signIn(mode: AuthMode, email: string, password: string): Promise<void> {
    if (this.state.session || !["guest", "initial"].includes(this.state.phase)) return;
    try {
      const storage = this.storage();
      const probe = `${SESSION_KEY}.probe`;
      storage.setItem(probe, "1");
      if (storage.getItem(probe) !== "1") throw new Error("storage");
      storage.removeItem(probe);
    } catch { this.update({ notice: STORAGE_MESSAGE }); return; }
    const { id, signal } = this.begin();
    this.update({ phase: "submitting", notice: mode === "login" ? "Đang đăng nhập…" : "Đang tạo tài khoản…", warning: "" });
    try {
      const result = await authenticate(mode, email, password, signal);
      if (!this.current(id)) return;
      const session = { token: result.token, expiresAt: result.expiresAt };
      let warning = "";
      try { this.storage().setItem(SESSION_KEY, JSON.stringify({ version: 1, ...session })); } catch { warning = MEMORY_WARNING; }
      this.update({ phase: "authenticated", session, user: result.user, notice: mode === "login" ? "Đăng nhập thành công." : "Đã tạo tài khoản và đăng nhập.", warning });
      if (!this.checkExpiry()) this.schedule();
    } catch (error) {
      if (this.current(id)) this.update({ phase: "guest", notice: authErrorMessage(error, mode) });
    }
  }
  async signOut(): Promise<void> {
    if (!this.state.session || this.checkExpiry() || this.state.phase === "logging-out") return;
    const session = this.state.session;
    const { id, signal } = this.begin();
    this.update({ phase: "logging-out", notice: "Đang đăng xuất…" });
    try {
      await revokeSession(session.token, signal);
      if (this.current(id)) this.clear("Đã đăng xuất và vô hiệu hóa phiên trên máy chủ.");
    } catch (error) {
      if (!this.current(id) || this.checkExpiry()) return;
      if (error instanceof AuthError && error.code === "session") this.clear("Phiên không còn hiệu lực. Đã xóa phiên khỏi trang.");
      else this.update({ phase: this.state.user ? "authenticated" : "unverified", notice: `${authErrorMessage(error)} Chưa xác nhận đăng xuất trên máy chủ; phiên vẫn được giữ. Hãy thử đăng xuất lại.` });
    }
  }
}
