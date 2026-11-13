import { describe, expect, it } from "vitest";
import { toZonedCalendarDate } from "@/lib/time-zone";
import type { MaintenanceEntry } from "../types";
import {
  getEntrySpan,
  getEntryStartSlotIndex,
  getTimeSlots,
  getTimelineBoundaryClass,
  getTimelineCellMinWidth,
  getTimelineDensity,
  getTimelineSlotState,
  getTimelineTimePosition,
  getTimelineDatePosition,
  getTimelineScrollLeft,
  getViewRange,
  isSameSlot,
  layoutEquipmentRow,
} from "./timeline-grid-layout";
import { getTaskDisplayEnd } from "./schedule";

const entry = (id: string, start: Date, end: Date) =>
  ({ id, equipmentId: "e1", startTime: start, endTime: end }) as MaintenanceEntry;

describe("task display end", () => {
  it("uses the historical end time when present", () => {
    const end = getTaskDisplayEnd(
      new Date("2026-10-12T08:00:00.000Z"),
      new Date("2026-10-12T10:00:00.000Z"),
    );

    expect(end.toISOString()).toBe("2026-10-12T10:00:00.000Z");
  });

  it("uses a one-hour visual block when a task has no end time", () => {
    const end = getTaskDisplayEnd("2026-10-12T08:00:00.000Z");

    expect(end.toISOString()).toBe("2026-10-12T09:00:00.000Z");
  });
});

describe("timeline grid layout", () => {
  it("keeps slot widths compact but readable by view mode", () => {
    expect(getTimelineCellMinWidth("day")).toBe("min-w-20");
    expect(getTimelineCellMinWidth("week")).toBe("min-w-24");
    expect(getTimelineCellMinWidth("month")).toBe("min-w-20");
    expect(getTimelineCellMinWidth("year")).toBe("min-w-24");
  });

  it("closes the last column and distinguishes day boundaries", () => {
    const slots = [
      new Date(2026, 9, 31, 23),
      new Date(2026, 10, 1, 0),
      new Date(2026, 10, 1, 1),
    ];

    expect(getTimelineBoundaryClass(slots, "day", 0)).toBe(
      "border-r border-r-border",
    );
    expect(getTimelineBoundaryClass(slots, "day", 1)).toBe(
      "border-r-border-subtle",
    );
    expect(getTimelineBoundaryClass(slots, "day", 2)).toBe("border-r-0");
  });

  it("marks weekly boundaries in the month view", () => {
    const slots = [
      new Date(2026, 9, 4),
      new Date(2026, 9, 5),
      new Date(2026, 9, 6),
    ];

    expect(getTimelineBoundaryClass(slots, "month", 0)).toBe(
      "border-r border-r-border-strong",
    );
    expect(getTimelineBoundaryClass(slots, "month", 1)).toBe(
      "border-r-border-subtle",
    );
  });

  it("keeps week-view day separators subtle and closes the final column", () => {
    const slots = [
      new Date(2026, 9, 5),
      new Date(2026, 9, 6),
      new Date(2026, 9, 7),
    ];

    expect(getTimelineBoundaryClass(slots, "week", 0)).toBe(
      "border-r-border-subtle",
    );
    expect(getTimelineBoundaryClass(slots, "week", 2)).toBe("border-r-0");
  });

  it("marks quarter boundaries in the year view", () => {
    const slots = [
      new Date(2026, 1, 1),
      new Date(2026, 2, 1),
      new Date(2026, 3, 1),
    ];

    expect(getTimelineBoundaryClass(slots, "year", 0)).toBe(
      "border-r-border-subtle",
    );
    expect(getTimelineBoundaryClass(slots, "year", 1)).toBe(
      "border-r border-r-border-strong",
    );
  });
});

