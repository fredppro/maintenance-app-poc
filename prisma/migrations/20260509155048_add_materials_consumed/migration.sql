-- CreateTable
CREATE TABLE "MaterialConsumed" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "reference" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL,
    "taskId" TEXT NOT NULL,

    CONSTRAINT "MaterialConsumed_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "MaterialConsumed" ADD CONSTRAINT "MaterialConsumed_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "MaintenanceTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
