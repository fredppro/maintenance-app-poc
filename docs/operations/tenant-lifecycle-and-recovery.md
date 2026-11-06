# Tenant lifecycle, data portability and recovery

**Operational status:** the procedures and recovery values in this document
are guidance and targets, not proof of configured backups or tested recovery.
Confirm current providers and evidence in
[environment status](../reference/environment-status.md) before relying on them.

## Creating a customer

Production sign-up is invite-only, so customers are created by an operator:

```sh
pnpm ops:tenant create "ACME Facilities" joao@acme.pt "Lisbon" [--locale pt-pt] [--no-email] [--allow-duplicate-name]
pnpm ops:tenant list          # status, owner (or the pending invitation), members, sites, equipment, last sign-in
```

`create` makes the organization, its first site and a 7-day pending **owner** invitation, records an `organization.provisioned` audit event and emails the link (it is always printed too, for when email is not configured). The owner opens the link, signs up with that exact address, accepts, and becomes the owner. It needs `BETTER_AUTH_URL` (the link base) and, to send the email, `RESEND_API_KEY` and `AUTH_EMAIL_FROM`. It refuses a company name that already exists unless `--allow-duplicate-name` is given.

The invitation's required inviter is a credential-less `platform-operator@system.invalid` user; it can be referenced but never signed in to.

## Getting started checklist

Owners and admins see a compact "Getting started" card at the top of the Schedule page. Nothing about progress is stored: each step is derived from organization data on every load — a site exists, equipment exists, a worker exists (a task needs one), a task exists, and the team step is done when there is a second member or a non-owner invitation was sent (the operator-created owner invitation does not count). Equipment and worker counts come from the tenant client (`db`, RLS), members and invitations from app-level tables filtered by `organizationId`; the logic is in `src/features/organization/server/onboarding.ts` and `shared/onboarding.ts`.

Hiding the card (the X, or "Dismiss" once everything is done) sets `tenant_settings.onboardingDismissedAt` for the whole organization; there is no restore control yet (clear the column to bring it back).

## Organization settings

Owners and admins (`manageOrganization`) edit the company profile and regional defaults on the **Organization** page: display name, optional contact email and phone, logo, time zone and default language. The organization is always the authenticated session's; the save writes only those fields (the name, never the slug, plus `tenant_settings.contactEmail/contactPhone/timezone/locale/logoFileId`) and never lifecycle state or membership. Changes are audited as `organization.settings_updated` with the field names only.

- **Logo:** a `StoredFile` of the organization (PNG/JPEG/WebP, validated by content on upload, resized in the browser), served by the authenticated `/api/files/<id>`. The `tenant_settings_same_tenant` trigger rejects another organization's file; `ON DELETE SET NULL` clears the logo if the file goes. Replacing or removing it deletes the old file unless equipment uses it.
- **Language:** the language of invitation links (`/<locale>/accept-invitation`). **Time zone:** the time zone of dates in generated PDF reports. The scheduler UI still shows times in the browser's time zone.
- Unset values fall back to `en` and `Europe/Lisbon`; the first save writes them explicitly.

## Tenant lifecycle

Each organization has a `tenant_settings` row (`status`, `isolationTier`). A missing row means `ACTIVE`.

| Status | Effect |
| --- | --- |
| `ACTIVE` | Normal operation. |
| `SUSPENDED` | Set by an operator. Every member is redirected to `/organization-status`; the report API answers 403. |
| `PENDING_DELETION` | Requested by an owner on `/organization`. Access is blocked for 30 days (`DELETION_GRACE_DAYS`); the owner can cancel from `/organization-status`. |

`isolationTier` is `POOLED` for every tenant. `DEDICATED` is reserved for a future per-tenant database; nothing reads it yet.

`getTenantContext` enforces status for application pages, server actions, and API routes that use it. Better Auth endpoints do not use this context, so lifecycle checks belong in their hooks. Invitation creation rejects inactive tenants; managers can still cancel an existing invitation.

Operator commands (owner database connection, `MIGRATION_DATABASE_URL`):

```sh
pnpm ops:tenant suspend <orgId> "reason"
pnpm ops:tenant reactivate <orgId>
pnpm ops:tenant purge-due     # permanently deletes organizations past the grace period, with their stored files
pnpm ops:purge-trash [days]         # permanently deletes soft-deleted equipment/tasks/workers older than 30 days by default
```

The optional `days` value must be a non-negative integer. A value of `0` makes all previously soft-deleted records eligible for immediate permanent deletion.

Schedule `purge-due` and `ops:purge-trash` daily from your job runner. Owners can also transfer ownership (`transferOrganizationOwnership`).

