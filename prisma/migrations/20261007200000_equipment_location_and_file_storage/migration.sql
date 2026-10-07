-- AlterTable
ALTER TABLE "Equipment" DROP COLUMN "image",
ADD COLUMN     "imageFileId" TEXT,
ADD COLUMN     "sectionId" TEXT;

-- CreateTable
CREATE TABLE "StoredFile" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoredFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Section" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Section_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentRelocation" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "fromSiteName" TEXT,
    "fromSectionName" TEXT,
    "toSiteName" TEXT NOT NULL,
    "toSectionName" TEXT,
    "movedById" TEXT,
    "movedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EquipmentRelocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoredFile_key_key" ON "StoredFile"("key");

-- CreateIndex
CREATE INDEX "StoredFile_organizationId_idx" ON "StoredFile"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Section_id_organizationId_key" ON "Section"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Section_siteId_name_key" ON "Section"("siteId", "name");

-- CreateIndex
CREATE INDEX "EquipmentRelocation_equipmentId_movedAt_idx" ON "EquipmentRelocation"("equipmentId", "movedAt");

-- CreateIndex
CREATE INDEX "EquipmentRelocation_organizationId_idx" ON "EquipmentRelocation"("organizationId");

-- CreateIndex
CREATE INDEX "Equipment_sectionId_idx" ON "Equipment"("sectionId");

-- CreateIndex
CREATE INDEX "Equipment_imageFileId_idx" ON "Equipment"("imageFileId");

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_imageFileId_fkey" FOREIGN KEY ("imageFileId") REFERENCES "StoredFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoredFile" ADD CONSTRAINT "StoredFile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_siteId_organizationId_fkey" FOREIGN KEY ("siteId", "organizationId") REFERENCES "Site"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentRelocation" ADD CONSTRAINT "EquipmentRelocation_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

