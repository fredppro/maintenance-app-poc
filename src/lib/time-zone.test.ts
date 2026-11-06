import { describe, expect, it } from "vitest";
import {
  dateOnlyAtNoonInTimeZone,
  formatDateOnlyInTimeZone,
  formatTimeInTimeZone,
  fromZonedDateAndTime,
  fromZonedCalendarDate,
  toZonedCalendarDate,
} from "./time-zone";

describe("time-zone conversion", () => {
  it("round-trips an organization wall time across seasonal UTC offsets", () => {
    const winter = fromZonedCalendarDate(
      new Date(2026, 0, 15, 8, 30),
      "Europe/Lisbon",
    );
    const summer = fromZonedCalendarDate(
      new Date(2026, 6, 15, 8, 30),
      "Europe/Lisbon",
    );

    expect(winter.toISOString()).toBe("2026-01-15T08:30:00.000Z");
    expect(summer.toISOString()).toBe("2026-07-15T07:30:00.000Z");
    expect(toZonedCalendarDate(summer, "Europe/Lisbon")).toEqual(
      new Date(2026, 6, 15, 8, 30),
    );
  });

  it("chooses the earlier occurrence for an ambiguous fall-back time", () => {
    const date = fromZonedCalendarDate(
      new Date(2026, 10, 1, 1, 30),
      "America/New_York",
    );

    expect(date.toISOString()).toBe("2026-11-01T05:30:00.000Z");
  });

  it("moves a nonexistent spring-forward time forward by the DST gap", () => {
    const date = fromZonedCalendarDate(
      new Date(2026, 2, 8, 2, 30),
      "America/New_York",
    );

    expect(date.toISOString()).toBe("2026-03-08T07:30:00.000Z");
  });

  it("keeps date-only values on their selected organization calendar day", () => {
    const date = dateOnlyAtNoonInTimeZone("2026-07-01", "Asia/Tokyo");

    expect(formatDateOnlyInTimeZone(date, "Asia/Tokyo")).toBe("2026-07-01");
  });

  it("converts a work-log date and 24-hour time using the organization zone", () => {
    const date = fromZonedDateAndTime("2026-07-01", "08:30", "Europe/Lisbon");

    expect(date.toISOString()).toBe("2026-07-01T07:30:00.000Z");
    expect(formatTimeInTimeZone(date, "Europe/Lisbon")).toBe("08:30");
  });

  it("rejects malformed or impossible work-log date and time values", () => {
    expect(() =>
      fromZonedDateAndTime("2026-02-31", "08:30", "Europe/Lisbon"),
    ).toThrow(RangeError);
    expect(() =>
      fromZonedDateAndTime("2026-02-28", "8:30", "Europe/Lisbon"),
    ).toThrow(RangeError);
  });
});
