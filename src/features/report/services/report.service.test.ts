import { beforeEach, describe, expect, it, vi } from "vitest";
import * as getTaskModule from "../server/get-task";
import * as streamModule from "../pdf/stream";
import {
  buildMaintenanceReportPDF,
  buildReportResponse,
  ReportTaskNotFoundError,
} from "./report.service";

const { settingsFind } = vi.hoisted(() => ({ settingsFind: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  default: { tenantSettings: { findUnique: settingsFind } },
}));

const db = {} as never;

describe("report service", () => {
  beforeEach(() => {
    settingsFind.mockReset();
    settingsFind.mockResolvedValue(null);
  });

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
        db,
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

  it("formats report dates in the organization's time zone, falling back to the default", async () => {
    const getTaskMock = vi.spyOn(getTaskModule, "getMaintenanceTask").mockResolvedValue(mockTask);
    const streamMock = vi.spyOn(streamModule, "createMaintenanceReportPDFStream");

    try {
      settingsFind.mockResolvedValue({ timezone: "America/Sao_Paulo" });
      await buildMaintenanceReportPDF(db, "task-abcdef123456", "org-1", "site-1", "en");
      expect(settingsFind).toHaveBeenCalledWith({
        where: { organizationId: "org-1" },
        select: { timezone: true },
      });
      expect(streamMock).toHaveBeenLastCalledWith(mockTask, "en", "America/Sao_Paulo");

      settingsFind.mockResolvedValue(null);
      await buildMaintenanceReportPDF(db, "task-abcdef123456", "org-1", "site-1", "en");
      expect(streamMock).toHaveBeenLastCalledWith(mockTask, "en", "Europe/Lisbon");

      // A stored zone this runtime does not know must not break report generation.
      settingsFind.mockResolvedValue({ timezone: "Mars/Olympus" });
      await buildMaintenanceReportPDF(db, "task-abcdef123456", "org-1", "site-1", "en");
      expect(streamMock).toHaveBeenLastCalledWith(mockTask, "en", "Europe/Lisbon");
    } finally {
      getTaskMock.mockRestore();
      streamMock.mockRestore();
    }
  });

  it("buildMaintenanceReportPDF throws NOT_FOUND when task does not exist", async () => {
    const getTaskMock = vi.spyOn(getTaskModule, "getMaintenanceTask").mockResolvedValue(null);

    try {
      await expect(
        buildMaintenanceReportPDF(db, "nonexistent-task", "org-1", "site-1", "en"),
      ).rejects.toBeInstanceOf(ReportTaskNotFoundError);
    } finally {
      getTaskMock.mockRestore();
    }
  });

  it("buildReportResponse sets preview headers with inline Content-Disposition", async () => {
    const getTaskMock = vi.spyOn(getTaskModule, "getMaintenanceTask").mockResolvedValue(mockTask);

    try {
      const response = await buildReportResponse(
        db,
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
        db,
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
