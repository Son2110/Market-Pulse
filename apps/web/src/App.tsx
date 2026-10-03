import { useEffect, useRef, useState, type FormEvent } from "react";
import { errorMessage, fetchSearch, queryError, type SearchResponse, type SearchResult } from "./stock-search.js";
import StockDetail from "./StockDetail.js";
import { stockRoute } from "./stock-detail.js";
import MarketOverview from "./MarketOverview.js";
import { isMarketRoute } from "./market-overview.js";
import SiteHeader from "./SiteHeader.js";
import "./styles.css";

type SearchState =
  | { status: "initial" }
  | { status: "loading"; query: string }
  | { status: "results"; query: string; response: SearchResponse }
  | { status: "empty"; query: string }
  | { status: "error"; query: string; message: string; retry: boolean };

function SearchIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></svg>;
}

function CompanyReference({ company, response }: { company: SearchResult; response: SearchResponse }) {
  return <aside className="company-panel" aria-labelledby="company-heading">
    <span className="symbol-tag">{company.asset.symbol}</span>
    <h2 id="company-heading">{company.companyName}</h2>
    <p className="muted">Cổ phiếu · {company.asset.exchange}</p>
    <a className="detail-link" href={`/stocks/${encodeURIComponent(company.asset.symbol)}?search=${encodeURIComponent(new URLSearchParams(window.location.search).get("q") ?? company.asset.symbol)}`}>Xem chi tiết & biểu đồ ngày →</a>
    <div className="panel-section">
      <h3>Thông tin tham chiếu</h3>
      <dl>
        <div><dt>Mã cổ phiếu</dt><dd>{company.asset.symbol}</dd></div>
        <div><dt>Sàn</dt><dd>{company.asset.exchange}</dd></div>
        <div><dt>Tiền tệ / đơn vị</dt><dd>{company.asset.currency === company.asset.unit ? company.asset.currency : `${company.asset.currency} / ${company.asset.unit}`}</dd></div>
        <div><dt>Múi giờ</dt><dd>{company.asset.timezone === "Asia/Ho_Chi_Minh" ? "Việt Nam (UTC+7)" : company.asset.timezone}</dd></div>
        <div><dt>Ngày rà soát nguồn</dt><dd>{company.reference.reviewedOn.split("-").reverse().join("/")}</dd></div>
      </dl>
      <p className="small muted">Ngày rà soát nguồn tham khảo, không phải thời điểm dữ liệu thị trường.</p>
    </div>
    <div className="panel-section">
      <h3>Nguồn tham khảo công bố</h3>
      <ul className="source-list">{company.reference.officialSources.map((url, index) =>
        <li key={url}><a href={url} target="_blank" rel="noopener noreferrer">Nguồn {index + 1} · {new URL(url).hostname}<span aria-hidden="true"> ↗</span><span className="sr-only"> (mở trong tab mới)</span></a></li>)}</ul>
    </div>
    <div className="reference-note">
      <p>Dữ liệu minh họa — không phải dữ liệu thị trường</p>
      <p className="small">Nguồn demo: {response.meta.provider === "marketpulse-fixture" ? "MarketPulse VN (dữ liệu minh họa)" : response.meta.provider}. Độ mới chưa xác định; chưa có thời điểm quan sát thị trường.</p>
      <p className="small">Thông tin tham khảo không xác nhận tình trạng đăng ký hiện tại của doanh nghiệp.</p>
    </div>
  </aside>;
}

