# Deployment and release

Repository deployment and release behavior. CI image publication is not proof of deployment; consult the [environment status record](../reference/environment-status.md) for unresolved live state.

## CI and container image release

GitHub Actions runs the unit and browser suites on pull requests and pushes to
`main` or `develop`. After both pass, it builds the production [Dockerfile](../../Dockerfile)
and scans the image for high and critical vulnerabilities. Pull requests do not
publish images; successful branch pushes publish an immutable commit-tagged image
to GHCR and expose its digest for a later staging/production promotion.

The GHCR package must be kept private. This workflow builds and publishes images;
it does not deploy to Coolify. On 2026-10-29, the operator confirmed both
staging and production are deployed. Coolify showed the staging app, database,
and Garage resource running, but the app had no health check; production was
not independently viewed. See [the environment status record](../reference/environment-status.md)
for the evidence and remaining verification.
## Production and staging operations

The repository does not provision production/staging resources or configure
provider-managed database backups, secret storage, monitoring, or alerting.
Before a pilot, verify that an isolated staging environment exists and is
healthy; use distinct database URLs and auth secrets per environment, set the
production HTTPS origin, configure Resend, exercise the backup restore
procedure, and run migrations only after a reviewed backup. Readiness is
available at `/api/health`.
See the [pilot-readiness guide](../planning/pilot-readiness.md) for the
operational procedure and known limitations. Row-level security and tenant
isolation are described in the [tenant-isolation guide](../architecture/tenant-isolation.md).
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
