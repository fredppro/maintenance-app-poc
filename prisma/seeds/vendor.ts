import { DB } from "@/lib/prisma";
import { PrismaClient } from "../generated/prisma/client";

export async function seedVendors(db: DB) {
  console.log('🏢 Seeding vendors...');
  
  const vendors = [
    { name: "TechFix Solutions", contact: "João Silva", email: "contact@techfix.com" },
    { name: "Industrial Care Lda", contact: "Maria Santos", email: "geral@indcare.pt" }
  ];

  for (const v of vendors) {
    await db.vendor.upsert({
      where: { name: v.name },
      update: {},
      create: v,
    });
  }
}