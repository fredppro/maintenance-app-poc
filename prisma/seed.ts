// prisma/seed.ts
import "dotenv/config";
import prisma from "../lib/prisma.js";
import { seedEquipments } from "./seeds/equipment";
import { seedMaintenanceTasks } from "./seeds/maintenance-task.js";

async function main() {
  console.log("🌱 Starting database seeding...");
  
  try {
    await seedEquipments(prisma);
    await seedMaintenanceTasks(prisma);
    
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