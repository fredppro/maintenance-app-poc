import {
  DEFAULT_ORGANIZATION_TIMEZONE,
  supportedTimeZones,
} from "@/features/organization/shared/organization-settings";
import prisma, { type TenantDb } from "@/lib/prisma";
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

  // Report dates follow the organization's time zone, not the server's.
  const settings = await prisma.tenantSettings.findUnique({
    where: { organizationId },
    select: { timezone: true },
  });
  const stream = createMaintenanceReportPDFStream(
    task,
    locale,
    settings?.timezone && supportedTimeZones().includes(settings.timezone)
      ? settings.timezone
      : DEFAULT_ORGANIZATION_TIMEZONE,
  );

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