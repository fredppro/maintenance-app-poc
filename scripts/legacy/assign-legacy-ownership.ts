import "dotenv/config";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import prisma from "../../src/lib/prisma";
import { LEGACY_ORGANIZATION_SLUG } from "../../src/lib/tenant-constants";
import { readLegacyOwnershipConfig } from "./legacy-ownership";

export async function assignLegacyOwnership() {
  const config = readLegacyOwnershipConfig(process.env);
  const result = await prisma.$transaction(
    async (tx) => {
      const lockedOrganizations = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "organization"
        WHERE "slug" = ${LEGACY_ORGANIZATION_SLUG}
        FOR UPDATE
      `;
      const legacyOrganizationId = lockedOrganizations[0]?.id;
      if (!legacyOrganizationId) {
        const organization = await tx.organization.findUnique({
          where: { slug: config.organizationSlug },
          select: { id: true },
        });
        const assignment = organization
          ? await tx.legacyOwnershipAssignment.findUnique({
              where: { legacyOrganizationId: organization.id },
            })
          : null;
        const owner = assignment
          ? await tx.user.findUnique({
              where: { id: assignment.ownerUserId },
              select: { email: true },
            })
          : null;
        if (
          assignment &&
          owner?.email.toLowerCase() === config.ownerEmail &&
          assignment.ticket === config.ticket
        ) {
          return {
            status: "already_assigned" as const,
            assignmentId: assignment.id,
            ticket: assignment.ticket,
            ownerUserId: assignment.ownerUserId,
          };
        }
        throw new Error(
          "No unclaimed legacy organization exists; no ownership was changed",
        );
      }

      const previousAssignment =
        await tx.legacyOwnershipAssignment.findUnique({
          where: { legacyOrganizationId },
          select: { id: true, ticket: true, ownerUserId: true },
        });
      if (previousAssignment) {
        const previousOwner = await tx.user.findUnique({
          where: { id: previousAssignment.ownerUserId },
          select: { email: true },
        });
        if (
          previousAssignment.ticket !== config.ticket ||
          previousOwner?.email.toLowerCase() !== config.ownerEmail
        ) {
          throw new Error(
            "The legacy organization was already assigned under a different owner or approval ticket",
          );
        }
        return {
          status: "already_assigned" as const,
          assignmentId: previousAssignment.id,
          ticket: previousAssignment.ticket,
          ownerUserId: previousAssignment.ownerUserId,
        };
      }

      const [organization, owner, site, membershipCount, slugConflict] =
        await Promise.all([
          tx.organization.findUnique({ where: { id: legacyOrganizationId } }),
          tx.user.findUnique({
            where: { email: config.ownerEmail },
            select: { id: true, emailVerified: true },
          }),
          tx.site.findFirst({
            where: { organizationId: legacyOrganizationId },
            orderBy: { createdAt: "asc" },
          }),
          tx.member.count({ where: { organizationId: legacyOrganizationId } }),
          tx.organization.findUnique({
            where: { slug: config.organizationSlug },
            select: { id: true },
          }),
        ]);

      if (!organization) throw new Error("Legacy organization was not found");
      if (!owner) {
        throw new Error(
          "The nominated owner account must be created before assigning legacy data",
        );
      }
      if (!owner.emailVerified) {
        throw new Error("The nominated owner account must have a verified email");
      }
      if (!site) {
        throw new Error("The legacy organization has no site to assign");
      }
      if (membershipCount !== 0) {
        throw new Error(
          "The legacy organization already has members; refusing to change ownership",
        );
      }
      if (slugConflict) {
        throw new Error("LEGACY_ORGANIZATION_SLUG is already in use");
      }

      const auditId = randomUUID();
      await tx.organization.update({
        where: { id: organization.id },
        data: {
          name: config.organizationName,
          slug: config.organizationSlug,
        },
      });
      await tx.site.update({
        where: { id: site.id },
        data: { name: config.siteName },
      });
      await tx.member.create({
        data: {
          id: randomUUID(),
          organizationId: organization.id,
          userId: owner.id,
          role: "owner",
          createdAt: new Date(),
        },
      });
      await tx.legacyOwnershipAssignment.create({
        data: {
          id: auditId,
          legacyOrganizationId: organization.id,
          siteId: site.id,
          ownerUserId: owner.id,
          operator: config.operator,
          ticket: config.ticket,
          organizationNameBefore: organization.name,
          organizationSlugBefore: organization.slug,
          siteNameBefore: site.name,
        },
      });

      return {
        status: "assigned" as const,
        assignmentId: auditId,
        organizationId: organization.id,
        siteId: site.id,
        ownerUserId: owner.id,
        ticket: config.ticket,
      };
    },
    { isolationLevel: "Serializable" },
  );

  console.info(JSON.stringify({ event: "legacy_ownership_assignment", ...result }));
  return result;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    await assignLegacyOwnership();
  } finally {
    await prisma.$disconnect();
  }
}
