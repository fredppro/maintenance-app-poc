// Permanently removes soft-deleted equipment, tasks and workers older than the retention window.
// Run with the owner connection: pnpm trash:purge [days]   (default 30)
import "../prisma/seed-env";
import { pathToFileURL } from "node:url";
import prisma from "../src/lib/prisma";

export const TRASH_RETENTION_DAYS = 30;

export async function purgeTrash(days = TRASH_RETENTION_DAYS, now = new Date()) {
  const cutoff = new Date(now.getTime() - days * 86_400_000);
  const where = { deletedAt: { lt: cutoff } };
  // Tasks first: they reference equipment and workers.
  const tasks = await prisma.maintenanceTask.deleteMany({ where });
  const equipment = await prisma.equipment.deleteMany({ where });
  const workers = await prisma.worker.deleteMany({ where });
  return { tasks: tasks.count, equipment: equipment.count, workers: workers.count };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const days = Number(process.argv[2] ?? TRASH_RETENTION_DAYS);
  purgeTrash(days)
    .then((result) => console.log("purged", result))
    .finally(() => prisma.$disconnect());
}
