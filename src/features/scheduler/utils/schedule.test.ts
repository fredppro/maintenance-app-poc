import { describe, expect, it } from "vitest";
import {
  formatDateOnlyInTimeZone,
  formatTimeInTimeZone,
  fromZonedDateAndTime,
  toZonedCalendarDate,
} from "@/lib/time-zone";
import {
  calculatePlannedEndTime,
  getDefaultMaintenanceStartTime,
  getDefaultWorkerStartTime,
  shiftPlannedEndTime,
} from "./schedule";

describe("planned end-time calculations", () => {
  it("calculates an end across midnight, month-end, and year-end", () => {
    expect(
      calculatePlannedEndTime("2026-12-31T23:30:00.000Z", 90)?.toISOString(),
    ).toBe("2027-01-01T01:00:00.000Z");
  });

  it("calculates a planned end across a month boundary", () => {
    expect(
      calculatePlannedEndTime("2026-05-31T23:30:00.000Z", 90)?.toISOString(),
    ).toBe("2026-06-01T01:00:00.000Z");
  });

  it("recalculates the end when the planned start changes while preserving elapsed duration", () => {
    const start = new Date("2026-06-01T08:00:00.000Z");
    const end = calculatePlannedEndTime(start, 150);
    const nextStart = new Date("2026-06-02T10:30:00.000Z");

    expect(shiftPlannedEndTime(start, end, nextStart)?.toISOString()).toBe(
      "2026-06-02T13:00:00.000Z",
    );
  });

  it("keeps elapsed duration correct across organization daylight-saving transitions", () => {
    const timeZone = "Europe/Lisbon";
    const springStart = fromZonedDateAndTime(
      "2026-03-28",
      "08:00",
      timeZone,
    );
    const springEnd = calculatePlannedEndTime(springStart, 24 * 60)!;
    expect(formatDateOnlyInTimeZone(springEnd, timeZone)).toBe("2026-03-29");
    expect(formatTimeInTimeZone(springEnd, timeZone)).toBe("09:00");

    const fallStart = fromZonedDateAndTime(
      "2026-10-24",
      "08:00",
      timeZone,
    );
    const fallEnd = calculatePlannedEndTime(fallStart, 24 * 60)!;
    expect(formatDateOnlyInTimeZone(fallEnd, timeZone)).toBe("2026-10-25");
    expect(formatTimeInTimeZone(fallEnd, timeZone)).toBe("07:00");
  });

  it.each([
    [null, 60],
    ["invalid", 60],
    ["2026-06-01T08:00:00.000Z", 0],
    ["2026-06-01T08:00:00.000Z", -30],
    ["2026-06-01T08:00:00.000Z", Number.NaN],
  ] as const)("returns no planned end for invalid inputs", (start, duration) => {
    expect(calculatePlannedEndTime(start, duration)).toBeNull();
  });

  it("does not shift an end when the previous schedule is missing or inconsistent", () => {
    expect(
      shiftPlannedEndTime(
        "2026-06-01T08:00:00.000Z",
        "2026-06-01T07:00:00.000Z",
        "2026-06-02T08:00:00.000Z",
      ),
    ).toBeNull();
    expect(
      shiftPlannedEndTime(null, "2026-06-01T09:00:00.000Z", "2026-06-02T08:00:00.000Z"),
    ).toBeNull();
  });
});

describe("maintenance and worker start-time defaults", () => {
  it("defaults a new maintenance task to 08:00 in the organization timezone", () => {
    const startTime = getDefaultMaintenanceStartTime(
      "Europe/Lisbon",
      new Date("2026-06-01T22:30:00.000Z"),
    );
    const localStart = toZonedCalendarDate(startTime, "Europe/Lisbon");

    expect(localStart.getFullYear()).toBe(2026);
    expect(localStart.getMonth()).toBe(5);
    expect(localStart.getDate()).toBe(1);
    expect(localStart.getHours()).toBe(8);
  });

  it("defaults a new worker period to 08:00 unless the task starts later", () => {
    const timeZone = "Europe/Lisbon";
    const earlyTaskStart = new Date("2026-06-01T06:00:00.000Z");
    const defaultWorkerStart = getDefaultWorkerStartTime(
      earlyTaskStart,
      timeZone,
    );
    expect(
      toZonedCalendarDate(defaultWorkerStart, timeZone).getHours(),
    ).toBe(8);

    const lateTaskStart = new Date("2026-06-01T10:00:00.000Z");
    expect(getDefaultWorkerStartTime(lateTaskStart, timeZone)).toEqual(
      lateTaskStart,
    );
  });
});
