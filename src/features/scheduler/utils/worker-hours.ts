import {
  formatDateOnlyInTimeZone,
  formatTimeInTimeZone,
  fromZonedDateAndTime,
} from "@/lib/time-zone";

export type WorkLogTimingInput = {
  id?: string;
  workerId: string;
  workDate: string;
  startTime?: string | null;
  hours: number;
};

export type ResolvedWorkLogStart = {
  workDate: string;
  startTime: string;
};

export function aggregateWorkerDailyHours(
  entries: readonly {
    workerId: string;
    workDate?: Date | string;
    hours: unknown;
  }[],
) {
  const totals = new Map<string, number>();

  for (const entry of entries) {
    const hours = Number(entry.hours);
    if (!Number.isFinite(hours) || hours < 0) {
      throw new RangeError(`Invalid daily hours for worker ${entry.workerId}`);
    }
    totals.set(entry.workerId, (totals.get(entry.workerId) ?? 0) + hours);
  }

  return totals;
}

export function calculateWorkLogEnd(
  workDate: string,
  startTime: string,
  durationHours: number,
  timeZone: string,
) {
  if (
    !workDate ||
    !startTime ||
    !Number.isFinite(durationHours) ||
    durationHours <= 0
  ) {
    return null;
  }

  return new Date(
    fromZonedDateAndTime(workDate, startTime, timeZone).getTime() +
      durationHours * 60 * 60 * 1000,
  );
}

export function inferWorkLogStartTimes(
  entries: readonly WorkLogTimingInput[],
  scheduledStartTime: Date | string | null | undefined,
  timeZone: string,
  now: Date = new Date(),
): (ResolvedWorkLogStart | null)[] {
  const scheduledStart = scheduledStartTime
    ? new Date(scheduledStartTime)
    : null;
  const validScheduledStart =
    scheduledStart && Number.isFinite(scheduledStart.getTime())
      ? scheduledStart
      : null;
  const scheduledWorkDate = validScheduledStart
    ? formatDateOnlyInTimeZone(validScheduledStart, timeZone)
    : null;
  const scheduledClockTime = validScheduledStart
    ? formatTimeInTimeZone(validScheduledStart, timeZone)
    : null;
  const fallbackClockTime = Number.isFinite(now.getTime())
    ? `${formatTimeInTimeZone(now, timeZone).slice(0, 2)}:00`
    : null;
  const resolved: (ResolvedWorkLogStart | null)[] = [];
  const sequenceStarts: (ResolvedWorkLogStart | null)[] = [];

  for (const [index, entry] of entries.entries()) {
    if (entry.startTime) {
      const explicitStart = {
        workDate: entry.workDate,
        startTime: entry.startTime,
      };
      resolved.push(explicitStart);
      sequenceStarts.push(explicitStart);
      continue;
    }

    if (!entry.workerId) {
      resolved.push(null);
      sequenceStarts.push(null);
      continue;
    }

    let inferredStart =
      validScheduledStart && scheduledClockTime
        ? entry.workDate === scheduledWorkDate
          ? validScheduledStart
          : fromZonedDateAndTime(
              entry.workDate,
              scheduledClockTime,
              timeZone,
            )
        : null;
    let latestPreviousEnd: Date | null = null;

    for (let previousIndex = 0; previousIndex < index; previousIndex += 1) {
      const previousEntry = entries[previousIndex];
      const previousStart = sequenceStarts[previousIndex];
      if (
            previousEntry.workerId !== entry.workerId ||
            !previousStart
      ) {
        continue;
      }

      const previousEnd = calculateWorkLogEnd(
        previousStart.workDate,
        previousStart.startTime,
        previousEntry.hours,
        timeZone,
      );
      if (previousEnd && (!latestPreviousEnd || previousEnd > latestPreviousEnd)) {
        latestPreviousEnd = previousEnd;
      }
    }

    if (
      latestPreviousEnd &&
      (!inferredStart || latestPreviousEnd > inferredStart)
    ) {
      inferredStart = latestPreviousEnd;
    } else if (!inferredStart && fallbackClockTime) {
      inferredStart = fromZonedDateAndTime(
        entry.workDate,
        fallbackClockTime,
        timeZone,
      );
    }

    const sequenceStart = inferredStart
      ? {
          workDate: formatDateOnlyInTimeZone(inferredStart, timeZone),
          startTime: formatTimeInTimeZone(inferredStart, timeZone),
        }
      : null;
    sequenceStarts.push(sequenceStart);
    resolved.push(entry.id ? null : sequenceStart);
  }

  return resolved;
}

export function formatWorkerDurationInHours(hoursWorked: number) {
  if (!Number.isFinite(hoursWorked) || hoursWorked < 0) return null;

  const totalMinutes = Math.round(hoursWorked * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  return `${minutes}m`;
}

export function calculateWorkerWorkHours(
  startTime: Date | string | null | undefined,
  endTime: Date | string | null | undefined,
) {
  if (!startTime || !endTime) return null;

  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return null;
  }

  return (end - start) / (60 * 60 * 1000);
}

export function formatWorkerWorkDuration(
  startTime: Date | string | null | undefined,
  endTime: Date | string | null | undefined,
) {
  const hoursWorked = calculateWorkerWorkHours(startTime, endTime);
  if (hoursWorked === null) return null;
  return formatWorkerDurationInHours(hoursWorked);
}
