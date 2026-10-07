import type { TenantDb } from "@/lib/prisma";
import prisma from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";

export class SoleOwnerError extends Error {
  constructor(public readonly organizationIds: string[]) {
    super("User is the only owner of an organization; transfer ownership or delete it first");
  }
}

/**
 * Erasure for a worker record: removes the personal fields but keeps the row so historical
 * task assignments stay intact. The worker is also moved to the trash so it cannot be assigned again.
 */
export async function anonymizeWorker(
  db: TenantDb,
  organizationId: string,
  workerId: string,
  actorUserId: string,
) {
  const { count } = await db.worker.updateMany({
    where: { id: workerId, organizationId, deletedAt: undefined },
    data: {
      name: "Erased worker",
      email: `erased-${workerId}@erased.invalid`,
      phone: null,
      deletedAt: new Date(),
      deletedById: actorUserId,
    },
  });
  if (count === 0) throw new Error("Worker not found");
  await recordAuditEvent({
    organizationId,
    actorUserId,
    action: "worker.anonymized",
    subjectType: "worker",
    subjectId: workerId,
  });
}

/**
 * Account erasure (owner connection). Deletes the user, their sessions, credentials, memberships
 * and invitations they sent, and removes their email from audit details. Audit events keep the
 * opaque user id as actor. Refuses when the user is the sole owner of an organization.
 */
export async function eraseUserAccount(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, members: { select: { organizationId: true, role: true } } },
  });
  if (!user) throw new Error("User not found");

  const owned = user.members.filter((member) => member.role === "owner").map((member) => member.organizationId);
  const soleOwned: string[] = [];
  for (const organizationId of owned) {
    const owners = await prisma.member.count({ where: { organizationId, role: "owner" } });
    if (owners === 1) soleOwned.push(organizationId);
  }
  if (soleOwned.length > 0) throw new SoleOwnerError(soleOwned);

  await prisma.$transaction([
    prisma.invitation.deleteMany({ where: { email: user.email } }),
    prisma.$executeRaw`UPDATE "organization_audit_event" SET "details" = "details" - 'email' WHERE "details"->>'email' = ${user.email}`,
    prisma.user.delete({ where: { id: userId } }),
  ]);
  for (const { organizationId } of user.members) {
    await recordAuditEvent({
      organizationId,
      actorUserId: userId,
      action: "user.erased",
      subjectType: "user",
      subjectId: userId,
    });
  }
}

/**
 * Access report for one account (owner connection). Contains what we hold about the person, without
 * password hashes, tokens or session identifiers.
 */
export async function buildUserAccessReport(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      emailVerified: true,
      image: true,
      createdAt: true,
      members: { select: { role: true, createdAt: true, organization: { select: { id: true, name: true } } } },
      sessions: { select: { createdAt: true, expiresAt: true, ipAddress: true, userAgent: true } },
    },
  });
  if (!user) throw new Error("User not found");
  const invitationsSent = await prisma.invitation.count({ where: { inviterId: userId } });
  const auditEvents = await prisma.organizationAuditEvent.findMany({
    where: { actorUserId: userId },
    select: { organizationId: true, action: true, subjectType: true, subjectId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return { generatedAt: new Date().toISOString(), user, invitationsSent, auditEvents };
}
