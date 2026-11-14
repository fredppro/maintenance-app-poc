# Deployment architecture and current operating guide

This is the current entry point for deployment decisions. Repository behavior is
verified against the checked-in code; external service status is dated in the
[environment status record](../reference/environment-status.md). Do not treat
the intended topology as proof that production has been independently inspected.

## Strategy status

| Strategy | Status | Use |
| --- | --- | --- |
| Single VPS with a shared PostgreSQL database | **Primary and recommended.** The application implements pooled multi-tenancy, tenant-scoped queries, and PostgreSQL row-level security. The repository has a production container and a verified staging deployment path. Production topology and health remain only partly verified; see [environment status](../reference/environment-status.md). | The current self-hosted operating model. |
| Dedicated database per tenant | **Planned, not implemented.** `DEDICATED` exists as an enum value, but there is no tenant-to-database router or per-tenant connection registry. See [dedicated database architecture](../architecture/dedicated-database-per-tenant.md). | Consider only after a concrete isolation, recovery, or customer requirement justifies the added operational cost. |
| Vercel + Neon | **Fallback integration, not the preferred strategy.** Build and database URL handling exist in the repository, but no current Vercel/Neon deployment is verified. See [Vercel + Neon fallback](vercel-neon-fallback.md). | Reconsider only if the self-hosted operating model cannot meet an essential requirement and the change is explicitly approved. |

## Primary topology

The selected topology keeps Coolify, the application, and the shared PostgreSQL
service on one VPS. This is the intended production design, not proof of the
current production configuration.

```text
Internet
  │
  ├─ DNS → VPS public address → firewall → Coolify-managed HTTPS proxy
  │                                      └→ Next.js container (Node 24, port 3000)
  │                                           ├→ shared PostgreSQL
  │                                           ├→ S3-compatible file storage
  │                                           └→ Resend email API
  │
  └─ WireGuard → private SSH and Coolify administration
```

The application and database share the VPS failure domain in the selected
topology. Staging resources were observed on the Coolify `localhost` server;
the operator reported production deployed, but production placement was not
independently inspected. The production database provider/version, file-storage
provider/region, production DNS, and production health have not been
independently confirmed. Staging's inspected database was synthetic-data
PostgreSQL 17 and a Garage resource was present; the resource's application
integration and data location were not verified.

### Host, network, and ingress

- The host runbooks target a plain Ubuntu 24.04 LTS VPS. Re-verify the installed
  OS and provider before following them; do not treat historical host notes as
  a live inventory.
- DNS must resolve the application hostname to the intended VPS. Terminate TLS
  at the Coolify-managed ingress and use the exact HTTPS origin in
  `BETTER_AUTH_URL`. Production must not be exposed before HTTPS and the
  production origin are verified.
- Configure and verify the hostname's A record and, if used, AAAA record
  against the intended VPS addresses before issuing TLS. The production
  hostname and DNS provider are not established by this repository.
- The documented boundary allows public TCP `80`/`443` for web ingress and UDP
  `51820` for WireGuard. SSH (`22/tcp`), Coolify administration
  (`8000`/`6001`/`6002`), and PostgreSQL (`5432`) are intended to remain
  private; do not publish the database. Docker-published ports can bypass
  UFW, so verify provider and host firewall rules, including Docker forwarding.
- Use the [server bootstrap](server-bootstrap.md) and
  [WireGuard/admin access](wireguard-admin-access.md) runbooks for host setup
  and administration. The runbooks include dated observations and have
  untested recovery steps.
- Coolify is a privileged control plane on the same host. A control-plane or
  host compromise can affect the application, database, and secrets together.

The repository does not provision the VPS, install Coolify, create production
Coolify resources, configure DNS, or manage TLS certificates. Those are
operator-run steps. Confirm the current provider, host state, firewall, DNS,
Coolify version, and resource settings before applying historical runbook
instructions.

