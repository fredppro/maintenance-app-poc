import { describe, expect, it } from "vitest";
import type { MaintenanceEntry } from "../types";
import {
  getEntrySpan,
  getEntryStartSlotIndex,
  getTimeSlots,
  getTimelineBoundaryClass,
  getTimelineCellMinWidth,
  getViewRange,
  layoutEquipmentRow,
} from "./timeline-grid-layout";

const entry = (id: string, start: Date, end: Date) =>
  ({ id, equipmentId: "e1", startTime: start, endTime: end }) as MaintenanceEntry;

describe("timeline grid layout", () => {
  it("keeps slot widths compact but readable by view mode", () => {
    expect(getTimelineCellMinWidth("day")).toBe("min-w-16");
    expect(getTimelineCellMinWidth("week")).toBe("min-w-[4.75rem]");
    expect(getTimelineCellMinWidth("month")).toBe("min-w-10");
    expect(getTimelineCellMinWidth("year")).toBe("min-w-16");
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
      "border-r-2 border-r-border-strong",
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
      "border-r-2 border-r-border-strong",
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
    expect(layout.height).toBe(72);

    const single = layoutEquipmentRow([c], slots, range, "day");
    expect(single.trackCount).toBe(1);
    expect(single.height).toBe(56);
  });
});
