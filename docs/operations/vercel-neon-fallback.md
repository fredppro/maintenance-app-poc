# Vercel + Neon fallback deployment

**Status: fallback only; not the preferred hosting strategy.** The repository
contains Vercel/Neon-compatible build and database URL handling, but current
Vercel, Neon, region, account, and production deployment configuration have not
been verified. Reconsider this option only after an explicit decision to leave
the self-hosted VPS strategy.

## Repository support and limits

- `package.json` defines `vercel-build`, which runs Prisma migrations, provisions
  the restricted runtime role, then builds the Next.js application.
- `prisma.config.ts` selects the migration connection in this order:
  `MIGRATION_DATABASE_URL`, `DATABASE_URL_UNPOOLED`, then `DATABASE_URL`.
- `src/lib/database-url.ts` selects `APP_DATABASE_URL` first. Otherwise, when
  Vercel is detected, it derives a restricted runtime role URL from
  `DATABASE_URL`; the role name is scoped by `VERCEL_ENV`, and its password is
  derived from `BETTER_AUTH_SECRET`. Outside Vercel, `DATABASE_URL` is used as
  supplied.
- `scripts/db/provision-runtime-role.ts` creates or updates the corresponding
  runtime role using the migration/owner connection. The runtime role must be
  verified with `pnpm db:verify-role`.
- These integrations are code paths, not evidence that a provider account,
  project, region, environment variable, or deployment is configured.

## Configuration by environment

Use separate, isolated database targets for Production and Preview. Vercel's
build runs migrations; do not let preview builds migrate a production database.
Confirm the current Neon/Vercel integration's variable names and pooler behavior
before configuring it.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Runtime base connection. With the built-in Vercel role derivation, it must identify the target PostgreSQL database and the owner connection used during role provisioning. The app derives a restricted role unless `APP_DATABASE_URL` is set or the URL already names that role. |
| `DATABASE_URL_UNPOOLED` | Direct/owner connection supplied by some Neon/Vercel integrations; Prisma migrations and role provisioning use it when `MIGRATION_DATABASE_URL` is absent. |
| `MIGRATION_DATABASE_URL` | Explicit owner/direct connection. It takes precedence over `DATABASE_URL_UNPOOLED` for migrations and provisioning. Scope it so only the intended environment can mutate that database. |
| `APP_DATABASE_URL` | Optional explicit restricted runtime URL. It bypasses automatic runtime URL derivation; do not point it at the owner role. |
| `BETTER_AUTH_SECRET` | Required auth secret. Keep it stable for every build using the same `VERCEL_ENV`-scoped runtime role; changing it changes the derived database-role password. |
| `BETTER_AUTH_URL` | Exact public HTTPS origin for that deployment. |
| `RESEND_API_KEY`, `AUTH_EMAIL_FROM` | Production email delivery and readiness requirements. |
| `PILOT_BOOTSTRAP_EMAIL` | Only for initial production owner registration; remove after setup. |
| `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Required for production uploads and exports. Local filesystem storage is not a durable Vercel file store. Add `S3_ENDPOINT`, `S3_REGION`, and `S3_FORCE_PATH_STYLE` only when required by the selected provider. |
| `CRON_SECRET` | Shared secret for an external scheduled caller of the maintenance-reminder route. The repository has no checked-in Vercel cron configuration. |

Never put production connection strings or secrets in this guide or a committed
environment file. Set them in the matching Vercel environment and protected
GitHub environment only when that fallback is approved. Do not copy a
production-only migration URL into Preview settings.

## Deployment procedure

1. Create and verify separate Neon database targets/branches for Production and
   Preview. Check region, TLS, connection limits, backups, and restore options
   against current provider documentation.
2. In Vercel, configure the project for the repository's Next.js application,
   Node.js 24, and `pnpm`. Use the `vercel-build` script; confirm the build
   actually runs it before allowing a deployment.
3. Set environment variables separately for Production and Preview. Ensure
   migration credentials point only to that environment's database. Keep
   `BETTER_AUTH_SECRET` stable across builds within each `VERCEL_ENV` role scope.
4. Confirm the runtime connection is restricted. Deploy, then run
   `pnpm db:verify-role` against the runtime URL using a protected operator
   environment and verify the application's RLS tests against disposable
   databases.
5. Configure and test S3-compatible storage, Resend, and a scheduled caller
   for `/api/cron/maintenance-reminders`. The caller must send
   `Authorization: Bearer <CRON_SECRET>`. Configure separate protected
   credentials for the repository's maintenance and backup workflows if they
   are used.
6. Verify `/api/live`, `/api/health`, sign-in, tenant-scoped reads/writes,
   uploads, downloads, exports, email delivery, cron invocation, and a
   database restore before serving production traffic.

The build command applies migrations and provisions a role as part of the
deployment build. This is not a release gate or an environment-isolation
mechanism by itself. Protect database credentials, use isolated Preview
databases, and review migration compatibility before each production release.

## Provider-specific constraints to validate

- `src/lib/prisma.ts` creates one process-level Prisma client and does not set
  explicit pool options. Validate Neon pooler compatibility, serverless
  connection counts, and cold-start behavior at the selected scale.
- Tenant operations use transaction-local `set_config('app.org_id', ...)`
  before RLS-protected queries. Validate this behavior with the chosen pooler
  and connection mode; do not replace transaction-local state with session
  state.
- Production storage requires S3-compatible object storage. The app also uses
  temporary local files and Next.js background work for exports; confirm
  Vercel function duration, disk, memory, and post-response execution limits
  against representative export workloads.
- The reminder endpoint requires an external scheduler. No `vercel.json` or
  equivalent cron declaration is checked in. The separate GitHub maintenance
  workflow is conditional on its protected environment secrets and is not
  proof of an active schedule.
- `/api/health` checks the database and required production email/bootstrap
  configuration, not all provider services. Add independent checks for storage,
  scheduled jobs, backup age, and provider health.
- Vercel and Neon have provider-specific costs, region availability, connection
  policies, backup retention, and data-processing terms. Recheck all of these
  before deployment; repository history contains estimates that are not current
  quotations or compliance evidence.

For the currently recommended operating model, see
[single-VPS deployment architecture](deployment-architecture.md). Historical
compatibility notes are retained in
[the archive](../archive/vercel-neon-compatibility.md).
