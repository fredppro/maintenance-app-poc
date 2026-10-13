CREATE TABLE "organization_audit_event" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_audit_event_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "organization_audit_event_organizationId_createdAt_idx"
ON "organization_audit_event"("organizationId", "createdAt");

CREATE INDEX "organization_audit_event_subjectType_subjectId_idx"
ON "organization_audit_event"("subjectType", "subjectId");

ALTER TABLE "organization_audit_event"
ADD CONSTRAINT "organization_audit_event_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
