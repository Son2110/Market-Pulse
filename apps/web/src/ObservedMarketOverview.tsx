import { useEffect, useRef, useState } from "react";
import SiteHeader from "./SiteHeader.js";
import { sampleRange } from "./observed-detail.js";
import { fetchObservedIndexHistory, ObservedIndexError, observedIndexErrorMessage, overviewHref, type ObservedIndexHistory, type OverviewMode } from "./observed-market-overview.js";
import "./observed-market-overview.css";

const date = (value: string) => value.split("-").reverse().join("/");
export function OverviewSourceLinks({ selected }: { selected: "fixture" | "observed" }) {
  return <nav className="overview-source-links" aria-label="Nguồn dữ liệu tổng quan">
    <a href={overviewHref("fixture")} aria-current={selected === "fixture" ? "page" : undefined}>Dữ liệu minh họa</a>
    <a href={overviewHref("observed")} aria-current={selected === "observed" ? "page" : undefined}>Dữ liệu đã lưu · KBS</a>
  </nav>;
}

function IndexSource({ response }: { response: ObservedIndexHistory }) {
  const range = response.meta.returnedRange;
  return <aside className="detail-card source-panel observed-index-source" aria-labelledby="observed-index-source-heading">
    <h2 id="observed-index-source-heading">Nguồn & phạm vi</h2>
    <dl>{[
      ["Nguồn dữ liệu", "KBS qua Vnstock 4.0.8 / vnai 2.6.2"],
      ["Đơn vị", "Điểm chỉ số"], ["Tiền tệ", "Không áp dụng"], ["Cơ sở điều chỉnh", "Không áp dụng"], ["Khối lượng", "Không có dữ liệu"],
      ["Múi giờ tài sản", "Asia/Ho_Chi_Minh (UTC+7)"], ["Thời điểm quan sát từ nguồn", "Chưa xác định"], ["Độ mới", "Chưa xác định"],
      ["Độ đầy đủ", "Chưa xác định"], ["Lịch phiên", "Chưa xác minh"], ["Phạm vi trả về", range ? `${date(range.from)} – ${date(range.to)}` : "Không có quan sát"],
    ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <div className="reference-note"><p>Dữ liệu đã lưu · Không phải mức chỉ số hiện tại</p><p className="small">Nhãn ngày/giờ từ nguồn không có múi giờ. Thời điểm thu thập trong bảng giữ múi giờ gốc, không phải thời điểm quan sát từ nguồn.</p><p className="small">Mỗi quan sát được chọn theo thời điểm thu thập rồi dấu vân tay nội dung. Các dòng có thể đến từ nhiều lần thu thập hoặc đợt ghi dữ liệu chưa hoàn tất/thất bại; chưa xác nhận tập dữ liệu đầy đủ hay đồng nhất.</p></div>
  </aside>;
}

function IndexSummary({ response }: { response: ObservedIndexHistory }) {
  const latest = response.data.candles.at(-1);
  if (!latest) return null;
  return <section className="detail-card observed-index-summary" aria-labelledby="observed-index-summary-heading">
    <div><p className="asset-line"><span className="symbol-tag">VNINDEX</span><span className="small muted">Chỉ số VN-Index</span></p>
      <h2 id="observed-index-summary-heading">Mức đóng cửa cuối khoảng có dữ liệu</h2><p className="observed-index-value">{latest.close}<span> điểm</span></p><p className="small muted">Ngày quan sát: {date(latest.tradingDate)} · Không phải mức chỉ số hiện tại</p></div>
    <div className="observed-index-summary-note"><p className="observation-count">{response.data.candles.length} quan sát</p><p className="small muted">Không tính thay đổi / lợi nhuận: lịch phiên chưa xác minh và tập dữ liệu chưa được xác nhận đồng nhất.</p></div>
  </section>;
}

function IndexTable({ response }: { response: ObservedIndexHistory }) {
  const candles = response.data.candles;
  return <section className="detail-card" aria-labelledby="observed-index-table-heading">
    <div className="detail-section-heading"><div><h2 id="observed-index-table-heading">Bảng quan sát chỉ số đã thu thập</h2><p className="small muted">Mức đóng cửa giữ nguyên chuỗi thập phân. Chỉ hiển thị ngày có bản ghi, không bù hoặc nội suy ngày thiếu.</p></div><span className="observation-count">{candles.length} quan sát</span></div>
    <div className="table-scroll" role="region" aria-label="Bảng quan sát VN-Index, cuộn ngang để xem đủ cột" tabIndex={0}>
      <table className="history-table observed-index-table"><caption className="sr-only">Mức đóng cửa VN-Index chính xác theo ngày, đơn vị điểm chỉ số. Nhãn nguồn không có múi giờ; thời điểm thu thập giữ múi giờ gốc và không phải thời điểm quan sát từ nguồn.</caption>
        <thead><tr>{["Ngày", "Mức đóng cửa (điểm)", "Nhãn ngày/giờ từ nguồn (không có múi giờ)", "Thời điểm thu thập (múi giờ gốc)"].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
        <tbody>{candles.map(row => <tr key={row.tradingDate}><th scope="row">{date(row.tradingDate)}</th><td>{row.close}</td><td>{row.providerTimeLabel}</td><td>{row.collectedAt}</td></tr>)}</tbody>
      </table>
    </div><p className="small muted observations-note">Các dòng có thể đến từ nhiều đợt thu thập. Lịch phiên và độ đầy đủ chưa xác minh.</p>
  </section>;
}

type State = { status: "loading" } | { status: "loaded"; response: ObservedIndexHistory } | { status: "error"; message: string; retry: boolean };
export default function ObservedMarketOverview({ mode }: { mode: Exclude<OverviewMode, { kind: "fixture" }> }) {
  const [state, setState] = useState<State>({ status: "loading" }); const [attempt, setAttempt] = useState(0); const requestId = useRef(0);
  const parameters = new URLSearchParams(window.location.search);
  const from = mode.kind === "observed" ? mode.range.from : parameters.get("from") ?? sampleRange.from;
  const to = mode.kind === "observed" ? mode.range.to : parameters.get("to") ?? sampleRange.to;
  const valid = mode.kind === "observed";
  useEffect(() => {
    document.title = "Tổng quan VN-Index — Dữ liệu đã lưu | MarketPulse VN";
    if (!valid) return;
    const id = ++requestId.current; const controller = new AbortController(); setState({ status: "loading" });
    void fetchObservedIndexHistory({ from, to }, controller.signal).then(response => {
      if (id === requestId.current && !controller.signal.aborted) setState({ status: "loaded", response });
    }).catch((error: unknown) => {
      if (id !== requestId.current || controller.signal.aborted) return;
      setState({ status: "error", message: observedIndexErrorMessage(error), retry: !(error instanceof ObservedIndexError && error.kind === "invalid") });
    });
    return () => { requestId.current += 1; controller.abort(); };
  }, [valid, from, to, attempt]);
  const response = valid && state.status === "loaded" ? state.response : null;
  const statusText = mode.kind === "invalid" ? mode.message : state.status === "loading" ? "Đang tải các quan sát VN-Index đã lưu…" : state.status === "error" ? state.message : response?.data.candles.length ? `Đã tải ${response.data.candles.length} quan sát VN-Index.` : "Không có quan sát trong khoảng đã chọn.";
  return <>
    <a className="skip-link" href="#main">Đến nội dung tổng quan</a><SiteHeader active="market" />
    <main id="main" className="page overview-page observed-index">
      <div className="demo-notice overview-notice"><span aria-hidden="true">ⓘ</span><div><strong>Dữ liệu đã lưu · KBS · Không phải mức chỉ số hiện tại</strong><p>Thời điểm quan sát từ nguồn, độ mới và độ đầy đủ chưa xác định; lịch phiên chưa xác minh. Thông tin phục vụ nghiên cứu, không phải lời khuyên đầu tư.</p></div></div>
      <div className="overview-heading"><div><h1>Tổng quan thị trường (VN-Index)</h1><p className="intro">Các quan sát ngày đã lưu trong khoảng bạn chọn</p></div><OverviewSourceLinks selected="observed" /></div>
      <section className="detail-card observed-index-range" aria-labelledby="observed-index-range-heading"><h2 id="observed-index-range-heading">Khoảng ngày đã chọn</h2>
        <form method="get" action="/market" className="observed-index-range-form"><input type="hidden" name="source" value="observed" />
          <label htmlFor="observed-index-from">Từ ngày<input id="observed-index-from" type="date" name="from" required defaultValue={from} aria-describedby="observed-index-range-help" /></label>
          <label htmlFor="observed-index-to">Đến ngày<input id="observed-index-to" type="date" name="to" required defaultValue={to} aria-describedby="observed-index-range-help" /></label><button className="primary-button" type="submit">Xem dữ liệu</button>
        </form><p id="observed-index-range-help" className="small muted">Bao gồm hai ngày đầu/cuối; chênh lệch tối đa 31 ngày (32 ngày lịch). <a href={overviewHref("observed")}>Khoảng mẫu cố định 28/09–07/10/2026</a> · Không phải khoảng mới nhất.</p>
      </section>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{statusText}</p>
      <div aria-busy={valid && state.status === "loading"}>
        {mode.kind === "invalid" || state.status === "error" ? <section className="state-panel error-panel overview-state" role="alert"><h2>Chưa thể đọc dữ liệu VN-Index đã lưu</h2><p>{mode.kind === "invalid" ? mode.message : state.status === "error" ? state.message : ""}</p>{mode.kind !== "invalid" && state.status === "error" && state.retry && <button className="secondary-button" type="button" onClick={() => setAttempt(value => value + 1)}>Thử lại</button>}</section>
          : state.status === "loading" ? <section className="state-panel overview-state"><h2>Đang tải VN-Index đã lưu…</h2><p>Đang đọc các quan sát trong khoảng ngày đã chọn.</p></section>
            : response && <><IndexSummary response={response} /><div className="overview-workspace"><div className="overview-main-column">{response.data.candles.length ? <IndexTable response={response} /> : <section className="detail-card state-panel overview-state"><h2>Không có quan sát trong khoảng đã chọn</h2><p>Chưa có mức đóng cửa để hiển thị. Độ đầy đủ chưa xác định và lịch phiên chưa xác minh.</p><a className="detail-link" href={overviewHref("observed")}>Xem khoảng mẫu cố định 28/09–07/10/2026 →</a><button className="secondary-button" type="button" onClick={() => setAttempt(value => value + 1)}>Tải lại</button></section>}</div><IndexSource response={response} /></div></>}
      </div>
      <section className="detail-card overview-search-card" aria-labelledby="observed-index-search-heading"><div><p className="eyebrow">Điều hướng tra cứu</p><h2 id="observed-index-search-heading">Tra cứu cổ phiếu</h2><p className="small muted">Tìm kiếm và mở chi tiết từng doanh nghiệp trong danh mục 10 mã demo.</p></div><a className="detail-link" href="/">Mở trang tra cứu <span aria-hidden="true">→</span></a></section>
    </main><footer className="site-footer"><div><span className="footer-brand">MarketPulse VN</span><p>Thông tin chỉ phục vụ nghiên cứu, không phải lời khuyên đầu tư.</p></div></footer>
  </>;
}