### Application and tenant data

- The production image is built from [Dockerfile](../../Dockerfile) and runs
  the Next.js standalone server on port `3000` as a non-root user. The project
  pins Node.js 24 in [.node-version](../../.node-version). The Dockerfile
  includes a health check for `/api/health`; an already-running image does not
  acquire that check until an image containing the Dockerfile change is built
  and deployed.
- The current data model uses `organizationId`, not a `tenant_id` column.
  Authentication and organization membership are read through the shared
  Prisma client. After membership is validated, `forTenant(organizationId)`
  runs tenant model operations in a transaction that sets the transaction-local
  PostgreSQL setting `app.org_id`; forced RLS policies use that setting. The
  runtime role is distinct from the database owner and must not bypass RLS.
  See [tenant isolation](../architecture/tenant-isolation.md).
- `DATABASE_URL` is the restricted application connection. `MIGRATION_DATABASE_URL`
  is the owner/migration connection. Keep them separate. `APP_DATABASE_URL`
  can explicitly override the runtime URL; it is not a migration URL.
- Local Docker Compose and CI use PostgreSQL 17. The production PostgreSQL
  version and pool limits are not established by the repository. No
  application-level pool sizing configuration is set in `src/lib/prisma.ts`;
  validate connection limits against the actual provider and replica count.
- Prisma schema changes belong in reviewed, committed migrations. Apply them
  with `pnpm db:migrate:deploy`; do not use `prisma db push` against a deployed
  database. For existing data, follow the guarded legacy ownership procedure
  in the [pilot-readiness guide](../planning/pilot-readiness.md).

### Build, migration, and deployment flow

The [tests workflow](../../.github/workflows/tests.yml) runs on PRs targeting
`main` or `develop`, and on pushes to `main`. For a PR, it runs the unit,
browser, integration, and image security checks, then uploads the validated
application and migration images as a 30-day artifact. Pushing a fix to the PR
branch reruns validation. The tests and security workflows do not run again
when the PR is merged to `develop`.

The [staging deployment workflow](../../.github/workflows/deploy-staging.yml)
runs on the push to `develop` produced by a PR merge, so its GitHub Environment
ref is `refs/heads/develop` and the `develop`-only deployment rule remains
effective. It requires successful test and security
runs for the exact PR head, verifies that the uploaded artifact's source tree
matches the merged commit, then promotes those already-tested images. It does
not rerun tests, rebuild the images, or rescan them. Missing, expired,
unsuccessful, or mismatched validation blocks deployment; a merge that is no
longer the current `develop` head is skipped to avoid rolling staging back.

Staging uses [docker-compose.staging.yml](../../docker-compose.staging.yml) as
an image-only Compose deployment. The `migrator` service always runs the
promoted migration image before the `app` service can start. Its
`prisma migrate deploy` applies pending migrations from the database migration
history and is a no-op when the database is already current; the workflow does
not infer migration needs from changed files. The migrator also provisions and
verifies the restricted runtime role. A migration failure prevents the app
service from starting and causes Coolify's deployment-status wait to fail
before the health/revision job runs. After Coolify reports success, the
separate health job requires two consecutive responses for the validated
revision; it can be rerun without redeploying.

Keep the owner `MIGRATION_DATABASE_URL` only in Coolify's staging environment
and pass it only to the migrator service. The application receives only the
restricted `DATABASE_URL`. Use backward-compatible expand/contract migrations:
the existing app may continue serving while the migration service runs.
Production deployment is not automated.

The workflow builds and scans a separate `migrator` image. Its entrypoint
applies committed migrations, provisions the restricted runtime role, and
verifies that role. The staging Compose dependency runs this exact promoted
image before the application rollout. Migrations are not automatically
reversed if the app deployment later fails; database changes must remain
compatible with the previous app version or have a separately reviewed
recovery plan.

Recommended operator-controlled release sequence (production automation is
not present in the repository):

