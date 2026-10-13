CREATE TABLE "rateLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "lastRequest" BIGINT NOT NULL,

    CONSTRAINT "rateLimit_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "rateLimit_lastRequest_idx" ON "rateLimit"("lastRequest");

CREATE TABLE "legacy_ownership_assignment" (
    "id" TEXT NOT NULL,
    "legacyOrganizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "ticket" TEXT NOT NULL,
    "organizationNameBefore" TEXT NOT NULL,
    "organizationSlugBefore" TEXT NOT NULL,
    "siteNameBefore" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legacy_ownership_assignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "legacy_ownership_assignment_legacyOrganizationId_key"
ON "legacy_ownership_assignment"("legacyOrganizationId");

CREATE INDEX "legacy_ownership_assignment_ownerUserId_idx"
ON "legacy_ownership_assignment"("ownerUserId");
