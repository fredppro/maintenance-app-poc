import "dotenv/config";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { validateE2EDatabaseUrl } from "../../tests/e2e/test-database";

const e2eDatabaseUrl = validateE2EDatabaseUrl(
  process.env.E2E_DATABASE_URL,
  process.env.DATABASE_URL,
);
// prisma.config.ts prefers these over DATABASE_URL, so a Neon-backed .env would otherwise win.
process.env.DATABASE_URL = e2eDatabaseUrl;
process.env.MIGRATION_DATABASE_URL = e2eDatabaseUrl;
process.env.DATABASE_URL_UNPOOLED = e2eDatabaseUrl;

const require = createRequire(import.meta.url);
const prismaCli = require.resolve("prisma/build/index.js");
const result = spawnSync(process.execPath, [prismaCli, "migrate", "deploy"], {
  env: process.env,
  stdio: "inherit",
});

if (result.error) {
  throw result.error;
}

if (result.status === null) {
  throw new Error(`Prisma migrations terminated by signal ${result.signal}.`);
}

if (result.status !== 0) {
  process.exitCode = result.status;
}
