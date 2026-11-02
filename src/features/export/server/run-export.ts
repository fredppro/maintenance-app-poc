import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import type { TenantDb } from "@/lib/prisma";
import { logEvent } from "@/lib/logger";
import { getStorage } from "@/lib/storage";
import {
  EXPORT_HEARTBEAT_INTERVAL_MS,
  ExportSizeLimitError,
} from "../export-policy";
import { buildTenantExport } from "./build-export";
import { recoverStaleExportDirectories } from "./recover-temp-exports";

export const EXPORT_RETENTION_DAYS = 7;

export const exportKey = (organizationId: string, exportId: string, leaseId: string) =>
  `exports/${organizationId}/${exportId}/${leaseId}.zip`;

/** Runs a queued export to completion; failures are recorded on the row rather than thrown. */
export async function runTenantExport(db: TenantDb, organizationId: string, exportId: string) {
  const recoveredDirectories = await recoverStaleExportDirectories(
    db,
    organizationId,
  );
  if (recoveredDirectories > 0) {
    logEvent("info", "export.temp_directories_recovered", {
      organizationId,
      count: recoveredDirectories,
    });
  }
  const leaseId = randomUUID();
  const reservations = await db.transaction((tx) =>
    tx.$queryRawUnsafe<{ reservation_id: string; reserved_bytes: bigint }[]>(
      `SELECT reservation_id, reserved_bytes
       FROM public.reserve_tenant_export_temp($1, $2, $3)`,
      organizationId,
      exportId,
      leaseId,
    ),
  );
  if (reservations.length === 0) {
    logEvent("info", "export.admission_deferred", { organizationId, exportId });
    return;
  }

  let storage: ReturnType<typeof getStorage> | undefined;
  let uploadedKey: string | undefined;
  let artifact: Awaited<ReturnType<typeof buildTenantExport>> | undefined;
  let heartbeatInFlight: Promise<void> | undefined;
  const controller = new AbortController();
  const heartbeatTimer = setInterval(() => {
    if (heartbeatInFlight) return;
    const heartbeat = db.transaction((tx) =>
      tx.$queryRawUnsafe<{ active: boolean }[]>(
        `SELECT public.heartbeat_tenant_export_temp($1, $2, $3) AS active`,
        organizationId,
        exportId,
        leaseId,
      ),
    )
      .then(([result]) => {
        if (!result?.active) {
          logEvent("warn", "export.lease_lost", { organizationId, exportId });
          controller.abort(new Error("Export lease lost"));
        }
      })
      .catch((error: unknown) => {
        logEvent("error", "export.heartbeat_failed", { organizationId, exportId, error });
        controller.abort(new Error("Export lease heartbeat failed"));
      })
      .finally(() => {
        if (heartbeatInFlight === heartbeat) heartbeatInFlight = undefined;
      });
    heartbeatInFlight = heartbeat;
  }, EXPORT_HEARTBEAT_INTERVAL_MS);
  const stopHeartbeat = async () => {
    clearInterval(heartbeatTimer);
    await heartbeatInFlight;
  };

  try {
    artifact = await buildTenantExport(db, organizationId, {
      signal: controller.signal,
      leaseId,
    });
    storage = getStorage();
    const key = exportKey(organizationId, exportId, leaseId);
    await storage.putStream(
      key,
      createReadStream(artifact.path, { highWaterMark: 64 * 1024 }),
      "application/zip",
      artifact.size,
      controller.signal,
    );
    if (controller.signal.aborted) {
      throw controller.signal.reason;
    }
    uploadedKey = key;
    await stopHeartbeat();
    const completed = await db.tenantExport.updateMany({
      where: { id: exportId, organizationId, status: "RUNNING", leaseId },
      data: {
        status: "READY",
        fileKey: key,
        size: artifact.size,
        completedAt: new Date(),
        expiresAt: new Date(Date.now() + EXPORT_RETENTION_DAYS * 86_400_000),
        leaseId: null,
        heartbeatAt: null,
      },
    });
    if (completed.count === 0) {
      await storage.delete(key);
      uploadedKey = undefined;
      logEvent("warn", "export.completion_lease_lost", { organizationId, exportId });
    }
  } catch (error) {
    await stopHeartbeat();
    logEvent("error", "export.failed", { organizationId, exportId, error });
    const failed = await db.tenantExport.updateMany({
      where: { id: exportId, organizationId, status: "RUNNING", leaseId },
      data: {
        status: "FAILED",
        error:
          error instanceof ExportSizeLimitError
            ? "EXPORT_SIZE_LIMIT"
            : "Export failed",
        completedAt: new Date(),
        leaseId: null,
        heartbeatAt: null,
      },
    });
    if (uploadedKey && storage && failed.count === 1) {
      try {
        await storage.delete(uploadedKey);
      } catch (cleanupError) {
        logEvent("error", "export.orphan_cleanup_failed", {
          organizationId,
          exportId,
          error: cleanupError,
        });
      }
    }
    if (uploadedKey && failed.count === 0) {
      logEvent("warn", "export.attempt_cleanup_deferred", {
        organizationId,
        exportId,
      });
    }
  } finally {
    await stopHeartbeat();
    let tempDirectoryRemoved = true;
    try {
      await artifact?.cleanup();
    } catch (error) {
      tempDirectoryRemoved = false;
      logEvent("error", "export.temp_cleanup_failed", {
        organizationId,
        exportId,
        error,
      });
    }
    if (tempDirectoryRemoved) {
      try {
        await db.transaction((tx) =>
          tx.$queryRawUnsafe<{ released: boolean }[]>(
            `SELECT public.release_tenant_export_temp($1, $2, $3) AS released`,
            organizationId,
            exportId,
            leaseId,
          ),
        );
      } catch (error) {
        logEvent("error", "export.reservation_release_failed", {
          organizationId,
          exportId,
          error,
        });
      }
    }
  }
}
