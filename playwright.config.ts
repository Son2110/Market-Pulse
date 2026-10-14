import { defineConfig } from "@playwright/test";

const baseURL = process.env.MP_E2E_BASE_URL;
if (!baseURL || !/^http:\/\/127\.0\.0\.1:\d+$/.test(baseURL)) {
  throw new Error("Run browser tests with npm run test:e2e so the isolated stack is managed.");
}

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "core-flow.spec.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: 0,
  timeout: 60_000,
  globalTimeout: 180_000,
  expect: { timeout: 10_000 },
  reporter: "list",
  outputDir: "test-results/e2e",
  use: {
    baseURL,
    browserName: "chromium",
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    trace: "off",
    video: "off",
    screenshot: "off",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    { name: "narrow-mobile", use: { viewport: { width: 320, height: 800 }, isMobile: true, hasTouch: true } },
  ],
});
