import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  session: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) },
  verification: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
  invitation: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
  rateLimit: { deleteMany: vi.fn().mockResolvedValue({ count: 3 }) },
  tenantExport: {
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    findMany: vi.fn().mockResolvedValue([
      {
        id: "e1",
        organizationId: "o",
        status: "READY",
        fileKey: "exports/o/e1.zip",
        expiresAt: new Date("2026-10-09T00:00:00Z"),
      },
    ]),
    delete: vi.fn(),
  },
}));
const storage = vi.hoisted(() => ({
  delete: vi.fn(),
  list: vi.fn(
    async function* (): AsyncGenerator<{
      key: string;
      size: number | null;
      lastModified: Date | null;
    }> {},
  ),
}));
vi.mock("../../prisma/seed-env", () => ({}));
vi.mock("@/lib/prisma", () => ({ default: prismaMock }));
vi.mock("@/lib/storage", () => ({
  createStorageFromEnv: () => storage,
  getStorage: () => storage,
}));

import { runRetention } from "../../scripts/ops/retention";

describe("runRetention", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.tenantExport.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.tenantExport.findMany.mockResolvedValue([
      {
        id: "e1",
        organizationId: "o",
        status: "READY",
        fileKey: "exports/o/e1.zip",
        expiresAt: new Date("2026-10-09T00:00:00Z"),
      },
    ]);
    storage.list.mockImplementation(async function* () {});
  });

  it("removes stale operational data and expired export archives, never audit events", async () => {
    const result = await runRetention(new Date("2026-10-10T00:00:00Z"));
    expect(result).toEqual({
      sessions: 2,
      verifications: 1,
      invitations: 0,
      rateLimits: 3,
      exports: 1,
      staleExportsMarkedFailed: 0,
      abandonedExportObjects: 0,
      abandonedExportBytes: 0,
    });
    expect(prismaMock.tenantExport.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "RUNNING",
          OR: expect.any(Array),
        }),
        data: expect.objectContaining({
          status: "FAILED",
          leaseId: null,
          heartbeatAt: null,
        }),
      }),
    );
    expect(storage.delete).toHaveBeenCalledWith("exports/o/e1.zip");
    expect(prismaMock.tenantExport.delete).toHaveBeenCalledWith({ where: { id: "e1" } });
  });

  it("revokes stale export leases before reconciling their abandoned objects", async () => {
    const now = new Date("2026-10-10T00:00:00Z");
    const attemptKey = "exports/org-1/e-stale/lease.zip";
    prismaMock.tenantExport.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.tenantExport.findMany.mockResolvedValueOnce([
      {
        id: "e-stale",
        organizationId: "org-1",
        status: "FAILED",
        fileKey: null,
        expiresAt: null,
      },
    ]);
    storage.list.mockImplementation(async function* () {
      yield {
        key: attemptKey,
        size: 12,
        lastModified: new Date(now.getTime() - 25 * 60 * 60 * 1000),
      };
    });

    await expect(runRetention(now)).resolves.toMatchObject({
      staleExportsMarkedFailed: 1,
      abandonedExportObjects: 1,
      abandonedExportBytes: 12,
    });
    expect(prismaMock.tenantExport.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "RUNNING",
          OR: expect.any(Array),
        }),
        data: expect.objectContaining({
          status: "FAILED",
          leaseId: null,
          heartbeatAt: null,
        }),
      }),
    );
    expect(storage.delete).toHaveBeenCalledWith(attemptKey);
  });
});
