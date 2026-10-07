import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";

// One-command local setup: `pnpm bootstrap`. Safe to re-run; it never overwrites an existing .env.
function run(label: string, command: string, args: string[]) {
  console.log(`\n==> ${label}`);
  const result = spawnSync(command, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) {
    console.error(`\nFailed: ${label}`);
    process.exit(result.status ?? 1);
  }
}

function has(command: string, args = ["--version"]) {
  return spawnSync(command, args, { stdio: "ignore" }).status === 0;
}

const major = Number(process.versions.node.split(".")[0]);
const required = Number(readFileSync(".node-version", "utf8").trim().split(".")[0]);
if (major < required) {
  console.error(`Node ${required}+ required (found ${process.versions.node}). See .node-version.`);
  process.exit(1);
}
if (!has("docker", ["compose", "version"])) {
  console.error("Docker with the compose plugin is required for the local database.");
  process.exit(1);
}

if (!existsSync(".env")) {
  copyFileSync(".env.example", ".env");
  const secret = randomBytes(32).toString("base64");
  writeFileSync(
    ".env",
    readFileSync(".env", "utf8").replace(/^BETTER_AUTH_SECRET=.*$/m, `BETTER_AUTH_SECRET="${secret}"`),
  );
  console.log("Created .env from .env.example with a generated BETTER_AUTH_SECRET.");
} else {
  console.log(".env already exists; leaving it untouched.");
}

const env = readFileSync(".env", "utf8");
const migrationUrl = /^MIGRATION_DATABASE_URL="?([^"\n]+)"?/m.exec(env)?.[1] ?? "";
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(migrationUrl)) {
  console.error("MIGRATION_DATABASE_URL in .env is not local; refusing to migrate a remote database.");
  process.exit(1);
}

run("Installing dependencies", "pnpm", ["install"]);
run("Starting local PostgreSQL", "pnpm", ["db:up"]);
run("Applying migrations", "pnpm", ["db:migrate:deploy"]);

console.log("\nReady. Start the app with `pnpm dev` and open http://localhost:3000");
console.log("Sign up, create an organization, then optionally set SEED_ADMIN_EMAIL in .env and run `pnpm db:seed`.");
console.log("Optional: `pnpm db:e2e:up` then `pnpm test:e2e` for end-to-end tests.");
