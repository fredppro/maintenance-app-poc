import { LEGACY_ORGANIZATION_SLUG } from "@/lib/tenant-constants";
import prisma from "@/lib/prisma";

export type SignupPolicyConfig = {
  isProduction: boolean;
  /** The one address allowed to create the very first customer organization. */
  bootstrapEmail?: string;
};

const normalize = (email: string) => email.trim().toLowerCase();

async function hasNoCustomerOrganizations() {
  return (
    (await prisma.organization.count({ where: { slug: { not: LEGACY_ORGANIZATION_SLUG } } })) === 0
  );
}

async function isBootstrapOwner(email: string, config: SignupPolicyConfig) {
  return Boolean(
    config.bootstrapEmail &&
      normalize(email) === config.bootstrapEmail &&
      (await hasNoCustomerOrganizations()),
  );
}

/**
 * Production sign-up is invite-only: an account may be created for the bootstrap owner (while no
 * customer exists) or for an address with a pending, unexpired invitation.
 */
export async function mayCreateAccount(email: string, config: SignupPolicyConfig) {
  if (!config.isProduction) return true;
  if (await isBootstrapOwner(email, config)) return true;

  const pending = await prisma.invitation.findFirst({
    where: { email: normalize(email), status: "pending", expiresAt: { gt: new Date() } },
    select: { id: true },
  });
  return Boolean(pending);
}

/** In production only the bootstrap owner may create an organization themselves; others are provisioned. */
export async function mayCreateOrganization(email: string, config: SignupPolicyConfig) {
  if (!config.isProduction) return true;
  return isBootstrapOwner(email, config);
}
