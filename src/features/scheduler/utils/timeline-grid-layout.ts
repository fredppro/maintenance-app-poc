import {
  addHours,
  differenceInDays,
  eachDayOfInterval,
  eachHourOfInterval,
  eachMonthOfInterval,
  endOfDay,
  endOfMonth,
  endOfWeek,
  isSameDay,
  isSameHour,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from "date-fns";
import type { MaintenanceEntry, ViewMode } from "../types";

const cellWidths: Record<ViewMode, string> = {
  day: "min-w-16",
  week: "min-w-[4.75rem]",
  month: "min-w-10",
  year: "min-w-16",
};

export function getTimelineCellMinWidth(viewMode: ViewMode): string {
  return cellWidths[viewMode];
}

export function getTimelineBoundaryClass(
  timeSlots: Date[],
  viewMode: ViewMode,
  index: number,
): string {
  const date = timeSlots[index];
  const nextSlot = timeSlots[index + 1];
  if (!date || !nextSlot) return "border-r-0";

  if (viewMode === "year" && nextSlot.getMonth() % 3 === 0) {
    return "border-r-2 border-r-border-strong";
  }

  if (viewMode === "month") {
    if (nextSlot.getMonth() !== date.getMonth()) {
      return "border-r-2 border-r-border-strong";
    }
    if (nextSlot.getDay() === 1) {
      return "border-r-2 border-r-border-strong";
    }
  }

  if (viewMode === "day" && date.getDate() !== nextSlot.getDate()) {
    return "border-r border-r-border";
  }

  return "border-r-border-subtle";
}

export function getTimeSlots(viewMode: ViewMode, currentDate: Date): Date[] {
  switch (viewMode) {
    case "day": {
      const dayStart = startOfDay(currentDate);
      return eachHourOfInterval({ start: dayStart, end: addHours(dayStart, 23) });
    }
    case "week":
      return eachDayOfInterval({
        start: startOfWeek(currentDate, { weekStartsOn: 1 }),
        end: endOfWeek(currentDate, { weekStartsOn: 1 }),
      });
    case "month":
      return eachDayOfInterval({
        start: startOfMonth(currentDate),
        end: endOfMonth(currentDate),
      });
    case "year":
      return eachMonthOfInterval({
        start: startOfYear(currentDate),
        end: new Date(currentDate.getFullYear(), 11, 31),
      });
  }
}

export interface ViewRange {
  start: Date;
  end: Date;
}

export function getViewRange(timeSlots: Date[], viewMode: ViewMode): ViewRange | null {
  if (timeSlots.length === 0) return null;
  const last = timeSlots[timeSlots.length - 1];
  return {
    start: timeSlots[0],
    end: viewMode === "year" ? endOfMonth(last) : endOfDay(last),
  };
}

export function isSameSlot(date: Date, slot: Date, viewMode: ViewMode): boolean {
  switch (viewMode) {
    case "day":
      return isSameHour(date, slot);
    case "week":
    case "month":
      return isSameDay(date, slot);
    case "year":
      return isSameMonth(date, slot);
  }
}

/** Index of the last slot that begins at or before the entry start, or -1. */
export function getEntryStartSlotIndex(
  entry: Pick<MaintenanceEntry, "startTime">,
  timeSlots: Date[],
  viewMode: ViewMode,
): number {
  const start = new Date(entry.startTime);
  let lastIndex = -1;
  for (const [i, slot] of timeSlots.entries()) {
    if (isSameSlot(start, slot, viewMode) || start > slot) lastIndex = i;
    else break;
  }
  if (lastIndex === -1 && start < timeSlots[0]) return 0;
  return lastIndex;
}

/** Number of slots the entry covers once clamped to the visible range. */
export function getEntrySpan(
  entry: Pick<MaintenanceEntry, "startTime" | "endTime">,
  viewRange: ViewRange | null,
  viewMode: ViewMode,
): number {
  const entryStart = new Date(entry.startTime);
  const entryEnd = new Date(entry.endTime);
  const start = viewRange && entryStart < viewRange.start ? viewRange.start : entryStart;
  const end = viewRange && entryEnd > viewRange.end ? viewRange.end : entryEnd;

  switch (viewMode) {
    case "day":
      return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 3_600_000));
    case "week":
    case "month":
      return Math.max(1, differenceInDays(end, start) + 1);
    case "year":
      return Math.max(1, end.getMonth() - start.getMonth() + 1);
  }
}

export interface PositionedEntry {
  entry: MaintenanceEntry;
  startIdx: number;
  effectiveSpan: number;
  endIdx: number;
  track: number;
}

export interface EquipmentRowLayout {
  items: PositionedEntry[];
  trackCount: number;
  height: number;
}

const MIN_ROW_HEIGHT = 56;
const TRACK_HEIGHT = 36;

/** Places entries on slots and packs overlapping ones onto separate tracks. */
export function layoutEquipmentRow(
  entries: MaintenanceEntry[],
  timeSlots: Date[],
  viewRange: ViewRange | null,
  viewMode: ViewMode,
): EquipmentRowLayout {
  const placed = entries
    .map((entry) => {
      const startIdx = getEntryStartSlotIndex(entry, timeSlots, viewMode);
      const span = getEntrySpan(entry, viewRange, viewMode);
      const effectiveSpan = Math.min(span, timeSlots.length - startIdx);
      return { entry, startIdx, effectiveSpan, endIdx: startIdx + effectiveSpan };
    })
    .filter((item) => item.startIdx >= 0)
    .sort((a, b) => a.startIdx - b.startIdx || b.effectiveSpan - a.effectiveSpan);

  const trackEnds: number[] = [];
  const items = placed.map((item) => {
    let track = trackEnds.findIndex((end) => end <= item.startIdx);
    if (track === -1) track = trackEnds.length;
    trackEnds[track] = item.endIdx;
    return { ...item, track };
  });

  const trackCount = Math.max(1, trackEnds.length);
  return {
    items,
    trackCount,
    height: trackCount > 1 ? Math.max(MIN_ROW_HEIGHT, trackCount * TRACK_HEIGHT) : MIN_ROW_HEIGHT,
  };
}
