import { describe, expect, it } from "vitest";
import { createMaintenanceReportPDFStream } from "./stream";
import { routing } from "src/i18n/routing";

async function collectStream(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

describe("createMaintenanceReportPDFStream", () => {
  it("creates a PDF stream for a maintenance task with default locale", async () => {
    const entry = {
      id: "task-123",
      title: "Quarterly inspection",
      description: "Inspect conveyor belt",
      type: "PREVENTIVE",
      startTime: new Date("2025-06-01T08:00:00.000Z"),
      endTime: new Date("2025-06-01T10:00:00.000Z"),
      equipmentId: "equipment-1",
      equipment: {
        id: "equipment-1",
        name: "Conveyor A",
        category: "Conveyor",
      },
      status: "scheduled",
      assignments: [],
      materials: [],
    } as any;

    const stream = createMaintenanceReportPDFStream(entry, routing.defaultLocale);
    const pdf = await collectStream(stream);

    expect(pdf.length).toBeGreaterThan(0);
    expect(pdf.toString("latin1").startsWith("%PDF")).toBe(true);
  });

  it("creates a PDF stream with pt-pt locale and comprehensive task data", async () => {
    const entry = {
      id: "task-456789abcdef",
      title: "Substituição de Rolamento e Lubrificação Geral",
      description:
        "Substituição preventiva de rolamentos da linha principal e lubrificação com massa de alta temperatura.",
      type: "CORRECTIVE",
      startTime: new Date("2026-05-10T09:00:00.000Z"),
      endTime: new Date("2026-05-10T14:30:00.000Z"),
      equipmentId: "eq-heavy-1",
      equipment: {
        id: "eq-heavy-1",
        name: "Prensa Hidráulica H-500",
        category: "Maquinaria Pesada",
      },
      status: "completed",
      assignments: [
        {
          id: "asg-1",
          workerId: "w-1",
          startTime: new Date("2026-05-10T09:15:00.000Z"),
          endTime: new Date("2026-05-10T14:15:00.000Z"),
          worker: {
            id: "w-1",
            name: "Manuel Fernandes",
            email: "manuel@manusist.pt",
          },
        },
      ],
      materials: [
        {
          id: "mat-1",
          name: "Rolamento Esférico SKF",
          reference: "SKF-22212",
          quantity: 2,
          unit: "PC",
          price: 85.5,
        },
        {
          id: "mat-2",
          name: "Massa Lubrificante HT",
          reference: "GREASE-HT",
          quantity: 1.5,
          unit: "KG",
          price: 24.0,
        },
      ],
    } as any;

    const stream = createMaintenanceReportPDFStream(entry, "pt-pt");
    const pdf = await collectStream(stream);

    expect(pdf.length).toBeGreaterThan(0);
    expect(pdf.toString("latin1").startsWith("%PDF")).toBe(true);
  });

  it("handles overflow with multiple pages and long text without throwing", async () => {
    const longDescription = "Detailed inspection log entry. ".repeat(60);

    const entry = {
      id: "task-long-desc",
      title: "Complex Annual Overhaul",
      description: longDescription,
      type: "INSPECTION",
      startTime: new Date("2026-08-01T08:00:00.000Z"),
      endTime: new Date("2026-08-03T17:00:00.000Z"),
      equipmentId: "eq-1",
      equipment: {
        id: "eq-1",
        name: "Main Line Turbine",
        category: "Power",
      },
      status: "in-progress",
      assignments: Array.from({ length: 8 }, (_, i) => ({
        id: `asg-${i}`,
        workerId: `w-${i}`,
        worker: { id: `w-${i}`, name: `Technician ${i + 1}` },
      })),
      materials: Array.from({ length: 12 }, (_, i) => ({
        id: `mat-${i}`,
        name: `Spare Part ${i + 1}`,
        reference: `REF-${i + 100}`,
        quantity: i + 1,
        unit: "PC",
        price: (i + 1) * 15.25,
      })),
    } as any;

    const stream = createMaintenanceReportPDFStream(entry, "en");
    const pdf = await collectStream(stream);

    expect(pdf.length).toBeGreaterThan(0);
    expect(pdf.toString("latin1").startsWith("%PDF")).toBe(true);
    const pageCount =
      pdf.toString("latin1").match(/\/Type\s*\/Page\b/g)?.length ?? 0;
    expect(pageCount).toBeGreaterThan(1);
  });
});
