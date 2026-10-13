import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";
import { validateE2EDatabaseUrl } from "./tests/e2e/test-database";

process.env.BETTER_AUTH_SECRET ??=
  "playwright-e2e-secret-that-is-at-least-thirty-two-chars";
process.env.BETTER_AUTH_URL = "http://127.0.0.1:3000";

const databaseUrl = process.env.E2E_DATABASE_URL;

if (databaseUrl) {
  validateE2EDatabaseUrl(databaseUrl);
}

// Global setup/teardown seed with the owner URL; the app under test runs as the restricted role so
// row-level security is enforced.
const appDatabaseUrl = databaseUrl
  ? (() => {
      const url = new URL(databaseUrl);
      url.username = "maintenance_app_runtime";
      url.password = "maintenance_app_runtime";
      return url.toString();
    })()
  : "";

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
    command: `"${process.execPath}" ./node_modules/next/dist/bin/next dev --hostname 127.0.0.1`,
    url: "http://127.0.0.1:3000/en",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: appDatabaseUrl,
      BETTER_AUTH_SECRET:
        process.env.BETTER_AUTH_SECRET ??
        "playwright-e2e-secret-that-is-at-least-thirty-two-chars",
      BETTER_AUTH_URL: "http://127.0.0.1:3000",
      NODE_ENV: "development",
    },
  },
});
