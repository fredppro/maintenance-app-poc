import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findJobs: vi.fn(),
  transaction: vi.fn(),
  processDeletion: vi.fn(),
  forTenant: vi.fn(),
  events: [] as string[],
  tx: {
    $queryRaw: vi.fn(),
    storedFile: { findMany: vi.fn() },
    tenantExport: { findMany: vi.fn() },
    storedFileDeletion: { createMany: vi.fn() },
    organization: { delete: vi.fn() },
  },
}));

vi.mock("../../prisma/seed-env", () => ({}));
vi.mock("../../src/lib/prisma", () => ({
  default: {
    storedFileDeletion: { findMany: mocks.findJobs },
    $transaction: mocks.transaction,
  },
  forTenant: mocks.forTenant,
}));
vi.mock("../../src/features/files/server/files", () => ({
  processStoredFileDeletion: mocks.processDeletion,
}));
vi.mock("../../src/features/organization/server/provisioning", () => ({
  listOrganizations: vi.fn(),
  ownerInvitationUrl: vi.fn(),
  provisionOrganization: vi.fn(),
}));
vi.mock("../../src/features/auth/server/email", () => ({
  sendTransactionalEmail: vi.fn(),
}));
vi.mock("../../src/lib/audit", () => ({ recordAuditEvent: vi.fn() }));

import { purgeOrganization } from "./tenant-admin";

describe("purgeOrganization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.events.length = 0;
    mocks.tx.$queryRaw.mockImplementation(async () => {
      mocks.events.push("lock-organization");
      return [{ id: "org-1" }];
    });
    mocks.tx.storedFile.findMany.mockImplementation(async () => {
      mocks.events.push("select-files");
      return [{ key: "org-1/file.png" }];
    });
    mocks.tx.tenantExport.findMany.mockImplementation(async () => {
      mocks.events.push("select-exports");
      return [
        { fileKey: "exports/org-1/archive.zip" },
        { fileKey: null },
      ];
    });
    mocks.transaction.mockImplementation(
      async (work: (tx: typeof mocks.tx) => Promise<unknown>) => work(mocks.tx),
    );
    mocks.tx.storedFileDeletion.createMany.mockImplementation(async () => {
      mocks.events.push("enqueue");
      return { count: 2 };
    });
    mocks.tx.organization.delete.mockImplementation(async () => {
      mocks.events.push("delete-organization");
      return {};
    });
    mocks.findJobs.mockResolvedValue([{ id: "job-1" }, { id: "job-2" }]);
    mocks.forTenant.mockReturnValue("tenant-db");
    mocks.processDeletion.mockResolvedValue("deleted");
  });

  it("atomically queues all object keys before purging and then attempts cleanup", async () => {
    await expect(purgeOrganization("org-1")).resolves.toBe(2);

    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.events).toEqual([
      "lock-organization",
      "select-files",
      "select-exports",
      "enqueue",
      "delete-organization",
    ]);
    expect(mocks.tx.storedFileDeletion.createMany).toHaveBeenCalledWith({
      data: [
        { organizationId: "org-1", key: "org-1/file.png" },
        { organizationId: "org-1", key: "exports/org-1/archive.zip" },
      ],
      skipDuplicates: true,
    });
    expect(mocks.forTenant).toHaveBeenCalledWith("org-1");
    expect(mocks.processDeletion).toHaveBeenNthCalledWith(1, "tenant-db", "job-1");
    expect(mocks.processDeletion).toHaveBeenNthCalledWith(2, "tenant-db", "job-2");
  });

  it("does not attempt object cleanup if the organization transaction fails", async () => {
    mocks.tx.organization.delete.mockRejectedValue(new Error("database down"));

    await expect(purgeOrganization("org-1")).rejects.toThrow("database down");

    expect(mocks.findJobs).not.toHaveBeenCalled();
    expect(mocks.processDeletion).not.toHaveBeenCalled();
  });
});
