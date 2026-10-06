"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/features/auth/server/auth";
import prisma from "@/lib/prisma";

export async function createInitialSite(input: {
  siteName: string;
}) {
  const { siteName } = z
    .object({ siteName: z.string().trim().min(2).max(100) })
    .parse(input);
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });

  if (!session) {
    throw new Error("Authentication is required to create a site");
  }

  const organizationId = session.session.activeOrganizationId;
  if (!organizationId) {
    throw new Error("An active organization is required to create a site");
  }

  const membership = await prisma.member.findFirst({
    where: { organizationId, userId: session.user.id },
    select: { role: true },
  });

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    throw new Error("Only an organization owner or admin can set up a site");
  }

  const existingSite = await prisma.site.findFirst({
    where: { organizationId },
    select: { id: true },
  });

  if (!existingSite) {
    await prisma.site.create({
      data: { name: siteName, organizationId },
    });
  }
}