describe("timeline slots and placement", () => {
  const day = new Date(2026, 9, 7, 12);

  it("builds slots per view mode", () => {
    expect(getTimeSlots("day", day)).toHaveLength(24);
    expect(getTimeSlots("week", day)).toHaveLength(7);
    expect(getTimeSlots("week", day)[0].getDay()).toBe(1);
    expect(getTimeSlots("month", day)).toHaveLength(31);
    expect(getTimeSlots("year", day)).toHaveLength(12);
  });

  it("builds day slots in the organization timezone across daylight-saving changes", () => {
    const springDay = new Date("2026-03-29T12:00:00.000Z");
    const springSlots = getTimeSlots("day", springDay, "Europe/Lisbon");
    expect(springSlots).toHaveLength(23);
    expect(toZonedCalendarDate(springSlots[1], "Europe/Lisbon").getHours()).toBe(
      2,
    );

    const fallDay = new Date("2026-10-25T12:00:00.000Z");
    const fallSlots = getTimeSlots("day", fallDay, "Europe/Lisbon");
    expect(fallSlots).toHaveLength(25);
    expect(toZonedCalendarDate(fallSlots[1], "Europe/Lisbon").getHours()).toBe(
      1,
    );
    expect(toZonedCalendarDate(fallSlots[2], "Europe/Lisbon").getHours()).toBe(
      1,
    );
    expect(
      isSameSlot(fallSlots[1], fallSlots[2], "day", "Europe/Lisbon"),
    ).toBe(false);
  });

  it("ends the view range at the end of the last slot", () => {
    const slots = getTimeSlots("year", day);
    expect(getViewRange(slots, "year")?.end).toEqual(
      new Date(2026, 11, 31, 23, 59, 59, 999),
    );
    expect(getViewRange([], "day")).toBeNull();
  });

  it("locates the start slot and clamps the span to the view", () => {
    const slots = getTimeSlots("day", day);
    const range = getViewRange(slots, "day");
    const e = entry("a", new Date(2026, 9, 7, 9, 30), new Date(2026, 9, 7, 11, 10));
    expect(getEntryStartSlotIndex(e, slots, "day")).toBe(9);
    expect(getEntrySpan(e, range, "day")).toBe(2);

    const overnight = entry("b", new Date(2026, 9, 6, 22), new Date(2026, 9, 8, 3));
    expect(getEntryStartSlotIndex(overnight, slots, "day")).toBe(0);
    expect(getEntrySpan(overnight, range, "day")).toBe(24);
  });

  it("packs overlapping entries onto separate tracks and grows the row", () => {
    const slots = getTimeSlots("day", day);
    const range = getViewRange(slots, "day");
    const a = entry("a", new Date(2026, 9, 7, 8), new Date(2026, 9, 7, 11));
    const b = entry("b", new Date(2026, 9, 7, 9), new Date(2026, 9, 7, 10));
    const c = entry("c", new Date(2026, 9, 7, 14), new Date(2026, 9, 7, 15));

    const layout = layoutEquipmentRow([b, c, a], slots, range, "day");
    const tracks = Object.fromEntries(layout.items.map((i) => [i.entry.id, i.track]));
    expect(tracks).toEqual({ a: 0, b: 1, c: 0 });
    expect(layout.trackCount).toBe(2);
    expect(layout.height).toBe(144);

    const single = layoutEquipmentRow([c], slots, range, "day");
    expect(single.trackCount).toBe(1);
    expect(single.height).toBe(72);
  });

  it.each(["day", "week", "month", "year"] as const)("keeps %s tracks disjoint and inside their growing row", (mode) => {
    const slots = getTimeSlots(mode, day);
    const range = getViewRange(slots, mode);
    const tasks = ["a", "b", "c"].map((id) =>
      entry(id, new Date(2026, 9, 7, 9), new Date(2026, 9, 7, 11)),
    );
    const { items, height, trackCount } = layoutEquipmentRow(tasks, slots, range, mode);
    const density = getTimelineDensity(mode);
    expect(trackCount).toBe(3);
    const bottoms = items.map(({ track }) => density.padding + track * density.trackHeight + density.entryHeight);
    expect(Math.max(...bottoms) + density.padding).toBeLessThanOrEqual(height);
    expect(density.entryHeight + density.padding * 2).toBe(density.trackHeight);
    expect(getTimelineDensity("week").entryHeight).toBeGreaterThan(getTimelineDensity("month").entryHeight);
  });

  it("fits two title lines, metadata/avatars, gap, padding and borders in a weekly card", () => {
    expect(getTimelineDensity("week").entryHeight).toBeGreaterThanOrEqual(40 + 20 + 2 + 8 + 2);
  });

  it.each(["day", "week", "month", "year"] as const)("keeps %s rows content-sized without a reserved creation rail", (mode) => {
    const density = getTimelineDensity(mode);
    const { height } = layoutEquipmentRow([], getTimeSlots(mode, day), getViewRange(getTimeSlots(mode, day), mode), mode);
    expect(height).toBe(mode === "week" ? 80 : 72);
    expect(height - density.entryHeight).toBeLessThanOrEqual(16);
  });

  it("fits daily title, time/avatars, gap, padding and borders in each overlapping track", () => {
    expect(getTimelineDensity("day").entryHeight).toBeGreaterThanOrEqual(20 + 20 + 4 + 12 + 2);
  });
});

