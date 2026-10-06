import { validateE2EDatabaseUrl } from "./test-database";

export default async function globalSetup() {
  const databaseUrl = validateE2EDatabaseUrl(
    process.env.E2E_DATABASE_URL,
    process.env.DATABASE_URL,
  );
  const originalDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = databaseUrl;
  const { default: prisma } = await import("../../src/lib/prisma");
  const { auth } = await import("../../src/features/auth/server/auth");

  try {
    const existingUser = await prisma.user.findUnique({
      where: { email: "playwright@example.test" },
    });
    let userId = existingUser?.id;
    if (!userId) {
      const created = await auth.api.signUpEmail({
        body: {
          name: "E2E Playwright",
          email: "playwright@example.test",
          password: "playwright-e2e-password",
        },
      });
      userId = created.user.id;
    }

    const existingOrganization = await prisma.organization.findUnique({
      where: { slug: "e2e-playwright-organization" },
    });
    const organization =
      existingOrganization ??
      (await auth.api.createOrganization({
        body: {
          name: "E2E Playwright Organization",
          slug: "e2e-playwright-organization",
          userId,
        },
      }));
    const site = await prisma.site.upsert({
      where: {
        organizationId_name: {
          organizationId: organization.id,
          name: "E2E Playwright Site",
        },
      },
      update: {},
      create: {
        name: "E2E Playwright Site",
        organizationId: organization.id,
      },
    });

    await prisma.maintenanceTask.deleteMany({
      where: { organizationId: organization.id, title: { startsWith: "E2E - Playwright" } },
    });

    await prisma.equipment.upsert({
      where: {
        organizationId_name: {
          organizationId: organization.id,
          name: "E2E - Playwright Equipment",
        },
      },
      update: {},
      create: {
        name: "E2E - Playwright Equipment",
        category: "Test fixtures",
        organizationId: organization.id,
        siteId: site.id,
      },
    });

    await prisma.worker.upsert({
      where: {
        organizationId_email: {
          organizationId: organization.id,
          email: "playwright-worker@example.test",
        },
      },
      update: {},
      create: {
        name: "E2E Playwright Worker",
        email: "playwright-worker@example.test",
        organizationId: organization.id,
      },
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
