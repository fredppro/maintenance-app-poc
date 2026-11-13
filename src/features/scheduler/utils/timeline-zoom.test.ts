import { describe, expect, it } from "vitest";
import { getTimelineColumnWidth, getTimelineDensity, getTimelineFitZoom } from "./timeline-grid-layout";
import { getTimelineMinimumZoom, isTimelineZoom, resolveTimelineZoom, stepTimelineZoom, TIMELINE_ZOOM_LEVELS } from "./timeline-zoom";

describe("timeline zoom", () => {
  it("uses 25-point steps with bounded endpoints", () => {
    expect(TIMELINE_ZOOM_LEVELS).toEqual([50, 75, 100, 125, 150, 175, 200]);
    expect(stepTimelineZoom(50, -1)).toBe(50);
    expect(stepTimelineZoom(200, 1)).toBe(200);
    for (let index = 0; index < TIMELINE_ZOOM_LEVELS.length - 1; index++) {
      expect(stepTimelineZoom(TIMELINE_ZOOM_LEVELS[index], 1)).toBe(TIMELINE_ZOOM_LEVELS[index + 1]);
    }
    expect(isTimelineZoom(110)).toBe(false);
    expect(isTimelineZoom(Number.NaN)).toBe(false);
    expect(isTimelineZoom("fit")).toBe(true);
  });

  it("adds an exact fit stop between presets and resumes at the next preset", () => {
    const fit = 926 / 1152 * 100;
    expect(getTimelineMinimumZoom(fit)).toBe(fit);
    expect(stepTimelineZoom(100, -1, fit)).toBe("fit");
    expect(resolveTimelineZoom("fit", fit)).toBe(fit);
    expect(stepTimelineZoom("fit", -1, fit)).toBe("fit");
    expect(stepTimelineZoom("fit", 1, fit)).toBe(100);
    expect(stepTimelineZoom(125, -1, 100)).toBe("fit");
    expect(resolveTimelineZoom(50, 100)).toBe(100);
  });

  it("retains the 50% readability floor when fit would require smaller columns", () => {
    expect(getTimelineMinimumZoom(20)).toBe(50);
    expect(resolveTimelineZoom("fit", 20)).toBe(50);
    expect(stepTimelineZoom(75, -1, 20)).toBe(50);
    expect(stepTimelineZoom(50, -1, 20)).toBe(50);
    expect(resolveTimelineZoom("fit", null)).toBe(100);
  });

  it("does not add an imperceptible step for floating-point fit boundaries", () => {
    expect(stepTimelineZoom("fit", 1, 100 - 1e-12)).toBe(125);
    expect(stepTimelineZoom(100, -1, 75 - 1e-12)).toBe("fit");
  });

  it.each([-1, 101, Number.NaN, Number.POSITIVE_INFINITY])("rejects invalid fit percentages: %s", (fit) => {
    expect(() => getTimelineMinimumZoom(fit)).toThrow(RangeError);
  });

  it.each([
    ["day", 24], ["week", 7], ["month", 30], ["year", 12],
  ] as const)("scales %s columns without leaving unused viewport width", (mode, slots) => {
    const baseline = getTimelineColumnWidth(mode, slots, 1134, 208, 100);
    for (const zoom of TIMELINE_ZOOM_LEVELS) {
      expect(getTimelineColumnWidth(mode, slots, 1134, 208, zoom)).toBeCloseTo(Math.max(926 / slots, baseline * zoom / 100));
    }
    const fit = getTimelineFitZoom(mode, slots, 1134, 208);
    expect(getTimelineColumnWidth(mode, slots, 1134, 208, fit) * slots).toBeCloseTo(926);
    expect(getTimelineFitZoom(mode, slots, 4096, 208)).toBe(100);
    if (mode === "week") expect(baseline).toBeCloseTo(926 / 7);
  });

  it.each([23, 24, 25, 28, 29, 30, 31])("fits exact widths for periods with %i slots", (slots) => {
    const fit = getTimelineFitZoom("month", slots, 1700, 208);
    const zoom = resolveTimelineZoom("fit", fit);
    expect(getTimelineColumnWidth("month", slots, 1700, 208, zoom) * slots).toBeCloseTo(1492);
  });

  it.each(["day", "week", "month", "year"] as const)("keeps %s entries readable and packed without overlaps", (mode) => {
    const baseline = getTimelineDensity(mode);
    for (const zoom of TIMELINE_ZOOM_LEVELS) {
      const density = getTimelineDensity(mode, zoom);
      expect(density.entryHeight).toBeGreaterThanOrEqual(44);
      expect(density.trackHeight).toBeGreaterThanOrEqual(density.entryHeight + density.padding * 2);
      expect(density.minRowHeight).toBeGreaterThanOrEqual(density.trackHeight);
      expect(density.headerHeight).toBe(baseline.headerHeight);
    }
    expect(getTimelineDensity(mode, 125).trackHeight).toBe(baseline.trackHeight * 1.25);
    expect(getTimelineDensity(mode, 200).minRowHeight).toBe(baseline.minRowHeight * 2);
  });
});
