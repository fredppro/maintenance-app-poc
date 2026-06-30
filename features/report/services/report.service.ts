// features/report/api/build-response.ts
import { NextResponse } from "next/server";
import { Readable } from "node:stream";
import { getMaintenanceTask } from "../server/get-task";
import { createMaintenanceReportPDFStream } from "../pdf/stream";

export async function buildMaintenanceReportPDF(taskId: string, locale: string) {
  const task = await getMaintenanceTask(taskId);

  if (!task) {
    throw new Error("NOT_FOUND");
  }

  const stream = createMaintenanceReportPDFStream(task, locale);

  return {
    stream,
    filename: `report-${taskId.slice(0, 8)}.pdf`,
  };
}

export async function buildReportResponse(
  taskId: string,
  locale: string,
  mode: "preview" | "download"
) {
  const { stream, filename } = await buildMaintenanceReportPDF(taskId, locale);

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