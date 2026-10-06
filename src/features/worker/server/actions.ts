"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { WorkerType } from "../../../../prisma/generated/prisma/enums";
import {
  createWorkerSchema,
  updateWorkerSchema,
  workerIdSchema,
} from "./schemas";
import { getTenantContext } from "@/lib/tenant-context";

async function ensureVendorBelongsToOrganization(
  vendorId: string | null | undefined,
  organizationId: string,
) {
  if (!vendorId) {
    return;
  }

  const vendor = await prisma.vendor.findFirst({
    where: { id: vendorId, organizationId },
    select: { id: true },
  });

  if (!vendor) {
    throw new Error("Vendor not found in the active organization");
  }
}

export async function getWorkers() {
  const { organizationId } = await getTenantContext("viewMaintenance");
  return await prisma.worker.findMany({
    where: { organizationId },
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
  const { organizationId } = await getTenantContext("manageWorkers");
  const input = createWorkerSchema.parse(data);
  await ensureVendorBelongsToOrganization(input.vendorId, organizationId);
  const worker = await prisma.worker.create({
    data: {
      name: input.name,
      email: input.email,
      phone: input.phone ?? null,
      type: input.type ?? WorkerType.INTERNAL,
      vendorId: input.vendorId ?? null,
      organizationId,
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
  const { organizationId } = await getTenantContext("manageWorkers");
  const workerId = workerIdSchema.parse(id);
  const input = updateWorkerSchema.parse(data);
  await ensureVendorBelongsToOrganization(input.vendorId, organizationId);
  const worker = await prisma.worker.update({
    where: { id: workerId, organizationId },
    data: input,
  });

  revalidatePath("/");
  return worker;
}

export async function deleteWorker(id: string) {
  const { organizationId } = await getTenantContext("manageWorkers");
  const workerId = workerIdSchema.parse(id);
  await prisma.worker.delete({
    where: { id: workerId, organizationId },
  });

  revalidatePath("/");
}
