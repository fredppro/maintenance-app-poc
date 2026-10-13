-- AlterTable: company profile and regional defaults (all optional, so existing rows stay valid)
ALTER TABLE "tenant_settings"
  ADD COLUMN "contactEmail" TEXT,
  ADD COLUMN "contactPhone" TEXT,
  ADD COLUMN "timezone" TEXT,
  ADD COLUMN "locale" TEXT,
  ADD COLUMN "logoFileId" TEXT;

-- CreateIndex
CREATE INDEX "tenant_settings_logoFileId_idx" ON "tenant_settings"("logoFileId");

-- AddForeignKey: removing the stored file clears the logo instead of failing
ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_logoFileId_fkey"
  FOREIGN KEY ("logoFileId") REFERENCES "StoredFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The logo must be a file of the same organization (same approach as equipment_same_tenant).
-- It reads StoredFile, which is row-level secured, so writes to tenant_settings that set a logo
-- must run inside the tenant client's transaction.
CREATE FUNCTION tenant_settings_same_tenant() RETURNS trigger AS $$
BEGIN
  IF NEW."logoFileId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "StoredFile" f WHERE f."id" = NEW."logoFileId" AND f."organizationId" = NEW."organizationId"
  ) THEN
    RAISE EXCEPTION 'Organization logo belongs to another organization' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tenant_settings_same_tenant
  BEFORE INSERT OR UPDATE OF "organizationId", "logoFileId" ON "tenant_settings"
  FOR EACH ROW EXECUTE FUNCTION tenant_settings_same_tenant();
