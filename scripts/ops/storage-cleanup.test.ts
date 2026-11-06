import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findDueJobs: vi.fn(),
  findUnattachedFiles: vi.fn(),
  forTenant: vi.fn(),
  processDeletion: vi.fn(),
  deleteUnattachedFile: vi.fn(),
  logEvent: vi.fn(),
}));

vi.mock("../../prisma/seed-env", () => ({}));
vi.mock("../../src/lib/prisma", () => ({
  default: {
    storedFileDeletion: { findMany: mocks.findDueJobs },
    storedFile: { findMany: mocks.findUnattachedFiles },
    $disconnect: vi.fn(),
  },
  forTenant: mocks.forTenant,
}));
vi.mock("../../src/features/files/server/files", () => ({
  deleteExpiredUnattachedStoredFile: mocks.deleteUnattachedFile,
  processStoredFileDeletion: mocks.processDeletion,
}));
vi.mock("../../src/lib/logger", () => ({ logEvent: mocks.logEvent }));

import { runStorageCleanup, STORAGE_CLEANUP_BATCH_SIZE } from "./storage-cleanup";

describe("runStorageCleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUnattachedFiles.mockResolvedValue([]);
    mocks.findDueJobs.mockResolvedValue([
      { id: "job-1", organizationId: "org-1" },
      { id: "job-2", organizationId: "org-2" },
      { id: "job-3", organizationId: "org-3" },
    ]);
    mocks.forTenant.mockImplementation((organizationId: string) => `db:${organizationId}`);
    mocks.processDeletion
      .mockResolvedValueOnce("deleted")
      .mockResolvedValueOnce("retry_scheduled")
      .mockResolvedValueOnce("not_due");
    mocks.deleteUnattachedFile.mockResolvedValue("deleted");
  });

  it("processes due jobs in isolated tenant contexts and reports outcomes", async () => {
    const now = new Date("2026-10-29T20:00:00.000Z");
    await expect(runStorageCleanup(now)).resolves.toEqual({
      selected: 3,
      deleted: 1,
      retryScheduled: 1,
      failed: 0,
      morePending: false,
      unattachedSelected: 0,
      unattachedDeleted: 0,
      moreUnattached: false,
    });

    expect(mocks.findDueJobs).toHaveBeenCalledWith({
      where: { nextAttemptAt: { lte: now } },
      orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
      take: STORAGE_CLEANUP_BATCH_SIZE + 1,
      select: { id: true, organizationId: true },
    });
    expect(mocks.processDeletion).toHaveBeenNthCalledWith(1, "db:org-1", "job-1", now);
    expect(mocks.processDeletion).toHaveBeenNthCalledWith(2, "db:org-2", "job-2", now);
    expect(mocks.processDeletion).toHaveBeenNthCalledWith(3, "db:org-3", "job-3", now);
  });

  it("continues after an unexpected job failure and reports a remaining backlog", async () => {
    mocks.findDueJobs.mockResolvedValue(
      Array.from({ length: STORAGE_CLEANUP_BATCH_SIZE + 1 }, (_, index) => ({
        id: `job-${index}`,
        organizationId: "org-1",
      })),
    );
    mocks.processDeletion.mockReset().mockResolvedValue("deleted");
    mocks.processDeletion.mockRejectedValueOnce(new Error("database unavailable"));

    await expect(runStorageCleanup()).resolves.toMatchObject({
      selected: STORAGE_CLEANUP_BATCH_SIZE,
      deleted: STORAGE_CLEANUP_BATCH_SIZE - 1,
      failed: 1,
      morePending: true,
    });
    expect(mocks.processDeletion).toHaveBeenCalledTimes(STORAGE_CLEANUP_BATCH_SIZE);
    expect(mocks.logEvent).toHaveBeenCalledWith(
      "error",
      "file.cleanup_job_failed",
      expect.objectContaining({ deletionId: "job-0" }),
    );
  });

  it("cleans expired unattached files in tenant scope", async () => {
    const now = new Date("2026-11-05T00:00:00.000Z");
    mocks.findUnattachedFiles.mockResolvedValue([
      { id: "file-1", organizationId: "org-4" },
    ]);

    await expect(runStorageCleanup(now)).resolves.toMatchObject({
      unattachedSelected: 1,
      unattachedDeleted: 1,
      moreUnattached: false,
    });
    expect(mocks.deleteUnattachedFile).toHaveBeenCalledWith(
      "db:org-4",
      "file-1",
      "org-4",
      now,
    );
  });

  it("logs orphan cleanup failures and reports an oversized backlog", async () => {
    mocks.findUnattachedFiles.mockResolvedValue(
      Array.from({ length: STORAGE_CLEANUP_BATCH_SIZE + 1 }, (_, index) => ({
        id: `file-${index}`,
        organizationId: "org-1",
      })),
    );
    mocks.deleteUnattachedFile.mockReset().mockResolvedValue("deleted");
    mocks.deleteUnattachedFile.mockRejectedValueOnce(new Error("storage unavailable"));

    await expect(runStorageCleanup()).resolves.toMatchObject({
      unattachedSelected: STORAGE_CLEANUP_BATCH_SIZE,
      unattachedDeleted: STORAGE_CLEANUP_BATCH_SIZE - 1,
      failed: 1,
      moreUnattached: true,
    });
    expect(mocks.logEvent).toHaveBeenCalledWith(
      "error",
      "file.orphan_cleanup_failed",
      expect.objectContaining({ fileId: "file-0", organizationId: "org-1" }),
    );
  });
});
