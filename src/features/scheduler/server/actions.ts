"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { MaterialUnit, TaskType } from "../../../../prisma/generated/prisma/enums";
import {
  equipmentIdSchema,
  equipmentSchema,
  equipmentUpdateSchema,
  createTaskSchema,
  updateTaskSchema,
} from "./schemas";

// Equipment Actions
export async function getEquipment() {
  return await prisma.equipment.findMany({
    orderBy: { name: "asc" },
  });
}

export async function addEquipment(data: { name: string; category?: string }) {
  const input = equipmentSchema.parse(data);
  const equipment = await prisma.equipment.create({
    data: input,
  });
  revalidatePath("/");
  return equipment;
}

export async function updateEquipment(
  id: string,
  data: { name: string; category?: string },
) {
  const equipmentId = equipmentIdSchema.parse(id);
  const input = equipmentUpdateSchema.parse(data);
  const equipment = await prisma.equipment.update({
    where: { id: equipmentId },
    data: input,
  });
  revalidatePath("/");
  return equipment;
}

export async function deleteEquipment(id: string) {
  const equipmentId = equipmentIdSchema.parse(id);
  await prisma.equipment.delete({
    where: { id: equipmentId },
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
  const input = createTaskSchema.parse(data);
  const { workerIds, materials, ...taskData } = input;
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
  const taskId = equipmentIdSchema.parse(id);
  const input = updateTaskSchema.parse(data);
  const { workerIds, workerLogs, materials, ...taskData } = input;

  const task = await prisma.$transaction(async (tx) => {
    // If workerLogs are explicitly passed, overwrite the assignment entries with times
    if (workerLogs) {
      await tx.maintenanceTaskAssignment.deleteMany({
        where: { taskId },
      });

      if (workerLogs.length > 0) {
        await tx.maintenanceTaskAssignment.createMany({
          data: workerLogs.map((log) => ({
            taskId,
            workerId: log.workerId,
            startTime: log.startTime,
            endTime: log.endTime,
          })),
        });
      }
    } else if (workerIds) {
      // Fallback for primitive updates (like simple drag-and-drop calendars)
      await tx.maintenanceTaskAssignment.deleteMany({
        where: { taskId },
      });

      if (workerIds.length > 0) {
        await tx.maintenanceTaskAssignment.createMany({
          data: workerIds.map((workerId) => ({
            taskId,
            workerId,
          })),
        });
      }
    }

    if (materials) {
      // Remove old materials
      await tx.material.deleteMany({
        where: { taskId },
      });

      // Add new materials
      if (materials.length > 0) {
        await tx.material.createMany({
          data: materials.map((m) => ({
            taskId,
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
      where: { id: taskId },
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
  const taskId = equipmentIdSchema.parse(id);
  await prisma.maintenanceTask.delete({
    where: { id: taskId },
  });
  revalidatePath("/");
}

export async function moveTask(
  taskId: string,
  newStartTime: Date,
  newEndTime: Date,
  newEquipmentId?: string,
) {
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
  const task = await prisma.maintenanceTask.update({
    where: { id: validatedTaskId },
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
