"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import type { TenantDb } from "@/lib/prisma";
import {
  InventoryMovementType,
  MaintenanceReminderStatus,
  MaintenanceTaskNotificationType,
  MaterialUnit,
  TaskType,
} from "../../../../prisma/generated/prisma/enums";
import { z } from "zod";
import {
  deleteStoredFile,
  markStoredFileAttached,
} from "@/features/files/server/files";
import { recordAuditEvent } from "@/lib/audit";
import { DEFAULT_ORGANIZATION_TIMEZONE } from "@/features/organization/shared/organization-settings";
import {
  formatDateOnlyInTimeZone,
  fromZonedDateAndTime,
  formatTimeInTimeZone,
} from "@/lib/time-zone";
import { inferWorkLogStartTimes } from "../utils/worker-hours";
import {
  ACTIVE_SITE_COOKIE,
  getOrganizationContext,
  getTenantContext,
  setActiveSiteCookie,
} from "@/lib/tenant-context";
import {
  equipmentIdSchema,
  equipmentSchema,
  equipmentUpdateSchema,
  inventoryItemSchema,
  inventoryMovementSchema,
  relocationSchema,
  sectionNameSchema,
  siteNameSchema,
  createTaskSchema,
  maintenancePointSchema,
  operatingHourReadingSchema,
  updateTaskSchema,
} from "./schemas";
import {
  dispatchMaintenanceReminderById,
  dispatchMaintenanceReminders,
} from "./reminders";

const DAY_MS = 86_400_000;

async function dispatchTaskNotificationsAfterSave(
  organizationId: string,
  taskId: string,
) {
  try {
    const result = await dispatchMaintenanceReminders(
      organizationId,
      new Date(),
      taskId,
    );
    if (result.failed > 0) {
      console.error("Some maintenance task notifications failed", {
        organizationId,
        failed: result.failed,
      });
    }
  } catch (error) {
    console.error("Could not dispatch maintenance task notifications", error);
  }
}

async function getOrganizationTimeZone(db: TenantDb, organizationId: string) {
  const settings = await db.tenantSettings.findUnique({
    where: { organizationId },
    select: { timezone: true },
  });
  return settings?.timezone ?? DEFAULT_ORGANIZATION_TIMEZONE;
}

function getCalendarDayOffset(
  nextDate: Date,
  previousDate: Date,
  timeZone: string,
) {
  const [nextYear, nextMonth, nextDay] = formatDateOnlyInTimeZone(
    nextDate,
    timeZone,
  )
    .split("-")
    .map(Number);
  const [previousYear, previousMonth, previousDay] = formatDateOnlyInTimeZone(
    previousDate,
    timeZone,
  )
    .split("-")
    .map(Number);
  const nextUtcDay = Date.UTC(nextYear, nextMonth - 1, nextDay);
  const previousUtcDay = Date.UTC(
    previousYear,
    previousMonth - 1,
    previousDay,
  );
  return Math.round((nextUtcDay - previousUtcDay) / DAY_MS);
}

function shiftDateOnly(date: Date, dayOffset: number) {
  return new Date(date.getTime() + dayOffset * DAY_MS);
}

function resolveDailyHoursStartTimes<
  T extends {
    id?: string;
    workerId: string;
    workDate: string;
    startTime?: string | null;
    hours: number;
  },
>(
  entries: T[],
  scheduledStartTime: Date,
  timeZone: string,
) {
  const inferredStarts = inferWorkLogStartTimes(
    entries,
    scheduledStartTime,
    timeZone,
  );

  return entries.map((entry, index) => {
    if (entry.startTime) {
      return entry;
    }
    if (entry.id) {
      return { ...entry, startTime: null };
    }

    const inferredStart = inferredStarts[index];
    if (!inferredStart) {
      throw new Error(
        "Cannot infer a start time for this worker log. Enter a start time.",
      );
    }
    return { ...entry, ...inferredStart };
  });
}

// Equipment Actions
export async function getEquipment() {
  const { db, organizationId, siteId } = await getTenantContext("viewMaintenance");
  return await db.equipment.findMany({
    where: { organizationId, siteId },
    orderBy: { name: "asc" },
  });
}

