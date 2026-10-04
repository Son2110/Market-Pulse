import { useEffect, useRef, useState, type FormEvent } from "react";
import { AccountSession } from "./auth-session.js";
import { WatchlistSession } from "./watchlist-session.js";
import { watchlistName, type WatchlistMutation } from "./watchlist-api.js";
import { closingSummary, type HistoryResponse } from "./stock-detail.js";
import SiteHeader from "./SiteHeader.js";

export function isWatchlistsRoute(pathname: string): boolean { return pathname === "/watchlists" || pathname === "/watchlists/"; }
const number = (value: number) => new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(value);
const time = (value: string) => new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "medium", hour12: false }).format(new Date(value));
function MarketCells({ response }: { response: HistoryResponse }) {
  const { latest, previous, change, changePercent } = closingSummary(response.data.candles);
  if (!latest) return <td colSpan={3} className="wl-no-data">Chưa có quan sát giá. Không có giá hoặc thay đổi để hiển thị.</td>;
  const basis = latest.adjustmentBasis === "unadjusted" ? "Chưa điều chỉnh" : latest.adjustmentBasis === "split_adjusted" ? "Điều chỉnh chia tách" : "Điều chỉnh tổng lợi nhuận";
  return <><td data-label="Đóng cửa mới nhất"><strong>{number(latest.close)} VND</strong><span className="small muted">Quan sát: {latest.tradingDate}</span></td>
    <td data-label="Thay đổi"><strong className={change !== null && change < 0 ? "wl-down" : "wl-change"}>{change === null ? "Chưa đủ quan sát" : `${change > 0 ? "+" : ""}${number(change)} VND (${changePercent! > 0 ? "+" : ""}${number(changePercent!)}%)`}</strong><span className="small muted">{previous ? `So với quan sát ${previous.tradingDate}` : "Cần ít nhất hai quan sát có sẵn."}</span></td>
    <td data-label="As-of (UTC+7)"><span>{time(latest.asOf)}</span><span className="small muted">{basis}</span></td></>;
}

