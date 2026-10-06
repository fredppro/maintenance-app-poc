import { afterEach, describe, expect, it } from "vitest";
import { prismaClientSingleton } from "./prisma";

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
