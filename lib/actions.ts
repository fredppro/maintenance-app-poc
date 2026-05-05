'use server'

import prisma from './prisma'
import { revalidatePath } from 'next/cache'

// Equipment Actions
export async function getEquipment() {
  return await prisma.equipment.findMany({
    orderBy: { name: 'asc' },
  })
}

export async function addEquipment(data: { name: string; category?: string }) {
  const equipment = await prisma.equipment.create({
    data,
  })
  revalidatePath('/')
  return equipment
}

export async function deleteEquipment(id: string) {
  await prisma.equipment.delete({
    where: { id },
  })
  revalidatePath('/')
}

// Maintenance Task Actions
export async function getTasks() {
  return await prisma.maintenanceTask.findMany({
    include: {
      equipment: true,
    },
  })
}

export async function createTask(data: {
  title: string
  description?: string
  startTime: Date
  endTime: Date
  assignedTo: string
  equipmentId: string
  status?: string
}) {
  const task = await prisma.maintenanceTask.create({
    data,
  })
  revalidatePath('/')
  return task
}

export async function updateTask(
  id: string,
  data: Partial<{
    title: string
    description: string
    startTime: Date
    endTime: Date
    assignedTo: string
    equipmentId: string
    status: string
  }>
) {
  const task = await prisma.maintenanceTask.update({
    where: { id },
    data,
  })
  revalidatePath('/')
  return task
}

export async function deleteTask(id: string) {
  await prisma.maintenanceTask.delete({
    where: { id },
  })
  revalidatePath('/')
}

export async function moveTask(
  taskId: string,
  newStartTime: Date,
  newEndTime: Date,
  newEquipmentId?: string
) {
  const task = await prisma.maintenanceTask.update({
    where: { id: taskId },
    data: {
      startTime: newStartTime,
      endTime: newEndTime,
      equipmentId: newEquipmentId,
    },
  })
  revalidatePath('/')
  return task
}
