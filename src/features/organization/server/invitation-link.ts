import prisma from "@/lib/prisma";
import { resolveOrganizationLocale } from "../shared/organization-settings";

/** Invitation link in the organization's default language. */
export async function buildInvitationUrl(
  organizationId: string,
  invitationId: string,
  origin: URL,
) {
  const settings = await prisma.tenantSettings.findUnique({
    where: { organizationId },
    select: { locale: true },
  });
  const url = new URL(`/${resolveOrganizationLocale(settings?.locale)}/accept-invitation`, origin);
  url.searchParams.set("id", invitationId);
  return url;
}
