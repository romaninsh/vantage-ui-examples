// End-to-end tests against a running breg `staff` API (profile `test`, for
// its tokens) that serves this app's `dist/`: vantage-server on
// 127.0.0.1:18091 by default; set VANTAGE_URL to change it. Build first: the
// server serves what `npm run build` wrote.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  // One worker: the specs share the live data.
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.VANTAGE_URL ?? "http://127.0.0.1:18091",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
});
