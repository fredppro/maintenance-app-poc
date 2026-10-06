# Maintenance Scheduler

A maintenance-planning web application for scheduling equipment work, assigning
internal and external workers, tracking materials, and generating task reports.
The application is built with Next.js 16, React 19, TypeScript, and Prisma 7.
Its PostgreSQL connection is configured through `DATABASE_URL`; the same app
can use local PostgreSQL, Neon, or another PostgreSQL provider.

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

The example values target the local Compose databases. For a hosted database,
replace the relevant URL with your provider's PostgreSQL connection string.
Keep credentials private; do not commit `.env`.

Install dependencies:

```sh
pnpm install --frozen-lockfile
```

The install runs the package `postinstall` script, which generates the Prisma
client in `prisma/generated/prisma`. You can regenerate it explicitly after
changing the Prisma schema:

```sh
pnpm prisma:generate
```

Start the local development database:

```sh
pnpm db:up
```

Apply the committed migration history to the local database:

```sh
pnpm prisma:migrate:deploy
```

This command applies pending migrations and does not reset or drop existing
data. Stop (but retain) the local database with `pnpm db:down`.

Optionally, add the sample equipment, vendors, workers, and maintenance tasks:

```sh
pnpm prisma:seed
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
pnpm prisma:migrate:e2e
```

Install Chromium and run the browser tests:

```sh
pnpm exec playwright install chromium
pnpm test:e2e
```

The suite runs with one worker. Its setup creates named fixture equipment and a
worker; teardown removes tasks with the `E2E - Playwright` title prefix and
those specific fixtures. Stop the E2E service with `pnpm db:e2e:down`. It has
no persistent volume; removing its container with
`docker compose --profile e2e down` discards its data.

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
- Generated Prisma client: `prisma/generated/prisma/` (ignored by Git and
  generated during install).
- Local PostgreSQL services: `docker-compose.yml` (`pnpm db:up` and
  `pnpm db:e2e:up`).
- Apply committed migrations safely: `pnpm prisma:migrate:deploy`.
- Create a migration during development: `pnpm prisma:migrate:dev`. Use this
  only with the local development database; review and commit the SQL.
- `pnpm prisma:push` remains available for intentional prototyping, but it
  bypasses migration history and is not the normal setup or deployment path.
- Development data command: `pnpm prisma:seed`.

`DATABASE_URL` is the application's only connection setting. The Prisma schema
and client use PostgreSQL; switching between compatible PostgreSQL providers
does not require application-code changes. Supply the provider's connection URL
and any provider-required TLS or pooler options. For Neon production, prefer
its pooled endpoint when the deployment creates many short-lived connections.
Connection limits, TLS, and pooler behavior remain provider-specific settings.

The committed migration history initializes the schema, including the
historical `MaterialConsumed` creation and rename migrations. A forward
migration adds `Material.price` and worker assignment times with
`ADD COLUMN IF NOT EXISTS`, accommodating databases where those fields already
exist. Apply migrations in deployment with `pnpm prisma:migrate:deploy`; check
`pnpm exec prisma migrate status` against an existing database before rollout.

## Environment variables

| Variable | Required for | Description |
| --- | --- | --- |
| `DATABASE_URL` | Prisma client generation/configuration, database commands, and app runtime | PostgreSQL-compatible connection string. `.env.example` points to local development PostgreSQL. |
| `E2E_DATABASE_URL` | Playwright browser tests and E2E migration command | Dedicated test database connection string. `.env.example` points to a separate local database on port 5433. The database name must end in `_test` and target a different host/port/database from `DATABASE_URL`. |

Playwright reads `E2E_DATABASE_URL` for its server and fixtures. The
`pnpm prisma:migrate:e2e` command validates and uses that URL without changing
the development database configuration.

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
   pnpm prisma:generate
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

## Troubleshooting

- **Prisma reports that `DATABASE_URL` is missing:** copy `.env.example` to
  `.env` before installing dependencies or running Prisma commands. Prisma
  configuration reads this variable, including during client generation.
- **The app cannot load scheduler data:** check that the database connection
  string is valid, the database is reachable, and
  `pnpm prisma:migrate:deploy` has been run against the intended database.
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
   `pnpm prisma:migrate:deploy`; optionally run `pnpm prisma:seed`.
4. Start `pnpm dev` and work at `http://localhost:3000/en`.
5. Before opening a pull request, run `pnpm lint`, `pnpm typecheck`,
   `pnpm test:coverage`, and `pnpm build`.

## Project structure

```text
src/
  app/                  Next.js routes, layouts, and API endpoints
  components/ui/        Shared UI primitives
  features/
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
