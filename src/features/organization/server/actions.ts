"use server";

import { cookies, headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/features/auth/server/auth";
import prisma, { forTenant } from "@/lib/prisma";
import { ACTIVE_SITE_COOKIE } from "@/lib/tenant-context";

export async function createInitialSite(input: {
  siteName: string;
  organizationId?: string;
}) {
  const { siteName, organizationId: requestedOrganizationId } = z
    .object({
      siteName: z.string().trim().min(2).max(100),
      organizationId: z.string().min(1).optional(),
    })
    .parse(input);
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });

  if (!session) {
    throw new Error("Authentication is required to create a site");
  }

  const organizationId =
    requestedOrganizationId ?? session.session.activeOrganizationId;
  if (!organizationId) {
    throw new Error("An active organization is required to create a site");
  }

  const membership = await prisma.member.findFirst({
    where: { organizationId, userId: session.user.id },
    select: { role: true },
  });

  if (
    !membership ||
    !["owner", "admin"].includes(membership.role)
  ) {
    throw new Error("Only an organization owner or admin can set up a site");
  }

  if (session.session.activeOrganizationId !== organizationId) {
    const activeOrganization = await auth.api.setActiveOrganization({
      headers: requestHeaders,
      body: { organizationId },
    });
    if (!activeOrganization) {
      throw new Error("The organization could not be selected");
    }
  }

  const existingSite = await forTenant(organizationId).site.findFirst({
    where: { organizationId },
    select: { id: true },
  });

  if (!existingSite) {
    await forTenant(organizationId).site.create({
      data: { name: siteName, organizationId },
    });
  }
}

export async function switchTenantContext(input: {
  organizationId: string;
  siteId: string;
}) {
  const { organizationId, siteId } = z
    .object({
      organizationId: z.string().min(1),
      siteId: z.string().min(1),
    })
    .parse(input);
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) throw new Error("Authentication is required");

  const [membership, site] = await Promise.all([
    prisma.member.findFirst({
      where: { organizationId, userId: session.user.id },
      select: { id: true },
    }),
    forTenant(organizationId).site.findFirst({
      where: { id: siteId, organizationId },
      select: { id: true },
    }),
  ]);
  if (!membership || !site) {
    throw new Error("The selected organization or site is not accessible");
  }

  if (session.session.activeOrganizationId !== organizationId) {
    await auth.api.setActiveOrganization({
      headers: requestHeaders,
      body: { organizationId },
    });
  }

  (await cookies()).set(ACTIVE_SITE_COOKIE, siteId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function switchActiveOrganization(input: {
  organizationId: string;
}) {
  const { organizationId } = z
    .object({ organizationId: z.string().min(1) })
    .parse(input);
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) throw new Error("Authentication is required");

  const membership = await prisma.member.findFirst({
    where: { organizationId, userId: session.user.id },
    select: { id: true },
  });
  if (!membership) throw new Error("The selected organization is not accessible");

  const result = await auth.api.setActiveOrganization({
    headers: requestHeaders,
    body: { organizationId },
  });
  if (!result) throw new Error("The active organization could not be changed");

  (await cookies()).delete(ACTIVE_SITE_COOKIE);
}
