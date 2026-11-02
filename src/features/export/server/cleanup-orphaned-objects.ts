import type { ObjectStorage } from "@/lib/storage";

export const ABANDONED_EXPORT_OBJECT_GRACE_MS = 24 * 60 * 60 * 1000;

export type ExportObjectOwner = {
  id: string;
  organizationId: string;
  status: string;
  fileKey: string | null;
  expiresAt: Date | null;
};

function exportPrefix(organizationId: string, exportId: string) {
  return `exports/${organizationId}/${exportId}/`;
}

function attemptPrefix(key: string) {
  const parts = key.split("/");
  if (
    parts.length !== 4 ||
    parts[0] !== "exports" ||
    !parts[1] ||
    !parts[2] ||
    !parts[3]?.endsWith(".zip") ||
    parts[3] === ".zip"
  ) {
    return null;
  }
  return `exports/${parts[1]}/${parts[2]}/`;
}

/**
 * Removes only old per-lease export objects whose owning export row still exists.
 * Running leases are protected; fileKey protects the published archive.
 */
export async function cleanupOrphanedExportObjects(
  storage: Pick<ObjectStorage, "list" | "delete">,
  exports: ExportObjectOwner[],
  now = new Date(),
) {
  const ownersByPrefix = new Map(
    exports.map((item) => [exportPrefix(item.organizationId, item.id), item]),
  );
  const referencedKeys = new Set(
    exports.flatMap((item) => (item.fileKey ? [item.fileKey] : [])),
  );
  const graceCutoff = new Date(now.getTime() - ABANDONED_EXPORT_OBJECT_GRACE_MS);
  let removed = 0;
  let removedBytes = 0;

  for await (const object of storage.list("exports/")) {
    const prefix = attemptPrefix(object.key);
    if (!prefix) continue;

    const owner = ownersByPrefix.get(prefix);
    if (
      !owner ||
      referencedKeys.has(object.key) ||
      owner.status === "RUNNING"
    ) {
      continue;
    }

    const expired = owner.expiresAt !== null && owner.expiresAt <= now;
    const cutoff = expired ? now : graceCutoff;
    if (
      !expired &&
      (object.lastModified === null ||
        !Number.isFinite(object.lastModified.getTime()) ||
        object.lastModified > cutoff)
    ) {
      continue;
    }

    await storage.delete(object.key);
    removed += 1;
    removedBytes += object.size ?? 0;
  }

  return { removed, removedBytes };
}
