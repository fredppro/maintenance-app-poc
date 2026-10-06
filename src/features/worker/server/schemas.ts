import { z } from "zod";
import { WorkerType } from "../../../../prisma/generated/prisma/enums";

const optionalPhone = z.string().trim().nullable().optional();
const optionalVendorId = z.string().trim().min(1).nullable().optional();

export const createWorkerSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().email(),
  phone: optionalPhone,
  type: z.nativeEnum(WorkerType).optional(),
  vendorId: optionalVendorId,
});

export const updateWorkerSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    email: z.string().trim().email().optional(),
    phone: optionalPhone,
    type: z.nativeEnum(WorkerType).optional(),
    vendorId: optionalVendorId,
  })
  .refine((worker) => Object.keys(worker).length > 0, {
    message: "At least one worker field must be provided",
  });

export const workerIdSchema = z.string().trim().min(1);
