"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { WorkerType } from "../../../../prisma/generated/prisma/enums";
import {
  createWorkerSchema,
  updateWorkerSchema,
  workerIdSchema,
} from "./schemas";

export async function getWorkers() {
  return await prisma.worker.findMany({
    orderBy: { name: "asc" },
  });
}

export async function createWorker(data: {
  name: string;
  email: string;
  phone?: string | null;
  type?: WorkerType;
  vendorId?: string | null;
}) {
  const input = createWorkerSchema.parse(data);
  const worker = await prisma.worker.create({
    data: {
      name: input.name,
      email: input.email,
      phone: input.phone ?? null,
      type: input.type ?? WorkerType.INTERNAL,
      vendorId: input.vendorId ?? null,
    },
  });

  revalidatePath("/");
  return worker;
}

export async function updateWorker(
  id: string,
  data: Partial<{
    name: string;
    email: string;
    phone?: string | null;
    type: WorkerType;
    vendorId?: string | null;
  }>,
) {
  const workerId = workerIdSchema.parse(id);
  const input = updateWorkerSchema.parse(data);
  const worker = await prisma.worker.update({
    where: { id: workerId },
    data: input,
  });

  revalidatePath("/");
  return worker;
}

export async function deleteWorker(id: string) {
  const workerId = workerIdSchema.parse(id);
  await prisma.worker.delete({
    where: { id: workerId },
  });

  revalidatePath("/");
}
