import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { generateMaintenanceReportPDF } from "@/lib/pdf-generator";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const { searchParams } = new URL(request.url);
    const locale = searchParams.get("locale") || "en";

    const task = await prisma.maintenanceTask.findUnique({
      where: { id },
      include: {
        equipment: true,
        assignments: {
          include: {
            worker: true,
          },
        },
        materials: true,
      },
    });

    if (!task) {
      return NextResponse.json(
        { success: false, message: "Ficha de manutenção não encontrada" },
        { status: 404 },
      );
    }

    const pdfBuffer = await generateMaintenanceReportPDF(task, locale);

    const filenamePrefix =
      locale === "pt-pt" ? "Folha_de_Obra" : "Maintenance_Report";

      
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filenamePrefix}_${id.slice(0, 8)}.pdf"`,
        "Content-Length": String(pdfBuffer.length),
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error("Error generating PDF:", error);
    return NextResponse.json(
      { success: false, message: "Erro ao gerar o relatório em PDF" },
      { status: 500 },
    );
  }
}
