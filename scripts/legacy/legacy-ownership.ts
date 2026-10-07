import { LEGACY_ORGANIZATION_SLUG } from "../src/lib/tenant-constants";

export type LegacyOwnershipConfig = {
  ownerEmail: string;
  organizationName: string;
  organizationSlug: string;
  siteName: string;
  operator: string;
  ticket: string;
};

export function readLegacyOwnershipConfig(
  env: Readonly<Record<string, string | undefined>>,
): LegacyOwnershipConfig {
  const required = (key: string) => {
    const value = env[key]?.trim();
    if (!value) throw new Error(`${key} is required`);
    return value;
  };

  const ownerEmail = required("LEGACY_OWNER_EMAIL").toLowerCase();
  const organizationName = required("LEGACY_ORGANIZATION_NAME");
  const organizationSlug = required("LEGACY_ORGANIZATION_SLUG").toLowerCase();
  const siteName = required("LEGACY_SITE_NAME");
  const operator = required("LEGACY_ASSIGNMENT_OPERATOR");
  const ticket = required("LEGACY_ASSIGNMENT_TICKET");
  const confirmation = required("CONFIRM_LEGACY_OWNERSHIP");

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
    throw new Error("LEGACY_OWNER_EMAIL must be a valid email address");
  }
  if (organizationName.length < 2 || organizationName.length > 100) {
    throw new Error("LEGACY_ORGANIZATION_NAME must be 2 to 100 characters");
  }
  if (
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(organizationSlug) ||
    organizationSlug.length > 63 ||
    organizationSlug === LEGACY_ORGANIZATION_SLUG
  ) {
    throw new Error(
      "LEGACY_ORGANIZATION_SLUG must be a new lowercase URL-safe slug",
    );
  }
  if (siteName.length < 2 || siteName.length > 100) {
    throw new Error("LEGACY_SITE_NAME must be 2 to 100 characters");
  }
  if (operator.length < 2 || ticket.length < 1) {
    throw new Error(
      "LEGACY_ASSIGNMENT_OPERATOR and LEGACY_ASSIGNMENT_TICKET must identify the accountable operator and approval",
    );
  }

  const expectedConfirmation = `ASSIGN LEGACY DATA TO ${ownerEmail}`;
  if (confirmation !== expectedConfirmation) {
    throw new Error(
      `CONFIRM_LEGACY_OWNERSHIP must exactly match: ${expectedConfirmation}`,
    );
  }

  return {
    ownerEmail,
    organizationName,
    organizationSlug,
    siteName,
    operator,
    ticket,
  };
}