export async function getMaintenancePoints(equipmentId: string) {
  const { db, organizationId, siteId } = await getTenantContext("viewMaintenance");
  const id = equipmentIdSchema.parse(equipmentId);
  const equipment = await db.equipment.findFirst({
    where: { id, organizationId, siteId },
    select: { id: true },
  });
  if (!equipment) throw new Error("Equipment not found in the active site");
  return db.equipmentMaintenancePoint.findMany({
    where: { equipmentId: id, organizationId, isActive: true },
    include: {
      checklistItems: {
        where: { organizationId, isActive: true },
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export async function saveMaintenancePoint(
  equipmentId: string,
  data: {
    id?: string | null;
    name: string;
    description?: string | null;
    checklistItems: string[];
  },
) {
  const { db, organizationId, siteId } = await getTenantContext("manageMaintenance");
  const id = equipmentIdSchema.parse(equipmentId);
  const input = maintenancePointSchema.parse(data);
  const equipment = await db.equipment.findFirst({
    where: { id, organizationId, siteId },
    select: { id: true },
  });
  if (!equipment) throw new Error("Equipment not found in the active site");

  const point = await db.transaction(async (tx) => {
    const existing = input.id
      ? await tx.equipmentMaintenancePoint.findFirst({
          where: {
            id: input.id,
            equipmentId: id,
            organizationId,
            isActive: true,
          },
          select: { id: true },
        })
      : null;
    if (input.id && !existing) {
      throw new Error("Maintenance point not found in the active organization");
    }

    const saved = existing
      ? await tx.equipmentMaintenancePoint.update({
          where: { id: existing.id, organizationId },
          data: { name: input.name, description: input.description ?? null },
        })
      : await tx.equipmentMaintenancePoint.create({
          data: {
            equipmentId: id,
            organizationId,
            name: input.name,
            description: input.description ?? null,
          },
        });

    await tx.equipmentPointChecklistItem.updateMany({
      where: { pointId: saved.id, organizationId, isActive: true },
      data: { isActive: false },
    });
    if (input.checklistItems.length > 0) {
      await tx.equipmentPointChecklistItem.createMany({
        data: input.checklistItems.map((title, sortOrder) => ({
          pointId: saved.id,
          equipmentId: id,
          organizationId,
          title,
          sortOrder,
        })),
      });
    }
    return saved;
  });
  revalidatePath("/");
  return point;
}

export async function getOperatingHourReadings(equipmentId: string) {
  const { db, organizationId, siteId } = await getTenantContext("viewMaintenance");
  const id = equipmentIdSchema.parse(equipmentId);
  const equipment = await db.equipment.findFirst({
    where: { id, organizationId, siteId },
    select: { id: true },
  });
  if (!equipment) throw new Error("Equipment not found in the active site");
  return db.equipmentOperatingHourReading.findMany({
    where: { equipmentId: id, organizationId },
    orderBy: [{ measuredAt: "desc" }, { createdAt: "desc" }],
    take: 50,
  });
}

export async function recordOperatingHours(
  equipmentId: string,
  data: { reading: number; measuredAt?: Date; note?: string | null },
) {
  const { db, organizationId, siteId, userId } =
    await getTenantContext("manageMaintenance");
  const id = equipmentIdSchema.parse(equipmentId);
  const input = operatingHourReadingSchema.parse({
    ...data,
    measuredAt: data.measuredAt ?? new Date(),
  });
  const equipment = await db.equipment.findFirst({
    where: { id, organizationId, siteId },
    select: { id: true },
  });
  if (!equipment) throw new Error("Equipment not found in the active site");

  const reading = await db.transaction(async (tx) => {
    const latest = await tx.equipmentOperatingHourReading.findFirst({
      where: { equipmentId: id, organizationId },
      orderBy: [{ measuredAt: "desc" }, { createdAt: "desc" }],
      select: { measuredAt: true, reading: true },
    });
    if (
      latest &&
      (input.measuredAt < latest.measuredAt ||
        input.reading < Number(latest.reading))
    ) {
      throw new Error("Operating-hour readings must be chronological and non-decreasing");
    }
    return tx.equipmentOperatingHourReading.create({
      data: {
        equipmentId: id,
        organizationId,
        reading: input.reading.toFixed(2),
        measuredAt: input.measuredAt,
        note: input.note ?? null,
        recordedById: userId,
      },
    });
  });
  revalidatePath("/");
  return reading;
}

export async function getInventoryItems() {
  const { db, organizationId, siteId } = await getTenantContext("viewMaintenance");
  return db.inventoryItem.findMany({
    where: { organizationId, siteId },
    include: { vendor: true },
    orderBy: { name: "asc" },
  });
}

export async function getMaintenanceSuppliers() {
  const { db, organizationId } = await getTenantContext("viewMaintenance");
  return db.vendor.findMany({
    where: { organizationId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true },
  });
}

export async function createInventoryItem(data: {
  name: string;
  reference?: string | null;
  unit: MaterialUnit;
  openingStock: number;
  reorderPoint: number;
  vendorId?: string | null;
}) {
  const { db, organizationId, siteId, userId } =
    await getTenantContext("manageMaintenance");
  const input = inventoryItemSchema.parse(data);
  if (input.vendorId) {
    const supplier = await db.vendor.findFirst({
      where: { id: input.vendorId, organizationId },
      select: { id: true },
    });
    if (!supplier) throw new Error("Supplier not found in the active organization");
  }

  const item = await db.transaction(async (tx) => {
    const created = await tx.inventoryItem.create({
      data: {
        organizationId,
        siteId,
        name: input.name,
        reference: input.reference ?? null,
        unit: input.unit,
        onHand: "0.00",
        reorderPoint: input.reorderPoint.toFixed(2),
        vendorId: input.vendorId ?? null,
      },
    });
    if (input.openingStock > 0) {
      const quantity = input.openingStock.toFixed(2);
      await tx.inventoryItem.update({
        where: { id: created.id, organizationId },
        data: { onHand: quantity },
      });
      await tx.inventoryMovement.create({
        data: {
          inventoryItemId: created.id,
          organizationId,
          type: InventoryMovementType.RECEIPT,
          quantity,
          note: "Opening stock",
          recordedById: userId,
        },
      });
    }
    return tx.inventoryItem.findUnique({
      where: { id: created.id, organizationId },
      include: { vendor: true },
    });
  });
  revalidatePath("/");
  return item;
}

export async function receiveInventory(
  inventoryItemId: string,
  data: { quantity: number; note?: string | null },
) {
  const { db, organizationId, siteId, userId } =
    await getTenantContext("manageMaintenance");
  const itemId = equipmentIdSchema.parse(inventoryItemId);
  const input = inventoryMovementSchema.parse(data);
  const movement = await db.transaction(async (tx) => {
    const { count } = await tx.inventoryItem.updateMany({
      where: { id: itemId, organizationId, siteId },
      data: { onHand: { increment: input.quantity.toFixed(2) } },
    });
    if (count !== 1) throw new Error("Inventory item not found in the active site");
    return tx.inventoryMovement.create({
      data: {
        inventoryItemId: itemId,
        organizationId,
        type: InventoryMovementType.RECEIPT,
        quantity: input.quantity.toFixed(2),
        note: input.note ?? null,
        recordedById: userId,
      },
    });
  });
  revalidatePath("/");
  return movement;
}

export async function consumeInventory(
  inventoryItemId: string,
  taskId: string,
  data: { quantity: number; note?: string | null },
) {
  const { db, organizationId, siteId, userId } =
    await getTenantContext("manageMaintenance");
  const itemId = equipmentIdSchema.parse(inventoryItemId);
  const validatedTaskId = equipmentIdSchema.parse(taskId);
  const input = inventoryMovementSchema.parse(data);
  const movement = await db.transaction(async (tx) => {
    const task = await tx.maintenanceTask.findFirst({
      where: {
        id: validatedTaskId,
        organizationId,
        deletedAt: null,
        equipment: { is: { siteId } },
      },
      select: { id: true },
    });
    if (!task) throw new Error("Task not found in the active site");

    const quantity = input.quantity.toFixed(2);
    const { count } = await tx.inventoryItem.updateMany({
      where: {
        id: itemId,
        organizationId,
        siteId,
        onHand: { gte: quantity },
      },
      data: { onHand: { decrement: quantity } },
    });
    if (count !== 1) {
      throw new Error("Inventory item not found or insufficient stock");
    }
    return tx.inventoryMovement.create({
      data: {
        inventoryItemId: itemId,
        organizationId,
        taskId: validatedTaskId,
        type: InventoryMovementType.CONSUMPTION,
        quantity,
        note: input.note ?? null,
        recordedById: userId,
      },
    });
  });
  revalidatePath("/");
  return movement;
}

async function assertOwnFile(
  db: TenantDb,
  fileId: string | null | undefined,
  organizationId: string,
) {
  if (!fileId) return;
  const file = await db.storedFile.findFirst({
    where: { id: fileId, organizationId },
    select: { id: true },
  });
  if (!file) throw new Error("File not found in the active organization");
}

async function assertSectionInSite(
  db: TenantDb,
  sectionId: string | null | undefined,
  organizationId: string,
  siteId: string,
) {
  if (!sectionId) return null;
  const section = await db.section.findFirst({
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
  const { db, organizationId, siteId, siteName, userId } = await getTenantContext("manageMaintenance");
  const input = equipmentSchema.parse(data);
  await assertOwnFile(db, input.imageFileId, organizationId);
  const section = await assertSectionInSite(db, input.sectionId, organizationId, siteId);

  const createData = {
    ...input,
    sectionId: section?.id ?? null,
    organizationId,
    siteId,
    relocations: {
      create: {
        toSiteName: siteName,
        toSectionName: section?.name ?? null,
        movedById: userId,
      },
    },
  };
  const imageFileId = input.imageFileId;
  const equipment = imageFileId
    ? await db.transaction(async (tx) => {
        await markStoredFileAttached(tx, imageFileId, organizationId);
        return tx.equipment.create({ data: createData });
      })
    : await db.equipment.create({ data: createData });
  revalidatePath("/");
  return equipment;
}

export async function updateEquipment(
  id: string,
  data: { name?: string; category?: string | null; imageFileId?: string | null },
) {
  const { db, organizationId, siteId, userId } = await getTenantContext("manageMaintenance");
  const equipmentId = equipmentIdSchema.parse(id);
  const input = equipmentUpdateSchema.parse(data);
  await assertOwnFile(db, input.imageFileId, organizationId);

  const previous = await db.equipment.findFirst({
    where: { id: equipmentId, organizationId, siteId },
    select: { imageFileId: true },
  });
  if (!previous) throw new Error("Equipment not found");

  const imageFileId = input.imageFileId;
  const equipment = imageFileId && imageFileId !== previous.imageFileId
    ? await db.transaction(async (tx) => {
        await markStoredFileAttached(tx, imageFileId, organizationId);
        return tx.equipment.update({
          where: { id: equipmentId, organizationId, siteId },
          data: input,
        });
      })
    : await db.equipment.update({
        where: { id: equipmentId, organizationId, siteId },
        data: input,
      });

  if (
    input.imageFileId !== undefined &&
    previous.imageFileId &&
    previous.imageFileId !== input.imageFileId
  ) {
    await deleteStoredFile(db, previous.imageFileId, organizationId);
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
  const { db, organizationId, siteId, userId } = await getTenantContext("manageMaintenance");
  const equipmentId = equipmentIdSchema.parse(id);
  const input = relocationSchema.parse(target);

  const [current, targetSite] = await Promise.all([
    db.equipment.findFirst({
      where: { id: equipmentId, organizationId, siteId },
      include: { site: { select: { name: true } }, section: { select: { name: true } } },
    }),
    db.site.findFirst({
      where: { id: input.siteId, organizationId },
      select: { id: true, name: true },
    }),
  ]);
  if (!current) throw new Error("Equipment not found");
  if (!targetSite) throw new Error("Target site not found in the active organization");

  const section = await assertSectionInSite(db, input.sectionId, organizationId, targetSite.id);
  if (current.siteId === targetSite.id && current.sectionId === (section?.id ?? null)) {
    return current;
  }

  const equipment = await db.equipment.update({
    where: { id: equipmentId },
    data: {
      siteId: targetSite.id,
      sectionId: section?.id ?? null,
      relocations: {
        create: {
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
  const { db, organizationId, siteId } = await getTenantContext("viewMaintenance");
  const equipmentId = equipmentIdSchema.parse(id);
  return await db.equipmentRelocation.findMany({
    where: { equipmentId, organizationId, equipment: { siteId } },
    orderBy: { movedAt: "desc" },
    take: 20,
  });
}

/** Moves equipment and its tasks to the trash; admins can restore them. */
export async function deleteEquipment(id: string) {
  const { db, organizationId, siteId, userId } = await getTenantContext("deleteMaintenance");
  const equipmentId = equipmentIdSchema.parse(id);
  const deletedAt = new Date();
  const removed = await db.transaction(async (tx) => {
    const { count } = await tx.equipment.updateMany({
      where: { id: equipmentId, organizationId, siteId, deletedAt: null },
      data: { deletedAt, deletedById: userId },
    });
    if (count === 0) return false;
    await tx.maintenanceTask.updateMany({
      where: { equipmentId, organizationId, deletedAt: null },
      data: { deletedAt, deletedById: userId },
    });
    return true;
  });
  if (removed) {
    await recordAuditEvent({
      organizationId,
      actorUserId: userId,
      action: "equipment.deleted",
      subjectType: "equipment",
      subjectId: equipmentId,
    });
  }
  revalidatePath("/");
}

/** Restores trashed equipment together with the tasks trashed alongside it. */
export async function restoreEquipment(id: string) {
  const { db, organizationId, siteId, userId } = await getTenantContext("deleteMaintenance");
  const equipmentId = equipmentIdSchema.parse(id);
  const restored = await db.transaction(async (tx) => {
    const trashed = await tx.equipment.findFirst({
      where: { id: equipmentId, organizationId, siteId, deletedAt: { not: null } },
      select: { deletedAt: true },
    });
    if (!trashed?.deletedAt) return false;
    await tx.equipment.updateMany({
      where: { id: equipmentId, organizationId },
      data: { deletedAt: null, deletedById: null },
    });
    await tx.maintenanceTask.updateMany({
      where: { equipmentId, organizationId, deletedAt: trashed.deletedAt },
      data: { deletedAt: null, deletedById: null },
    });
    return true;
  });
  if (!restored) throw new Error("Deleted equipment not found");
  await recordAuditEvent({
    organizationId,
    actorUserId: userId,
    action: "equipment.restored",
    subjectType: "equipment",
    subjectId: equipmentId,
  });
  revalidatePath("/");
}

// Section Actions
export async function getSections() {
  const { db, organizationId } = await getTenantContext("viewMaintenance");
  return await db.section.findMany({
    where: { organizationId },
    select: { id: true, name: true, siteId: true },
    orderBy: { name: "asc" },
  });
}

export async function createSite(name: string) {
  const { db, organizationId, userId } =
    await getOrganizationContext("manageSites");
  const siteName = siteNameSchema.parse(name);

  const existingSites = await db.site.findMany({
    where: { organizationId },
    select: { id: true },
    take: 2,
  });

  let site: { id: string; name: string };
  try {
    site = await db.site.create({
      data: { name: siteName, organizationId },
      select: { id: true, name: true },
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      throw new Error("A site with this name already exists");
    }
    throw error;
  }
  // A single site is implicitly active; pin it so adding another does not force a re-selection.
  if (existingSites.length <= 1 && !(await cookies()).get(ACTIVE_SITE_COOKIE)) {
    await setActiveSiteCookie(existingSites[0]?.id ?? site.id);
  }
  await recordAuditEvent({
    organizationId,
    actorUserId: userId,
    action: "site.created",
    subjectType: "site",
    subjectId: site.id,
  });
  revalidatePath("/");
  return site;
}

export async function createSection(siteId: string, name: string) {
  const { db, organizationId } = await getTenantContext("manageMaintenance");
  const targetSiteId = equipmentIdSchema.parse(siteId);
  const sectionName = sectionNameSchema.parse(name);
  const site = await db.site.findFirst({
    where: { id: targetSiteId, organizationId },
    select: { id: true },
  });
  if (!site) throw new Error("Site not found in the active organization");

  const section = await db.section.upsert({
    where: { siteId_name: { siteId: site.id, name: sectionName } },
    create: { name: sectionName, siteId: site.id, organizationId },
    update: {},
    select: { id: true, name: true, siteId: true },
  });
  revalidatePath("/");
  return section;
}

export async function renameSection(id: string, name: string) {
  const { db, organizationId } = await getTenantContext("manageSites");
  const section = await db.section.update({
    where: { id: equipmentIdSchema.parse(id), organizationId },
    data: { name: sectionNameSchema.parse(name) },
    select: { id: true, name: true, siteId: true },
  });
  revalidatePath("/");
  return section;
}

/** Equipment in the section is kept and simply becomes unassigned. */
export async function deleteSection(id: string) {
  const { db, organizationId } = await getTenantContext("manageSites");
  await db.section.delete({
    where: { id: equipmentIdSchema.parse(id), organizationId },
  });
  revalidatePath("/");
}

// Maintenance Task Actions
export async function getTasks() {
  const { db, organizationId, siteId } = await getTenantContext("viewMaintenance");
  return await db.maintenanceTask.findMany({
    where: {
      organizationId,
      equipment: { is: { siteId } },
    },
    relationLoadStrategy: "join",
    include: {
      equipment: true,
      assignments: {
        include: {
          worker: true,
        },
      },
      dailyHours: true,
      materials: true,
      checklistItems: { orderBy: { sortOrder: "asc" } },
      reminders: {
        select: {
          id: true,
          workerId: true,
          notificationType: true,
          status: true,
          scheduledFor: true,
          sentAt: true,
          attempts: true,
          worker: { select: { name: true } },
        },
        orderBy: { scheduledFor: "asc" },
      },
    },
    orderBy: { startTime: "asc" },
  });
}

const taskEmailRequestSchema = z.object({
  taskId: equipmentIdSchema,
  workerIds: z.array(equipmentIdSchema).min(1),
  requestId: z.string().uuid(),
});

function isValidNotificationEmail(email: string) {
  return z.string().email().safeParse(email.trim()).success;
}

export async function previewMaintenanceTaskEmail(taskId: string) {
  const { db, organizationId, siteId } = await getTenantContext("manageMaintenance");
  const validatedTaskId = equipmentIdSchema.parse(taskId);
  const task = await db.maintenanceTask.findFirst({
    where: {
      id: validatedTaskId,
      organizationId,
      deletedAt: null,
      equipment: { is: { siteId } },
    },
    select: {
      id: true,
      title: true,
      startTime: true,
      assignments: {
        where: { worker: { deletedAt: null } },
        select: {
          workerId: true,
          worker: { select: { name: true, email: true } },
        },
      },
    },
  });
  if (!task) throw new Error("Task not found in the active site");

  const recipients = task.assignments.map(({ workerId, worker }) => ({
    workerId,
    name: worker.name,
    email: worker.email.trim(),
  }));
  return {
    taskId: task.id,
    title: task.title,
    startTime: task.startTime,
    recipients: recipients.filter(({ email }) =>
      isValidNotificationEmail(email),
    ),
    excludedRecipients: recipients
      .filter(({ email }) => !isValidNotificationEmail(email))
      .map(({ workerId, name }) => ({ workerId, name })),
  };
}

export async function sendMaintenanceTaskEmail(
  input: z.input<typeof taskEmailRequestSchema>,
) {
  const { db, organizationId, siteId, userId } =
    await getTenantContext("manageMaintenance");
  const request = taskEmailRequestSchema.parse(input);
  if (new Set(request.workerIds).size !== request.workerIds.length) {
    throw new Error("Worker IDs must be unique");
  }

  const task = await db.maintenanceTask.findFirst({
    where: {
      id: request.taskId,
      organizationId,
      deletedAt: null,
      equipment: { is: { siteId } },
    },
    select: {
      id: true,
      assignments: {
        where: {
          workerId: { in: request.workerIds },
          worker: { deletedAt: null },
        },
        select: {
          workerId: true,
          worker: { select: { email: true } },
        },
      },
    },
  });
  if (!task) throw new Error("Task not found in the active site");
  if (task.assignments.length !== request.workerIds.length) {
    throw new Error("One or more selected workers are no longer assigned");
  }
  if (task.assignments.some(({ worker }) =>
    !isValidNotificationEmail(worker.email),
  )) {
    throw new Error("One or more assigned workers do not have a valid email address");
  }

  const settings = await db.tenantSettings.findUnique({
    where: { organizationId },
    select: { locale: true },
  });
  const locale = settings?.locale?.toLowerCase().startsWith("pt")
    ? "pt-pt"
    : "en";
  const now = new Date();
  const notifications = await Promise.all(
    task.assignments.map(async ({ workerId, worker }) => {
      const email = worker.email.trim();
      const idempotencyKey = `manual:${request.requestId}:${task.id}:${workerId}`;
      const notification = await db.maintenanceTaskReminder.upsert({
        where: { idempotencyKey },
        create: {
          taskId: task.id,
          workerId,
          organizationId,
          notificationType: MaintenanceTaskNotificationType.MANUAL,
          idempotencyKey,
          recipientEmail: email,
          locale,
          scheduledFor: now,
          nextAttemptAt: now,
          requestedById: userId,
        },
        update: {},
        select: { id: true, status: true },
      });
      return notification;
    }),
  );

  const outcomes = await Promise.all(
    notifications.map((notification) =>
      notification.status === MaintenanceReminderStatus.SENT
        ? Promise.resolve("sent" as const)
        : dispatchMaintenanceReminderById(
            organizationId,
            notification.id,
            now,
          ),
    ),
  );
  revalidatePath("/");
  return {
    sent: outcomes.filter((outcome) => outcome === "sent").length,
    failed: outcomes.filter(
      (outcome) => outcome === "failed" || outcome === "cancelled",
    ).length,
    pending: outcomes.filter(
      (outcome) =>
        outcome === "skipped" || outcome === "missing",
    ).length,
  };
}

export async function createTask(data: {
  title: string;
  description?: string;
  type?: TaskType;
  startTime: Date;
  endTime?: Date | null;
  equipmentId: string;
  status?: string;
  maintenancePointId?: string | null;
  workerIds: string[];
  dailyHours?: {
    workerId: string;
    workDate: string;
    startTime?: string | null;
    hours: number;
  }[];
  materials?: {
    name: string;
    reference?: string;
    quantity: number;
    unit?: MaterialUnit;
    price?: number;
  }[];
}) {
  const { db, organizationId, siteId } = await getTenantContext("manageMaintenance");
  const input = createTaskSchema.parse(data);
  const { workerIds, dailyHours, materials, ...taskData } = input;
  if (dailyHours?.some((entry) => entry.id)) {
    throw new Error("New work logs cannot include existing record IDs");
  }
  const workLogTimeZone = dailyHours?.length
    ? await getOrganizationTimeZone(db, organizationId)
    : DEFAULT_ORGANIZATION_TIMEZONE;
  const resolvedDailyHours = dailyHours
    ? resolveDailyHoursStartTimes(
        dailyHours,
        taskData.startTime,
        workLogTimeZone,
      )
    : undefined;
  const equipment = await db.equipment.findFirst({
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
  const maintenancePoint = taskData.maintenancePointId
    ? await db.equipmentMaintenancePoint.findFirst({
        where: {
          id: taskData.maintenancePointId,
          equipmentId: taskData.equipmentId,
          organizationId,
          isActive: true,
        },
        include: {
          checklistItems: {
            where: { organizationId, isActive: true },
            orderBy: { sortOrder: "asc" },
          },
        },
      })
    : null;
  if (taskData.maintenancePointId && !maintenancePoint) {
    throw new Error("Maintenance point not found for the selected equipment");
  }

  await assertWorkersBelongToOrganization(
    db,
    [...workerIds, ...(dailyHours?.map((entry) => entry.workerId) ?? [])],
    organizationId,
  );

  const task = await db.maintenanceTask.create({
    data: {
      ...taskData,
      endTime: taskData.endTime ?? null,
      organizationId,
      ...(maintenancePoint && {
        checklistItems: {
          createMany: {
            data: maintenancePoint.checklistItems.map((item) => ({
              sourceItemId: item.id,
              title: item.title,
              sortOrder: item.sortOrder,
            })),
          },
        },
      }),
      assignments: {
        create: workerIds.map((workerId) => ({
          workerId,
        })),
      },
      ...(resolvedDailyHours && {
        dailyHours: {
          createMany: {
            data: resolvedDailyHours.map((entry) => ({
              workerId: entry.workerId,
              workDate: new Date(`${entry.workDate}T00:00:00.000Z`),
              startTime: entry.startTime
                ? fromZonedDateAndTime(
                    entry.workDate,
                    entry.startTime,
                    workLogTimeZone,
                  )
                : null,
              hours: entry.hours.toFixed(2),
            })),
          },
        },
      }),
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
      dailyHours: true,
      materials: true,
      checklistItems: { orderBy: { sortOrder: "asc" } },
    },
  });
  revalidatePath("/");
  await dispatchTaskNotificationsAfterSave(organizationId, task.id);
  return task;
}

export async function updateTask(
  id: string,
  data: Partial<{
    title: string;
    description: string;
    type: TaskType;
    startTime: Date;
    endTime: Date | null;
    equipmentId: string;
    status: string;
    completedAt: Date | null;
    maintenancePointId?: string | null;
    workerIds: string[];
    dailyHours: {
      id?: string;
      workerId: string;
      workDate: string;
      startTime?: string | null;
      hours: number;
    }[];
    workerLogs: {
      workerId: string;
      startTime?: Date | null;
      endTime?: Date | null;
    }[];
    materials: {
      name: string;
      reference?: string;
      quantity: number;
      unit?: MaterialUnit;
      price?: number;
    }[];
    checklistItems: { id: string; isComplete: boolean }[];
  }>,
) {
  const { db, organizationId, siteId, userId } = await getTenantContext("manageMaintenance");
  const taskId = equipmentIdSchema.parse(id);
  const input = updateTaskSchema.parse(data);
  const {
    workerIds,
    dailyHours,
    workerLogs,
    materials,
    checklistItems,
    completedAt,
    maintenancePointId,
    ...taskData
  } = input;

  const currentTask = await db.maintenanceTask.findFirst({
    where: {
      id: taskId,
      organizationId,
      equipment: { is: { siteId } },
    },
    select: {
      id: true,
      startTime: true,
      endTime: true,
      status: true,
      completedAt: true,
      equipmentId: true,
      maintenancePointId: true,
      assignments: { select: { workerId: true } },
    },
  });
  if (!currentTask) {
    throw new Error("Maintenance task not found in the active organization");
  }
  const effectiveStartTime = taskData.startTime ?? currentTask.startTime;
  const effectiveEndTime =
    taskData.endTime === undefined ? currentTask.endTime : taskData.endTime;
  if (effectiveEndTime && effectiveEndTime <= effectiveStartTime) {
    throw new Error("Task end time must be after start time");
  }
  const completionTime =
    completedAt ??
    currentTask.completedAt ??
    (taskData.status === "completed" && currentTask.status !== "completed"
      ? new Date()
      : null);
  const workLogTimeZone = dailyHours?.length
    ? await getOrganizationTimeZone(db, organizationId)
    : DEFAULT_ORGANIZATION_TIMEZONE;

  if (taskData.equipmentId) {
    const equipment = await db.equipment.findFirst({
      where: { id: taskData.equipmentId, organizationId, siteId },
      select: { id: true },
    });
    if (!equipment) {
      throw new Error("Equipment not found in the active organization site");
    }
  }
  const targetEquipmentId = taskData.equipmentId ?? currentTask.equipmentId;
  const currentMaintenancePointId = currentTask.maintenancePointId ?? null;
  const hasMaintenancePointInput = Object.hasOwn(input, "maintenancePointId");
  const nextMaintenancePointId = hasMaintenancePointInput
    ? maintenancePointId ?? null
    : targetEquipmentId === currentTask.equipmentId
      ? currentMaintenancePointId
      : null;
  const maintenancePoint =
    nextMaintenancePointId === null
      ? null
      : await db.equipmentMaintenancePoint.findFirst({
          where: {
            id: nextMaintenancePointId,
            equipmentId: targetEquipmentId,
            organizationId,
            isActive: true,
          },
          include: {
            checklistItems: {
              where: { organizationId, isActive: true },
              orderBy: { sortOrder: "asc" },
            },
          },
        });
  if (nextMaintenancePointId && !maintenancePoint) {
    throw new Error("Maintenance point not found for the selected equipment");
  }
  const maintenancePointChanged =
    nextMaintenancePointId !== currentMaintenancePointId;

  const assignedWorkerIds = [
    ...(workerLogs?.map((log) => log.workerId) ?? workerIds ?? []),
    ...(dailyHours?.map((entry) => entry.workerId) ?? []),
  ];
  if (assignedWorkerIds) {
    await assertWorkersBelongToOrganization(db, assignedWorkerIds, organizationId);
  }
  const allowedDailyHourWorkers = new Set([
    ...(currentTask.assignments ?? []).map((assignment) => assignment.workerId),
    ...(workerIds ?? []),
  ]);
  if (
    dailyHours?.some((entry) => !allowedDailyHourWorkers.has(entry.workerId))
  ) {
    throw new Error("Daily hours must belong to a worker assigned to the task");
  }

  const task = await db.transaction(async (tx) => {
    const dailyHoursDayOffset =
      taskData.startTime && currentTask.startTime
        ? getCalendarDayOffset(
            taskData.startTime,
            currentTask.startTime,
            workLogTimeZone,
          )
        : 0;

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
            startTime: log.startTime ?? null,
            endTime: log.endTime ?? null,
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

    if (dailyHours) {
      const currentWorkLogs = await tx.maintenanceTaskDailyHours.findMany({
        where: { taskId, organizationId },
        select: { id: true },
      });
      const currentWorkLogIds = new Set(currentWorkLogs.map(({ id }) => id));
      if (dailyHours.some((entry) => entry.id && !currentWorkLogIds.has(entry.id))) {
        throw new Error("Work log not found in the active maintenance task");
      }

      const submittedWorkLogIds = dailyHours.flatMap((entry) =>
        entry.id ? [entry.id] : [],
      );
      await tx.maintenanceTaskDailyHours.deleteMany({
        where: {
          taskId,
          organizationId,
          ...(submittedWorkLogIds.length > 0 && {
            id: { notIn: submittedWorkLogIds },
          }),
        },
      });

      const shiftedDailyHours = dailyHours.map((entry) => {
        const workDate = shiftDateOnly(
          new Date(`${entry.workDate}T00:00:00.000Z`),
          dailyHoursDayOffset,
        );
        return {
          ...entry,
          workDate: workDate.toISOString().slice(0, 10),
        };
      });
      const resolvedDailyHours = resolveDailyHoursStartTimes(
        shiftedDailyHours,
        effectiveStartTime,
        workLogTimeZone,
      );
      const workLogData = resolvedDailyHours.map((entry) => {
        return {
          id: entry.id,
          taskId,
          workerId: entry.workerId,
          organizationId,
          workDate: new Date(`${entry.workDate}T00:00:00.000Z`),
          startTime: entry.startTime
            ? fromZonedDateAndTime(
                entry.workDate,
                entry.startTime,
                workLogTimeZone,
              )
            : null,
          hours: entry.hours.toFixed(2),
        };
      });

      for (const entry of workLogData.filter((workLog) => workLog.id)) {
        await tx.maintenanceTaskDailyHours.updateMany({
          where: {
            id: entry.id,
            taskId,
            organizationId,
          },
          data: {
            workerId: entry.workerId,
            workDate: entry.workDate,
            startTime: entry.startTime,
            hours: entry.hours,
          },
        });
      }

      const newWorkLogs = workLogData
        .filter((entry) => !entry.id)
        .map((entry) => ({
          taskId: entry.taskId,
          workerId: entry.workerId,
          organizationId: entry.organizationId,
          workDate: entry.workDate,
          startTime: entry.startTime,
          hours: entry.hours,
        }));
      if (newWorkLogs.length > 0) {
        await tx.maintenanceTaskDailyHours.createMany({
          data: newWorkLogs,
        });
      }
    }

    if (maintenancePointChanged) {
      await tx.maintenanceTaskChecklistItem.deleteMany({
        where: { taskId, organizationId },
      });
      if (maintenancePoint?.checklistItems.length) {
        await tx.maintenanceTaskChecklistItem.createMany({
          data: maintenancePoint.checklistItems.map((item) => ({
            taskId,
            organizationId,
            sourceItemId: item.id,
            title: item.title,
            sortOrder: item.sortOrder,
          })),
        });
      }
    } else if (checklistItems) {
      for (const item of checklistItems) {
        const { count } = await tx.maintenanceTaskChecklistItem.updateMany({
          where: { id: item.id, taskId, organizationId },
          data: {
            isComplete: item.isComplete,
            completedAt: item.isComplete ? new Date() : null,
            completedById: item.isComplete ? userId : null,
          },
        });
        if (count !== 1) {
          throw new Error("Checklist item not found on the active task");
        }
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

    const changesSchedule =
      taskData.startTime !== undefined || taskData.endTime !== undefined;
    try {
      return await tx.maintenanceTask.update({
        where: {
          id: taskId,
          organizationId,
          ...(changesSchedule
            ? {
                startTime: currentTask.startTime,
                endTime: currentTask.endTime,
              }
            : {}),
        },
        data: {
          ...taskData,
          ...(completionTime && { completedAt: completionTime }),
          ...(hasMaintenancePointInput ||
          targetEquipmentId !== currentTask.equipmentId
            ? { maintenancePointId: nextMaintenancePointId }
            : {}),
        },
        include: {
          equipment: true,
          assignments: {
            include: {
              worker: true,
            },
          },
          dailyHours: true,
          materials: true,
          checklistItems: { orderBy: { sortOrder: "asc" } },
        },
      });
    } catch (error) {
      if (
        changesSchedule &&
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2025"
      ) {
        throw new Error(
          "Task schedule changed concurrently. Reload the task and try again.",
        );
      }
      throw error;
    }
  });

  revalidatePath("/");
  await dispatchTaskNotificationsAfterSave(organizationId, task.id);
  return task;
}

export async function deleteTask(id: string) {
  const { db, organizationId, siteId, userId } = await getTenantContext("deleteMaintenance");
  const taskId = equipmentIdSchema.parse(id);
  const { count } = await db.maintenanceTask.updateMany({
    where: {
      id: taskId,
      organizationId,
      deletedAt: null,
      equipment: { is: { siteId } },
    },
    data: { deletedAt: new Date(), deletedById: userId },
  });
  if (count > 0) {
    await recordAuditEvent({
      organizationId,
      actorUserId: userId,
      action: "task.deleted",
      subjectType: "task",
      subjectId: taskId,
    });
  }
  revalidatePath("/");
}

export async function restoreTask(id: string) {
  const { db, organizationId, siteId, userId } = await getTenantContext("deleteMaintenance");
  const taskId = equipmentIdSchema.parse(id);
  const { count } = await db.maintenanceTask.updateMany({
    where: {
      id: taskId,
      organizationId,
      deletedAt: { not: null },
      equipment: { is: { siteId, deletedAt: null } },
    },
    data: { deletedAt: null, deletedById: null },
  });
  if (count === 0) throw new Error("Deleted task not found");
  await recordAuditEvent({
    organizationId,
    actorUserId: userId,
    action: "task.restored",
    subjectType: "task",
    subjectId: taskId,
  });
  revalidatePath("/");
}

export async function moveTask(
  taskId: string,
  newStartTime: Date,
  newEquipmentId?: string,
) {
  const { db, organizationId, siteId } = await getTenantContext("manageMaintenance");
  const validatedTaskId = equipmentIdSchema.parse(taskId);
  const startTime = new Date(newStartTime);
  if (Number.isNaN(startTime.getTime())) {
    throw new Error("Task start time is invalid");
  }
  const workLogTimeZone = await getOrganizationTimeZone(db, organizationId);

  if (newEquipmentId !== undefined) {
    const equipment = await db.equipment.findFirst({
      where: { id: equipmentIdSchema.parse(newEquipmentId), organizationId, siteId },
      select: { id: true },
    });
    if (!equipment) {
      throw new Error("Equipment not found in the active organization site");
    }
  }

  const task = await db.transaction(async (tx) => {
    const current = await tx.maintenanceTask.findFirst({
      where: {
        id: validatedTaskId,
        organizationId,
        equipment: { is: { siteId } },
      },
      select: { startTime: true, endTime: true },
    });
    if (!current) {
      throw new Error("Maintenance task not found in the active organization");
    }

    const offsetMs = startTime.getTime() - current.startTime.getTime();
    const endTime = current.endTime
      ? new Date(current.endTime.getTime() + offsetMs)
      : null;
    const dayOffset = getCalendarDayOffset(
      startTime,
      current.startTime,
      workLogTimeZone,
    );
    if (dayOffset !== 0) {
      const dailyHours = await tx.maintenanceTaskDailyHours.findMany({
        where: { taskId: validatedTaskId, organizationId },
        select: {
          id: true,
          workDate: true,
          startTime: true,
        },
      });
      if (dailyHours.length > 0) {
        for (const allocation of dailyHours) {
          const workDate = shiftDateOnly(allocation.workDate, dayOffset);
          const shiftedDate = workDate.toISOString().slice(0, 10);
          await tx.maintenanceTaskDailyHours.updateMany({
            where: {
              id: allocation.id,
              taskId: validatedTaskId,
              organizationId,
            },
            data: {
              workDate,
              ...(allocation.startTime && {
                startTime: fromZonedDateAndTime(
                  shiftedDate,
                  formatTimeInTimeZone(
                    allocation.startTime,
                    workLogTimeZone,
                  ),
                  workLogTimeZone,
                ),
              }),
            },
          });
        }
      }
    }

    return tx.maintenanceTask.update({
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
        dailyHours: true,
        materials: true,
        checklistItems: { orderBy: { sortOrder: "asc" } },
      },
    });
  });
  revalidatePath("/");
  await dispatchTaskNotificationsAfterSave(organizationId, task.id);
  return task;
}

async function assertWorkersBelongToOrganization(
  db: TenantDb,
  workerIds: string[],
  organizationId: string,
) {
  const uniqueWorkerIds = [...new Set(workerIds)];
  if (uniqueWorkerIds.length === 0) {
    return;
  }

  const count = await db.worker.count({
    where: {
      id: { in: uniqueWorkerIds },
      organizationId,
    },
  });

  if (count !== uniqueWorkerIds.length) {
    throw new Error("One or more workers are not in the active organization");
  }
}
