// Deletes operational data that has outlived its purpose. Run daily with the owner connection:
//   pnpm ops:retention
// Audit events are NOT touched: their retention period is a LEGAL/PRODUCT DECISION (docs/data-retention.md).
import "../../prisma/seed-env";
import { pathToFileURL } from "node:url";
import prisma from "../../src/lib/prisma";
import { getStorage } from "../../src/lib/storage";

export const SESSION_GRACE_DAYS = 7;
export const INVITATION_GRACE_DAYS = 30;
export const RATE_LIMIT_WINDOW_MS = 24 * 3_600_000;
const DAY = 86_400_000;

export async function runRetention(now = new Date()) {
  const ago = (days: number) => new Date(now.getTime() - days * DAY);

  const sessions = await prisma.session.deleteMany({ where: { expiresAt: { lt: ago(SESSION_GRACE_DAYS) } } });
  const verifications = await prisma.verification.deleteMany({ where: { expiresAt: { lt: now } } });
  const invitations = await prisma.invitation.deleteMany({ where: { expiresAt: { lt: ago(INVITATION_GRACE_DAYS) } } });
  const rateLimits = await prisma.rateLimit.deleteMany({
    where: { lastRequest: { lt: BigInt(now.getTime() - RATE_LIMIT_WINDOW_MS) } },
  });

  // Expired export archives: remove the object, then the row.
  const expired = await prisma.tenantExport.findMany({
    where: { expiresAt: { lt: now } },
    select: { id: true, fileKey: true },
  });
  let exports = 0;
  for (const item of expired) {
    if (item.fileKey) {
      try {
        await getStorage().delete(item.fileKey);
      } catch {
        continue;
      }
    }
    await prisma.tenantExport.delete({ where: { id: item.id } });
    exports += 1;
  }

  return {
    sessions: sessions.count,
    verifications: verifications.count,
    invitations: invitations.count,
    rateLimits: rateLimits.count,
    exports,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runRetention()
    .then((result) => console.log("retention", result))
    .finally(() => prisma.$disconnect());
}
