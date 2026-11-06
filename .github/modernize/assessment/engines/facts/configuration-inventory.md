# Configuration & Externalized Settings Inventory

The project has local environment files, TypeScript/Prisma application configuration, container settings, and GitHub Actions deployment/maintenance workflows. Secrets are externalized to ignored local files or protected provider/workflow settings; this inventory contains names and behavior only, never values.

## Configuration Sources

| Source | Type | Path/Location | Notes |
| --- | --- | --- | --- |
| Local environment | dotenv / Next.js | `.env` (ignored) | Present locally; only variable names were inspected. Values were not read or recorded. |
| Environment template | dotenv example | `.env.example` | Safe local defaults and commented strategy-specific placeholders; not a production configuration file. |
| Package/runtime scripts | JSON manifest | `package.json` | Node engine, package manager, development/build/test/maintenance commands, and `vercel-build`. |
| Node version | Runtime pin | `.node-version` | Node.js 24. |
| Prisma | TypeScript config and schema | `prisma.config.ts`, `prisma/schema.prisma` | Migration URL precedence and PostgreSQL schema. |
| Next.js | JavaScript config | `next.config.mjs` | Standalone output is enabled only when `CONTAINER_BUILD=true`; production headers use `NODE_ENV`. |
| Local services | Docker Compose | `docker-compose.yml`, `docker/Dockerfile.dev`, `docker/dev-entrypoint.sh`, `docker/db-init/01-app-role.sh` | PostgreSQL, optional MinIO, app startup order, and local restricted role. |
| Production image | Docker build | `Dockerfile`, `docker/migrate-entrypoint.sh` | Node 24 Alpine multi-stage app and one-shot migrator images; app image has a Docker health check. |
| Browser tests | Playwright | `playwright.config.ts`, `tests/e2e/` | Uses isolated `E2E_DATABASE_URL`, a restricted runtime role, and a local test server. |
| Unit tests | Vitest | `vitest.config.ts` | Test runner configuration. |
| TypeScript/lint/build styling | Tool configuration | `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`, `components.json` | Build and development tooling; no external runtime configuration provider. |
| CI and deployment | GitHub Actions | `.github/workflows/tests.yml`, `security.yml` | Unit/browser tests, image build/scan/publish, gated staging deploy. |
| Scheduled operations | GitHub Actions | `.github/workflows/backup.yml`, `maintenance-jobs.yml` | Conditional backup and maintenance schedules; workflow presence does not establish activation or success. |
| Dependency updates | GitHub Actions | `.github/dependabot.yml` | Weekly npm and Actions update configuration. |
| Host provisioning | Ansible/Terraform | `ansible/`, `infra/contabo-firewall/` | Host and provider inputs are separate from app environment. Do not copy secret values from local inventory or protected operator environments into this document. |
| External deployment settings | Provider configuration | Coolify, GitHub Environments; Vercel only for a possible fallback | Values are not in the repository. The active values and complete production configuration are not independently verified. |

No `.env.local`, `.env.production`, `vercel.json`, Kubernetes manifest, external
configuration repository, or checked-in secret-manager integration was found.

## Build Profiles

| Profile | Activation | Purpose | Key Dependencies/Plugins |
| --- | --- | --- | --- |
| `dev` | `pnpm dev` | Next.js development server; local auth and local file-storage behavior. | Next.js; `.env`; local PostgreSQL. |
| `build` | `pnpm build` | Standard Next.js production build. | Next.js build and Prisma generated client. |
| `vercel-build` | Vercel framework build command or explicit `pnpm vercel-build` | Applies Prisma migrations, provisions the restricted runtime role, then builds Next.js. | Prisma CLI, `tsx`, `scripts/db/provision-runtime-role.ts`; owner connection required. |
| Container build | `CONTAINER_BUILD=true` in the Docker builder stage | Produces Next.js standalone output for the runtime image. | Dockerfile multi-stage build. |
| Docker `migrator` target | `docker build --target migrator` | Creates a one-shot image that applies migrations and provisions/verifies the runtime role. | Prisma CLI, `tsx`, `docker/migrate-entrypoint.sh`. The staging deploy job currently does not invoke this image. |
| `start` | `pnpm start` or the production container command | Runs the built Next.js server. | Node.js 24; `PORT` defaults to 3000 and container `HOSTNAME` is `0.0.0.0`. |
| Unit/browser tests | CI workflow or `pnpm test:run` / `pnpm test:e2e` | Unit, RLS, and browser validation. | Vitest, Playwright, PostgreSQL 17 in CI. |

