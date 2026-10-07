import { 
  Equipment as PrismaEquipment, 
  MaintenanceTask as PrismaTask,
  MaintenanceTaskAssignment as PrismaAssignment,
  Material as PrismaMaterial
} from '../../../prisma/generated/prisma/client';
import type { Worker } from "@/features/worker/types";

export type { Worker } from "@/features/worker/types";

export type ViewMode = 'day' | 'week' | 'month' | 'year';

export type Equipment = Omit<PrismaEquipment, "organizationId" | "siteId" | "deletedAt" | "deletedById">;

export type Material = Omit<PrismaMaterial, "organizationId">;

export type MaintenanceEntry = Omit<PrismaTask, "organizationId" | "deletedAt" | "deletedById"> & {
  equipment?: Equipment;
  assignments?: (Omit<PrismaAssignment, "organizationId"> & {
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
