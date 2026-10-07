"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { MaterialUnit, TaskType } from "../../../../prisma/generated/prisma/enums";
import { getTenantContext } from "@/lib/tenant-context";
import {
  equipmentIdSchema,
  equipmentSchema,
  equipmentUpdateSchema,
  createTaskSchema,
  updateTaskSchema,
} from "./schemas";

// Equipment Actions
export async function getEquipment() {
  const { organizationId, siteId } = await getTenantContext("viewMaintenance");
  return await prisma.equipment.findMany({
    where: { organizationId, siteId },
    orderBy: { name: "asc" },
  });
}

export async function addEquipment(data: { name: string; category?: string; image?: string | null }) {
  const { organizationId, siteId } = await getTenantContext("manageMaintenance");
  const input = equipmentSchema.parse(data);
  const equipment = await prisma.equipment.create({
    data: { ...input, organizationId, siteId },
  });
  revalidatePath("/");
  return equipment;
}

export async function updateEquipment(
  id: string,
  data: { name: string; category?: string; image?: string | null },
) {
  const { organizationId, siteId } = await getTenantContext("manageMaintenance");
  const equipmentId = equipmentIdSchema.parse(id);
  const input = equipmentUpdateSchema.parse(data);
  const equipment = await prisma.equipment.update({
    where: { id: equipmentId, organizationId, siteId },
    data: input,
  });
  revalidatePath("/");
  return equipment;
}

export async function moveEquipment(id: string, targetSiteId: string) {
  const { organizationId, siteId } = await getTenantContext("manageMaintenance");
  const equipmentId = equipmentIdSchema.parse(id);
  const targetId = equipmentIdSchema.parse(targetSiteId);

  const targetSite = await prisma.site.findFirst({
    where: { id: targetId, organizationId },
    select: { id: true },
  });
  if (!targetSite) {
    throw new Error("Target site not found in the active organization");
  }

  // Tasks follow the equipment because they are scoped through it.
  const equipment = await prisma.equipment.update({
    where: { id: equipmentId, organizationId, siteId },
    data: { siteId: targetSite.id },
  });
  revalidatePath("/");
  return equipment;
}

export async function deleteEquipment(id: string) {
  const { organizationId, siteId } = await getTenantContext("deleteMaintenance");
  const equipmentId = equipmentIdSchema.parse(id);
  await prisma.equipment.delete({
    where: { id: equipmentId, organizationId, siteId },
  });
  revalidatePath("/");
}

// Maintenance Task Actions
export async function getTasks() {
  const { organizationId, siteId } = await getTenantContext("viewMaintenance");
  return await prisma.maintenanceTask.findMany({
    where: {
      organizationId,
      equipment: { is: { siteId } },
    },
    include: {
      equipment: true,
      assignments: {
        include: {
          worker: true,
        },
      },
      materials: true,
    },
    orderBy: { startTime: "asc" },
  });
}

export async function createTask(data: {
  title: string;
  description?: string;
  type?: TaskType;
  startTime: Date;
  endTime: Date;
  equipmentId: string;
  status?: string;
  workerIds: string[];
  materials?: {
    name: string;
    reference?: string;
    quantity: number;
    unit?: MaterialUnit;
    price?: number;
  }[];
}) {
  const { organizationId, siteId } = await getTenantContext("manageMaintenance");
  const input = createTaskSchema.parse(data);
  const { workerIds, materials, ...taskData } = input;
  const equipment = await prisma.equipment.findFirst({
    where: {
      id: taskData.equipmentId,
      organizationId,
      siteId,
    },
    select: { id: true },
  });

  if (!equipment) {
    throw new Error("Equipment not found in the active organization site");
  }

  await assertWorkersBelongToOrganization(workerIds, organizationId);

  const task = await prisma.maintenanceTask.create({
    data: {
      ...taskData,
      organizationId,
      assignments: {
        create: workerIds.map((workerId) => ({
          workerId,
        })),
      },
      materials: {
        create: materials?.map((m) => ({
          name: m.name,
          reference: m.reference,
          quantity: m.quantity,
          unit: m.unit ?? MaterialUnit.PC,
          price: m.price !== undefined ? m.price.toFixed(2) : undefined,
        })),
      },
    },
    include: {
      equipment: true,
      assignments: {
        include: {
          worker: true,
        },
      },
      materials: true,
    },
  });
  revalidatePath("/");
  return task;
}

