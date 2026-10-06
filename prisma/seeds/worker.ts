import { DB } from "@/lib/prisma";
import { WorkerType } from "../generated/prisma/client";

export async function seedWorkers(db: DB, organizationId: string) {
  console.log("👷 Seeding workers...");

  const vendor = await db.vendor.findFirst({
    where: { organizationId, name: "TechFix Solutions" },
  });

  const workers = [
    {
      name: "Carlos Interno",
      email: "carlos@empresa.com",
      type: WorkerType.INTERNAL,
    },
    {
      name: "Ana Técnica",
      email: "ana@empresa.com",
      type: WorkerType.INTERNAL,
    },
    {
      name: "Ricardo Externo",
      email: "ricardo@techfix.com",
      type: WorkerType.EXTERNAL,
      vendorId: vendor?.id,
    },
  ];

  for (const w of workers) {
    await db.worker.upsert({
      where: {
        organizationId_email: { organizationId, email: w.email },
      },
      update: { vendorId: w.vendorId },
      create: { ...w, organizationId },
    });
  }
}
