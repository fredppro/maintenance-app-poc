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
      where: {
        organizationId: organization.id,
        title: { startsWith: "E2E - Playwright" },
      },
    });

    const equipment = await prisma.equipment.upsert({
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

    const memberUser =
      (await prisma.user.findUnique({
        where: { email: TENANT_A_MEMBER_EMAIL },
      })) ??
      (
        await auth.api.signUpEmail({
          body: {
            name: "E2E Organization Member",
            email: TENANT_A_MEMBER_EMAIL,
            password: "playwright-member-a-password",
          },
        })
      ).user;
    const adminUser =
      (await prisma.user.findUnique({
        where: { email: TENANT_A_ADMIN_EMAIL },
      })) ??
      (
        await auth.api.signUpEmail({
          body: {
            name: "E2E Organization Admin",
            email: TENANT_A_ADMIN_EMAIL,
            password: "playwright-admin-a-password",
          },
        })
      ).user;
    await prisma.member.upsert({
      where: { id: TENANT_A_MEMBER_ID },
      update: {
        organizationId: organization.id,
        userId: memberUser.id,
        role: "read_only",
      },
      create: {
        id: TENANT_A_MEMBER_ID,
        organizationId: organization.id,
        userId: memberUser.id,
        role: "read_only",
        createdAt: new Date(),
      },
    });
    await prisma.member.upsert({
      where: { id: TENANT_A_ADMIN_ID },
      update: {
        organizationId: organization.id,
        userId: adminUser.id,
        role: "admin",
      },
      create: {
        id: TENANT_A_ADMIN_ID,
        organizationId: organization.id,
        userId: adminUser.id,
        role: "admin",
        createdAt: new Date(),
      },
    });
    await prisma.invitation.upsert({
      where: { id: TENANT_A_INVITATION_ID },
      update: {
        organizationId: organization.id,
        email: "playwright-pending-invite@example.test",
        role: "maintenance_manager",
        status: "pending",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        inviterId: userId,
      },
      create: {
        id: TENANT_A_INVITATION_ID,
        organizationId: organization.id,
        email: "playwright-pending-invite@example.test",
        role: "maintenance_manager",
        status: "pending",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        inviterId: userId,
      },
    });
    await prisma.invitation.upsert({
      where: { id: TENANT_A_ADMIN_INVITATION_ID },
      update: {
        organizationId: organization.id,
        email: "playwright-pending-admin-invite@example.test",
        role: "admin",
        status: "pending",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        inviterId: userId,
      },
      create: {
        id: TENANT_A_ADMIN_INVITATION_ID,
        organizationId: organization.id,
        email: "playwright-pending-admin-invite@example.test",
        role: "admin",
        status: "pending",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        inviterId: userId,
      },
    });

    await prisma.maintenanceTask.upsert({
      where: { id: TENANT_A_TASK_ID },
      update: {
        organizationId: organization.id,
        equipmentId: equipment.id,
        title: "E2E - Tenant A private maintenance record",
      },
      create: {
        id: TENANT_A_TASK_ID,
        organizationId: organization.id,
        equipmentId: equipment.id,
        title: "E2E - Tenant A private maintenance record",
        startTime: new Date("2026-10-06T08:00:00.000Z"),
        endTime: new Date("2026-10-06T09:00:00.000Z"),
      },
    });

    const tenantBUser =
      (await prisma.user.findUnique({ where: { email: TENANT_B_EMAIL } })) ??
      (
        await auth.api.signUpEmail({
          body: {
            name: "E2E Tenant B",
            email: TENANT_B_EMAIL,
            password: "playwright-tenant-b-password",
          },
        })
      ).user;
    const tenantBOrganization =
      (await prisma.organization.findUnique({
        where: { slug: "e2e-tenant-b-organization" },
      })) ??
      (await auth.api.createOrganization({
        body: {
          name: "E2E Tenant B Organization",
          slug: "e2e-tenant-b-organization",
          userId: tenantBUser.id,
        },
      }));
    const tenantBSite = await prisma.site.upsert({
      where: {
        organizationId_name: {
          organizationId: tenantBOrganization.id,
          name: "E2E Tenant B Site",
        },
      },
      update: {},
      create: {
        name: "E2E Tenant B Site",
        organizationId: tenantBOrganization.id,
      },
    });
    const tenantBEquipment = await prisma.equipment.upsert({
      where: {
        organizationId_name: {
          organizationId: tenantBOrganization.id,
          name: "E2E Tenant B Equipment",
        },
      },
      update: { siteId: tenantBSite.id },
      create: {
        name: "E2E Tenant B Equipment",
        organizationId: tenantBOrganization.id,
        siteId: tenantBSite.id,
      },
    });
    await prisma.maintenanceTask.upsert({
      where: { id: TENANT_B_TASK_ID },
      update: {
        organizationId: tenantBOrganization.id,
        equipmentId: tenantBEquipment.id,
        title: "E2E - Tenant B confidential maintenance record",
      },
      create: {
        id: TENANT_B_TASK_ID,
        organizationId: tenantBOrganization.id,
        equipmentId: tenantBEquipment.id,
        title: "E2E - Tenant B confidential maintenance record",
        startTime: new Date("2026-10-06T10:00:00.000Z"),
        endTime: new Date("2026-10-06T11:00:00.000Z"),
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
