# Development setup and workflows

Detailed local setup, development, and test guidance. Start with the short [repository README](../../README.md); see the [documentation index](../README.md) for other topics.

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
See [the pilot-readiness guide](../planning/pilot-readiness.md) for the permission
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
