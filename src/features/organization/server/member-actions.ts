"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/features/auth/server/auth";
import prisma from "@/lib/prisma";
import { getTenantContext } from "@/lib/tenant-context";
import {
  canManageOrganizationMember,
  isOrganizationManager,
} from "@/features/organization/shared/member-policy";

const manageableRoleSchema = z.enum([
  "admin",
  "maintenance_manager",
  "read_only",
]);

export async function inviteOrganizationMember(input: {
  email: string;
  role: string;
}) {
  const { email, role } = z
    .object({
      email: z.string().trim().email().max(320),
      role: manageableRoleSchema,
    })
    .parse(input);
  const tenant = await getTenantContext("manageMembers");

  if (!isOrganizationManager(tenant.role)) {
    throw new Error("Only an organization owner or admin can invite members");
  }
  if (tenant.role === "admin" && role === "admin") {
    throw new Error("Admins cannot invite another organization admin");
  }

  const result = await auth.api.createInvitation({
    headers: await headers(),
    body: { email, role, organizationId: tenant.organizationId },
  });
  if (!result?.id) {
    throw new Error("The organization invitation could not be created");
  }
}

export async function updateOrganizationMemberRole(input: {
  memberId: string;
  role: string;
}) {
  const { memberId, role } = z
    .object({
      memberId: z.string().min(1),
      role: manageableRoleSchema,
    })
    .parse(input);
  const tenant = await getTenantContext("manageMembers");

  await prisma.$transaction(
    async (transaction) => {
      const target = await transaction.member.findFirst({
        where: { id: memberId, organizationId: tenant.organizationId },
        select: { id: true, role: true, userId: true },
      });
      if (!target) throw new Error("The organization member was not found");
      if (target.userId === tenant.userId) {
        throw new Error("You cannot change your own organization role");
      }
      if (!canManageOrganizationMember(tenant.role, target.role, role)) {
        throw new Error("You cannot change this member's role");
      }
      if (target.role === role) return;

      const update = await transaction.member.updateMany({
        where: {
          id: target.id,
          organizationId: tenant.organizationId,
          role: target.role,
        },
        data: { role },
      });
      if (update.count !== 1) {
        throw new Error("The organization member changed while being updated");
      }
      await transaction.organizationAuditEvent.create({
        data: {
          organizationId: tenant.organizationId,
          actorUserId: tenant.userId,
          action: "member.role_changed",
          subjectType: "member",
          subjectId: target.id,
          details: { previousRole: target.role, role },
        },
      });
    },
    { isolationLevel: "Serializable" },
  );
}

export async function removeOrganizationMember(input: { memberId: string }) {
  const { memberId } = z
    .object({ memberId: z.string().min(1) })
    .parse(input);
  const tenant = await getTenantContext("manageMembers");

  await prisma.$transaction(
    async (transaction) => {
      const target = await transaction.member.findFirst({
        where: { id: memberId, organizationId: tenant.organizationId },
        select: { id: true, role: true, userId: true },
      });
      if (!target) throw new Error("The organization member was not found");
      if (target.userId === tenant.userId) {
        throw new Error("You cannot remove yourself from the organization");
      }
      if (!canManageOrganizationMember(tenant.role, target.role)) {
        throw new Error("You cannot remove this organization member");
      }

      const deletion = await transaction.member.deleteMany({
        where: {
          id: target.id,
          organizationId: tenant.organizationId,
          role: target.role,
        },
      });
      if (deletion.count !== 1) {
        throw new Error("The organization member was not found");
      }
      await transaction.organizationAuditEvent.create({
        data: {
          organizationId: tenant.organizationId,
          actorUserId: tenant.userId,
          action: "member.removed",
          subjectType: "member",
          subjectId: target.id,
          details: { role: target.role },
        },
      });
    },
    { isolationLevel: "Serializable" },
  );
}

export async function revokeOrganizationInvitation(input: {
  invitationId: string;
}) {
  const { invitationId } = z
    .object({ invitationId: z.string().min(1) })
    .parse(input);
  const tenant = await getTenantContext("manageMembers");

  await prisma.$transaction(
    async (transaction) => {
      const target = await transaction.invitation.findFirst({
        where: {
          id: invitationId,
          organizationId: tenant.organizationId,
          status: "pending",
        },
        select: { id: true, email: true, role: true },
      });
      if (!target) {
        throw new Error("The pending organization invitation was not found");
      }
      if (!canManageOrganizationMember(tenant.role, target.role ?? "member")) {
        throw new Error("You cannot revoke this organization invitation");
      }

      const update = await transaction.invitation.updateMany({
        where: {
          id: target.id,
          organizationId: tenant.organizationId,
          status: "pending",
          role: target.role,
        },
        data: { status: "canceled" },
      });
      if (update.count !== 1) {
        throw new Error("The pending organization invitation was not found");
      }
      await transaction.organizationAuditEvent.create({
        data: {
          organizationId: tenant.organizationId,
          actorUserId: tenant.userId,
          action: "invitation.canceled",
          subjectType: "invitation",
          subjectId: target.id,
          details: { email: target.email },
        },
      });
    },
    { isolationLevel: "Serializable" },
  );
}
