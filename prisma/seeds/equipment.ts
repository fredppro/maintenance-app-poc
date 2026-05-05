import { PrismaClient } from '@prisma/client';

export async function seedEquipments(prisma: PrismaClient) {
  const equipmentData = [
    { name: "Hydraulic Press A-101", category: "Heavy Machinery" },
    { name: "CNC Lathe (Primary)", category: "Precision Tools" },
    { name: "Industrial Boiler #4", category: "Infrastructure" },
    { name: "Conveyor Belt - Main Line", category: "Logistics" },
    { name: "HVAC Unit (South Wing)", category: "Facilities" }
  ];

  console.log('🚀 Seeding equipment...');

  for (const item of equipmentData) {
    await prisma.equipment.upsert({
      where: { name: item.name },
      update: {},
      create: item,
    });
  }

  console.log(`✅ ${equipmentData.length} equipments seeded.`);
}