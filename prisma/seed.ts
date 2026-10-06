// prisma/seed.ts
import "dotenv/config";
import prisma from "../src/lib/prisma";
import { seedEquipments } from "./seeds/equipment";
import { seedMaintenanceTasks } from "./seeds/maintenance-task";
import { seedWorkers } from "./seeds/worker";
import { seedVendors } from "./seeds/vendor";

async function main() {
  console.log("🌱 Starting database seeding...");
  
  try {
    const adminEmail = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
    if (!adminEmail) {
      throw new Error(
        "Set SEED_ADMIN_EMAIL to an organization owner's email before seeding.",
      );
    }

    const membership = await prisma.member.findFirst({
      where: {
        role: "owner",
        user: { email: adminEmail },
      },
      orderBy: { createdAt: "asc" },
    });
    if (!membership) {
      throw new Error(
        `No organization owner account found for ${adminEmail}. Sign up and create a workspace first.`,
      );
    }

    const site = await prisma.site.findFirst({
      where: { organizationId: membership.organizationId },
      orderBy: { createdAt: "asc" },
    });
    if (!site) {
      throw new Error(
        `The organization for ${adminEmail} has no site. Complete workspace setup first.`,
      );
    }

    await seedEquipments(prisma, membership.organizationId, site.id);
    await seedVendors(prisma, membership.organizationId);
    await seedWorkers(prisma, membership.organizationId);
    await seedMaintenanceTasks(prisma, membership.organizationId);
    
    console.log('✨ Global seed finished successfully.');
  } catch (error) {
    console.error('❌ Error during seeding:', error);
    process.exit(1);
  }
  
  console.log("✅ Seeding finished.");
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  });