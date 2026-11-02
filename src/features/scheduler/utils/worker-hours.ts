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
