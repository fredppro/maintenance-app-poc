CREATE TABLE "StoredFileDeletion" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAttemptAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoredFileDeletion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StoredFileDeletion_key_key" ON "StoredFileDeletion"("key");
CREATE INDEX "StoredFileDeletion_nextAttemptAt_createdAt_idx"
  ON "StoredFileDeletion"("nextAttemptAt", "createdAt");
CREATE INDEX "StoredFileDeletion_organizationId_nextAttemptAt_idx"
  ON "StoredFileDeletion"("organizationId", "nextAttemptAt");

ALTER TABLE "StoredFileDeletion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StoredFileDeletion" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "StoredFileDeletion"
  USING ("organizationId" = current_setting('app.org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.org_id', true));
