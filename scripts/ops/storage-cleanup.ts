// Processes durable object-deletion jobs. Run with the owner connection:
//   pnpm ops:storage:cleanup
import "../../prisma/seed-env";
import { pathToFileURL } from "node:url";
import { processStoredFileDeletion } from "../../src/features/files/server/files";
import prisma, { forTenant } from "../../src/lib/prisma";
import { logEvent } from "../../src/lib/logger";

export const STORAGE_CLEANUP_BATCH_SIZE = 100;

export async function runStorageCleanup(now = new Date()) {
  const jobs = await prisma.storedFileDeletion.findMany({
    where: { nextAttemptAt: { lte: now } },
    orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
    take: STORAGE_CLEANUP_BATCH_SIZE + 1,
    select: { id: true, organizationId: true },
  });
  const batch = jobs.slice(0, STORAGE_CLEANUP_BATCH_SIZE);
  let deleted = 0;
  let retryScheduled = 0;
  let failed = 0;

  for (const job of batch) {
    try {
      const result = await processStoredFileDeletion(forTenant(job.organizationId), job.id, now);
      if (result === "deleted") deleted += 1;
      else if (result === "retry_scheduled") retryScheduled += 1;
    } catch (error) {
      failed += 1;
      logEvent("error", "file.cleanup_job_failed", {
        deletionId: job.id,
        organizationId: job.organizationId,
        error,
      });
    }
  }

  return {
    selected: batch.length,
    deleted,
    retryScheduled,
    failed,
    morePending: jobs.length > STORAGE_CLEANUP_BATCH_SIZE,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runStorageCleanup()
    .then((result) => {
      console.log("storage cleanup", result);
      if (result.retryScheduled || result.failed || result.morePending) {
        process.exitCode = 1;
      }
    })
    .finally(() => prisma.$disconnect());
}
