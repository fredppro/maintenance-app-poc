import { describe, expect, it } from "vitest";
import enMessages from "@/i18n/messages/en.json";
import { renderMaintenanceReport } from "./renderer";

function createRecordingDocument() {
  const textCalls: unknown[][] = [];
  const document = new Proxy(
    {},
    {
      get(_target, property) {
        if (property === "text") {
          return (...args: unknown[]) => {
            textCalls.push(args);
            return document;
          };
        }
        if (property === "heightOfString") return () => 0;
        if (property === "bufferedPageRange") {
          return () => ({ start: 0, count: 1 });
        }
        return () => document;
      },
    },
  );
  return { document, textCalls };
}

describe("maintenance report labor", () => {
  it("renders each persisted worker interval independently and leaves unknown time unrecorded", () => {
    const { document, textCalls } = createRecordingDocument();
    const entry = {
      id: "task-12345678",
      title: "Repair conveyor",
      description: null,
      type: "CORRECTIVE",
      status: "completed",
      startTime: new Date("2026-06-01T08:00:00.000Z"),
      endTime: null,
      equipment: { id: "equipment-1", name: "Conveyor", category: "Line" },
      assignments: [
        {
          worker: { name: "Alex" },
          startTime: new Date("2026-06-01T22:30:00.000Z"),
          endTime: new Date("2026-06-02T01:00:00.000Z"),
        },
        {
          worker: { name: "Sam" },
          startTime: new Date("2026-06-01T08:15:00.000Z"),
          endTime: new Date("2026-06-01T12:30:00.000Z"),
        },
        {
          worker: { name: "Jamie" },
          startTime: null,
          endTime: null,
        },
      ],
      materials: [],
    };

    renderMaintenanceReport(
      document as PDFKit.PDFDocument,
      entry as never,
      enMessages.PDF,
      "en-US",
      "UTC",
    );

    const durationValues = textCalls
      .filter(
        ([value, x]) => x === 470 && value !== enMessages.PDF.labor.duration,
      )
      .map(([value]) => value);
    const startValues = textCalls
      .filter(([value, x]) => x === 240 && value !== enMessages.PDF.labor.start)
      .map(([value]) => value);
    const endValues = textCalls
      .filter(([value, x]) => x === 360 && value !== enMessages.PDF.labor.end)
      .map(([value]) => value);

    expect(durationValues).toEqual(["2h 30m", "4h 15m", "Not recorded"]);
    expect(startValues.slice(0, 3)).toEqual([
      "06/01/2026, 10:30 PM",
      "06/01/2026, 08:15 AM",
      "Not recorded",
    ]);
    expect(endValues.slice(0, 3)).toEqual([
      "06/02/2026, 01:00 AM",
      "06/01/2026, 12:30 PM",
      "Not recorded",
    ]);
  });

  it("renders each work log with its persisted start time and calculated end", () => {
    const { document, textCalls } = createRecordingDocument();
    const entry = {
      id: "task-12345678",
      title: "Repair conveyor",
      description: null,
      type: "CORRECTIVE",
      status: "completed",
      startTime: new Date("2026-06-01T08:00:00.000Z"),
      endTime: null,
      equipment: { id: "equipment-1", name: "Conveyor", category: "Line" },
      assignments: [],
      dailyHours: [
        {
          workerId: "worker-1",
          worker: { name: "Fabio" },
          workDate: new Date("2026-06-02T00:00:00.000Z"),
          startTime: new Date("2026-06-02T22:30:00.000Z"),
          hours: "2.00",
        },
        {
          workerId: "worker-1",
          worker: { name: "Fabio" },
          workDate: new Date("2026-06-04T00:00:00.000Z"),
          startTime: new Date("2026-06-04T08:00:00.000Z"),
          hours: "1.25",
        },
        {
          workerId: "worker-1",
          worker: { name: "Fabio" },
          workDate: new Date("2026-06-05T00:00:00.000Z"),
          startTime: null,
          hours: "3.00",
        },
      ],
      materials: [],
    };

    renderMaintenanceReport(
      document as PDFKit.PDFDocument,
      entry as never,
      enMessages.PDF,
      "en-US",
      "UTC",
    );

    const valuesAt = (x: number) =>
      textCalls
        .filter(
          ([value, position]) =>
            position === x &&
            value !== enMessages.PDF.labor.start &&
            value !== enMessages.PDF.labor.end &&
            value !== enMessages.PDF.labor.duration,
        )
        .map(([value]) => value);

    expect(
      textCalls.filter(([value, position]) => value === "Fabio" && position === 42),
    ).toHaveLength(3);
    expect(valuesAt(240)).toEqual([
      "06/02/2026, 10:30 PM",
      "06/04/2026, 08:00 AM",
      "06/05/2026",
    ]);
    expect(valuesAt(360)).toEqual([
      "06/03/2026, 12:30 AM",
      "06/04/2026, 09:15 AM",
      "Not recorded",
    ]);
    expect(valuesAt(470)).toEqual(["2h", "1h 15m", "3h"]);
  });

  it("renders each persisted work-log duration separately", () => {
    const { document, textCalls } = createRecordingDocument();
    const entry = {
      id: "task-87654321",
      title: "Inspect pump",
      description: null,
      type: "PREVENTIVE",
      status: "completed",
      startTime: new Date("2026-12-19T08:00:00.000Z"),
      endTime: new Date("2026-12-20T17:00:00.000Z"),
      completedAt: new Date("2026-12-20T17:15:00.000Z"),
      equipment: { id: "equipment-2", name: "Pump", category: "Utilities" },
      assignments: [
        {
          workerId: "worker-1",
          worker: { name: "Alex" },
          startTime: new Date("2026-12-19T08:00:00.000Z"),
          endTime: new Date("2026-12-20T17:00:00.000Z"),
        },
        {
          workerId: "worker-2",
          worker: { name: "Sam" },
          startTime: new Date("2026-12-19T09:00:00.000Z"),
          endTime: new Date("2026-12-19T13:00:00.000Z"),
        },
      ],
      dailyHours: [
        {
          workerId: "worker-1",
          workDate: new Date("2026-12-19T00:00:00.000Z"),
          hours: "8.00",
        },
        {
          workerId: "worker-1",
          workDate: new Date("2026-12-20T00:00:00.000Z"),
          hours: "1.00",
        },
        {
          workerId: "worker-2",
          workDate: new Date("2026-12-19T00:00:00.000Z"),
          hours: "2.50",
        },
        {
          workerId: "worker-2",
          workDate: new Date("2026-12-19T00:00:00.000Z"),
          hours: "1.50",
        },
      ],
      materials: [],
    };

    renderMaintenanceReport(
      document as PDFKit.PDFDocument,
      entry as never,
      enMessages.PDF,
      "en-US",
      "UTC",
    );

    const durationValues = textCalls
      .filter(
        ([value, x]) => x === 470 && value !== enMessages.PDF.labor.duration,
      )
      .map(([value]) => value);

    expect(durationValues).toEqual(["8h", "1h", "2h 30m", "1h 30m"]);
    expect(textCalls).toContainEqual([
      "12/20/2026, 05:15 PM",
      300,
      expect.any(Number),
      expect.objectContaining({ width: 240 }),
    ]);
  });
});
