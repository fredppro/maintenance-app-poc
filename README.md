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

## Scheduling maintenance

Use **Schedule Maintenance** in the scheduler header, or select an empty timeline
cell to prefill the equipment and date. The **Details** tab contains scheduling,
equipment, status, and worker assignments. **Execution** groups the checklist,
work logs, and materials; the edit sheet also has a **Notifications** tab.
Switching tabs preserves the draft, and submitting an invalid form opens the
first affected tab and focuses the field that needs attention.

The edit sheet's **Worksheet** menu previews or downloads the saved task report.
Preview opens in a separate tab so the editing session remains intact; save
changes first if they should appear in the report.

Maintenance search lives in the application header, immediately before the
language switcher. Activate it or press **Cmd+K** on Apple platforms /
**Ctrl+K** elsewhere to open the Command palette. Search by task title,
equipment/category, or worker name/email; the same query filters the timeline.
Use arrow keys and Enter to open a task, Escape to close, and **Clear search**
to restore the unfiltered schedule.

## Shared interface conventions

The [design-system reference](./docs/design-system.md) documents the full
component consistency matrix, implemented specifications, and exceptions.

The existing Geist family and light/dark background colors are preserved.
[Global tokens](./src/styles/globals.css) distinguish interactive controls from
structural surfaces:

- `--control-radius`: 20px; compact controls/textareas use
  `--control-radius-sm` (16px). Tabs use a 20px outer radius and 16px inset
  triggers. Cards, alerts, navigation, menus, and timeline containers retain
  the restrained existing `--radius` scale.
- `--control-height`: 40px; compact controls use `--control-height-sm`
  (36px), large/touch controls use `--control-height-lg` (44px). Use
  component size props (`size="sm"` or `controlSize="sm"`) instead of local
  height overrides. Embedded input actions and calendar cells retain compact
  proportions.
- `--field-gap`: 8px; `--form-gap`: 16px; `--section-gap`: 24px.
  Page padding is 16px, increasing to 24px on larger screens.
- `--letter-spacing-ui`: -0.015em, paired with 14px/20px control text.
  Text-entry fields retain 16px text on smaller screens to avoid mobile zoom.
- `--status-scheduled`, `--status-in-progress`, `--status-completed`, and
  `--status-cancelled` define blue, amber, green, and neutral maintenance
  states. [Status presentation](./src/features/scheduler/ui/task-status-presentation.ts)
  centralizes their use in task backgrounds, badges, selectors, and markers;
  task type does not determine the status color.

The shared [class merger](./src/lib/utils.ts) registers these custom Tailwind
scales, so component variants and deliberate compact overrides resolve
predictably instead of leaving conflicting utilities in the rendered markup.

## Documentation

- [Documentation index](./docs/README.md)
- [Full development setup, tests, and workflows](./docs/getting-started/development.md)
- [Current deployment architecture](./docs/operations/deployment-architecture.md)
- [Environment configuration reference](./docs/reference/configuration.md)
- [Dedicated database feasibility](./docs/architecture/dedicated-database-per-tenant.md)
- [Vercel + Neon fallback](./docs/operations/vercel-neon-fallback.md)
- [Current repository-evidence status](./docs/reference/environment-status.md)
- [Architecture: database and migrations](./docs/architecture/database-and-migrations.md)
- [Operations: deployment and release](./docs/operations/deployment-and-release.md)
