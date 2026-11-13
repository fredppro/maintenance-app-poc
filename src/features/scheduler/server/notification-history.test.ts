import { describe, expect, it, vi } from "vitest";
import type { TenantDb } from "@/lib/prisma";
import {
  getTaskNotificationHistoryPage,
  TaskNotificationHistoryNotFoundError,
} from "./notification-history";

const now = new Date("2026-11-08T17:00:00.000Z");

function makeReminder(id: string, offset: number) {
  return {
    id,
    workerId: `worker-${id}`,
    notificationType: "ASSIGNMENT",
    status: "SENT",
    scheduledFor: now,
    sentAt: now,
    attempts: 1,
    lastError: null,
    createdAt: new Date(now.getTime() - offset),
    worker: { name: `Worker ${id}` },
  };
}

function createDb() {
  const taskFindFirst = vi.fn().mockResolvedValue({ id: "task-1" });
  const reminderFindMany = vi
    .fn()
    .mockResolvedValue(
      Array.from({ length: 6 }, (_, index) =>
        makeReminder(`notice-${index + 1}`, index),
      ),
    );

  const db = {
    maintenanceTask: { findFirst: taskFindFirst },
    maintenanceTaskReminder: {
      findMany: reminderFindMany,
    },
  } as unknown as TenantDb;

  return { db, taskFindFirst, reminderFindMany };
}

describe("getTaskNotificationHistoryPage", () => {
  it("authorizes the task by tenant and site, and fetches one bounded page", async () => {
    const { db, taskFindFirst, reminderFindMany } = createDb();

    const page = await getTaskNotificationHistoryPage(db, {
      taskId: "task-1",
      organizationId: "org-1",
      siteId: "site-1",
      cursor: null,
    });

    expect(taskFindFirst).toHaveBeenCalledWith({
      where: {
        id: "task-1",
        organizationId: "org-1",
        deletedAt: null,
        equipment: { is: { siteId: "site-1" } },
      },
      select: { id: true },
    });
    expect(reminderFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { taskId: "task-1", organizationId: "org-1" },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 6,
      }),
    );
    expect(page.items.map(({ id }) => id)).toEqual([
      "notice-1",
      "notice-2",
      "notice-3",
      "notice-4",
      "notice-5",
    ]);
    expect(page).toMatchObject({
      hasMore: true,
      nextCursor: `${new Date(now.getTime() - 4).toISOString()}|notice-5`,
    });
  });

  it("uses the cursor timestamp and id as a stable exclusive boundary", async () => {
    const { db, reminderFindMany } = createDb();
    reminderFindMany.mockResolvedValue([]);

    await getTaskNotificationHistoryPage(db, {
      taskId: "task-1",
      organizationId: "org-1",
      siteId: "site-1",
      cursor: { id: "notice-5", createdAt: now },
    });

    expect(reminderFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          taskId: "task-1",
          organizationId: "org-1",
          OR: [
            { createdAt: { lt: now } },
            { createdAt: now, id: { lt: "notice-5" } },
          ],
        },
      }),
    );
  });

  it("does not query notifications for a task outside the selected site", async () => {
    const { db, taskFindFirst, reminderFindMany } = createDb();
    taskFindFirst.mockResolvedValue(null);

    await expect(
      getTaskNotificationHistoryPage(db, {
        taskId: "task-1",
        organizationId: "org-1",
        siteId: "other-site",
        cursor: null,
      }),
    ).rejects.toBeInstanceOf(TaskNotificationHistoryNotFoundError);
    expect(reminderFindMany).not.toHaveBeenCalled();
  });

});
