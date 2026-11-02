import { forTenant } from "@/lib/prisma";
import { sendTransactionalEmail } from "@/features/auth/server/email";
import { MaintenanceReminderStatus } from "../../../../prisma/generated/prisma/enums";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const STALE_SENDING_MS = 15 * 60 * 1000;
const BATCH_SIZE = 100;
const SYNC_BATCH_SIZE = 100;

type ReminderDb = ReturnType<typeof forTenant>;

function retryDelay(attempt: number) {
  return Math.min(60 * 60 * 1000, 60 * 1000 * 2 ** (attempt - 1));
}

function reminderText(locale: string, title: string, equipment: string, startTime: Date) {
  const date = new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeStyle: "short",
  }).format(startTime);

  if (locale.toLowerCase().startsWith("pt")) {
    return {
      subject: `Lembrete de manutenção: ${title}`,
      text: `A tarefa de manutenção "${title}" para ${equipment} está agendada para ${date}.`,
    };
  }

  return {
    subject: `Maintenance reminder: ${title}`,
    text: `The maintenance task "${title}" for ${equipment} is scheduled for ${date}.`,
  };
}

async function syncUpcomingReminders(
  db: ReminderDb,
  organizationId: string,
  now: Date,
) {
  const settings = await db.tenantSettings.findUnique({
    where: { organizationId },
    select: { locale: true },
  });
  const locale = settings?.locale?.toLowerCase().startsWith("pt")
    ? "pt-pt"
    : "en";
  const taskWhere = {
    organizationId,
    deletedAt: null,
    status: "scheduled",
    startTime: { gt: now },
  } as const;
  let taskCursor: string | undefined;

  while (true) {
    const tasks = await db.maintenanceTask.findMany({
      where: taskWhere,
      orderBy: { id: "asc" },
      take: SYNC_BATCH_SIZE,
      ...(taskCursor ? { cursor: { id: taskCursor }, skip: 1 } : {}),
      include: {
        equipment: { select: { name: true } },
        assignments: {
          where: { worker: { deletedAt: null } },
          include: { worker: { select: { id: true, email: true } } },
        },
      },
    });
    if (tasks.length === 0) break;
    taskCursor = tasks[tasks.length - 1].id;

    const existingReminders = await db.maintenanceTaskReminder.findMany({
      where: { organizationId, taskId: { in: tasks.map((task) => task.id) } },
      select: {
        id: true,
        taskId: true,
        workerId: true,
        status: true,
        scheduledFor: true,
        recipientEmail: true,
      },
    });
    const remindersByPair = new Map(
      existingReminders.map((reminder) => [
        `${reminder.taskId}:${reminder.workerId}`,
        reminder,
      ]),
    );

    for (const task of tasks) {
      const scheduledFor = new Date(task.startTime.getTime() - DAY_MS);
      for (const { worker } of task.assignments) {
        const email = worker.email.trim();
        if (!email) continue;

        const pairKey = `${task.id}:${worker.id}`;
        const existing = remindersByPair.get(pairKey);
        if (existing?.status === MaintenanceReminderStatus.SENT) continue;

        const scheduleChanged =
          !existing ||
          existing.scheduledFor.getTime() !== scheduledFor.getTime() ||
          existing.recipientEmail !== email ||
          existing.status === MaintenanceReminderStatus.CANCELLED;
        if (!scheduleChanged) continue;
        if (existing?.status === MaintenanceReminderStatus.SENDING) continue;

        await db.maintenanceTaskReminder.upsert({
          where: { taskId_workerId: { taskId: task.id, workerId: worker.id } },
          create: {
            taskId: task.id,
            workerId: worker.id,
            organizationId,
            recipientEmail: email,
            locale,
            scheduledFor,
            nextAttemptAt: scheduledFor,
          },
          update: {
            recipientEmail: email,
            locale,
            scheduledFor,
            nextAttemptAt: scheduledFor,
            status: MaintenanceReminderStatus.PENDING,
            attempts: 0,
            lastAttemptAt: null,
            sentAt: null,
            lastError: null,
          },
        });
      }
    }
    if (tasks.length < SYNC_BATCH_SIZE) break;
  }

  let reminderCursor: string | undefined;
  let cancelled = 0;
  while (true) {
    const pendingReminders = await db.maintenanceTaskReminder.findMany({
      where: {
        organizationId,
        status: {
          in: [MaintenanceReminderStatus.PENDING, MaintenanceReminderStatus.FAILED],
        },
      },
      orderBy: { id: "asc" },
      take: SYNC_BATCH_SIZE,
      ...(reminderCursor ? { cursor: { id: reminderCursor }, skip: 1 } : {}),
      select: { id: true, taskId: true, workerId: true },
    });
    if (pendingReminders.length === 0) break;
    reminderCursor = pendingReminders[pendingReminders.length - 1].id;
    const taskIds = [...new Set(pendingReminders.map((reminder) => reminder.taskId))];
    const workerIds = [...new Set(pendingReminders.map((reminder) => reminder.workerId))];
    const activeAssignments = await db.maintenanceTaskAssignment.findMany({
      where: {
        organizationId,
        taskId: { in: taskIds },
        workerId: { in: workerIds },
        task: {
          is: {
            organizationId,
            deletedAt: null,
            status: "scheduled",
            startTime: { gt: now },
          },
        },
        worker: { is: { organizationId, deletedAt: null } },
      },
      select: {
        taskId: true,
        workerId: true,
        worker: { select: { email: true } },
      },
    });
    const activePairs = new Set(
      activeAssignments
        .filter((assignment) => assignment.worker.email.trim().length > 0)
        .map((assignment) => `${assignment.taskId}:${assignment.workerId}`),
    );
    const staleReminderIds = pendingReminders
      .filter(
        (reminder) =>
          !activePairs.has(`${reminder.taskId}:${reminder.workerId}`),
      )
      .map((reminder) => reminder.id);
    if (staleReminderIds.length > 0) {
      const result = await db.maintenanceTaskReminder.updateMany({
        where: {
          id: { in: staleReminderIds },
          organizationId,
          status: {
            in: [MaintenanceReminderStatus.PENDING, MaintenanceReminderStatus.FAILED],
          },
        },
        data: { status: MaintenanceReminderStatus.CANCELLED },
      });
      cancelled += result.count;
    }
    if (pendingReminders.length < SYNC_BATCH_SIZE) break;
  }
  return cancelled;
}

