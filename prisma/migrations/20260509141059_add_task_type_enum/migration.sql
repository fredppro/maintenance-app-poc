-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('PREVENTIVE', 'INSPECTION', 'CORRECTIVE');

-- AlterTable
ALTER TABLE "MaintenanceTask" ADD COLUMN     "type" "TaskType" NOT NULL DEFAULT 'PREVENTIVE';
