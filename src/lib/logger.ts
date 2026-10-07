const SENSITIVE = /(password|token|secret|cookie|authorization|database_url|connection)/i;

function redact(value: unknown, depth = 0): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message.replace(/\w+:\/\/[^\s]+/g, "[redacted-url]") };
  }
  if (depth > 3 || value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, SENSITIVE.test(key) ? "[redacted]" : redact(entry, depth + 1)]),
  );
}

/** One JSON line per event, with credential-looking fields and URLs removed. */
export function logEvent(level: "info" | "warn" | "error", event: string, fields: Record<string, unknown> = {}) {
  const line = JSON.stringify({ level, event, timestamp: new Date().toISOString(), ...(redact(fields) as object) });
  (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(line);
}
