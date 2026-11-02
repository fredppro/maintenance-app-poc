import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dispatchEmail: vi.fn(),
  equipmentTaskFindFirst: vi.fn(),
  reminderFindMany: vi.fn(),
  reminderFindUnique: vi.fn(),
  reminderUpdateMany: vi.fn(),
  reminderUpsert: vi.fn(),
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

import { MaintenanceReminderStatus } from "../../../../prisma/generated/prisma/enums";
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

  it("schedules a reminder 24 hours before the task, immediately due for near-term tasks", async () => {
    mocks.taskFindMany.mockResolvedValue([task]);

    await dispatchMaintenanceReminders("org-1", now);

    expect(mocks.reminderUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          scheduledFor: new Date("2026-06-30T12:00:00.000Z"),
          nextAttemptAt: new Date("2026-06-30T12:00:00.000Z"),
        }),
      }),
    );
    expect(mocks.dispatchEmail).not.toHaveBeenCalled();
  });

  it("cancels reminders when the task is no longer scheduled with that worker", async () => {
    mocks.reminderFindMany.mockResolvedValueOnce([reminder]).mockResolvedValueOnce([]);

    const result = await dispatchMaintenanceReminders("org-1", now);

    expect(result.cancelled).toBe(1);
    expect(mocks.reminderUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: reminder.id }),
        data: { status: MaintenanceReminderStatus.CANCELLED },
      }),
    );
  });

  it("records delivery failures and schedules bounded retries", async () => {
    mocks.taskFindMany.mockResolvedValue([task]);
    mocks.reminderFindUnique.mockResolvedValue({
      id: reminder.id,
      status: MaintenanceReminderStatus.PENDING,
      scheduledFor: reminder.scheduledFor,
      recipientEmail: reminder.recipientEmail,
    });
    mocks.reminderFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([reminder]);
    mocks.equipmentTaskFindFirst.mockResolvedValue({
      title: task.title,
      startTime: task.startTime,
      equipment: task.equipment,
    });
    mocks.dispatchEmail.mockRejectedValue(new Error("provider unavailable"));
    vi.stubEnv("BETTER_AUTH_URL", "https://maintenance.example.test");

    const result = await dispatchMaintenanceReminders("org-1", now);

    expect(result.failed).toBe(1);
    expect(mocks.reminderUpdateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: reminder.id, status: MaintenanceReminderStatus.SENDING },
        data: expect.objectContaining({
          status: MaintenanceReminderStatus.FAILED,
          nextAttemptAt: new Date("2026-07-01T10:01:00.000Z"),
          lastError: "provider unavailable",
        }),
      }),
    );
  });

  it("uses a stable Resend idempotency key when delivery succeeds", async () => {
    mocks.taskFindMany.mockResolvedValue([task]);
    mocks.reminderFindUnique.mockResolvedValue({
      id: reminder.id,
      status: MaintenanceReminderStatus.PENDING,
      scheduledFor: reminder.scheduledFor,
      recipientEmail: reminder.recipientEmail,
    });
    mocks.reminderFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([reminder]);
    mocks.equipmentTaskFindFirst.mockResolvedValue({
      title: task.title,
      startTime: task.startTime,
      equipment: task.equipment,
    });
    vi.stubEnv("BETTER_AUTH_URL", "https://maintenance.example.test");

    const result = await dispatchMaintenanceReminders("org-1", now);

    expect(result.sent).toBe(1);
    expect(mocks.dispatchEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: `maintenance-reminder-${reminder.id}`,
        to: reminder.recipientEmail,
      }),
    );
  });
});
