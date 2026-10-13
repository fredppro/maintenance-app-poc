import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  inviteOrganizationMember,
  removeOrganizationMember,
  revokeOrganizationInvitation,
  updateOrganizationMemberRole,
} from "./member-actions";

const mocks = vi.hoisted(() => ({
  getTenantContext: vi.fn(),
  headers: vi.fn(),
  createInvitation: vi.fn(),
  transaction: vi.fn(),
  memberFindFirst: vi.fn(),
  memberUpdateMany: vi.fn(),
  memberDeleteMany: vi.fn(),
  invitationFindFirst: vi.fn(),
  invitationUpdateMany: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock("@/lib/tenant-context", () => ({
  getTenantContext: mocks.getTenantContext,
}));

vi.mock("next/headers", () => ({
  headers: mocks.headers,
}));

vi.mock("@/features/auth/server/auth", () => ({
  auth: { api: { createInvitation: mocks.createInvitation } },
}));

vi.mock("@/lib/prisma", () => ({
  default: { $transaction: mocks.transaction },
}));

const transaction = {
  member: {
    findFirst: mocks.memberFindFirst,
    updateMany: mocks.memberUpdateMany,
    deleteMany: mocks.memberDeleteMany,
  },
  invitation: {
    findFirst: mocks.invitationFindFirst,
    updateMany: mocks.invitationUpdateMany,
  },
  organizationAuditEvent: { create: mocks.auditCreate },
};

describe("organization member lifecycle actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTenantContext.mockResolvedValue({
      userId: "owner-a",
      organizationId: "org-a",
      siteId: "site-a",
      role: "owner",
    });
    mocks.headers.mockResolvedValue(new Headers());
    mocks.createInvitation.mockResolvedValue({ id: "invite-a" });
    mocks.transaction.mockImplementation(
      async (callback: (tx: typeof transaction) => Promise<void>) =>
        callback(transaction),
    );
    mocks.memberUpdateMany.mockResolvedValue({ count: 1 });
    mocks.memberDeleteMany.mockResolvedValue({ count: 1 });
    mocks.invitationUpdateMany.mockResolvedValue({ count: 1 });
    mocks.auditCreate.mockResolvedValue({});
  });

  it("sends invitations through Better Auth with active-organization authorization", async () => {
    await inviteOrganizationMember({
      email: " invitee@example.test ",
      role: "admin",
    });

    expect(mocks.getTenantContext).toHaveBeenCalledWith("manageMembers");
    expect(mocks.createInvitation).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      body: {
        email: "invitee@example.test",
        role: "admin",
        organizationId: "org-a",
      },
    });
  });

  it("does not allow admins to invite another admin", async () => {
    mocks.getTenantContext.mockResolvedValue({
      userId: "admin-a",
      organizationId: "org-a",
      siteId: "site-a",
      role: "admin",
    });

    await expect(
      inviteOrganizationMember({
        email: "new-admin@example.test",
        role: "admin",
      }),
    ).rejects.toThrow("cannot invite another organization admin");
    expect(mocks.createInvitation).not.toHaveBeenCalled();
  });

  it("scopes member role changes to the active organization and audits them", async () => {
    mocks.memberFindFirst.mockResolvedValue({
      id: "member-a",
      role: "read_only",
      userId: "user-a",
    });

    await updateOrganizationMemberRole({
      memberId: "member-a",
      role: "maintenance_manager",
    });

    expect(mocks.memberFindFirst).toHaveBeenCalledWith({
      where: { id: "member-a", organizationId: "org-a" },
      select: { id: true, role: true, userId: true },
    });
    expect(mocks.memberUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "member-a",
        organizationId: "org-a",
        role: "read_only",
      },
      data: { role: "maintenance_manager" },
    });
    expect(mocks.auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: "org-a",
        actorUserId: "owner-a",
        action: "member.role_changed",
        subjectId: "member-a",
        details: { previousRole: "read_only", role: "maintenance_manager" },
      }),
    });
  });

  it("cannot change a member from another organization", async () => {
    mocks.memberFindFirst.mockResolvedValue(null);

    await expect(
      updateOrganizationMemberRole({
        memberId: "member-b",
        role: "read_only",
      }),
    ).rejects.toThrow("not found");

    expect(mocks.memberFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "member-b", organizationId: "org-a" },
      }),
    );
    expect(mocks.memberUpdateMany).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it("does not allow self-role changes or owner role changes", async () => {
    mocks.memberFindFirst.mockResolvedValueOnce({
      id: "member-self",
      role: "owner",
      userId: "owner-a",
    });
    await expect(
      updateOrganizationMemberRole({
        memberId: "member-self",
        role: "read_only",
      }),
    ).rejects.toThrow("own organization role");

    mocks.memberFindFirst.mockResolvedValueOnce({
      id: "member-owner",
      role: "owner",
      userId: "owner-b",
    });
    await expect(
      removeOrganizationMember({ memberId: "member-owner" }),
    ).rejects.toThrow("cannot remove this");

    expect(mocks.memberUpdateMany).not.toHaveBeenCalled();
    expect(mocks.memberDeleteMany).not.toHaveBeenCalled();
  });

  it("prevents admins from changing or removing peers and promoting members to admin", async () => {
    mocks.getTenantContext.mockResolvedValue({
      userId: "admin-a",
      organizationId: "org-a",
      siteId: "site-a",
      role: "admin",
    });
    mocks.memberFindFirst.mockResolvedValue({
      id: "admin-peer",
      role: "admin",
      userId: "admin-b",
    });

    await expect(
      updateOrganizationMemberRole({
        memberId: "admin-peer",
        role: "read_only",
      }),
    ).rejects.toThrow("cannot change this");
    await expect(
      removeOrganizationMember({ memberId: "admin-peer" }),
    ).rejects.toThrow("cannot remove this");
    await expect(
      updateOrganizationMemberRole({
        memberId: "member-a",
        role: "admin",
      }),
    ).rejects.toThrow();

    expect(mocks.memberUpdateMany).not.toHaveBeenCalled();
    expect(mocks.memberDeleteMany).not.toHaveBeenCalled();
  });

  it("removes only a member in the active organization and records the removal", async () => {
    mocks.memberFindFirst.mockResolvedValue({
      id: "member-a",
      role: "read_only",
      userId: "user-a",
    });

    await removeOrganizationMember({ memberId: "member-a" });

    expect(mocks.memberDeleteMany).toHaveBeenCalledWith({
      where: {
        id: "member-a",
        organizationId: "org-a",
        role: "read_only",
      },
    });
    expect(mocks.auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "member.removed",
        subjectType: "member",
        subjectId: "member-a",
        details: { role: "read_only" },
      }),
    });
  });

  it("only cancels pending invitations belonging to the active organization", async () => {
    mocks.invitationFindFirst.mockResolvedValue(null);
    await expect(
      revokeOrganizationInvitation({ invitationId: "invite-b" }),
    ).rejects.toThrow("not found");
    expect(mocks.invitationFindFirst).toHaveBeenCalledWith({
      where: {
        id: "invite-b",
        organizationId: "org-a",
        status: "pending",
      },
      select: { id: true, email: true, role: true },
    });

    mocks.invitationFindFirst.mockResolvedValue({
      id: "invite-a",
      email: "new-user@example.test",
      role: "maintenance_manager",
    });
    await revokeOrganizationInvitation({ invitationId: "invite-a" });
    expect(mocks.invitationUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "invite-a",
        organizationId: "org-a",
        status: "pending",
        role: "maintenance_manager",
      },
      data: { status: "canceled" },
    });
    expect(mocks.auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "invitation.canceled",
        subjectType: "invitation",
        subjectId: "invite-a",
        details: { email: "new-user@example.test" },
      }),
    });
  });
});
