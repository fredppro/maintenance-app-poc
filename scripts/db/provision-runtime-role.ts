// Idempotently creates/updates the restricted runtime role named in DATABASE_URL and grants it
// the table privileges the app needs. Runs as the owner (MIGRATION_DATABASE_URL), after migrations.
//   pnpm db:provision-role
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../prisma/generated/prisma/client";

const ident = (value: string) => `"${value.replaceAll('"', '""')}"`;
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;

async function main() {
  const ownerUrl = process.env.MIGRATION_DATABASE_URL;
  const runtimeUrl = process.env.DATABASE_URL;
  if (!ownerUrl || !runtimeUrl) {
    throw new Error("MIGRATION_DATABASE_URL and DATABASE_URL must both be set");
  }

  const runtime = new URL(runtimeUrl);
  const role = decodeURIComponent(runtime.username);
  const password = decodeURIComponent(runtime.password);
  const owner = decodeURIComponent(new URL(ownerUrl).username);
  if (!role || !password) throw new Error("DATABASE_URL must include a username and password");
  if (role === owner) {
    throw new Error("DATABASE_URL uses the owner role; it must be a restricted runtime role");
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: ownerUrl }) });
  try {
    const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
    const r = ident(role);
    const statements = [
      `DO $$ BEGIN
         IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${literal(role)}) THEN
           ALTER ROLE ${r} WITH LOGIN PASSWORD ${literal(password)} NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
         ELSE
           CREATE ROLE ${r} LOGIN PASSWORD ${literal(password)} NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
         END IF;
       END $$`,
      `GRANT CONNECT ON DATABASE ${ident(db)} TO ${r}`,
      `GRANT USAGE ON SCHEMA public TO ${r}`,
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${r}`,
      `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${r}`,
      `ALTER DEFAULT PRIVILEGES FOR ROLE ${ident(owner)} IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${r}`,
      `ALTER DEFAULT PRIVILEGES FOR ROLE ${ident(owner)} IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${r}`,
      `REVOKE UPDATE, DELETE ON TABLE "organization_audit_event" FROM ${r}`,
    ];
    for (const sql of statements) await prisma.$executeRawUnsafe(sql);
    console.log(`Runtime role "${role}" is provisioned on database "${db}".`);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