export default function Watchlists() {
  const [account] = useState(() => new AccountSession(() => window.sessionStorage));
  const [manager] = useState(() => new WatchlistSession(account));
  const [auth, setAuth] = useState(account.state);
  const [state, setState] = useState(manager.state);
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [rename, setRename] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [invalid, setInvalid] = useState("");
  const nameInput = useRef<HTMLInputElement>(null);
  const status = useRef<HTMLParagraphElement>(null);
  const mounted = useRef(false);
  useEffect(() => {
    document.title = "Danh sách theo dõi | MarketPulse VN"; mounted.current = true;
    const unsubscribe = manager.subscribe((next) => {
      setState(next);
      if (next.phase === "blocked") { setName(""); setQuery(""); setRename(false); setConfirmDelete(false); setInvalid(""); }
    });
    const authUnsubscribe = account.subscribe((next) => { setAuth(next); manager.acceptAccount(next); });
    void account.start();
    const check = () => { account.checkExpiry(); };
    const visibility = () => { if (document.visibilityState === "visible") check(); };
    const pagehide = () => { mounted.current = false; manager.stop(); account.stop(); setName(""); setQuery(""); setRename(false); setConfirmDelete(false); setInvalid(""); };
    const pageshow = (event: PageTransitionEvent) => { if (event.persisted) window.location.reload(); };
    window.addEventListener("focus", check); document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", pagehide); window.addEventListener("pageshow", pageshow);
    return () => { mounted.current = false; unsubscribe(); authUnsubscribe(); manager.stop(); account.stop(); window.removeEventListener("focus", check); document.removeEventListener("visibilitychange", visibility); window.removeEventListener("pagehide", pagehide); window.removeEventListener("pageshow", pageshow); };
  }, [account, manager]);
  const list = state.list;
  const ready = auth.phase === "authenticated" && state.phase === "ready";
  const disabled = !ready || state.busy;
  async function action(mutation: WatchlistMutation) {
    if (disabled) return;
    const token = account.state.session?.token, owner = account.state.user?.id;
    setInvalid(""); await manager.mutate(mutation);
    if (mounted.current && account.state.phase === "authenticated" && account.state.session?.token === token && account.state.user?.id === owner) {
      if (manager.state.phase === "ready" && manager.state.notice.startsWith("Đã")) { setName(""); setRename(false); setConfirmDelete(false); }
      status.current?.focus();
    }
  }
  function submitName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (disabled) return;
    const normalized = watchlistName(name);
    if (!normalized) { setInvalid("Tên cần 1–100 ký tự, không chứa ký tự điều khiển."); nameInput.current?.focus(); return; }
    void action(list ? { kind: "rename", id: list.id, name: normalized } : { kind: "create", name: normalized });
  }
  function nameForm(create: boolean) {
    return <form className="wl-name-form" onSubmit={submitName} noValidate><div><label htmlFor="wl-name">{create ? "Tên danh sách mới" : "Tên mới"}</label><input ref={nameInput} id="wl-name" value={name} disabled={disabled} onChange={(event) => { setName(event.target.value); setInvalid(""); }} aria-invalid={!!invalid} aria-describedby="wl-status" placeholder="Cổ phiếu quan tâm" /></div><button type="submit" className="primary-button" disabled={disabled}>{create ? "Tạo danh sách" : "Lưu tên"}</button>{!create && <button type="button" className="secondary-button" disabled={disabled} onClick={() => { setRename(false); setInvalid(""); }}>Hủy đổi tên</button>}</form>;
  }
  return <div className="account-shell"><a className="skip-link" href="#main">Đến danh sách theo dõi</a><SiteHeader active="watchlists" />
    <main id="main" className="page wl-page"><div className="wl-heading"><div><p className="eyebrow">Không gian nghiên cứu</p><h1>Danh sách theo dõi</h1><p className="intro">Một danh sách riêng, tối đa 10 cổ phiếu trong danh mục demo.</p></div><a href="/account">Quản lý tài khoản →</a></div>
      <div className="wl-notice"><strong>Dữ liệu minh họa — không phải giá thị trường hiện tại.</strong><p>SYNTHETIC FIXTURE — NOT MARKET DATA · marketpulse-fixture · VND · Việt Nam (UTC+7). Độ mới: fixture / unknown. Lịch phiên chưa xác minh.</p></div>
      <section className="wl-card" aria-label="Danh sách của bạn" aria-busy={state.busy}>
        <p ref={status} tabIndex={-1} id="wl-status" className={`wl-status${invalid || state.phase === "error" ? " account-error" : ""}`} role="status" aria-live="polite" aria-atomic="true">{invalid || (auth.phase === "authenticated" ? state.notice : auth.phase === "initial" ? "Đang kiểm tra phiên…" : auth.notice)}</p>
        {auth.warning && <p className="account-warning">{auth.warning}</p>}
        {auth.phase === "guest" && <div className="wl-state"><span className="wl-state-icon" aria-hidden="true">▤</span><h2>Danh sách dành riêng cho bạn</h2><p>Đăng nhập tài khoản demo để tạo và lưu danh sách trên máy chủ cục bộ.</p><a className="primary-button" href="/account">Đăng nhập hoặc đăng ký</a></div>}
        {auth.phase === "unverified" && <div className="wl-state"><h2>Chưa xác minh được phiên</h2><p>Kiểm tra phiên lại để tải danh sách của bạn.</p><div className="wl-actions"><button className="primary-button" onClick={() => void account.verify()}>Kiểm tra phiên lại</button><button className="secondary-button" onClick={() => void account.signOut()}>Đăng xuất</button></div></div>}
        {["initial", "checking", "logging-out"].includes(auth.phase) && <div className="wl-state"><h2>{auth.phase === "logging-out" ? "Đang đăng xuất…" : "Đang kiểm tra phiên…"}</h2><p>Danh sách chỉ được tải sau khi máy chủ xác nhận tài khoản.</p></div>}
        {auth.phase === "authenticated" && state.phase === "error" && <div className="wl-state"><h2>Chưa thể tải danh sách</h2><p>Mọi thay đổi cần chờ đọc lại thành công.</p><button className="secondary-button" onClick={() => void manager.load()}>Tải lại danh sách</button></div>}
        {auth.phase === "authenticated" && ["loading", "reconciling"].includes(state.phase) && <div className="wl-state"><h2>{state.phase === "reconciling" ? "Đang đối chiếu với máy chủ…" : "Đang tải danh sách…"}</h2></div>}
        {ready && !list && <div className="wl-create"><h2>Tạo danh sách đầu tiên</h2><p>Đặt tên rồi tìm cổ phiếu để thêm vào danh sách.</p>{nameForm(true)}<p className="small muted">Tên từ 1–100 ký tự. Mỗi tài khoản có một danh sách.</p></div>}
        {ready && list && <><div className="wl-list-heading"><div><h2>{list.name}</h2><p className="small muted">{list.symbols.length}/10 cổ phiếu · {auth.user?.email}</p></div><div className="wl-actions"><button className="secondary-button" disabled={disabled || rename} onClick={() => { setName(list.name); setRename(true); setConfirmDelete(false); }}>Đổi tên</button><button className="secondary-button wl-danger" disabled={disabled || confirmDelete} onClick={() => { setConfirmDelete(true); setRename(false); }}>Xóa danh sách</button></div></div>
          <p className="wl-modified small muted">Cập nhật danh sách: {time(list.updatedAt)} (UTC+7). Thời điểm sửa dữ liệu tài khoản, không phải market as-of.</p>
          {rename && <div className="wl-inline">{nameForm(false)}</div>}
          {confirmDelete && <div className="wl-confirm"><p>Xóa “{list.name}” và toàn bộ mã trong danh sách?</p><div className="wl-actions"><button className="secondary-button wl-danger" disabled={disabled} onClick={() => void action({ kind: "delete", id: list.id })}>Xác nhận xóa danh sách</button><button className="secondary-button" disabled={disabled} onClick={() => setConfirmDelete(false)}>Hủy xóa</button></div></div>}
          <div className="wl-add"><h3>Thêm cổ phiếu</h3><form className="wl-search-form" onSubmit={(event) => { event.preventDefault(); void manager.search(query); }}><label htmlFor="wl-query">Mã hoặc tên doanh nghiệp</label><div className="search-controls"><input id="wl-query" value={query} disabled={disabled} onChange={(event) => setQuery(event.target.value)} placeholder="Ví dụ: FPT hoặc Hòa Phát" aria-describedby="wl-search-status" /><button className="primary-button" disabled={disabled} type="submit">Tìm kiếm</button></div></form><p id="wl-search-status" className="small muted" role="status" aria-live="polite">{state.search.message || "Tìm trong 10 cổ phiếu demo. Chọn Thêm để lưu mã."}</p>
            {state.search.phase === "error" && <button className="secondary-button" disabled={disabled} onClick={() => void manager.search(query)}>Tìm lại</button>}
            {state.search.response && <ul className="wl-search-results">{state.search.response.data.map((item) => { const symbol = item.asset.symbol, added = list.symbols.includes(symbol); return <li key={symbol}><div><strong>{symbol}</strong><span>{item.companyName}</span><span className="small muted">{item.asset.exchange} · VND</span></div><button className="secondary-button" disabled={disabled || added || list.symbols.length >= 10} aria-label={added ? `${symbol} đã có trong danh sách` : `Thêm ${symbol}`} onClick={() => void action({ kind: "add", id: list.id, symbol })}>{added ? "Đã thêm" : list.symbols.length >= 10 ? "Đủ 10 mã" : "+ Thêm"}</button></li>; })}</ul>}
          </div>
          {!list.symbols.length ? <div className="wl-state"><span className="wl-state-icon" aria-hidden="true">▤</span><h3>Danh sách chưa có cổ phiếu</h3><p>Tìm mã hoặc tên doanh nghiệp phía trên để thêm mã đầu tiên.</p></div> : <div className="wl-table-wrap"><table className="wl-table"><caption className="sr-only">Cổ phiếu theo dõi và giá đóng cửa từ fixture</caption><thead><tr><th scope="col">Cổ phiếu</th><th scope="col">Đóng cửa mới nhất</th><th scope="col">Thay đổi / quan sát trước</th><th scope="col">As-of (UTC+7)</th><th scope="col"><span className="sr-only">Thao tác</span></th></tr></thead><tbody>{list.symbols.map((symbol) => { const row = state.rows[symbol]; return <tr key={symbol}><th scope="row"><a href={`/stocks/${symbol}`}>{symbol} ↗</a><span className="small muted">{row?.response?.data.assets[0].exchange ?? "Cổ phiếu demo"}</span></th>{row?.phase === "ready" && row.response ? <MarketCells response={row.response} /> : <td colSpan={3} className="wl-row-status">{row?.message ?? "Đang tải giá…"}{row?.phase === "error" && <button className="secondary-button" disabled={disabled} onClick={() => void manager.loadRow(symbol)}>Tải lại giá {symbol}</button>}</td>}<td><button className="secondary-button" disabled={disabled} aria-label={`Bỏ ${symbol} khỏi danh sách`} onClick={() => void action({ kind: "remove", id: list.id, symbol })}>Bỏ mã</button></td></tr>; })}</tbody></table></div>}
          <p className="wl-footnote small muted">Thay đổi so với quan sát có sẵn trước đó, chưa xác nhận là phiên giao dịch trước. Nguồn: marketpulse-fixture · tiền tệ/đơn vị: VND · múi giờ: Asia/Ho_Chi_Minh (UTC+7) · độ mới chưa xác định · lịch phiên chưa xác minh. Cơ sở điều chỉnh được ghi theo từng mã; không có giá realtime.</p>
        </>}
      </section>
    </main><footer className="site-footer"><div><span className="footer-brand">MarketPulse VN</span><p>Thông tin chỉ phục vụ minh họa và nghiên cứu, không phải lời khuyên đầu tư.</p></div></footer></div>;
}
