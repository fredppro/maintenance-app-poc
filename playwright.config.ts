import { defineConfig, devices } from "@playwright/test";
import { validateE2EDatabaseUrl } from "./tests/e2e/test-database";

const databaseUrl = process.env.E2E_DATABASE_URL;

if (databaseUrl) validateE2EDatabaseUrl(databaseUrl);

if (databaseUrl) process.env.DATABASE_URL = databaseUrl;

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "pnpm dev -- --hostname 127.0.0.1",
    url: "http://127.0.0.1:3000/en",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      DATABASE_URL: databaseUrl ?? "",
      NODE_ENV: "development",
    },
  },
});
