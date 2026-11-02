export interface ZonedDateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string) {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      calendar: "gregory",
      numberingSystem: "latn",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

function getParts(date: Date, timeZone: string): ZonedDateTimeParts {
  if (Number.isNaN(date.getTime())) {
    throw new RangeError("Cannot convert an invalid date");
  }

  const values = Object.fromEntries(
    getFormatter(timeZone)
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );

  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
}

export function getZonedDateTimeParts(
  date: Date,
  timeZone: string,
): ZonedDateTimeParts {
  return getParts(date, timeZone);
}

function wallTimeValue(parts: ZonedDateTimeParts) {
  return Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
}

function sameMinute(
  left: ZonedDateTimeParts,
  right: ZonedDateTimeParts,
) {
  return (
    left.year === right.year &&
    left.month === right.month &&
    left.day === right.day &&
    left.hour === right.hour &&
    left.minute === right.minute
  );
}

function createLocalDate(parts: ZonedDateTimeParts) {
  const date = new Date(0);
  date.setFullYear(parts.year, parts.month - 1, parts.day);
  date.setHours(parts.hour, parts.minute, parts.second, 0);
  return date;
}

function getOffsetAt(epochMs: number, timeZone: string) {
  const second = Math.floor(epochMs / 1000) * 1000;
  return wallTimeValue(getParts(new Date(second), timeZone)) - second;
}

export function toZonedCalendarDate(date: Date, timeZone: string) {
  return createLocalDate(getParts(date, timeZone));
}

export function fromZonedDateTimeParts(
  parts: ZonedDateTimeParts,
  timeZone: string,
) {
  const targetWallTime = wallTimeValue(parts);
  const offsets = new Set<number>();
  for (const hours of [-36, -24, -12, 0, 12, 24, 36]) {
    offsets.add(
      getOffsetAt(targetWallTime + hours * 60 * 60 * 1000, timeZone),
    );
  }

  const candidates = [...offsets]
    .map((offset) => new Date(targetWallTime - offset))
    .map((date) => ({ date, parts: getParts(date, timeZone) }));
  const exactCandidates = candidates
    .filter((candidate) => sameMinute(candidate.parts, parts))
    .sort((left, right) => left.date.getTime() - right.date.getTime());

  if (exactCandidates.length > 0) {
    return exactCandidates[0].date;
  }

  const nearestCandidate = candidates.sort((left, right) => {
    const leftDelta = wallTimeValue(left.parts) - targetWallTime;
    const rightDelta = wallTimeValue(right.parts) - targetWallTime;
    return (
      Math.abs(leftDelta) - Math.abs(rightDelta) ||
      rightDelta - leftDelta ||
      left.date.getTime() - right.date.getTime()
    );
  })[0];

  if (nearestCandidate) {
    return nearestCandidate.date;
  }

  throw new RangeError(`Unable to resolve a date in ${timeZone}`);
}

export function fromZonedCalendarDate(date: Date, timeZone: string) {
  return fromZonedDateTimeParts(
    {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      hour: date.getHours(),
      minute: date.getMinutes(),
      second: date.getSeconds(),
    },
    timeZone,
  );
}

export function formatDateOnlyInTimeZone(date: Date, timeZone: string) {
  const { year, month, day } = getParts(date, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function dateOnlyAtNoonInTimeZone(value: string, timeZone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new RangeError("Date must use the YYYY-MM-DD format");
  }

  const [, yearValue, monthValue, dayValue] = match;
  const parts: ZonedDateTimeParts = {
    year: Number(yearValue),
    month: Number(monthValue),
    day: Number(dayValue),
    hour: 12,
    minute: 0,
    second: 0,
  };
  const normalizedDate = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day),
  );
  if (
    normalizedDate.getUTCFullYear() !== parts.year ||
    normalizedDate.getUTCMonth() + 1 !== parts.month ||
    normalizedDate.getUTCDate() !== parts.day
  ) {
    throw new RangeError("Date is not a valid calendar date");
  }

  return fromZonedDateTimeParts(parts, timeZone);
}
