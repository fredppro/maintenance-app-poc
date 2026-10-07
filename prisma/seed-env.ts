// Seeding writes tenant tables without a tenant context, so it must use the owner role.
// Imported before anything that creates the Prisma client.
import "dotenv/config";

if (process.env.MIGRATION_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.MIGRATION_DATABASE_URL;
}
