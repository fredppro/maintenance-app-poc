import { validateE2EDatabaseUrl } from "./test-database";
import {
  TENANT_A_ADMIN_EMAIL,
  TENANT_A_ADMIN_ID,
  TENANT_A_ADMIN_INVITATION_ID,
  TENANT_A_INVITATION_ID,
  TENANT_A_MEMBER_EMAIL,
  TENANT_A_MEMBER_ID,
  TENANT_A_TASK_ID,
  TENANT_B_EMAIL,
  TENANT_B_TASK_ID,
} from "./tenant-fixtures";

export default async function globalTeardown() {
  if (!process.env.E2E_DATABASE_URL) return;
  const databaseUrl = validateE2EDatabaseUrl(
    process.env.E2E_DATABASE_URL,
    process.env.DATABASE_URL,
  );
  const originalDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = databaseUrl;
  const { default: prisma } = await import("../../src/lib/prisma");

  try {
    await prisma.organization.deleteMany({
      where: {
        slug: "e2e-tenant-b-organization",
      },
    });
    await prisma.maintenanceTask.deleteMany({
      where: { id: { in: [TENANT_A_TASK_ID, TENANT_B_TASK_ID] } },
    });
    await prisma.organization.deleteMany({
      where: { slug: { startsWith: "e2e-onboarding-" } },
    });
    await prisma.user.deleteMany({
      where: {
        OR: [
          { email: { startsWith: "playwright-onboarding-" } },
          { email: TENANT_B_EMAIL },
        ],
      },
    });

    const organization = await prisma.organization.findUnique({
      where: { slug: "e2e-playwright-organization" },
      select: { id: true },
    });
    if (!organization) return;

    await prisma.maintenanceTask.deleteMany({
      where: {
        organizationId: organization.id,
        title: { startsWith: "E2E - Playwright" },
      },
    });
    await prisma.equipment.deleteMany({
      where: {
        organizationId: organization.id,
        name: "E2E - Playwright Equipment",
      },
    });
    await prisma.worker.deleteMany({
      where: {
        organizationId: organization.id,
        email: "playwright-worker@example.test",
      },
    });
    await prisma.invitation.deleteMany({
      where: {
        id: { in: [TENANT_A_INVITATION_ID, TENANT_A_ADMIN_INVITATION_ID] },
        organizationId: organization.id,
      },
    });
    await prisma.member.deleteMany({
      where: {
        id: { in: [TENANT_A_MEMBER_ID, TENANT_A_ADMIN_ID] },
        organizationId: organization.id,
      },
    });
    await prisma.organizationAuditEvent.deleteMany({
      where: { organizationId: organization.id },
    });
    await prisma.user.deleteMany({
      where: { email: { in: [TENANT_A_MEMBER_EMAIL, TENANT_A_ADMIN_EMAIL] } },
    });
  } finally {
    await prisma.$disconnect();
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  }
}
