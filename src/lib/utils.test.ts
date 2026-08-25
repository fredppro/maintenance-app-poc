import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { cn, formatCurrency, getCurrencyCode, getCurrencySymbol } from "./utils";

describe("cn utility", () => {
  test("merges single and multiple class names", () => {
    assert.strictEqual(cn("px-2", "py-1"), "px-2 py-1");
  });

  test("handles conditional class objects and falsy values", () => {
    assert.strictEqual(cn("base", false && "hidden", null, undefined, "active"), "base active");
    assert.strictEqual(cn({ "bg-red-500": true, "text-white": false }), "bg-red-500");
  });

  test("resolves Tailwind class conflicts properly", () => {
    assert.strictEqual(cn("p-4", "p-2"), "p-2");
    assert.strictEqual(cn("text-red-500", "text-blue-500"), "text-blue-500");
  });
});

describe("getCurrencyCode", () => {
  test("returns EUR for Portuguese locales", () => {
    assert.strictEqual(getCurrencyCode("pt"), "EUR");
    assert.strictEqual(getCurrencyCode("pt-PT"), "EUR");
    assert.strictEqual(getCurrencyCode("pt-BR"), "EUR");
  });

  test("returns USD for non-Portuguese locales", () => {
    assert.strictEqual(getCurrencyCode("en"), "USD");
    assert.strictEqual(getCurrencyCode("en-US"), "USD");
    assert.strictEqual(getCurrencyCode("fr"), "USD");
    assert.strictEqual(getCurrencyCode("es"), "USD");
  });
});

describe("getCurrencySymbol", () => {
  test("returns currency symbol based on locale default", () => {
    const ptSymbol = getCurrencySymbol("pt-PT");
    assert.strictEqual(ptSymbol, "€");

    const enSymbol = getCurrencySymbol("en-US");
    assert.strictEqual(enSymbol, "$");
  });

  test("returns explicit currency override symbol", () => {
    const eurSymbolInUs = getCurrencySymbol("en-US", "EUR");
    assert.strictEqual(eurSymbolInUs, "€");
  });
});

describe("formatCurrency", () => {
  test("formats currency values according to locale and default currency", () => {
    const enFormatted = formatCurrency(1250.5, "en-US");
    assert.ok(enFormatted.includes("1,250.50"));
    assert.ok(enFormatted.includes("$"));

    const ptFormatted = formatCurrency(1250.5, "pt-PT");
    assert.ok(ptFormatted.includes("1") && ptFormatted.includes("250,50"));
    assert.ok(ptFormatted.includes("€"));
  });

  test("formats currency values with custom currency code", () => {
    const formatted = formatCurrency(100, "en-US", "EUR");
    assert.ok(formatted.includes("100.00"));
    assert.ok(formatted.includes("€"));
  });
});
