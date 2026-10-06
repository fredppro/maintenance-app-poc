import { 
  Equipment as PrismaEquipment, 
  MaintenanceTask as PrismaTask,
  MaintenanceTaskAssignment as PrismaAssignment,
  Material as PrismaMaterial
} from '../../../prisma/generated/prisma/client';
import type { Worker } from "@/features/worker/types";

export type { Worker } from "@/features/worker/types";

export type ViewMode = 'day' | 'week' | 'month' | 'year';

export type Equipment = PrismaEquipment;

export type Material = PrismaMaterial;

export type MaintenanceEntry = PrismaTask & {
  equipment?: Equipment;
  assignments?: (PrismaAssignment & {
    worker: Worker;
  })[];
  materials?: Material[];
};

export interface TimelineCell {
  date: Date;
  equipmentId: string;
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