export async function updateTask(
  id: string,
  data: Partial<{
    title: string;
    description: string;
    type: TaskType;
    startTime: Date;
    endTime: Date;
    equipmentId: string;
    status: string;
    workerIds: string[];
    workerLogs: { workerId: string; startTime: Date; endTime: Date }[];
    materials: {
      name: string;
      reference?: string;
      quantity: number;
      unit?: MaterialUnit;
      price?: number;
    }[];
  }>,
) {
  const { organizationId, siteId } = await getTenantContext("manageMaintenance");
  const taskId = equipmentIdSchema.parse(id);
  const input = updateTaskSchema.parse(data);
  const { workerIds, workerLogs, materials, ...taskData } = input;

  const currentTask = await prisma.maintenanceTask.findFirst({
    where: {
      id: taskId,
      organizationId,
      equipment: { is: { siteId } },
    },
    select: { id: true },
  });
  if (!currentTask) {
    throw new Error("Maintenance task not found in the active organization");
  }

  if (taskData.equipmentId) {
    const equipment = await prisma.equipment.findFirst({
      where: { id: taskData.equipmentId, organizationId, siteId },
      select: { id: true },
    });
    if (!equipment) {
      throw new Error("Equipment not found in the active organization site");
    }
  }

  const assignedWorkerIds = workerLogs?.map((log) => log.workerId) ?? workerIds;
  if (assignedWorkerIds) {
    await assertWorkersBelongToOrganization(assignedWorkerIds, organizationId);
  }

  const task = await prisma.$transaction(async (tx) => {
    // If workerLogs are explicitly passed, overwrite the assignment entries with times
    if (workerLogs) {
      await tx.maintenanceTaskAssignment.deleteMany({
        where: { taskId, organizationId },
      });

      if (workerLogs.length > 0) {
        await tx.maintenanceTaskAssignment.createMany({
          data: workerLogs.map((log) => ({
            taskId,
            workerId: log.workerId,
            organizationId,
            startTime: log.startTime,
            endTime: log.endTime,
          })),
        });
      }
    } else if (workerIds) {
      // Fallback for primitive updates (like simple drag-and-drop calendars)
      await tx.maintenanceTaskAssignment.deleteMany({
        where: { taskId, organizationId },
      });

      if (workerIds.length > 0) {
        await tx.maintenanceTaskAssignment.createMany({
          data: workerIds.map((workerId) => ({
            taskId,
            workerId,
            organizationId,
          })),
        });
      }
    }

    if (materials) {
      // Remove old materials
      await tx.material.deleteMany({
        where: { taskId, organizationId },
      });

      // Add new materials
      if (materials.length > 0) {
        await tx.material.createMany({
          data: materials.map((m) => ({
            taskId,
            organizationId,
            name: m.name,
            reference: m.reference,
            quantity: m.quantity,
            unit: m.unit ?? MaterialUnit.PC,
            price: m.price !== undefined ? m.price.toFixed(2) : undefined,
          })),
        });
      }
    }

    return await tx.maintenanceTask.update({
      where: { id: taskId, organizationId },
      data: taskData,
      include: {
        equipment: true,
        assignments: {
          include: {
            worker: true,
          },
        },
        materials: true,
      },
    });
  });

  revalidatePath("/");
  return task;
}

export async function deleteTask(id: string) {
  const { organizationId, siteId } = await getTenantContext("deleteMaintenance");
  const taskId = equipmentIdSchema.parse(id);
  await prisma.maintenanceTask.delete({
    where: {
      id: taskId,
      organizationId,
      equipment: { is: { siteId } },
    },
  });
  revalidatePath("/");
}

export async function moveTask(
  taskId: string,
  newStartTime: Date,
  newEndTime: Date,
  newEquipmentId?: string,
) {
  const { organizationId, siteId } = await getTenantContext("manageMaintenance");
  const validatedTaskId = equipmentIdSchema.parse(taskId);
  const startTime = new Date(newStartTime);
  const endTime = new Date(newEndTime);
  if (
    Number.isNaN(startTime.getTime()) ||
    Number.isNaN(endTime.getTime()) ||
    endTime <= startTime
  ) {
    throw new Error("Task end time must be after start time");
  }

  if (newEquipmentId !== undefined) {
    const equipment = await prisma.equipment.findFirst({
      where: { id: equipmentIdSchema.parse(newEquipmentId), organizationId, siteId },
      select: { id: true },
    });
    if (!equipment) {
      throw new Error("Equipment not found in the active organization site");
    }
  }

  const task = await prisma.maintenanceTask.update({
    where: {
      id: validatedTaskId,
      organizationId,
      equipment: { is: { siteId } },
    },
    data: {
      startTime,
      endTime,
      ...(newEquipmentId !== undefined && {
        equipmentId: equipmentIdSchema.parse(newEquipmentId),
      }),
    },
    include: {
      equipment: true,
      assignments: {
        include: {
          worker: true,
        },
      },
    },
  });
  revalidatePath("/");
  return task;
}

async function assertWorkersBelongToOrganization(
  workerIds: string[],
  organizationId: string,
) {
  const uniqueWorkerIds = [...new Set(workerIds)];
  if (uniqueWorkerIds.length === 0) {
    return;
  }

  const count = await prisma.worker.count({
    where: {
      id: { in: uniqueWorkerIds },
      organizationId,
    },
  });

  if (count !== uniqueWorkerIds.length) {
    throw new Error("One or more workers are not in the active organization");
  }
}
