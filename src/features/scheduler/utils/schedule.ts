import {
  fromZonedDateTimeParts,
  getZonedDateTimeParts,
} from "@/lib/time-zone";

const DEFAULT_TASK_DISPLAY_DURATION_MS = 60 * 60 * 1000;

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
