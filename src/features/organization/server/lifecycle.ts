"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DELETION_GRACE_DAYS } from "@/features/organization/deletion";
import { auth } from "@/features/auth/server/auth";
import { recordAuditEvent } from "@/lib/audit";
import prisma from "@/lib/prisma";
import { getTenantContext } from "@/lib/tenant-context";


/**
 * Owner check that deliberately bypasses `getTenantContext`: a tenant that is
 * pending deletion is inactive there, yet its owner must still be able to cancel.
 */
async function requireActiveOrganizationOwner() {
  const session = await auth.api.getSession({ headers: await headers() });
  const organizationId = session?.session.activeOrganizationId;
  if (!session || !organizationId) throw new Error("Authentication is required");

  const membership = await prisma.member.findFirst({
    where: { organizationId, userId: session.user.id, role: "owner" },
    select: { id: true },
  });
  if (!membership) throw new Error("Only an organization owner can do this");
  return { userId: session.user.id, organizationId };
}

export async function requestOrganizationDeletion() {
  const { userId, organizationId } = await requireActiveOrganizationOwner();
  const settings = await prisma.tenantSettings.findUnique({ where: { organizationId } });
  if (settings && settings.status !== "ACTIVE") {
    throw new Error("The organization is not active");
  }

  const requestedAt = new Date();
  const scheduledFor = new Date(requestedAt.getTime() + DELETION_GRACE_DAYS * 86_400_000);
  const data = {
    status: "PENDING_DELETION" as const,
    deletionRequestedAt: requestedAt,
    deletionScheduledFor: scheduledFor,
  };
  await prisma.tenantSettings.upsert({
    where: { organizationId },
    create: { organizationId, ...data },
    update: data,
  });
  await recordAuditEvent({
    organizationId,
    actorUserId: userId,
    action: "organization.deletion_requested",
    subjectType: "organization",
    subjectId: organizationId,
    details: { scheduledFor: scheduledFor.toISOString() },
  });
  revalidatePath("/", "layout");
}

export async function cancelOrganizationDeletion() {
  const { userId, organizationId } = await requireActiveOrganizationOwner();
  const { count } = await prisma.tenantSettings.updateMany({
    where: { organizationId, status: "PENDING_DELETION" },
    data: { status: "ACTIVE", deletionRequestedAt: null, deletionScheduledFor: null },
  });
  if (count === 0) throw new Error("The organization is not pending deletion");
  await recordAuditEvent({
    organizationId,
    actorUserId: userId,
    action: "organization.deletion_canceled",
    subjectType: "organization",
    subjectId: organizationId,
  });
  revalidatePath("/", "layout");
}

/** Makes another member the owner; the current owner becomes an admin. */
export async function transferOrganizationOwnership(memberId: string) {
  const targetId = z.string().min(1).parse(memberId);
  const tenant = await getTenantContext("manageOrganization");
  if (tenant.role !== "owner") throw new Error("Only an organization owner can transfer ownership");

  await prisma.$transaction(
    async (transaction) => {
      const target = await transaction.member.findFirst({
        where: { id: targetId, organizationId: tenant.organizationId, NOT: { userId: tenant.userId } },
        select: { id: true },
      });
      if (!target) throw new Error("The organization member was not found");
      const demoted = await transaction.member.updateMany({
        where: { organizationId: tenant.organizationId, userId: tenant.userId, role: "owner" },
        data: { role: "admin" },
      });
      if (demoted.count !== 1) throw new Error("The ownership changed while being transferred");
      await transaction.member.update({ where: { id: target.id }, data: { role: "owner" } });
      await transaction.organizationAuditEvent.create({
        data: {
          organizationId: tenant.organizationId,
          actorUserId: tenant.userId,
          action: "organization.ownership_transferred",
          subjectType: "member",
          subjectId: target.id,
        },
      });
    },
    { isolationLevel: "Serializable" },
  );
  revalidatePath("/", "layout");
}