## Runtime Profiles

| Profile | Activation Method | Config Files | Key Overrides |
| --- | --- | --- | --- |
| Local development | `NODE_ENV=development` (Next default); `pnpm dev` | `.env`, `.env.example`, `docker-compose.yml` | Local database; local disk under `.storage` unless S3 is configured; auth email delivery is optional. |
| Production container | `NODE_ENV=production`; Docker runtime | Coolify environment variables and `Dockerfile` defaults | S3 storage required; Resend sender/key required by readiness; secure cookies; production HTTPS origin. |
| Vercel Production | Provider sets `VERCEL` and `VERCEL_ENV=production` | Vercel project environment; `package.json` `vercel-build`; `prisma.config.ts` | Runtime role derived from `DATABASE_URL` unless `APP_DATABASE_URL` is explicit; migrations use owner/direct URL. Fallback only, not verified deployed. |
| Vercel Preview | Provider sets `VERCEL` and `VERCEL_ENV=preview` | Vercel Preview environment | Separate role scope; use an isolated database target so build migrations cannot mutate production. |
| Unit/CI | GitHub Actions; test-specific `NODE_ENV` and values | Workflow YAML and test config | Ephemeral PostgreSQL and test credentials; no production database secret in browser CI. |

There are no profile-specific `.env.*` files in the workspace. Runtime
behavior is mostly selected by `NODE_ENV`, provider-provided `VERCEL` /
`VERCEL_ENV`, and whether optional storage/email settings exist.

## Properties Inventory

### Next.js application and Prisma

| Property Key | Default | Profiles | Source |
| --- | --- | --- | --- |
| `DATABASE_URL` | No application default; local example points to Compose PostgreSQL. | Local, self-hosted, tests, Vercel/Neon. | Runtime Prisma connection; CLI fallback. |
| `APP_DATABASE_URL` | Unset. | Optional runtime override for PostgreSQL strategies. | `src/lib/database-url.ts`; takes precedence for app runtime. |
| `MIGRATION_DATABASE_URL` | Unset; Prisma config falls back to `DATABASE_URL_UNPOOLED`, then `DATABASE_URL`. | Deploy/build migrations and owner operations. | `prisma.config.ts`, database scripts. |
| `DATABASE_URL_UNPOOLED` | Unset; may be supplied by the Vercel/Neon integration. | Vercel/Neon fallback. | Direct/owner URL fallback for migrations and runtime-role provisioning. |
| `E2E_DATABASE_URL` | Unset; local template points to PostgreSQL on port 5433. | Browser tests only. | Playwright setup, E2E migration/fixture scripts. |
| `RLS_TEST_DATABASE_URL` | Unset; CI maps it to the isolated E2E DB. | PostgreSQL RLS integration tests only. | `src/lib/rls.integration.test.ts`. |
| `EXPORT_TEST_DATABASE_URL` | Unset. | Optional export reservation PostgreSQL integration test. | `src/features/export/server/export-temp-reservations.integration.test.ts`; use only a disposable migrated database. |
| `RUN_EXPORT_STRESS`, `RUN_REMINDER_STRESS` | Unset; tests skip unless set to `1`. | Opt-in generated-data stress cases. | `src/features/export/server/build-export.test.ts`, `src/features/scheduler/server/reminders.test.ts`. |
| `BETTER_AUTH_SECRET` | No production default; `.env.example` contains a replace-me placeholder. | App runtime, tests, Vercel role derivation. | Required, minimum 32 characters. |
| `BETTER_AUTH_URL` | No app default; local example is `http://localhost:3000`. | App runtime and tests. | Required canonical origin; production must be HTTPS. |
| `NODE_ENV` | Framework-controlled; development locally, production in deployed runtime. | All. | Auth cookies, logs, storage policy, and readiness behavior. |
| `VERCEL` | Unset outside Vercel; provider-managed on Vercel. | Vercel fallback. | Enables Vercel runtime database role derivation. |
| `VERCEL_ENV` | Provider-managed (`production`, `preview`, or `development`). | Vercel fallback. | Suffix for the derived restricted database role. |
| `CONTAINER_BUILD` | Unset except Docker builder (`true`). | Container build only. | Enables Next.js standalone output. |
| `APP_BUILD_SHA` | Docker build argument default `unknown`; CI supplies commit SHA. | Container image. | Returned by `/api/health` as `X-Application-Revision` when present. |
| `PORT` | `3000` in production image. | Production container. | Next.js server port. |
| `HOSTNAME` | `0.0.0.0` in production image. | Production container. | Next.js bind host. |

