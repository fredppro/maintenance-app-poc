import { validateE2EDatabaseUrl } from "./test-database";

export default async function globalSetup() {
  const databaseUrl = validateE2EDatabaseUrl(process.env.E2E_DATABASE_URL);
  process.env.DATABASE_URL = databaseUrl;
  const { default: prisma } = await import("../../src/lib/prisma");

  try {
    await prisma.maintenanceTask.deleteMany({
      where: { title: { startsWith: "E2E - Playwright" } },
    });

    await prisma.equipment.upsert({
      where: { name: "E2E - Playwright Equipment" },
      update: {},
      create: {
        name: "E2E - Playwright Equipment",
        category: "Test fixtures",
      },
    });

    await prisma.worker.upsert({
      where: { email: "playwright-worker@example.test" },
      update: {},
      create: {
        name: "E2E Playwright Worker",
        email: "playwright-worker@example.test",
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}
