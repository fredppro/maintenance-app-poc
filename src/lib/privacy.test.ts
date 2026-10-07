import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  organizationAuditEvent: { findMany: vi.fn().mockResolvedValue([]) },
  user: { findUnique: vi.fn(), delete: vi.fn((args: unknown) => args) },
  member: { count: vi.fn() },
  invitation: { deleteMany: vi.fn((args: unknown) => args), count: vi.fn().mockResolvedValue(2) },
  $executeRaw: vi.fn(() => "raw"),
  $transaction: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ default: prismaMock }));
vi.mock("@/lib/audit", () => ({ recordAuditEvent: vi.fn() }));

import { recordAuditEvent } from "@/lib/audit";
import { anonymizeWorker, buildUserAccessReport, eraseUserAccount, SoleOwnerError } from "./privacy";

describe("anonymizeWorker", () => {
  const updateMany = vi.fn();
  const db = { worker: { updateMany } } as never;
  beforeEach(() => vi.clearAllMocks());

  it("strips personal fields inside the tenant and audits it", async () => {
    updateMany.mockResolvedValue({ count: 1 });
    await anonymizeWorker(db, "org-1", "w1", "user-1");
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "w1", organizationId: "org-1" }),
        data: expect.objectContaining({ phone: null, email: "erased-w1@erased.invalid" }),
      }),
    );
    expect(recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "worker.anonymized" }));
  });

  it("fails for a worker outside the tenant", async () => {
    updateMany.mockResolvedValue({ count: 0 });
    await expect(anonymizeWorker(db, "org-1", "other", "user-1")).rejects.toThrow("Worker not found");
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });
});

describe("eraseUserAccount", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuses to orphan an organization", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      email: "a@x.test",
      members: [{ organizationId: "org-1", role: "owner" }],
    });
    prismaMock.member.count.mockResolvedValue(1);
    await expect(eraseUserAccount("u1")).rejects.toBeInstanceOf(SoleOwnerError);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("deletes the user, scrubs audit emails and records the erasure", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      email: "a@x.test",
      members: [{ organizationId: "org-1", role: "member" }],
    });
    await eraseUserAccount("u1");
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.user.delete).toHaveBeenCalledWith({ where: { id: "u1" } });
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-1", action: "user.erased", actorUserId: "u1" }),
    );
  });
});

describe("buildUserAccessReport", () => {
  it("selects only non-secret fields", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", email: "a@x.test" });
    const report = await buildUserAccessReport("u1");
    const select = JSON.stringify(prismaMock.user.findUnique.mock.calls.at(-1));
    expect(select).not.toMatch(/password|token|accessToken/i);
    expect(report.invitationsSent).toBe(2);
  });
});
