import type { ViewMode } from "../types";

const cellWidths: Record<ViewMode, string> = {
  day: "min-w-[5.5rem]",
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
