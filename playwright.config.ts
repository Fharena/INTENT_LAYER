import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? "line" : "list",
  use: {
    trace: "retain-on-failure"
  },
  projects: [
    {
      name: "lumina-chromium",
      testMatch: /lumina\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://127.0.0.1:4187",
        viewport: { width: 1440, height: 1000 }
      }
    },
    {
      name: "modern-chromium",
      testMatch: /modern\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://127.0.0.1:4190",
        viewport: { width: 1440, height: 1000 }
      }
    }
  ],
  webServer: [
    {
      command: "npm run dev --prefix test-sites/lumina-atelier -- --port 4187 --strictPort",
      url: "http://127.0.0.1:4187",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000
    },
    {
      command: "npm run dev --prefix test-sites/modern-tailwind-v4 -- --port 4190 --strictPort",
      url: "http://127.0.0.1:4190",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000
    }
  ]
});
