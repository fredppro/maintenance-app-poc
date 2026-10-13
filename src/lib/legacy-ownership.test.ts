import { describe, expect, it } from "vitest";
import { readLegacyOwnershipConfig } from "../../scripts/legacy/legacy-ownership";

const validEnvironment: Partial<NodeJS.ProcessEnv> = {
  LEGACY_OWNER_EMAIL: "owner@example.com",
  LEGACY_ORGANIZATION_NAME: "Acme Plastics",
  LEGACY_ORGANIZATION_SLUG: "acme-plastics",
  LEGACY_SITE_NAME: "Main Plant",
  LEGACY_ASSIGNMENT_OPERATOR: "operations@example.com",
  LEGACY_ASSIGNMENT_TICKET: "PILOT-184",
  CONFIRM_LEGACY_OWNERSHIP: "ASSIGN LEGACY DATA TO owner@example.com",
};

describe("readLegacyOwnershipConfig", () => {
  it("accepts a complete explicit owner assignment", () => {
    expect(readLegacyOwnershipConfig(validEnvironment)).toEqual({
      ownerEmail: "owner@example.com",
      organizationName: "Acme Plastics",
      organizationSlug: "acme-plastics",
      siteName: "Main Plant",
      operator: "operations@example.com",
      ticket: "PILOT-184",
    });
  });

  it("requires the exact owner confirmation", () => {
    expect(() =>
      readLegacyOwnershipConfig({
        ...validEnvironment,
        CONFIRM_LEGACY_OWNERSHIP: "yes",
      }),
    ).toThrow("CONFIRM_LEGACY_OWNERSHIP must exactly match");
  });

  it("does not permit using the unclaimed legacy slug as the customer slug", () => {
    expect(() =>
      readLegacyOwnershipConfig({
        ...validEnvironment,
        LEGACY_ORGANIZATION_SLUG: "legacy-workspace",
        CONFIRM_LEGACY_OWNERSHIP: "ASSIGN LEGACY DATA TO owner@example.com",
      }),
    ).toThrow("must be a new lowercase URL-safe slug");
  });

  it("requires an accountable operator and approval ticket", () => {
    expect(() =>
      readLegacyOwnershipConfig({
        ...validEnvironment,
        LEGACY_ASSIGNMENT_TICKET: "",
      }),
    ).toThrow("LEGACY_ASSIGNMENT_TICKET is required");
  });
});