## Soft delete

Equipment, maintenance tasks and workers are soft-deleted (`deletedAt`, `deletedById`). The tenant client hides trashed rows from every query that does not mention `deletedAt`. Deleting equipment trashes its tasks with the same timestamp; `restoreEquipment` brings back exactly those. Restore actions exist for equipment, tasks and workers; there is no trash UI yet.

Known limits: unique names/emails still apply to trashed rows, nested includes are not filtered, and queries inside `db.transaction` must filter `deletedAt` themselves.

## Customer data export

Owners and admins request an export on `/organization`. A background job (`after()`) writes a ZIP to storage under `exports/<org>/<id>/<lease>.zip`; the database records the active object key. Export rows are preflighted in tenant-scoped repeatable-read pages using a conservative estimate for pretty JSON and CSV escaping. JSON/CSV entries and attachments are staged on disk, ZIP entries are written incrementally without compression, and the archive is uploaded as a stream. Downloads are streamed from storage to the authenticated HTTP response; neither the full attachment nor the full ZIP is intentionally buffered in application memory. ZIP entries use the stored method to avoid per-entry deflater allocations; the 64 MiB archive limit remains enforced, so exports that exceed it fail rather than being truncated.

The enforced export limits and disk admission budget are:

| Resource | Limit |
| --- | ---: |
| Query page | 64 rows |
| Serialized JSON or CSV row | 128 KiB |
| Total rows | 50,000 |
| Included attachment | 5 MiB actual bytes, checked while streaming |
| Total uncompressed entry data | 48 MiB |
| Completed archive | 64 MiB |
| Temporary disk reserved per active export | 120 MiB |
| Active exports across all application instances | 4 |
| Aggregate reserved temporary disk | 480 MiB |
| File/archive staging and upload I/O chunks | 64 KiB |

The opt-in synthetic 25,000-row test uses mock pages rather than PostgreSQL or S3; its rows are repetitive, compressible data and it is not a production benchmark. On Node 24.15.0, arm64 macOS, with `--expose-gc` and 10 ms `process.memoryUsage()` sampling, the latest run after switching to stored ZIP entries observed peak growth of 45,875,200 bytes RSS, 51,312,104 bytes heap-used, 5,645,853 bytes external memory, and 5,653,860 bytes ArrayBuffers. After two explicit GC cycles separated by an event-loop turn, heap-used, external memory, and ArrayBuffers returned to approximately baseline; RSS remained 46,120,960 bytes above baseline, consistent with allocator retention. The unchanged 160 MiB RSS, 80 MiB heap, and 32 MiB external-memory assertions passed. The host had 16 GiB physical RAM and no process memory limit exposed; these are development-host measurements, not VPS limits. Passing this synthetic test does not establish production memory safety or combined VPS capacity. Do not deploy four concurrent exports until representative PostgreSQL/Garage load tests have been run and an explicit per-instance concurrency budget has been set.

The database-backed four-slot reservation is global across application instances; it is not an in-process semaphore. Reservations are heartbeated every 30 seconds. A heartbeat older than two minutes is considered lost, but its slot remains reserved through a further two-minute reclaim grace so abandoned temporary files remain accounted for; successful and failed jobs release their slots immediately. An export that cannot reserve capacity remains pending and can be rescheduled by a later owner/admin request. After four minutes without a heartbeat, the reservation is reclaimed and its matching running export is marked failed. Stale local temporary directories are removed idempotently when a later export runs, only after the lease timeout plus reclaim grace and a database check confirms that the lease is inactive. This recovery is local to the application instance's temporary directory; it does not scan another instance's filesystem.

Per-export disk reservation covers the 48 MiB maximum staged input plus the 64 MiB maximum ZIP and operational headroom. It does not reserve disk for unrelated host workloads; monitor free space on the application filesystem and configure the host's maximum request/instance concurrency. Downloads consume bounded stream buffers rather than temporary disk, but there is no separate application-level concurrent-download semaphore; the hosting platform's connection/concurrency limits remain part of the deployment budget.

Monitor the `tenant_export_temp_reservation` table using the migration-owner/read-only operations connection (do not grant the runtime role direct table access), available temporary filesystem space, and export states/heartbeats. Relevant structured events include `export.admission_deferred`, `export.heartbeat_failed`, `export.lease_lost`, `export.reservation_release_failed`, and `export.temp_directories_recovered`. A reservation release or heartbeat error should be investigated; stale rows are reclaimed after the two-minute lease timeout plus the two-minute cleanup grace.

