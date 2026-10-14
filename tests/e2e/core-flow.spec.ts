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
