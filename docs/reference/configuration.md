# Configuration reference

This reference lists configuration names found in the application, scripts,
containers, and checked-in workflows. Secret values and current provider
settings are not recorded here; see the
[environment status record](environment-status.md) for what has and has not
been verified.

Copy [`.env.example`](../../.env.example) for local development. It contains
only local Docker Compose values and commented placeholders. Real `.env` files
are ignored by Git.

## Database and authentication

| Variable | Scope / status | Purpose and constraints |
| --- | --- | --- |
| `DATABASE_URL` | App runtime; required unless `APP_DATABASE_URL` supplies the runtime URL. Required by Prisma CLI when no higher-precedence migration URL is set. | PostgreSQL connection. For the shared-database model, use a restricted runtime role that cannot bypass RLS. Never use the owner role for normal application requests. |
| `APP_DATABASE_URL` | Optional app runtime override; all strategies that use PostgreSQL. | Explicit runtime connection; takes precedence over `DATABASE_URL`. Must be a restricted role. Migration and owner scripts do not use it as their owner connection. |
| `MIGRATION_DATABASE_URL` | Deployment migrations and protected operator workflows; required for a separate owner role. | Owner/migrator connection used for `prisma migrate`, role provisioning, seed operations when configured, and scheduled administration. Keep separate from runtime credentials. |
| `DATABASE_URL_UNPOOLED` | Optional Vercel/Neon integration variable. | Direct/unpooled owner connection fallback for Prisma migration configuration and runtime-role provisioning when `MIGRATION_DATABASE_URL` is unset. `MIGRATION_DATABASE_URL` takes precedence. |
| `E2E_DATABASE_URL` | Browser tests; test-only. | Dedicated disposable database on the local E2E service or CI PostgreSQL. Its database name must end in `_test` and it must be distinct from `DATABASE_URL`. |
| `RLS_TEST_DATABASE_URL` | Optional RLS integration-test override; test-only. | Administrative connection to a disposable migrated database. Never point it at staging or production. CI maps it to the isolated E2E database. |
| `BETTER_AUTH_SECRET` | App runtime; required. | Random secret of at least 32 characters. Keep stable for the lifetime of sessions. With Vercel's built-in runtime-role derivation, it also determines the password for the role scoped by `VERCEL_ENV`; do not rotate casually. |
| `BETTER_AUTH_URL` | App runtime; required. | Canonical application origin. Production must use the exact public HTTPS origin; local development uses `http://localhost:3000`. |

### Connection precedence

- **Application runtime:** `APP_DATABASE_URL` → Vercel-derived restricted URL
  from `DATABASE_URL` when Vercel is detected → `DATABASE_URL`.
- **Prisma migrations:** `MIGRATION_DATABASE_URL` →
  `DATABASE_URL_UNPOOLED` → `DATABASE_URL`.
- **Runtime-role provisioning:** owner URL is
  `MIGRATION_DATABASE_URL` → `DATABASE_URL_UNPOOLED` → `DATABASE_URL`;
  runtime role is resolved from the app URL rules above.

For the primary VPS strategy, set separate restricted and owner URLs. For the
Vercel + Neon fallback, use isolated database targets per Vercel environment,
and ensure preview builds cannot migrate production. There are currently no
tenant-specific database URL variables or runtime routing configuration:
dedicated database per-tenant support is planned, not implemented.

## Email, bootstrap, and scheduled reminders

| Variable | Scope / status | Purpose and constraints |
| --- | --- | --- |
| `RESEND_API_KEY` | Production app; required by the readiness check. | Resend API credential for verification, password recovery, invitations, and transactional notifications. |
| `AUTH_EMAIL_FROM` | Production app; required by the readiness check. | Verified sender identity, e.g. `Maintenance Scheduler <accounts@example.com>`. |
| `PILOT_BOOTSTRAP_EMAIL` | Initial production setup; temporary. | Email allowed to create the first customer owner while no customer organization exists. Remove after setup; an unclaimed legacy workspace does not satisfy this bootstrap condition. |
| `CRON_SECRET` | App and scheduled caller; required for reminder dispatch. | High-entropy secret. The caller must send `Authorization: Bearer <secret>` to `POST /api/cron/maintenance-reminders`. Missing app configuration returns 503; an incorrect caller secret returns 401. Keep the value out of URLs and logs. |

