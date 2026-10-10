import { useEffect, useRef, useState } from "react";
import SiteHeader from "./SiteHeader.js";
import "./observed-detail.css";
import { detailHref, fetchObservedHistory, observedChart, ObservedError, observedErrorMessage, sampleRange, validatedSearch, type DetailMode, type ObservedCandle, type ObservedHistory } from "./observed-detail.js";

const date = (value: string) => value.split("-").reverse().join("/");
export function DetailSourceLinks({ symbol, selected, search }: { symbol: string; selected: "fixture" | "observed"; search: string | null }) {
  return <nav className="observed-source-tabs" aria-label="Nguồn dữ liệu chi tiết">
    <a href={detailHref(symbol, "fixture", search)} aria-current={selected === "fixture" ? "page" : undefined}>Dữ liệu minh họa</a>
    {symbol === "FPT" && <a href={detailHref(symbol, "observed", search)} aria-current={selected === "observed" ? "page" : undefined}>Dữ liệu đã lưu · KBS</a>}
  </nav>;
}

function ObservedChart({ candles }: { candles: ObservedCandle[] }) {
  const container = useRef<HTMLDivElement>(null); const [width, setWidth] = useState(720);
  useEffect(() => {
    const element = container.current; if (!element) return;
    const resize = () => setWidth(Math.max(200, element.getBoundingClientRect().width));
    resize(); const observer = new ResizeObserver(resize); observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const chart = observedChart(candles, width);
  return <section className="detail-card chart-card" aria-labelledby="observed-chart-heading">
    <div className="detail-section-heading"><div><h2 id="observed-chart-heading">Lịch sử giá đóng cửa</h2><p className="small muted">Biểu đồ xấp xỉ · Giá chính xác trong bảng · VND</p></div><span className="chart-key">● {candles.length} quan sát</span></div>
    <div ref={container} className="observed-chart-container">{chart.reliable ? <svg className="closing-chart observed-chart" viewBox={`0 0 ${width} 285`} role="img" aria-labelledby="observed-chart-title observed-chart-description">
      <title id="observed-chart-title">Giá đóng cửa đã lưu theo ngày, biểu đồ xấp xỉ</title>
      <desc id="observed-chart-description">{candles.map(row => `${date(row.tradingDate)}: ${row.close} VND`).join("; ")}. Không nội suy ngày thiếu. Giá chính xác có trong bảng OHLC.</desc>
      {[35, 95, 155, 215].map(y => <line key={y} className="chart-grid" x1="32" x2={width - 32} y1={y} y2={y} />)}
      {chart.segments.filter(segment => segment.length > 1).map(segment => <polyline key={segment[0].candle.tradingDate} className="chart-line" points={segment.map(point => `${point.x},${point.y}`).join(" ")} />)}
      {chart.points.map((point, index) => <g key={point.candle.tradingDate}><circle className="chart-point" cx={point.x} cy={point.y} r="4"><title>{date(point.candle.tradingDate)} · {point.candle.close} VND</title></circle>
        {(index === 0 || index === candles.length - 1 || (width >= 600 && candles.length <= 8)) && <text className="chart-label" x={point.x} y="257" textAnchor={index === 0 ? "start" : index === candles.length - 1 ? "end" : "middle"}>{point.candle.tradingDate.slice(8)}/{point.candle.tradingDate.slice(5, 7)}</text>}
      </g>)}
    </svg> : <p className="reference-note" role="status">Biểu đồ đã được ẩn vì phần xấp xỉ không thể phân biệt các giá trị một cách đáng tin cậy. Xem giá chính xác trong bảng OHLC bên dưới.</p>}</div>
    <p className="small muted chart-note">{chart.hasGaps ? "Đường được ngắt qua khoảng cách hơn một ngày lịch. " : ""}Lịch phiên chưa xác minh; ngày thiếu được giữ trống, không bù hay nội suy.</p>
  </section>;
}

function ObservedTable({ candles }: { candles: ObservedCandle[] }) {
  return <section className="detail-card" aria-labelledby="observed-table-heading">
    <div className="detail-section-heading"><div><h2 id="observed-table-heading">Bảng OHLC & nguồn theo ngày</h2><p className="small muted">Giá VND giữ nguyên chuỗi thập phân từ dữ liệu đã lưu.</p></div><span className="small muted">{candles.length} quan sát</span></div>
    <div className="table-scroll" role="region" aria-label="Bảng OHLC và thời điểm thu thập, cuộn ngang để xem đủ cột" tabIndex={0}>
      <table className="history-table observed-table"><caption className="sr-only">OHLC chính xác bằng VND. Khối lượng không có dữ liệu. Nhãn ngày/giờ từ nguồn không có múi giờ; thời điểm thu thập không phải thời điểm quan sát từ nguồn.</caption>
        <thead><tr>{["Ngày", "Mở cửa (VND)", "Cao nhất (VND)", "Thấp nhất (VND)", "Đóng cửa (VND)", "Khối lượng", "Nhãn ngày/giờ từ nguồn (không có múi giờ)", "Thời điểm thu thập (múi giờ gốc)"].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
        <tbody>{candles.map(row => <tr key={row.tradingDate}><th scope="row">{date(row.tradingDate)}</th>{[row.open, row.high, row.low, row.close].map((price, index) => <td key={index} className="observed-exact-price">{price}</td>)}<td>Không có dữ liệu</td><td>{row.providerTimeLabel}</td><td>{row.collectedAt}</td></tr>)}</tbody>
      </table>
    </div>
  </section>;
}

function ObservedSource({ response }: { response: ObservedHistory }) {
  const range = response.meta.returnedRange;
  return <aside className="detail-card source-panel" aria-labelledby="observed-source-heading">
    <h2 id="observed-source-heading">Nguồn & thông tin dữ liệu</h2>
    <dl>
      <div><dt>Nguồn</dt><dd>KBS · dữ liệu đã lưu<br /><span className="small">vnstock 4.0.8 · vnai 2.6.2</span></dd></div>
      <div><dt>Thời điểm quan sát từ nguồn</dt><dd>Chưa xác định</dd></div>
      <div><dt>Độ mới</dt><dd>Chưa xác định</dd></div>
      <div><dt>Tiền tệ / đơn vị giá</dt><dd>VND</dd></div>
      <div><dt>Múi giờ tài sản</dt><dd>Việt Nam (UTC+7)<br /><span className="small">Asia/Ho_Chi_Minh</span></dd></div>
      <div><dt>Nhãn ngày/giờ từ nguồn</dt><dd>Ngày/giờ không có múi giờ<br /><span className="small">Không xác nhận thời điểm quan sát</span></dd></div>
      <div><dt>Khối lượng</dt><dd>Không có dữ liệu<br /><span className="small">Không phải 0 cổ phiếu</span></dd></div>
      <div><dt>Điều chỉnh giá</dt><dd>Chưa xác định</dd></div>
      <div><dt>Lịch phiên</dt><dd>Chưa xác minh</dd></div>
      <div><dt>Độ đầy đủ</dt><dd>Chưa xác định</dd></div>
      <div><dt>Khoảng yêu cầu</dt><dd>{date(response.meta.requestedRange.from)} – {date(response.meta.requestedRange.to)}</dd></div>
      <div><dt>Khoảng trả về</dt><dd>{range ? `${date(range.from)} – ${date(range.to)}` : "Không có quan sát"}</dd></div>
    </dl>
    <div className="reference-note"><p>{response.data.dataset.label}</p><p className="small">Giá thuộc khoảng đã chọn, không phải giá hiện tại. Cơ sở điều chỉnh chưa xác định nên không tính thay đổi giá hoặc lợi nhuận.</p></div>
    <div className="panel-section"><h3>Thời điểm & giới hạn</h3><p className="small muted">Mỗi dòng giữ thời điểm thu thập và múi giờ gốc trong bảng: đây không phải thời điểm quan sát từ nguồn. Nhãn ngày/giờ từ nguồn không tự xác nhận múi giờ hoặc phiên giao dịch.</p><p className="small muted observed-paragraph">Mỗi quan sát được chọn theo thời điểm thu thập rồi dấu vân tay nội dung. Các dòng có thể đến từ nhiều lần thu thập hoặc đợt ghi dữ liệu chưa hoàn tất/thất bại; không xác nhận một tập mẫu đầy đủ hay đồng nhất.</p></div>
  </aside>;
}

type State = { status: "loading" } | { status: "loaded"; response: ObservedHistory } | { status: "error"; message: string; retry: boolean };
export default function ObservedStockDetail({ symbol, mode }: { symbol: string | null; mode: Exclude<DetailMode, { kind: "fixture" }> }) {
  const [state, setState] = useState<State>({ status: "loading" }); const [attempt, setAttempt] = useState(0); const requestId = useRef(0);
  const parameters = new URLSearchParams(window.location.search); const search = validatedSearch(window.location.search);
  const backHref = search ? `/?q=${encodeURIComponent(search)}` : "/";
  const from = mode.kind === "observed" ? mode.range.from : parameters.get("from") ?? sampleRange.from;
  const to = mode.kind === "observed" ? mode.range.to : parameters.get("to") ?? sampleRange.to;
  const valid = mode.kind === "observed";
  useEffect(() => {
    document.title = `${symbol ?? "Mã chưa hợp lệ"} — Dữ liệu đã lưu | MarketPulse VN`;
    if (!valid || !symbol) return;
    const id = ++requestId.current; const controller = new AbortController(); setState({ status: "loading" });
    void fetchObservedHistory(symbol, { from, to }, controller.signal).then(response => {
      if (id === requestId.current && !controller.signal.aborted) setState({ status: "loaded", response });
    }).catch((error: unknown) => {
      if (id !== requestId.current || controller.signal.aborted) return;
      setState({ status: "error", message: observedErrorMessage(error), retry: !(error instanceof ObservedError && error.kind === "invalid") });
    });
    return () => { requestId.current += 1; controller.abort(); };
  }, [valid, symbol, from, to, attempt]);
  const response = valid && state.status === "loaded" ? state.response : null; const latest = response?.data.candles.at(-1);
  return <>
    <a className="skip-link" href="#main">Đến nội dung chi tiết</a><SiteHeader searchHref={backHref} />
    <main id="main" className="page detail-page observed-detail">
      <a className="back-link" href={backHref}>← Quay lại tìm kiếm</a>
      <div className="demo-notice detail-notice"><span aria-hidden="true">ⓘ</span><div><strong>Dữ liệu đã lưu · KBS · Không phải giá hiện tại</strong><p>Độ mới, thời điểm quan sát từ nguồn, lịch phiên và cơ sở điều chỉnh chưa xác minh. Thông tin phục vụ nghiên cứu.</p></div></div>
      <section className="detail-card observed-heading" aria-labelledby="observed-heading"><p className="asset-line"><span className="symbol-tag">{symbol ?? "—"}</span><span className="small muted">{symbol === "FPT" ? "HOSE · Cổ phiếu · VND" : "Mã ngoài phạm vi dữ liệu đã lưu"}</span></p><h1 id="observed-heading">{symbol === "FPT" ? "Cổ phiếu FPT" : "Chi tiết dữ liệu đã lưu"}</h1><DetailSourceLinks symbol={symbol ?? "FPT"} selected="observed" search={search} /></section>
      {symbol === "FPT" && <section className="detail-card observed-range-card" aria-labelledby="observed-range-heading"><h2 id="observed-range-heading">Khoảng ngày đã chọn</h2>
        <form method="get" action="/stocks/FPT" className="observed-range-form"><input type="hidden" name="source" value="observed" />{search && <input type="hidden" name="search" value={search} />}
          <label htmlFor="observed-from">Từ ngày<input id="observed-from" type="date" name="from" required defaultValue={from} aria-describedby="observed-range-help" /></label>
          <label htmlFor="observed-to">Đến ngày<input id="observed-to" type="date" name="to" required defaultValue={to} aria-describedby="observed-range-help" /></label><button className="primary-button" type="submit">Xem dữ liệu</button>
        </form><p id="observed-range-help" className="small muted">Bao gồm hai ngày đầu/cuối; chênh lệch tối đa 31 ngày (32 ngày lịch). <a href={detailHref("FPT", "observed", search)}>Khoảng mẫu 28/09–07/10/2026</a> · Không phải khoảng mới nhất.</p>
      </section>}
      <div aria-busy={valid && state.status === "loading"}>
        {mode.kind === "invalid" || state.status === "error" ? <section className="state-panel error-panel detail-state" role="alert"><h2>Chưa thể đọc dữ liệu đã lưu</h2><p>{mode.kind === "invalid" ? mode.message : state.status === "error" ? state.message : ""}</p>{mode.kind !== "invalid" && state.status === "error" && state.retry && <button className="secondary-button" type="button" onClick={() => setAttempt(value => value + 1)}>Thử lại</button>}</section>
          : state.status === "loading" ? <section className="state-panel detail-state" role="status"><span className="state-icon loading-icon" aria-hidden="true">↗</span><h2>Đang tải dữ liệu đã lưu…</h2><p>Đang đọc các quan sát trong khoảng ngày đã chọn.</p></section>
            : response && <>
              {latest && <section className="detail-card observed-price" aria-labelledby="observed-price-heading"><div className="price-hero-top"><div><h2 id="observed-price-heading">Giá đóng cửa cuối khoảng có dữ liệu</h2><p className="small muted">{date(latest.tradingDate)} · Không phải giá hiện tại</p><p className="price-value observed-exact-price">{latest.close}<span> VND</span></p></div><p className="small muted">Không tính thay đổi / lợi nhuận:<br />cơ sở điều chỉnh chưa xác định.</p></div><dl className="ohlcv-grid">{[["Mở cửa", latest.open], ["Cao nhất", latest.high], ["Thấp nhất", latest.low], ["Khối lượng", "Không có dữ liệu"]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd className="observed-exact-price">{value}{label !== "Khối lượng" && <span> VND</span>}</dd></div>)}</dl></section>}
              <div className="detail-workspace"><div className="detail-main-column">{latest ? <><ObservedChart candles={response.data.candles} /><ObservedTable candles={response.data.candles} /></> : <section className="detail-card state-panel" role="status"><h2>Không có quan sát trong khoảng đã chọn</h2><p>Không có giá hoặc biểu đồ để hiển thị. Độ đầy đủ và lịch phiên chưa xác minh.</p><a className="detail-link" href={detailHref("FPT", "observed", search)}>Xem khoảng mẫu 28/09–07/10/2026 →</a></section>}</div><ObservedSource response={response} /></div>
            </>}
      </div>
    </main><footer className="site-footer"><div><span className="footer-brand">MarketPulse VN</span><p>Thông tin chỉ phục vụ nghiên cứu, không phải lời khuyên đầu tư.</p></div></footer>
  </>;
}