Before deploying this lifecycle, apply the `20261102120000_export_temp_reservations` migration and rerun `pnpm db:provision-role` so the restricted runtime role has function execution rights but no direct access to the global reservation table. Do not run that migration against production until existing migration status and a backup/rollback plan have been reviewed. Larger exports fail with a specific limit message; split the data or contact support rather than retrying the same oversized export.

- `data/<table>.csv` and `.json` for sites, sections, equipment (including trashed), relocations, tasks, maintenance points and checklists, operating-hour readings, assignments, daily worker hours, materials, inventory, reminders, workers, vendors, file metadata, members, invitations and audit events
- `files/<file id>-<name>` — the original uploads
- `manifest.json` — format version, row counts, files missing from storage

Exports read through the tenant client, so RLS confines them to the organization. They are rate limited (3/hour/org), audited (`export.requested`, `export.downloaded`), served only by the authenticated `/api/exports/<id>` route, and expire after 7 days. The daily `ops:retention` job also reconciles old, unreferenced per-lease objects for known export rows. Running leases and published `fileKey` objects are preserved; abandoned attempts for queued/failed exports have a 24-hour grace period, while attempts for an already expired export are removed with that export.

The runner records a lease heartbeat every 30 seconds. A subsequent owner/admin export request re-schedules pending work and reclaims a running job whose heartbeat is older than two minutes. This remains request-triggered job recovery, not a durable queue or autonomous retry service. A lost or failed lease heartbeat aborts database processing and streamed storage upload; storage provider errors fail the export and are not represented as a missing attachment.

## Maintenance task intervals

The database enforces `endTime IS NULL OR endTime > startTime`. The migration refuses to apply if existing tasks violate this invariant; inspect and correct those records before deploying it. Schedule edits also compare the stored interval during update so concurrent partial edits cannot silently overwrite one another.

## Audit trail

`organization_audit_event` records membership changes, soft delete/restore, deletion requests, exports and operator actions.

## Backups and recovery

Proposed targets to assess against the service contract (not measured or
committed): **RPO 24 h** with logical backups alone, **RPO ≤ 5 min** only if
provider point-in-time recovery is configured and verified; **RTO 4 h**.

Layers — replication is not a backup:

1. **Provider PITR.** If the deployed PostgreSQL provider offers point-in-time recovery, confirm that it is enabled and record its actual retention. No provider or PITR setting is established by this repository.
2. **Declared independent logical backup.** `.github/workflows/backup.yml` on
   `develop` defines a daily schedule and manual dispatch, and
   `scripts/db/backup/backup-db.sh` can copy a dump to `BACKUP_S3_URI`. The
   workflow is absent from the default-branch workflow list, and no backup run
   appears in the 14 recorded `develop` runs through 2026-10-15. It also skips
   when its database URL or destination URI is absent. Treat this as a
   repository implementation, not an active backup service. Configuration,
   execution, destination isolation, retention, and application restore are
   unverified. A separate account, restrictive credentials, and
   versioning/object lock are recommendations, not confirmed settings.
3. **Object storage.** Uploaded files and exports are separate from the database dump. Confirm the live storage service and configure an independent copy and recovery procedure; the application backup script does not copy these objects.

### Isolated restore test (not yet evidenced as run)

The repository restore helper creates a scratch database in a local Docker
PostgreSQL container and drops it on exit. Before using it, verify the Docker
context and container are disposable and local. Do not point it at production
or a shared database. The procedure has not been confirmed by a recorded
successful restore.

```sh
# Supply BACKUP_DATABASE_URL through a protected local environment first.
sh scripts/db/backup/backup-db.sh
sh scripts/db/backup/restore-test.sh backups/<dump-file>.dump
```

The backup may contain personal data. Keep it outside the repository, use
protected secret injection rather than a literal connection string in shell
history, and remove temporary local artifacts only under the approved retention
procedure.

### Generic recovery outline (not a tested production procedure)

1. Provision a new database; restore the latest dump (`pg_restore --no-owner`) or use PITR to the instant before the incident.
2. Run `pnpm db:migrate:deploy` with the owner URL, and create the restricted runtime role (`docker/db-init/01-app-role.sh` shows the grants).
3. Point `DATABASE_URL` / `MIGRATION_DATABASE_URL` at it, check `/api/health`, then smoke test.
4. Restore the file bucket if lost.

Single-tenant recovery: restore into a scratch database, then export that organization's rows (or re-import selected rows) — never overwrite the live database for one customer. User mistakes inside the 30-day window need no restore: use the restore actions.

## What is not built

Billing and entitlements, an external error tracker (errors are emitted as structured JSON by `src/instrumentation.ts`), a trash UI, and dedicated-database provisioning.
