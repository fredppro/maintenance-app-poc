# Scripts

Everything here is invoked through `pnpm <name>` (see `package.json`). Run
`pnpm check` before pushing.

| Folder | Purpose |
|---|---|
| `dev/` | Local environment setup |
| `db/` | Migrations helpers, role verification, backup and restore |
| `ops/` | Tenant lifecycle, retention and privacy operations |
| `legacy/` | One-off migration of pre-tenancy data |

## Commands by environment

| Command | Local dev | Test / CI | Staging / production |
|---|---|---|---|
| `pnpm up` / `pnpm down` | Docker-only dev stack | | |
| `pnpm bootstrap` | First-time host setup | | |
| `pnpm dev` | App with hot reload | | |
| `pnpm build` / `pnpm start` | | Build check | Serve (Vercel runs these) |
| `pnpm check` | lint + typecheck + unit tests | | |
| `pnpm lint`, `typecheck`, `test:run`, `test:coverage` | yes | CI | |
| `pnpm test:rls` | Needs `RLS_TEST_DATABASE_URL` | CI | |
| `pnpm test:e2e` | Needs `pnpm db:e2e:up` + `pnpm db:migrate:e2e` | CI | |
| `pnpm db:up` / `db:down` | Local Postgres | | |
| `pnpm db:migrate:dev` | Create a migration (local only) | | Never |
| `pnpm db:migrate:deploy` | Local | CI | Deploy step, owner credential |
| `pnpm db:migrate:status` | | | Check drift |
| `pnpm db:seed` | Sample data (refuses remote DBs) | | Never |
| `pnpm db:verify-role` | | | Run with the runtime `DATABASE_URL` |
| `pnpm db:backup`, `db:restore-test` | | | Scheduled (`backup.yml`) |
| `pnpm ops:tenant`, `ops:purge-trash`, `ops:retention`, `ops:privacy` | | | Scheduled (`maintenance-jobs.yml`) or manual, owner credential |
| `pnpm legacy:assign-owner`, `test:legacy-ownership` | | CI | One-off, only for pre-tenancy data |

Operational scripts load `MIGRATION_DATABASE_URL` (the owner role). Treat that
credential as deployment-only; never use it for the running application.
