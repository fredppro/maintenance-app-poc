import type { TenantDb } from "@/lib/prisma";

export async function getMaintenanceTask(
  db: TenantDb,
  id: string,
  organizationId: string,
  siteId: string,
) {
  return db.maintenanceTask.findFirst({
    where: {
      id,
      organizationId,
      equipment: { is: { siteId } },
    },
    include: {
      equipment: true,
      assignments: { include: { worker: true } },
      materials: true,
    },
  });
}