1. Review the change and require the repository's CI checks to pass.
2. Verify a recoverable application-database backup and the file-backup
   situation before a schema or storage change. Current backup evidence and
   gaps are in [environment status](../reference/environment-status.md).
3. Use the migration image built from the same commit, with the target
   environment's owner `MIGRATION_DATABASE_URL` and restricted runtime
   `DATABASE_URL`. Confirm the migration and runtime-role checks succeed.
4. Deploy the matching application image digest through Coolify. Promote the
   tested artifact rather than rebuilding an untested image.
5. Check `/api/health`, its `X-Application-Revision` header, sign-in, a
   tenant-scoped read/write, and file access. Check Coolify's container health
   only after confirming the deployed image contains the Docker health check.
6. Roll back the application image by restoring the prior digest if needed.
   Database migrations are not automatically rolled back; schema changes must
   remain compatible with the previous application version or use an
   independently reviewed restore plan.

The staging deployment automation is gated by GitHub Environment configuration
and `STAGING_AUTODEPLOY_ENABLED`; the Compose migration gate additionally
requires `STAGING_COMPOSE_MIGRATION_ENABLED=true` and
`STAGING_COOLIFY_APP_UUID`. See
[deployment and release](deployment-and-release.md). Production promotion is
not encoded in that workflow. Confirm any Coolify pre-deploy or one-shot
Compose resource configuration directly; repository code does not prove that
the external Coolify application has been converted or its environment set up.

### First deployment checklist

1. Prepare and harden the host using the operator runbooks. Confirm VPN access,
   firewall policy, Coolify administration access, and a recovery path before
   creating application resources.
2. Create the target PostgreSQL resource on the private Coolify network. Do not
   expose its port publicly. Provision separate owner/migration and restricted
   runtime roles; configure `MIGRATION_DATABASE_URL` and `DATABASE_URL`
   separately.
3. Configure staging as a Docker Compose application using
   [docker-compose.staging.yml](../../docker-compose.staging.yml), with the
   staging domain routed to the `app` service. Keep the GHCR pull credential
   read-only. Configure the Coolify proxy, hostname, HTTPS, and
   `BETTER_AUTH_URL`. Production deployment remains operator-controlled and
   must follow its separately reviewed release procedure.
4. Configure the remaining required app variables using the
   [environment reference](../reference/configuration.md): Resend sender/key,
   bootstrap email only during first-owner setup, S3-compatible storage, and
   `CRON_SECRET` when a reminder scheduler is configured. Use separate values
   for staging and production.
5. Apply the migration image from the same commit, verify migrations and the
   runtime role, then deploy the app image. The repository does not currently
   encode this migration ordering in the staging deployment job.
6. Verify HTTPS, `/api/health`, the reported application revision, sign-in,
   tenant-scoped database operations, file upload/download, email delivery,
   and scheduled reminder execution. Do not use a successful health response
   as a substitute for these checks.

There is no checked-in Coolify resource export or complete production
provisioning script. If the required external resource configuration cannot be
confirmed, stop before exposing production traffic rather than inferring it
from the staging setup.

### Files, email, and scheduled work

- Uploads and exports use the S3-compatible storage interface. Production
  requires `S3_BUCKET` and credentials; local disk is development-only.
  Staging Garage was observed, but production storage and independent file
  backup are unverified. See [object storage](../architecture/object-storage.md).
- Transactional email uses Resend (`RESEND_API_KEY` and `AUTH_EMAIL_FROM`).
  Production readiness checks require those values.
- Automatic maintenance reminders are dispatched only when a scheduler calls
  `POST /api/cron/maintenance-reminders` with `Authorization: Bearer
  <CRON_SECRET>`. The route returns `503` if the app secret is missing and
  `401` if the caller's secret does not match. Configure the same secret in the
  app and scheduler, and verify a successful run and delivery; a configured
  schedule alone is not delivery evidence.
