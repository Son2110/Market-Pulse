import { randomBytes, randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

async function noOverflow(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "Page must fit its viewport").toBe(true);
}

async function register(page: Page): Promise<void> {
  const password = `E2e ${randomBytes(24).toString("hex")}`;
  await page.goto("/account");
  await page.getByRole("button", { name: "Đăng ký", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).fill(`e2e-${randomUUID()}@example.com`);
  try {
    await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
    await page.getByLabel("Nhập lại mật khẩu", { exact: true }).fill(password);
  } catch {
    // Do not let locator call logs expose generated credentials on an input failure.
    throw new Error("Could not enter the temporary E2E credentials.");
  }
  await page.getByRole("button", { name: "Tạo tài khoản", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Đã đăng nhập", exact: true })).toBeVisible();
  await noOverflow(page);
}

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus && !page.isClosed()) {
    // Persist only masked pixels, never traces, storage, DOM snapshots or auth traffic.
    await page.screenshot({ path: testInfo.outputPath("failure.png"), fullPage: true, mask: [page.locator("input")] }).catch(() => undefined);
  }
});

test("search source tabs preserve only the committed URL query across drafts and navigation", async ({ page }) => {
  await page.route("**/api/observed/assets/search?*", route => route.fulfill({ json: {
    data: [], meta: { scope: "stored observed equities", label: "STORED OBSERVED ASSET CATALOG — COVERAGE LIMITED TO FPT", provider: "KBS", dataset: null,
      sourceAsOf: null, collectedAt: null, freshness: "unknown", coverage: ["FPT"], availability: "catalog_only", assetOrigin: "stored_observed_asset" },
  } }));
  await page.route("**/api/assets/search?*", route => route.fulfill({ json: {
    data: [], meta: { scope: "fixture equities", dataset: "fixture / unknown", label: "SYNTHETIC FIXTURE — NOT MARKET DATA", provider: "marketpulse-fixture", asOf: null },
  } }));
  const query = page.getByLabel("Mã cổ phiếu hoặc tên doanh nghiệp", { exact: true });
  const tabs = page.getByRole("navigation", { name: "Nguồn tìm kiếm", exact: true });
  const fixture = tabs.getByRole("link", { name: "Dữ liệu minh họa", exact: true });
  const observed = tabs.getByRole("link", { name: "Danh mục đã lưu · KBS · FPT", exact: true });
  await page.goto("/?source=observed&q=FPT");
  await expect(page.getByRole("heading", { name: "Chưa tìm thấy kết quả", exact: true })).toBeVisible();
  for (const draft of ["VCB", "", " ", "x".repeat(101)]) {
    await query.fill(draft);
    await expect(fixture).toHaveAttribute("href", "/?q=FPT");
    await expect(observed).toHaveAttribute("href", "/?source=observed&q=FPT");
  }
  await query.press("Enter");
  await expect(page.getByRole("heading", { name: "Chưa thể tìm kiếm", exact: true })).toBeVisible();
  await expect(fixture).toHaveAttribute("href", "/?q=FPT");
  await query.fill("Cổ phần FPT"); await query.press("Enter");
  const encodedQuery = encodeURIComponent("Cổ phần FPT");
  await expect(fixture).toHaveAttribute("href", `/?q=${encodedQuery}`);
  await expect(observed).toHaveAttribute("href", `/?source=observed&q=${encodedQuery}`);
  await query.fill("UNSENT"); await fixture.click();
  await expect(page).toHaveURL(new RegExp(`/\\?q=${encodedQuery}$`));
  await expect(query).toHaveValue("Cổ phần FPT");
  await expect(fixture).toHaveAttribute("aria-current", "page");
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/\\?source=observed&q=${encodedQuery}$`));
  await expect(observed).toHaveAttribute("aria-current", "page");
  await expect(fixture).toHaveAttribute("href", `/?q=${encodedQuery}`);
  for (const url of ["/?source=observed", "/?source=observed&q="]) {
    await page.goto(url); await query.fill("FPT");
    await expect(fixture).toHaveAttribute("href", "/");
    await expect(observed).toHaveAttribute("href", "/?source=observed");
  }
  await noOverflow(page);
});

test("observed catalog UI states and search origin continuity with explicit stub responses", async ({ page }) => {
  const body = {
    data: [{ asset: { assetId: "VN:HOSE:FPT", symbol: "FPT", assetType: "equity", currency: "VND", unit: "VND", timezone: "Asia/Ho_Chi_Minh" }, companyName: "Công ty Cổ phần FPT", aliases: ["FPT"],
      reference: { origin: "curated_reference", officialSources: ["https://fpt.com/vi/nha-dau-tu/thong-tin-co-phieu"], reviewedOn: "2026-09-29" } }],
    meta: { scope: "stored observed equities", label: "STORED OBSERVED ASSET CATALOG — COVERAGE LIMITED TO FPT", provider: "KBS", dataset: { mode: "observed", label: "OBSERVED KBS DAILY CANDLES — FRESHNESS UNKNOWN", freshness: "unknown", sessionCalendar: "unverified" },
      sourceAsOf: null, collectedAt: null, freshness: "unknown", coverage: ["FPT"], availability: "catalog_only", assetOrigin: "stored_observed_asset" },
  };
  let fail = true; let release: (() => void) | undefined; let fixtureRequests = 0;
  page.on("request", request => { if (new URL(request.url()).pathname === "/api/assets/search") fixtureRequests++; });
  await page.route("**/api/observed/assets/search?*", async route => {
    const query = new URL(route.request().url()).searchParams.get("q");
    if (query === "SLOW") await new Promise<void>(resolve => { release = resolve; });
    if (query === "ERROR" && fail) { await route.fulfill({ status: 503, json: { error: "observed_asset_search_unavailable" } }); return; }
    await route.fulfill({ json: { ...body, data: query === "VCB" ? [] : body.data } });
  });
  await page.route("**/api/observed/assets/FPT/history?*", async route => {
    const parameters = new URL(route.request().url()).searchParams;
    await route.fulfill({ json: { data: { dataset: body.meta.dataset, asset: body.data[0].asset, candles: [] },
      meta: { status: "no_data", provider: "KBS", interval: "1d", requestedRange: { from: parameters.get("from"), to: parameters.get("to") }, returnedRange: null,
        sourceAsOf: null, completeness: "unknown", selectionSemantics: "per_bar_max_collected_at_utc_microseconds_then_content_digest" } } });
  });
  await page.route("**/api/observed/assets/FPT/latest-window", route => route.fulfill({ json: { data: { dataset: body.meta.dataset, asset: body.data[0].asset },
    meta: { status: "available", provider: "KBS", interval: "1d", latestTradingDate: "2026-10-07", range: { from: "2026-09-08", to: "2026-10-07" }, calendarDays: 30,
      sourceAsOf: null, freshness: "unknown", completeness: "unknown", selectionSemantics: "max_stored_trading_date" } } }));
  await page.goto("/?source=observed");
  await expect(page.getByRole("heading", { name: "Bắt đầu với một doanh nghiệp", exact: true })).toBeVisible();
  const query = page.getByLabel("Mã cổ phiếu hoặc tên doanh nghiệp", { exact: true });
  await query.fill("SLOW"); await query.press("Enter");
  await expect(page.getByRole("heading", { name: "Đang tìm doanh nghiệp…", exact: true })).toBeVisible();
  await query.fill("VCB"); await query.press("Enter");
  await expect(page.getByRole("heading", { name: "Chưa tìm thấy kết quả", exact: true })).toBeVisible();
  release?.();
  await query.fill("ERROR"); await query.press("Enter");
  await expect(page.getByRole("heading", { name: "Chưa thể tìm kiếm", exact: true })).toBeVisible();
  fail = false; await page.getByRole("button", { name: "Thử lại", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Xem thông tin FPT/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("complementary", { name: "Công ty Cổ phần FPT", exact: true })).toContainText("tham chiếu do dự án tuyển chọn");
  await noOverflow(page); expect(fixtureRequests).toBe(0);
  await page.reload();
  const link = page.getByRole("link", { name: "Xem chi tiết & biểu đồ ngày →", exact: true });
  await expect(link).toHaveAttribute("href", /source=observed.*search=ERROR.*searchSource=observed/);
  await link.click();
  await expect(page.getByRole("link", { name: "← Quay lại tìm kiếm", exact: true })).toHaveAttribute("href", "/?source=observed&q=ERROR");
  await expect(page.getByRole("heading", { name: "Không có quan sát trong khoảng đã chọn", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Khoảng mẫu 28/09–07/10/2026", exact: true })).toHaveAttribute("href", /searchSource=observed/);
  const emptySample = page.getByRole("link", { name: "Xem khoảng mẫu 28/09–07/10/2026 →", exact: true });
  await expect(emptySample).toHaveAttribute("href", /searchSource=observed/);
  await emptySample.click();
  await expect(page.getByRole("link", { name: "← Quay lại tìm kiếm", exact: true })).toHaveAttribute("href", "/?source=observed&q=ERROR");
  await page.getByRole("navigation", { name: "Nguồn dữ liệu chi tiết", exact: true }).getByRole("link", { name: "Dữ liệu minh họa", exact: true }).click();
  await expect(page.getByRole("link", { name: "← Quay lại tìm kiếm", exact: true })).toHaveAttribute("href", "/?source=observed&q=ERROR");
  await page.getByRole("link", { name: "← Quay lại tìm kiếm", exact: true }).click();
  await expect(page).toHaveURL(/\/\?source=observed&q=ERROR/);
  await expect(page.getByRole("button", { name: /^Xem thông tin FPT/ })).toBeVisible();
  await noOverflow(page);
});

test("latest stored FPT window handles discovery, retries, independent history/status and manual navigation with explicit stubs", async ({ page }) => {
  const data = { asset: { assetId: "VN:HOSE:FPT", symbol: "FPT", assetType: "equity", currency: "VND", unit: "VND", timezone: "Asia/Ho_Chi_Minh" },
    dataset: { mode: "observed", label: "OBSERVED KBS DAILY CANDLES — FRESHNESS UNKNOWN", freshness: "unknown", sessionCalendar: "unverified" } };
  const range = { from: "2026-10-04", to: "2026-11-02" };
  const meta = { status: "available", provider: "KBS", interval: "1d", latestTradingDate: range.to, range, calendarDays: 30,
    sourceAsOf: null, freshness: "unknown", completeness: "unknown", selectionSemantics: "max_stored_trading_date" };
  const candle = { assetId: "VN:HOSE:FPT", tradingDate: range.to, interval: "1d", currency: "VND", unit: "VND", timezone: "Asia/Ho_Chi_Minh", adjustmentBasis: "unknown",
    open: "100000.123456789123456789", high: "110000", low: "90000", close: "101000.123456789123456789", volume: null, volumeUnit: "not_available",
    providerTimeLabel: "2026-11-02 00:00:00", timeProvenance: "provider_naive_calendar_label", sourceAsOf: null, collectedAt: "2026-11-03T07:00:00.123456+07:00",
    source: { provider: "KBS", connector: "vnstock", connectorVersion: "4.0.8", dependencyVersion: "2.6.2", mode: "observed" }, barId: "a".repeat(64), contentDigest: "b".repeat(64) };
  let discovery: "slow" | "error" | "loaded" | "empty" | "malformed" = "slow"; let release: (() => void) | undefined;
  let windowCalls = 0; let historyCalls = 0; let statusCalls = 0; let fixtureCalls = 0; let historyFails = false; let statusFails = true;
  page.on("request", request => { if (/^\/api\/assets\//.test(new URL(request.url()).pathname)) fixtureCalls++; });
  await page.route("**/api/observed/assets/FPT/latest-window", async route => {
    windowCalls++; if (discovery === "slow") await new Promise<void>(resolve => { release = resolve; });
    if (discovery === "error") { await route.fulfill({ status: 503, json: { error: "observed_latest_window_unavailable" } }); return; }
    await route.fulfill({ json: { data, meta: discovery === "empty" ? { ...meta, status: "no_data", latestTradingDate: null, range: null } : discovery === "malformed" ? { ...meta, range: { ...range, from: "2026-10-05" } } : meta } });
  });
  await page.route("**/api/observed/assets/FPT/history?*", async route => {
    historyCalls++; const params = new URL(route.request().url()).searchParams; const requestedRange = { from: params.get("from"), to: params.get("to") };
    if (historyFails) { await route.fulfill({ status: 503, json: { error: "observed_history_unavailable" } }); return; }
    const candles = requestedRange.to === range.to ? [candle] : [];
    await route.fulfill({ json: { data: { ...data, candles }, meta: { status: candles.length ? "available" : "no_data", provider: "KBS", interval: "1d", requestedRange,
      returnedRange: candles.length ? { from: range.to, to: range.to } : null, sourceAsOf: null, completeness: "unknown", selectionSemantics: "per_bar_max_collected_at_utc_microseconds_then_content_digest" } } });
  });
  await page.route("**/api/observed/assets/FPT/collection-status?*", async route => {
    statusCalls++; if (statusFails) { await route.fulfill({ status: 503, json: { error: "observed_collection_status_unavailable" } }); return; }
    const params = new URL(route.request().url()).searchParams;
    await route.fulfill({ json: { data, meta: { status: "no_stored_bars", provider: "KBS", interval: "1d", requestedRange: { from: params.get("from"), to: params.get("to") }, returnedRange: null,
      sourceAsOf: null, completeness: "unknown", selectionSemantics: "per_bar_max_collected_at_utc_microseconds_then_content_digest", freshness: "unknown", sessionCalendar: "unverified",
      selectedCandleCount: 0, collectedAtRange: null, candleCountsByDeliveryStatus: { accepted: 0, queued: 0, running: 0, success: 0, failure: 0, unknown: 0 }, statusSemantics: "referenced_delivery_status_at_read_time", consistency: "non_atomic_read" } } });
  });
  const latestUrl = "/stocks/FPT?source=observed&window=latest&search=FPT&searchSource=observed";
  await page.goto(latestUrl);
  await expect(page.getByRole("heading", { name: "Đang tìm khoảng đã lưu mới nhất…", exact: true })).toBeVisible();
  const fromInput = page.getByLabel("Từ ngày", { exact: true }); const toInput = page.getByLabel("Đến ngày", { exact: true });
  const rangeSubmit = page.getByRole("button", { name: "Xem dữ liệu", exact: true });
  await expect(fromInput).toBeDisabled(); await expect(toInput).toBeDisabled(); await expect(rangeSubmit).toBeDisabled();
  expect(historyCalls).toBe(0); expect(statusCalls).toBe(0); await noOverflow(page);
  discovery = "error"; release?.();
  await expect(page.getByRole("heading", { name: "Chưa thể xác định khoảng đã lưu mới nhất", exact: true })).toBeVisible();
  await expect(fromInput).toBeEnabled(); await expect(toInput).toBeEnabled(); await expect(rangeSubmit).toBeEnabled();
  await fromInput.fill("2026-01-01"); await toInput.fill("2026-01-02");
  discovery = "slow"; const previousRelease = release; const retry = page.getByRole("button", { name: "Thử lại khoảng mới nhất", exact: true }); await retry.focus(); await expect(retry).toBeFocused(); await retry.press("Enter");
  await expect(page.getByRole("heading", { name: "Đang tìm khoảng đã lưu mới nhất…", exact: true })).toBeVisible();
  await expect(fromInput).toBeDisabled(); await expect(toInput).toBeDisabled(); await expect(rangeSubmit).toBeDisabled();
  await expect.poll(() => release !== previousRelease).toBe(true); discovery = "loaded"; release?.();
  await expect(page.getByRole("heading", { name: "Giá đóng cửa cuối khoảng có dữ liệu", exact: true })).toBeVisible();
  await expect(fromInput).toBeEnabled(); await expect(toInput).toBeEnabled(); await expect(rangeSubmit).toBeEnabled();
  await expect(page.getByLabel("Từ ngày", { exact: true })).toHaveValue(range.from); await expect(page.getByLabel("Đến ngày", { exact: true })).toHaveValue(range.to);
  await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(1); await expect(page.getByRole("table")).toContainText(candle.close);
  const statusRetry = page.getByRole("button", { name: "Thử lại trạng thái thu thập", exact: true }); await expect(statusRetry).toBeVisible();
  const beforeStatusRetry = { historyCalls, windowCalls }; statusFails = false; await statusRetry.click();
  await expect(page.getByText("Không có quan sát đã lưu được chọn trong khoảng này.", { exact: false })).toBeVisible();
  expect(historyCalls).toBe(beforeStatusRetry.historyCalls); expect(windowCalls).toBe(beforeStatusRetry.windowCalls);
  await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(1); await noOverflow(page);
  historyFails = true; await page.reload();
  await expect(page.getByRole("heading", { name: "Chưa thể đọc dữ liệu đã lưu", exact: true })).toBeVisible();
  await expect(page.getByText("Không có quan sát đã lưu được chọn trong khoảng này.", { exact: false })).toBeVisible();
  const beforeHistoryRetry = { windowCalls, statusCalls }; historyFails = false; await page.getByRole("button", { name: "Thử lại", exact: true }).click();
  await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(1); expect(windowCalls).toBe(beforeHistoryRetry.windowCalls); expect(statusCalls).toBe(beforeHistoryRetry.statusCalls);
  await page.getByLabel("Từ ngày", { exact: true }).fill("2026-01-01"); await page.getByLabel("Đến ngày", { exact: true }).fill("2026-01-02");
  await page.getByRole("button", { name: "Xem dữ liệu", exact: true }).click(); await expect(page).toHaveURL(/source=observed&searchSource=observed&search=FPT&from=2026-01-01&to=2026-01-02/);
  await expect(page.getByRole("heading", { name: "Không có quan sát trong khoảng đã chọn", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "← Quay lại tìm kiếm", exact: true })).toHaveAttribute("href", "/?source=observed&q=FPT");
  const beforeEmpty = { historyCalls, statusCalls }; discovery = "empty"; await page.goto(latestUrl);
  await expect(page.getByRole("heading", { name: "Chưa có quan sát FPT đã lưu", exact: true })).toBeVisible(); expect(historyCalls).toBe(beforeEmpty.historyCalls); expect(statusCalls).toBe(beforeEmpty.statusCalls);
  await expect(page.getByLabel("Từ ngày", { exact: true })).toHaveValue(""); await expect(page.getByRole("table")).toHaveCount(0);
  discovery = "malformed"; await page.getByRole("button", { name: "Thử lại khoảng mới nhất", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Chưa thể xác định khoảng đã lưu mới nhất", exact: true })).toBeVisible(); expect(historyCalls).toBe(beforeEmpty.historyCalls); expect(fixtureCalls).toBe(0);
  await noOverflow(page);
});

test("real fixture search → chart → private persisted watchlist → logout", async ({ page, browser }, testInfo) => {
  let pageErrors = 0;
  page.on("pageerror", () => { pageErrors += 1; });
  await page.goto("/");
  await page.getByLabel("Mã cổ phiếu hoặc tên doanh nghiệp", { exact: true }).fill("FPT");
  const search = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/assets/search" && response.status() === 200);
  await page.getByRole("button", { name: "Tìm kiếm", exact: true }).click();
  expect(new URL((await search).url()).origin).toBe(new URL(page.url()).origin);
  const result = page.getByRole("button", { name: /^Xem thông tin FPT/ });
  await result.click();
  await expect(result).toHaveAttribute("aria-pressed", "true");
  await noOverflow(page);
  await page.getByRole("link", { name: "Xem chi tiết & biểu đồ ngày →", exact: true }).click();
  await expect(page).toHaveURL(/\/stocks\/FPT\?search=FPT$/);
  const chart = page.getByRole("img", { name: /^Giá đóng cửa minh họa theo ngày/ });
  await expect(chart).toBeVisible();
  await expect(chart.locator("circle")).toHaveCount(3);
  await expect(chart.locator("desc")).toContainText("21/09/2026: 100.000 VND; 22/09/2026: 101.000 VND; 23/09/2026: 102.500 VND");
  const history = page.getByRole("table", { name: "OHLCV minh họa, giá bằng VND và khối lượng bằng cổ phiếu", exact: true });
  await expect(history.locator("tbody tr")).toHaveCount(3);
  await expect(history.getByRole("row", { name: /^23\/09\/2026/ }).getByRole("cell").nth(3)).toHaveText("102.500");
  const source = page.getByRole("complementary", { name: "Nguồn & thông tin dữ liệu", exact: true });
  await expect(source).toContainText("marketpulse-fixture");
  await expect(source).toContainText("15:00:00 23/09/2026 (UTC+7)");
  await expect(source).toContainText("fixture / unknown");
  await expect(source).toContainText("Chưa xác định");
  await expect(source).toContainText("Chưa xác minh");
  await expect(source).toContainText("Asia/Ho_Chi_Minh");
  await expect(source).toContainText("VND");
  await expect(source).toContainText("SYNTHETIC FIXTURE — NOT MARKET DATA");
  await noOverflow(page);

  await register(page);
  await page.getByRole("link", { name: "Mở danh sách theo dõi", exact: true }).click();
  const listName = `Core E2E ${testInfo.project.name}`;
  await page.getByLabel("Tên danh sách mới", { exact: true }).fill(listName);
  await page.getByRole("button", { name: "Tạo danh sách", exact: true }).click();
  await expect(page.getByRole("heading", { name: listName, exact: true })).toBeVisible();
  await page.getByLabel("Mã hoặc tên doanh nghiệp", { exact: true }).fill("FPT");
  await page.getByRole("button", { name: "Tìm kiếm", exact: true }).click();
  await page.getByRole("button", { name: "Thêm FPT", exact: true }).click();
  const row = page.getByRole("table", { name: "Cổ phiếu theo dõi và giá đóng cửa từ fixture", exact: true }).getByRole("row", { name: /^FPT/ });
  await expect(row).toContainText("102.500 VND");
  await expect(row).toContainText("2026-09-23");
  await noOverflow(page);
  await page.reload();
  await expect(page.getByRole("heading", { name: listName, exact: true })).toBeVisible();
  await expect(row).toContainText("102.500 VND");
  await noOverflow(page);

  const other = await browser.newContext({ viewport: testInfo.project.use.viewport });
  try {
    const otherPage = await other.newPage();
    otherPage.on("pageerror", () => { pageErrors += 1; });
    await register(otherPage);
    await otherPage.getByRole("link", { name: "Mở danh sách theo dõi", exact: true }).click();
    await expect(otherPage.getByRole("heading", { name: "Tạo danh sách đầu tiên", exact: true })).toBeVisible();
    await expect(otherPage.getByRole("heading", { name: listName, exact: true })).toHaveCount(0);
    await expect(otherPage.getByRole("button", { name: "Bỏ FPT khỏi danh sách", exact: true })).toHaveCount(0);
    await noOverflow(otherPage);
  } finally { await other.close(); }

  await page.getByRole("navigation", { name: "Điều hướng chính", exact: true }).getByRole("link", { name: "Tài khoản", exact: true }).click();
  await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Đã đăng xuất và vô hiệu hóa phiên trên máy chủ.");
  await page.getByRole("navigation", { name: "Điều hướng chính", exact: true }).getByRole("link", { name: "Theo dõi", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Danh sách dành riêng cho bạn", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: listName, exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Bỏ FPT khỏi danh sách", exact: true })).toHaveCount(0);
  await noOverflow(page);
  expect(pageErrors, "No uncaught browser errors across either account").toBe(0);
});
