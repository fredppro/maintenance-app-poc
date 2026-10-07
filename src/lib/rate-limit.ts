import { randomUUID } from "node:crypto";
import { logEvent } from "@/lib/logger";
import prisma from "@/lib/prisma";

/**
 * Fixed-window limiter backed by the shared `rateLimit` table, so the limit
 * holds across instances. Fails open: a limiter outage must not take the app down.
 */
export async function takeRateLimit(
  bucket: string,
  subject: string,
  { limit, windowSeconds }: { limit: number; windowSeconds: number },
) {
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
    return { allowed: Number(rows[0]?.count ?? 1) <= limit };
  } catch (error) {
    logEvent("error", "rate_limit.failed", { bucket, error });
    return { allowed: true };
  }
}
