// Fails when DATABASE_URL's role could bypass row-level security. Run it against every environment:
//   pnpm db:verify-role
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../prisma/generated/prisma/client";

// Tables deliberately outside RLS: the auth/lifecycle tables are read before a tenant is known
// or by operators (docs/tenant-isolation.md). Anything else with organizationId must have RLS.
const APP_LEVEL_ONLY = new Set(["member", "invitation", "organization_audit_event", "tenant_settings"]);

async function main() {
  const url = process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const [role] = await prisma.$queryRaw<{ rolname: string; rolsuper: boolean; rolbypassrls: boolean; rolcreatedb: boolean; rolcreaterole: boolean }[]>`
      SELECT rolname, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = current_user`;
    const [owned] = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND tableowner = current_user`;
    const [auditWrite] = await prisma.$queryRaw<{ ok: boolean }[]>`
      SELECT has_table_privilege(current_user, 'public.organization_audit_event', 'UPDATE,DELETE') AS ok`;
    const [publicCreate] = await prisma.$queryRaw<{ ok: boolean }[]>`
      SELECT has_schema_privilege(current_user, 'public', 'CREATE') AS ok`;
    const [definers] = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef`;
    const [views] = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) FROM pg_views WHERE schemaname = 'public'`;
    const unprotected = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT c.table_name FROM information_schema.columns c
      JOIN pg_class k ON k.relname = c.table_name AND k.relnamespace = 'public'::regnamespace
      WHERE c.table_schema = 'public' AND c.column_name = 'organizationId' AND NOT k.relrowsecurity`;
    const problems = [
      role.rolcreatedb && "role has CREATEDB",
      role.rolcreaterole && "role has CREATEROLE",
      publicCreate.ok && "role can create objects in schema public",
      Number(definers.count) > 0 && "SECURITY DEFINER functions exist in public (review for RLS bypass)",
      Number(views.count) > 0 && "views exist in public (review: views run with owner rights)",
      unprotected.some((t) => !APP_LEVEL_ONLY.has(t.table_name)) &&
        `tables with organizationId but no RLS: ${unprotected.filter((t) => !APP_LEVEL_ONLY.has(t.table_name)).map((t) => t.table_name).join(", ")}`,
      role.rolsuper && "role is a superuser",
      role.rolbypassrls && "role has BYPASSRLS",
      Number(owned.count) > 0 && "role owns tables (owners are exempt without FORCE)",
      auditWrite.ok && "role can modify the audit trail",
    ].filter(Boolean);
    console.log(problems.length ? `FAIL (${role.rolname}): ${problems.join("; ")}` : `OK (${role.rolname})`);
    process.exitCode = problems.length ? 1 : 0;
  } finally {
    await prisma.$disconnect();
  }
}
void main();
