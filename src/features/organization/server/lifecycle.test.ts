import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETION_GRACE_DAYS } from "../deletion";
import {
  cancelOrganizationDeletion,
  requestOrganizationDeletion,
  transferOrganizationOwnership,
} from "./lifecycle";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getTenantContext: vi.fn(),
  memberFindFirst: vi.fn(),
  settingsFind: vi.fn(),
  settingsUpsert: vi.fn(),
  settingsUpdateMany: vi.fn(),
  transaction: vi.fn(),
  recordAuditEvent: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: vi.fn().mockResolvedValue(new Headers()) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/auth/server/auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("@/lib/audit", () => ({ recordAuditEvent: mocks.recordAuditEvent }));
vi.mock("@/lib/tenant-context", () => ({ getTenantContext: mocks.getTenantContext }));
vi.mock("@/lib/prisma", () => ({
  default: {
    member: { findFirst: mocks.memberFindFirst },
    tenantSettings: {
      findUnique: mocks.settingsFind,
      upsert: mocks.settingsUpsert,
      updateMany: mocks.settingsUpdateMany,
    },
    $transaction: mocks.transaction,
  },
}));

describe("organization lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      user: { id: "u-1" },
      session: { activeOrganizationId: "org-1" },
    });
    mocks.memberFindFirst.mockResolvedValue({ id: "m-1" });
    mocks.settingsFind.mockResolvedValue(null);
  });

  it("schedules deletion after the grace period", async () => {
    await requestOrganizationDeletion();

    const { create } = mocks.settingsUpsert.mock.calls[0][0];
    expect(create.status).toBe("PENDING_DELETION");
    const days =
      (create.deletionScheduledFor.getTime() - create.deletionRequestedAt.getTime()) / 86_400_000;
    expect(days).toBe(DELETION_GRACE_DAYS);
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "organization.deletion_requested" }),
    );
  });

  it("only lets an owner request deletion", async () => {
    mocks.memberFindFirst.mockResolvedValue(null);
    await expect(requestOrganizationDeletion()).rejects.toThrow("owner");
    expect(mocks.memberFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: "org-1", userId: "u-1", role: "owner" } }),
    );
  });

  it("refuses to schedule deletion for a suspended organization", async () => {
    mocks.settingsFind.mockResolvedValue({ status: "SUSPENDED" });
    await expect(requestOrganizationDeletion()).rejects.toThrow("not active");
    expect(mocks.settingsUpsert).not.toHaveBeenCalled();
  });

  it("cancels a pending deletion, and only a pending one", async () => {
    mocks.settingsUpdateMany.mockResolvedValue({ count: 1 });
    await cancelOrganizationDeletion();
    expect(mocks.settingsUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: "org-1", status: "PENDING_DELETION" } }),
    );

    mocks.settingsUpdateMany.mockResolvedValue({ count: 0 });
    await expect(cancelOrganizationDeletion()).rejects.toThrow("not pending deletion");
  });

  it("restricts ownership transfer to owners", async () => {
    mocks.getTenantContext.mockResolvedValue({ organizationId: "org-1", userId: "u-1", role: "admin" });
    await expect(transferOrganizationOwnership("m-2")).rejects.toThrow("Only an organization owner");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
