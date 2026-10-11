import { describe, expect, it } from "vitest";
import {
  DEFAULT_ORGANIZATION_LOCALE,
  firstErrorPerField,
  DEFAULT_ORGANIZATION_TIMEZONE,
  organizationSettingsSchema,
  resolveOrganizationLocale,
  supportedTimeZones,
  toSettingsView,
} from "./organization-settings";

const valid = {
  name: "ACME Facilities",
  contactEmail: "office@acme.pt",
  contactPhone: "+351 21 000 0000",
  timezone: "Europe/Lisbon",
  locale: "pt-pt",
  logoFileId: null,
};

const errorCodes = (input: unknown) => {
  const result = organizationSettingsSchema.safeParse(input);
  return result.success ? {} : firstErrorPerField(result.error);
};

describe("organizationSettingsSchema", () => {
  it("accepts a complete, valid profile", () => {
    expect(organizationSettingsSchema.parse(valid)).toEqual(valid);
  });

  it("trims the name and normalizes the contact email to lower case", () => {
    const parsed = organizationSettingsSchema.parse({ ...valid, name: "  ACME  ", contactEmail: " Office@ACME.pt " });
    expect(parsed).toMatchObject({ name: "ACME", contactEmail: "office@acme.pt" });
  });

  it("treats empty contact details as not set", () => {
    expect(organizationSettingsSchema.parse({ ...valid, contactEmail: "  ", contactPhone: "" })).toMatchObject({
      contactEmail: null,
      contactPhone: null,
    });
  });

  it("rejects short, long and control-character names", () => {
    expect(errorCodes({ ...valid, name: "A" })).toEqual({ name: "tooShort" });
    expect(errorCodes({ ...valid, name: "x".repeat(101) })).toEqual({ name: "tooLong" });
    expect(errorCodes({ ...valid, name: "Bad\u0007Name" })).toEqual({ name: "invalid" });
  });

  it("rejects malformed contact details", () => {
    expect(errorCodes({ ...valid, contactEmail: "not-an-email" })).toEqual({ contactEmail: "invalid" });
    expect(errorCodes({ ...valid, contactPhone: "call me" })).toEqual({ contactPhone: "invalid" });
    expect(errorCodes({ ...valid, contactPhone: "12" })).toEqual({ contactPhone: "invalid" });
    expect(errorCodes({ ...valid, contactPhone: "1".repeat(31) })).toEqual({ contactPhone: "tooLong" });
  });

  it("accepts only supported locales and exact IANA time zones", () => {
    expect(errorCodes({ ...valid, locale: "fr" })).toEqual({ locale: "invalid" });
    expect(errorCodes({ ...valid, timezone: "Mars/Olympus" })).toEqual({ timezone: "invalid" });
    expect(errorCodes({ ...valid, timezone: "europe/lisbon" })).toEqual({ timezone: "invalid" });
    expect(organizationSettingsSchema.parse({ ...valid, timezone: "UTC" }).timezone).toBe("UTC");
    expect(organizationSettingsSchema.parse({ ...valid, timezone: "America/Sao_Paulo" }).timezone).toBe(
      "America/Sao_Paulo",
    );
  });

  it("does not let extra fields such as lifecycle status through", () => {
    const parsed = organizationSettingsSchema.parse({ ...valid, status: "SUSPENDED", organizationId: "org-b" });
    expect(Object.keys(parsed).sort()).toEqual(
      ["contactEmail", "contactPhone", "locale", "logoFileId", "name", "timezone"].sort(),
    );
  });
});

describe("supportedTimeZones", () => {
  it("includes UTC and the default time zone", () => {
    const zones = supportedTimeZones();
    expect(zones).toContain("UTC");
    expect(zones).toContain(DEFAULT_ORGANIZATION_TIMEZONE);
  });
});

describe("toSettingsView", () => {
  it("fills defaults for an organization that never saved settings", () => {
    expect(toSettingsView({ name: "ACME" }, null)).toEqual({
      name: "ACME",
      contactEmail: "",
      contactPhone: "",
      timezone: DEFAULT_ORGANIZATION_TIMEZONE,
      locale: DEFAULT_ORGANIZATION_LOCALE,
      logoFileId: null,
    });
  });

  it("returns saved values and falls back when a stored locale is no longer supported", () => {
    const saved = { contactEmail: "a@b.pt", contactPhone: null, timezone: "UTC", locale: "xx", logoFileId: "f-1" };
    expect(toSettingsView({ name: "ACME" }, saved)).toMatchObject({
      contactEmail: "a@b.pt",
      contactPhone: "",
      timezone: "UTC",
      locale: DEFAULT_ORGANIZATION_LOCALE,
      logoFileId: "f-1",
    });
  });
});

describe("resolveOrganizationLocale", () => {
  it("uses a supported saved locale and otherwise the default", () => {
    expect(resolveOrganizationLocale("pt-pt")).toBe("pt-pt");
    expect(resolveOrganizationLocale("fr")).toBe(DEFAULT_ORGANIZATION_LOCALE);
    expect(resolveOrganizationLocale(null)).toBe(DEFAULT_ORGANIZATION_LOCALE);
    expect(resolveOrganizationLocale(undefined)).toBe(DEFAULT_ORGANIZATION_LOCALE);
  });
});
