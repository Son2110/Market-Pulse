import { useEffect, useRef, useState, type FormEvent } from "react";
import { normalizedEmail, passwordError, type AuthMode } from "./auth.js";
import { AccountSession } from "./auth-session.js";
import SiteHeader from "./SiteHeader.js";

function sessionTime(value: string): string {
  return new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "medium", hour12: false }).format(new Date(value));
}

function EyeIcon({ visible }: { visible: boolean }) {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2 12s3-6 10-6 10 6 10 6-3 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />{visible && <path d="m3 3 18 18" />}</svg>;
}

export default function Account() {
  const [manager] = useState(() => new AccountSession(() => window.sessionStorage));
  const [state, setState] = useState(manager.state);
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [visible, setVisible] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [invalid, setInvalid] = useState<{ field: "email" | "password" | "confirmation"; message: string } | null>(null);
  const emailInput = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const confirmInput = useRef<HTMLInputElement>(null);
  const status = useRef<HTMLParagraphElement>(null);
  const formPending = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    document.title = "Tài khoản demo | MarketPulse VN";
    mounted.current = true;
    const unsubscribe = manager.subscribe(setState);
    void manager.start();
    const check = () => { manager.checkExpiry(); };
    const visibility = () => { if (document.visibilityState === "visible") check(); };
    const pageshow = (event: PageTransitionEvent) => { if (event.persisted) { check(); void manager.verify(); } };
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pageshow", pageshow);
    return () => {
      mounted.current = false; unsubscribe(); manager.stop();
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pageshow", pageshow);
    };
  }, [manager]);

  const busy = ["initial", "checking", "submitting", "logging-out"].includes(state.phase);
  const message = invalid?.message ?? (state.phase === "initial" ? "Đang kiểm tra phiên trong tab…" : state.notice);

  function changeMode(next: AuthMode) {
    if (busy || formPending.current) return;
    setMode(next); setPassword(""); setConfirmation(""); setVisible(false); setConfirmVisible(false); setInvalid(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || formPending.current || state.session) return;
    const normalized = normalizedEmail(email);
    const passwordMessage = passwordError(password);
    const error = !normalized ? { field: "email" as const, message: "Nhập email hợp lệ, tối đa 254 ký tự." }
      : passwordMessage ? { field: "password" as const, message: passwordMessage }
        : mode === "register" && password !== confirmation ? { field: "confirmation" as const, message: "Mật khẩu nhập lại chưa khớp." } : null;
    setInvalid(error);
    if (error) {
      ({ email: emailInput, password: passwordInput, confirmation: confirmInput })[error.field].current?.focus();
      return;
    }
    formPending.current = true; setEmail(normalized!);
    try { await manager.signIn(mode, normalized!, password); }
    finally {
      formPending.current = false;
      if (mounted.current) {
        setPassword(""); setConfirmation(""); setVisible(false); setConfirmVisible(false);
        status.current?.focus();
      }
    }
  }

  async function sessionAction(action: "verify" | "logout") {
    if (busy || formPending.current) return;
    formPending.current = true;
    try { if (action === "verify") await manager.verify(); else await manager.signOut(); }
    finally { formPending.current = false; if (mounted.current) status.current?.focus(); }
  }

  return <div className="account-shell">
    <a className="skip-link" href="#main">Đến nội dung tài khoản</a>
    <SiteHeader active="account" />
    <main id="main" className="account-page">
      <section className="account-context" aria-labelledby="account-heading">
        <h1 id="account-heading">Tài khoản demo</h1>
        <p className="intro">Đăng nhập hoặc tạo tài khoản để chuẩn bị sử dụng danh sách theo dõi.</p>
        <div className="account-context-panel">
          <div><span className="account-context-icon" aria-hidden="true">▤</span><div><h2>Phiên tài khoản</h2><p>Tài khoản được lưu trên máy chủ của bản demo. Phiên có hạn và có thể đăng xuất để vô hiệu hóa trên máy chủ.</p></div></div>
          <div><span className="account-context-icon" aria-hidden="true">◇</span><div><h2>Tính năng thử nghiệm</h2><p>Trang tài khoản là bước chuẩn bị. Giao diện danh sách theo dõi và giá mới nhất vẫn đang phát triển.</p></div></div>
          <p className="account-scope-note">Tài khoản dùng cho bản demo cục bộ; dữ liệu thị trường là minh họa.</p>
        </div>
        <a className="account-back" href="/">← Tiếp tục tra cứu cổ phiếu</a>
      </section>
      <section className="account-card" aria-label="Đăng nhập và quản lý phiên" aria-busy={busy}>
        {!state.session && <>
          <div className="account-modes" role="group" aria-label="Chọn thao tác tài khoản">
            <button type="button" aria-pressed={mode === "login"} disabled={busy} onClick={() => changeMode("login")}>Đăng nhập</button>
            <button type="button" aria-pressed={mode === "register"} disabled={busy} onClick={() => changeMode("register")}>Đăng ký</button>
          </div>
          <form className="account-form" onSubmit={(event) => void submit(event)} noValidate>
            <div><label htmlFor="account-email">Email</label><input ref={emailInput} id="account-email" name="username" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} required disabled={busy} value={email} onChange={(event) => { setEmail(event.target.value); setInvalid(null); }} aria-invalid={invalid?.field === "email"} aria-describedby="account-status" placeholder="vi-du@example.com" /></div>
            <div><label htmlFor="account-password">Mật khẩu</label><div className="account-password"><input ref={passwordInput} id="account-password" name="password" type={visible ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} required disabled={busy} value={password} onChange={(event) => { setPassword(event.target.value); setInvalid(null); }} aria-invalid={invalid?.field === "password"} aria-describedby="account-password-help account-status" /><button type="button" disabled={busy} aria-controls="account-password" aria-pressed={visible} aria-label={visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"} onClick={() => setVisible(!visible)}><EyeIcon visible={visible} /></button></div><p id="account-password-help" className="small muted">Mật khẩu từ 15–128 ký tự. Khoảng trắng vẫn được tính.</p></div>
            {mode === "register" && <div><label htmlFor="account-confirmation">Nhập lại mật khẩu</label><div className="account-password"><input ref={confirmInput} id="account-confirmation" name="confirmation" type={confirmVisible ? "text" : "password"} autoComplete="new-password" required disabled={busy} value={confirmation} onChange={(event) => { setConfirmation(event.target.value); setInvalid(null); }} aria-invalid={invalid?.field === "confirmation"} aria-describedby="account-status" /><button type="button" disabled={busy} aria-controls="account-confirmation" aria-pressed={confirmVisible} aria-label={confirmVisible ? "Ẩn mật khẩu nhập lại" : "Hiện mật khẩu nhập lại"} onClick={() => setConfirmVisible(!confirmVisible)}><EyeIcon visible={confirmVisible} /></button></div></div>}
            <button className="primary-button" type="submit" disabled={busy}>{state.phase === "submitting" ? mode === "login" ? "Đang đăng nhập…" : "Đang tạo tài khoản…" : mode === "login" ? "Đăng nhập" : "Tạo tài khoản"}</button>
          </form>
        </>}
        <p ref={status} tabIndex={-1} id="account-status" className={`account-status${invalid || state.phase === "unverified" ? " account-error" : ""}`} role="status" aria-live="polite" aria-atomic="true">{message}</p>
        {state.warning && <p className="account-warning" role="status">{state.warning}</p>}
        {state.session && <div className="account-session">
          {state.user && <><h2>Đã đăng nhập</h2><dl><div><dt>Email</dt><dd>{state.user.email}</dd></div><div><dt>Tài khoản tạo lúc (UTC+7)</dt><dd>{sessionTime(state.user.createdAt)}</dd></div></dl></>}
          <p className="small muted">Phiên hết hạn lúc (Việt Nam · UTC+7)</p><p className="account-expiry">{sessionTime(state.session.expiresAt)}</p>
          <p className="small muted">Thời điểm tài khoản và phiên, không phải thời điểm dữ liệu thị trường. Phiên chỉ được lưu trong tab; tài khoản được lưu trên máy chủ demo.</p>
          {state.phase === "unverified" && <button className="primary-button" type="button" onClick={() => void sessionAction("verify")}>Kiểm tra phiên lại</button>}
          <button className="secondary-button" type="button" disabled={busy} onClick={() => void sessionAction("logout")}>{state.phase === "logging-out" ? "Đang đăng xuất…" : "Đăng xuất"}</button>
        </div>}
        <a className="account-public-link" href="/">{state.session ? "Tiếp tục tra cứu cổ phiếu" : "Tiếp tục tra cứu mà không cần đăng nhập"}</a>
      </section>
    </main>
    <footer className="site-footer"><div><span className="footer-brand">MarketPulse VN</span><p>Thông tin chỉ phục vụ minh họa và nghiên cứu, không phải lời khuyên đầu tư.</p></div></footer>
  </div>;
}
