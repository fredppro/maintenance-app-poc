"use server";

import { revalidatePath } from "next/cache";
import { TaskType } from "../generated/prisma/enums";
import prisma from "./prisma";

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

// Worker Actions
export async function getWorkers() {
  return await prisma.worker.findMany({
    orderBy: { name: "asc" },
  });
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
  materials?: { name: string; reference?: string; quantity: number }[];
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
    materials: { name: string; reference?: string; quantity: number }[];
  }>,
) {
  const { workerIds, materials, ...taskData } = data;

  const task = await prisma.$transaction(async (tx) => {
    if (workerIds) {
      // Remove old assignments
      await tx.maintenanceTaskAssignment.deleteMany({
        where: { taskId: id },
      });

      // Add new assignments
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
      await tx.materialConsumed.deleteMany({
        where: { taskId: id },
      });

      // Add new materials
      if (materials.length > 0) {
        await tx.materialConsumed.createMany({
          data: materials.map((m) => ({
            taskId: id,
            name: m.name,
            reference: m.reference,
            quantity: m.quantity,
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
