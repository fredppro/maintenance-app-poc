CREATE TABLE "EquipmentMaintenancePoint" (
  "id" TEXT NOT NULL,
  "equipmentId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EquipmentMaintenancePoint_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EquipmentMaintenancePoint_equipmentId_organizationId_fkey"
    FOREIGN KEY ("equipmentId", "organizationId")
    REFERENCES "Equipment"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "EquipmentMaintenancePoint_id_equipmentId_organizationId_key"
  ON "EquipmentMaintenancePoint"("id", "equipmentId", "organizationId");
CREATE UNIQUE INDEX "EquipmentMaintenancePoint_equipmentId_organizationId_name_key"
  ON "EquipmentMaintenancePoint"("equipmentId", "organizationId", "name");
CREATE INDEX "EquipmentMaintenancePoint_organizationId_equipmentId_isActive_idx"
  ON "EquipmentMaintenancePoint"("organizationId", "equipmentId", "isActive");

ALTER TABLE "MaintenanceTask" ADD COLUMN "maintenancePointId" TEXT;
ALTER TABLE "MaintenanceTask"
  ADD CONSTRAINT "MaintenanceTask_maintenancePointId_fkey"
  FOREIGN KEY ("maintenancePointId")
  REFERENCES "EquipmentMaintenancePoint"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE FUNCTION task_point_same_tenant() RETURNS trigger AS $$
BEGIN
  IF NEW."maintenancePointId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "EquipmentMaintenancePoint" p
    WHERE p."id" = NEW."maintenancePointId"
      AND p."equipmentId" = NEW."equipmentId"
      AND p."organizationId" = NEW."organizationId"
  ) THEN
    RAISE EXCEPTION 'Maintenance point does not belong to this equipment and organization'
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER task_point_same_tenant
  BEFORE INSERT OR UPDATE OF "maintenancePointId", "equipmentId", "organizationId"
  ON "MaintenanceTask"
  FOR EACH ROW EXECUTE FUNCTION task_point_same_tenant();

CREATE TABLE "EquipmentPointChecklistItem" (
  "id" TEXT NOT NULL,
  "pointId" TEXT NOT NULL,
  "equipmentId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EquipmentPointChecklistItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EquipmentPointChecklistItem_pointId_equipmentId_organizationId_fkey"
    FOREIGN KEY ("pointId", "equipmentId", "organizationId")
    REFERENCES "EquipmentMaintenancePoint"("id", "equipmentId", "organizationId")
    ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "EquipmentPointChecklistItem_id_organizationId_key"
  ON "EquipmentPointChecklistItem"("id", "organizationId");
CREATE INDEX "EquipmentPointChecklistItem_organizationId_pointId_isActive_idx"
  ON "EquipmentPointChecklistItem"("organizationId", "pointId", "isActive");

CREATE TABLE "MaintenanceTaskChecklistItem" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "sourceItemId" TEXT,
  "title" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isComplete" BOOLEAN NOT NULL DEFAULT false,
  "completedAt" TIMESTAMP(3),
  "completedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MaintenanceTaskChecklistItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MaintenanceTaskChecklistItem_taskId_organizationId_fkey"
    FOREIGN KEY ("taskId", "organizationId")
    REFERENCES "MaintenanceTask"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "MaintenanceTaskChecklistItem_id_organizationId_key"
  ON "MaintenanceTaskChecklistItem"("id", "organizationId");
CREATE INDEX "MaintenanceTaskChecklistItem_organizationId_taskId_sortOrder_idx"
  ON "MaintenanceTaskChecklistItem"("organizationId", "taskId", "sortOrder");

CREATE TABLE "EquipmentOperatingHourReading" (
  "id" TEXT NOT NULL,
  "equipmentId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "reading" DECIMAL(12,2) NOT NULL,
  "measuredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "note" TEXT,
  "recordedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EquipmentOperatingHourReading_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EquipmentOperatingHourReading_reading_check" CHECK ("reading" >= 0),
  CONSTRAINT "EquipmentOperatingHourReading_equipmentId_organizationId_fkey"
    FOREIGN KEY ("equipmentId", "organizationId")
    REFERENCES "Equipment"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "EquipmentOperatingHourReading_id_organizationId_key"
  ON "EquipmentOperatingHourReading"("id", "organizationId");
CREATE INDEX "EquipmentOperatingHourReading_organizationId_equipmentId_measuredAt_idx"
  ON "EquipmentOperatingHourReading"("organizationId", "equipmentId", "measuredAt");

ALTER TABLE "EquipmentMaintenancePoint" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EquipmentMaintenancePoint" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "EquipmentMaintenancePoint"
  USING ("organizationId" = current_setting('app.org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.org_id', true));

ALTER TABLE "EquipmentPointChecklistItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EquipmentPointChecklistItem" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "EquipmentPointChecklistItem"
  USING ("organizationId" = current_setting('app.org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.org_id', true));

ALTER TABLE "MaintenanceTaskChecklistItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MaintenanceTaskChecklistItem" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MaintenanceTaskChecklistItem"
  USING ("organizationId" = current_setting('app.org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.org_id', true));

ALTER TABLE "EquipmentOperatingHourReading" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EquipmentOperatingHourReading" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "EquipmentOperatingHourReading"
  FOR SELECT USING ("organizationId" = current_setting('app.org_id', true));
CREATE POLICY tenant_insert ON "EquipmentOperatingHourReading"
  FOR INSERT WITH CHECK ("organizationId" = current_setting('app.org_id', true));