The route implementation does not schedule itself. Configure and verify a
Coolify task or another approved scheduler. A scheduler configuration is not
proof that the route ran or an email was delivered.

## Object storage

| Variable | Scope / status | Purpose and constraints |
| --- | --- | --- |
| `S3_BUCKET` | Optional in development; required for production file storage. | Enables the S3-compatible backend for uploads and exports. Production refuses local-disk storage. |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Required when `S3_BUCKET` is set. | Application object read/write/delete credentials. Keep separate from inventory, cleanup, and backup credentials. |
| `S3_ENDPOINT` | Optional. | Custom S3-compatible endpoint, such as local MinIO or Garage. Omit for AWS S3. |
| `S3_REGION` | Optional; defaults to `us-east-1`. | Bucket region expected by the S3 client. |
| `S3_FORCE_PATH_STYLE` | Optional; defaults to `true` when `S3_ENDPOINT` is set and `false` otherwise. | Set explicitly only if the selected S3-compatible provider requires path-style addressing. |
| `STORAGE_LOCAL_DIR` | Optional development setting; defaults to `.storage`. | Local filesystem directory used only when `S3_BUCKET` is unset. |
| `S3_AUDIT_ACCESS_KEY_ID`, `S3_AUDIT_SECRET_ACCESS_KEY` | Optional; required for complete S3 object inventory. | Separate read-only bucket-list credentials used by `pnpm ops:storage:inventory`; the command does not fall back to application credentials. |
| `S3_CLEANUP_ACCESS_KEY_ID`, `S3_CLEANUP_SECRET_ACCESS_KEY` | Protected maintenance workflow; required when that workflow uses an S3 bucket. | Separate credentials for listing and deleting only the permitted export objects. The workflow skips its maintenance work when these are missing while `S3_BUCKET` is configured. |

See [object storage](../architecture/object-storage.md) for storage behavior
and cleanup limits.

## Development, tests, and one-time operations

| Variable | Scope / status | Purpose and constraints |
| --- | --- | --- |
| `SEED_ADMIN_EMAIL` | Optional local seed configuration. | Existing organization owner's email used to attach development seed data. |
| `ALLOW_REMOTE_SEED` | Optional dangerous seed override; unset by default. | Must be `true` to permit seeding a non-local database. Do not set for production or ordinary deployment. |
| `EXPORT_TEST_DATABASE_URL` | Optional PostgreSQL integration-test connection; test-only. | Administrative connection for export temporary-reservation integration tests. Use only a disposable migrated database; the suite is skipped when unset. |
| `RUN_EXPORT_STRESS`, `RUN_REMINDER_STRESS` | Optional stress-test toggles; test-only. | Set to `1` to run the corresponding generated-data stress case. These tests use mocks and do not replace database integration tests. |
| `LEGACY_OWNER_EMAIL` | One-time legacy ownership operation only. | Verified existing owner account receiving the historical organization. |
| `LEGACY_ORGANIZATION_NAME`, `LEGACY_ORGANIZATION_SLUG`, `LEGACY_SITE_NAME` | One-time legacy ownership operation only. | Approved replacement organization/site names and unique slug. |
| `LEGACY_ASSIGNMENT_OPERATOR`, `LEGACY_ASSIGNMENT_TICKET` | One-time legacy ownership operation only. | Accountable operator and approved change identifier recorded in the audit. |
| `CONFIRM_LEGACY_OWNERSHIP` | One-time legacy ownership operation only. | Exact confirmation phrase required by the guarded command. Do not keep it in a shared environment file. |

Use the guarded command and review procedure in
[pilot readiness](../planning/pilot-readiness.md). These one-time values are
intentionally not included in `.env.example`.

## Backups

| Variable | Scope / status | Purpose and constraints |
| --- | --- | --- |
| `BACKUP_DATABASE_URL` | `backup.yml` and `pnpm db:backup`; required to run a database dump. | Direct/unpooled connection with enough privilege to dump the target database. Keep separate from the app runtime URL. |
| `BACKUP_S3_URI` | Optional for the local script; required by the workflow's configuration gate. | `s3://bucket/prefix` destination for the dump and checksum. Without it, the GitHub workflow skips. |
| `BACKUP_AWS_ACCESS_KEY_ID`, `BACKUP_AWS_SECRET_ACCESS_KEY` | Protected backup workflow; required when uploading. | AWS-compatible storage credentials with narrowly scoped write access. The workflow maps these to standard AWS CLI variable names. |
| `BACKUP_AWS_REGION` | Optional protected backup workflow setting; workflow default is `eu-west-1`. | Region passed to the AWS CLI. |
| `BACKUP_DIR` | Optional local backup-script setting; defaults to `./backups`. | Local output directory. It is not a retention or off-site backup policy. |

