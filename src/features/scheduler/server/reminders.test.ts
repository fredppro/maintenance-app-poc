import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dispatchEmail: vi.fn(),
  equipmentTaskFindFirst: vi.fn(),
  reminderFindMany: vi.fn(),
  reminderFindUnique: vi.fn(),
  reminderUpdateMany: vi.fn(),
  reminderUpsert: vi.fn(),
  assignmentFindMany: vi.fn(),
  settingsFindUnique: vi.fn(),
  taskFindMany: vi.fn(),
  tenant: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  forTenant: mocks.tenant,
}));
vi.mock("@/features/auth/server/email", () => ({
  sendTransactionalEmail: mocks.dispatchEmail,
}));

import {
  MaintenanceReminderStatus,
  MaintenanceTaskNotificationType,
} from "../../../../prisma/generated/prisma/enums";
import { dispatchMaintenanceReminders } from "./reminders";

const now = new Date("2026-07-01T10:00:00.000Z");
const taskStart = new Date("2026-07-01T12:00:00.000Z");
const task = {
  id: "task-1",
  title: "Inspect pump",
  startTime: taskStart,
  equipment: { name: "Pump 1" },
  assignments: [{ worker: { id: "worker-1", email: "worker@example.test" } }],
};
const reminder = {
  id: "reminder-1",
  taskId: task.id,
  workerId: "worker-1",
  organizationId: "org-1",
  notificationType: MaintenanceTaskNotificationType.REMINDER,
  idempotencyKey: `auto:${task.id}:worker-1:REMINDER`,
  recipientEmail: "worker@example.test",
  locale: "en",
  scheduledFor: new Date(taskStart.getTime() - 24 * 60 * 60 * 1000),
  nextAttemptAt: new Date(taskStart.getTime() - 24 * 60 * 60 * 1000),
  status: MaintenanceReminderStatus.PENDING,
  attempts: 0,
  lastAttemptAt: null,
};

