import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 4012);

/** Browser tests against a production build with throwaway data (see scripts/e2e-server.mjs). */
export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    // First visits redirect to /welcome; the money pages are what these specs test.
    storageState: {
      cookies: [],
      origins: [{ origin: `http://127.0.0.1:${port}`, localStorage: [{ name: "financial-copilot.welcome-seen", value: "true" }] }],
    },
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", testIgnore: "**/phone.e2e.ts", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
    { name: "phone", testMatch: "**/phone.e2e.ts", dependencies: ["desktop"], use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "node scripts/e2e-server.mjs",
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});

