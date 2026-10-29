# Scripts

Most scripts here are invoked through `pnpm <name>` (see `package.json`). Run
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
| `pnpm build` / `pnpm start` | | Build check | Run the built app in a container or compatible host |
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
| `pnpm db:backup` | Manual dump; optional S3 upload | | Scheduled workflow exists; configuration and successful runs unverified |
| `pnpm db:restore-test` | Disposable local Docker database only | | Do not point at production; an isolated restore has not been verified |
| `pnpm ops:tenant create` / `list` | | | Manual: onboard a customer, inspect customers (owner credential) |
| `pnpm ops:tenant` (other commands), `ops:purge-trash`, `ops:retention`, `ops:privacy` | | | Scheduled (`maintenance-jobs.yml`) or manual, owner credential |
| `pnpm legacy:assign-owner`, `test:legacy-ownership` | | CI | One-off, only for pre-tenancy data |

`ops/garage-storage-usage.sh` is a read-only VPS utility, not a `pnpm` command.
Copy it to the VPS and run it with `sudo`, as documented in
[runbook 04](../docs/operations/storage-capacity-and-portability.md). It reports host,
Docker-mount, and Garage bucket usage separately.

Operational scripts load `MIGRATION_DATABASE_URL` (the owner role). Treat that
credential as deployment-only; never use it for the running application.
The checked-in backup and maintenance workflows are conditional on external
configuration; their schedules do not prove that a job ran or that its output
is recoverable. See [the environment status record](../docs/reference/environment-status.md).
