import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFiles: vi.fn(),
  findExports: vi.fn(),
  findDeletions: vi.fn(),
  getRole: vi.fn(),
  createStorage: vi.fn(),
  listObjects: vi.fn(),
}));

vi.mock("../../prisma/seed-env", () => ({}));
vi.mock("../../src/lib/prisma", () => ({
  default: {
    storedFile: { findMany: mocks.findFiles },
    tenantExport: { findMany: mocks.findExports },
    storedFileDeletion: { findMany: mocks.findDeletions },
    $disconnect: vi.fn(),
    $queryRaw: mocks.getRole,
  },
}));
vi.mock("../../src/lib/storage", () => ({
  createStorageFromEnv: mocks.createStorage,
}));

import {
  findStorageOrphans,
  parseStorageInventoryCutoff,
  runStorageInventory,
} from "./storage-inventory";

const now = new Date("2026-10-30T00:00:00.000Z");
const cutoff = new Date("2026-10-28T00:00:00.000Z");

async function* objects() {
  yield {
    key: "org-1/metadata-backed.png",
    size: 40,
    lastModified: new Date("2026-10-20T00:00:00.000Z"),
  };
  yield {
    key: "exports/org-1/queued.zip",
    size: 100,
    lastModified: new Date("2026-10-20T00:00:00.000Z"),
  };
  yield {
    key: "org-1/pending-delete.png",
    size: 5,
    lastModified: new Date("2026-10-20T00:00:00.000Z"),
  };
  yield {
    key: "org-2/orphan.png",
    size: 250,
    lastModified: new Date("2026-10-20T00:00:00.000Z"),
  };
  yield {
    key: "org-2/recent.png",
    size: 20,
    lastModified: new Date("2026-10-29T00:00:00.000Z"),
  };
  yield {
    key: "org-2/unknown-time.png",
    size: 10,
    lastModified: null,
  };
}

describe("storage inventory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findFiles.mockResolvedValue([{ key: "org-1/metadata-backed.png" }]);
    mocks.findExports.mockResolvedValue([
      { fileKey: "exports/org-1/queued.zip" },
      { fileKey: null },
    ]);
    mocks.findDeletions.mockResolvedValue([{ key: "org-1/pending-delete.png" }]);
    mocks.getRole.mockResolvedValue([{ rolsuper: true, rolbypassrls: false }]);
    mocks.listObjects.mockImplementation(() => objects());
    mocks.createStorage.mockReturnValue({ list: mocks.listObjects });
  });

  it("requires a caller-selected positive age threshold", () => {
    expect(parseStorageInventoryCutoff(["--older-than-hours", "48"], now)).toEqual(cutoff);
    expect(() => parseStorageInventoryCutoff([], now)).toThrow("Usage:");
    expect(() =>
      parseStorageInventoryCutoff(["--older-than-hours", "0"], now),
    ).toThrow("positive, finite");
  });

  it("reports only aged objects absent from metadata and the deletion outbox", async () => {
    const result = await runStorageInventory(cutoff, {
      MIGRATION_DATABASE_URL: "owner-connection",
      S3_BUCKET: "files",
      S3_ACCESS_KEY_ID: "application-key",
      S3_SECRET_ACCESS_KEY: "application-secret",
      S3_AUDIT_ACCESS_KEY_ID: "read-only-key",
      S3_AUDIT_SECRET_ACCESS_KEY: "read-only-secret",
    });

    expect(result).toMatchObject({
      objectsListed: 6,
      referencedKeys: 3,
      totalBytes: 425,
      objectsWithoutSize: 0,
      objectsWithoutTimestamp: 1,
      candidateCount: 1,
      candidateBytes: 250,
    });
    expect(result.candidates.map(({ key }) => key)).toEqual(["org-2/orphan.png"]);
    expect(mocks.createStorage).toHaveBeenCalledWith(
      expect.objectContaining({
        S3_ACCESS_KEY_ID: "read-only-key",
        S3_SECRET_ACCESS_KEY: "read-only-secret",
      }),
    );
    expect(mocks.findFiles).toHaveBeenCalledWith({ select: { key: true } });
  });

  it("does not fall back to the application S3 credentials", async () => {
    await expect(
      runStorageInventory(cutoff, {
        MIGRATION_DATABASE_URL: "owner-connection",
        S3_BUCKET: "files",
        S3_ACCESS_KEY_ID: "application-key",
        S3_SECRET_ACCESS_KEY: "application-secret",
      }),
    ).rejects.toThrow("S3_AUDIT_ACCESS_KEY_ID");
    expect(mocks.createStorage).not.toHaveBeenCalled();
    expect(mocks.findFiles).not.toHaveBeenCalled();
  });

  it("requires the migration connection before querying tenant metadata", async () => {
    await expect(runStorageInventory(cutoff, {})).rejects.toThrow(
      "MIGRATION_DATABASE_URL",
    );
    expect(mocks.findFiles).not.toHaveBeenCalled();
  });

  it("refuses to inventory when the database role cannot see across RLS boundaries", async () => {
    mocks.getRole.mockResolvedValue([{ rolsuper: false, rolbypassrls: false }]);

    await expect(
      runStorageInventory(cutoff, {
        MIGRATION_DATABASE_URL: "owner-connection",
        S3_BUCKET: "files",
        S3_AUDIT_ACCESS_KEY_ID: "read-only-key",
        S3_AUDIT_SECRET_ACCESS_KEY: "read-only-secret",
      }),
    ).rejects.toThrow("cannot bypass row-level security");
    expect(mocks.findFiles).not.toHaveBeenCalled();
  });

  it("does not mark objects without a valid timestamp as candidates", () => {
    expect(
      findStorageOrphans(
        [
          { key: "unknown", size: 1, lastModified: null },
          { key: "invalid", size: 1, lastModified: new Date(Number.NaN) },
          { key: "old", size: 1, lastModified: cutoff },
        ],
        new Set(),
        cutoff,
      ).map(({ key }) => key),
    ).toEqual(["old"]);
  });
});
