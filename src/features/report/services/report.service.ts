import type { TenantDb } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { Readable } from "node:stream";
import { getMaintenanceTask } from "../server/get-task";
import { createMaintenanceReportPDFStream } from "../pdf/stream";
import { AppLocale } from "src/i18n/locale";

export class ReportTaskNotFoundError extends Error {
  constructor(taskId: string) {
    super(`Maintenance task not found: ${taskId}`);
    this.name = "ReportTaskNotFoundError";
  }
}

export async function buildMaintenanceReportPDF(
  db: TenantDb,
  taskId: string,
  organizationId: string,
  siteId: string,
  locale: AppLocale,
) {
  const task = await getMaintenanceTask(db, taskId, organizationId, siteId);

  if (!task) {
    throw new ReportTaskNotFoundError(taskId);
  }

  const stream = createMaintenanceReportPDFStream(task, locale);

  return {
    stream,
    filename: `report-${taskId.slice(0, 8)}.pdf`,
  };
}

export async function buildReportResponse(
  db: TenantDb,
  taskId: string,
  organizationId: string,
  siteId: string,
  locale: AppLocale,
  mode: "preview" | "download"
) {
  const { stream, filename } = await buildMaintenanceReportPDF(
    db,
    taskId,
    organizationId,
    siteId,
    locale,
  );

  const body = Readable.toWeb(stream) as ReadableStream<Uint8Array>;

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition":
        mode === "download"
          ? `attachment; filename="${filename}"`
          : "inline",
      "Cache-Control": "no-store",
    },
  });
}