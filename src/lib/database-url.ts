import { createHmac } from "node:crypto";

// Created by the build as the DB owner (not via the Neon console, whose roles can bypass RLS and cannot be altered by the owner).
export const RUNTIME_ROLE = "maintenance_runtime";

// Connection string the app (and role provisioning) should use at runtime.
// 1. APP_DATABASE_URL wins when set.
// 2. On Vercel with an integration-managed DATABASE_URL (owner role), the restricted runtime role
//    is derived from it: same host/database, runtime role name, password derived from BETTER_AUTH_SECRET.
//    `scripts/db/provision-runtime-role.ts` sets that same password during the build.
// 3. Otherwise DATABASE_URL is used as-is (local Docker already points it at the runtime role).
export function resolveRuntimeDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const explicit = env.APP_DATABASE_URL?.trim();
  if (explicit) return explicit;

  const base = env.DATABASE_URL?.trim();
  if (!base || !env.VERCEL) return base;

  const url = new URL(base);
  if (decodeURIComponent(url.username) === RUNTIME_ROLE) return base;

  const secret = env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET is required to derive the runtime database role password");

  url.username = RUNTIME_ROLE;
  url.password = createHmac("sha256", secret).update(`runtime-db-role:${RUNTIME_ROLE}`).digest("hex").slice(0, 48);
  url.searchParams.delete("channel_binding");
  if (url.searchParams.get("sslmode") === "require") url.searchParams.set("sslmode", "verify-full");
  return url.toString();
}
