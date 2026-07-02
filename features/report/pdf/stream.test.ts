import assert from "node:assert/strict";
import test from "node:test";

import { createMaintenanceReportPDFStream } from "./stream";
import { routing } from "@/i18n/routing";

test("creates a PDF stream for a maintenance task", async () => {
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
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const pdf = Buffer.concat(chunks);

  assert.ok(pdf.length > 0);
  assert.match(pdf.toString("latin1"), /^%PDF/);
});
