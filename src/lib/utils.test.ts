import { describe, expect, it } from "vitest";
import { cn, formatCurrency, getCurrencyCode, getCurrencySymbol } from "./utils";

describe("cn utility", () => {
  it("merges single and multiple class names", () => {
    expect(cn("px-2", "py-1")).toBe("px-2 py-1");
  });

  it("handles conditional class objects and falsy values", () => {
    expect(cn("base", false && "hidden", null, undefined, "active")).toBe("base active");
    expect(cn({ "bg-red-500": true, "text-white": false })).toBe("bg-red-500");
  });

  it("resolves Tailwind class conflicts properly", () => {
    expect(cn("p-4", "p-2")).toBe("p-2");
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
  });
});

describe("getCurrencyCode", () => {
  it("returns EUR for Portuguese locales", () => {
    expect(getCurrencyCode("pt")).toBe("EUR");
    expect(getCurrencyCode("pt-PT")).toBe("EUR");
    expect(getCurrencyCode("pt-BR")).toBe("EUR");
  });

  it("returns USD for non-Portuguese locales", () => {
    expect(getCurrencyCode("en")).toBe("USD");
    expect(getCurrencyCode("en-US")).toBe("USD");
    expect(getCurrencyCode("fr")).toBe("USD");
    expect(getCurrencyCode("es")).toBe("USD");
  });
});

describe("getCurrencySymbol", () => {
  it("returns currency symbol based on locale default", () => {
    const ptSymbol = getCurrencySymbol("pt-PT");
    expect(ptSymbol).toBe("€");

    const enSymbol = getCurrencySymbol("en-US");
    expect(enSymbol).toBe("$");
  });

  it("returns explicit currency override symbol", () => {
    const eurSymbolInUs = getCurrencySymbol("en-US", "EUR");
    expect(eurSymbolInUs).toBe("€");
  });
});

describe("formatCurrency", () => {
  it("formats currency values according to locale and default currency", () => {
    const enFormatted = formatCurrency(1250.5, "en-US");
    expect(enFormatted).toContain("1,250.50");
    expect(enFormatted).toContain("$");

    const ptFormatted = formatCurrency(1250.5, "pt-PT");
    expect(ptFormatted).toContain("1");
    expect(ptFormatted).toContain("250,50");
    expect(ptFormatted).toContain("€");
  });

  it("formats currency values with custom currency code", () => {
    const formatted = formatCurrency(100, "en-US", "EUR");
    expect(formatted).toContain("100.00");
    expect(formatted).toContain("€");
  });
});
