# Maintenance Scheduler

A maintenance-planning web application for scheduling equipment work, assigning
internal and external workers, tracking materials, and generating task reports.
The application is built with Next.js 16, React 19, TypeScript, and Prisma 7.
Its PostgreSQL connection is configured through `DATABASE_URL`; the same app
can use local PostgreSQL, Neon, or another PostgreSQL provider.

## Quick start

### Docker only (no Node or pnpm on the host)

Install Docker with Compose v2, clone, then:

```sh
pnpm up      # or: docker compose --profile app up --build
```

This builds a pinned Node 24 image, starts PostgreSQL, applies migrations and
serves the app with hot reload at [http://localhost:3000/en](http://localhost:3000/en).
Stop with `pnpm down` (or `docker compose --profile app down`). Without pnpm on
the host, use the `docker compose` form. Run other commands inside the
container, e.g. `docker compose exec app pnpm test:run`. Uses a development-only
auth secret unless `BETTER_AUTH_SECRET` is exported.

### Host toolchain

For a fresh clone on macOS, Linux, or Windows under WSL, install Node.js 24,
Git, and Docker with Compose v2. Then run:

```sh
git clone <repository-url>
cd maintenance-app-poc
corepack enable
pnpm bootstrap   # creates .env, installs, starts Postgres, applies migrations
pnpm dev
```

`pnpm bootstrap` (`scripts/dev/bootstrap.ts`) is idempotent and refuses to touch a
non-local database. The manual equivalent is:

```sh
cp .env.example .env   # then set BETTER_AUTH_SECRET
pnpm install --frozen-lockfile
pnpm db:up
pnpm db:migrate:deploy
pnpm dev
```

Open [http://localhost:3000/en](http://localhost:3000/en), sign up, and create
an organization and its first site. The commands apply the checked-in
migrations but do not add sample data. To seed development data, set
`SEED_ADMIN_EMAIL` in `.env` to the email of that organization owner and run
`pnpm db:seed`.

`pnpm dev` only boots with `DATABASE_URL`, `BETTER_AUTH_SECRET` (at least 32
characters) and `BETTER_AUTH_URL` set; `.env.example` provides working
local values except the secret, which you must replace (see
[Environment variables](#environment-variables)). Everything else is optional
in development. Without them the server fails at startup with a message such as
`BETTER_AUTH_SECRET must contain at least 32 characters`.

Stop the local PostgreSQL service without deleting its data with
`pnpm db:down`. The detailed setup and test instructions below cover other
workflows and production configuration.

## Prerequisites

- **Node.js 24**, pinned in `.node-version` and `package.json`.
- **Corepack** to use the package-manager version pinned in `package.json`:
  **pnpm 12.9.1**.
- **Docker Desktop or Docker Engine with Compose v2** for the included local
  PostgreSQL services, or a reachable PostgreSQL-compatible database.
- **Git**.

Playwright browser testing additionally requires Chromium and a dedicated test
database.

## Setup

From a fresh clone, select the Node.js version specified by `.node-version`
using your preferred runtime manager. Enable Corepack to use the pnpm version
pinned in `package.json`:

```sh
corepack enable
```

Create your local environment file **before installing dependencies**.
`postinstall` runs Prisma client generation, which reads `DATABASE_URL`:

```sh
cp .env.example .env
```

Then generate the authentication secret and paste it over the placeholder
`BETTER_AUTH_SECRET` value in `.env` (the placeholder is shorter than the
required 32 characters, so the app will not start until you replace it):

```sh
openssl rand -base64 32
```

The example values target the local Compose databases. For a hosted database,
replace the relevant URL with your provider's PostgreSQL connection string.
Keep credentials private; do not commit `.env`.

Install dependencies:

```sh
pnpm install --frozen-lockfile
```

The install runs the package `postinstall` script, which generates the Prisma
client in the checked-in `prisma/generated/prisma` directory. Regenerate it
after changing the Prisma schema and include generated-client changes:

```sh
pnpm db:generate
```

Start the local development database:

```sh
pnpm db:up
```

Apply the committed migration history to the local database:

```sh
pnpm db:migrate:deploy
```

This command applies pending migrations and does not reset or drop existing
data. Stop (but retain) the local database with `pnpm db:down`.

Optionally, add the sample equipment, vendors, workers, and maintenance tasks:

```sh
pnpm db:seed
```

The seed uses upserts for equipment, vendors, and workers, and skips tasks that
already exist for the same title and equipment. It is intended for development
data, not production initialization.

## Running

Start the development server:

```sh
pnpm dev
```

Open [http://localhost:3000/en](http://localhost:3000/en). The application
loads scheduler data from the configured database, so the database must be
reachable and have the schema applied.

For a production-mode local run, first build the app, then start the production
server:

```sh
pnpm build
pnpm start
```

`pnpm start` serves the built app on the Next.js default port (3000). It also
needs a reachable database.

### Account and workspace setup

In local development, open `/en/signup`; signup is unrestricted only outside
production. The first account can create an organization and its initial site.
In production, the initial owner must match `PILOT_BOOTSTRAP_EMAIL` until the
first customer organization is created; an unclaimed migration-created legacy
workspace does not count as a customer organization. Subsequent accounts
require an unexpired organization invitation and verified email.
Members accept invitations from the emailed link. Users with access to multiple
organizations or sites select their active context during onboarding or from
the dashboard.

Application roles are enforced on server-side actions and report access.
Owners and admins manage members and pending invitations at `/en/members`.
Admins cannot manage owners or other admins, invite admins, or revoke admin
invitations; ownership transfer is not available in this interface.
See [the pilot-readiness guide](./docs/pilot-readiness.md) for the permission
matrix, account/bootstrap policy, legacy-data handling, and operational
limitations. Production email verification, password recovery, and
invitations require a verified Resend sender and credentials.

## Tests

Run the unit/component/API tests:

```sh
pnpm test:run
```

Run tests in watch mode while developing:

```sh
pnpm test
```

Run the suite with V8 coverage:

```sh
pnpm test:coverage
```

Vitest discovers `src/**/*.test.ts` and `src/**/*.test.tsx`; reports are written
to `coverage/` in text, HTML, and LCOV formats. The standard unit suite does
not require a live database.

### Browser tests

The Playwright suite starts a real Next.js development server and writes
fixtures to its configured database. **Never point it at a development or
production database.** Start the separate local E2E PostgreSQL service:

```sh
pnpm db:e2e:up
```

`E2E_DATABASE_URL` in `.env.example` targets this service on port 5433. Apply
the committed migrations with the E2E-specific command:

```sh
pnpm db:migrate:e2e
```

Install Chromium and run the browser tests:

```sh
pnpm exec playwright install chromium
pnpm test:e2e
```

The suite runs with one worker. Setup creates fixture organizations, sites,
members, invitations, equipment, workers, and maintenance tasks. Tests cover
both directions of tenant dashboard/report isolation, member administration,
onboarding, and scheduling. Teardown removes test fixtures. Stop the E2E
service with `pnpm db:e2e:down`. It has no persistent volume; removing its
container with `docker compose --profile e2e down` discards its data.

The configuration requires `E2E_DATABASE_URL`, rejects database names that do
not end in `_test`, rejects the same host/port/database as `DATABASE_URL`, and
always starts its own server rather than reusing a possibly development-bound
Next.js process. Never point it at a development or production database.

## Code quality

Run the checks used by the standard CI job:

```sh
pnpm lint
pnpm typecheck
pnpm build
pnpm test:coverage
```

- `pnpm lint` runs ESLint using the Next.js Core Web Vitals and TypeScript
  configurations.
- `pnpm typecheck` runs `tsc --noEmit`.
- There is no formatter script or configured format-check command in the
  repository.

The ESLint configuration currently treats several rules as warnings; review
the lint output rather than assuming a clean exit means there are no warnings.

## Build

Create an optimized production build with:

```sh
pnpm build
```

Next.js writes build output to `.next/`. Run it locally with `pnpm start` after
building. The app uses the `pdfkit` server package for report generation and
Next.js externalizes it for server use.

## Database

- Prisma schema: `prisma/schema.prisma`.
- Prisma CLI configuration and `DATABASE_URL`: `prisma.config.ts`.
- Generated Prisma client: `prisma/generated/prisma/` (tracked in Git and
  regenerated during install or with `pnpm db:generate`).
- Local PostgreSQL services: `docker-compose.yml` (`pnpm db:up` and
  `pnpm db:e2e:up`).
- Script reference by environment: [scripts/README.md](scripts/README.md).
- Apply committed migrations safely: `pnpm db:migrate:deploy`.
- Create a migration during development: `pnpm db:migrate:dev`. Use this
  only with the local development database; review and commit the SQL.
- `prisma db push` is intentionally not exposed as a script: it bypasses
  migration history and RLS policies.
- Development data command: `pnpm db:seed`.

`DATABASE_URL` is the application's runtime connection. For row-level security
it must be a restricted role; `MIGRATION_DATABASE_URL` (the owner) is used by
`prisma migrate` and seeding. See [docs/tenant-isolation.md](./docs/tenant-isolation.md). The Prisma schema
and client use PostgreSQL; switching between compatible PostgreSQL providers
does not require application-code changes. Supply the provider's connection URL
and any provider-required TLS or pooler options. For Neon production, prefer
its pooled endpoint when the deployment creates many short-lived connections.
Connection limits, TLS, and pooler behavior remain provider-specific settings.

**Vercel / Neon.** Vercel runs `pnpm vercel-build` automatically. It applies migrations
(`prisma migrate deploy`, using `MIGRATION_DATABASE_URL`), then creates or updates the
restricted runtime role named in `DATABASE_URL` (`pnpm db:provision-role`, idempotent), then
builds. Set these Vercel variables for the build: `MIGRATION_DATABASE_URL` (Neon owner),
`DATABASE_URL` (the runtime role and the password you choose; it is created for you; if a
provider integration owns `DATABASE_URL`, set `APP_DATABASE_URL` instead, which takes priority),
`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`. Run `pnpm db:verify-role` against `DATABASE_URL` to
confirm RLS cannot be bypassed. Use a Production-only `MIGRATION_DATABASE_URL` if previews
should not migrate your database.

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
guide](./docs/pilot-readiness.md) for the required variables and review steps.
Never apply the tenant migration to production without planning this ownership
transition.

## Environment variables

| Variable | Required for | Description |
| --- | --- | --- |
| `DATABASE_URL` | Prisma client generation/configuration, database commands, and app runtime | PostgreSQL-compatible connection string. `.env.example` points to local development PostgreSQL. |
| `MIGRATION_DATABASE_URL` | `prisma migrate`, `pnpm db:seed` | Optional owner connection string; falls back to `DATABASE_URL`. Required when `DATABASE_URL` is a restricted role (the local Docker default). |
| `E2E_DATABASE_URL` | Playwright browser tests and E2E migration command | Dedicated test database connection string. `.env.example` points to a separate local database on port 5433. The database name must end in `_test` and target a different host/port/database from `DATABASE_URL`. |
| `BETTER_AUTH_SECRET` | App runtime and auth tests | Secret used to sign Better Auth sessions; use a random secret of at least 32 characters and keep it private. |
| `BETTER_AUTH_URL` | App runtime and auth tests | Canonical application origin, for example `http://localhost:3000` locally or the deployed HTTPS origin. |
| `S3_BUCKET` | Optional in development; required in production | Enables S3-compatible file storage (equipment photos) when set. If unset, development stores files on local disk and production refuses to start uploads. See [File storage](#file-storage). |
| `S3_ENDPOINT` | Optional | Custom endpoint for MinIO or another S3-compatible service (for example `http://localhost:9000`). Omit for AWS S3. |
| `S3_REGION` | Optional | Bucket region. Defaults to `us-east-1`. |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Required when `S3_BUCKET` is set | Storage credentials. For the bundled MinIO they are `minioadmin` / `minioadmin`. |
| `S3_FORCE_PATH_STYLE` | Optional | `true` or `false`. Defaults to `true` when `S3_ENDPOINT` is set, otherwise `false`. |
| `STORAGE_LOCAL_DIR` | Optional | Local-disk directory used when `S3_BUCKET` is unset. Defaults to `.storage` (git-ignored). |
| `RESEND_API_KEY` | Production verification, password recovery, and invitations | Resend API credential. Configure through a secret manager; no key is needed for local login/signup without email delivery. |
| `AUTH_EMAIL_FROM` | Production verification, password recovery, and invitations | Verified sender in Resend, e.g. `Maintenance Scheduler <accounts@example.com>`. |
| `ALLOW_PUBLIC_SIGNUP` | Optional (previews) | Set to `true` to allow anyone to sign up and create an organisation in production. Leave unset for the invite-only pilot. |
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

## File storage

Equipment photos are stored outside the database. Postgres keeps only a
`StoredFile` metadata row; the bytes live in object storage and are served
through the authenticated `/api/files/[id]` route.

- **Default (development):** with no `S3_*` variables, files are written under
  `.storage/`. Nothing else to set up.
- **MinIO (S3-compatible, local):** start it and create the bucket with
  `docker compose --profile storage up -d minio minio-init`, then uncomment the
  `S3_*` block in `.env` and restart `pnpm dev`. The MinIO console is at
  [http://localhost:9001](http://localhost:9001) (`minioadmin` / `minioadmin`).
- **Production:** set `S3_BUCKET` and credentials for AWS S3, MinIO, R2 or any
  S3-compatible service. Without `S3_BUCKET`, production refuses to store files.

## Production and staging operations

The repository does not provision production/staging resources or configure
provider-managed database backups, secret storage, monitoring, or alerting.
Before a pilot, deploy to an isolated staging environment first, use distinct
database URLs and auth secrets per environment, set the production HTTPS origin,
configure Resend, exercise the backup restore procedure, and run migrations
only after a reviewed backup. Readiness is available at `/api/health`.
See [docs/pilot-readiness.md](./docs/pilot-readiness.md) for the operational
procedure and known limitations. Row-level security and tenant isolation are described in [docs/tenant-isolation.md](./docs/tenant-isolation.md).

## Dependency management

The runtime is pinned to **Node.js 24** in `.node-version` and
`package.json`. The package manager is pinned to **pnpm 12.9.1** in
`package.json`, and `pnpm-lock.yaml` is committed. Keep the manifest and
lockfile in sync.

Inspect installed top-level versions with:

```sh
pnpm list --depth 0
```

Check available updates without applying a blanket upgrade:

```sh
pnpm outdated
```

To update one dependency, replace `TARGET_VERSION` with the version you have
reviewed:

```sh
pnpm add next@TARGET_VERSION
```

For a development dependency, use `pnpm add -D PACKAGE@TARGET_VERSION`.
`pnpm add` updates the manifest and lockfile for the named package; avoid
`pnpm update --latest` or other broad upgrades when the goal is to change only
one dependency.

For core dependency upgrades:

1. Check the current installed versions and the package's peer dependency and
   runtime requirements:

   ```sh
   pnpm list next react react-dom typescript prisma @prisma/client @prisma/adapter-pg @prisma/config --depth 0
   pnpm view PACKAGE@TARGET_VERSION peerDependencies engines
   ```

2. Read the target major version's official migration guide and release notes
   before changing versions. Upgrade only the intended package(s). For a
   coordinated framework upgrade, check the compatibility requirements of
   React, React DOM, their type packages, and the ESLint config. Keep Prisma
   packages (`prisma`, `@prisma/client`, `@prisma/adapter-pg`, and
   `@prisma/config`) on compatible versions.
3. Let pnpm update `package.json` and `pnpm-lock.yaml`; do not edit the lockfile
   manually. Review the diff to ensure unrelated dependency versions did not
   move.
4. Regenerate Prisma client code after Prisma/schema changes:

   ```sh
   pnpm db:generate
   ```

5. Verify the lockfile and run the quality checks:

   ```sh
   pnpm install --frozen-lockfile
   pnpm lint
   pnpm typecheck
   pnpm test:coverage
   pnpm build
   ```

6. Review compiler/framework deprecations and breaking-change notices. Fix
   deprecated configuration rather than silencing it with broad suppression
   options; for example, retain the explicit TypeScript `paths` aliases rather
   than reintroducing deprecated `baseUrl` configuration.

## CI

`.github/workflows/tests.yml` runs on pull requests and pushes to `main` and
`develop`. Its standard job uses the Node.js version in `.node-version` and
pnpm 12.9.1 and runs, in order:

1. `pnpm install --frozen-lockfile`
2. `pnpm lint`
3. `pnpm typecheck`
4. `pnpm build`
5. `pnpm test:coverage`

Coverage is uploaded as the `vitest-coverage` artifact for 14 days. The
separate browser job provisions its own PostgreSQL 17 service, applies
migrations, installs Chromium, and runs the Playwright suite without a hosted
database secret.

## Tenant lifecycle, export and recovery

Suspension, deletion with a grace period, soft delete, customer data export,
operator scripts (`pnpm ops:tenant`, `pnpm ops:purge-trash`) and the backup/restore
procedure are documented in [docs/tenant-lifecycle-and-recovery.md](docs/tenant-lifecycle-and-recovery.md).

## Troubleshooting

- **Prisma reports that `DATABASE_URL` is missing:** copy `.env.example` to
  `.env` before installing dependencies or running Prisma commands. Prisma
  configuration reads this variable, including during client generation.
- **The app cannot load scheduler data:** check that the database connection
  string is valid, the database is reachable, and
  `pnpm db:migrate:deploy` has been run against the intended database.
- **Playwright refuses the database URL:** its database name must end in
  `_test`. Use a dedicated database; do not bypass this guard or point tests
  at shared data.
- **Browser tests cannot launch Chromium:** install the browser with
  `pnpm exec playwright install chromium`. On CI's Ubuntu runner, the workflow
  installs Chromium and its system dependencies with
  `pnpm exec playwright install --with-deps chromium`.

## Development workflow

1. Select Node.js using `.node-version`, run `corepack enable`, and copy
   `.env.example` to `.env`.
2. Run `pnpm install --frozen-lockfile`.
3. Start local PostgreSQL with `pnpm db:up`; apply migrations with
   `pnpm db:migrate:deploy`; optionally run `pnpm db:seed`.
4. Start `pnpm dev` and work at `http://localhost:3000/en`.
5. Before opening a pull request, run `pnpm lint`, `pnpm typecheck`,
   `pnpm test:coverage`, and `pnpm build`.

## Project structure

```text
src/
  app/                  Next.js routes, layouts, and API endpoints
  components/ui/        Shared UI primitives
  features/
    auth/               Authentication flows and Better Auth configuration
    organization/       Tenant context, sites, invitations, and membership
    report/             Report services, PDF rendering, and report UI
    scheduler/          Equipment/task scheduling, server actions, and state
    worker/             Worker management UI and server actions
  i18n/                 Locale routing and translation messages
  lib/                  Shared infrastructure, including Prisma client setup
  styles/               Global styles
prisma/
  schema.prisma         Database schema
  migrations/           SQL migrations tracked in Git
  seeds/                Development fixture data
tests/e2e/              Playwright browser tests and database fixture lifecycle
vitest/                 Vitest stubs for Next.js modules
```
