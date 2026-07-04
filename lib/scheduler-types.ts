import { 
  Equipment as PrismaEquipment, 
  MaintenanceTask as PrismaTask,
  Worker as PrismaWorker,
  MaintenanceTaskAssignment as PrismaAssignment,
  Material as PrismaMaterial
} from '../generated/prisma/client'

export type ViewMode = 'day' | 'week' | 'month' | 'year'

export type Equipment = PrismaEquipment

export type Worker = PrismaWorker

export type Material = PrismaMaterial

export type MaintenanceEntry = PrismaTask & {
  equipment?: Equipment
  assignments?: (PrismaAssignment & {
    worker: PrismaWorker
  })[]
  materials?: Material[]
}

export interface TimelineCell {
  date: Date
  equipmentId: string
}

export interface WorkerLogPayload {
  workerId: string;
  startTime: Date;
  endTime: Date;
}

export type UpdateEntryPayload = Partial<
  MaintenanceEntry & {
    workerIds: string[];
    workerLogs: WorkerLogPayload[];
  }
>;
