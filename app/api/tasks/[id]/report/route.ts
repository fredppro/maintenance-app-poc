import { buildReportResponse } from "@/features/report/services/report.service";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  if (!id) {
    console.error("Missing id");
    return NextResponse.json(
      { message: "Missing id" },
      { status: 400 }
    );
  }

  const url = new URL(request.url);

  const locale = url.searchParams.get("locale") ?? "en";

  const mode =
    url.searchParams.get("mode") === "download"
      ? "download"
      : "preview";

  return buildReportResponse(id, locale, mode);
}