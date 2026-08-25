"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { WorkerType } from "../../../../prisma/generated/prisma/enums";

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
  const worker = await prisma.worker.create({
    data: {
      name: data.name,
      email: data.email,
      phone: data.phone ?? null,
      type: data.type ?? WorkerType.INTERNAL,
      vendorId: data.vendorId ?? null,
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
  const worker = await prisma.worker.update({
    where: { id },
    data,
  });

  revalidatePath("/");
  return worker;
}

export async function deleteWorker(id: string) {
  await prisma.worker.delete({
    where: { id },
  });

  revalidatePath("/");
}