describe("maintenance reminder dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.settingsFindUnique.mockResolvedValue({ locale: "en" });
    mocks.taskFindMany.mockResolvedValue([]);
    mocks.reminderFindMany.mockResolvedValue([]);
    mocks.assignmentFindMany.mockResolvedValue([]);
    mocks.reminderFindUnique.mockResolvedValue(null);
    mocks.reminderUpdateMany.mockResolvedValue({ count: 1 });
    mocks.reminderUpsert.mockResolvedValue({});
    mocks.equipmentTaskFindFirst.mockResolvedValue(null);
    mocks.dispatchEmail.mockResolvedValue(undefined);
    mocks.tenant.mockReturnValue({
      tenantSettings: { findUnique: mocks.settingsFindUnique },
      maintenanceTask: {
        findMany: mocks.taskFindMany,
        findFirst: mocks.equipmentTaskFindFirst,
      },
      maintenanceTaskAssignment: { findMany: mocks.assignmentFindMany },
      maintenanceTaskReminder: {
        findMany: mocks.reminderFindMany,
        findUnique: mocks.reminderFindUnique,
        updateMany: mocks.reminderUpdateMany,
        upsert: mocks.reminderUpsert,
      },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("schedules an assignment notice immediately and a reminder one hour before short-notice tasks", async () => {
    mocks.taskFindMany.mockResolvedValue([task]);

    await dispatchMaintenanceReminders("org-1", now);

    expect(mocks.reminderUpsert).toHaveBeenCalledTimes(2);
    expect(mocks.reminderUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          idempotencyKey: `auto:${task.id}:worker-1:ASSIGNMENT`,
        },
        create: expect.objectContaining({
          notificationType: MaintenanceTaskNotificationType.ASSIGNMENT,
          scheduledFor: now,
          nextAttemptAt: now,
        }),
      }),
    );
    expect(mocks.reminderUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          idempotencyKey: `auto:${task.id}:worker-1:REMINDER`,
        },
        create: expect.objectContaining({
          notificationType: MaintenanceTaskNotificationType.REMINDER,
          scheduledFor: new Date("2026-07-01T11:00:00.000Z"),
          nextAttemptAt: new Date("2026-07-01T11:00:00.000Z"),
        }),
      }),
    );
    expect(mocks.dispatchEmail).not.toHaveBeenCalled();
  });

  it("schedules the reminder 24 hours before tasks with sufficient notice", async () => {
    const laterTask = {
      ...task,
      startTime: new Date("2026-07-03T10:00:00.000Z"),
    };
    mocks.taskFindMany.mockResolvedValue([laterTask]);

    await dispatchMaintenanceReminders("org-1", now);

    expect(mocks.reminderUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          idempotencyKey: `auto:${laterTask.id}:worker-1:REMINDER`,
        },
        create: expect.objectContaining({
          scheduledFor: new Date("2026-07-02T10:00:00.000Z"),
          nextAttemptAt: new Date("2026-07-02T10:00:00.000Z"),
        }),
      }),
    );
  });

  it("creates independent automatic notifications for every assigned worker", async () => {
    mocks.taskFindMany.mockResolvedValue([
      {
        ...task,
        assignments: [
          task.assignments[0],
          { worker: { id: "worker-2", email: "worker2@example.test" } },
        ],
      },
    ]);

    await dispatchMaintenanceReminders("org-1", now);

    expect(mocks.reminderUpsert).toHaveBeenCalledTimes(4);
    for (const workerId of ["worker-1", "worker-2"]) {
      for (const notificationType of [
        MaintenanceTaskNotificationType.ASSIGNMENT,
        MaintenanceTaskNotificationType.REMINDER,
      ]) {
        expect(mocks.reminderUpsert).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              idempotencyKey: `auto:${task.id}:${workerId}:${notificationType}`,
            },
            create: expect.objectContaining({ notificationType }),
          }),
        );
      }
    }
  });

  it("makes the reminder immediately due when the task starts within an hour", async () => {
    const soonTask = {
      ...task,
      startTime: new Date("2026-07-01T10:30:00.000Z"),
    };
    mocks.taskFindMany.mockResolvedValue([soonTask]);

    await dispatchMaintenanceReminders("org-1", now);

    expect(mocks.reminderUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          idempotencyKey: `auto:${soonTask.id}:worker-1:REMINDER`,
        },
        create: expect.objectContaining({
          scheduledFor: now,
          nextAttemptAt: now,
        }),
      }),
    );
  });

  it("sends the assignment notice immediately with a task-specific link", async () => {
    const assignmentNotice = {
      ...reminder,
      notificationType: MaintenanceTaskNotificationType.ASSIGNMENT,
      idempotencyKey: `auto:${task.id}:worker-1:ASSIGNMENT`,
      scheduledFor: now,
      nextAttemptAt: now,
    };
    mocks.taskFindMany.mockResolvedValue([task]);
    mocks.reminderFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([assignmentNotice]);
    mocks.equipmentTaskFindFirst.mockResolvedValue({
      title: task.title,
      startTime: task.startTime,
      equipment: task.equipment,
      assignments: [{ worker: { email: reminder.recipientEmail } }],
    });
    vi.stubEnv("BETTER_AUTH_URL", "https://maintenance.example.test");

    const result = await dispatchMaintenanceReminders("org-1", now);

    expect(result.sent).toBe(1);
    expect(mocks.dispatchEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: `New maintenance task: ${task.title}`,
        to: reminder.recipientEmail,
        url: `https://maintenance.example.test/en?taskId=${task.id}`,
      }),
    );
  });

  it("cancels reminders when the task is no longer scheduled with that worker", async () => {
    mocks.reminderFindMany.mockResolvedValueOnce([reminder]).mockResolvedValueOnce([]);

    const result = await dispatchMaintenanceReminders("org-1", now);

    expect(result.cancelled).toBe(1);
    expect(mocks.reminderUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: [reminder.id] },
          organizationId: "org-1",
        }),
        data: { status: MaintenanceReminderStatus.CANCELLED },
      }),
    );
    expect(mocks.reminderFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: "org-1",
          notificationType: {
            not: MaintenanceTaskNotificationType.MANUAL,
          },
        }),
      }),
    );
  });

  it("reads upcoming tasks and their existing reminders in bounded pages", async () => {
    const tasks = Array.from({ length: 100 }, (_, index) => ({
      ...task,
      id: `task-${index.toString().padStart(3, "0")}`,
      assignments: [],
    }));
    mocks.taskFindMany.mockResolvedValueOnce(tasks).mockResolvedValueOnce([]);

    await dispatchMaintenanceReminders("org-1", now);

    expect(mocks.taskFindMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        take: 100,
        orderBy: { id: "asc" },
      }),
    );
    expect(mocks.taskFindMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        take: 100,
        cursor: { id: "task-099" },
        skip: 1,
      }),
    );
    expect(mocks.reminderFindMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          organizationId: "org-1",
          taskId: { in: tasks.map(({ id }) => id) },
        },
      }),
    );
  });

  it("cancels stale reminders page by page and preserves active assignments on later pages", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      ...reminder,
      id: `reminder-${index.toString().padStart(3, "0")}`,
      taskId: index === 0 ? "active-task-1" : `stale-task-${index}`,
      workerId: index === 0 ? "active-worker-1" : `stale-worker-${index}`,
    }));
    const secondPage = [
      {
        ...reminder,
        id: "reminder-100",
        taskId: "active-task-2",
        workerId: "active-worker-2",
      },
    ];
    let reminderPage = 0;
    mocks.reminderFindMany.mockImplementation(async (args) => {
      if (!("status" in (args.where ?? {}))) return [];
      reminderPage += 1;
      return reminderPage === 1 ? firstPage : reminderPage === 2 ? secondPage : [];
    });
    mocks.assignmentFindMany
      .mockResolvedValueOnce([
        {
          taskId: "active-task-1",
          workerId: "active-worker-1",
          worker: { email: "active-1@example.test" },
        },
        {
          taskId: "active-task-2",
          workerId: "active-worker-2",
          worker: { email: "active-2@example.test" },
        },
        {
          taskId: "active-task-1",
          workerId: "active-worker-1",
          worker: { email: "active-1@example.test" },
        },
      ])
      .mockResolvedValueOnce([
        {
          taskId: "active-task-2",
          workerId: "active-worker-2",
          worker: { email: "active-2@example.test" },
        },
      ]);
    mocks.reminderUpdateMany.mockImplementation(async (args) => ({
      count: Array.isArray(args.where.id?.in) ? args.where.id.in.length : 0,
    }));

    const result = await dispatchMaintenanceReminders("org-1", now);

    expect(result.cancelled).toBe(99);
    expect(mocks.assignmentFindMany).toHaveBeenCalledTimes(2);
    expect(mocks.assignmentFindMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: "org-1",
          taskId: { in: ["active-task-2"] },
          workerId: { in: ["active-worker-2"] },
        }),
      }),
    );
    const cancellationUpdate = mocks.reminderUpdateMany.mock.calls.find(
      ([args]) => args.data.status === MaintenanceReminderStatus.CANCELLED,
    );
    expect(cancellationUpdate?.[0]).toEqual(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: firstPage.slice(1).map(({ id }) => id) },
        }),
      }),
    );
  });

  it("requests an empty page after an exact cancellation batch boundary", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      ...reminder,
      id: `reminder-${index.toString().padStart(3, "0")}`,
      taskId: `stale-task-${index}`,
      workerId: `stale-worker-${index}`,
    }));
    let cancellationPage = 0;
    mocks.reminderFindMany.mockImplementation(async (args) => {
      if (!("status" in (args.where ?? {}))) return [];
      cancellationPage += 1;
      return cancellationPage === 1 ? firstPage : [];
    });
    mocks.reminderUpdateMany.mockResolvedValue({ count: firstPage.length });

    const result = await dispatchMaintenanceReminders("org-1", now);

    expect(result.cancelled).toBe(firstPage.length);
    const cancellationCalls = mocks.reminderFindMany.mock.calls.filter(
      ([args]) => "status" in (args.where ?? {}),
    );
    expect(cancellationCalls).toHaveLength(2);
    expect(cancellationCalls[1]?.[0]).toEqual(
      expect.objectContaining({
        cursor: { id: firstPage.at(-1)?.id },
        skip: 1,
      }),
    );
    expect(mocks.assignmentFindMany).toHaveBeenCalledTimes(1);
  });

  it.skipIf(process.env.RUN_REMINDER_STRESS !== "1")(
    "keeps large-volume cancellation lookups within bounded pages",
    async () => {
      const total = 10_000;
      let reminderPages = 0;
      let maximumReminderPage = 0;
      let maximumAssignmentResults = 0;
      const activeIndices = new Set<number>();
      const parseIndex = (id: string, prefix: string) =>
        Number(id.slice(prefix.length));

      mocks.reminderFindMany.mockImplementation(async (args) => {
        if (!("status" in (args.where ?? {}))) return [];
        reminderPages += 1;
        const cursorId = args.cursor?.id as string | undefined;
        const offset = cursorId
          ? parseIndex(cursorId, "reminder-") + 1
          : 0;
        const count = Math.min(args.take as number, total - offset);
        maximumReminderPage = Math.max(maximumReminderPage, count);
        return Array.from({ length: count }, (_, index) => {
          const rowIndex = offset + index;
          return {
            ...reminder,
            id: `reminder-${String(rowIndex).padStart(5, "0")}`,
            taskId: `task-${rowIndex}`,
            workerId: `worker-${rowIndex}`,
          };
        });
      });
      mocks.assignmentFindMany.mockImplementation(async (args) => {
        const taskIds = args.where.taskId.in as string[];
        const matches = taskIds
          .map((taskId) => parseIndex(taskId, "task-"))
          .filter((index) => index % 997 === 0)
          .map((index) => ({
            taskId: `task-${index}`,
            workerId: `worker-${index}`,
            worker: { email: `worker-${index}@example.test` },
          }));
        const duplicated = matches.length > 0 ? [matches[0]] : [];
        const results = [...matches, ...duplicated];
        maximumAssignmentResults = Math.max(maximumAssignmentResults, results.length);
        for (const match of matches) activeIndices.add(parseIndex(match.taskId, "task-"));
        return results;
      });
      mocks.reminderUpdateMany.mockImplementation(async (args) => ({
        count: Array.isArray(args.where.id?.in) ? args.where.id.in.length : 0,
      }));

      const baselineRss = process.memoryUsage.rss();
      let peakRss = baselineRss;
      const sampler = setInterval(() => {
        peakRss = Math.max(peakRss, process.memoryUsage.rss());
      }, 10);
      let result: Awaited<ReturnType<typeof dispatchMaintenanceReminders>>;
      try {
        result = await dispatchMaintenanceReminders("org-1", now);
      } finally {
        clearInterval(sampler);
      }
      peakRss = Math.max(peakRss, process.memoryUsage.rss());
      console.info(
        `[reminder-stress] assignments=${total} baselineRssBytes=${baselineRss} peakRssBytes=${peakRss} increaseBytes=${peakRss - baselineRss}`,
      );

      expect(reminderPages).toBe(Math.ceil(total / 100) + 1);
      expect(maximumReminderPage).toBeLessThanOrEqual(100);
      expect(maximumAssignmentResults).toBeLessThanOrEqual(2);
      expect(result.cancelled).toBe(total - activeIndices.size);
      expect(mocks.assignmentFindMany).toHaveBeenCalledTimes(
        Math.ceil(total / 100),
      );
    },
    60_000,
  );

  it("records delivery failures and schedules bounded retries", async () => {
    mocks.taskFindMany.mockResolvedValue([task]);
    mocks.reminderFindMany
      .mockResolvedValueOnce([reminder])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([reminder]);
    mocks.equipmentTaskFindFirst.mockResolvedValue({
      title: task.title,
      startTime: task.startTime,
      equipment: task.equipment,
      assignments: [{ worker: { email: reminder.recipientEmail } }],
    });
    mocks.dispatchEmail.mockRejectedValue(new Error("provider unavailable"));
    vi.stubEnv("BETTER_AUTH_URL", "https://maintenance.example.test");

    const result = await dispatchMaintenanceReminders("org-1", now);

    expect(result.failed).toBe(1);
    expect(mocks.reminderUpdateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          id: reminder.id,
          organizationId: "org-1",
          status: MaintenanceReminderStatus.SENDING,
        },
        data: expect.objectContaining({
          status: MaintenanceReminderStatus.FAILED,
          nextAttemptAt: new Date("2026-07-01T10:01:00.000Z"),
          lastError: "provider unavailable",
        }),
      }),
    );
  });

  it("uses a stable Resend idempotency key when delivery succeeds", async () => {
    mocks.settingsFindUnique.mockResolvedValue({
      locale: "en",
      timezone: "America/Los_Angeles",
    });
    mocks.taskFindMany.mockResolvedValue([task]);
    mocks.reminderFindMany
      .mockResolvedValueOnce([reminder])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([reminder]);
    mocks.equipmentTaskFindFirst.mockResolvedValue({
      title: task.title,
      startTime: task.startTime,
      equipment: task.equipment,
      assignments: [{ worker: { email: reminder.recipientEmail } }],
    });
    vi.stubEnv("BETTER_AUTH_URL", "https://maintenance.example.test");

    const result = await dispatchMaintenanceReminders("org-1", now);

    expect(result.sent).toBe(1);
    expect(mocks.dispatchEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: `maintenance-notification-${reminder.id}`,
        to: reminder.recipientEmail,
        url: `https://maintenance.example.test/en?taskId=${task.id}`,
        urlLabel: "Open maintenance task",
        text: expect.stringContaining("July 1, 2026 at 5:00 AM"),
      }),
    );
  });
});
