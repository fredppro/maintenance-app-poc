CREATE TYPE "MaintenanceTaskNotificationType" AS ENUM (
  'ASSIGNMENT',
  'REMINDER',
  'MANUAL'
);

ALTER TABLE "MaintenanceTaskReminder"
  ADD COLUMN "notificationType" "MaintenanceTaskNotificationType" NOT NULL DEFAULT 'REMINDER',
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "requestedById" TEXT;

UPDATE "MaintenanceTaskReminder"
SET "idempotencyKey" = 'auto:' || "taskId" || ':' || "workerId" || ':REMINDER';

ALTER TABLE "MaintenanceTaskReminder"
  ALTER COLUMN "idempotencyKey" SET NOT NULL;

DROP INDEX "MaintenanceTaskReminder_taskId_workerId_key";

CREATE UNIQUE INDEX "MaintenanceTaskReminder_idempotencyKey_key"
  ON "MaintenanceTaskReminder"("idempotencyKey");
CREATE INDEX "MaintenanceTaskReminder_taskId_organizationId_notificationType_scheduledFor_idx"
  ON "MaintenanceTaskReminder"("taskId", "organizationId", "notificationType", "scheduledFor");
