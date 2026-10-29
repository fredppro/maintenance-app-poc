# Observability, DB reliability and CI checks

## Endpoints
- `GET /api/live` — liveness. Process is up; touches no dependency. Use for restart decisions.
- `GET /api/health` — readiness. Database reachable and production config valid; returns no internal detail. Use for traffic and uptime checks.

## Logging
`src/lib/logger.ts` emits structured JSON. It scrubs email and URL strings and
redacts values under sensitive-looking field names. For `Error` values, only
the message is scrubbed for URLs and email addresses; arbitrary secrets in an
error message are not removed by field-name redaction. Avoid placing secrets in
error messages, and do not treat the logger as a substitute for review.
Application code uses `logEvent` for structured events; a few fixed readiness
and health events also use `console.error`. No live log collector, retention
period, alert route, or access policy is established by this repository.

## Database checks
`pnpm db:verify-role` (run it against the runtime `DATABASE_URL`) fails if the runtime role is superuser/BYPASSRLS/CREATEDB/CREATEROLE, owns tables, can create in `public`, can modify the audit table, or if `public` has SECURITY DEFINER functions, views, or an `organizationId` table without RLS (other than the documented app-level-only tables).

Slow-query analysis is provider-specific. If the deployed PostgreSQL service
supports `pg_stat_statements`, an operator may enable it and review total query
time; the current provider and extension settings are unverified.

## CI
- `.github/workflows/security.yml`: gitleaks (full history), `pnpm audit --prod` (advisory: there is an existing backlog of high/critical advisories to triage, then drop `continue-on-error`), `prisma validate`.
- `.github/dependabot.yml`: weekly npm and Actions updates.

## Deliberately deferred
| Item | Why |
|---|---|
| Prometheus / Grafana / Loki | No collector configuration is present in the repository; the live monitoring stack is unverified. |
| Sentry / OpenTelemetry | Adds a data processor (personal data in traces/errors): needs a DPA, region choice and scrubbing config first. |
| Idempotency keys, background job queue | No endpoint currently needs them; exports and retention run as scripted jobs. Revisit with email/webhooks/billing. |
| OpenAPI, feature flags | No public API or flag requirement yet. |
| Request IDs | Add in `src/proxy.ts` together with the logger when a tracing backend is chosen. |
