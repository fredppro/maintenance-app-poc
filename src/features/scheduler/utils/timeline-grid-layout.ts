import {
  differenceInCalendarDays,
} from "date-fns";
import {
  fromZonedDateTimeParts,
  toZonedCalendarDate,
} from "@/lib/time-zone";
import type { MaintenanceEntry, ViewMode } from "../types";
import { getTaskDisplayEnd } from "./schedule";

const getDefaultTimeZone = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

function calendarParts(date: Date, timeZone: string) {
  const zonedDate = toZonedCalendarDate(date, timeZone);
  return {
    year: zonedDate.getFullYear(),
    month: zonedDate.getMonth() + 1,
    day: zonedDate.getDate(),
  };
}

function calendarDateAtMidnight(
  year: number,
  month: number,
  day: number,
  timeZone: string,
) {
  return fromZonedDateTimeParts(
    { year, month, day, hour: 0, minute: 0, second: 0 },
    timeZone,
  );
}

function addCalendarDays(
  year: number,
  month: number,
  day: number,
  amount: number,
) {
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

const timelineDensity = {
  day: { cellWidth: "min-w-20", columnMinWidth: 80, headerHeight: 56, minRowHeight: 72, trackHeight: 72, entryHeight: 64, padding: 4, columnInset: 4 },
  week: { cellWidth: "min-w-24", columnMinWidth: 96, headerHeight: 64, minRowHeight: 80, trackHeight: 80, entryHeight: 72, padding: 4, columnInset: 4 },
  month: { cellWidth: "min-w-20", columnMinWidth: 80, headerHeight: 56, minRowHeight: 72, trackHeight: 64, entryHeight: 56, padding: 4, columnInset: 4 },
  year: { cellWidth: "min-w-24", columnMinWidth: 96, headerHeight: 56, minRowHeight: 72, trackHeight: 64, entryHeight: 56, padding: 4, columnInset: 4 },
};

export function getTimelineDensity(viewMode: ViewMode, zoom = 100) {
  const base = timelineDensity[viewMode];
  const scale = zoom / 100;
  const padding = Math.round(base.padding * scale);
  const entryHeight = Math.max(44, Math.round(base.entryHeight * scale));
  const trackHeight = Math.max(Math.round(base.trackHeight * scale), entryHeight + padding * 2);
  return {
    ...base,
    minRowHeight: Math.max(Math.round(base.minRowHeight * scale), trackHeight),
    trackHeight,
    entryHeight,
    padding,
    columnInset: Math.round(base.columnInset * scale),
  };
}

function getTimelineBaselineWidth(
  viewMode: ViewMode,
  slotCount: number,
  viewportWidth: number,
  sidebarWidth: number,
) {
  if (slotCount < 1) throw new RangeError("A timeline requires at least one column");
  return Math.max(timelineDensity[viewMode].columnMinWidth * slotCount, viewportWidth - sidebarWidth);
}

export function getTimelineColumnWidth(
  viewMode: ViewMode,
  slotCount: number,
  viewportWidth: number,
  sidebarWidth: number,
  zoom: number,
) {
  const baseline = getTimelineBaselineWidth(viewMode, slotCount, viewportWidth, sidebarWidth) / slotCount;
  const availableColumnWidth = Math.max(0, viewportWidth - sidebarWidth) / slotCount;
  return Math.max(availableColumnWidth, baseline * zoom / 100);
}

export function getTimelineFitZoom(
  viewMode: ViewMode,
  slotCount: number,
  viewportWidth: number,
  sidebarWidth: number,
) {
  const baselineWidth = getTimelineBaselineWidth(viewMode, slotCount, viewportWidth, sidebarWidth);
  return Math.min(100, Math.max(0, viewportWidth - sidebarWidth) / baselineWidth * 100);
}

export function getTimelineCellMinWidth(viewMode: ViewMode): string {
  return getTimelineDensity(viewMode).cellWidth;
}

export function getTimelineSlotState(
  slot: Date,
  viewMode: ViewMode,
  now: Date,
  timeZone: string,
) {
  const weekday = toZonedCalendarDate(slot, timeZone).getDay();
  return {
    current: isSameSlot(now, slot, viewMode, timeZone),
    weekend: viewMode !== "year" && (weekday === 0 || weekday === 6),
  };
}

/** Equal-width calendar columns can have different durations around DST. */
export function getTimelineTimePosition(
  date: Date,
  timeSlots: Date[],
  viewRange: ViewRange | null,
): number | null {
  const time = date.getTime();
  if (!viewRange || time < viewRange.start.getTime() || time > viewRange.end.getTime()) {
    return null;
  }
  const index = timeSlots.findLastIndex((slot) => slot.getTime() <= time);
  const start = timeSlots[index].getTime();
  const end = timeSlots[index + 1]?.getTime() ?? viewRange.end.getTime() + 1;
  return ((index + (time - start) / (end - start)) / timeSlots.length) * 100;
}

export function getTimelineDatePosition(
  date: Date,
  timeSlots: Date[],
  viewMode: Exclude<ViewMode, "day">,
  timeZone: string,
): number | null {
  const index = timeSlots.findIndex((slot) => isSameSlot(date, slot, viewMode, timeZone));
  return index < 0 ? null : ((index + 0.5) / timeSlots.length) * 100;
}

export function getTimelineScrollLeft(
  position: number,
  axisWidth: number,
  viewportWidth: number,
  stickyWidth: number,
): number {
  const availableWidth = Math.max(0, viewportWidth - stickyWidth);
  return Math.max(
    0,
    Math.min(
      axisWidth - availableWidth,
      (position / 100) * axisWidth - availableWidth / 2,
    ),
  );
}

export function getTimelineBoundaryClass(
  timeSlots: Date[],
  viewMode: ViewMode,
  index: number,
  timeZone = getDefaultTimeZone(),
): string {
  const date = timeSlots[index];
  const nextSlot = timeSlots[index + 1];
  if (!date || !nextSlot) return "border-r-0";
  const zonedDate = toZonedCalendarDate(date, timeZone);
  const zonedNextSlot = toZonedCalendarDate(nextSlot, timeZone);

  if (viewMode === "year" && zonedNextSlot.getMonth() % 3 === 0) {
    return "border-r border-r-border-strong";
  }

  if (viewMode === "month") {
    if (zonedNextSlot.getMonth() !== zonedDate.getMonth()) {
      return "border-r border-r-border-strong";
    }
    if (zonedNextSlot.getDay() === 1) {
      return "border-r border-r-border-strong";
    }
  }

  if (
    viewMode === "day" &&
    zonedDate.getDate() !== zonedNextSlot.getDate()
  ) {
    return "border-r border-r-border";
  }

  return "border-r-border-subtle";
}

export function getTimeSlots(
  viewMode: ViewMode,
  currentDate: Date,
  timeZone = getDefaultTimeZone(),
): Date[] {
  const { year, month, day } = calendarParts(currentDate, timeZone);
  switch (viewMode) {
    case "day": {
      const start = calendarDateAtMidnight(year, month, day, timeZone);
      const nextDay = addCalendarDays(year, month, day, 1);
      const end = calendarDateAtMidnight(
        nextDay.year,
        nextDay.month,
        nextDay.day,
        timeZone,
      );
      const slots: Date[] = [];
      for (let time = start.getTime(); time < end.getTime(); time += 3_600_000) {
        slots.push(new Date(time));
      }
      return slots;
    }
    case "week": {
      const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
      const daysSinceMonday = (weekday + 6) % 7;
      const monday = addCalendarDays(year, month, day, -daysSinceMonday);
      return Array.from({ length: 7 }, (_, index) => {
        const slot = addCalendarDays(
          monday.year,
          monday.month,
          monday.day,
          index,
        );
        return calendarDateAtMidnight(
          slot.year,
          slot.month,
          slot.day,
          timeZone,
        );
      });
    }
    case "month": {
      const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
      return Array.from({ length: daysInMonth }, (_, index) =>
        calendarDateAtMidnight(year, month, index + 1, timeZone),
      );
    }
    case "year":
      return Array.from({ length: 12 }, (_, index) =>
        calendarDateAtMidnight(year, index + 1, 1, timeZone),
      );
  }
}

export interface ViewRange {
  start: Date;
  end: Date;
}

export function getViewRange(
  timeSlots: Date[],
  viewMode: ViewMode,
  timeZone = getDefaultTimeZone(),
): ViewRange | null {
  if (timeSlots.length === 0) return null;
  const last = calendarParts(timeSlots[timeSlots.length - 1], timeZone);
  const next = viewMode === "year"
    ? last.month === 12
      ? { year: last.year + 1, month: 1, day: 1 }
      : { year: last.year, month: last.month + 1, day: 1 }
    : addCalendarDays(last.year, last.month, last.day, 1);
  return {
    start: timeSlots[0],
    end: new Date(
      calendarDateAtMidnight(
        next.year,
        next.month,
        next.day,
        timeZone,
      ).getTime() - 1,
    ),
  };
}

export function isSameSlot(
  date: Date,
  slot: Date,
  viewMode: ViewMode,
  timeZone = getDefaultTimeZone(),
): boolean {
  switch (viewMode) {
    case "day":
      return date.getTime() >= slot.getTime() &&
        date.getTime() < slot.getTime() + 3_600_000;
    case "week":
    case "month": {
      const zonedDate = toZonedCalendarDate(date, timeZone);
      const zonedSlot = toZonedCalendarDate(slot, timeZone);
      return (
        zonedDate.getFullYear() === zonedSlot.getFullYear() &&
        zonedDate.getMonth() === zonedSlot.getMonth() &&
        zonedDate.getDate() === zonedSlot.getDate()
      );
    }
    case "year": {
      const zonedDate = toZonedCalendarDate(date, timeZone);
      const zonedSlot = toZonedCalendarDate(slot, timeZone);
      return (
        zonedDate.getFullYear() === zonedSlot.getFullYear() &&
        zonedDate.getMonth() === zonedSlot.getMonth()
      );
    }
  }
}

/** Index of the last slot that begins at or before the entry start, or -1. */
export function getEntryStartSlotIndex(
  entry: Pick<MaintenanceEntry, "startTime">,
  timeSlots: Date[],
  viewMode: ViewMode,
  timeZone = getDefaultTimeZone(),
): number {
  const start = new Date(entry.startTime);
  let lastIndex = -1;
  for (const [i, slot] of timeSlots.entries()) {
    if (isSameSlot(start, slot, viewMode, timeZone) || start > slot) lastIndex = i;
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
  timeZone = getDefaultTimeZone(),
): number {
  const entryStart = new Date(entry.startTime);
  const entryEnd = getTaskDisplayEnd(entry.startTime, entry.endTime);
  const start = viewRange && entryStart < viewRange.start ? viewRange.start : entryStart;
  const end = viewRange && entryEnd > viewRange.end ? viewRange.end : entryEnd;

  switch (viewMode) {
    case "day":
      return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 3_600_000));
    case "week":
    case "month": {
      const zonedStart = toZonedCalendarDate(start, timeZone);
      const zonedEnd = toZonedCalendarDate(end, timeZone);
      return Math.max(1, differenceInCalendarDays(zonedEnd, zonedStart) + 1);
    }
    case "year": {
      const zonedStart = toZonedCalendarDate(start, timeZone);
      const zonedEnd = toZonedCalendarDate(end, timeZone);
      return Math.max(
        1,
        (zonedEnd.getFullYear() - zonedStart.getFullYear()) * 12 +
          zonedEnd.getMonth() -
          zonedStart.getMonth() +
          1,
      );
    }
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

/** Places entries on slots and packs overlapping ones onto separate tracks. */
export function layoutEquipmentRow(
  entries: MaintenanceEntry[],
  timeSlots: Date[],
  viewRange: ViewRange | null,
  viewMode: ViewMode,
  timeZone = getDefaultTimeZone(),
  zoom = 100,
): EquipmentRowLayout {
  const placed = entries
    .map((entry) => {
      const startIdx = getEntryStartSlotIndex(
        entry,
        timeSlots,
        viewMode,
        timeZone,
      );
      const span = getEntrySpan(entry, viewRange, viewMode, timeZone);
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
  const density = getTimelineDensity(viewMode, zoom);
  return {
    items,
    trackCount,
    height: Math.max(
      density.minRowHeight,
      trackCount * density.trackHeight,
    ),
  };
}
