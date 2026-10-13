
-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'PENDING_DELETION');

-- CreateEnum
CREATE TYPE "IsolationTier" AS ENUM ('POOLED', 'DEDICATED');

-- CreateEnum
CREATE TYPE "ExportStatus" AS ENUM ('PENDING', 'RUNNING', 'READY', 'FAILED');

-- AlterTable
ALTER TABLE "Equipment" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" TEXT;

-- AlterTable
ALTER TABLE "MaintenanceTask" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" TEXT;

-- AlterTable
ALTER TABLE "Worker" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" TEXT;

-- CreateTable
CREATE TABLE "tenant_settings" (
    "organizationId" TEXT NOT NULL,
    "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE',
    "isolationTier" "IsolationTier" NOT NULL DEFAULT 'POOLED',
    "statusReason" TEXT,
    "deletionRequestedAt" TIMESTAMP(3),
    "deletionScheduledFor" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_settings_pkey" PRIMARY KEY ("organizationId")
);

-- CreateTable
CREATE TABLE "tenant_export" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "status" "ExportStatus" NOT NULL DEFAULT 'PENDING',
    "fileKey" TEXT,
    "size" INTEGER,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "tenant_export_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tenant_export_organizationId_createdAt_idx" ON "tenant_export"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_export" ADD CONSTRAINT "tenant_export_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Row-level security for the new tenant-scoped table
ALTER TABLE "tenant_export" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_export" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "tenant_export"
  USING ("organizationId" = current_setting('app.org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.org_id', true));

-- Trash lookups
CREATE INDEX "Equipment_organizationId_deletedAt_idx" ON "Equipment"("organizationId", "deletedAt");
CREATE INDEX "MaintenanceTask_organizationId_deletedAt_idx" ON "MaintenanceTask"("organizationId", "deletedAt");
CREATE INDEX "Worker_organizationId_deletedAt_idx" ON "Worker"("organizationId", "deletedAt");
