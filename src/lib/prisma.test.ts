import { afterEach, describe, expect, it } from "vitest";
import { prismaClientSingleton } from "./prisma";

describe("prisma client singleton", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }

    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it("throws when DATABASE_URL is missing", () => {
    delete process.env.DATABASE_URL;
    process.env.NODE_ENV = "production";

    expect(() => prismaClientSingleton()).toThrow(/DATABASE_URL is missing/);
  });
});
