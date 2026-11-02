import { 
  Equipment as PrismaEquipment, 
  MaintenanceTask as PrismaTask,
  MaintenanceTaskAssignment as PrismaAssignment,
  MaintenanceTaskDailyHours as PrismaDailyHours,
  MaintenanceTaskChecklistItem as PrismaTaskChecklistItem,
  Material as PrismaMaterial
} from '../../../prisma/generated/prisma/client';
import type { MaintenanceReminderStatus } from "../../../prisma/generated/prisma/enums";
import type { Worker } from "@/features/worker/types";

export type { Worker } from "@/features/worker/types";

export type ViewMode = 'day' | 'week' | 'month' | 'year';

export type Equipment = Omit<PrismaEquipment, "organizationId" | "siteId" | "deletedAt" | "deletedById">;

export type Material = Omit<PrismaMaterial, "organizationId">;

export type DailyHourEntry = {
  id?: string;
  workerId: string;
  workDate: Date | string;
  hours: number | string | PrismaDailyHours["hours"];
  createdAt?: Date;
};

export type TaskChecklistItem = Omit<
  PrismaTaskChecklistItem,
  "organizationId" | "taskId"
>;

export type TaskReminder = {
  id: string;
  workerId: string;
  status: MaintenanceReminderStatus;
  scheduledFor: Date | string;
  sentAt: Date | string | null;
  attempts: number;
  worker: { name: string };
};

export type MaintenanceEntry = Omit<PrismaTask, "organizationId" | "deletedAt" | "deletedById"> & {
  equipment?: Equipment;
  assignments?: (Omit<PrismaAssignment, "organizationId"> & {
    worker: Worker;
  })[];
  dailyHours?: DailyHourEntry[];
  materials?: Material[];
  checklistItems?: TaskChecklistItem[];
  reminders?: TaskReminder[];
};

export interface TimelineCell {
  date: Date;
  equipmentId: string;
}

export interface WorkerLogPayload {
  workerId: string;
  startTime: Date | null;
  endTime: Date | null;
}

export type UpdateEntryPayload = Omit<
  Partial<MaintenanceEntry>,
  "dailyHours" | "checklistItems"
> & {
  workerIds?: string[];
  workerLogs?: WorkerLogPayload[];
  dailyHours?: { workerId: string; workDate: string; hours: number }[];
};
