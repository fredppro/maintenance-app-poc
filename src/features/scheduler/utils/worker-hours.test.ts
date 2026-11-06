import { describe, expect, it } from "vitest";
import {
  aggregateWorkerDailyHours,
  calculateWorkLogEnd,
  calculateWorkerWorkHours,
  formatWorkerDurationInHours,
  formatWorkerWorkDuration,
  inferWorkLogStartTimes,
} from "./worker-hours";

describe("daily worker-hour aggregation", () => {
  it("infers starts sequentially for each worker from the task schedule", () => {
    const starts = inferWorkLogStartTimes(
      [
        { workerId: "worker-a", workDate: "2026-07-01", hours: 3 },
        { workerId: "worker-b", workDate: "2026-07-01", hours: 2 },
        { workerId: "worker-a", workDate: "2026-07-01", hours: 2 },
        { workerId: "worker-b", workDate: "2026-07-01", hours: 1 },
      ],
      new Date("2026-07-01T07:00:00.000Z"),
      "Europe/Lisbon",
    );

    expect(starts).toEqual([
      { workDate: "2026-07-01", startTime: "08:00" },
      { workDate: "2026-07-01", startTime: "08:00" },
      { workDate: "2026-07-01", startTime: "11:00" },
      { workDate: "2026-07-01", startTime: "10:00" },
    ]);
  });

  it("preserves explicit starts while using missing historical starts for sequencing", () => {
    const starts = inferWorkLogStartTimes(
      [
        {
          id: "legacy-log",
          workerId: "worker-a",
          workDate: "2026-07-01",
          startTime: "",
          hours: 3,
        },
        {
          workerId: "worker-a",
          workDate: "2026-07-01",
          startTime: "09:15",
          hours: 1.5,
        },
        { workerId: "worker-a", workDate: "2026-07-01", hours: 2 },
      ],
      new Date("2026-07-01T07:00:00.000Z"),
      "Europe/Lisbon",
    );

    expect(starts).toEqual([
      null,
      { workDate: "2026-07-01", startTime: "09:15" },
      { workDate: "2026-07-01", startTime: "11:00" },
    ]);
  });

  it("uses the current local hour when neither the schedule nor that worker's history provides one", () => {
    const starts = inferWorkLogStartTimes(
      [{ workerId: "worker-a", workDate: "2026-07-01", hours: 2 }],
      null,
      "Europe/Lisbon",
      new Date("2026-07-01T10:42:00.000Z"),
    );

    expect(starts).toEqual([
      { workDate: "2026-07-01", startTime: "11:00" },
    ]);
  });

  it("uses a historical missing-start log to infer the next time without changing that log", () => {
    const starts = inferWorkLogStartTimes(
      [
        {
          id: "legacy-log",
          workerId: "worker-a",
          workDate: "2026-07-01",
          startTime: null,
          hours: 3,
        },
        { workerId: "worker-a", workDate: "2026-07-01", hours: 2 },
      ],
      new Date("2026-07-01T07:00:00.000Z"),
      "Europe/Lisbon",
    );

    expect(starts).toEqual([
      null,
      { workDate: "2026-07-01", startTime: "11:00" },
    ]);
  });

  it("does not infer a worker's time until a worker is selected", () => {
    const starts = inferWorkLogStartTimes(
      [{ workerId: "", workDate: "2026-07-01", hours: 2 }],
      null,
      "Europe/Lisbon",
      new Date("2026-07-01T10:42:00.000Z"),
    );

    expect(starts).toEqual([null]);
  });

  it("moves an inferred next start to the next date when the worker's prior log crosses midnight", () => {
    const starts = inferWorkLogStartTimes(
      [
        {
          workerId: "worker-a",
          workDate: "2026-06-01",
          startTime: "23:30",
          hours: 2,
        },
        { workerId: "worker-a", workDate: "2026-06-01", hours: 1 },
      ],
      new Date("2026-06-01T07:00:00.000Z"),
      "Europe/Lisbon",
    );

    expect(starts[1]).toEqual({
      workDate: "2026-06-02",
      startTime: "01:30",
    });
  });

  it("calculates work-log end times across midnight in the selected time zone", () => {
    const end = calculateWorkLogEnd(
      "2026-06-01",
      "23:30",
      2,
      "Europe/Lisbon",
    );

    expect(end?.toISOString()).toBe("2026-06-02T00:30:00.000Z");
  });

  it("uses a single persisted daily entry as the worker total", () => {
    const totals = aggregateWorkerDailyHours([
      { workerId: "worker-1", workDate: "2026-12-19", hours: "8.00" },
    ]);

    expect(totals.get("worker-1")).toBe(8);
    expect(formatWorkerDurationInHours(totals.get("worker-1")!)).toBe("8h");
  });

  it("sums multiple entries for the same worker on the same day", () => {
    const totals = aggregateWorkerDailyHours([
      { workerId: "worker-1", workDate: "2026-12-19", hours: 2.5 },
      { workerId: "worker-1", workDate: "2026-12-19", hours: 1.5 },
    ]);

    expect(totals.get("worker-1")).toBe(4);
    expect(formatWorkerDurationInHours(totals.get("worker-1")!)).toBe("4h");
  });

  it("sums every day for the worker, including the reported 8 + 1 hour case", () => {
    const totals = aggregateWorkerDailyHours([
      { workerId: "worker-1", workDate: "2026-12-19", hours: "8.00" },
      { workerId: "worker-1", workDate: "2026-12-20", hours: "1.00" },
    ]);

    expect(totals.get("worker-1")).toBe(9);
    expect(formatWorkerDurationInHours(totals.get("worker-1")!)).toBe("9h");
  });

  it("aggregates workers independently on the same task", () => {
    const totals = aggregateWorkerDailyHours([
      { workerId: "worker-1", workDate: "2026-12-19", hours: 8 },
      { workerId: "worker-1", workDate: "2026-12-20", hours: 1 },
      { workerId: "worker-2", workDate: "2026-12-19", hours: 3.5 },
      { workerId: "worker-2", workDate: "2026-12-20", hours: 2 },
    ]);

    expect([...totals]).toEqual([
      ["worker-1", 9],
      ["worker-2", 5.5],
    ]);
  });
});

describe("worker work duration", () => {
  it("calculates each worker's elapsed hours independently across day boundaries", () => {
    expect(
      calculateWorkerWorkHours(
        "2026-06-01T22:30:00.000Z",
        "2026-06-02T01:00:00.000Z",
      ),
    ).toBe(2.5);
    expect(
      calculateWorkerWorkHours(
        "2026-06-01T08:15:00.000Z",
        "2026-06-01T12:30:00.000Z",
      ),
    ).toBe(4.25);
  });

  it("formats rounded elapsed minutes without producing 60-minute remainders", () => {
    expect(
      formatWorkerWorkDuration(
        "2026-06-01T08:00:00.000Z",
        "2026-06-01T09:59:45.000Z",
      ),
    ).toBe("2h");
  });

  it.each([
    [null, null],
    ["2026-06-01T08:00:00.000Z", null],
    [null, "2026-06-01T09:00:00.000Z"],
    ["invalid", "2026-06-01T09:00:00.000Z"],
    ["2026-06-01T09:00:00.000Z", "2026-06-01T08:00:00.000Z"],
    ["2026-06-01T08:00:00.000Z", "2026-06-01T08:00:00.000Z"],
  ])("does not invent hours for incomplete or invalid logs", (start, end) => {
    expect(calculateWorkerWorkHours(start, end)).toBeNull();
    expect(formatWorkerWorkDuration(start, end)).toBeNull();
  });
});
