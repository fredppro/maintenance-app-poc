import { headers } from "next/headers";
import { auth } from "@/features/auth/server/auth";
import prisma from "@/lib/prisma";

export class AuthenticationRequiredError extends Error {
  constructor() {
    super("Authentication is required");
    this.name = "AuthenticationRequiredError";
  }
}

export class OrganizationRequiredError extends Error {
  constructor() {
    super("An active organization is required");
    this.name = "OrganizationRequiredError";
  }
}

export class SiteSetupRequiredError extends Error {
  constructor() {
    super("The active organization needs a site");
    this.name = "SiteSetupRequiredError";
  }
}

export async function getTenantContext() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    throw new AuthenticationRequiredError();
  }

  const organizationId = session.session.activeOrganizationId;
  if (!organizationId) {
    throw new OrganizationRequiredError();
  }

  const membership = await prisma.member.findFirst({
    where: {
      organizationId,
      userId: session.user.id,
    },
    select: { role: true },
  });

  if (!membership) {
    throw new OrganizationRequiredError();
  }

  const site = await prisma.site.findFirst({
    where: { organizationId },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  if (!site) {
    throw new SiteSetupRequiredError();
  }

  return {
    userId: session.user.id,
    organizationId,
    siteId: site.id,
    role: membership.role,
  };
}
