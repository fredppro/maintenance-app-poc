// Operator tool for cross-tenant lifecycle changes. Run with the owner connection:
//   pnpm ops:tenant create "<company>" <owner-email> "<first site>" [--locale pt-pt] [--no-email] [--allow-duplicate-name]
//   pnpm ops:tenant list
//   pnpm ops:tenant suspend <orgId> [reason]
//   pnpm ops:tenant reactivate <orgId>
//   pnpm ops:tenant purge-due          (permanently deletes organizations past their grace period)
import "../../prisma/seed-env";
import { pathToFileURL } from "node:url";
import { sendTransactionalEmail } from "../../src/features/auth/server/email";
import {
  listOrganizations,
  ownerInvitationUrl,
  provisionOrganization,
} from "../../src/features/organization/server/provisioning";
import { recordAuditEvent } from "../../src/lib/audit";
import prisma from "../../src/lib/prisma";
import { getStorage } from "../../src/lib/storage";

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

export function parseCreateArgs(args: string[]) {
  const positional: string[] = [];
  let locale = "en";
  let sendEmail = true;
  let allowDuplicateName = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--locale") locale = args[++i] ?? "";
    else if (arg === "--no-email") sendEmail = false;
    else if (arg === "--allow-duplicate-name") allowDuplicateName = true;
    else if (arg.startsWith("--")) throw new Error(`Unknown option ${arg}`);
    else positional.push(arg);
  }
  const [name, ownerEmail, siteName, ...extra] = positional;
  if (!name || !ownerEmail || !siteName || extra.length > 0) {
    throw new Error('Usage: tenant-admin create "<company>" <owner-email> "<first site>" [options]');
  }
  return { name, ownerEmail, siteName, locale, sendEmail, allowDuplicateName };
}

async function createOrganization(args: string[]) {
  const { locale, sendEmail, allowDuplicateName, ...input } = parseCreateArgs(args);
  const baseUrl = process.env.BETTER_AUTH_URL;
  if (!baseUrl) throw new Error("BETTER_AUTH_URL is required to build the owner invitation link");
  ownerInvitationUrl("validate", baseUrl, locale); // reject a bad locale or URL before creating anything

  const result = await provisionOrganization(input, { allowDuplicateName });
  const url = ownerInvitationUrl(result.invitationId, baseUrl, locale);
  console.log(`created ${input.name} (${result.organizationId}) with site "${input.siteName}"`);
  console.log(`owner invitation for ${input.ownerEmail.toLowerCase()} (expires ${result.expiresAt.toISOString().slice(0, 10)}):`);
  console.log(url);

  if (!sendEmail) return;
  try {
    await sendTransactionalEmail({
      to: input.ownerEmail.toLowerCase(),
      subject: `Invitation to ${input.name}`,
      text: `You have been invited to set up ${input.name} as its owner.`,
      url,
    });
    console.log("invitation email sent");
  } catch (error) {
    console.error(`invitation email NOT sent (${error instanceof Error ? error.message : error}); share the link above`);
    process.exitCode = 1;
  }
}

async function main() {
  const [command, organizationId, ...rest] = process.argv.slice(2);
  if (command === "create") await createOrganization(process.argv.slice(3));
  else if (command === "list") console.table(await listOrganizations());
  else if (command === "suspend" && organizationId) await setStatus(organizationId, "SUSPENDED", rest.join(" ") || undefined);
  else if (command === "reactivate" && organizationId) await setStatus(organizationId, "ACTIVE");
  else if (command === "purge-due") console.log(`${await purgeDueOrganizations()} organization(s) purged`);
  else {
    console.error('Usage: tenant-admin create "<company>" <owner-email> "<first site>" [options] | list | suspend <orgId> [reason] | reactivate <orgId> | purge-due');
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().finally(() => prisma.$disconnect());
}
