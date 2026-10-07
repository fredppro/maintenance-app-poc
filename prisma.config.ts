import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "tsx prisma/seed.ts",
    path: "prisma/migrations",
  },
  datasource: {
    // Migrations need the table owner; the app itself runs as a restricted role (see docs/tenant-isolation.md).
    url: process.env.MIGRATION_DATABASE_URL ?? env("DATABASE_URL"),
  },
});