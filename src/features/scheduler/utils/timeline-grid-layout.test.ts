import { describe, expect, it } from "vitest";
import {
  getTimelineBoundaryClass,
  getTimelineCellMinWidth,
} from "./timeline-grid-layout";

describe("timeline grid layout", () => {
  it("keeps slot widths compact but readable by view mode", () => {
    expect(getTimelineCellMinWidth("day")).toBe("min-w-[5.5rem]");
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
