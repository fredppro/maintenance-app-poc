import { 
  Equipment as PrismaEquipment, 
  MaintenanceTask as PrismaTask,
  Worker as PrismaWorker,
  MaintenanceTaskAssignment as PrismaAssignment
} from '../generated/prisma/client'

export type ViewMode = 'day' | 'week' | 'month' | 'year'

export type Equipment = PrismaEquipment

export type Worker = PrismaWorker

export type MaintenanceEntry = PrismaTask & {
  equipment?: Equipment
  assignments?: (PrismaAssignment & {
    worker: PrismaWorker
  })[]
}

export interface TimelineCell {
  date: Date
  equipmentId: string
}
