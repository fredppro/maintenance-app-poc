import "dotenv/config";
import { randomUUID } from "node:crypto";
import { validateE2EDatabaseUrl } from "../tests/e2e/test-database";

const databaseUrl = validateE2EDatabaseUrl(
  process.env.E2E_DATABASE_URL,
  process.env.DATABASE_URL,
);
process.env.DATABASE_URL = databaseUrl;

const { default: prisma } = await import("../src/lib/prisma");
const { LEGACY_ORGANIZATION_SLUG } =
  await import("../src/lib/tenant-constants");

const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const ownerEmail = `legacy-owner-${suffix}@example.test`;
const customerSlug = `legacy-customer-${suffix}`;
const customerName = `Legacy Customer ${suffix}`;
const siteName = `Legacy Plant ${suffix}`;
let legacyOrganizationId: string | undefined;
let ownerUserId: string | undefined;

try {
  const existingLegacy = await prisma.organization.findUnique({
    where: { slug: LEGACY_ORGANIZATION_SLUG },
    select: { id: true },
  });
  if (existingLegacy) {
    throw new Error(
      "The E2E database already contains a legacy-workspace. Refusing to overwrite it.",
    );
  }

  ownerUserId = randomUUID();
  await prisma.user.create({
    data: {
      id: ownerUserId,
      name: "Legacy Ownership Test Owner",
      email: ownerEmail,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
  const legacyOrganization = await prisma.organization.create({
    data: {
      id: randomUUID(),
      name: "Legacy workspace",
      slug: LEGACY_ORGANIZATION_SLUG,
      createdAt: new Date(),
    },
  });
  legacyOrganizationId = legacyOrganization.id;
  const legacySite = await prisma.site.create({
    data: {
      name: "Legacy site",
      organizationId: legacyOrganization.id,
    },
  });
  const legacyEquipment = await prisma.equipment.create({
    data: {
      name: "Legacy test equipment",
      organizationId: legacyOrganization.id,
      siteId: legacySite.id,
    },
  });

  const previousEnvironment = { ...process.env };
  process.env.LEGACY_OWNER_EMAIL = ownerEmail;
  process.env.LEGACY_ORGANIZATION_NAME = customerName;
  process.env.LEGACY_ORGANIZATION_SLUG = customerSlug;
  process.env.LEGACY_SITE_NAME = siteName;
  process.env.LEGACY_ASSIGNMENT_OPERATOR = "pilot-test@example.test";
  process.env.LEGACY_ASSIGNMENT_TICKET = `TEST-${suffix}`;
  process.env.CONFIRM_LEGACY_OWNERSHIP = `ASSIGN LEGACY DATA TO ${ownerEmail}`;

  try {
    const { assignLegacyOwnership } =
      await import("./assign-legacy-ownership");
    const firstRun = await assignLegacyOwnership();
    const secondRun = await assignLegacyOwnership();

    if (firstRun.status !== "assigned" || secondRun.status !== "already_assigned") {
      throw new Error("Legacy ownership assignment was not safely idempotent");
    }
    const [assignedOrganization, assignedSite, assignedEquipment, membership, audit] =
      await Promise.all([
        prisma.organization.findUnique({
          where: { id: legacyOrganization.id },
          select: { name: true, slug: true },
        }),
        prisma.site.findUnique({
          where: { id: legacySite.id },
          select: { name: true, organizationId: true },
        }),
        prisma.equipment.findUnique({
          where: { id: legacyEquipment.id },
          select: { organizationId: true, siteId: true },
        }),
        prisma.member.findFirst({
          where: { organizationId: legacyOrganization.id, userId: ownerUserId },
          select: { role: true },
        }),
        prisma.legacyOwnershipAssignment.findUnique({
          where: { legacyOrganizationId: legacyOrganization.id },
        }),
      ]);

    if (
      assignedOrganization?.name !== customerName ||
      assignedOrganization.slug !== customerSlug ||
      assignedSite?.name !== siteName ||
      assignedSite.organizationId !== legacyOrganization.id ||
      assignedEquipment?.organizationId !== legacyOrganization.id ||
      assignedEquipment.siteId !== legacySite.id ||
      membership?.role !== "owner" ||
      audit?.ownerUserId !== ownerUserId ||
      audit.ticket !== `TEST-${suffix}` ||
      audit.organizationNameBefore !== "Legacy workspace" ||
      audit.siteNameBefore !== "Legacy site"
    ) {
      throw new Error(
        "Legacy ownership assignment did not preserve data and audit the owner change",
      );
    }
  } finally {
    for (const key of [
      "LEGACY_OWNER_EMAIL",
      "LEGACY_ORGANIZATION_NAME",
      "LEGACY_ORGANIZATION_SLUG",
      "LEGACY_SITE_NAME",
      "LEGACY_ASSIGNMENT_OPERATOR",
      "LEGACY_ASSIGNMENT_TICKET",
      "CONFIRM_LEGACY_OWNERSHIP",
    ]) {
      delete process.env[key];
    }
    for (const [key, value] of Object.entries(previousEnvironment)) {
      if (key.startsWith("LEGACY_") || key === "CONFIRM_LEGACY_OWNERSHIP") {
        process.env[key] = value;
      }
    }
  }

  console.info("Legacy ownership integration verification passed.");
} finally {
  if (legacyOrganizationId) {
    await prisma.legacyOwnershipAssignment.deleteMany({
      where: { legacyOrganizationId },
    });
    await prisma.organization.deleteMany({
      where: { id: legacyOrganizationId },
    });
  }
  if (ownerUserId) {
    await prisma.user.deleteMany({ where: { id: ownerUserId } });
  }
  await prisma.$disconnect();
}
