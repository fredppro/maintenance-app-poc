import { DB } from "@/lib/prisma";

export async function seedEquipments(
  db: DB,
  organizationId: string,
  siteId: string,
) {
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
      where: {
        organizationId_name: { organizationId, name: item.name },
      },
      update: {},
      create: { ...item, organizationId, siteId },
    });
  }

  console.log(`✅ ${equipmentData.length} equipments seeded.`);
}
