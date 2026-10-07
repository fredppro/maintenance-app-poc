# Observability, DB reliability and CI checks

## Endpoints
- `GET /api/live` — liveness. Process is up; touches no dependency. Use for restart decisions.
- `GET /api/health` — readiness. Database reachable and production config valid; returns no internal detail. Use for traffic and uptime checks.

## Logging
`src/lib/logger.ts` emits structured JSON and redacts emails, URLs and secrets. Use `logEvent`, never `console.*`, in server code.

## Database checks
`pnpm db:verify-role` (run it against the runtime `DATABASE_URL`) fails if the runtime role is superuser/BYPASSRLS/CREATEDB/CREATEROLE, owns tables, can create in `public`, can modify the audit table, or if `public` has SECURITY DEFINER functions, views, or an `organizationId` table without RLS (other than the documented app-level-only tables).

Slow queries: enable `pg_stat_statements` on the Neon project (Neon supports it) and review the top queries by total time periodically.

## CI
- `.github/workflows/security.yml`: gitleaks (full history), `pnpm audit --prod` (advisory: there is an existing backlog of high/critical advisories to triage, then drop `continue-on-error`), `prisma validate`.
- `.github/dependabot.yml`: weekly npm and Actions updates.

## Deliberately deferred
| Item | Why |
|---|---|
| Prometheus / Grafana / Loki | Needs infrastructure the product does not run yet; Vercel + Neon dashboards suffice for now. |
| Sentry / OpenTelemetry | Adds a data processor (personal data in traces/errors): needs a DPA, region choice and scrubbing config first. |
| Idempotency keys, background job queue | No endpoint currently needs them; exports and retention run as scripted jobs. Revisit with email/webhooks/billing. |
| OpenAPI, feature flags | No public API or flag requirement yet. |
| Request IDs | Add in `src/proxy.ts` together with the logger when a tracing backend is chosen. |
