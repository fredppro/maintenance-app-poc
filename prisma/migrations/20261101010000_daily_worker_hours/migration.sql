CREATE TABLE "MaintenanceTaskDailyHours" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "workerId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "workDate" DATE NOT NULL,
  "hours" DECIMAL(4,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MaintenanceTaskDailyHours_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MaintenanceTaskDailyHours_hours_check" CHECK ("hours" > 0 AND "hours" <= 24)
);

CREATE UNIQUE INDEX "MaintenanceTaskDailyHours_taskId_workerId_workDate_key"
  ON "MaintenanceTaskDailyHours"("taskId", "workerId", "workDate");
CREATE INDEX "MaintenanceTaskDailyHours_organizationId_workDate_idx"
  ON "MaintenanceTaskDailyHours"("organizationId", "workDate");
CREATE INDEX "MaintenanceTaskDailyHours_taskId_workerId_idx"
  ON "MaintenanceTaskDailyHours"("taskId", "workerId");

ALTER TABLE "MaintenanceTaskDailyHours"
  ADD CONSTRAINT "MaintenanceTaskDailyHours_taskId_organizationId_fkey"
  FOREIGN KEY ("taskId", "organizationId")
  REFERENCES "MaintenanceTask"("id", "organizationId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MaintenanceTaskDailyHours"
  ADD CONSTRAINT "MaintenanceTaskDailyHours_workerId_organizationId_fkey"
  FOREIGN KEY ("workerId", "organizationId")
  REFERENCES "Worker"("id", "organizationId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MaintenanceTaskDailyHours" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MaintenanceTaskDailyHours" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MaintenanceTaskDailyHours"
  USING ("organizationId" = current_setting('app.org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.org_id', true));
