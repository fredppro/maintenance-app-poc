# Database and migrations

Repository-backed PostgreSQL and Prisma guidance. This describes the application and its procedures, not the live database provider; see the [environment status record](../reference/environment-status.md).

## Database

- Prisma schema: `prisma/schema.prisma`.
- Prisma CLI configuration and `DATABASE_URL`: `prisma.config.ts`.
- Generated Prisma client: `prisma/generated/prisma/` (tracked in Git and
  regenerated during install or with `pnpm db:generate`).
- Local PostgreSQL services: `docker-compose.yml` (`pnpm db:up` and
  `pnpm db:e2e:up`).
- Script reference by environment: [scripts/README.md](../../scripts/README.md).
- Apply committed migrations safely: `pnpm db:migrate:deploy`.
- Create a migration during development: `pnpm db:migrate:dev`. Use this
  only with the local development database; review and commit the SQL.
- `prisma db push` is intentionally not exposed as a script: it bypasses
  migration history and RLS policies.
- Development data command: `pnpm db:seed`.

`DATABASE_URL` is the application's runtime connection. For row-level security
it must be a restricted role; `MIGRATION_DATABASE_URL` (the owner) is used by
`prisma migrate` and seeding. See [tenant isolation](tenant-isolation.md). The Prisma schema
and client use PostgreSQL; switching between compatible PostgreSQL providers
does not require application-code changes. Supply the provider's connection URL
and any provider-required TLS or pooler options. Connection limits, TLS, and
pooler behavior remain provider-specific settings; verify them against the
actual deployment. A historical Neon compatibility example appears below.

The committed migration history initializes the schema, including the
historical `MaterialConsumed` creation and rename migrations. A forward
migration adds `Material.price` and worker assignment times with
`ADD COLUMN IF NOT EXISTS`, accommodating databases where those fields already
exist. Apply migrations in deployment with `pnpm db:migrate:deploy`; check
`pnpm exec prisma migrate status` against an existing database before rollout.

When upgrading a database that already has maintenance data, the tenant
migration keeps those rows under an unclaimed `Legacy workspace` and creates a
`Legacy site`. It deliberately does not grant membership to an arbitrary
account. Existing installations therefore need a deliberate, verified process
to assign an owner before that legacy data becomes accessible. After review and
backup, create and verify the intended owner's account, then run the guarded,
audited `pnpm legacy:assign-owner` operation with the required `LEGACY_*`
variables and exact confirmation phrase. It records the approval ticket,
operator, previous organization/site names, and assigned owner in
`legacy_ownership_assignment`, and refuses to proceed if the account is
unverified or ownership was already established. See the [pilot-readiness
guide](../planning/pilot-readiness.md) for the required variables and review
steps.
Never apply the tenant migration to production without planning this ownership
transition.
