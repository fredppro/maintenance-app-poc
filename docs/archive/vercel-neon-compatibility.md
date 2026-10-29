# Historical Vercel and Neon compatibility

This retained integration is not a recommendation or evidence that these providers are currently deployed. The current environment status is recorded separately.

### Historical Vercel / Neon compatibility path

The following describes a retained deployment integration, not the current
deployment or an assertion that these providers are configured. Current live
provider and environment status are recorded as unverified in
[the environment status record](../reference/environment-status.md).

For a Vercel deployment with Neon, the integration's pooled endpoint may be
appropriate when the deployment creates many short-lived connections; verify
connection limits and provider-specific TLS or pooler options.

Vercel runs `pnpm vercel-build` automatically. It applies migrations
(`prisma migrate deploy`, with the owner connection: `MIGRATION_DATABASE_URL`, else the integration's
`DATABASE_URL_UNPOOLED`), then creates or updates the restricted runtime role
(`pnpm db:provision-role`, idempotent), then builds. With the Neon integration, `DATABASE_URL` is the
owner; on Vercel the app and the build derive a restricted role from it, named
`maintenance_runtime_<VERCEL_ENV>` (for example `maintenance_runtime_production`), with a password
derived from `BETTER_AUTH_SECRET`. Each environment has its own role because every build resets its role's
password. Keep `BETTER_AUTH_SECRET` identical between builds of the same environment, and run
`pnpm db:verify-role` against the deployed runtime connection to confirm RLS cannot be bypassed.
`APP_DATABASE_URL`, when set, takes priority over the derivation (the owner-role scripts ignore it).
Use a Production-only `MIGRATION_DATABASE_URL` if previews should not migrate your database.

