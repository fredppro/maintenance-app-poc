-- Tenant isolation hardening.
-- 1. Close the remaining cross-tenant foreign-key gaps.
-- 2. Enable row-level security as a second layer behind the application's organizationId filters.

-- CreateIndex
CREATE UNIQUE INDEX "StoredFile_id_organizationId_key" ON "StoredFile"("id", "organizationId");

-- Relocations must reference equipment of the same organization.
ALTER TABLE "EquipmentRelocation" DROP CONSTRAINT "EquipmentRelocation_equipmentId_fkey";
ALTER TABLE "EquipmentRelocation"
  ADD CONSTRAINT "EquipmentRelocation_equipmentId_organizationId_fkey"
  FOREIGN KEY ("equipmentId", "organizationId") REFERENCES "Equipment"("id", "organizationId")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Equipment.imageFileId / sectionId are SET NULL single-column FKs, so the tenant match is a trigger.
CREATE FUNCTION equipment_same_tenant() RETURNS trigger AS $$
BEGIN
  IF NEW."imageFileId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "StoredFile" f WHERE f."id" = NEW."imageFileId" AND f."organizationId" = NEW."organizationId"
  ) THEN
    RAISE EXCEPTION 'Equipment image belongs to another organization' USING ERRCODE = '23503';
  END IF;
  IF NEW."sectionId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "Section" s WHERE s."id" = NEW."sectionId" AND s."organizationId" = NEW."organizationId"
  ) THEN
    RAISE EXCEPTION 'Equipment section belongs to another organization' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER equipment_same_tenant
  BEFORE INSERT OR UPDATE OF "organizationId", "imageFileId", "sectionId" ON "Equipment"
  FOR EACH ROW EXECUTE FUNCTION equipment_same_tenant();

-- Row-level security. Rows are visible only when app.org_id (set per transaction by the
-- application's tenant client) matches; an unset setting matches nothing. FORCE applies the
-- policy to table owners too. Superusers and BYPASSRLS roles are exempt, so enforcement
-- starts once the app connects as a restricted role (see docs/tenant-isolation.md).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'Site', 'Section', 'Equipment', 'EquipmentRelocation', 'StoredFile', 'MaintenanceTask',
    'MaintenanceTaskAssignment', 'Material', 'Worker', 'Vendor'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING ("organizationId" = current_setting(''app.org_id'', true)) WITH CHECK ("organizationId" = current_setting(''app.org_id'', true))',
      t
    );
  END LOOP;
END $$;
