export type AuthMode = "login" | "register";
export interface AuthUser { id: string; email: string; role: "USER"; createdAt: string }
export interface AuthSession { token: string; expiresAt: string }
export interface AuthResponse extends AuthSession { tokenType: "Bearer"; user: AuthUser }
export type AuthErrorCode = "input" | "credentials" | "session" | "duplicate" | "limited" | "unavailable" | "invalid" | "network" | "timeout" | "aborted";

export class AuthError extends Error {
  constructor(public readonly code: AuthErrorCode) { super(code); this.name = "AuthError"; }
}

export function normalizedEmail(value: string): string | undefined {
  const email = value.trim().toLowerCase();
  return email.length > 0 && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email) ? email : undefined;
}

export function passwordError(value: string): string | undefined {
  const length = Array.from(value).length;
  return length < 15 || length > 128 || new TextEncoder().encode(value).length > 512
    ? "Mật khẩu cần 15–128 ký tự." : undefined;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

export function isSession(value: unknown): value is AuthSession {
  return record(value) && typeof value.token === "string" && /^[A-Za-z0-9_-]{43}$/u.test(value.token) && validDate(value.expiresAt);
}

export function isUser(value: unknown): value is AuthUser {
  return record(value) && typeof value.id === "string" && /^[a-f0-9]{24}$/u.test(value.id)
    && typeof value.email === "string" && normalizedEmail(value.email) === value.email
    && value.role === "USER" && validDate(value.createdAt);
}

export function isAuthResponse(value: unknown): value is AuthResponse {
  return isSession(value) && record(value) && value.tokenType === "Bearer" && isUser(value.user);
}

function statusError(status: number, credential: boolean): AuthError {
  return new AuthError(status === 400 ? "input" : status === 401 ? credential ? "credentials" : "session"
    : status === 409 ? "duplicate" : status === 429 ? "limited" : status >= 500 ? "unavailable" : "invalid");
}

async function request(path: "login" | "register" | "me" | "logout", init: RequestInit, signal?: AbortSignal, timeoutMs = 10_000): Promise<unknown> {
  if (signal?.aborted) throw new AuthError("aborted");
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel: (() => void) | undefined;
  const interruption = new Promise<never>((_resolve, reject) => {
    cancel = () => { controller.abort(); reject(new AuthError("aborted")); };
    signal?.addEventListener("abort", cancel, { once: true });
    timer = setTimeout(() => { controller.abort(); reject(new AuthError("timeout")); }, timeoutMs);
  });
  try {
    return await Promise.race([interruption, (async () => {
      const response = await fetch(`/api/auth/${path}`, { ...init, cache: "no-store", credentials: "same-origin", redirect: "error", signal: controller.signal });
      const expected = path === "register" ? 201 : path === "logout" ? 204 : 200;
      if (response.status !== expected) throw statusError(response.status, path === "login" || path === "register");
      if (path === "logout") return undefined;
      let data: unknown;
      try { data = await response.json(); } catch { throw new AuthError("invalid"); }
      if (path === "me") {
        if (!record(data) || !isUser(data.user)) throw new AuthError("invalid");
        return data.user;
      }
      if (!isAuthResponse(data)) throw new AuthError("invalid");
      return data;
    })()]);
  } catch (error) {
    if (error instanceof AuthError) throw error;
    throw new AuthError(signal?.aborted ? "aborted" : "network");
  } finally {
    clearTimeout(timer);
    if (cancel) signal?.removeEventListener("abort", cancel);
  }
}

export async function authenticate(mode: AuthMode, email: string, password: string, signal?: AbortSignal, timeoutMs?: number): Promise<AuthResponse> {
  const normalized = normalizedEmail(email);
  if (!normalized || passwordError(password)) throw new AuthError("input");
  return await request(mode, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ email: normalized, password }) }, signal, timeoutMs) as AuthResponse;
}

export async function fetchUser(token: string, signal?: AbortSignal, timeoutMs?: number): Promise<AuthUser> {
  return await request("me", { method: "GET", headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }, signal, timeoutMs) as AuthUser;
}

export async function revokeSession(token: string, signal?: AbortSignal, timeoutMs?: number): Promise<void> {
  await request("logout", { method: "POST", headers: { Authorization: `Bearer ${token}` } }, signal, timeoutMs);
}

export function authErrorMessage(error: unknown, mode?: AuthMode): string {
  const code = error instanceof AuthError ? error.code : "network";
  const messages: Record<AuthErrorCode, string> = {
    input: "Kiểm tra email và yêu cầu mật khẩu rồi thử lại.", credentials: "Email hoặc mật khẩu không đúng.",
    session: "Phiên đã hết hạn hoặc không còn hiệu lực. Vui lòng đăng nhập lại.", duplicate: "Email đã được đăng ký. Hãy chuyển sang đăng nhập.",
    limited: "Có quá nhiều yêu cầu. Vui lòng chờ một lúc rồi thử lại.", unavailable: "Dịch vụ tài khoản chưa sẵn sàng. Vui lòng thử lại sau.",
    invalid: "Phản hồi tài khoản không hợp lệ. Vui lòng thử lại sau.", network: "Không thể kết nối dịch vụ tài khoản. Kiểm tra kết nối rồi thử lại.",
    timeout: "Yêu cầu quá thời gian chờ. Vui lòng thử lại.", aborted: "Yêu cầu đã được hủy.",
  };
  if (mode === "register" && ["network", "timeout", "invalid", "unavailable"].includes(code)) {
    return `${messages[code]} Tài khoản có thể đã được tạo; hãy thử đăng nhập trước khi đăng ký lại.`;
  }
  return messages[code];
}
