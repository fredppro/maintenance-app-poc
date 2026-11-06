ALTER TABLE "StoredFile"
ADD COLUMN "unattachedUntil" TIMESTAMP(3);

CREATE INDEX "StoredFile_unattachedUntil_idx"
ON "StoredFile"("unattachedUntil");

UPDATE "StoredFile" AS file
SET "unattachedUntil" = file."createdAt" + INTERVAL '7 days'
WHERE NOT EXISTS (
  SELECT 1
  FROM "Equipment" AS equipment
  WHERE equipment."imageFileId" = file."id"
)
AND NOT EXISTS (
  SELECT 1
  FROM "tenant_settings" AS settings
  WHERE settings."logoFileId" = file."id"
);
