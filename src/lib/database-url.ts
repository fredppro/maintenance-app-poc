import { createHmac } from "node:crypto";

export const RUNTIME_ROLE_PREFIX = "maintenance_runtime";

// Created by the build as the DB owner (not via the Neon console, whose roles can bypass RLS and cannot be altered by the owner).
// Each Vercel environment gets its own role (maintenance_runtime_production, _preview), because every
// build resets its role's password: a Preview build must never change the password Production runs with,
// even when both share one database and have different BETTER_AUTH_SECRET values.
export function runtimeRoleName(env: NodeJS.ProcessEnv = process.env) {
  const scope = env.VERCEL_ENV?.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  return scope ? `${RUNTIME_ROLE_PREFIX}_${scope}` : RUNTIME_ROLE_PREFIX;
}

// Connection string the app (and role provisioning) should use at runtime.
// 1. APP_DATABASE_URL wins when set.
// 2. On Vercel with an integration-managed DATABASE_URL (owner role), the restricted runtime role
//    is derived from it: same host/database, the environment's runtime role, password derived from BETTER_AUTH_SECRET.
//    `scripts/db/provision-runtime-role.ts` sets that same password during the build.
// 3. Otherwise DATABASE_URL is used as-is (local Docker already points it at the runtime role).
export function resolveRuntimeDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const explicit = env.APP_DATABASE_URL?.trim();
  if (explicit) return explicit;

  const base = env.DATABASE_URL?.trim();
  if (!base || !env.VERCEL) return base;

  const role = runtimeRoleName(env);
  const url = new URL(base);
  if (decodeURIComponent(url.username) === role) return base;

  const secret = env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET is required to derive the runtime database role password");

  url.username = role;
  url.password = createHmac("sha256", secret).update(`runtime-db-role:${role}`).digest("hex").slice(0, 48);
  url.searchParams.delete("channel_binding");
  if (url.searchParams.get("sslmode") === "require") url.searchParams.set("sslmode", "verify-full");
  return url.toString();
}