function SearchPage() {
  const [draft, setDraft] = useState(() => new URLSearchParams(window.location.search).get("q") ?? "");
  const [state, setState] = useState<SearchState>({ status: "initial" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const requestId = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search).get("q");
    if (query && !queryError(query)) void search(query);
    return () => { requestId.current += 1; controller.current?.abort(); };
  }, []);

  async function search(query: string) {
    const id = ++requestId.current;
    controller.current?.abort();
    setSelectedId(null);
    const invalid = queryError(query);
    if (invalid) {
      setState({ status: "error", query, message: invalid, retry: false });
      input.current?.focus();
      return;
    }
    const next = new AbortController();
    window.history.replaceState(null, "", `/?q=${encodeURIComponent(query)}`);
    controller.current = next;
    setState({ status: "loading", query });
    try {
      const response = await fetchSearch(query, next.signal);
      if (id !== requestId.current || next.signal.aborted) return;
      if (response.data.length === 0) setState({ status: "empty", query });
      else {
        setState({ status: "results", query, response });
        setSelectedId(response.data[0].asset.assetId);
      }
    } catch (error) {
      if (id !== requestId.current || next.signal.aborted) return;
      setState({ status: "error", query, message: errorMessage(error), retry: true });
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void search(draft);
  }

  const selected = state.status === "results" ? state.response.data.find((item) => item.asset.assetId === selectedId) : undefined;
  const statusText = state.status === "initial" ? "Nhập mã hoặc tên doanh nghiệp để bắt đầu."
    : state.status === "loading" ? `Đang tìm “${state.query}”…`
      : state.status === "results" ? `Tìm thấy ${state.response.data.length} doanh nghiệp cho “${state.query}”.`
        : state.status === "empty" ? `Không tìm thấy doanh nghiệp cho “${state.query}”.`
          : state.message;

  return <>
    <a className="skip-link" href="#main">Đến nội dung tìm kiếm</a>
    <SiteHeader active="search" />
    <main id="main" className="page">
      <section className="search-hero" aria-labelledby="page-heading">
        <p className="eyebrow">Tra cứu doanh nghiệp</p>
        <h1 id="page-heading">Tìm doanh nghiệp bạn quan tâm</h1>
        <p className="intro">Tra cứu mã cổ phiếu hoặc tên công ty trong danh mục 10 mã demo.</p>
        <form onSubmit={submit} className="search-form" noValidate>
          <label htmlFor="stock-query">Mã cổ phiếu hoặc tên doanh nghiệp</label>
          <div className="search-controls"><div className="input-wrap"><SearchIcon /><input ref={input} id="stock-query" name="q" type="search" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ví dụ: FPT, Vietcombank, Hòa Phát" aria-describedby="query-help search-status" aria-invalid={state.status === "error" && !state.retry} autoComplete="off" /></div><button className="primary-button" type="submit"><SearchIcon />Tìm kiếm</button></div>
          <p id="query-help" className="small muted">Tìm theo mã hoặc tên, có dấu hoặc không dấu. Tối đa 100 ký tự.</p>
        </form>
        <div className="examples"><span>Thử tìm</span>{["FPT", "Vietcombank", "Hòa Phát"].map((query) => <button key={query} type="button" onClick={() => { setDraft(query); void search(query); }}>{query}</button>)}</div>
      </section>

      <div className="workspace">
        <section className="results-section" aria-labelledby="results-heading" aria-busy={state.status === "loading"}>
          <div className="results-heading"><h2 id="results-heading">{state.status === "results" ? <>Kết quả cho <span>“{state.query}”</span></> : "Kết quả tìm kiếm"}</h2>{state.status === "results" && <span className="small muted">{state.response.data.length} doanh nghiệp</span>}</div>
          <p id="search-status" className="sr-only" role="status" aria-live="polite" aria-atomic="true">{statusText}</p>
          {state.status === "results" ? <>
            <ul className="result-list">{state.response.data.map((company) => {
              const selected = company.asset.assetId === selectedId;
              return <li key={company.asset.assetId}><button className={`result-card${selected ? " selected" : ""}`} type="button" aria-pressed={selected} aria-label={`Xem thông tin ${company.asset.symbol} — ${company.companyName}`} onClick={() => setSelectedId(company.asset.assetId)}>
                <span className="result-symbol">{company.asset.symbol}</span><span className="result-info"><span className="company-name">{company.companyName}</span><span className="small muted">{company.asset.exchange} · Cổ phiếu</span></span><span className="result-action">{selected ? "Đang xem" : "Xem thông tin"}<span aria-hidden="true">{selected ? " ✓" : " →"}</span></span>
              </button></li>;
            })}</ul>
            <p className="scope-note">Chỉ 10 mã trong danh mục demo. Chọn doanh nghiệp rồi mở chi tiết & biểu đồ ngày.</p>
          </> : <div className={`state-panel ${state.status === "error" ? "error-panel" : ""}`}>
            <span className={`state-icon ${state.status === "loading" ? "loading-icon" : ""}`} aria-hidden="true"><SearchIcon /></span>
            <h3>{state.status === "initial" ? "Bắt đầu với một doanh nghiệp" : state.status === "loading" ? "Đang tìm doanh nghiệp…" : state.status === "empty" ? "Chưa tìm thấy kết quả" : "Chưa thể tìm kiếm"}</h3>
            <p>{statusText}</p>
            {state.status === "empty" && <p className="small muted">Thử mã cổ phiếu hoặc tên khác. Danh mục demo chỉ gồm 10 mã.</p>}
            {state.status === "error" && state.retry && <button type="button" className="secondary-button" onClick={() => void search(state.query)}>Thử lại</button>}
          </div>}
        </section>
        {selected && state.status === "results" ? <CompanyReference company={selected} response={state.response} /> : <aside className="company-panel company-placeholder"><span className="placeholder-symbol" aria-hidden="true">↗</span><h2>Thông tin doanh nghiệp</h2><p className="muted">{state.status === "loading" ? "Thông tin sẽ xuất hiện khi tìm kiếm hoàn tất." : "Tìm và chọn một doanh nghiệp để xem mã, sàn và nguồn tham khảo tại đây."}</p></aside>}
      </div>
      <div className="demo-notice"><span aria-hidden="true">ⓘ</span><div><strong>Dữ liệu minh họa — không phải dữ liệu thị trường</strong><p>Thông tin dùng cho bản demo và nghiên cứu. Chưa có giá thị trường trên trang này.</p></div></div>
    </main>
    <footer className="site-footer"><div><span className="footer-brand">MarketPulse VN</span><p>Thông tin chỉ phục vụ minh họa và nghiên cứu, không phải lời khuyên đầu tư.</p></div></footer>
  </>;
}

export default function App() {
  if (isMarketRoute(window.location.pathname)) return <MarketOverview />;
  const route = stockRoute(window.location.pathname);
  return route.kind === "search" ? <SearchPage /> : <StockDetail symbol={route.kind === "detail" ? route.symbol : null} />;
}
