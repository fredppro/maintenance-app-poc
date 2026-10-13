import { DB } from "@/lib/prisma";

export async function seedVendors(db: DB, organizationId: string) {
  console.log('🏢 Seeding vendors...');
  
  const vendors = [
    { name: "TechFix Solutions", contact: "João Silva", email: "contact@techfix.com" },
    { name: "Industrial Care Lda", contact: "Maria Santos", email: "geral@indcare.pt" }
  ];

  for (const v of vendors) {
    await db.vendor.upsert({
      where: {
        organizationId_name: { organizationId, name: v.name },
      },
      update: {},
      create: { ...v, organizationId },
    });
  }
}