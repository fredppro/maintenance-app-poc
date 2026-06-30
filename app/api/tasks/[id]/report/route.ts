import { NextResponse } from "next/server";
import { buildReportResponse } from "../../../../../features/report/api/route";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const url = new URL(request.url);

    const locale = url.searchParams.get("locale") ?? "en";

    const mode: "preview" | "download" =
      url.searchParams.get("mode") === "download"
        ? "download"
        : "preview";

    return await buildReportResponse(id, locale, mode);
  } catch (error: unknown) {
    console.error("Error generating PDF:", error);

    return NextResponse.json(
      { success: false, message: "Erro ao gerar o relatório em PDF" },
      { status: 500 }
    );
  }
}