### Email, storage, scheduled work, and analytics

| Property Key | Default | Profiles | Source |
| --- | --- | --- | --- |
| `RESEND_API_KEY` | Unset. | Production and email-enabled environments. | Resend API; production readiness checks it. |
| `AUTH_EMAIL_FROM` | Unset. | Production and email-enabled environments. | Verified sender; production readiness checks it. |
| `PILOT_BOOTSTRAP_EMAIL` | Unset. | Initial production onboarding. | Temporary first-owner registration gate. |
| `CRON_SECRET` | Unset. | App plus external reminder scheduler. | Bearer authorization for `POST /api/cron/maintenance-reminders`. |
| `S3_BUCKET` | Unset. | S3-backed environments; required in production. | Selects S3-compatible storage; production rejects local storage. |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Unset. | When `S3_BUCKET` is configured. | Application object storage credentials. |
| `S3_ENDPOINT` | Unset. | Optional custom S3-compatible endpoint. | MinIO, Garage, or another compatible endpoint. |
| `S3_REGION` | `us-east-1`. | S3 storage. | S3 client region. |
| `S3_FORCE_PATH_STYLE` | Auto: true with `S3_ENDPOINT`, otherwise false. | S3 storage. | S3 addressing mode. |
| `STORAGE_LOCAL_DIR` | `.storage`. | Development only. | Local filesystem backend directory. |
| `S3_AUDIT_ACCESS_KEY_ID`, `S3_AUDIT_SECRET_ACCESS_KEY` | Unset. | Manual storage inventory. | Separate read-only bucket-list credentials. |
| `S3_CLEANUP_ACCESS_KEY_ID`, `S3_CLEANUP_SECRET_ACCESS_KEY` | Unset. | Scheduled maintenance workflow when an S3 bucket is configured. | Separate export cleanup credentials; absence causes the workflow to skip. |
| `NEXT_PUBLIC_ENABLE_ANALYTICS` | Unset/false. | Optional production analytics. | Vercel Analytics renders only when the value is exactly `true`. |

### Operations, tests, and CI

