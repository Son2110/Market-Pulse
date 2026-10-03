import { useEffect, useRef, useState } from "react";
import SiteHeader from "./SiteHeader.js";
import { fetchIndexHistory, indexClosingSummary, indexErrorMessage, type IndexHistoryResponse } from "./market-overview.js";

const number = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });
const signed = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2, minimumFractionDigits: 2, signDisplay: "exceptZero" });
const date = (value: string) => value.split("-").reverse().join("/");
const timestamp = (value: string) => new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
}).format(new Date(value));

function IndexSource({ response }: { response: IndexHistoryResponse }) {
  const latest = response.data.candles.at(-1);
  const range = response.meta.availableRange;
  return <aside className="detail-card source-panel overview-source" aria-labelledby="source-heading">
    <h2 id="source-heading">Nguồn & phạm vi</h2>
    <dl>
      <div><dt>Nguồn demo</dt><dd>MarketPulse VN<br /><span className="small">{response.meta.provider}</span></dd></div>
      <div><dt>Thời điểm quan sát (as-of)</dt><dd>{response.meta.asOf ? `${timestamp(response.meta.asOf)} (UTC+7)` : "Chưa có trong kết quả"}</dd></div>
      <div><dt>Độ mới</dt><dd>Chưa xác định<br /><span className="small">{response.data.dataset.freshness}</span></dd></div>
      <div><dt>Đơn vị</dt><dd>Điểm chỉ số<br /><span className="small">index_point</span></dd></div>
      <div><dt>Tiền tệ</dt><dd>Không áp dụng</dd></div>
      <div><dt>Múi giờ</dt><dd>Việt Nam (UTC+7)<br /><span className="small">Asia/Ho_Chi_Minh</span></dd></div>
      <div><dt>Lịch phiên</dt><dd>Chưa xác minh</dd></div>
      <div><dt>Cơ sở điều chỉnh</dt><dd>Không áp dụng</dd></div>
      <div><dt>Phạm vi sẵn có</dt><dd>{range.from && range.to ? `${date(range.from)} – ${date(range.to)}` : "Chưa có dữ liệu"}</dd></div>
      {latest && <div><dt>Thời điểm nạp fixture</dt><dd>{timestamp(latest.ingestedAt)} (UTC+7)</dd></div>}
    </dl>
    <div className="reference-note"><p>Dữ liệu tổng hợp cho bản demo</p><p className="small">{response.data.dataset.label}</p><p className="small">Chỉ hiển thị các quan sát có sẵn. Khối lượng không có trong mẫu; không suy ra thanh khoản tổng.</p></div>
  </aside>;
}

function IndexSummary({ response }: { response: IndexHistoryResponse }) {
  const { latest, previous, change, changePercent } = indexClosingSummary(response.data.candles);
  if (!latest) return null;
  const changeClass = change === null || change === 0 ? "muted" : change > 0 ? "price-up" : "price-down";
  return <section className="detail-card index-hero" aria-labelledby="index-heading">
    <div className="index-identity"><p className="asset-line"><span className="symbol-tag">VNINDEX</span><span className="small muted">Chỉ số thị trường</span></p><p className="small muted">Quan sát mới nhất: {date(latest.tradingDate)}</p></div>
    <h2 id="index-heading">VN-Index</h2><p className="small muted index-close-label">Mức đóng cửa trong dữ liệu mẫu</p>
    <div className="index-value-line"><p className="index-value">{number.format(latest.close)} <span>điểm</span></p>{change !== null && changePercent !== null && <p className={`index-change ${changeClass}`}>{change > 0 ? "+" : ""}{number.format(change)} điểm ({signed.format(changePercent)}%)</p>}</div>
    <p className="small muted">{previous && change !== null && changePercent !== null ? <>So với quan sát có sẵn trước đó {date(previous.tradingDate)} · {number.format(previous.close)} điểm</> : "Chưa có quan sát trước đó để tính thay đổi."}</p>
    <div className="index-asof"><p className="small muted">Thời điểm quan sát (as-of): {timestamp(latest.asOf)} (UTC+7)</p><p className="small muted">Khối lượng: không có trong mẫu</p></div>
  </section>;
}

