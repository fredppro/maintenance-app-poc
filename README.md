# Maintenance Scheduler

A maintenance-planning web application for scheduling equipment work, assigning
internal and external workers, tracking materials, and generating task reports.
The application is built with Next.js 16, React 19, TypeScript, and Prisma 7.
Its PostgreSQL connection is configured through `DATABASE_URL`; the same app
uses PostgreSQL and can be configured for a compatible provider. Provider
compatibility in code does not establish which provider or region is currently
deployed; see [the environment status record](docs/reference/environment-status.md).

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
[configuration reference](./docs/reference/configuration.md)). Everything else is optional
in development. Without them the server fails at startup with a message such as
`BETTER_AUTH_SECRET must contain at least 32 characters`.

Stop the local PostgreSQL service without deleting its data with
`pnpm db:down`. The detailed setup and test instructions below cover other
workflows and production configuration.

## Documentation

- [Documentation index](./docs/README.md)
- [Full development setup, tests, and workflows](./docs/getting-started/development.md)
- [Current repository-evidence status](./docs/reference/environment-status.md)
- [Architecture: database and migrations](./docs/architecture/database-and-migrations.md)
- [Operations: deployment and release](./docs/operations/deployment-and-release.md)
