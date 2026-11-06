import {
  fromZonedDateTimeParts,
  getZonedDateTimeParts,
} from "@/lib/time-zone";

const DEFAULT_TASK_DISPLAY_DURATION_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

function validDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function calculatePlannedEndTime(
  startTime: Date | string | null | undefined,
  durationMinutes: number,
): Date | null {
  const start = validDate(startTime);
  if (
    !start ||
    !Number.isFinite(durationMinutes) ||
    durationMinutes <= 0
  ) {
    return null;
  }
  return new Date(start.getTime() + durationMinutes * MINUTE_MS);
}

export function shiftPlannedEndTime(
  previousStartTime: Date | string | null | undefined,
  previousEndTime: Date | string | null | undefined,
  nextStartTime: Date | string | null | undefined,
): Date | null {
  const previousStart = validDate(previousStartTime);
  const previousEnd = validDate(previousEndTime);
  const nextStart = validDate(nextStartTime);
  if (!previousStart || !previousEnd || !nextStart) return null;

  const durationMinutes =
    (previousEnd.getTime() - previousStart.getTime()) / MINUTE_MS;
  return calculatePlannedEndTime(nextStart, durationMinutes);
}

export function getTaskDisplayEnd(
  startTime: Date | string,
  endTime?: Date | string | null,
): Date {
  if (endTime) return new Date(endTime);
  return new Date(new Date(startTime).getTime() + DEFAULT_TASK_DISPLAY_DURATION_MS);
}

export function getDefaultMaintenanceStartTime(
  timeZone: string,
  referenceDate = new Date(),
) {
  const parts = getZonedDateTimeParts(referenceDate, timeZone);
  return fromZonedDateTimeParts(
    { ...parts, hour: 8, minute: 0, second: 0 },
    timeZone,
  );
}

export function getDefaultWorkerStartTime(
  taskStartTime: Date,
  timeZone: string,
) {
  const parts = getZonedDateTimeParts(taskStartTime, timeZone);
  const eightAm = fromZonedDateTimeParts(
    { ...parts, hour: 8, minute: 0, second: 0 },
    timeZone,
  );
  return eightAm < taskStartTime ? new Date(taskStartTime) : eightAm;
}
