import { describe, expect, it } from "vitest";
import { toZonedCalendarDate } from "@/lib/time-zone";
import {
  getDefaultMaintenanceStartTime,
  getDefaultWorkerStartTime,
} from "./schedule";

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
