import { describe, expect, it } from "vitest";
import {
  aggregateWorkerDailyHours,
  calculateWorkerWorkHours,
  formatWorkerDurationInHours,
  formatWorkerWorkDuration,
} from "./worker-hours";

describe("daily worker-hour aggregation", () => {
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
