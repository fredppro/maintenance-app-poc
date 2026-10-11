import { randomUUID } from "node:crypto";
import { z } from "zod";
import { localeKeys } from "@/i18n/config";
import { recordAuditEvent } from "@/lib/audit";
import prisma, { forTenant } from "@/lib/prisma";
import { organizationSlug } from "../shared/slug";

export const OWNER_INVITATION_DAYS = 7;
export const OPERATOR_ACTOR = "operator";

// Invitation.inviterId is a required foreign key to User. This account has no credentials
// (no `account` row) and an undeliverable address, so it can be referenced but never signed in to.
const OPERATOR_USER_EMAIL = "platform-operator@system.invalid";

const provisionSchema = z.object({
  name: z.string().trim().min(2).max(100),
  ownerEmail: z.string().trim().toLowerCase().email().max(320),
  siteName: z.string().trim().min(2).max(100),
});

export type ProvisionInput = z.input<typeof provisionSchema>;

async function ensureOperatorUser() {
  return prisma.user.upsert({
    where: { email: OPERATOR_USER_EMAIL },
    create: {
      id: randomUUID(),
      name: "Platform operator",
      email: OPERATOR_USER_EMAIL,
      emailVerified: true,
    },
    update: {},
    select: { id: true },
  });
}

/**
 * Creates a customer: the organization, its first site and a pending owner invitation.
 * The owner accepts the invitation (signing up first if needed), which makes them the owner.
 */
export async function provisionOrganization(
  input: ProvisionInput,
  options: { allowDuplicateName?: boolean; now?: Date } = {},
) {
  const { name, ownerEmail, siteName } = provisionSchema.parse(input);
  const now = options.now ?? new Date();

  if (!options.allowDuplicateName) {
    const existing = await prisma.organization.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
      select: { id: true },
    });
    if (existing) {
      throw new Error(
        `An organization named "${name}" already exists (${existing.id}); pass --allow-duplicate-name to create another`,
      );
    }
  }

  const inviter = await ensureOperatorUser();
  const organizationId = randomUUID();
  const invitationId = randomUUID();
  const expiresAt = new Date(now.getTime() + OWNER_INVITATION_DAYS * 86_400_000);

  await prisma.$transaction([
    prisma.organization.create({
      data: { id: organizationId, name, slug: organizationSlug(name), createdAt: now },
    }),
    prisma.invitation.create({
      data: {
        id: invitationId,
        organizationId,
        email: ownerEmail,
        role: "owner",
        status: "pending",
        expiresAt,
        inviterId: inviter.id,
      },
    }),
  ]);

  let siteId: string;
  try {
    const site = await forTenant(organizationId).site.create({
      data: { name: siteName, organizationId },
      select: { id: true },
    });
    siteId = site.id;
  } catch (error) {
    // Sites are row-level secured and cannot join the transaction above; do not leave a half-built customer.
    await prisma.organization.delete({ where: { id: organizationId } });
    throw error;
  }

  await recordAuditEvent({
    organizationId,
    actorUserId: OPERATOR_ACTOR,
    action: "organization.provisioned",
    subjectType: "organization",
    subjectId: organizationId,
    details: { siteId },
  });

  return { organizationId, siteId, invitationId, expiresAt };
}

export function ownerInvitationUrl(
  invitationId: string,
  baseUrl: string,
  locale: string = "en",
) {
  if (!(localeKeys as readonly string[]).includes(locale)) {
    throw new Error(`Unsupported locale "${locale}"; use one of ${localeKeys.join(", ")}`);
  }
  const url = new URL(`/${locale}/accept-invitation`, baseUrl);
  url.searchParams.set("id", invitationId);
  return url.toString();
}

const dateOnly = (value: Date | string | null | undefined) =>
  value ? new Date(value).toISOString().slice(0, 10) : "never";

/** One row per customer, for operators: who owns it, how big it is, and when anyone last signed in. */
export async function listOrganizations(now = new Date()) {
  const [organizations, owners, invitations, signIns] = await Promise.all([
    prisma.organization.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        createdAt: true,
        settings: { select: { status: true } },
        _count: { select: { members: true, sites: true } },
      },
    }),
    prisma.member.findMany({
      where: { role: "owner" },
      select: { organizationId: true, user: { select: { email: true } } },
    }),
    prisma.invitation.findMany({
      where: { role: "owner", status: "pending", expiresAt: { gt: now } },
      select: { organizationId: true, email: true },
    }),
    prisma.organizationAuditEvent.groupBy({
      by: ["organizationId"],
      where: { action: "auth.sign_in" },
      _max: { createdAt: true },
    }),
  ]);

  const ownerByOrganization = new Map(owners.map((o) => [o.organizationId, o.user.email]));
  const invitedByOrganization = new Map(invitations.map((i) => [i.organizationId, i.email]));
  const lastSignIn = new Map(signIns.map((s) => [s.organizationId, s._max.createdAt]));

  // Equipment is row-level secured, so each organization is counted in its own tenant scope. The explicit
  // filter matters too: the owner role this runs as can bypass RLS (superuser locally, neon_superuser on Neon).
  return Promise.all(
    organizations.map(async (organization) => {
      const owner = ownerByOrganization.get(organization.id);
      const invited = invitedByOrganization.get(organization.id);
      return {
        id: organization.id,
        name: organization.name,
        status: organization.settings?.status ?? "ACTIVE",
        owner: owner ?? (invited ? `invited: ${invited}` : "none"),
        members: organization._count.members,
        sites: organization._count.sites,
        equipment: await forTenant(organization.id).equipment.count({
          where: { organizationId: organization.id },
        }),
        lastSignIn: dateOnly(lastSignIn.get(organization.id)),
        created: dateOnly(organization.createdAt),
      };
    }),
  );
}
