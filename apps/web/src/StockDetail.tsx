import { useEffect, useRef, useState } from "react";
import { fetchSearch, queryError, type SearchResult } from "./stock-search.js";
import { closingChart, closingSummary, DetailError, detailErrorMessage, fetchHistory, type DailyCandle, type HistoryResponse } from "./stock-detail.js";
import SiteHeader from "./SiteHeader.js";
import ObservedStockDetail, { DetailSourceLinks } from "./ObservedStockDetail.js";
import { detailMode, validatedSearch } from "./observed-detail.js";

const number = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });
const signed = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2, minimumFractionDigits: 2, signDisplay: "exceptZero" });
const date = (value: string) => value.split("-").reverse().join("/");
const timestamp = (value: string) => new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
}).format(new Date(value));
const basisLabels = { unadjusted: "Chưa điều chỉnh", split_adjusted: "Điều chỉnh chia tách", total_return_adjusted: "Điều chỉnh tổng lợi nhuận" };

function ClosingChart({ candles }: { candles: DailyCandle[] }) {
  const svg = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(720);
  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    const resize = () => setWidth(Math.max(200, element.getBoundingClientRect().width));
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const chart = closingChart(candles, width);
  return <section className="detail-card chart-card" aria-labelledby="chart-heading">
    <div className="detail-section-heading"><div><h2 id="chart-heading">Lịch sử giá đóng cửa</h2><p className="small muted">Dữ liệu ngày · VND · {candles.length} quan sát</p></div><span className="chart-key"><span aria-hidden="true">●</span> Giá đóng cửa</span></div>
    <svg ref={svg} className="closing-chart" viewBox={`0 0 ${width} 285`} role="img" aria-labelledby="chart-title chart-description">
      <title id="chart-title">Giá đóng cửa minh họa theo ngày</title>
      <desc id="chart-description">{candles.map((candle) => `${date(candle.tradingDate)}: ${number.format(candle.close)} VND`).join("; ")}. Các điểm là quan sát thực trả về trong fixture. Chi tiết có trong bảng bên dưới.</desc>
      {chart.ticks.map((tick) => <g key={tick.y}><line className="chart-grid" x1={width < 480 ? 65 : 80} x2={width < 480 ? width - 40 : width - 80} y1={tick.y} y2={tick.y} /><text className="chart-label" x={width < 480 ? 55 : 68} y={tick.y + 4} textAnchor="end">{number.format(tick.price)}</text></g>)}
      {chart.segments.filter((segment) => segment.length > 1).map((segment) => <polyline key={segment[0].candle.tradingDate} className="chart-line" points={segment.map((point) => `${point.x},${point.y}`).join(" ")} />)}
      {chart.points.map((point, index) => <g key={point.candle.tradingDate}><circle className="chart-point" cx={point.x} cy={point.y} r="5"><title>{date(point.candle.tradingDate)} · {number.format(point.candle.close)} VND</title></circle>
        {((width >= 480 && candles.length <= 6) || index === 0 || index === candles.length - 1) && <><text className="chart-value" x={point.x} y={point.y - 14} textAnchor="middle">{number.format(point.candle.close)}</text><text className="chart-label" x={point.x} y="257" textAnchor="middle">{date(point.candle.tradingDate)}</text></>}
      </g>)}
    </svg>
    <p className="small muted chart-note">{chart.hasGaps ? "Đường được ngắt khi các quan sát cách nhau hơn một ngày lịch. " : ""}Lịch phiên chưa xác minh. Chỉ hiển thị các ngày có dữ liệu; không bù hoặc nội suy ngày thiếu.</p>
  </section>;
}