describe("calendar state and temporal positioning", () => {
  const zone = "Europe/Lisbon";

  it("uses the current instant as the date argument for current-hour detection", () => {
    const now = new Date("2026-10-07T08:30:00Z");
    const slots = getTimeSlots("day", now, zone);
    expect(slots.filter((slot) => getTimelineSlotState(slot, "day", now, zone).current))
      .toEqual([new Date("2026-10-07T08:00:00Z")]);
  });

  it("keeps weekend and today meanings independent in the configured timezone", () => {
    const now = new Date("2026-10-09T20:00:00Z");
    const slots = getTimeSlots("week", now, "Pacific/Kiritimati");
    expect(getTimelineSlotState(slots[4], "week", now, "Pacific/Kiritimati"))
      .toEqual({ current: false, weekend: false });
    expect(getTimelineSlotState(slots[5], "week", now, "Pacific/Kiritimati"))
      .toEqual({ current: true, weekend: true });
    expect(getTimelineSlotState(slots[6], "week", now, "Pacific/Kiritimati"))
      .toEqual({ current: false, weekend: true });
    expect(getTimelineSlotState(slots[5], "year", now, "Pacific/Kiritimati").weekend).toBe(false);
  });

  it.each([
    ["2026-03-29T11:00:00Z", 23, 11],
    ["2026-10-25T02:00:00Z", 25, 3],
  ])("positions the clock on the %s DST day using actual hourly instants", (iso, count, elapsed) => {
    const now = new Date(iso);
    const slots = getTimeSlots("day", now, zone);
    expect(slots).toHaveLength(count);
    expect(getTimelineTimePosition(now, slots, getViewRange(slots, "day", zone)))
      .toBeCloseTo((elapsed / count) * 100);
  });

  it("distinguishes both instances of a repeated local hour", () => {
    const first = new Date("2026-10-25T00:30:00Z");
    const second = new Date("2026-10-25T01:30:00Z");
    const slots = getTimeSlots("day", first, zone);
    expect(slots.findIndex((slot) => getTimelineSlotState(slot, "day", first, zone).current)).toBe(1);
    expect(slots.findIndex((slot) => getTimelineSlotState(slot, "day", second, zone).current)).toBe(2);
  });

  it("interpolates within equal-width calendar days, including a 23-hour Sunday", () => {
    const now = new Date("2026-03-29T11:00:00Z");
    const slots = getTimeSlots("week", now, zone);
    expect(getTimelineTimePosition(now, slots, getViewRange(slots, "week", zone)))
      .toBeCloseTo(((6 + 11 / 23) / 7) * 100);
  });

  it("handles range edges and rejects instants in another period", () => {
    const slots = getTimeSlots("month", new Date("2026-10-07T12:00:00Z"), zone);
    const range = getViewRange(slots, "month", zone)!;
    expect(getTimelineTimePosition(range.start, slots, range)).toBe(0);
    expect(getTimelineTimePosition(range.end, slots, range)).toBeCloseTo(100);
    expect(getTimelineTimePosition(new Date(range.start.getTime() - 1), slots, range)).toBeNull();
    expect(getTimelineTimePosition(new Date(range.end.getTime() + 1), slots, range)).toBeNull();
    expect(getTimelineTimePosition(new Date(), [], null)).toBeNull();
  });

  it("centers in the usable viewport and clamps both ends without sidebar constants", () => {
    expect(getTimelineScrollLeft(50, 2304, 1000, 200)).toBe(752);
    expect(getTimelineScrollLeft(0, 2304, 1000, 200)).toBe(0);
    expect(getTimelineScrollLeft(100, 2304, 1000, 200)).toBe(1504);
    expect(getTimelineScrollLeft(50, 400, 1000, 200)).toBe(0);
  });

  it.each(["week", "month"] as const)("focuses the whole %s date column, not a fractional clock position", (mode) => {
    const morning = new Date("2026-10-07T06:00:00Z");
    const evening = new Date("2026-10-07T22:00:00Z");
    const slots = getTimeSlots(mode, morning, "UTC");
    const position = getTimelineDatePosition(morning, slots, mode, "UTC");
    expect(position).toBe(getTimelineDatePosition(evening, slots, mode, "UTC"));
    expect(position).toBeCloseTo(((mode === "week" ? 2.5 : 6.5) / slots.length) * 100);
    expect(getTimelineDatePosition(new Date("2027-01-01T12:00:00Z"), slots, mode, "UTC")).toBeNull();
  });
});
