import { z } from "zod";
import { sendTransactionalEmail } from "@/features/auth/server/email";
import { DEFAULT_ORGANIZATION_TIMEZONE } from "@/features/organization/shared/organization-settings";
import { forTenant } from "@/lib/prisma";
import {
  MaintenanceReminderStatus,
  MaintenanceTaskNotificationType,
} from "../../../../prisma/generated/prisma/enums";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const STALE_SENDING_MS = 15 * 60 * 1000;
const BATCH_SIZE = 100;
const SYNC_BATCH_SIZE = 100;

type ReminderDb = ReturnType<typeof forTenant>;
type NotificationType = MaintenanceTaskNotificationType;
type NotificationRow = {
  id: string;
  taskId: string;
  workerId: string;
  organizationId: string;
  notificationType: NotificationType;
  idempotencyKey: string;
  recipientEmail: string;
  locale: string;
  scheduledFor: Date;
  nextAttemptAt: Date;
  status: MaintenanceReminderStatus;
  attempts: number;
  lastAttemptAt: Date | null;
};

function retryDelay(attempt: number) {
  return Math.min(60 * 60 * 1000, 60 * 1000 * 2 ** (attempt - 1));
}

function automaticIdempotencyKey(
  taskId: string,
  workerId: string,
  notificationType: NotificationType,
) {
  return `auto:${taskId}:${workerId}:${notificationType}`;
}

function emailIsValid(email: string) {
  return z.string().email().safeParse(email).success;
}

function reminderSchedule(startTime: Date, now: Date) {
  const oneHourBefore = startTime.getTime() - HOUR_MS;
  const twentyFourHoursBefore = startTime.getTime() - DAY_MS;
  return new Date(
    twentyFourHoursBefore >= now.getTime()
      ? twentyFourHoursBefore
      : oneHourBefore > now.getTime()
        ? oneHourBefore
        : now.getTime(),
  );
}

function notificationText(
  locale: string,
  type: NotificationType,
  title: string,
  equipment: string,
  startTime: Date,
  timeZone: string,
) {
  const date = new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeStyle: "short",
    timeZone,
  }).format(startTime);
  const isPortuguese = locale.toLowerCase().startsWith("pt");

  if (type === MaintenanceTaskNotificationType.ASSIGNMENT) {
    return isPortuguese
      ? {
          subject: `Nova tarefa de manutenção: ${title}`,
          text: `Você foi atribuído à tarefa de manutenção "${title}" para ${equipment}, agendada para ${date}.`,
        }
      : {
          subject: `New maintenance task: ${title}`,
          text: `You have been assigned to the maintenance task "${title}" for ${equipment}, scheduled for ${date}.`,
        };
  }

  if (type === MaintenanceTaskNotificationType.MANUAL) {
    return isPortuguese
      ? {
          subject: `Atualização de manutenção: ${title}`,
          text: `A tarefa de manutenção "${title}" para ${equipment} está agendada para ${date}.`,
        }
      : {
          subject: `Maintenance update: ${title}`,
          text: `The maintenance task "${title}" for ${equipment} is scheduled for ${date}.`,
        };
  }

  return isPortuguese
    ? {
        subject: `Lembrete de manutenção: ${title}`,
        text: `A tarefa de manutenção "${title}" para ${equipment} está agendada para ${date}.`,
      }
    : {
        subject: `Maintenance reminder: ${title}`,
        text: `The maintenance task "${title}" for ${equipment} is scheduled for ${date}.`,
      };
}

