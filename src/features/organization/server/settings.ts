"use server";

import { revalidatePath } from "next/cache";
import { deleteStoredFile } from "@/features/files/server/files";
import { recordAuditEvent } from "@/lib/audit";
import { logEvent } from "@/lib/logger";
import prisma, { type TenantDb } from "@/lib/prisma";
import { getOrganizationContext } from "@/lib/tenant-context";
import {
  firstErrorPerField,
  organizationSettingsSchema,
  toSettingsView,
  type OrganizationSettingsField,
  type OrganizationSettingsView,
  type UpdateOrganizationSettingsResult,
} from "../shared/organization-settings";

const SETTINGS_SELECT = {
  contactEmail: true,
  contactPhone: true,
  timezone: true,
  locale: true,
  logoFileId: true,
} as const;

/** Saved values of the active organization. Owners and admins only. */
export async function getOrganizationSettings(): Promise<OrganizationSettingsView> {
  const { organizationId } = await getOrganizationContext("manageOrganization");
  const [organization, settings] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true } }),
    prisma.tenantSettings.findUnique({ where: { organizationId }, select: SETTINGS_SELECT }),
  ]);
  return toSettingsView(organization, settings);
}

/**
 * Saves the active organization's profile and regional defaults. The organization comes from the
 * session, never from the input, and only these fields are written: the name (never the slug), the
 * contact and regional values and the logo. Lifecycle status and membership are untouched.
 */
export async function updateOrganizationSettings(
  input: unknown,
): Promise<UpdateOrganizationSettingsResult> {
  const { organizationId, userId, db } = await getOrganizationContext("manageOrganization");

  const parsed = organizationSettingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: firstErrorPerField(parsed.error) };
  const next = parsed.data;

  const [organization, settings] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true } }),
    prisma.tenantSettings.findUnique({ where: { organizationId }, select: SETTINGS_SELECT }),
  ]);
  const current = toSettingsView(organization, settings);

  const changed = (
    [
      ["name", next.name !== current.name],
      ["contactEmail", next.contactEmail !== (settings?.contactEmail ?? null)],
      ["contactPhone", next.contactPhone !== (settings?.contactPhone ?? null)],
      ["timezone", next.timezone !== current.timezone || !settings?.timezone],
      ["locale", next.locale !== current.locale || !settings?.locale],
      ["logoFileId", next.logoFileId !== current.logoFileId],
    ] as [OrganizationSettingsField, boolean][]
  )
    .filter(([, isChanged]) => isChanged)
    .map(([field]) => field);
  if (changed.length === 0) return { ok: true };

  // A logo must be an uploaded file of this organization that no equipment uses.
  if (next.logoFileId && next.logoFileId !== current.logoFileId) {
    const file = await db.storedFile.findFirst({
      where: { id: next.logoFileId, organizationId, equipment: { none: {} } },
      select: { id: true },
    });
    if (!file) return { ok: false, errors: { logoFileId: "invalid" } };
  }

  const values = {
    contactEmail: next.contactEmail,
    contactPhone: next.contactPhone,
    timezone: next.timezone,
    locale: next.locale,
    logoFileId: next.logoFileId,
  };
  // Inside the tenant transaction so the same-tenant logo trigger can read the stored file.
  await db.transaction(async (tx) => {
    await tx.organization.update({ where: { id: organizationId }, data: { name: next.name } });
    await tx.tenantSettings.upsert({
      where: { organizationId },
      create: { organizationId, ...values },
      update: values,
    });
  });

  if (current.logoFileId && current.logoFileId !== next.logoFileId) {
    await removeReplacedLogo(db, current.logoFileId, organizationId);
  }
  await recordAuditEvent({
    organizationId,
    actorUserId: userId,
    action: "organization.settings_updated",
    subjectType: "organization",
    subjectId: organizationId,
    details: { fields: changed },
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

async function removeReplacedLogo(db: TenantDb, fileId: string, organizationId: string) {
  try {
    const unused = await db.storedFile.findFirst({
      where: { id: fileId, organizationId, equipment: { none: {} } },
      select: { id: true },
    });
    if (unused) await deleteStoredFile(db, fileId, organizationId);
  } catch (error) {
    // The settings are already saved; a leftover file is housekeeping, not a failed save.
    logEvent("error", "organization.logo_cleanup_failed", { fileId, error });
  }
}
