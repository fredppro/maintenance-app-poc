import { describe, expect, it, vi } from "vitest";
import type { ObjectStorage, StoredObjectInfo } from "@/lib/storage";
import {
  ABANDONED_EXPORT_OBJECT_GRACE_MS,
  cleanupOrphanedExportObjects,
  type ExportObjectOwner,
} from "./cleanup-orphaned-objects";

function memoryStorage(items: StoredObjectInfo[]) {
  const objects = new Map(items.map((item) => [item.key, item]));
  const deleteObject = vi.fn(async (key: string) => {
    objects.delete(key);
  });
  const storage = {
    delete: deleteObject,
    async *list() {
      yield* objects.values();
    },
  } satisfies Pick<ObjectStorage, "list" | "delete">;

  return { storage, objects, deleteObject };
}

function object(key: string, lastModified: Date, size = 10): StoredObjectInfo {
  return { key, lastModified, size };
}

describe("cleanupOrphanedExportObjects", () => {
  const now = new Date("2026-11-02T10:00:00.000Z");
  const old = new Date(now.getTime() - ABANDONED_EXPORT_OBJECT_GRACE_MS - 1);

  it("removes old abandoned attempts after a retry while preserving active and published exports", async () => {
    const activeAttempt = "exports/org-1/active/old-lease.zip";
    const abandonedAttempt = "exports/org-1/retried/old-lease.zip";
    const published = "exports/org-1/retried/current-lease.zip";
    const storageState = memoryStorage([
      object(activeAttempt, old),
      object(abandonedAttempt, old),
      object(published, old),
    ]);
    const owners: ExportObjectOwner[] = [
      {
        id: "active",
        organizationId: "org-1",
        status: "RUNNING",
        fileKey: null,
        expiresAt: null,
      },
      {
        id: "retried",
        organizationId: "org-1",
        status: "READY",
        fileKey: published,
        expiresAt: new Date(now.getTime() + 86_400_000),
      },
    ];

    const result = await cleanupOrphanedExportObjects(
      storageState.storage,
      owners,
      now,
    );

    expect(result).toEqual({ removed: 1, removedBytes: 10 });
    expect(storageState.objects.has(activeAttempt)).toBe(true);
    expect(storageState.objects.has(abandonedAttempt)).toBe(false);
    expect(storageState.objects.has(published)).toBe(true);
    expect(storageState.deleteObject).toHaveBeenCalledTimes(1);
  });

  it("is idempotent and only examines attempt keys owned by known tenant exports", async () => {
    const orphan = "exports/org-1/export-1/lease-1.zip";
    const otherTenant = "exports/org-2/export-1/lease-2.zip";
    const legacyKey = "exports/org-1/export-1.zip";
    const unknownExport = "exports/org-1/deleted-export/lease-3.zip";
    const storageState = memoryStorage([
      object(orphan, old),
      object(otherTenant, old),
      object(legacyKey, old),
      object(unknownExport, old),
    ]);
    const owners: ExportObjectOwner[] = [
      {
        id: "export-1",
        organizationId: "org-1",
        status: "FAILED",
        fileKey: null,
        expiresAt: null,
      },
    ];

    expect(
      await cleanupOrphanedExportObjects(storageState.storage, owners, now),
    ).toEqual({ removed: 1, removedBytes: 10 });
    expect(
      await cleanupOrphanedExportObjects(storageState.storage, owners, now),
    ).toEqual({ removed: 0, removedBytes: 0 });
    expect(storageState.deleteObject).toHaveBeenCalledTimes(1);
    expect(storageState.objects.has(otherTenant)).toBe(true);
    expect(storageState.objects.has(legacyKey)).toBe(true);
    expect(storageState.objects.has(unknownExport)).toBe(true);
  });

  it("retains recent attempts for a retry and cleans them after the grace period", async () => {
    const attempt = "exports/org-1/export-2/lease-1.zip";
    const storageState = memoryStorage([object(attempt, now)]);
    const owner: ExportObjectOwner = {
      id: "export-2",
      organizationId: "org-1",
      status: "FAILED",
      fileKey: null,
      expiresAt: null,
    };

    expect(
      await cleanupOrphanedExportObjects(storageState.storage, [owner], now),
    ).toEqual({ removed: 0, removedBytes: 0 });
    expect(storageState.objects.has(attempt)).toBe(true);
    expect(
      await cleanupOrphanedExportObjects(
        storageState.storage,
        [owner],
        new Date(now.getTime() + ABANDONED_EXPORT_OBJECT_GRACE_MS + 1),
      ),
    ).toEqual({ removed: 1, removedBytes: 10 });
    expect(storageState.objects.has(attempt)).toBe(false);
  });

  it("eventually cleans an old attempt while its export is queued for retry", async () => {
    const attempt = "exports/org-1/export-pending/old-lease.zip";
    const storageState = memoryStorage([object(attempt, old)]);
    const owner: ExportObjectOwner = {
      id: "export-pending",
      organizationId: "org-1",
      status: "PENDING",
      fileKey: null,
      expiresAt: null,
    };

    expect(
      await cleanupOrphanedExportObjects(storageState.storage, [owner], now),
    ).toEqual({ removed: 1, removedBytes: 10 });
    expect(storageState.objects.has(attempt)).toBe(false);
  });

  it("cleans abandoned attempts at export expiration but preserves the published object", async () => {
    const abandoned = "exports/org-1/export-3/old-lease.zip";
    const published = "exports/org-1/export-3/current-lease.zip";
    const storageState = memoryStorage([
      object(abandoned, now),
      object(published, now),
    ]);
    const owner: ExportObjectOwner = {
      id: "export-3",
      organizationId: "org-1",
      status: "READY",
      fileKey: published,
      expiresAt: new Date(now.getTime() - 1),
    };

    expect(
      await cleanupOrphanedExportObjects(storageState.storage, [owner], now),
    ).toEqual({ removed: 1, removedBytes: 10 });
    expect(storageState.objects.has(abandoned)).toBe(false);
    expect(storageState.objects.has(published)).toBe(true);
  });
});
