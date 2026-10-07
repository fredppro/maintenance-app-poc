import "dotenv/config";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { validateE2EDatabaseUrl } from "../tests/e2e/test-database";

process.env.DATABASE_URL = validateE2EDatabaseUrl(
  process.env.E2E_DATABASE_URL,
  process.env.DATABASE_URL,
);

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
