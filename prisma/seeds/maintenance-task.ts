import { PrismaClient } from "../../generated/prisma/client";

export async function seedMaintenanceTasks(prisma: PrismaClient) {
  console.log('🛠️ Seeding maintenance tasks with assignments...');

  // 1. Obter referências dos Equipamentos
  const hydraulicPress = await prisma.equipment.findUnique({ where: { name: "Hydraulic Press A-101" } });
  const cncLathe = await prisma.equipment.findUnique({ where: { name: "CNC Lathe (Primary)" } });
  const boiler = await prisma.equipment.findUnique({ where: { name: "Industrial Boiler #4" } });

  // 2. Obter referências dos Workers (baseado nos emails que definimos no seed de workers)
  const workerInterno = await prisma.worker.findUnique({ where: { email: "carlos@empresa.com" } });
  const workerExterno = await prisma.worker.findUnique({ where: { email: "ricardo@techfix.com" } });

  if (!hydraulicPress || !cncLathe || !boiler || !workerInterno || !workerExterno) {
    console.error("❌ Erro: Equipamentos ou Trabalhadores não encontrados. Verifica a ordem dos seeds.");
    return;
  }

  // 3. Definir as tarefas (repara que removi o 'assignedTo' e preparei a estrutura para assignments)
  const tasksData = [
    {
      title: "Monthly Safety Inspection",
      description: "Check all hydraulic seals and emergency stop buttons.",
      startTime: new Date(2026, 4, 10, 9, 0),
      endTime: new Date(2026, 4, 10, 11, 0),
      equipmentId: hydraulicPress.id,
      status: "scheduled",
      assignedWorkersEmails: ["carlos@empresa.com"] // Auxiliar para o loop abaixo
    },
    {
      title: "Full System Overhaul",
      description: "Complex maintenance requiring internal and external experts.",
      startTime: new Date(2026, 4, 12, 14, 0),
      endTime: new Date(2026, 4, 12, 18, 30),
      equipmentId: cncLathe.id,
      status: "scheduled",
      assignedWorkersEmails: ["carlos@empresa.com", "ricardo@techfix.com"] // Dois trabalhadores
    }
  ];

  for (const item of tasksData) {
    // Destruturamos para separar o que é do modelo Task do que é auxiliar
    const { assignedWorkersEmails, ...taskFields } = item;

    // Verificar se a tarefa já existe para evitar duplicados
    const existing = await prisma.maintenanceTask.findFirst({
      where: { title: taskFields.title, equipmentId: taskFields.equipmentId }
    });

    if (!existing) {
      await prisma.maintenanceTask.create({
        data: {
          ...taskFields,
          // Criamos a ligação na tabela Many-to-Many
          assignments: {
            create: assignedWorkersEmails.map(email => ({
              worker: { connect: { email: email } }
            }))
          }
        }
      });
      console.log(`✅ Criada tarefa: ${taskFields.title}`);
    } else {
      console.log(`⏩ Tarefa já existe: ${taskFields.title}`);
    }
  }

  console.log('✨ Seed de tarefas concluído.');
}