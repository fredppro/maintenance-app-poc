ALTER TABLE "tenant_export"
  ADD COLUMN "leaseId" TEXT,
  ADD COLUMN "heartbeatAt" TIMESTAMP(3);

UPDATE "tenant_export"
SET "heartbeatAt" = "createdAt"
WHERE "status" = 'RUNNING';

CREATE INDEX "tenant_export_organizationId_status_heartbeatAt_idx"
  ON "tenant_export"("organizationId", "status", "heartbeatAt");
