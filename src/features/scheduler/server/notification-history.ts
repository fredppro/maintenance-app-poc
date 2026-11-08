import type { TenantDb } from "@/lib/prisma";
import type { TaskReminder } from "../types";

export const NOTIFICATION_HISTORY_PAGE_SIZE = 5;

export class TaskNotificationHistoryNotFoundError extends Error {
  constructor() {
    super("Maintenance task not found");
    this.name = "TaskNotificationHistoryNotFoundError";
  }
}

export async function getTaskNotificationHistoryPage(
  db: TenantDb,
  {
    taskId,
    organizationId,
    siteId,
    cursor,
  }: {
    taskId: string;
    organizationId: string;
    siteId: string;
    cursor: { id: string; createdAt: Date } | null;
  },
): Promise<{
  items: TaskReminder[];
  hasMore: boolean;
  nextCursor: string | null;
}> {
  const task = await db.maintenanceTask.findFirst({
    where: {
      id: taskId,
      organizationId,
      deletedAt: null,
      equipment: { is: { siteId } },
    },
    select: { id: true },
  });

  if (!task) {
    throw new TaskNotificationHistoryNotFoundError();
  }

  const baseWhere = { taskId, organizationId };
  const reminders = await db.maintenanceTaskReminder.findMany({
    where: {
      ...baseWhere,
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              {
                createdAt: cursor.createdAt,
                id: { lt: cursor.id },
              },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: NOTIFICATION_HISTORY_PAGE_SIZE + 1,
    select: {
      id: true,
      workerId: true,
      notificationType: true,
      status: true,
      scheduledFor: true,
      sentAt: true,
      attempts: true,
      lastError: true,
      createdAt: true,
      worker: { select: { name: true } },
    },
  });

  const hasMore = reminders.length > NOTIFICATION_HISTORY_PAGE_SIZE;
  const items = reminders.slice(0, NOTIFICATION_HISTORY_PAGE_SIZE);
  const lastItem = items.at(-1);

  return {
    items,
    hasMore,
    nextCursor:
      hasMore && lastItem
        ? `${lastItem.createdAt.toISOString()}|${lastItem.id}`
        : null,
  };
}