function HistoryTable({ candles }: { candles: DailyCandle[] }) {
  return <section className="detail-card" aria-labelledby="table-heading">
    <div className="detail-section-heading"><h2 id="table-heading">Bảng dữ liệu ngày</h2><span className="small muted">{candles.length} quan sát</span></div>
    <div className="table-scroll" role="region" aria-label="Bảng OHLCV, cuộn ngang để xem đủ cột" tabIndex={0}>
      <table className="history-table"><caption className="sr-only">OHLCV minh họa, giá bằng VND và khối lượng bằng cổ phiếu</caption>
        <thead><tr><th scope="col">Ngày</th><th scope="col">Mở cửa (VND)</th><th scope="col">Cao nhất (VND)</th><th scope="col">Thấp nhất (VND)</th><th scope="col">Đóng cửa (VND)</th><th scope="col">Khối lượng (cổ phiếu)</th></tr></thead>
        <tbody>{candles.map((candle) => <tr key={candle.tradingDate}><th scope="row">{date(candle.tradingDate)}</th>{[candle.open, candle.high, candle.low, candle.close, candle.volume].map((value, index) => <td key={index}>{number.format(value)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  </section>;
}

function SourcePanel({ response, company }: { response: HistoryResponse; company: SearchResult | null }) {
  const latest = response.data.candles.at(-1);
  const range = response.meta.availableRange;
  return <aside className="detail-card source-panel" aria-labelledby="source-heading">
    <h2 id="source-heading">Nguồn & thông tin dữ liệu</h2>
    <dl>
      <div><dt>Nguồn demo</dt><dd>MarketPulse VN<br /><span className="small">({response.meta.provider})</span></dd></div>
      <div><dt>Thời điểm quan sát (as-of)</dt><dd>{response.meta.asOf ? `${timestamp(response.meta.asOf)} (UTC+7)` : "Chưa có trong kết quả"}</dd></div>
      <div><dt>Độ mới</dt><dd>Chưa xác định<br /><span className="small">{response.data.dataset.freshness}</span></dd></div>
      <div><dt>Tiền tệ / đơn vị giá</dt><dd>VND</dd></div>
      <div><dt>Đơn vị khối lượng</dt><dd>Cổ phiếu (shares)</dd></div>
      <div><dt>Múi giờ</dt><dd>Việt Nam (UTC+7)<br /><span className="small">Asia/Ho_Chi_Minh</span></dd></div>
      <div><dt>Cơ sở điều chỉnh</dt><dd>{latest ? basisLabels[latest.adjustmentBasis] : "Chưa có trong kết quả"}</dd></div>
      <div><dt>Lịch phiên</dt><dd>Chưa xác minh</dd></div>
      <div><dt>Phạm vi sẵn có</dt><dd>{range.from && range.to ? `${date(range.from)} – ${date(range.to)}` : "Chưa có dữ liệu"}</dd></div>
      {latest && <div><dt>Thời điểm nạp fixture</dt><dd>{timestamp(latest.ingestedAt)} (UTC+7)</dd></div>}
    </dl>
    <div className="reference-note"><p>Dữ liệu minh họa — không phải dữ liệu thị trường</p><p className="small">{response.data.dataset.label}</p></div>
    <div className="panel-section"><h3>Tham khảo doanh nghiệp</h3>{company ? <>
      <p className="small muted">Ngày rà soát: {date(company.reference.reviewedOn)}. Đây là ngày rà soát nguồn tham khảo, không phải thời điểm dữ liệu giá.</p>
      <ul className="source-list">{company.reference.officialSources.map((url, index) => <li key={url}><a href={url} target="_blank" rel="noopener noreferrer">Nguồn {index + 1} · {new URL(url).hostname}<span aria-hidden="true"> ↗</span><span className="sr-only"> (mở trong tab mới)</span></a></li>)}</ul>
    </> : <p className="small muted">Chưa có thông tin tham khảo doanh nghiệp phù hợp. Mã cổ phiếu và lịch sử vẫn được hiển thị từ nguồn dữ liệu minh họa.</p>}</div>
  </aside>;
}

type DetailState = { status: "loading" } | { status: "loaded"; response: HistoryResponse } | { status: "error"; message: string; retry: boolean };

export default function StockDetail({ symbol }: { symbol: string | null }) {
  const mode = detailMode(window.location.search, symbol);
  return mode.kind === "fixture" ? <FixtureStockDetail symbol={symbol} /> : <ObservedStockDetail symbol={symbol} mode={mode} />;
}

function FixtureStockDetail({ symbol }: { symbol: string | null }) {
  const [state, setState] = useState<DetailState>({ status: "loading" });
  const [company, setCompany] = useState<SearchResult | null>(null);
  const [attempt, setAttempt] = useState(0);
  const requestId = useRef(0);
  const searchQuery = new URLSearchParams(window.location.search).get("search");
  const backHref = searchQuery && !queryError(searchQuery) ? `/?q=${encodeURIComponent(searchQuery)}` : "/";

  useEffect(() => {
    document.title = symbol ? `${symbol} — Chi tiết cổ phiếu | MarketPulse VN` : "Chi tiết chưa khả dụng | MarketPulse VN";
    if (!symbol) return;
    const id = ++requestId.current;
    const controller = new AbortController();
    setState({ status: "loading" });
    setCompany(null);
    void fetchHistory(symbol, controller.signal).then((response) => {
      if (id === requestId.current && !controller.signal.aborted) setState({ status: "loaded", response });
    }).catch((error: unknown) => {
      if (id !== requestId.current || controller.signal.aborted) return;
      setState({ status: "error", message: detailErrorMessage(error), retry: !(error instanceof DetailError && ["invalid", "unknown"].includes(error.kind)) });
    });
    void fetchSearch(symbol, controller.signal).then((response) => {
      if (id === requestId.current && !controller.signal.aborted) setCompany(response.data.find((item) => item.asset.symbol === symbol) ?? null);
    }).catch(() => { /* Reference failure must not hide valid history. */ });
    return () => { requestId.current += 1; controller.abort(); };
  }, [symbol, attempt]);

  const response = state.status === "loaded" ? state.response : null;
  const summary = closingSummary(response?.data.candles ?? []);
  const asset = response?.data.assets[0];
  const matchingCompany = company && asset && company.asset.assetId === asset.assetId ? company : null;
  const changeClass = summary.change === null || summary.change === 0 ? "muted" : summary.change > 0 ? "price-up" : "price-down";

  return <>
    <a className="skip-link" href="#main">Đến nội dung chi tiết</a>
    <SiteHeader searchHref={backHref} />
    <main id="main" className="page detail-page">
      <a className="back-link" href={backHref}>← Quay lại tìm kiếm</a>
      {symbol === "FPT" && <DetailSourceLinks symbol={symbol} selected="fixture" search={validatedSearch(window.location.search)} />}
      <div className="demo-notice detail-notice"><span aria-hidden="true">ⓘ</span><div><strong>Dữ liệu minh họa — không phải dữ liệu thị trường</strong><p>Fixture tổng hợp dùng cho bản demo. Độ mới chưa xác định; không phải giá hiện tại.</p></div></div>
      <div aria-busy={!!symbol && state.status === "loading"}>
        {!symbol || state.status === "error" ? <section className="state-panel error-panel detail-state" role="alert"><h1>Chưa thể mở chi tiết</h1><p>{!symbol ? detailErrorMessage(new DetailError("invalid")) : state.status === "error" ? state.message : ""}</p>{symbol && state.status === "error" && state.retry && <button className="secondary-button" type="button" onClick={() => setAttempt((value) => value + 1)}>Thử lại</button>}</section>
          : state.status === "loading" ? <section className="state-panel detail-state" role="status"><span className="state-icon loading-icon" aria-hidden="true">↗</span><h1>Đang tải lịch sử {symbol}…</h1><p>Đang đọc các quan sát ngày và thông tin nguồn.</p></section>
            : response && asset && <>
              <section className="detail-card price-hero" aria-labelledby="detail-heading">
                <div className="price-hero-top"><div><p className="asset-line"><span className="symbol-tag">{asset.symbol}</span><span className="small muted">{asset.exchange} · Cổ phiếu</span></p><h1 id="detail-heading">{matchingCompany?.companyName ?? `Cổ phiếu ${asset.symbol}`}</h1><p className="small muted">{matchingCompany ? "Thông tin doanh nghiệp từ danh mục tham khảo." : "Chưa có tên doanh nghiệp từ nguồn tham khảo phù hợp."}</p></div>
                  <div className="closing-price"><p className="small muted">Giá đóng cửa · {summary.latest ? date(summary.latest.tradingDate) : "Chưa có quan sát"}</p><p className="price-value">{summary.latest ? number.format(summary.latest.close) : "—"}<span> VND</span></p>
                    {summary.change !== null && summary.changePercent !== null ? <><p className={changeClass}>{summary.change > 0 ? "+" : ""}{number.format(summary.change)} VND ({signed.format(summary.changePercent)}%)</p><p className="small muted">So với quan sát có sẵn trước đó {date(summary.previous!.tradingDate)} · {number.format(summary.previous!.close)} VND</p></> : <p className="small muted">Chưa có quan sát trước đó để tính thay đổi.</p>}
                  </div></div>
                {summary.latest && <dl className="ohlcv-grid">{[["Mở cửa", summary.latest.open, "VND"], ["Cao nhất", summary.latest.high, "VND"], ["Thấp nhất", summary.latest.low, "VND"], ["Khối lượng", summary.latest.volume, "cổ phiếu"]].map(([label, value, unit]) => <div key={label}><dt>{label}</dt><dd>{number.format(Number(value))}<span> {unit}</span></dd></div>)}</dl>}
              </section>
              <div className="detail-workspace"><div className="detail-main-column">{summary.latest ? <><ClosingChart candles={response.data.candles} /><HistoryTable candles={response.data.candles} /></> : <section className="detail-card state-panel" role="status"><h2>Chưa có dữ liệu ngày</h2><p>Mã đã được nhận diện, nhưng chưa có quan sát trong kết quả. Không có giá, thay đổi hoặc biểu đồ để hiển thị.</p><button className="secondary-button" type="button" onClick={() => setAttempt((value) => value + 1)}>Tải lại</button></section>}</div><SourcePanel response={response} company={matchingCompany} /></div>
            </>}
      </div>
    </main>
    <footer className="site-footer"><div><span className="footer-brand">MarketPulse VN</span><p>Thông tin chỉ phục vụ minh họa và nghiên cứu, không phải lời khuyên đầu tư.</p></div></footer>
  </>;
}
