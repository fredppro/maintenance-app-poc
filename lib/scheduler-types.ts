import { 
  Equipment as PrismaEquipment, 
  MaintenanceTask as PrismaTask,
  Worker as PrismaWorker,
  MaintenanceTaskAssignment as PrismaAssignment,
  MaterialConsumed as PrismaMaterial
} from '../generated/prisma/client'

export type ViewMode = 'day' | 'week' | 'month' | 'year'

export type Equipment = PrismaEquipment

export type Worker = PrismaWorker

export type MaterialConsumed = PrismaMaterial

export type MaintenanceEntry = PrismaTask & {
  equipment?: Equipment
  assignments?: (PrismaAssignment & {
    worker: PrismaWorker
  })[]
  materials?: MaterialConsumed[]
}

export interface TimelineCell {
  date: Date
  equipmentId: string
}