The repository does not establish that the backup workflow is active, that
off-host retention is configured, or that an application restore has succeeded.
Keep application-database, object-file, and Coolify-instance backups distinct;
see [tenant lifecycle and recovery](../operations/tenant-lifecycle-and-recovery.md)
and [environment status](environment-status.md).

## Platform- and workflow-provided settings

These are not ordinary developer `.env` values. They are supplied by the
runtime, Docker build, or protected automation.

| Variable | Source and use |
| --- | --- |
| `NODE_ENV` | Next.js runtime/build mode. Production behavior includes secure cookies, S3-only file storage, and production readiness checks. |
| `VERCEL`, `VERCEL_ENV` | Supplied by Vercel. `VERCEL` enables runtime role URL derivation; `VERCEL_ENV` scopes the derived role name. |
| `CONTAINER_BUILD` | Set to `true` by the Docker build to produce Next.js standalone output. |
| `APP_BUILD_SHA` | Docker build argument embedded in the image; `/api/health` returns it as `X-Application-Revision` when present. |
| `PORT`, `HOSTNAME` | Production container defaults are `3000` and `0.0.0.0`. |
| `STAGING_AUTODEPLOY_ENABLED` | GitHub Actions repository variable; staging deploy job remains gated unless it is `true`. |
| `STAGING_COOLIFY_APP_UUID`, `STAGING_COMPOSE_MIGRATION_ENABLED` | GitHub `staging` Environment variables identifying the Compose application and keeping deploys disabled until its migration gate is configured. |
| `COOLIFY_API_TOKEN`, `STAGING_WIREGUARD_CONFIG` | GitHub `staging` Environment secrets used only by staging deployment. Coolify token requires `read`, `write`, and `deploy`, without `read:sensitive` or `root`. |
| `MIGRATION_DATABASE_URL` | Coolify staging environment owner URL passed only to the migrator service; also a protected `production-maintenance` Environment secret for daily maintenance. Never pass it to the app service or GitHub staging workflow. |
| `S3_*` | Storage variables belong in the relevant Coolify app environment; maintenance-only credentials belong in the protected `production-maintenance` GitHub Environment. Values and activation are not verified here. |
| `APP_IMAGE_TAG`, `MIGRATOR_IMAGE_TAG` | Coolify Compose interpolation variables updated by the staging workflow to the validated immutable GHCR tags; do not set them to moving tags such as `latest`. |
| `IMAGE`, `MIGRATOR_IMAGE`, `GITHUB_TOKEN` | Workflow-derived image references and GitHub-provided token; do not set in the app environment. |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `PGHOST`, `PGPASSWORD` | PostgreSQL container/test-service settings in Compose or CI, not application runtime variables. Keep them within the local or ephemeral service boundary. |
| `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD` | Local MinIO service defaults in the Compose `storage` profile; do not reuse outside local development. |
| `WATCHPACK_POLLING` | Set to `true` for the Docker-only development app so file changes are detected through the mounted volume. |
| `CI` | Set by GitHub Actions and by the Docker-only development service; test tooling uses it to select CI behavior. |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION` | Temporary AWS CLI environment names mapped from `BACKUP_AWS_*` by the backup workflow. |

`NEXT_PUBLIC_ENABLE_ANALYTICS` is the optional public build/runtime toggle for
Vercel Analytics; analytics renders only when the value is exactly `true`.
It is disabled by default. Review consent, privacy notice, and processor
inventory before enabling it.

## Configuration change checklist

When adding or changing configuration:

1. Define one canonical name and document whether it is secret, required, and
   which environment consumes it.
2. Keep provider-specific settings scoped to the adapter or deployment layer;
   do not introduce a tenant credential into the global environment.
3. Update `.env.example` only for safe developer-facing values. Keep one-time
   destructive-operation variables out of the template.
4. Update this reference and the relevant deployment/runbook guide in the same
   change. Never record actual secret values.
5. Verify the default, precedence, failure behavior, and corresponding CI or
   deployment secret names against the consumer code.

For end-to-end strategy guidance, see
[deployment architecture](../operations/deployment-architecture.md).
