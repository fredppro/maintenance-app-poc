import { describe, expect, it } from "vitest";
import { getValidLocale, localeSchema } from "./locale";
import { routing } from "./routing";

describe("locale validation", () => {
  it("accepts valid supported locales", () => {
    expect(getValidLocale("en")).toBe("en");
    expect(getValidLocale("pt-pt")).toBe("pt-pt");
  });

  it("falls back to defaultLocale for unsupported or invalid strings", () => {
    expect(getValidLocale("fr")).toBe(routing.defaultLocale);
    expect(getValidLocale("de")).toBe(routing.defaultLocale);
    expect(getValidLocale("")).toBe(routing.defaultLocale);
    expect(getValidLocale("unknown")).toBe(routing.defaultLocale);
  });

  it("falls back to defaultLocale for non-string inputs", () => {
    expect(getValidLocale(null)).toBe(routing.defaultLocale);
    expect(getValidLocale(undefined)).toBe(routing.defaultLocale);
    expect(getValidLocale(123)).toBe(routing.defaultLocale);
    expect(getValidLocale({})).toBe(routing.defaultLocale);
  });

  it("localeSchema parses valid locales and rejects invalid ones", () => {
    expect(localeSchema.safeParse("en").success).toBe(true);
    expect(localeSchema.safeParse("pt-pt").success).toBe(true);
    expect(localeSchema.safeParse("invalid").success).toBe(false);
  });
});
