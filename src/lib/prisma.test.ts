import { afterEach, describe, expect, it } from "vitest";
import prisma, {
  createTenantClient,
  hideTrashed,
  prismaClientSingleton,
  runTenantOperation,
} from "./prisma";

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

  it("sets tenant scope before running the model query in the transaction", async () => {
    const calls: string[] = [];
    let finishScope!: () => void;
    const scopeIsSet = new Promise<void>((resolve) => {
      finishScope = resolve;
    });
    const tx = {
      $executeRaw: async () => {
        calls.push("scope-start");
        await scopeIsSet;
        calls.push("scope-finished");
      },
      maintenanceTask: {
        findMany: async (args: unknown) => {
          calls.push("model-query");
          expect(args).toEqual({
            where: { title: "Check pump", deletedAt: null },
          });
          return ["task"];
        },
      },
    };

    const pending = runTenantOperation(
      tx as never,
      "org-1",
      "MaintenanceTask",
      "findMany",
      { where: { title: "Check pump" } },
    );

    await Promise.resolve();
    expect(calls).toEqual(["scope-start"]);
    finishScope();
    await expect(pending).resolves.toEqual(["task"]);
    expect(calls).toEqual(["scope-start", "scope-finished", "model-query"]);
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
