import assert from "node:assert/strict";
import test, { describe, mock } from "node:test";
import { NextRequest, NextResponse } from "next/server";
import { GET } from "./route";
import * as reportService from "@/features/report/services/report.service";

describe("GET /api/tasks/[id]/report", () => {
  test("returns 400 when id param is missing or empty", async () => {
    const request = new NextRequest("http://localhost:3000/api/tasks//report");
    const response = await GET(request, {
      params: Promise.resolve({ id: "" }),
    });

    assert.strictEqual(response.status, 400);
    const body = await response.json();
    assert.strictEqual(body.message, "Missing id");
  });

  test("calls buildReportResponse with extracted locale and default preview mode", async () => {
    const mockResponse = new NextResponse("PDF content", {
      status: 200,
      headers: { "Content-Type": "application/pdf" },
    });

    const buildReportMock = mock.method(
      reportService,
      "buildReportResponse",
      async (id: string, locale: any, mode: any) => {
        assert.strictEqual(id, "task-999");
        assert.strictEqual(locale, "pt-pt");
        assert.strictEqual(mode, "preview");
        return mockResponse;
      }
    );

    try {
      const request = new NextRequest(
        "http://localhost:3000/api/tasks/task-999/report?locale=pt-pt"
      );
      const response = await GET(request, {
        params: Promise.resolve({ id: "task-999" }),
      });

      assert.strictEqual(response.status, 200);
      assert.strictEqual(buildReportMock.mock.calls.length, 1);
    } finally {
      buildReportMock.mock.restore();
    }
  });

  test("calls buildReportResponse with download mode when requested", async () => {
    const mockResponse = new NextResponse("PDF content", {
      status: 200,
      headers: { "Content-Type": "application/pdf" },
    });

    const buildReportMock = mock.method(
      reportService,
      "buildReportResponse",
      async (id: string, locale: any, mode: any) => {
        assert.strictEqual(id, "task-999");
        assert.strictEqual(locale, "en");
        assert.strictEqual(mode, "download");
        return mockResponse;
      }
    );

    try {
      const request = new NextRequest(
        "http://localhost:3000/api/tasks/task-999/report?locale=en&mode=download"
      );
      const response = await GET(request, {
        params: Promise.resolve({ id: "task-999" }),
      });

      assert.strictEqual(response.status, 200);
      assert.strictEqual(buildReportMock.mock.calls.length, 1);
    } finally {
      buildReportMock.mock.restore();
    }
  });
});
