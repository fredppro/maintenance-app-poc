import { validateE2EDatabaseUrl } from "./test-database";

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
    await prisma.maintenanceTask.deleteMany({
      where: { title: { startsWith: "E2E - Playwright" } },
    });
    await prisma.equipment.deleteMany({
      where: { name: "E2E - Playwright Equipment" },
    });
    await prisma.worker.deleteMany({
      where: { email: "playwright-worker@example.test" },
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
