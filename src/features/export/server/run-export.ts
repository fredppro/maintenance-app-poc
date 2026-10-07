import type { TenantDb } from "@/lib/prisma";
import { logEvent } from "@/lib/logger";
import { getStorage } from "@/lib/storage";
import { buildTenantExport } from "./build-export";

export const EXPORT_RETENTION_DAYS = 7;

export const exportKey = (organizationId: string, exportId: string) =>
  `exports/${organizationId}/${exportId}.zip`;

/** Runs a queued export to completion; failures are recorded on the row rather than thrown. */
export async function runTenantExport(db: TenantDb, organizationId: string, exportId: string) {
  const claimed = await db.tenantExport.updateMany({
    where: { id: exportId, organizationId, status: "PENDING" },
    data: { status: "RUNNING" },
  });
  if (claimed.count === 0) return;

  try {
    const zip = await buildTenantExport(db, organizationId);
    const key = exportKey(organizationId, exportId);
    await getStorage().put(key, Buffer.from(zip), "application/zip");
    await db.tenantExport.updateMany({
      where: { id: exportId, organizationId },
      data: {
        status: "READY",
        fileKey: key,
        size: zip.byteLength,
        completedAt: new Date(),
        expiresAt: new Date(Date.now() + EXPORT_RETENTION_DAYS * 86_400_000),
      },
    });
  } catch (error) {
    logEvent("error", "export.failed", { organizationId, exportId, error });
    await db.tenantExport.updateMany({
      where: { id: exportId, organizationId },
      data: { status: "FAILED", error: "Export failed", completedAt: new Date() },
    });
  }
}
