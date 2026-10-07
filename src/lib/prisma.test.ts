import { afterEach, describe, expect, it } from "vitest";
import prisma, { createTenantClient, hideTrashed, prismaClientSingleton } from "./prisma";

describe("prisma client singleton", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it("throws when DATABASE_URL is missing", () => {
    delete process.env.DATABASE_URL;

    expect(() => prismaClientSingleton()).toThrow(/DATABASE_URL is missing/);
  });
});

describe("tenant client", () => {
  it("refuses an empty organization id", () => {
    expect(() => createTenantClient(prisma, "")).toThrow(/organizationId/);
  });
});

describe("soft-delete filter", () => {
  it("hides trashed rows on soft-deletable models", () => {
    expect(hideTrashed("Equipment", "findMany", { where: { name: "x" } })).toEqual({
      where: { name: "x", deletedAt: null },
    });
    expect(hideTrashed("Worker", "count", undefined)).toEqual({ where: { deletedAt: null } });
  });

  it("leaves explicit deletedAt queries, other models and writes alone", () => {
    const explicit = { where: { deletedAt: { not: null } } };
    expect(hideTrashed("Equipment", "findMany", explicit)).toBe(explicit);
    const optOut = { where: { deletedAt: undefined } };
    expect(hideTrashed("MaintenanceTask", "findMany", optOut)).toBe(optOut);
    const other = { where: { id: "1" } };
    expect(hideTrashed("Site", "findMany", other)).toBe(other);
    expect(hideTrashed("Equipment", "create", other)).toBe(other);
  });
});
