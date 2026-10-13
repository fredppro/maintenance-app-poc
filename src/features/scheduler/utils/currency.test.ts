import { describe, expect, it } from "vitest";
import {
  formatCurrency,
  getCurrencyCode,
  getCurrencySymbol,
} from "./currency";

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
    expect(getCurrencySymbol("pt-PT")).toBe("€");
    expect(getCurrencySymbol("en-US")).toBe("$");
  });

  it("returns explicit currency override symbol", () => {
    expect(getCurrencySymbol("en-US", "EUR")).toBe("€");
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
