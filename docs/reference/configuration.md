# Configuration reference

Variable names and behavior documented from repository configuration. Do not copy secret values into documentation; deployed values and secret-store locations are not established here.

## Environment variables

| Variable | Required for | Description |
| --- | --- | --- |
| `DATABASE_URL` | Prisma client generation/configuration, database commands, and app runtime | PostgreSQL-compatible connection string. `.env.example` points to local development PostgreSQL. |
| `MIGRATION_DATABASE_URL` | `prisma migrate`, `pnpm db:seed` | Optional owner connection string; falls back to `DATABASE_URL`. Required when `DATABASE_URL` is a restricted role (the local Docker default). |
| `E2E_DATABASE_URL` | Playwright browser tests and E2E migration command | Dedicated test database connection string. `.env.example` points to a separate local database on port 5433. The database name must end in `_test` and target a different host/port/database from `DATABASE_URL`. |
| `BETTER_AUTH_SECRET` | App runtime and auth tests | Secret used to sign Better Auth sessions; use a random secret of at least 32 characters and keep it private. |
| `BETTER_AUTH_URL` | App runtime and auth tests | Canonical application origin, for example `http://localhost:3000` locally or the deployed HTTPS origin. |
| `S3_BUCKET` | Optional in development; required in production | Enables S3-compatible file storage (equipment photos) when set. If unset, development stores files on local disk and production refuses to start uploads. See [File storage](../architecture/object-storage.md). |
| `S3_ENDPOINT` | Optional | Custom endpoint for MinIO or another S3-compatible service (for example `http://localhost:9000`). Omit for AWS S3. |
| `S3_REGION` | Optional | Bucket region. Defaults to `us-east-1`. |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Required when `S3_BUCKET` is set | Storage credentials. For the bundled MinIO they are `minioadmin` / `minioadmin`. |
| `S3_FORCE_PATH_STYLE` | Optional | `true` or `false`. Defaults to `true` when `S3_ENDPOINT` is set, otherwise `false`. |
| `STORAGE_LOCAL_DIR` | Optional | Local-disk directory used when `S3_BUCKET` is unset. Defaults to `.storage` (git-ignored). |
| `RESEND_API_KEY` | Production verification, password recovery, and invitations | Resend API credential. Configure through a secret manager; no key is needed for local login/signup without email delivery. |
| `AUTH_EMAIL_FROM` | Production verification, password recovery, and invitations | Verified sender in Resend, e.g. `Maintenance Scheduler <accounts@example.com>`. |
| `REQUIRE_EMAIL_VERIFICATION` | Optional (previews) | Set to `false` to skip email verification on a preview with no email provider. Ignored when `VERCEL_ENV=production`. |
| `ALLOW_PUBLIC_SIGNUP` | Optional (previews) | Set to `true` to allow anyone to sign up and create an organisation on a preview. Ignored when `VERCEL_ENV=production`; leave unset for the invite-only pilot. |
| `PILOT_BOOTSTRAP_EMAIL` | Initial production owner setup | Email permitted to create the first production account while no customer organization exists. An unclaimed legacy workspace is ignored. Remove after initial setup. |
| `LEGACY_OWNER_EMAIL` | Legacy data assignment only | Verified existing account selected to own migrated legacy data. |
| `LEGACY_ORGANIZATION_NAME` | Legacy data assignment only | Approved customer organization name to replace the legacy workspace name. |
| `LEGACY_ORGANIZATION_SLUG` | Legacy data assignment only | New, unused lowercase URL-safe customer slug. |
| `LEGACY_SITE_NAME` | Legacy data assignment only | Approved site name to replace the legacy site name. |
| `LEGACY_ASSIGNMENT_OPERATOR` | Legacy data assignment only | Accountable operator recorded in the ownership audit. |
| `LEGACY_ASSIGNMENT_TICKET` | Legacy data assignment only | Approved change/ticket identifier recorded in the ownership audit. |
| `CONFIRM_LEGACY_OWNERSHIP` | Legacy data assignment only | Exact confirmation: `ASSIGN LEGACY DATA TO <LEGACY_OWNER_EMAIL>`. |
| `SEED_ADMIN_EMAIL` | Optional development seeding | Email of an existing organization owner. Seeding adds sample data to that owner's first organization/site and fails if the owner or site does not exist. |

### Required versus optional

| Goal | Variables |
| --- | --- |
| Boot the dev server | `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` |
| Upload files locally | none (falls back to `.storage/`); optionally the `S3_*` set for MinIO |
| Run browser tests | adds `E2E_DATABASE_URL` |
| Production | adds `S3_BUCKET` + credentials, `RESEND_API_KEY`, `AUTH_EMAIL_FROM`, `PILOT_BOOTSTRAP_EMAIL` |

Where to obtain values: `DATABASE_URL` comes from `docker-compose.yml` locally
or your PostgreSQL provider's connection string; `BETTER_AUTH_SECRET` is
generated with `openssl rand -base64 32`; `BETTER_AUTH_URL` is the origin you
open in the browser; `RESEND_API_KEY` and `AUTH_EMAIL_FROM` come from your
Resend account with a verified sender domain; `S3_*` come from your storage
provider, or the fixed MinIO defaults above.

Playwright reads `E2E_DATABASE_URL` for its server and fixtures. The
`pnpm db:migrate:e2e` command validates and uses that URL without changing
the development database configuration.
