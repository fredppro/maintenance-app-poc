import { randomUUID } from "node:crypto";
import { logEvent } from "@/lib/logger";
import prisma from "@/lib/prisma";

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; reason: "limit" | "unavailable" };

/**
 * Fixed-window limiter backed by the shared `rateLimit` table, so the limit
 * holds across instances. Fails closed when the shared counter cannot be checked.
 */
export async function takeRateLimit(
  bucket: string,
  subject: string,
  { limit, windowSeconds }: { limit: number; windowSeconds: number },
): Promise<RateLimitResult> {
  const key = `app:${bucket}:${subject}`;
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  try {
    const rows = await prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO "rateLimit" (id, key, count, "lastRequest")
      VALUES (${randomUUID()}, ${key}, 1, ${now})
      ON CONFLICT (key) DO UPDATE SET
        count = CASE WHEN "rateLimit"."lastRequest" < ${now - windowMs} THEN 1 ELSE "rateLimit".count + 1 END,
        "lastRequest" = CASE WHEN "rateLimit"."lastRequest" < ${now - windowMs} THEN ${now} ELSE "rateLimit"."lastRequest" END
      RETURNING count`;
    const count = rows[0]?.count;
    if (count === undefined) throw new Error("Rate limiter returned no counter");
    return Number(count) <= limit
      ? { allowed: true }
      : { allowed: false, reason: "limit" };
  } catch (error) {
    logEvent("error", "rate_limit.failed", { bucket, error });
    return { allowed: false, reason: "unavailable" };
  }
}
