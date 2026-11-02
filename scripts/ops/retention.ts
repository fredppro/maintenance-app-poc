// Deletes operational data that has outlived its purpose. Run daily with the owner connection:
//   pnpm ops:retention
// Audit events are NOT touched: their retention period is a LEGAL/PRODUCT DECISION (docs/security-privacy/data-retention.md).
import "../../prisma/seed-env";
import { pathToFileURL } from "node:url";
import prisma from "../../src/lib/prisma";
import { getStorage } from "../../src/lib/storage";
import { cleanupOrphanedExportObjects } from "../../src/features/export/server/cleanup-orphaned-objects";
import { createExportCleanupStorage } from "./export-object-cleanup";
import { STALE_EXPORT_AFTER_MS } from "../../src/features/export/export-policy";

export const SESSION_GRACE_DAYS = 7;
export const INVITATION_GRACE_DAYS = 30;
export const RATE_LIMIT_WINDOW_MS = 24 * 3_600_000;
const DAY = 86_400_000;

export async function runRetention(now = new Date()) {
  const ago = (days: number) => new Date(now.getTime() - days * DAY);
  const staleBefore = new Date(now.getTime() - STALE_EXPORT_AFTER_MS);
  const cleanupStorage = createExportCleanupStorage(process.env);

  const sessions = await prisma.session.deleteMany({ where: { expiresAt: { lt: ago(SESSION_GRACE_DAYS) } } });
  const verifications = await prisma.verification.deleteMany({ where: { expiresAt: { lt: now } } });
  const invitations = await prisma.invitation.deleteMany({ where: { expiresAt: { lt: ago(INVITATION_GRACE_DAYS) } } });
  const rateLimits = await prisma.rateLimit.deleteMany({
    where: { lastRequest: { lt: BigInt(now.getTime() - RATE_LIMIT_WINDOW_MS) } },
  });

  const staleExports = await prisma.tenantExport.updateMany({
    where: {
      status: "RUNNING",
      OR: [{ heartbeatAt: null }, { heartbeatAt: { lte: staleBefore } }],
    },
    data: {
      status: "FAILED",
      error: "Export interrupted",
      completedAt: now,
      leaseId: null,
      heartbeatAt: null,
    },
  });
  const exportRows = await prisma.tenantExport.findMany({
    select: {
      id: true,
      organizationId: true,
      status: true,
      fileKey: true,
      expiresAt: true,
    },
  });
  const expired = exportRows.filter(
    (item) => item.expiresAt !== null && item.expiresAt < now,
  );
  const abandonedExportObjects = await cleanupOrphanedExportObjects(
    cleanupStorage,
    exportRows,
    now,
  );

  // Expired export archives: remove the object, then the row.
  let storage: ReturnType<typeof getStorage> | undefined;
  let exports = 0;
  for (const item of expired) {
    if (item.fileKey) {
      try {
        storage ??= getStorage();
        await storage.delete(item.fileKey);
      } catch {
        continue;
      }
    }
    await prisma.tenantExport.delete({ where: { id: item.id } });
    exports += 1;
  }

  return {
    sessions: sessions.count,
    verifications: verifications.count,
    invitations: invitations.count,
    rateLimits: rateLimits.count,
    exports,
    staleExportsMarkedFailed: staleExports.count,
    abandonedExportObjects: abandonedExportObjects.removed,
    abandonedExportBytes: abandonedExportObjects.removedBytes,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runRetention()
    .then((result) => console.log("retention", result))
    .finally(() => prisma.$disconnect());
}
