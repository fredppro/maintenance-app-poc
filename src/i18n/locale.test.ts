import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { getValidLocale, localeSchema } from "./locale";
import { routing } from "./routing";

describe("locale validation", () => {
  test("accepts valid supported locales", () => {
    assert.strictEqual(getValidLocale("en"), "en");
    assert.strictEqual(getValidLocale("pt-pt"), "pt-pt");
  });

  test("falls back to defaultLocale for unsupported or invalid strings", () => {
    assert.strictEqual(getValidLocale("fr"), routing.defaultLocale);
    assert.strictEqual(getValidLocale("de"), routing.defaultLocale);
    assert.strictEqual(getValidLocale(""), routing.defaultLocale);
    assert.strictEqual(getValidLocale("unknown"), routing.defaultLocale);
  });

  test("falls back to defaultLocale for non-string inputs", () => {
    assert.strictEqual(getValidLocale(null), routing.defaultLocale);
    assert.strictEqual(getValidLocale(undefined), routing.defaultLocale);
    assert.strictEqual(getValidLocale(123), routing.defaultLocale);
    assert.strictEqual(getValidLocale({}), routing.defaultLocale);
  });

  test("localeSchema parses valid locales and rejects invalid ones", () => {
    assert.strictEqual(localeSchema.safeParse("en").success, true);
    assert.strictEqual(localeSchema.safeParse("pt-pt").success, true);
    assert.strictEqual(localeSchema.safeParse("invalid").success, false);
  });
});
