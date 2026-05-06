import { PrismaClient, WorkerType } from '@prisma/client';

export async function seedWorkers(prisma: PrismaClient) {
  console.log('👷 Seeding workers...');

  const vendor = await prisma.vendor.findFirst({ where: { name: "TechFix Solutions" } });

  const workers = [
    { name: "Carlos Interno", email: "carlos@empresa.com", type: WorkerType.INTERNAL },
    { name: "Ana Técnica", email: "ana@empresa.com", type: WorkerType.INTERNAL },
    { 
      name: "Ricardo Externo", 
      email: "ricardo@techfix.com", 
      type: WorkerType.EXTERNAL,
      vendorId: vendor?.id 
    },
  ];

  for (const w of workers) {
    await prisma.worker.upsert({
      where: { email: w.email },
      update: { vendorId: w.vendorId },
      create: w,
    });
  }
}