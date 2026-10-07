import { z } from "zod";
import { MaterialUnit, TaskType } from "../../../../prisma/generated/prisma/enums";

const idSchema = z.string().trim().min(1);

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
    startTime: z.coerce.date(),
    endTime: z.coerce.date(),
  })
  .refine((log) => log.endTime > log.startTime, {
    path: ["endTime"],
    message: "Worker end time must be after start time",
  });

export const createTaskSchema = z
  .object({
    title: z.string().trim().min(1),
    description: z.string().nullable().optional(),
    type: z.nativeEnum(TaskType).optional(),
    startTime: z.coerce.date(),
    endTime: z.coerce.date(),
    equipmentId: idSchema,
    status: z.string().trim().min(1).optional(),
    workerIds: z.array(idSchema).default([]),
    materials: z.array(materialSchema).optional(),
  })
  .refine((task) => task.endTime > task.startTime, {
    path: ["endTime"],
    message: "Task end time must be after start time",
  })
  .refine((task) => new Set(task.workerIds).size === task.workerIds.length, {
    path: ["workerIds"],
    message: "Worker IDs must be unique",
  });

export const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    description: z.string().nullable().optional(),
    type: z.nativeEnum(TaskType).optional(),
    startTime: z.coerce.date().optional(),
    endTime: z.coerce.date().optional(),
    equipmentId: idSchema.optional(),
    status: z.string().trim().min(1).optional(),
    workerIds: z.array(idSchema).optional(),
    workerLogs: z.array(workerLogSchema).optional(),
    materials: z.array(materialSchema).optional(),
  })
  .refine(
    (task) =>
      task.startTime === undefined ||
      task.endTime === undefined ||
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

export const siteNameSchema = z.string().trim().min(1).max(80);

export const sectionNameSchema = z.string().trim().min(1).max(80);

export const relocationSchema = z.object({
  siteId: z.string().trim().min(1),
  sectionId: optionalId,
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
