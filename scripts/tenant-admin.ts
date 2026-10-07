// Operator tool for cross-tenant lifecycle changes. Run with the owner connection:
//   pnpm tenant:admin suspend <orgId> [reason]
//   pnpm tenant:admin reactivate <orgId>
//   pnpm tenant:admin purge-due          (permanently deletes organizations past their grace period)
import "../prisma/seed-env";
import { pathToFileURL } from "node:url";
import { recordAuditEvent } from "../src/lib/audit";
import prisma from "../src/lib/prisma";
import { getStorage } from "../src/lib/storage";

const OPERATOR = "operator";

export async function setStatus(organizationId: string, status: "ACTIVE" | "SUSPENDED", reason?: string) {
  const organization = await prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } });
  if (!organization) throw new Error(`Organization ${organizationId} not found`);
  const data = {
    status,
    statusReason: status === "SUSPENDED" ? (reason ?? null) : null,
    deletionRequestedAt: null,
    deletionScheduledFor: null,
  };
  await prisma.tenantSettings.upsert({ where: { organizationId }, create: { organizationId, ...data }, update: data });
  await recordAuditEvent({
    organizationId,
    actorUserId: OPERATOR,
    action: status === "SUSPENDED" ? "organization.suspended" : "organization.reactivated",
    subjectType: "organization",
    subjectId: organizationId,
    details: reason ? { reason } : undefined,
  });
}

/** Deletes the organization (rows cascade) and every object stored for it. */
export async function purgeOrganization(organizationId: string) {
  const storage = getStorage();
  const [files, exports] = await Promise.all([
    prisma.storedFile.findMany({ where: { organizationId }, select: { key: true } }),
    prisma.tenantExport.findMany({ where: { organizationId, fileKey: { not: null } }, select: { fileKey: true } }),
  ]);
  const keys = [...files.map((f) => f.key), ...exports.flatMap((e) => (e.fileKey ? [e.fileKey] : []))];
  await prisma.organization.delete({ where: { id: organizationId } });
  for (const key of keys) await storage.delete(key).catch((error) => console.error("purge: storage delete failed", key, error));
  return keys.length;
}

export async function purgeDueOrganizations(now = new Date()) {
  const due = await prisma.tenantSettings.findMany({
    where: { status: "PENDING_DELETION", deletionScheduledFor: { lte: now } },
    select: { organizationId: true },
  });
  for (const { organizationId } of due) {
    const objects = await purgeOrganization(organizationId);
    console.log(`purged ${organizationId} (${objects} stored objects)`);
  }
  return due.length;
}

async function main() {
  const [command, organizationId, ...rest] = process.argv.slice(2);
  if (command === "suspend" && organizationId) await setStatus(organizationId, "SUSPENDED", rest.join(" ") || undefined);
  else if (command === "reactivate" && organizationId) await setStatus(organizationId, "ACTIVE");
  else if (command === "purge-due") console.log(`${await purgeDueOrganizations()} organization(s) purged`);
  else {
    console.error("Usage: tenant-admin suspend <orgId> [reason] | reactivate <orgId> | purge-due");
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().finally(() => prisma.$disconnect());
}
