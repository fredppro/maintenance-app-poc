"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { MaterialUnit, TaskType } from "../../../../prisma/generated/prisma/enums";
import { deleteStoredFile } from "@/features/files/server/files";
import { getTenantContext } from "@/lib/tenant-context";
import {
  equipmentIdSchema,
  equipmentSchema,
  equipmentUpdateSchema,
  relocationSchema,
  sectionNameSchema,
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

async function assertOwnFile(fileId: string | null | undefined, organizationId: string) {
  if (!fileId) return;
  const file = await prisma.storedFile.findFirst({
    where: { id: fileId, organizationId },
    select: { id: true },
  });
  if (!file) throw new Error("File not found in the active organization");
}

async function assertSectionInSite(
  sectionId: string | null | undefined,
  organizationId: string,
  siteId: string,
) {
  if (!sectionId) return null;
  const section = await prisma.section.findFirst({
    where: { id: sectionId, organizationId, siteId },
    select: { id: true, name: true },
  });
  if (!section) throw new Error("Section not found in the target site");
  return section;
}

export async function addEquipment(data: {
  name: string;
  category?: string | null;
  imageFileId?: string | null;
  sectionId?: string | null;
}) {
  const { organizationId, siteId, siteName, userId } =
    await getTenantContext("manageMaintenance");
  const input = equipmentSchema.parse(data);
  await assertOwnFile(input.imageFileId, organizationId);
  const section = await assertSectionInSite(input.sectionId, organizationId, siteId);

  const equipment = await prisma.equipment.create({
    data: {
      ...input,
      sectionId: section?.id ?? null,
      organizationId,
      siteId,
      relocations: {
        create: {
          organizationId,
          toSiteName: siteName,
          toSectionName: section?.name ?? null,
          movedById: userId,
        },
      },
    },
  });
  revalidatePath("/");
  return equipment;
}

export async function updateEquipment(
  id: string,
  data: { name?: string; category?: string | null; imageFileId?: string | null },
) {
  const { organizationId, siteId } = await getTenantContext("manageMaintenance");
  const equipmentId = equipmentIdSchema.parse(id);
  const input = equipmentUpdateSchema.parse(data);
  await assertOwnFile(input.imageFileId, organizationId);

  const previous = await prisma.equipment.findFirst({
    where: { id: equipmentId, organizationId, siteId },
    select: { imageFileId: true },
  });
  if (!previous) throw new Error("Equipment not found");

  const equipment = await prisma.equipment.update({
    where: { id: equipmentId, organizationId, siteId },
    data: input,
  });

  if (
    input.imageFileId !== undefined &&
    previous.imageFileId &&
    previous.imageFileId !== input.imageFileId
  ) {
    await deleteStoredFile(previous.imageFileId, organizationId);
  }
  revalidatePath("/");
  return equipment;
}

/**
 * Places equipment at a site and (optionally) a section of that site, recording the
 * change in the location history. Tasks follow the equipment automatically.
 */
export async function relocateEquipment(
  id: string,
  target: { siteId: string; sectionId?: string | null },
) {
  const { organizationId, siteId, userId } =
    await getTenantContext("manageMaintenance");
  const equipmentId = equipmentIdSchema.parse(id);
  const input = relocationSchema.parse(target);

  const [current, targetSite] = await Promise.all([
    prisma.equipment.findFirst({
      where: { id: equipmentId, organizationId, siteId },
      include: { site: { select: { name: true } }, section: { select: { name: true } } },
    }),
    prisma.site.findFirst({
      where: { id: input.siteId, organizationId },
      select: { id: true, name: true },
    }),
  ]);
  if (!current) throw new Error("Equipment not found");
  if (!targetSite) throw new Error("Target site not found in the active organization");

  const section = await assertSectionInSite(input.sectionId, organizationId, targetSite.id);
  if (current.siteId === targetSite.id && current.sectionId === (section?.id ?? null)) {
    return current;
  }

  const equipment = await prisma.equipment.update({
    where: { id: equipmentId },
    data: {
      siteId: targetSite.id,
      sectionId: section?.id ?? null,
      relocations: {
        create: {
          organizationId,
          fromSiteName: current.site.name,
          fromSectionName: current.section?.name ?? null,
          toSiteName: targetSite.name,
          toSectionName: section?.name ?? null,
          movedById: userId,
        },
      },
    },
  });
  revalidatePath("/");
  return equipment;
}

export async function getEquipmentRelocations(id: string) {
  const { organizationId, siteId } = await getTenantContext("viewMaintenance");
  const equipmentId = equipmentIdSchema.parse(id);
  return await prisma.equipmentRelocation.findMany({
    where: { equipmentId, organizationId, equipment: { siteId } },
    orderBy: { movedAt: "desc" },
    take: 20,
  });
}

export async function deleteEquipment(id: string) {
  const { organizationId, siteId } = await getTenantContext("deleteMaintenance");
  const equipmentId = equipmentIdSchema.parse(id);
  const equipment = await prisma.equipment.findFirst({
    where: { id: equipmentId, organizationId, siteId },
    select: { imageFileId: true },
  });
  await prisma.equipment.delete({
    where: { id: equipmentId, organizationId, siteId },
  });
  if (equipment?.imageFileId) {
    await deleteStoredFile(equipment.imageFileId, organizationId);
  }
  revalidatePath("/");
}

// Section Actions
export async function getSections() {
  const { organizationId } = await getTenantContext("viewMaintenance");
  return await prisma.section.findMany({
    where: { organizationId },
    select: { id: true, name: true, siteId: true },
    orderBy: { name: "asc" },
  });
}

export async function createSection(siteId: string, name: string) {
  const { organizationId } = await getTenantContext("manageMaintenance");
  const targetSiteId = equipmentIdSchema.parse(siteId);
  const sectionName = sectionNameSchema.parse(name);
  const site = await prisma.site.findFirst({
    where: { id: targetSiteId, organizationId },
    select: { id: true },
  });
  if (!site) throw new Error("Site not found in the active organization");

  const section = await prisma.section.upsert({
    where: { siteId_name: { siteId: site.id, name: sectionName } },
    create: { name: sectionName, siteId: site.id, organizationId },
    update: {},
    select: { id: true, name: true, siteId: true },
  });
  revalidatePath("/");
  return section;
}

export async function renameSection(id: string, name: string) {
  const { organizationId } = await getTenantContext("manageSites");
  const section = await prisma.section.update({
    where: { id: equipmentIdSchema.parse(id), organizationId },
    data: { name: sectionNameSchema.parse(name) },
    select: { id: true, name: true, siteId: true },
  });
  revalidatePath("/");
  return section;
}

/** Equipment in the section is kept and simply becomes unassigned. */
export async function deleteSection(id: string) {
  const { organizationId } = await getTenantContext("manageSites");
  await prisma.section.delete({
    where: { id: equipmentIdSchema.parse(id), organizationId },
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
