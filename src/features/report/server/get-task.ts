import prisma from "@/lib/prisma";

export async function getMaintenanceTask(
  id: string,
  organizationId: string,
  siteId: string,
) {
  return prisma.maintenanceTask.findFirst({
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