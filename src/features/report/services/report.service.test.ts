import { describe, expect, it, vi } from "vitest";
import * as getTaskModule from "../server/get-task";
import {
  buildMaintenanceReportPDF,
  buildReportResponse,
  ReportTaskNotFoundError,
} from "./report.service";

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

  it("buildMaintenanceReportPDF creates a stream and filename for an existing task", async () => {
    const getTaskMock = vi.spyOn(getTaskModule, "getMaintenanceTask").mockResolvedValue(mockTask);

    try {
      const result = await buildMaintenanceReportPDF(
        "task-abcdef123456",
        "org-1",
        "site-1",
        "en",
      );
      expect(result.filename).toBe("report-task-abc.pdf");
      expect(result.stream).toBeTruthy();
      expect(getTaskMock.mock.calls.length).toBe(1);
    } finally {
      getTaskMock.mockRestore();
    }
  });

  it("buildMaintenanceReportPDF throws NOT_FOUND when task does not exist", async () => {
    const getTaskMock = vi.spyOn(getTaskModule, "getMaintenanceTask").mockResolvedValue(null);

    try {
      await expect(
        buildMaintenanceReportPDF("nonexistent-task", "org-1", "site-1", "en"),
      ).rejects.toBeInstanceOf(ReportTaskNotFoundError);
    } finally {
      getTaskMock.mockRestore();
    }
  });

  it("buildReportResponse sets preview headers with inline Content-Disposition", async () => {
    const getTaskMock = vi.spyOn(getTaskModule, "getMaintenanceTask").mockResolvedValue(mockTask);

    try {
      const response = await buildReportResponse(
        "task-abcdef123456",
        "org-1",
        "site-1",
        "en",
        "preview",
      );
      expect(response.headers.get("Content-Type")).toBe("application/pdf");
      expect(response.headers.get("Content-Disposition")).toBe("inline");
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    } finally {
      getTaskMock.mockRestore();
    }
  });

  it("buildReportResponse sets download headers with attachment filename", async () => {
    const getTaskMock = vi.spyOn(getTaskModule, "getMaintenanceTask").mockResolvedValue(mockTask);

    try {
      const response = await buildReportResponse(
        "task-abcdef123456",
        "org-1",
        "site-1",
        "pt-pt",
        "download",
      );
      expect(response.headers.get("Content-Type")).toBe("application/pdf");
      expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="report-task-abc.pdf"');
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    } finally {
      getTaskMock.mockRestore();
    }
  });
});
