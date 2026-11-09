export default function SiteHeader({ active, marketHref = "/market", searchHref = "/", watchlistHref = "/watchlists", accountHref = "/account" }: { active?: "market" | "search" | "account" | "watchlists"; marketHref?: string; searchHref?: string; watchlistHref?: string; accountHref?: string }) {
  return <header className="site-header"><div className="header-inner">
    <a className="brand brand-link" href={searchHref}><span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M3 12h4l2-5 4 11 2-6h6" /></svg></span><span>MarketPulse <strong>VN</strong></span></a>
    <nav className="site-nav" aria-label="Điều hướng chính"><a href={marketHref} aria-current={active === "market" ? "page" : undefined}>Tổng quan</a><a href={searchHref} aria-current={active === "search" ? "page" : undefined}>Tra cứu cổ phiếu</a><a href={watchlistHref} aria-current={active === "watchlists" ? "page" : undefined}>Theo dõi</a><a href={accountHref} aria-current={active === "account" ? "page" : undefined}>Tài khoản</a></nav>
    <span className="demo-badge"><span aria-hidden="true">●</span> Bản demo</span>
  </div></header>;
}
