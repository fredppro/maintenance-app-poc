-- DropForeignKey
ALTER TABLE "MaintenanceTask" DROP CONSTRAINT "MaintenanceTask_equipmentId_fkey";

-- DropForeignKey
ALTER TABLE "MaintenanceTaskAssignment" DROP CONSTRAINT "MaintenanceTaskAssignment_taskId_fkey";

-- DropForeignKey
ALTER TABLE "MaintenanceTaskAssignment" DROP CONSTRAINT "MaintenanceTaskAssignment_workerId_fkey";

-- DropForeignKey
ALTER TABLE "Material" DROP CONSTRAINT "Material_taskId_fkey";

-- DropForeignKey
ALTER TABLE "Worker" DROP CONSTRAINT "Worker_vendorId_fkey";

-- DropIndex
DROP INDEX "Equipment_name_key";

-- DropIndex
DROP INDEX "Vendor_name_key";

-- DropIndex
DROP INDEX "Worker_email_key";

-- AlterTable
ALTER TABLE "Equipment" ADD COLUMN     "organizationId" TEXT,
ADD COLUMN     "siteId" TEXT;

-- AlterTable
ALTER TABLE "MaintenanceTask" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "MaintenanceTaskAssignment" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "Material" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "Worker" ADD COLUMN     "organizationId" TEXT;

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,
    "activeOrganizationId" TEXT,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "metadata" TEXT,

    CONSTRAINT "organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Site" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inviterId" TEXT NOT NULL,

    CONSTRAINT "invitation_pkey" PRIMARY KEY ("id")
);

-- Existing single-tenant data is preserved in an unclaimed organization.
-- No user is granted access implicitly during a migration.
INSERT INTO "organization" ("id", "name", "slug", "createdAt", "metadata")
SELECT
    'org_legacy_migration',
    'Legacy workspace',
    'legacy-workspace',
    CURRENT_TIMESTAMP,
    '{"migration":"20261007000000_add_organizations_and_tenants"}'
WHERE EXISTS (SELECT 1 FROM "Equipment")
   OR EXISTS (SELECT 1 FROM "MaintenanceTask")
   OR EXISTS (SELECT 1 FROM "Worker")
   OR EXISTS (SELECT 1 FROM "Vendor")
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "Site" ("id", "name", "organizationId")
SELECT 'site_legacy_migration', 'Legacy site', 'org_legacy_migration'
WHERE EXISTS (
    SELECT 1 FROM "organization" WHERE "id" = 'org_legacy_migration'
)
ON CONFLICT ("id") DO NOTHING;

UPDATE "Equipment"
SET "organizationId" = 'org_legacy_migration',
    "siteId" = 'site_legacy_migration'
WHERE "organizationId" IS NULL OR "siteId" IS NULL;

UPDATE "MaintenanceTask"
SET "organizationId" = 'org_legacy_migration'
WHERE "organizationId" IS NULL;

UPDATE "MaintenanceTaskAssignment"
SET "organizationId" = task."organizationId"
FROM "MaintenanceTask" AS task
WHERE "MaintenanceTaskAssignment"."taskId" = task."id"
  AND "MaintenanceTaskAssignment"."organizationId" IS NULL;

UPDATE "Material"
SET "organizationId" = task."organizationId"
FROM "MaintenanceTask" AS task
WHERE "Material"."taskId" = task."id"
  AND "Material"."organizationId" IS NULL;

UPDATE "Worker"
SET "organizationId" = 'org_legacy_migration'
WHERE "organizationId" IS NULL;

UPDATE "Vendor"
SET "organizationId" = 'org_legacy_migration'
WHERE "organizationId" IS NULL;

ALTER TABLE "Equipment" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "siteId" SET NOT NULL;
ALTER TABLE "MaintenanceTask" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "MaintenanceTaskAssignment" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Material" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Vendor" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Worker" ALTER COLUMN "organizationId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "organization_slug_key" ON "organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Site_id_organizationId_key" ON "Site"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Site_organizationId_name_key" ON "Site"("organizationId", "name");

-- CreateIndex
CREATE INDEX "member_organizationId_idx" ON "member"("organizationId");

-- CreateIndex
CREATE INDEX "member_userId_idx" ON "member"("userId");

-- CreateIndex
CREATE INDEX "invitation_organizationId_idx" ON "invitation"("organizationId");

-- CreateIndex
CREATE INDEX "invitation_email_idx" ON "invitation"("email");

-- CreateIndex
CREATE INDEX "Equipment_siteId_organizationId_idx" ON "Equipment"("siteId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Equipment_id_organizationId_key" ON "Equipment"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Equipment_organizationId_name_key" ON "Equipment"("organizationId", "name");

-- CreateIndex
CREATE INDEX "MaintenanceTask_organizationId_startTime_idx" ON "MaintenanceTask"("organizationId", "startTime");

-- CreateIndex
CREATE UNIQUE INDEX "MaintenanceTask_id_organizationId_key" ON "MaintenanceTask"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_id_organizationId_key" ON "Vendor"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_organizationId_name_key" ON "Vendor"("organizationId", "name");

-- CreateIndex
CREATE INDEX "Worker_vendorId_organizationId_idx" ON "Worker"("vendorId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Worker_id_organizationId_key" ON "Worker"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Worker_organizationId_email_key" ON "Worker"("organizationId", "email");

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_siteId_organizationId_fkey" FOREIGN KEY ("siteId", "organizationId") REFERENCES "Site"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceTask" ADD CONSTRAINT "MaintenanceTask_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceTask" ADD CONSTRAINT "MaintenanceTask_equipmentId_organizationId_fkey" FOREIGN KEY ("equipmentId", "organizationId") REFERENCES "Equipment"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_taskId_organizationId_fkey" FOREIGN KEY ("taskId", "organizationId") REFERENCES "MaintenanceTask"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceTaskAssignment" ADD CONSTRAINT "MaintenanceTaskAssignment_taskId_organizationId_fkey" FOREIGN KEY ("taskId", "organizationId") REFERENCES "MaintenanceTask"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceTaskAssignment" ADD CONSTRAINT "MaintenanceTaskAssignment_workerId_organizationId_fkey" FOREIGN KEY ("workerId", "organizationId") REFERENCES "Worker"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Worker" ADD CONSTRAINT "Worker_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Worker" ADD CONSTRAINT "Worker_vendorId_organizationId_fkey" FOREIGN KEY ("vendorId", "organizationId") REFERENCES "Vendor"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Site" ADD CONSTRAINT "Site_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member" ADD CONSTRAINT "member_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member" ADD CONSTRAINT "member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
