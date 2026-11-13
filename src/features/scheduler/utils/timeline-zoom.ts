export const TIMELINE_ZOOM_LEVELS = [50, 75, 100, 125, 150, 175, 200] as const;
export const TIMELINE_ZOOM_TOLERANCE = 0.000001;

export type TimelineZoom = (typeof TIMELINE_ZOOM_LEVELS)[number] | "fit";

export function isTimelineZoom(value: unknown): value is TimelineZoom {
  return value === "fit" || TIMELINE_ZOOM_LEVELS.some((level) => level === value);
}

export function getTimelineMinimumZoom(fitZoom: number | null): number {
  if (fitZoom !== null && (!Number.isFinite(fitZoom) || fitZoom < 0 || fitZoom > 100)) {
    throw new RangeError("Timeline fit zoom must be between 0 and 100");
  }
  return Math.max(TIMELINE_ZOOM_LEVELS[0], fitZoom ?? TIMELINE_ZOOM_LEVELS[0]);
}

export function resolveTimelineZoom(level: TimelineZoom, fitZoom: number | null): number {
  const minimum = getTimelineMinimumZoom(fitZoom);
  return level === "fit" ? fitZoom === null ? 100 : minimum : Math.max(level, minimum);
}

export function stepTimelineZoom(
  level: TimelineZoom,
  direction: -1 | 1,
  fitZoom: number | null = null,
): TimelineZoom {
  const current = resolveTimelineZoom(level, fitZoom);
  if (direction === 1) {
    return TIMELINE_ZOOM_LEVELS.find((preset) => preset > current + TIMELINE_ZOOM_TOLERANCE) ?? TIMELINE_ZOOM_LEVELS[TIMELINE_ZOOM_LEVELS.length - 1];
  }
  const minimum = getTimelineMinimumZoom(fitZoom);
  const previous = TIMELINE_ZOOM_LEVELS.findLast((preset) => preset < current - TIMELINE_ZOOM_TOLERANCE);
  if (previous !== undefined && previous > minimum + TIMELINE_ZOOM_TOLERANCE) return previous;
  return fitZoom !== null && fitZoom >= TIMELINE_ZOOM_LEVELS[0] ? "fit" : TIMELINE_ZOOM_LEVELS[0];
}
