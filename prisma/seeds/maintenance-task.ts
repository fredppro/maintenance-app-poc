// prisma/seeds/maintenanceTasks.ts
import { PrismaClient } from '@prisma/client';

export async function seedMaintenanceTasks(prisma: PrismaClient) {
  console.log('🛠️ Seeding maintenance tasks...');

  const hydraulicPress = await prisma.equipment.findUnique({ where: { name: "Hydraulic Press A-101" } });
  const cncLathe = await prisma.equipment.findUnique({ where: { name: "CNC Lathe (Primary)" } });
  const boiler = await prisma.equipment.findUnique({ where: { name: "Industrial Boiler #4" } });

  if (!hydraulicPress || !cncLathe || !boiler) {
    console.error("❌ Erro: Equipamentos não encontrados. Corre o seed de equipamentos primeiro.");
    return;
  }

  const tasksData = [
    {
      title: "Monthly Safety Inspection",
      description: "Check all hydraulic seals and emergency stop buttons.",
      startTime: new Date(2026, 4, 10, 9, 0),
      endTime: new Date(2026, 4, 10, 11, 0),
      assignedTo: "worker1@factory.com",
      equipmentId: hydraulicPress.id,
      status: "scheduled"
    },
    {
      title: "Oil Change & Lubrication",
      description: "Standard lubrication of the primary spindle.",
      startTime: new Date(2026, 4, 12, 14, 0),
      endTime: new Date(2026, 4, 12, 15, 30),
      assignedTo: "technician@factory.com",
      equipmentId: cncLathe.id,
      status: "scheduled"
    },
    {
      title: "Pressure Valve Calibration",
      description: "Recalibrate the main safety valve for the industrial boiler.",
      startTime: new Date(2026, 4, 15, 8, 30),
      endTime: new Date(2026, 4, 15, 12, 0),
      assignedTo: "expert@maintenance.com",
      equipmentId: boiler.id,
      status: "scheduled"
    }
  ];

  for (const task of tasksData) {
    const existing = await prisma.maintenanceTask.findFirst({
      where: { title: task.title, equipmentId: task.equipmentId }
    });

    if (!existing) {
      await prisma.maintenanceTask.create({ data: task });
    }
  }

  console.log(`✅ ${tasksData.length} maintenance tasks seeded.`);
}