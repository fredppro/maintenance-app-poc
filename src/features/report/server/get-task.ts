import prisma from "@/lib/prisma";

export async function getMaintenanceTask(id: string) {
  return prisma.maintenanceTask.findUnique({
    where: { id },
    include: {
      equipment: true,
      assignments: { include: { worker: true } },
      materials: true,
    },
  });
}