async function syncUpcomingNotifications(
  db: ReminderDb,
  organizationId: string,
  now: Date,
  taskId?: string,
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
    ...(taskId ? { id: taskId } : {}),
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

    const existingNotifications = await db.maintenanceTaskReminder.findMany({
      where: { organizationId, taskId: { in: tasks.map((task) => task.id) } },
      select: {
        id: true,
        taskId: true,
        workerId: true,
        notificationType: true,
        idempotencyKey: true,
        status: true,
        scheduledFor: true,
        recipientEmail: true,
        locale: true,
      },
    });
    const notificationsByKey = new Map(
      existingNotifications.map((notification) => [
        notification.idempotencyKey,
        notification,
      ]),
    );

    for (const task of tasks) {
      for (const { worker } of task.assignments) {
        const email = worker.email.trim();
        if (!emailIsValid(email)) continue;

        for (const notificationType of [
          MaintenanceTaskNotificationType.ASSIGNMENT,
          MaintenanceTaskNotificationType.REMINDER,
        ]) {
          const idempotencyKey = automaticIdempotencyKey(
            task.id,
            worker.id,
            notificationType,
          );
          const scheduledFor =
            notificationType === MaintenanceTaskNotificationType.ASSIGNMENT
              ? now
              : reminderSchedule(task.startTime, now);
          const existing = notificationsByKey.get(idempotencyKey);
          if (existing?.status === MaintenanceReminderStatus.SENT) continue;
          if (existing?.status === MaintenanceReminderStatus.SENDING) continue;

          const scheduleChanged =
            notificationType === MaintenanceTaskNotificationType.REMINDER &&
            existing?.scheduledFor.getTime() !== scheduledFor.getTime();
          const needsSync =
            !existing ||
            scheduleChanged ||
            existing.recipientEmail !== email ||
            existing.locale !== locale ||
            existing.status === MaintenanceReminderStatus.CANCELLED;
          if (!needsSync) continue;

          await db.maintenanceTaskReminder.upsert({
            where: { idempotencyKey },
            create: {
              taskId: task.id,
              workerId: worker.id,
              organizationId,
              notificationType,
              idempotencyKey,
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
    }
    if (tasks.length < SYNC_BATCH_SIZE) break;
  }

  let notificationCursor: string | undefined;
  let cancelled = 0;
  while (true) {
    const pendingNotifications = await db.maintenanceTaskReminder.findMany({
      where: {
        organizationId,
        ...(taskId ? { taskId } : {}),
        notificationType: {
          not: MaintenanceTaskNotificationType.MANUAL,
        },
        status: {
          in: [MaintenanceReminderStatus.PENDING, MaintenanceReminderStatus.FAILED],
        },
      },
      orderBy: { id: "asc" },
      take: SYNC_BATCH_SIZE,
      ...(notificationCursor
        ? { cursor: { id: notificationCursor }, skip: 1 }
        : {}),
      select: { id: true, taskId: true, workerId: true },
    });
    if (pendingNotifications.length === 0) break;
    notificationCursor = pendingNotifications[pendingNotifications.length - 1].id;
    const taskIds = [...new Set(pendingNotifications.map(({ taskId }) => taskId))];
    const workerIds = [
      ...new Set(pendingNotifications.map(({ workerId }) => workerId)),
    ];
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
        .filter((assignment) => emailIsValid(assignment.worker.email.trim()))
        .map(({ taskId, workerId }) => `${taskId}:${workerId}`),
    );
    const staleNotificationIds = pendingNotifications
      .filter(
        ({ taskId, workerId }) => !activePairs.has(`${taskId}:${workerId}`),
      )
      .map(({ id }) => id);
    if (staleNotificationIds.length > 0) {
      const result = await db.maintenanceTaskReminder.updateMany({
        where: {
          id: { in: staleNotificationIds },
          organizationId,
          status: {
            in: [MaintenanceReminderStatus.PENDING, MaintenanceReminderStatus.FAILED],
          },
        },
        data: { status: MaintenanceReminderStatus.CANCELLED },
      });
      cancelled += result.count;
    }
    if (pendingNotifications.length < SYNC_BATCH_SIZE) break;
  }
  return cancelled;
}

async function dispatchNotification(
  db: ReminderDb,
  organizationId: string,
  notification: NotificationRow,
  now: Date,
) {
  if (
    notification.status !== MaintenanceReminderStatus.PENDING &&
    notification.status !== MaintenanceReminderStatus.FAILED &&
    notification.status !== MaintenanceReminderStatus.SENDING
  ) {
    return "skipped" as const;
  }
  if (
    notification.status !== MaintenanceReminderStatus.SENDING &&
    notification.nextAttemptAt > now
  ) {
    return "skipped" as const;
  }
  if (notification.attempts >= MAX_ATTEMPTS) return "skipped" as const;

  const staleClaim =
    notification.status === MaintenanceReminderStatus.SENDING;
  const staleBefore = new Date(now.getTime() - STALE_SENDING_MS);
  const claim = await db.maintenanceTaskReminder.updateMany({
    where: {
      id: notification.id,
      organizationId,
      status: notification.status,
      lastAttemptAt: notification.lastAttemptAt,
      ...(staleClaim ? { lastAttemptAt: { lte: staleBefore } } : {}),
    },
    data: {
      status: MaintenanceReminderStatus.SENDING,
      lastAttemptAt: now,
      attempts: { increment: 1 },
      lastError: null,
    },
  });
  if (claim.count === 0) return "skipped" as const;

  const attempt = notification.attempts + 1;
  try {
    const isManual =
      notification.notificationType === MaintenanceTaskNotificationType.MANUAL;
    const currentTask = await db.maintenanceTask.findFirst({
      where: {
        id: notification.taskId,
        organizationId,
        deletedAt: null,
        assignments: { some: { workerId: notification.workerId } },
        ...(isManual
          ? {}
          : { status: "scheduled", startTime: { gt: now } }),
      },
      select: {
        title: true,
        startTime: true,
        equipment: { select: { name: true } },
        assignments: {
          where: { workerId: notification.workerId },
          select: { worker: { select: { email: true } } },
        },
      },
    });
    const currentEmail = currentTask?.assignments[0]?.worker.email.trim();
    if (!currentTask || !currentEmail) {
      const result = await db.maintenanceTaskReminder.updateMany({
        where: {
          id: notification.id,
          organizationId,
          status: MaintenanceReminderStatus.SENDING,
        },
        data: {
          status: MaintenanceReminderStatus.CANCELLED,
          lastError: "Task or worker assignment is no longer available",
        },
      });
      return result.count > 0 ? ("cancelled" as const) : ("skipped" as const);
    }
    if (!emailIsValid(currentEmail)) {
      const result = await db.maintenanceTaskReminder.updateMany({
        where: {
          id: notification.id,
          organizationId,
          status: MaintenanceReminderStatus.SENDING,
        },
        data: {
          status: MaintenanceReminderStatus.CANCELLED,
          lastError: "The assigned worker does not have a valid email address",
        },
      });
      return result.count > 0 ? ("cancelled" as const) : ("skipped" as const);
    }

    const settings = await db.tenantSettings.findUnique({
      where: { organizationId },
      select: { locale: true, timezone: true },
    });
    const timeZone = settings?.timezone || DEFAULT_ORGANIZATION_TIMEZONE;
    const locale = settings?.locale?.toLowerCase().startsWith("pt")
      ? "pt-pt"
      : "en";
    const appUrl = process.env.BETTER_AUTH_URL;
    if (!appUrl) throw new Error("BETTER_AUTH_URL is required for notifications");
    const message = notificationText(
      locale,
      notification.notificationType,
      currentTask.title,
      currentTask.equipment.name,
      currentTask.startTime,
      timeZone,
    );
    const taskUrl = new URL(
      `/${locale}?taskId=${encodeURIComponent(notification.taskId)}`,
      appUrl,
    ).toString();
    await sendTransactionalEmail({
      to: currentEmail,
      subject: message.subject,
      text: message.text,
      url: taskUrl,
      urlLabel: locale.toLowerCase().startsWith("pt")
        ? "Abrir tarefa de manutenção"
        : "Open maintenance task",
      idempotencyKey: `maintenance-notification-${notification.id}`,
    });

    await db.maintenanceTaskReminder.updateMany({
      where: {
        id: notification.id,
        organizationId,
        status: MaintenanceReminderStatus.SENDING,
      },
      data: {
        status: MaintenanceReminderStatus.SENT,
        sentAt: now,
        recipientEmail: currentEmail,
        lastError: null,
      },
    });
    return "sent" as const;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown email delivery error";
    await db.maintenanceTaskReminder.updateMany({
      where: {
        id: notification.id,
        organizationId,
        status: MaintenanceReminderStatus.SENDING,
      },
      data: {
        status: MaintenanceReminderStatus.FAILED,
        nextAttemptAt: new Date(now.getTime() + retryDelay(attempt)),
        lastError: errorMessage.slice(0, 500),
      },
    });
    return "failed" as const;
  }
}

export async function dispatchMaintenanceReminderById(
  organizationId: string,
  notificationId: string,
  now = new Date(),
) {
  const db = forTenant(organizationId);
  const notification = await db.maintenanceTaskReminder.findFirst({
    where: { id: notificationId, organizationId },
  });
  if (!notification) return "missing" as const;
  return dispatchNotification(db, organizationId, notification, now);
}

export async function dispatchMaintenanceReminders(
  organizationId: string,
  now = new Date(),
  taskId?: string,
) {
  const db = forTenant(organizationId);
  let cancelled = await syncUpcomingNotifications(
    db,
    organizationId,
    now,
    taskId,
  );
  const staleBefore = new Date(now.getTime() - STALE_SENDING_MS);
  await db.maintenanceTaskReminder.updateMany({
    where: {
      organizationId,
      ...(taskId ? { taskId } : {}),
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
      ...(taskId ? { taskId } : {}),
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
  for (const notification of due) {
    const result = await dispatchNotification(
      db,
      organizationId,
      notification,
      now,
    );
    if (result === "sent") sent += 1;
    else if (result === "failed") failed += 1;
    else if (result === "cancelled") cancelled += 1;
    else skipped += 1;
  }

  return { cancelled, failed, sent, skipped };
}
