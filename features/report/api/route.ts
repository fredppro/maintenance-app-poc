import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { getMaintenanceTask } from "../server/get-task";
import { createMaintenanceReportPDFStream } from "../pdf/stream";

export async function buildReportResponse(
  taskId: string,
  locale: string,
  mode: "preview" | "download"
) {
  if (!taskId) {
    return new NextResponse("Missing task id", { status: 400 });
  }

  const task = await getMaintenanceTask(taskId);

  if (!task) {
    return new NextResponse("Not found", { status: 404 });
  }

  const pdfStream = createMaintenanceReportPDFStream(task, locale);
  const filename = `report-${taskId.slice(0, 8)}.pdf`;
  const body: ReadableStream<Uint8Array> =
  Readable.toWeb(pdfStream) as ReadableStream<Uint8Array>;

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