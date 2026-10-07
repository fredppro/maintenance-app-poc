# Tenant isolation

All customers share one PostgreSQL schema. Isolation has two independent layers:

1. **Application**: every query filters by `organizationId`, and `getTenantContext()` is the only
   source of the active organization.
2. **PostgreSQL row-level security (RLS)**: a safety net if the application layer ever forgets a filter.

## How RLS works

- The 10 tenant tables (`Site`, `Section`, `Equipment`, `EquipmentRelocation`, `StoredFile`,
  `MaintenanceTask`, `MaintenanceTaskAssignment`, `Material`, `Worker`, `Vendor`) have RLS enabled and
  forced, with a `tenant_isolation` policy: `"organizationId" = current_setting('app.org_id', true)`.
- `getTenantContext()` returns a `db` client from `forTenant(organizationId)` (`src/lib/prisma.ts`).
  Every query on it runs in a transaction that first executes `set_config('app.org_id', …, true)`.
  Use `db.transaction(fn)` for multi-statement work.
- Server code must use `db` from the tenant context for tenant tables. The plain `prisma` export fails
  closed (zero rows, rejected writes) once RLS is enforced.
- Cross-tenant references are blocked in the database too: composite foreign keys
  (`[id, organizationId]`) on relations, and the `equipment_same_tenant` trigger for `imageFileId` and
  `sectionId`.

## Enforcement requires a restricted role

PostgreSQL superusers and `BYPASSRLS` roles skip RLS, and so do the table owners' default roles on many
providers. Locally, `docker/db-init/01-app-role.sh` creates the restricted `maintenance_app_runtime` role on first
start of the Docker databases (existing volumes: run the script once, or `docker compose down -v`), and
`.env.example` points `DATABASE_URL` at it. In production:

1. Create a login role with `NOBYPASSRLS` and `SELECT/INSERT/UPDATE/DELETE` on all tables in `public`
   (plus sequence usage and matching `ALTER DEFAULT PRIVILEGES` for the owner so new tables are covered).
2. Keep the table owner for migrations only: set `MIGRATION_DATABASE_URL` to the owner (unpooled) URL.
   `prisma.config.ts` uses it for `prisma migrate`, and the app uses `DATABASE_URL`, the restricted role.
3. Roll out: `pnpm prisma migrate deploy`, switch the app to the restricted role in staging, run the e2e
   suite, then production.
4. Check enforcement: connected as the app role, `SELECT count(*) FROM "Site"` must return 0 until
   `app.org_id` is set.

## Verifying

- `RLS_TEST_DATABASE_URL=<superuser url of a disposable migrated DB> pnpm vitest run src/lib/rls.integration.test.ts`
  drops to a restricted role per transaction and checks isolation, write rejection and FK/trigger guards.
- `tests/e2e/tenant-isolation.spec.ts` covers cross-tenant access through the UI/API.

## Related

Tenant status, soft delete, export and backups: [tenant-lifecycle-and-recovery.md](tenant-lifecycle-and-recovery.md).
The RLS integration test runs in CI against the e2e database.

See also [GDPR readiness](./gdpr-readiness.md) for the privacy view of this architecture.
