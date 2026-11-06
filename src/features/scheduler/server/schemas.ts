import { z } from "zod";
import { MaterialUnit, TaskType } from "../../../../prisma/generated/prisma/enums";
import { TASK_STATUSES } from "../task-status";

const idSchema = z.string().trim().min(1);

const dailyHoursSchema = z.object({
  id: idSchema.optional(),
  workerId: idSchema,
  workDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((value) => {
      const date = new Date(`${value}T00:00:00.000Z`);
      return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
    }),
  startTime: z
    .union([
      z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
      z.literal(""),
    ])
    .nullable()
    .optional(),
  hours: z.number().finite().min(0.25).max(24).multipleOf(0.25),
});

const materialSchema = z.object({
  name: z.string().trim().min(1),
  reference: z.string().trim().optional(),
  quantity: z.number().finite().min(0.1).multipleOf(0.1),
  unit: z.nativeEnum(MaterialUnit).optional(),
  price: z.number().finite().min(0).optional(),
});

const workerLogSchema = z
  .object({
    workerId: idSchema,
    startTime: z.coerce.date().nullable().optional(),
    endTime: z.coerce.date().nullable().optional(),
  })
  .superRefine((log, ctx) => {
    if (log.endTime && !log.startTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["startTime"],
        message: "A worker start time is required when an end time is recorded",
      });
    } else if (log.startTime && log.endTime && log.endTime <= log.startTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endTime"],
        message: "Worker end time must be after start time",
      });
    }
  });

export const createTaskSchema = z
  .object({
    title: z.string().trim().min(1),
    description: z.string().nullable().optional(),
    type: z.nativeEnum(TaskType).optional(),
    startTime: z.coerce.date(),
    endTime: z.coerce.date().nullable().optional(),
    equipmentId: idSchema,
    maintenancePointId: idSchema.nullable().optional(),
    status: z.enum(TASK_STATUSES).optional(),
    workerIds: z.array(idSchema).default([]),
    dailyHours: z.array(dailyHoursSchema).optional(),
    materials: z.array(materialSchema).optional(),
  })
  .refine(
    (task) =>
      task.endTime == null ||
      task.endTime > task.startTime,
    {
      path: ["endTime"],
      message: "Task end time must be after start time",
    },
  )
  .refine((task) => new Set(task.workerIds).size === task.workerIds.length, {
    path: ["workerIds"],
    message: "Worker IDs must be unique",
  })
  .refine(
    (task) =>
      task.dailyHours === undefined ||
      task.dailyHours.every((entry) => task.workerIds.includes(entry.workerId)),
    {
      path: ["dailyHours"],
      message: "Daily hours must belong to an assigned worker",
    },
  );

export const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    description: z.string().nullable().optional(),
    type: z.nativeEnum(TaskType).optional(),
    startTime: z.coerce.date().optional(),
    endTime: z.coerce.date().nullable().optional(),
    equipmentId: idSchema.optional(),
    maintenancePointId: idSchema.nullable().optional(),
    status: z.enum(TASK_STATUSES).optional(),
    completedAt: z.coerce.date().nullable().optional(),
    workerIds: z.array(idSchema).optional(),
    dailyHours: z.array(dailyHoursSchema).optional(),
    workerLogs: z.array(workerLogSchema).optional(),
    materials: z.array(materialSchema).optional(),
    checklistItems: z
      .array(z.object({ id: idSchema, isComplete: z.boolean() }))
      .optional(),
  })
  .refine(
    (task) =>
      task.startTime === undefined ||
      task.endTime == null ||
      task.endTime > task.startTime,
    {
      path: ["endTime"],
      message: "Task end time must be after start time",
    },
  )
  .refine(
    (task) =>
      task.workerIds === undefined ||
      new Set(task.workerIds).size === task.workerIds.length,
    {
      path: ["workerIds"],
      message: "Worker IDs must be unique",
    },
  )
  .refine(
    (task) =>
      task.dailyHours === undefined ||
      new Set(task.dailyHours.flatMap((entry) => entry.id ? [entry.id] : [])).size ===
        task.dailyHours.filter((entry) => entry.id).length,
    {
      path: ["dailyHours"],
      message: "Work log IDs must be unique",
    },
  )
  .refine(
    (task) =>
      task.workerLogs === undefined ||
      new Set(task.workerLogs.map((log) => log.workerId)).size ===
        task.workerLogs.length,
    {
      path: ["workerLogs"],
      message: "Worker logs must have unique worker IDs",
    },
  );

export const equipmentIdSchema = idSchema;
export const workerIdsSchema = z.array(idSchema);

const optionalId = z.string().trim().min(1).nullable().optional();

export const equipmentSchema = z.object({
  name: z.string().trim().min(1),
  category: z.string().trim().nullable().optional(),
  imageFileId: optionalId,
  sectionId: optionalId,
});

export const equipmentUpdateSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    category: z.string().trim().nullable().optional(),
    imageFileId: optionalId,
  })
  .refine((equipment) => Object.keys(equipment).length > 0, {
    message: "At least one equipment field must be provided",
  });

export const maintenancePointSchema = z.object({
  id: optionalId,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).nullable().optional(),
  checklistItems: z.array(z.string().trim().min(1).max(300)).max(100),
});

export const operatingHourReadingSchema = z.object({
  reading: z.number().finite().min(0).max(9999999999.99),
  measuredAt: z.coerce.date(),
  note: z.string().trim().max(1000).nullable().optional(),
});

const stockQuantitySchema = z
  .number()
  .finite()
  .min(0)
  .max(9999999999.99)
  .refine((value) => Math.round(value * 100) === value * 100);

export const inventoryItemSchema = z.object({
  name: z.string().trim().min(1).max(160),
  reference: z.string().trim().max(120).nullable().optional(),
  unit: z.nativeEnum(MaterialUnit),
  openingStock: stockQuantitySchema,
  reorderPoint: stockQuantitySchema,
  vendorId: optionalId,
});

export const inventoryMovementSchema = z.object({
  quantity: stockQuantitySchema.refine((value) => value > 0),
  note: z.string().trim().max(1000).nullable().optional(),
});

export const siteNameSchema = z.string().trim().min(1).max(80);

export const sectionNameSchema = z.string().trim().min(1).max(80);

export const relocationSchema = z.object({
  siteId: z.string().trim().min(1),
  sectionId: optionalId,
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