function IndexObservations({ response }: { response: IndexHistoryResponse }) {
  const candles = response.data.candles;
  return <section className="detail-card" aria-labelledby="observations-heading">
    <div className="detail-section-heading"><div><h2 id="observations-heading">Các quan sát ngày</h2><p className="small muted">Dữ liệu đóng cửa chỉ số trong mẫu</p></div><span className="observation-count">{candles.length} quan sát</span></div>
    <table className="history-table index-table"><caption className="sr-only">Mức đóng cửa VN-Index minh họa theo ngày, đơn vị điểm chỉ số</caption><thead><tr><th scope="col">Ngày</th><th scope="col">Mức đóng cửa (điểm)</th></tr></thead><tbody>{candles.map((candle, index) => <tr key={candle.tradingDate}><th scope="row">{date(candle.tradingDate)}{index === candles.length - 1 && <span className="latest-tag">Mới nhất</span>}</th><td>{number.format(candle.close)}</td></tr>)}</tbody></table>
    <p className="small muted observations-note">Lịch phiên chưa xác minh. Không bù hoặc nội suy ngày thiếu.</p>
  </section>;
}

type OverviewState = { status: "loading" } | { status: "loaded"; response: IndexHistoryResponse } | { status: "error"; message: string };

export default function MarketOverview() {
  const [state, setState] = useState<OverviewState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const requestId = useRef(0);
  useEffect(() => {
    document.title = "Tổng quan thị trường — VN-Index | MarketPulse VN";
    const id = ++requestId.current;
    const controller = new AbortController();
    setState({ status: "loading" });
    void fetchIndexHistory(controller.signal).then((response) => {
      if (id === requestId.current && !controller.signal.aborted) setState({ status: "loaded", response });
    }).catch((error: unknown) => {
      if (id !== requestId.current || controller.signal.aborted) return;
      setState({ status: "error", message: indexErrorMessage(error) });
    });
    return () => { requestId.current += 1; controller.abort(); };
  }, [attempt]);

  const response = state.status === "loaded" ? state.response : null;
  const statusText = state.status === "loading" ? "Đang tải các quan sát VN-Index…" : state.status === "error" ? state.message
    : response?.data.candles.length ? `Đã tải ${response.data.candles.length} quan sát VN-Index.` : "Chưa có dữ liệu ngày cho VN-Index.";
  return <>
    <a className="skip-link" href="#main">Đến nội dung tổng quan</a><SiteHeader active="market" />
    <main id="main" className="page overview-page">
      <div className="overview-heading"><div><h1>Tổng quan thị trường</h1><p className="intro">VN-Index · Dữ liệu ngày minh họa</p></div><p className="small muted">Ký hiệu: <strong>VNINDEX</strong></p></div>
      <div className="demo-notice overview-notice"><span aria-hidden="true">ⓘ</span><div><strong>Dữ liệu minh họa — không phải dữ liệu thị trường</strong><p>Fixture tổng hợp dùng cho bản demo. Độ mới chưa xác định; không phải mức chỉ số hiện tại.</p></div></div>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{statusText}</p>
      <div aria-busy={state.status === "loading"}>
        {state.status === "loading" ? <section className="state-panel overview-state"><span className="state-icon loading-icon" aria-hidden="true">↗</span><h2>Đang tải VN-Index…</h2><p>Đang đọc các quan sát ngày và thông tin nguồn.</p></section>
          : state.status === "error" ? <section className="state-panel error-panel overview-state" role="alert"><h2>Chưa thể tải VN-Index</h2><p>{state.message}</p><button className="secondary-button" type="button" onClick={() => setAttempt((value) => value + 1)}>Thử lại</button></section>
            : response && <div className="overview-workspace"><div className="overview-main-column">{response.data.candles.length ? <><IndexSummary response={response} /><IndexObservations response={response} /></> : <section className="detail-card state-panel overview-state"><h2>Chưa có dữ liệu ngày</h2><p>VN-Index đã được nhận diện, nhưng chưa có quan sát trong kết quả. Chưa có mức đóng cửa hay thay đổi để hiển thị.</p><button className="secondary-button" type="button" onClick={() => setAttempt((value) => value + 1)}>Tải lại</button></section>}</div><IndexSource response={response} /></div>}
      </div>
      <section className="detail-card overview-search-card" aria-labelledby="search-link-heading"><div><p className="eyebrow">Điều hướng tra cứu</p><h2 id="search-link-heading">Tra cứu cổ phiếu</h2><p className="small muted">Tìm kiếm và mở chi tiết từng doanh nghiệp trong danh mục 10 mã demo.</p></div><a className="detail-link" href="/">Mở trang tra cứu <span aria-hidden="true">→</span></a></section>
    </main>
    <footer className="site-footer"><div><span className="footer-brand">MarketPulse VN</span><p>Thông tin chỉ phục vụ minh họa và nghiên cứu, không phải lời khuyên đầu tư.</p></div></footer>
  </>;
}
