ALTER TABLE "MaterialConsumed" RENAME TO "Material";
ALTER TABLE "Material" RENAME CONSTRAINT "MaterialConsumed_pkey" TO "Material_pkey";
ALTER TABLE "Material" RENAME CONSTRAINT "MaterialConsumed_taskId_fkey" TO "Material_taskId_fkey";