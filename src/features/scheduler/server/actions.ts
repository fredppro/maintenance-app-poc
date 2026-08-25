"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { MaterialUnit, TaskType } from "../../../../prisma/generated/prisma/enums";

// Equipment Actions
export async function getEquipment() {
  return await prisma.equipment.findMany({
    orderBy: { name: "asc" },
  });
}

export async function addEquipment(data: { name: string; category?: string }) {
  const equipment = await prisma.equipment.create({
    data,
  });
  revalidatePath("/");
  return equipment;
}

export async function updateEquipment(
  id: string,
  data: { name: string; category?: string },
) {
  const equipment = await prisma.equipment.update({
    where: { id },
    data,
  });
  revalidatePath("/");
  return equipment;
}

export async function deleteEquipment(id: string) {
  await prisma.equipment.delete({
    where: { id },
  });
  revalidatePath("/");
}

// Maintenance Task Actions
export async function getTasks() {
  return await prisma.maintenanceTask.findMany({
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
  const { workerIds, materials, ...taskData } = data;
  const task = await prisma.maintenanceTask.create({
    data: {
      ...taskData,
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
  const { workerIds, workerLogs, materials, ...taskData } = data;

  const task = await prisma.$transaction(async (tx) => {
    // If workerLogs are explicitly passed, overwrite the assignment entries with times
    if (workerLogs) {
      await tx.maintenanceTaskAssignment.deleteMany({
        where: { taskId: id },
      });

      if (workerLogs.length > 0) {
        await tx.maintenanceTaskAssignment.createMany({
          data: workerLogs.map((log) => ({
            taskId: id,
            workerId: log.workerId,
            startTime: log.startTime,
            endTime: log.endTime,
          })),
        });
      }
    } else if (workerIds) {
      // Fallback for primitive updates (like simple drag-and-drop calendars)
      await tx.maintenanceTaskAssignment.deleteMany({
        where: { taskId: id },
      });

      if (workerIds.length > 0) {
        await tx.maintenanceTaskAssignment.createMany({
          data: workerIds.map((workerId) => ({
            taskId: id,
            workerId,
          })),
        });
      }
    }

    if (materials) {
      // Remove old materials
      await tx.material.deleteMany({
        where: { taskId: id },
      });

      // Add new materials
      if (materials.length > 0) {
        await tx.material.createMany({
          data: materials.map((m) => ({
            taskId: id,
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
      where: { id },
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
  await prisma.maintenanceTask.delete({
    where: { id },
  });
  revalidatePath("/");
}

export async function moveTask(
  taskId: string,
  newStartTime: Date,
  newEndTime: Date,
  newEquipmentId?: string,
) {
  const task = await prisma.maintenanceTask.update({
    where: { id: taskId },
    data: {
      startTime: newStartTime,
      endTime: newEndTime,
      equipmentId: newEquipmentId,
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
