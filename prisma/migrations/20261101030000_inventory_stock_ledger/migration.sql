CREATE TYPE "InventoryMovementType" AS ENUM ('RECEIPT', 'CONSUMPTION', 'ADJUSTMENT');

CREATE TABLE "InventoryItem" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "reference" TEXT,
  "unit" "MaterialUnit" NOT NULL DEFAULT 'PC',
  "onHand" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "reorderPoint" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "vendorId" TEXT,
  "siteId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryItem_onHand_check" CHECK ("onHand" >= 0),
  CONSTRAINT "InventoryItem_reorderPoint_check" CHECK ("reorderPoint" >= 0),
  CONSTRAINT "InventoryItem_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "InventoryItem_siteId_organizationId_fkey"
    FOREIGN KEY ("siteId", "organizationId") REFERENCES "Site"("id", "organizationId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InventoryItem_vendorId_fkey"
    FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "InventoryItem_id_organizationId_key"
  ON "InventoryItem"("id", "organizationId");
CREATE UNIQUE INDEX "InventoryItem_siteId_organizationId_name_key"
  ON "InventoryItem"("siteId", "organizationId", "name");
CREATE INDEX "InventoryItem_organizationId_siteId_idx"
  ON "InventoryItem"("organizationId", "siteId");
CREATE INDEX "InventoryItem_organizationId_vendorId_idx"
  ON "InventoryItem"("organizationId", "vendorId");

CREATE FUNCTION inventory_vendor_same_tenant() RETURNS trigger AS $$
BEGIN
  IF NEW."vendorId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "Vendor" v
    WHERE v."id" = NEW."vendorId" AND v."organizationId" = NEW."organizationId"
  ) THEN
    RAISE EXCEPTION 'Inventory supplier belongs to another organization'
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER inventory_vendor_same_tenant
  BEFORE INSERT OR UPDATE OF "vendorId", "organizationId" ON "InventoryItem"
  FOR EACH ROW EXECUTE FUNCTION inventory_vendor_same_tenant();

CREATE TABLE "InventoryMovement" (
  "id" TEXT NOT NULL,
  "inventoryItemId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "taskId" TEXT,
  "type" "InventoryMovementType" NOT NULL,
  "quantity" DECIMAL(12,2) NOT NULL,
  "note" TEXT,
  "recordedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryMovement_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "InventoryMovement_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "InventoryMovement_inventoryItemId_organizationId_fkey"
    FOREIGN KEY ("inventoryItemId", "organizationId")
    REFERENCES "InventoryItem"("id", "organizationId")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "InventoryMovement_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "MaintenanceTask"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "InventoryMovement_id_organizationId_key"
  ON "InventoryMovement"("id", "organizationId");
CREATE INDEX "InventoryMovement_organizationId_inventoryItemId_createdAt_idx"
  ON "InventoryMovement"("organizationId", "inventoryItemId", "createdAt");
CREATE INDEX "InventoryMovement_organizationId_taskId_idx"
  ON "InventoryMovement"("organizationId", "taskId");

CREATE FUNCTION inventory_movement_task_same_tenant() RETURNS trigger AS $$
BEGIN
  IF NEW."taskId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "MaintenanceTask" t
    WHERE t."id" = NEW."taskId" AND t."organizationId" = NEW."organizationId"
  ) THEN
    RAISE EXCEPTION 'Inventory task belongs to another organization'
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER inventory_movement_task_same_tenant
  BEFORE INSERT OR UPDATE OF "taskId", "organizationId" ON "InventoryMovement"
  FOR EACH ROW EXECUTE FUNCTION inventory_movement_task_same_tenant();

ALTER TABLE "InventoryItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InventoryItem" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "InventoryItem"
  USING ("organizationId" = current_setting('app.org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.org_id', true));

ALTER TABLE "InventoryMovement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InventoryMovement" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON "InventoryMovement"
  FOR SELECT USING ("organizationId" = current_setting('app.org_id', true));
CREATE POLICY tenant_insert ON "InventoryMovement"
  FOR INSERT WITH CHECK ("organizationId" = current_setting('app.org_id', true));
