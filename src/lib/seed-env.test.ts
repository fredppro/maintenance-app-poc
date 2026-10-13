import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("dotenv/config", () => ({}));

describe("owner-role script environment (prisma/seed-env)", () => {
  const original = { ...process.env };

  beforeEach(() => vi.resetModules());
  afterEach(() => {
    process.env = { ...original };
  });

  it("points DATABASE_URL at the migration owner and ignores APP_DATABASE_URL", async () => {
    process.env.MIGRATION_DATABASE_URL = "postgresql://owner:pw@localhost:5432/app";
    process.env.DATABASE_URL = "postgresql://runtime:pw@localhost:5432/app";
    process.env.APP_DATABASE_URL = "postgresql://runtime:pw@elsewhere.example.com/app";

    await import("../../prisma/seed-env");
    const { resolveRuntimeDatabaseUrl } = await import("./database-url");

    expect(process.env.DATABASE_URL).toBe("postgresql://owner:pw@localhost:5432/app");
    expect(process.env.APP_DATABASE_URL).toBeUndefined();
    expect(resolveRuntimeDatabaseUrl()).toBe("postgresql://owner:pw@localhost:5432/app");
  });

  it("leaves everything alone when no migration URL is configured", async () => {
    delete process.env.MIGRATION_DATABASE_URL;
    process.env.DATABASE_URL = "postgresql://runtime:pw@localhost:5432/app";
    process.env.APP_DATABASE_URL = "postgresql://custom:pw@localhost:5432/app";

    await import("../../prisma/seed-env");

    expect(process.env.DATABASE_URL).toBe("postgresql://runtime:pw@localhost:5432/app");
    expect(process.env.APP_DATABASE_URL).toBe("postgresql://custom:pw@localhost:5432/app");
  });
});
