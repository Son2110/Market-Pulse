import { randomBytes, randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { MongoClient } from "mongodb";
import { digest, observedContent, validatePayload, type Json } from "../../apps/api/src/ingestion-contract.js";
import { IngestionStore } from "../../apps/api/src/ingestion-store.js";

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

test("latest stored VN-Index window handles discovery, retries, manual range navigation and observed search continuity with explicit stubs", async ({ page }) => {
  const data = { asset: { assetId: "VN:INDEX:VNINDEX", symbol: "VNINDEX", assetType: "index", currency: null, unit: "index_point", timezone: "Asia/Ho_Chi_Minh" },
    dataset: { mode: "observed", label: "OBSERVED KBS DAILY CANDLES — FRESHNESS UNKNOWN", freshness: "unknown", sessionCalendar: "unverified" } };
  const range = { from: "2026-10-04", to: "2026-11-02" };
  const meta = { status: "available", provider: "KBS", interval: "1d", latestTradingDate: range.to, range, calendarDays: 30,
    sourceAsOf: null, freshness: "unknown", completeness: "unknown", selectionSemantics: "max_stored_trading_date" };
  const candle = { assetId: "VN:INDEX:VNINDEX", tradingDate: range.to, interval: "1d", currency: null, unit: "index_point", timezone: "Asia/Ho_Chi_Minh", adjustmentBasis: "not_applicable",
    open: "1250.123456789123456789", high: "1260", low: "1240", close: "1255.987654321987654321", volume: null, volumeUnit: "not_available",
    providerTimeLabel: "2026-11-02 00:00:00", timeProvenance: "provider_naive_calendar_label", sourceAsOf: null, collectedAt: "2026-11-03T07:00:00.123456+07:00",
    source: { provider: "KBS", connector: "vnstock", connectorVersion: "4.0.8", dependencyVersion: "2.6.2", mode: "observed" }, barId: "c".repeat(64), contentDigest: "d".repeat(64) };
  let discovery: "slow" | "error" | "loaded" | "empty" | "malformed" = "slow"; let release: (() => void) | undefined;
  let windowCalls = 0; let historyCalls = 0; let fixtureCalls = 0; let historyFails = false;
  page.on("request", request => { if (/^\/api\/assets\//.test(new URL(request.url()).pathname)) fixtureCalls++; });
  await page.route("**/api/observed/assets/VNINDEX/latest-window", async route => {
    windowCalls++; if (discovery === "slow") await new Promise<void>(resolve => { release = resolve; });
    if (discovery === "error") { await route.fulfill({ status: 503, json: { error: "observed_latest_window_unavailable" } }); return; }
    await route.fulfill({ json: { data, meta: discovery === "empty" ? { ...meta, status: "no_data", latestTradingDate: null, range: null } : discovery === "malformed" ? { ...meta, range: { ...range, from: "2026-10-05" } } : meta } });
  });
  await page.route("**/api/observed/assets/VNINDEX/history?*", async route => {
    historyCalls++; const params = new URL(route.request().url()).searchParams; const requestedRange = { from: params.get("from"), to: params.get("to") };
    if (historyFails) { await route.fulfill({ status: 503, json: { error: "observed_history_unavailable" } }); return; }
    const candles = requestedRange.to === range.to ? [candle] : [];
    await route.fulfill({ json: { data: { ...data, candles }, meta: { status: candles.length ? "available" : "no_data", provider: "KBS", interval: "1d", requestedRange,
      returnedRange: candles.length ? { from: range.to, to: range.to } : null, sourceAsOf: null, completeness: "unknown", selectionSemantics: "per_bar_max_collected_at_utc_microseconds_then_content_digest" } } });
  });
  await page.goto("/market");
  const observedTab = page.getByRole("navigation", { name: "Nguồn dữ liệu tổng quan", exact: true }).getByRole("link", { name: "Dữ liệu đã lưu · KBS", exact: true });
  await expect(observedTab).toHaveAttribute("href", "/market?source=observed&window=latest");
  fixtureCalls = 0;
  await observedTab.click();
  await expect(page).toHaveURL(/\/market\?source=observed&window=latest$/);
  await expect(page.getByRole("heading", { name: "Đang tìm khoảng đã lưu mới nhất…", exact: true })).toBeVisible();
  const fromInput = page.getByLabel("Từ ngày", { exact: true }); const toInput = page.getByLabel("Đến ngày", { exact: true });
  const rangeSubmit = page.getByRole("button", { name: "Xem dữ liệu", exact: true });
  await expect(fromInput).toBeDisabled(); await expect(toInput).toBeDisabled(); await expect(rangeSubmit).toBeDisabled();
  expect(historyCalls).toBe(0); await noOverflow(page);
  discovery = "error"; release?.();
  await expect(page.getByRole("heading", { name: "Chưa thể xác định khoảng VN-Index đã lưu mới nhất", exact: true })).toBeVisible();
  await expect(fromInput).toBeEnabled(); await expect(toInput).toBeEnabled(); await expect(rangeSubmit).toBeEnabled();
  await fromInput.fill("2026-01-01"); await toInput.fill("2026-01-02");
  discovery = "slow"; const previousRelease = release; const retry = page.getByRole("button", { name: "Thử lại khoảng mới nhất", exact: true }); await retry.focus(); await expect(retry).toBeFocused(); await retry.press("Enter");
  await expect(page.getByRole("heading", { name: "Đang tìm khoảng đã lưu mới nhất…", exact: true })).toBeVisible();
  await expect(fromInput).toBeDisabled(); await expect(toInput).toBeDisabled(); await expect(rangeSubmit).toBeDisabled();
  await expect.poll(() => release !== previousRelease).toBe(true); discovery = "loaded"; release?.();
  await expect(page.getByRole("heading", { name: "Mức đóng cửa cuối khoảng có dữ liệu", exact: true })).toBeVisible();
  await expect(fromInput).toBeEnabled(); await expect(toInput).toBeEnabled(); await expect(rangeSubmit).toBeEnabled();
  await expect(fromInput).toHaveValue(range.from); await expect(toInput).toHaveValue(range.to);
  await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(1); await expect(page.getByRole("table")).toContainText(candle.close);
  await expect(page.getByRole("complementary", { name: "Nguồn & phạm vi", exact: true })).toContainText("04/10/2026 – 02/11/2026");
  await expect(page.getByRole("navigation", { name: "Điều hướng chính", exact: true }).getByRole("link", { name: "Tra cứu cổ phiếu", exact: true })).toHaveAttribute("href", "/?source=observed");
  await expect(page.getByRole("link", { name: /Mở trang tra cứu/ })).toHaveAttribute("href", "/?source=observed");
  await noOverflow(page);
  historyFails = true; await page.reload();
  await expect(page.getByRole("heading", { name: "Chưa thể đọc dữ liệu VN-Index đã lưu", exact: true })).toBeVisible();
  const beforeHistoryRetry = windowCalls; historyFails = false; await page.getByRole("button", { name: "Thử lại", exact: true }).click();
  await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(1); expect(windowCalls).toBe(beforeHistoryRetry);
  await page.getByLabel("Từ ngày", { exact: true }).fill("2026-01-01"); await page.getByLabel("Đến ngày", { exact: true }).fill("2026-01-02");
  await page.getByRole("button", { name: "Xem dữ liệu", exact: true }).click(); await expect(page).toHaveURL(/\/market\?source=observed&from=2026-01-01&to=2026-01-02$/);
  await expect(page.getByRole("heading", { name: "Không có quan sát trong khoảng đã chọn", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Xem khoảng mẫu cố định 28/09–07/10/2026 →", exact: true })).toHaveAttribute("href", "/market?source=observed&from=2026-09-28&to=2026-10-07");
  const beforeEmpty = historyCalls; discovery = "empty"; await page.getByRole("link", { name: "Xem khoảng đã lưu mới nhất", exact: true }).click();
  await expect(page).toHaveURL(/\/market\?source=observed&window=latest$/);
  await expect(page.getByRole("heading", { name: "Chưa có quan sát VN-Index đã lưu", exact: true })).toBeVisible(); expect(historyCalls).toBe(beforeEmpty);
  await expect(page.getByLabel("Từ ngày", { exact: true })).toHaveValue(""); await expect(page.getByRole("table")).toHaveCount(0);
  discovery = "malformed"; await page.getByRole("button", { name: "Thử lại khoảng mới nhất", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Chưa thể xác định khoảng VN-Index đã lưu mới nhất", exact: true })).toBeVisible(); expect(historyCalls).toBe(beforeEmpty); expect(fixtureCalls).toBe(0);
  await noOverflow(page);
});

test("observed watchlist handles source tabs, stored catalog search, exact FPT close, unsupported symbols and retry with explicit stubs", async ({ page }, testInfo) => {
  const data = { asset: { assetId: "VN:HOSE:FPT", symbol: "FPT", assetType: "equity", currency: "VND", unit: "VND", timezone: "Asia/Ho_Chi_Minh" },
    dataset: { mode: "observed", label: "OBSERVED KBS DAILY CANDLES — FRESHNESS UNKNOWN", freshness: "unknown", sessionCalendar: "unverified" } };
  const range = { from: "2026-10-04", to: "2026-11-02" };
  const meta = { status: "available", provider: "KBS", interval: "1d", latestTradingDate: range.to, range, calendarDays: 30,
    sourceAsOf: null, freshness: "unknown", completeness: "unknown", selectionSemantics: "max_stored_trading_date" };
  const candle = { assetId: "VN:HOSE:FPT", tradingDate: range.to, interval: "1d", currency: "VND", unit: "VND", timezone: "Asia/Ho_Chi_Minh", adjustmentBasis: "unknown",
    open: "100000.123456789123456789", high: "110000", low: "90000", close: "101000.123456789123456789", volume: null, volumeUnit: "not_available",
    providerTimeLabel: "2026-11-02 00:00:00", timeProvenance: "provider_naive_calendar_label", sourceAsOf: null, collectedAt: "2026-11-03T07:00:00.123456+07:00",
    source: { provider: "KBS", connector: "vnstock", connectorVersion: "4.0.8", dependencyVersion: "2.6.2", mode: "observed" }, barId: "a".repeat(64), contentDigest: "b".repeat(64) };
  const searchBody = {
    data: [{ asset: data.asset, companyName: "Công ty Cổ phần FPT", aliases: ["FPT"],
      reference: { origin: "curated_reference", officialSources: ["https://fpt.com/vi/nha-dau-tu/thong-tin-co-phieu"], reviewedOn: "2026-09-29" } }],
    meta: { scope: "stored observed equities", label: "STORED OBSERVED ASSET CATALOG — COVERAGE LIMITED TO FPT", provider: "KBS", dataset: data.dataset,
      sourceAsOf: null, collectedAt: null, freshness: "unknown", coverage: ["FPT"], availability: "catalog_only", assetOrigin: "stored_observed_asset" },
  };
  let windowFails = true; let fixtureCalls = 0;
  await page.route("**/api/observed/assets/search?*", async route => {
    const q = new URL(route.request().url()).searchParams.get("q");
    await route.fulfill({ json: q === "FPT" ? searchBody : { ...searchBody, data: [], meta: { ...searchBody.meta, dataset: null } } });
  });
  await page.route("**/api/observed/assets/FPT/latest-window", async route => {
    if (windowFails) { await route.fulfill({ status: 503, json: { error: "observed_latest_window_unavailable" } }); return; }
    await route.fulfill({ json: { data, meta } });
  });
  await page.route("**/api/observed/assets/FPT/history?*", async route => {
    const params = new URL(route.request().url()).searchParams;
    const requestedRange = { from: params.get("from"), to: params.get("to") };
    await route.fulfill({ json: { data: { ...data, candles: [candle] }, meta: { status: "available", provider: "KBS", interval: "1d", requestedRange,
      returnedRange: { from: range.to, to: range.to }, sourceAsOf: null, completeness: "unknown", selectionSemantics: "per_bar_max_collected_at_utc_microseconds_then_content_digest" } } });
  });
  await register(page);
  await page.getByRole("link", { name: "Mở danh sách theo dõi", exact: true }).click();
  const listName = `Observed WL ${testInfo.project.name}`;
  await page.getByLabel("Tên danh sách mới", { exact: true }).fill(listName);
  await page.getByRole("button", { name: "Tạo danh sách", exact: true }).click();
  await expect(page.getByRole("heading", { name: listName, exact: true })).toBeVisible();
  await page.getByLabel("Mã hoặc tên doanh nghiệp", { exact: true }).fill("HPG");
  await page.getByRole("button", { name: "Tìm kiếm", exact: true }).click();
  await page.getByRole("button", { name: "Thêm HPG", exact: true }).click();
  await expect(page.getByRole("table", { name: "Cổ phiếu theo dõi và giá đóng cửa từ fixture", exact: true }).getByRole("row", { name: /^HPG/ })).toBeVisible();

  page.on("request", request => { if (/^\/api\/assets\//.test(new URL(request.url()).pathname)) fixtureCalls++; });
  const observedTab = page.getByRole("navigation", { name: "Nguồn dữ liệu theo dõi", exact: true }).getByRole("link", { name: "Dữ liệu đã lưu · KBS · FPT", exact: true });
  await expect(observedTab).toHaveAttribute("href", "/watchlists?source=observed");
  await observedTab.click();
  await expect(page).toHaveURL(/\/watchlists\?source=observed$/);
  await expect(page.getByRole("navigation", { name: "Điều hướng chính", exact: true }).getByRole("link", { name: "Tra cứu cổ phiếu", exact: true })).toHaveAttribute("href", "/?source=observed");
  const table = page.getByRole("table", { name: "Cổ phiếu theo dõi và giá đóng cửa từ dữ liệu đã lưu", exact: true });
  const hpgRow = table.getByRole("row", { name: /^HPG/ });
  await expect(hpgRow).toContainText("Mã ngoài phạm vi dữ liệu đã lưu (hiện chỉ hỗ trợ FPT). Không chuyển sang dữ liệu minh họa.");
  await page.getByLabel("Mã hoặc tên doanh nghiệp", { exact: true }).fill("VCB");
  await page.getByRole("button", { name: "Tìm kiếm", exact: true }).click();
  await expect(page.getByText("Chưa tìm thấy tài sản đã lưu khớp truy vấn trong phạm vi FPT.", { exact: true })).toBeVisible();
  await page.getByLabel("Mã hoặc tên doanh nghiệp", { exact: true }).fill("FPT");
  await page.getByRole("button", { name: "Tìm kiếm", exact: true }).click();
  await expect(page.getByText("1 kết quả trong danh mục đã lưu (FPT).", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Thêm FPT", exact: true }).click();
  const fptRow = table.getByRole("row", { name: /^FPT/ });
  await expect(fptRow.getByRole("button", { name: "Tải lại giá FPT", exact: true })).toBeVisible();
  windowFails = false;
  await fptRow.getByRole("button", { name: "Tải lại giá FPT", exact: true }).click();
  await expect(fptRow).toContainText(`${candle.close} VND`);
  await expect(fptRow).toContainText("Không tính thay đổi / lợi nhuận");
  await expect(fptRow).toContainText(candle.providerTimeLabel);
  await expect(fptRow).toContainText(candle.collectedAt);
  await expect(fptRow.getByRole("link", { name: "FPT ↗", exact: true })).toHaveAttribute("href", "/stocks/FPT?source=observed&window=latest&searchSource=observed");
  expect(fixtureCalls).toBe(0);
  await noOverflow(page);
  await page.goto("/watchlists?source=unknown");
  await expect(page.getByRole("heading", { name: "Nguồn danh sách theo dõi chưa hợp lệ", exact: true })).toBeVisible();
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
test("real stored observed search → detail/chart/collection-status/revision → overview → private watchlist/reload/recovery", async ({ page, browser }, testInfo) => {
  const mongoUrl = process.env.MP_E2E_MONGODB_URL;
  expect(Boolean(mongoUrl && /^mongodb:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?\/marketpulse_e2e_[a-f0-9]{32}$/.test(mongoUrl))).toBe(true);
  const client = new MongoClient(mongoUrl!, { serverSelectionTimeoutMS: 2000, connectTimeoutMS: 2000, socketTimeoutMS: 3000 });
  await client.connect();
  const db = client.db();
  const store = new IngestionStore(db);
  await store.initialize();

  let pageErrors = 0;
  let fixtureApiCalls = 0;
  page.on("pageerror", () => { pageErrors += 1; });
  page.on("request", request => {
    const pathname = new URL(request.url()).pathname;
    if (/^\/api\/assets\//.test(pathname)) fixtureApiCalls += 1;
  });

  const dataset = { mode: "observed", label: "OBSERVED KBS DAILY CANDLES — FRESHNESS UNKNOWN", freshness: "unknown", sessionCalendar: "unverified" };
  const source = { provider: "KBS", connector: "vnstock", connectorVersion: "4.0.8", dependencyVersion: "2.6.2", mode: "observed" };
  const fptAsset = { assetId: "VN:HOSE:FPT", symbol: "FPT", assetType: "equity", currency: "VND", unit: "VND", timezone: "Asia/Ho_Chi_Minh" };
  const vnindexAsset = { assetId: "VN:INDEX:VNINDEX", symbol: "VNINDEX", assetType: "index", currency: null, unit: "index_point", timezone: "Asia/Ho_Chi_Minh" };

  function makeCandle(symbol: "FPT" | "VNINDEX", tradingDate: string, ohlc: [string, string, string, string], providerTimeLabel: string, collectedAt: string) {
    const isEquity = symbol === "FPT";
    const assetId = isEquity ? "VN:HOSE:FPT" : "VN:INDEX:VNINDEX";
    const adjustmentBasis = isEquity ? "unknown" : "not_applicable";
    const row = {
      assetId,
      tradingDate,
      interval: "1d",
      currency: isEquity ? "VND" : null,
      unit: isEquity ? "VND" : "index_point",
      timezone: "Asia/Ho_Chi_Minh",
      adjustmentBasis,
      open: ohlc[0],
      high: ohlc[1],
      low: ohlc[2],
      close: ohlc[3],
      volume: null,
      volumeUnit: "not_available",
      providerTimeLabel,
      timeProvenance: "provider_naive_calendar_label",
      sourceAsOf: null,
      collectedAt,
      source,
      barId: digest(["KBS", assetId, "1d", tradingDate, adjustmentBasis]),
      contentDigest: "",
    };
    row.contentDigest = digest(observedContent(row));
    return row;
  }

  async function persistObserved(id: string, symbol: "FPT" | "VNINDEX", start: string, end: string, candles: ReturnType<typeof makeCandle>[], status: "success" | "failure" = "success") {
    const payload = {
      schemaVersion: "2.0.0" as const,
      dataset,
      request: { symbol, start, end, interval: "1d" },
      assets: [symbol === "FPT" ? fptAsset : vnindexAsset],
      candles,
    };
    const delivery = await store.accept(id, digest(payload as unknown as Json), validatePayload(payload as unknown as Json));
    await store.persist(delivery);
    await store.deliveries.updateOne({ _id: delivery._id }, { $set: { status, finishedAt: new Date(), updatedAt: new Date() } });
  }

  try {
    await persistObserved("e2e-fpt-batch-1", "FPT", "2026-10-28", "2026-11-02", [
      makeCandle("FPT", "2026-10-28", ["131000.25", "132500.5", "130000.125", "131800.75"], "2026-10-28 07:00", "2026-11-02T09:00:00.100000Z"),
      makeCandle("FPT", "2026-10-29", ["131800.75", "133200", "131200.5", "132450.125"], "2026-10-29 07:00", "2026-11-02T09:00:00.200000Z"),
      makeCandle("FPT", "2026-11-02", ["132500", "134900", "132100", "133100.5"], "2026-11-02 07:00", "2026-11-02T16:15:00.123456+07:00"),
    ], "success");

    await persistObserved("e2e-fpt-older-revision", "FPT", "2026-11-02", "2026-11-02", [
      makeCandle("FPT", "2026-11-02", ["132500", "134900", "132100", "132900.25"], "2026-11-02 07:00", "2026-11-02T08:30:00.000000Z"),
    ], "success");

    const fptRevisedClose = "134250.875";
    const fptRevisedCollectedAt = "2026-11-02T17:45:00.654321+07:00";
    const fptWinningCandle = makeCandle("FPT", "2026-11-02", ["132500", "134900", "132100", fptRevisedClose], "2026-11-02 07:00", fptRevisedCollectedAt);
    await persistObserved("e2e-fpt-winning-revision", "FPT", "2026-11-02", "2026-11-02", [fptWinningCandle], "success");

    expect(await store.observed.revisions.countDocuments({ barId: fptWinningCandle.barId })).toBe(3);

    const vnindexLatestClose = "1264.875";
    const vnindexLatestCollectedAt = "2026-11-02T17:50:00.654321+07:00";
    await persistObserved("e2e-vnindex-batch-1", "VNINDEX", "2026-10-28", "2026-11-02", [
      makeCandle("VNINDEX", "2026-10-28", ["1250.25", "1258.5", "1248.125", "1254.75"], "2026-10-28 07:00", "2026-11-02T09:05:00.100000Z"),
      makeCandle("VNINDEX", "2026-10-29", ["1254.75", "1261", "1252.5", "1259.125"], "2026-10-29 07:00", "2026-11-02T09:05:00.200000Z"),
      makeCandle("VNINDEX", "2026-11-02", ["1260", "1268.5", "1258.25", vnindexLatestClose], "2026-11-02 07:00", vnindexLatestCollectedAt),
    ], "success");

    await page.goto("/?source=observed");
    await expect(page.getByRole("navigation", { name: "Điều hướng chính", exact: true }).getByRole("link", { name: "Tổng quan", exact: true })).toHaveAttribute("href", "/market?source=observed&window=latest");
    await expect(page.getByRole("navigation", { name: "Điều hướng chính", exact: true }).getByRole("link", { name: "Theo dõi", exact: true })).toHaveAttribute("href", "/watchlists?source=observed");
    const searchInput = page.getByLabel("Mã cổ phiếu hoặc tên doanh nghiệp", { exact: true });
    await searchInput.fill("VCB");
    await page.getByRole("button", { name: "Tìm kiếm", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Chưa tìm thấy kết quả", exact: true })).toBeVisible();
    await expect(page.getByText("Chưa có tài sản đã lưu khớp truy vấn trong phạm vi FPT. Không tìm sang dữ liệu minh họa.", { exact: true })).toBeVisible();

    await searchInput.fill("FPT");
    const observedSearchResponse = page.waitForResponse(res => new URL(res.url()).pathname === "/api/observed/assets/search" && res.status() === 200);
    await page.getByRole("button", { name: "Tìm kiếm", exact: true }).click();
    expect(new URL((await observedSearchResponse).url()).origin).toBe(new URL(page.url()).origin);
    await expect(page.getByRole("button", { name: /^Xem thông tin FPT/ })).toHaveAttribute("aria-pressed", "true");
    const referencePanel = page.getByRole("complementary", { name: "Công ty Cổ phần FPT", exact: true });
    await expect(referencePanel).toContainText("Danh mục tài sản đã lưu · KBS · Chỉ FPT");
    await expect(referencePanel).toContainText("Độ mới chưa xác định; chưa có thời điểm quan sát thị trường.");
    await expect(referencePanel).toContainText("tham chiếu do dự án tuyển chọn");
    await noOverflow(page);

    await page.getByRole("link", { name: "Xem chi tiết & biểu đồ ngày →", exact: true }).click();
    await expect(page).toHaveURL(/\/stocks\/FPT\?source=observed&window=latest&search=FPT&searchSource=observed$/);
    await expect(page.getByRole("heading", { name: "Giá đóng cửa cuối khoảng có dữ liệu", exact: true })).toBeVisible();
    await expect(page.getByLabel("Từ ngày", { exact: true })).toHaveValue("2026-10-04");
    await expect(page.getByLabel("Đến ngày", { exact: true })).toHaveValue("2026-11-02");
    await expect(page.getByRole("region", { name: "Giá đóng cửa cuối khoảng có dữ liệu", exact: true })).toContainText(`${fptRevisedClose} VND`);
    await expect(page.getByRole("region", { name: "Giá đóng cửa cuối khoảng có dữ liệu", exact: true })).toContainText("Không tính thay đổi / lợi nhuận");

    const observedChart = page.getByRole("img", { name: /^Giá đóng cửa đã lưu theo ngày, biểu đồ xấp xỉ/ });
    await expect(observedChart).toBeVisible();
    await expect(observedChart.locator("circle")).toHaveCount(3);
    await expect(observedChart.locator("polyline")).toHaveCount(1);
    await expect(observedChart.locator("desc")).toContainText(`28/10/2026: 131800.75 VND; 29/10/2026: 132450.125 VND; 02/11/2026: ${fptRevisedClose} VND`);
    await expect(page.getByText("Đường được ngắt qua khoảng cách hơn một ngày lịch.", { exact: false })).toBeVisible();

    const ohlcTable = page.getByRole("table", { name: /OHLC chính xác bằng VND/ });
    await expect(ohlcTable.locator("tbody tr")).toHaveCount(3);
    const latestFptRow = ohlcTable.getByRole("row", { name: /^02\/11\/2026/ });
    await expect(latestFptRow).toContainText(fptRevisedClose);
    await expect(latestFptRow).not.toContainText("133100.5");
    await expect(latestFptRow).not.toContainText("132900.25");
    await expect(latestFptRow).toContainText("Không có dữ liệu");
    await expect(latestFptRow).toContainText("2026-11-02 07:00");
    await expect(latestFptRow).toContainText(fptRevisedCollectedAt);

    const statusSection = page.getByRole("region", { name: "Trạng thái thu thập trong khoảng đã chọn", exact: true });
    await expect(statusSection).toContainText("04/10/2026 – 02/11/2026");
    await expect(statusSection).toContainText("28/10/2026 – 02/11/2026");
    await expect(statusSection).toContainText("2026-11-02T09:00:00.100000Z");
    await expect(statusSection).toContainText(`đến ${fptRevisedCollectedAt}`);

    const detailSource = page.getByRole("complementary", { name: "Nguồn & thông tin dữ liệu", exact: true });
    await expect(detailSource).toContainText("KBS · dữ liệu đã lưu");
    await expect(detailSource).toContainText("vnstock 4.0.8 · vnai 2.6.2");
    await expect(detailSource).toContainText("VND");
    await expect(detailSource).toContainText("Asia/Ho_Chi_Minh");
    await expect(detailSource).toContainText("Chưa xác định");
    await expect(detailSource).toContainText("Chưa xác minh");
    await expect(detailSource).toContainText("04/10/2026 – 02/11/2026");
    await expect(detailSource).toContainText("28/10/2026 – 02/11/2026");
    await noOverflow(page);

    await page.getByRole("link", { name: "Khoảng mẫu 28/09–07/10/2026", exact: true }).click();
    await expect(page).toHaveURL(/\/stocks\/FPT\?source=observed&from=2026-09-28&to=2026-10-07&search=FPT&searchSource=observed$/);
    await expect(page.getByRole("heading", { name: "Không có quan sát trong khoảng đã chọn", exact: true })).toBeVisible();
    await expect(statusSection).toContainText("Không có quan sát đã lưu được chọn trong khoảng này.");
    await page.getByRole("link", { name: "Xem khoảng đã lưu mới nhất", exact: true }).click();
    await expect(page).toHaveURL(/\/stocks\/FPT\?source=observed&window=latest&search=FPT&searchSource=observed$/);
    await expect(ohlcTable.locator("tbody tr")).toHaveCount(3);

    await page.getByRole("navigation", { name: "Điều hướng chính", exact: true }).getByRole("link", { name: "Tổng quan", exact: true }).click();
    await expect(page).toHaveURL(/\/market\?source=observed&window=latest$/);
    await expect(page.getByRole("heading", { name: "Mức đóng cửa cuối khoảng có dữ liệu", exact: true })).toBeVisible();
    await expect(page.getByLabel("Từ ngày", { exact: true })).toHaveValue("2026-10-04");
    await expect(page.getByLabel("Đến ngày", { exact: true })).toHaveValue("2026-11-02");
    await expect(page.getByRole("region", { name: "Mức đóng cửa cuối khoảng có dữ liệu", exact: true })).toContainText(`${vnindexLatestClose} điểm`);
    await expect(page.getByRole("region", { name: "Mức đóng cửa cuối khoảng có dữ liệu", exact: true })).toContainText("Không tính thay đổi / lợi nhuận");
    const indexTable = page.getByRole("table", { name: /Mức đóng cửa VN-Index chính xác theo ngày/ });
    await expect(indexTable.locator("tbody tr")).toHaveCount(3);
    const latestIndexRow = indexTable.getByRole("row", { name: /^02\/11\/2026/ });
    await expect(latestIndexRow).toContainText(vnindexLatestClose);
    await expect(latestIndexRow).toContainText("2026-11-02 07:00");
    await expect(latestIndexRow).toContainText(vnindexLatestCollectedAt);
    const indexSource = page.getByRole("complementary", { name: "Nguồn & phạm vi", exact: true });
    await expect(indexSource).toContainText("KBS qua Vnstock 4.0.8 / vnai 2.6.2");
    await expect(indexSource).toContainText("Điểm chỉ số");
    await expect(indexSource).toContainText("Không áp dụng");
    await expect(indexSource).toContainText("Không có dữ liệu");
    await expect(indexSource).toContainText("04/10/2026 – 02/11/2026");
    await expect(indexSource).toContainText("28/10/2026 – 02/11/2026");
    await noOverflow(page);

    await register(page);
    await page.getByRole("link", { name: "Mở danh sách theo dõi", exact: true }).click();
    await page.getByRole("navigation", { name: "Nguồn dữ liệu theo dõi", exact: true }).getByRole("link", { name: "Dữ liệu đã lưu · KBS · FPT", exact: true }).click();
    await expect(page).toHaveURL(/\/watchlists\?source=observed$/);
    const listName = `Observed Real E2E ${testInfo.project.name}`;
    await page.getByLabel("Tên danh sách mới", { exact: true }).fill(listName);
    await page.getByRole("button", { name: "Tạo danh sách", exact: true }).click();
    await expect(page.getByRole("heading", { name: listName, exact: true })).toBeVisible();
    await page.getByLabel("Mã hoặc tên doanh nghiệp", { exact: true }).fill("FPT");
    await page.getByRole("button", { name: "Tìm kiếm", exact: true }).click();
    await expect(page.getByText("1 kết quả trong danh mục đã lưu (FPT).", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Thêm FPT", exact: true }).click();
    const wlTable = page.getByRole("table", { name: "Cổ phiếu theo dõi và giá đóng cửa từ dữ liệu đã lưu", exact: true });
    const fptWlRow = wlTable.getByRole("row", { name: /^FPT/ });
    await expect(fptWlRow).toContainText(`${fptRevisedClose} VND`);
    await expect(fptWlRow).toContainText("Quan sát: 2026-11-02");
    await expect(fptWlRow).toContainText("Không tính thay đổi / lợi nhuận");
    await expect(fptWlRow).toContainText("2026-11-02 07:00");
    await expect(fptWlRow).toContainText(fptRevisedCollectedAt);
    await noOverflow(page);

    await page.reload();
    await expect(page.getByRole("heading", { name: listName, exact: true })).toBeVisible();
    await expect(fptWlRow).toContainText(`${fptRevisedClose} VND`);

    const fptNewestClose = "135999.95";
    const fptNewestCollectedAt = "2026-11-03T18:00:00.123456+07:00";
    await persistObserved("e2e-fpt-new-day-failed-batch", "FPT", "2026-11-03", "2026-11-03", [
      makeCandle("FPT", "2026-11-03", ["134500", "136200", "134000", fptNewestClose], "2026-11-03 07:00", fptNewestCollectedAt),
    ], "failure");

    await page.reload();
    await expect(fptWlRow).toContainText(`${fptNewestClose} VND`);
    await expect(fptWlRow).toContainText("Quan sát: 2026-11-03");
    await expect(fptWlRow).toContainText(fptNewestCollectedAt);

    await fptWlRow.getByRole("link", { name: "FPT ↗", exact: true }).click();
    await expect(page).toHaveURL(/\/stocks\/FPT\?source=observed&window=latest&searchSource=observed$/);
    await expect(page.getByLabel("Từ ngày", { exact: true })).toHaveValue("2026-10-05");
    await expect(page.getByLabel("Đến ngày", { exact: true })).toHaveValue("2026-11-03");
    await expect(page.getByRole("region", { name: "Giá đóng cửa cuối khoảng có dữ liệu", exact: true })).toContainText(`${fptNewestClose} VND`);
    await expect(ohlcTable.locator("tbody tr")).toHaveCount(4);
    await expect(statusSection).toContainText("05/10/2026 – 03/11/2026");
    await expect(statusSection).toContainText("28/10/2026 – 03/11/2026");
    await expect(statusSection).toContainText(`đến ${fptNewestCollectedAt}`);
    await noOverflow(page);

    const storedFptAsset = await store.observed.assets.findOne({ _id: "VN:HOSE:FPT" });
    expect(Boolean(storedFptAsset)).toBe(true);
    await store.observed.assets.updateOne({ _id: "VN:HOSE:FPT" }, { $set: { rowDigest: "0".repeat(64) } }, { bypassDocumentValidation: true });
    await page.reload();
    await expect(page.getByRole("heading", { name: "Chưa thể xác định khoảng đã lưu mới nhất", exact: true })).toBeVisible();
    await store.observed.assets.replaceOne({ _id: "VN:HOSE:FPT" }, storedFptAsset!, { bypassDocumentValidation: true });
    await page.getByRole("button", { name: "Thử lại khoảng mới nhất", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Giá đóng cửa cuối khoảng có dữ liệu", exact: true })).toBeVisible();
    await expect(ohlcTable.locator("tbody tr")).toHaveCount(4);
    await noOverflow(page);

    const other = await browser.newContext({ viewport: testInfo.project.use.viewport });
    try {
      const otherPage = await other.newPage();
      otherPage.on("pageerror", () => { pageErrors += 1; });
      await register(otherPage);
      await otherPage.goto("/watchlists?source=observed");
      await expect(otherPage.getByRole("heading", { name: "Tạo danh sách đầu tiên", exact: true })).toBeVisible();
      await expect(otherPage.getByRole("heading", { name: listName, exact: true })).toHaveCount(0);
      await noOverflow(otherPage);
    } finally {
      await other.close();
    }

    await page.getByRole("navigation", { name: "Điều hướng chính", exact: true }).getByRole("link", { name: "Tài khoản", exact: true }).click();
    await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Đã đăng xuất và vô hiệu hóa phiên trên máy chủ.");
    await page.goto("/watchlists?source=observed");
    await expect(page.getByRole("heading", { name: "Danh sách dành riêng cho bạn", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: listName, exact: true })).toHaveCount(0);
    await noOverflow(page);

    expect(fixtureApiCalls, "Observed journey must not call fixture market routes").toBe(0);
    expect(pageErrors, "No uncaught browser errors across observed journey").toBe(0);
  } finally {
    await store.observed.latest.deleteMany({});
    await store.observed.revisions.deleteMany({});
    await store.observed.assets.deleteMany({});
    await store.deliveries.deleteMany({});
    await client.close();
  }
});
