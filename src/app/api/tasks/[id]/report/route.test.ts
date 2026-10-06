import { describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { GET } from "./route";
import * as reportService from "@/features/report/services/report.service";

describe("GET /api/tasks/[id]/report", () => {
  it("returns 400 when id param is missing or empty", async () => {
    const request = new NextRequest("http://localhost:3000/api/tasks//report");
    const response = await GET(request, {
      params: Promise.resolve({ id: "" }),
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.message).toBe("Missing id");
  });

  it("calls buildReportResponse with extracted locale and default preview mode", async () => {
    const mockResponse = new NextResponse("PDF content", {
      status: 200,
      headers: { "Content-Type": "application/pdf" },
    });

    const buildReportMock = vi.spyOn(reportService, "buildReportResponse").mockImplementation(async (id: string, locale: any, mode: any) => {
      expect(id).toBe("task-999");
      expect(locale).toBe("pt-pt");
      expect(mode).toBe("preview");
      return mockResponse;
    });

    try {
      const request = new NextRequest(
        "http://localhost:3000/api/tasks/task-999/report?locale=pt-pt"
      );
      const response = await GET(request, {
        params: Promise.resolve({ id: "task-999" }),
      });

      expect(response.status).toBe(200);
      expect(buildReportMock.mock.calls.length).toBe(1);
    } finally {
      buildReportMock.mockRestore();
    }
  });

  it("calls buildReportResponse with download mode when requested", async () => {
    const mockResponse = new NextResponse("PDF content", {
      status: 200,
      headers: { "Content-Type": "application/pdf" },
    });

    const buildReportMock = vi.spyOn(reportService, "buildReportResponse").mockImplementation(async (id: string, locale: any, mode: any) => {
      expect(id).toBe("task-999");
      expect(locale).toBe("en");
      expect(mode).toBe("download");
      return mockResponse;
    });

    try {
      const request = new NextRequest(
        "http://localhost:3000/api/tasks/task-999/report?locale=en&mode=download"
      );
      const response = await GET(request, {
        params: Promise.resolve({ id: "task-999" }),
      });

      expect(response.status).toBe(200);
      expect(buildReportMock.mock.calls.length).toBe(1);
    } finally {
      buildReportMock.mockRestore();
    }
  });
});
