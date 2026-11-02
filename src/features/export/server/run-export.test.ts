import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildTenantExport: vi.fn(),
  delete: vi.fn(),
  logEvent: vi.fn(),
  putStream: vi.fn(),
  updateMany: vi.fn(),
  queryRawUnsafe: vi.fn(),
}));

vi.mock("./build-export", () => ({
  buildTenantExport: mocks.buildTenantExport,
}));
vi.mock("@/lib/logger", () => ({
  logEvent: mocks.logEvent,
}));
vi.mock("@/lib/storage", () => ({
  getStorage: () => ({ delete: mocks.delete, putStream: mocks.putStream }),
}));
vi.mock("./recover-temp-exports", () => ({
  recoverStaleExportDirectories: vi.fn().mockResolvedValue(0),
}));

import { exportKey, runTenantExport } from "./run-export";
import { ExportSizeLimitError } from "../export-policy";

describe("runTenantExport", () => {
  const tx = { $queryRawUnsafe: mocks.queryRawUnsafe };
  const db = {
    tenantExport: { updateMany: mocks.updateMany },
    transaction: (
      callback: (transaction: { $queryRawUnsafe: typeof mocks.queryRawUnsafe }) => Promise<unknown>,
    ) =>
      callback(tx),
  } as never;
  let artifactDir: string;
  let artifactPath: string;
  const cleanup = vi.fn(async () => rm(artifactDir, { recursive: true, force: true }));

  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.queryRawUnsafe.mockImplementation(
      async (query: string, ...parameters: unknown[]) => {
        if (query.includes("reserve_tenant_export_temp")) {
          return [
            {
              reservation_id: parameters[2],
              reserved_bytes: BigInt(120 * 1024 * 1024),
            },
          ];
        }
        if (query.includes("heartbeat_tenant_export_temp")) {
          return [{ active: true }];
        }
        if (query.includes("release_tenant_export_temp")) {
          return [{ released: true }];
        }
        return [];
      },
    );
    artifactDir = await mkdtemp(path.join(os.tmpdir(), "tenant-export-test-"));
    artifactPath = path.join(artifactDir, "export.zip");
    await writeFile(artifactPath, Buffer.from([1, 2, 3]));
    cleanup.mockImplementation(async () =>
      rm(artifactDir, { recursive: true, force: true }),
    );
    mocks.buildTenantExport.mockResolvedValue({
      path: artifactPath,
      size: 3,
      cleanup,
    });
    mocks.putStream.mockImplementation(async (_key, body) => {
      for await (const _chunk of body) {
        void _chunk;
      }
    });
    mocks.delete.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await rm(artifactDir, { recursive: true, force: true });
  });

  it("reserves temporary capacity and records the completed object under its lease", async () => {
    mocks.updateMany.mockResolvedValueOnce({ count: 1 });

    await runTenantExport(db, "org-1", "export-1");

    const leaseId = mocks.queryRawUnsafe.mock.calls[0][3];
    expect(leaseId).toBeTruthy();
    expect(mocks.queryRawUnsafe.mock.calls[0][0]).toContain(
      "reserve_tenant_export_temp",
    );
    expect(mocks.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: "export-1", organizationId: "org-1", status: "RUNNING", leaseId },
      data: {
        status: "READY",
        fileKey: exportKey("org-1", "export-1", leaseId),
        leaseId: null,
        heartbeatAt: null,
      },
    });
    expect(mocks.putStream).toHaveBeenCalledWith(
      exportKey("org-1", "export-1", leaseId),
      expect.objectContaining({ path: artifactPath }),
      "application/zip",
      3,
      expect.any(AbortSignal),
    );
    expect(cleanup).toHaveBeenCalledOnce();
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it("does not start work when the global disk budget is exhausted", async () => {
    mocks.queryRawUnsafe.mockResolvedValueOnce([]);

    await runTenantExport(db, "org-1", "export-1");

    expect(mocks.buildTenantExport).not.toHaveBeenCalled();
    expect(mocks.putStream).not.toHaveBeenCalled();
  });

  it("records failures only for the runner that still owns the lease", async () => {
    mocks.updateMany.mockResolvedValueOnce({ count: 1 });
    mocks.buildTenantExport.mockRejectedValue(new Error("storage-independent failure"));

    await runTenantExport(db, "org-1", "export-1");

    const [fail] = mocks.updateMany.mock.calls;
    const leaseId = mocks.queryRawUnsafe.mock.calls[0][3];
    expect(fail[0]).toMatchObject({
      where: {
        id: "export-1",
        organizationId: "org-1",
        status: "RUNNING",
        leaseId,
      },
      data: {
        status: "FAILED",
        error: "Export failed",
        leaseId: null,
        heartbeatAt: null,
      },
    });
    expect(mocks.logEvent).toHaveBeenCalledWith(
      "error",
      "export.failed",
      expect.objectContaining({ organizationId: "org-1", exportId: "export-1" }),
    );
    expect(mocks.queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining("release_tenant_export_temp"),
      "org-1",
      "export-1",
      leaseId,
    );
  });

  it("deletes an uploaded artifact if the runner loses its lease before completion", async () => {
    mocks.updateMany.mockResolvedValueOnce({ count: 0 });

    await runTenantExport(db, "org-1", "export-1");

    const leaseId = mocks.queryRawUnsafe.mock.calls[0][3];
    expect(mocks.delete).toHaveBeenCalledWith(exportKey("org-1", "export-1", leaseId));
    expect(mocks.logEvent).toHaveBeenCalledWith(
      "warn",
      "export.completion_lease_lost",
      { organizationId: "org-1", exportId: "export-1" },
    );
  });

  it("does not delete an artifact when finalization has an ambiguous database outcome", async () => {
    mocks.updateMany
      .mockRejectedValueOnce(new Error("connection lost after commit"))
      .mockResolvedValueOnce({ count: 0 });

    await runTenantExport(db, "org-1", "export-1");

    expect(mocks.delete).not.toHaveBeenCalled();
    expect(mocks.logEvent).toHaveBeenCalledWith(
      "warn",
      "export.attempt_cleanup_deferred",
      { organizationId: "org-1", exportId: "export-1" },
    );
    expect(mocks.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({ status: "RUNNING" }),
        data: expect.objectContaining({ status: "FAILED" }),
      }),
    );
  });

  it("deletes an uploaded artifact only after it successfully marks its lease failed", async () => {
    mocks.updateMany
      .mockRejectedValueOnce(new Error("finalization failed"))
      .mockResolvedValueOnce({ count: 1 });

    await runTenantExport(db, "org-1", "export-1");

    const leaseId = mocks.queryRawUnsafe.mock.calls[0][3];
    expect(mocks.delete).toHaveBeenCalledWith(
      exportKey("org-1", "export-1", leaseId),
    );
  });

  it("records the export size limit as a user-readable failure reason", async () => {
    mocks.updateMany.mockResolvedValueOnce({ count: 1 });
    mocks.buildTenantExport.mockRejectedValue(new ExportSizeLimitError());

    await runTenantExport(db, "org-1", "export-1");

    expect(mocks.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "FAILED",
          error: "EXPORT_SIZE_LIMIT",
        }),
      }),
    );
  });

  it("cleans the staged archive when storage rejects the streamed upload", async () => {
    mocks.updateMany.mockResolvedValueOnce({ count: 1 });
    mocks.putStream.mockRejectedValueOnce(new Error("storage unavailable"));

    await runTenantExport(db, "org-1", "export-1");

    expect(mocks.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "FAILED" }),
      }),
    );
    expect(cleanup).toHaveBeenCalledOnce();
  });
});