export async function dispatchMaintenanceReminders(
  organizationId: string,
  now = new Date(),
) {
  const db = forTenant(organizationId);
  let cancelled = await syncUpcomingReminders(db, organizationId, now);
  const staleBefore = new Date(now.getTime() - STALE_SENDING_MS);
  await db.maintenanceTaskReminder.updateMany({
    where: {
      organizationId,
      status: MaintenanceReminderStatus.SENDING,
      attempts: { gte: MAX_ATTEMPTS },
      lastAttemptAt: { lte: staleBefore },
    },
    data: {
      status: MaintenanceReminderStatus.FAILED,
      lastError: "Delivery outcome unknown after the final attempt",
    },
  });
  const due = await db.maintenanceTaskReminder.findMany({
    where: {
      organizationId,
      attempts: { lt: MAX_ATTEMPTS },
      OR: [
        {
          status: {
            in: [MaintenanceReminderStatus.PENDING, MaintenanceReminderStatus.FAILED],
          },
          nextAttemptAt: { lte: now },
        },
        {
          status: MaintenanceReminderStatus.SENDING,
          lastAttemptAt: { lte: staleBefore },
        },
      ],
    },
    orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
    take: BATCH_SIZE,
  });

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  for (const reminder of due) {
    const staleClaim =
      reminder.status === MaintenanceReminderStatus.SENDING;
    const claim = await db.maintenanceTaskReminder.updateMany({
      where: {
        id: reminder.id,
        status: reminder.status,
        lastAttemptAt: reminder.lastAttemptAt,
        ...(staleClaim ? { lastAttemptAt: { lte: staleBefore } } : {}),
      },
      data: {
        status: MaintenanceReminderStatus.SENDING,
        lastAttemptAt: now,
        attempts: { increment: 1 },
        lastError: null,
      },
    });
    if (claim.count === 0) {
      skipped += 1;
      continue;
    }

    const attempt = reminder.attempts + 1;
    try {
      const currentTask = await db.maintenanceTask.findFirst({
        where: {
          id: reminder.taskId,
          organizationId,
          deletedAt: null,
          status: "scheduled",
          startTime: { gt: now },
          assignments: { some: { workerId: reminder.workerId } },
        },
        select: {
          title: true,
          startTime: true,
          equipment: { select: { name: true } },
        },
      });
      if (!currentTask) {
        const result = await db.maintenanceTaskReminder.updateMany({
          where: { id: reminder.id, status: MaintenanceReminderStatus.SENDING },
          data: { status: MaintenanceReminderStatus.CANCELLED },
        });
        cancelled += result.count;
        continue;
      }

      const appUrl = process.env.BETTER_AUTH_URL;
      if (!appUrl) throw new Error("BETTER_AUTH_URL is required for reminders");
      const message = reminderText(
        reminder.locale,
        currentTask.title,
        currentTask.equipment.name,
        currentTask.startTime,
      );
      await sendTransactionalEmail({
        to: reminder.recipientEmail,
        subject: message.subject,
        text: message.text,
        url: new URL(`/${reminder.locale}`, appUrl).toString(),
        idempotencyKey: `maintenance-reminder-${reminder.id}`,
      });

      await db.maintenanceTaskReminder.updateMany({
        where: { id: reminder.id, status: MaintenanceReminderStatus.SENDING },
        data: {
          status: MaintenanceReminderStatus.SENT,
          sentAt: now,
          lastError: null,
        },
      });
      sent += 1;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown email delivery error";
      await db.maintenanceTaskReminder.updateMany({
        where: { id: reminder.id, status: MaintenanceReminderStatus.SENDING },
        data: {
          status: MaintenanceReminderStatus.FAILED,
          nextAttemptAt: new Date(now.getTime() + retryDelay(attempt)),
          lastError: errorMessage.slice(0, 500),
        },
      });
      failed += 1;
    }
  }

  return { cancelled, failed, sent, skipped };
}
