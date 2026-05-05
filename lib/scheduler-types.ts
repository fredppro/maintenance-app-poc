import { Equipment as PrismaEquipment, MaintenanceTask as PrismaTask } from '@prisma/client'

export type ViewMode = 'day' | 'week' | 'month' | 'year'

export type Equipment = PrismaEquipment

export type MaintenanceEntry = PrismaTask

export interface TimelineCell {
  date: Date
  equipmentId: string
}
