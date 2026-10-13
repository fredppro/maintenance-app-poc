import { describe, expect, it } from "vitest";
import { resolveRuntimeDatabaseUrl, runtimeRoleName } from "./database-url";

const owner =
  "postgresql://neondb_owner:owner-secret@ep-example-pooler.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
const vercel = (extra: Record<string, string> = {}) => ({
  NODE_ENV: "production",
  VERCEL: "1",
  VERCEL_ENV: "production",
  BETTER_AUTH_SECRET: "a-secret-that-is-at-least-thirty-two-chars",
  DATABASE_URL: owner,
  ...extra,
});

const parse = (value: string | undefined) => new URL(value as string);

describe("runtimeRoleName", () => {
  it("is scoped to the Vercel environment so environments never share a role", () => {
    expect(runtimeRoleName({ VERCEL_ENV: "production" } as never)).toBe("maintenance_runtime_production");
    expect(runtimeRoleName({ VERCEL_ENV: "preview" } as never)).toBe("maintenance_runtime_preview");
    expect(runtimeRoleName({} as never)).toBe("maintenance_runtime");
  });

  it("only produces safe identifier characters", () => {
    expect(runtimeRoleName({ VERCEL_ENV: "Pre view;DROP" } as never)).toBe("maintenance_runtime_pre_view_drop");
  });
});

describe("resolveRuntimeDatabaseUrl", () => {
  it("returns DATABASE_URL untouched outside Vercel (local Docker already uses the runtime role)", () => {
    const url = "postgresql://maintenance_app_runtime:pw@localhost:5432/maintenance_app";
    expect(resolveRuntimeDatabaseUrl({ DATABASE_URL: url } as never)).toBe(url);
  });

  it("lets APP_DATABASE_URL win everywhere", () => {
    const explicit = "postgresql://custom:pw@db.example.com/app";
    expect(resolveRuntimeDatabaseUrl(vercel({ APP_DATABASE_URL: ` ${explicit} ` }) as never)).toBe(explicit);
  });

  it("derives a restricted role on Vercel: same host and database, never the owner", () => {
    const url = parse(resolveRuntimeDatabaseUrl(vercel() as never));

    expect(url.username).toBe("maintenance_runtime_production");
    expect(url.username).not.toBe("neondb_owner");
    expect(url.password).toHaveLength(48);
    expect(url.password).not.toContain("owner-secret");
    expect(url.host).toBe("ep-example-pooler.c-6.us-east-1.aws.neon.tech");
    expect(url.pathname).toBe("/neondb");
  });

  it("drops channel_binding and upgrades sslmode=require", () => {
    const url = parse(resolveRuntimeDatabaseUrl(vercel() as never));

    expect(url.searchParams.has("channel_binding")).toBe(false);
    expect(url.searchParams.get("sslmode")).toBe("verify-full");
  });

  it("is deterministic, so the build and the running app agree on the password", () => {
    expect(resolveRuntimeDatabaseUrl(vercel() as never)).toBe(resolveRuntimeDatabaseUrl(vercel() as never));
  });

  it("gives Preview and Production different roles and passwords", () => {
    const production = parse(resolveRuntimeDatabaseUrl(vercel({ VERCEL_ENV: "production" }) as never));
    const preview = parse(resolveRuntimeDatabaseUrl(vercel({ VERCEL_ENV: "preview" }) as never));

    expect(preview.username).toBe("maintenance_runtime_preview");
    expect(preview.username).not.toBe(production.username);
    expect(preview.password).not.toBe(production.password);
  });

  it("changes the password when BETTER_AUTH_SECRET changes, and requires it", () => {
    const other = parse(resolveRuntimeDatabaseUrl(vercel({ BETTER_AUTH_SECRET: "another-secret-that-is-long-enough-1" }) as never));
    expect(other.password).not.toBe(parse(resolveRuntimeDatabaseUrl(vercel() as never)).password);

    expect(() => resolveRuntimeDatabaseUrl(vercel({ BETTER_AUTH_SECRET: "" }) as never)).toThrow("BETTER_AUTH_SECRET");
  });

  it("keeps a DATABASE_URL that already names the environment's runtime role", () => {
    const already = "postgresql://maintenance_runtime_production:pw@host.example.com/db?sslmode=verify-full";
    expect(resolveRuntimeDatabaseUrl(vercel({ DATABASE_URL: already }) as never)).toBe(already);
  });

  it("returns undefined when there is no DATABASE_URL", () => {
    expect(resolveRuntimeDatabaseUrl({ VERCEL: "1" } as never)).toBeUndefined();
  });
});
