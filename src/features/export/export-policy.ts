import { MAX_FILE_BYTES } from "@/features/files/file-policy";

export const EXPORT_HEARTBEAT_INTERVAL_MS = 30 * 1000;
export const STALE_EXPORT_AFTER_MS = 2 * 60 * 1000;
export const MAX_EXPORT_ROWS = 50_000;
export const MAX_EXPORT_QUERY_BATCH_SIZE = 64;
export const MAX_EXPORT_RECORD_BYTES = 128 * 1024;
export const MAX_EXPORT_ARCHIVE_INPUT_BYTES = 48 * 1024 * 1024;
export const MAX_EXPORT_ARCHIVE_BYTES = 64 * 1024 * 1024;
export const MAX_EXPORT_ATTACHMENT_BYTES = MAX_FILE_BYTES;
export const EXPORT_TEMP_RESERVATION_BYTES = 120 * 1024 * 1024;
export const EXPORT_TEMP_GLOBAL_BUDGET_BYTES = 4 * EXPORT_TEMP_RESERVATION_BYTES;
export const MAX_CONCURRENT_EXPORTS = 4;
export const EXPORT_TEMP_RECLAIM_GRACE_MS = 2 * 60 * 1000;

export class ExportSizeLimitError extends Error {
  constructor() {
    super(
      `Export exceeds the supported limit of ${MAX_EXPORT_ROWS.toLocaleString("en-US")} rows, ${Math.floor(MAX_EXPORT_RECORD_BYTES / 1024)} KiB per record, ${Math.floor(MAX_EXPORT_ARCHIVE_INPUT_BYTES / (1024 * 1024))} MiB of input, or ${Math.floor(MAX_EXPORT_ARCHIVE_BYTES / (1024 * 1024))} MiB of archive data`,
    );
    this.name = "ExportSizeLimitError";
  }
}

export function isExportRecoverable(
  status: "PENDING" | "RUNNING" | "READY" | "FAILED",
  heartbeatAt: Date | string | null,
  now = Date.now(),
) {
  if (status === "PENDING") return true;
  if (status !== "RUNNING") return false;
  if (!heartbeatAt) return true;
  const heartbeatTime =
    heartbeatAt instanceof Date ? heartbeatAt.getTime() : new Date(heartbeatAt).getTime();
  return heartbeatTime <= now - STALE_EXPORT_AFTER_MS;
}
