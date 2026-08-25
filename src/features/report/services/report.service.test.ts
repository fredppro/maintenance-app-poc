import assert from "node:assert/strict";
import test, { describe, mock } from "node:test";
import * as getTaskModule from "../server/get-task";
import { buildMaintenanceReportPDF, buildReportResponse } from "./report.service";

describe("report service", () => {
  const mockTask = {
    id: "task-abcdef123456",
    title: "Quarterly Pump Maintenance",
    description: "Inspect seals and bearings",
    type: "PREVENTIVE",
    startTime: new Date("2026-06-01T08:00:00.000Z"),
    endTime: new Date("2026-06-01T11:00:00.000Z"),
    equipmentId: "equip-1",
    equipment: {
      id: "equip-1",
      name: "Water Pump 01",
      category: "Hydraulics",
    },
    status: "scheduled",
    assignments: [],
    materials: [],
  } as any;

  test("buildMaintenanceReportPDF creates a stream and filename for an existing task", async () => {
    const getTaskMock = mock.method(getTaskModule, "getMaintenanceTask", async () => mockTask);

    try {
      const result = await buildMaintenanceReportPDF("task-abcdef123456", "en");
      assert.strictEqual(result.filename, "report-task-abc.pdf");
      assert.ok(result.stream);
      assert.strictEqual(getTaskMock.mock.calls.length, 1);
    } finally {
      getTaskMock.mock.restore();
    }
  });

  test("buildMaintenanceReportPDF throws NOT_FOUND when task does not exist", async () => {
    const getTaskMock = mock.method(getTaskModule, "getMaintenanceTask", async () => null);

    try {
      await assert.rejects(
        () => buildMaintenanceReportPDF("nonexistent-task", "en"),
        { message: "NOT_FOUND" }
      );
    } finally {
      getTaskMock.mock.restore();
    }
  });

  test("buildReportResponse sets preview headers with inline Content-Disposition", async () => {
    const getTaskMock = mock.method(getTaskModule, "getMaintenanceTask", async () => mockTask);

    try {
      const response = await buildReportResponse("task-abcdef123456", "en", "preview");
      assert.strictEqual(response.headers.get("Content-Type"), "application/pdf");
      assert.strictEqual(response.headers.get("Content-Disposition"), "inline");
      assert.strictEqual(response.headers.get("Cache-Control"), "no-store");
    } finally {
      getTaskMock.mock.restore();
    }
  });

  test("buildReportResponse sets download headers with attachment filename", async () => {
    const getTaskMock = mock.method(getTaskModule, "getMaintenanceTask", async () => mockTask);

    try {
      const response = await buildReportResponse("task-abcdef123456", "pt-pt", "download");
      assert.strictEqual(response.headers.get("Content-Type"), "application/pdf");
      assert.strictEqual(
        response.headers.get("Content-Disposition"),
        'attachment; filename="report-task-abc.pdf"'
      );
      assert.strictEqual(response.headers.get("Cache-Control"), "no-store");
    } finally {
      getTaskMock.mock.restore();
    }
  });
});
