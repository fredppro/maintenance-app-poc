import { DB } from "@/lib/prisma";
import { PrismaClient } from "../generated/prisma/client";

export async function seedEquipments(db: DB) {
  const equipmentData = [
    { name: "Hydraulic Press A-101", category: "Heavy Machinery" },
    { name: "CNC Lathe (Primary)", category: "Precision Tools" },
    { name: "Industrial Boiler #4", category: "Infrastructure" },
    { name: "Conveyor Belt - Main Line", category: "Logistics" },
    { name: "HVAC Unit (South Wing)", category: "Facilities" },
  ];

  console.log("🚀 Seeding equipment...");

  for (const item of equipmentData) {
    await db.equipment.upsert({
      where: { name: item.name },
      update: {},
      create: item,
    });
  }

  console.log(`✅ ${equipmentData.length} equipments seeded.`);
}
