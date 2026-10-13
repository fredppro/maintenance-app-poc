"use server";

import prisma from "@/lib/prisma";
import {
  getOrganizationContext,
  roleCan,
} from "@/lib/tenant-context";
import type { OnboardingProgress } from "../shared/onboarding";

/**
 * Counts for the "Getting started" checklist of the active organization, or null when the
 * checklist should not show (the member cannot manage the organization, or it was dismissed).
 * Every query is scoped to the organization: tenant tables go through `db` (RLS), and the
 * app-level tables (member, invitation, tenant_settings) filter by `organizationId` explicitly.
 */
export async function getOnboardingProgress(): Promise<OnboardingProgress | null> {
  const { organizationId, db, role } = await getOrganizationContext("viewMaintenance");
  if (!roleCan(role, "manageOrganization")) return null;

  const [settings, sites, equipment, workers, tasks, members, invitations] = await Promise.all([
    prisma.tenantSettings.findUnique({
      where: { organizationId },
      select: { onboardingDismissedAt: true },
    }),
    db.site.count({ where: { organizationId } }),
    db.equipment.count({ where: { organizationId } }),
    db.worker.count({ where: { organizationId } }),
    db.maintenanceTask.count({ where: { organizationId } }),
    prisma.member.count({ where: { organizationId } }),
    // The operator-created owner invitation is not "inviting your team".
    prisma.invitation.count({
      where: {
        organizationId,
        status: { in: ["pending", "accepted"] },
        OR: [{ role: null }, { role: { not: "owner" } }],
      },
    }),
  ]);
  if (settings?.onboardingDismissedAt) return null;

  return { sites, equipment, workers, tasks, members, invitations };
}

/** Hides the checklist for the whole organization. */
export async function dismissOnboarding() {
  const { organizationId } = await getOrganizationContext("manageOrganization");
  const onboardingDismissedAt = new Date();
  await prisma.tenantSettings.upsert({
    where: { organizationId },
    create: { organizationId, onboardingDismissedAt },
    update: { onboardingDismissedAt },
  });
}
