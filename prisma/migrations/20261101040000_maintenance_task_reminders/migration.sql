CREATE TYPE "MaintenanceReminderStatus" AS ENUM (
  'PENDING',
  'SENDING',
  'SENT',
  'FAILED',
  'CANCELLED'
);

CREATE TABLE "MaintenanceTaskReminder" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "workerId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "recipientEmail" TEXT NOT NULL,
  "locale" TEXT NOT NULL DEFAULT 'en',
  "scheduledFor" TIMESTAMP(3) NOT NULL,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL,
  "status" "MaintenanceReminderStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastAttemptAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MaintenanceTaskReminder_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MaintenanceTaskReminder_attempts_check" CHECK ("attempts" >= 0),
  CONSTRAINT "MaintenanceTaskReminder_taskId_organizationId_fkey"
    FOREIGN KEY ("taskId", "organizationId")
    REFERENCES "MaintenanceTask"("id", "organizationId")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MaintenanceTaskReminder_workerId_organizationId_fkey"
    FOREIGN KEY ("workerId", "organizationId")
    REFERENCES "Worker"("id", "organizationId")
    ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "MaintenanceTaskReminder_taskId_workerId_key"
  ON "MaintenanceTaskReminder"("taskId", "workerId");
CREATE INDEX "MaintenanceTaskReminder_organizationId_status_nextAttemptAt_idx"
  ON "MaintenanceTaskReminder"("organizationId", "status", "nextAttemptAt");
CREATE INDEX "MaintenanceTaskReminder_taskId_organizationId_idx"
  ON "MaintenanceTaskReminder"("taskId", "organizationId");

ALTER TABLE "MaintenanceTaskReminder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MaintenanceTaskReminder" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MaintenanceTaskReminder"
  USING ("organizationId" = current_setting('app.org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.org_id', true));