- The repository's daily `maintenance-jobs.yml` workflow handles retention,
  tenant purge, and durable object-deletion retries. It requires protected
  GitHub Environment secrets and skips when required configuration is absent.
  The separate `backup.yml` workflow is also conditional. Their existence does
  not prove either workflow is active or has succeeded.

### Health, logs, backups, and recovery

- `/api/live` is a liveness check and does not touch dependencies.
- `/api/health` is readiness: it checks database connectivity and required
  production email/bootstrap configuration. A 200 response does not prove
  backups, email delivery, object storage, or tenant isolation are healthy.
- Application logs are structured and redacted, but no external log collector,
  alert route, or retention policy is established in the repository. See
  [observability](observability.md).
- Coolify instance backups cover Coolify control-plane state, not the
  application's PostgreSQL database or uploaded objects. Database and file
  backups are separate and current application restore capability is
  unverified. See [Coolify backup and upgrade](coolify-backup-and-upgrade.md)
  and [tenant lifecycle and recovery](tenant-lifecycle-and-recovery.md).
- The replacement-VPS procedure is explicitly untested. The one-VPS design has
  no automatic failover; host, database, and Coolify failures can interrupt
  service together. No measured RPO, RTO, production capacity, or availability
  commitment is established.

## Troubleshooting

| Symptom | First checks |
| --- | --- |
| `/api/health` returns 503 | Check database reachability and production `RESEND_API_KEY`, `AUTH_EMAIL_FROM`, and initial `PILOT_BOOTSTRAP_EMAIL` setup. Inspect redacted application logs; do not print connection strings. |
| Container health is missing or unhealthy | Confirm the deployed image contains the Docker `HEALTHCHECK`; check `/api/health` from inside the container and inspect Coolify deployment logs. A repository change alone does not update a running image. |
| App deploy succeeds but reports an old revision | Compare `X-Application-Revision` with the expected commit. Check the image digest and Coolify deployment record; do not assume CI publication changed the running app. |
| Migration or role verification fails | Stop the app rollout. Confirm the owner and runtime URLs target the intended environment, review migration status, and inspect the first migration error. Do not substitute `db push` or the runtime role for the owner connection. |
| Reminder endpoint returns 401 or 503 | Confirm the app and scheduled caller use the same `CRON_SECRET`, that the caller uses the Bearer authorization header, and that Resend is configured. Never include the secret in a URL or log. |
| Upload or download fails | Check `S3_BUCKET`, endpoint/region/addressing mode, scoped application credentials, and provider reachability. Production cannot fall back to local disk. |

## Configuration and change conventions

- Put local development values in ignored `.env`; keep `.env.example` safe,
  local-only, and free of production credentials. `.gitignore` ignores `.env*`
  except `.env.example`.
- Store deployed secrets in the environment's approved secret store (Coolify
  for app resources; GitHub Environment secrets for protected workflows).
  Record names and consumers, never values, in documentation.
- When introducing or changing a variable, update its consuming code or
  workflow, `.env.example` when it is appropriate for developers, and the
  [configuration reference](../reference/configuration.md). State its
  environment, requiredness, precedence, and whether it is secret.
- Keep tenant database access behind the tenant context and RLS; add no
  provider-specific connection handling outside the documented database URL
  boundary without an architecture review.
- Add database changes as migrations and document the migration ordering,
  compatibility, backup, and recovery requirements.
- Re-review this guide, the relevant runbook, and
  [environment status](../reference/environment-status.md) whenever the
  hosting provider, network path, deployment automation, scheduled jobs, or
  backup process changes.

## Related strategy guides

- [Dedicated database per tenant](../architecture/dedicated-database-per-tenant.md)
- [Vercel + Neon fallback](vercel-neon-fallback.md)
- [Environment configuration reference](../reference/configuration.md)
- [Deployment and release details](deployment-and-release.md)