| Property Key | Default | Profiles | Source |
| --- | --- | --- | --- |
| `SEED_ADMIN_EMAIL` | Unset. | Development seed only. | Existing owner to receive sample tenant data. |
| `ALLOW_REMOTE_SEED` | Unset/false. | Explicit exceptional seed operation. | Must equal `true` to permit non-local seeding. |
| `LEGACY_OWNER_EMAIL`, `LEGACY_ORGANIZATION_NAME`, `LEGACY_ORGANIZATION_SLUG`, `LEGACY_SITE_NAME`, `LEGACY_ASSIGNMENT_OPERATOR`, `LEGACY_ASSIGNMENT_TICKET`, `CONFIRM_LEGACY_OWNERSHIP` | Unset; no template defaults. | One-time guarded legacy ownership operation. | Required values are validated by the script; not ordinary persistent app configuration. |
| `BACKUP_DATABASE_URL` | Unset; required by the dump script/workflow. | Local backup or protected GitHub backup workflow. | Direct/unpooled database connection for `pg_dump`. |
| `BACKUP_S3_URI` | Unset; workflow skips if absent. | Optional local upload; required for workflow run. | Off-host S3 destination. |
| `BACKUP_AWS_ACCESS_KEY_ID`, `BACKUP_AWS_SECRET_ACCESS_KEY` | Unset. | Protected backup workflow when uploading. | Mapped to standard AWS CLI credential variables. |
| `BACKUP_AWS_REGION` | Workflow fallback `eu-west-1`. | Protected backup workflow. | AWS CLI region. |
| `BACKUP_DIR` | `./backups`. | Local backup script. | Local dump output directory. |
| `STAGING_AUTODEPLOY_ENABLED` | Disabled unless repository Actions variable is `true`. | GitHub deployment workflow. | Gate for staging deployment on `develop`. |
| `COOLIFY_API_TOKEN`, `STAGING_WIREGUARD_CONFIG` | No repository defaults; GitHub secrets. | `staging` GitHub Environment only. | Coolify deployment and temporary WireGuard access. |
| `IMAGE`, `MIGRATOR_IMAGE` | Derived from repository and commit SHA. | CI only. | App/migrator image references. |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `PGHOST`, `PGPASSWORD` | Compose/CI service-defined. | Local and ephemeral test services. | PostgreSQL container initialization and test connection; not app production variables. |
| `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD` | Fixed local-only Compose defaults (values omitted). | Local `storage` profile only. | MinIO service bootstrap; never reuse outside local development. |
| `WATCHPACK_POLLING` | `true` in Docker-only development Compose. | Local container development. | Enables reliable file watching over a bind mount. |
| `CI` | GitHub Actions or Compose sets the value. | CI and Docker-only development. | Selects test tooling behavior. |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION` | Set by the backup workflow. | Backup workflow process only. | Standard AWS CLI names mapped from `BACKUP_AWS_*`. |

No tenant-specific database registry, database credential, pool-limit, or
per-tenant connection property exists today. Do not invent such variables in
`.env.example`; a future design must use protected secret references and a
server-side resolver rather than tenant credentials in a global env file.

## Startup Parameters & Resource Requirements

| Service | JVM/Runtime Options | Memory | Instance Count |
| --- | --- | --- | --- |
| Next.js application container | Node.js 24; `NODE_ENV=production`; `PORT=3000`; `HOSTNAME=0.0.0.0`; non-root user; Docker health check calls `/api/health` every 30 seconds after a 60-second start period. | No checked-in runtime memory/CPU limit or measured production requirement. | No repository-enforced production replica count. |
| Migration container | Node.js 24; one-shot `prisma migrate deploy`, runtime-role provisioning, then verification. | No checked-in limit. | One-shot per target database; CI builds the image but current staging deploy workflow does not invoke it. |
| Local PostgreSQL | PostgreSQL 17 Alpine; Compose health check uses `pg_isready`. | No explicit resource limit. | One development database; optional separate E2E database. |
| Coolify / VPS | Host runbooks target Ubuntu 24.04; Docker/Coolify configuration is external to the app image. | Production resource limits and measured capacity are not established by this repository. | One current/target VPS is documented; production placement remains partly unverified. |

No JVM settings apply. Do not use historical sizing estimates in the platform
plan as measured requirements.

## Startup Dependency Chain

1. **Local development:** Compose PostgreSQL becomes healthy via `pg_isready`
   → the app's `depends_on: service_healthy` condition is satisfied
   → `docker/dev-entrypoint.sh` installs dependencies and applies migrations
   → Next.js development server starts.
2. **Container release:** CI builds and scans the app and migrator images
   → publishes immutable commit-tagged artifacts
   → the target PostgreSQL must be reachable by the one-shot migrator
   → migrations and runtime-role verification must complete
   → the app container starts
   → Coolify ingress routes HTTPS traffic to the app.
   The checked-in staging deploy job currently deploys the app image but does
   not invoke the migrator.
3. **Readiness:** `/api/health` checks PostgreSQL reachability and required
   production email/bootstrap configuration. The Docker health check and
   staging workflow use this signal; it does not verify storage, email
   delivery, backup, or scheduled-task success.
4. **Reminder dispatch:** an external scheduler calls the authenticated app
   route → the app queries PostgreSQL and sends email through Resend. The
   schedule does not run from inside the app container.
5. **Maintenance and backup:** GitHub Actions workflows connect to protected
   database/storage settings. Their schedules are conditional and require
   explicit secrets; workflow definitions alone do not prove execution.

## Secrets & Sensitive Configuration

| Secret Reference | Type | Storage (masked) |
| --- | --- | --- |
| `DATABASE_URL`, `APP_DATABASE_URL`, `MIGRATION_DATABASE_URL`, `DATABASE_URL_UNPOOLED` | Database connection strings/credentials | Ignored local `.env`; deployed app or migration environment in Coolify/provider; protected GitHub Environment for jobs. Actual values not recorded. |
| `BETTER_AUTH_SECRET`, `CRON_SECRET` | Signing/authorization secrets | App runtime secret store; CRON caller also needs the same secret. Values not recorded. |
| `RESEND_API_KEY` | Email API credential | App runtime secret store. Value not recorded. |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Object-storage credentials | App runtime secret store. Values not recorded. |
| `S3_AUDIT_*`, `S3_CLEANUP_*` | Restricted inventory/cleanup credentials | Protected operator or maintenance environment; separate from app credentials. Values not recorded. |
| `BACKUP_DATABASE_URL`, `BACKUP_AWS_*` | Backup source/destination credentials | Protected GitHub Environment or secured operator environment. Values not recorded. |
| `COOLIFY_API_TOKEN`, `STAGING_WIREGUARD_CONFIG` | Deployment control-plane/VPN secrets | GitHub `staging` Environment. Values not recorded. |
| Contabo API credentials, SSH/WireGuard private keys, Coolify `APP_KEY` | Infrastructure and control-plane secrets | Protected provider/operator systems and encrypted backup. Never commit or record values. |

### Secrets Provisioning Workflow

Local developers copy `.env.example` to ignored `.env`; Compose provides only
local development database/storage defaults. For deployment, the operator
places app variables in the corresponding Coolify resource and keeps
migration/owner credentials separate from the runtime role. GitHub Actions
reads deployment credentials from scoped `staging` or `production-maintenance`
Environments; the staging workflow also creates a temporary WireGuard
interface. A possible Vercel fallback would use Vercel environment variables
per Production/Preview scope. No managed identity, external vault, or
checked-in secret-manager integration was found. Secret values, configured
scopes, and most active consumers remain unverified; inspect by name and scope
only.

## Feature Flags

| Flag Name | Default | Controlled By |
| --- | --- | --- |
| `NEXT_PUBLIC_ENABLE_ANALYTICS` | Disabled; only exact string `true` enables it. | Application environment/build setting. |
| `STAGING_AUTODEPLOY_ENABLED` | Disabled unless set to `true`. | GitHub Actions repository variable. |
| `PILOT_BOOTSTRAP_EMAIL` | Unset; no initial account may use the bootstrap exception. | Production app setting; remove after initial owner setup. |
| `TenantSettings.isolationTier=DEDICATED` | Reserved enum value; not an active routing flag. | Database schema only; code currently supports pooled tenants and the reminder job skips a non-pooled tier. |

No external feature-flag service or gradual-rollout framework was found.

## Framework & Runtime Versions

| Component | Version | Source |
| --- | --- | --- |
| Node.js | 24 | `.node-version`, `package.json` engines, Docker images. |
| pnpm | 12.9.1 | `package.json` packageManager and Dockerfile. |
| Next.js | 16.4.1 | `package.json` / lockfile. |
| React / React DOM | 19.2.4 | `package.json` / lockfile. |
| Prisma CLI / client | 7.9.1 | `package.json` / lockfile. |
| Prisma PostgreSQL adapter | 7.9.1 | `package.json` / lockfile. |
| TypeScript | 5.9.2 | `package.json` / lockfile. |
| PostgreSQL | 17 in local Compose and CI; deployed production version unverified. | `docker-compose.yml`, `.github/workflows/tests.yml`. |
| Production app base image | `node:24-alpine`, pinned by digest. | `Dockerfile`. |
| Development app base image | `node:24-slim`. | `docker/Dockerfile.dev`. |
