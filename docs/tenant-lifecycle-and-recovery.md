# Tenant lifecycle, data portability and recovery

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

## Tenant lifecycle

Each organization has a `tenant_settings` row (`status`, `isolationTier`). A missing row means `ACTIVE`.

| Status | Effect |
| --- | --- |
| `ACTIVE` | Normal operation. |
| `SUSPENDED` | Set by an operator. Every member is redirected to `/organization-status`; the report API answers 403. |
| `PENDING_DELETION` | Requested by an owner on `/organization`. Access is blocked for 30 days (`DELETION_GRACE_DAYS`); the owner can cancel from `/organization-status`. |

`isolationTier` is `POOLED` for every tenant. `DEDICATED` is reserved for a future per-tenant database; nothing reads it yet.

`getTenantContext` enforces the status on every server action, page and API route, so there is no separate check to forget.

Operator commands (owner database connection, `MIGRATION_DATABASE_URL`):

```sh
pnpm ops:tenant suspend <orgId> "reason"
pnpm ops:tenant reactivate <orgId>
pnpm ops:tenant purge-due     # permanently deletes organizations past the grace period, with their stored files
pnpm ops:purge-trash [days]         # permanently deletes soft-deleted equipment/tasks/workers older than 30 days
```

Schedule `purge-due` and `ops:purge-trash` daily from your job runner. Owners can also transfer ownership (`transferOrganizationOwnership`).

## Soft delete

Equipment, maintenance tasks and workers are soft-deleted (`deletedAt`, `deletedById`). The tenant client hides trashed rows from every query that does not mention `deletedAt`. Deleting equipment trashes its tasks with the same timestamp; `restoreEquipment` brings back exactly those. Restore actions exist for equipment, tasks and workers; there is no trash UI yet.

Known limits: unique names/emails still apply to trashed rows, nested includes are not filtered, and queries inside `db.transaction` must filter `deletedAt` themselves.

## Customer data export

Owners and admins request an export on `/organization`. A background job (`after()`) writes a ZIP to storage under `exports/<org>/<id>.zip`:

- `data/<table>.csv` and `.json` for sites, sections, equipment (including trashed), relocations, tasks, assignments, materials, workers, vendors, file metadata, members and audit events
- `files/<file id>-<name>` — the original uploads
- `manifest.json` — format version, row counts, files missing from storage

Exports read through the tenant client, so RLS confines them to the organization. They are rate limited (3/hour/org), audited (`export.requested`, `export.downloaded`), served only by the authenticated `/api/exports/<id>` route, and expire after 7 days.

## Audit trail

`organization_audit_event` records membership changes, soft delete/restore, deletion requests, exports and operator actions.

## Backups and recovery

Targets to adopt (adjust to contract): **RPO 24 h** with logical backups alone, **RPO ≤ 5 min** once provider point-in-time recovery is enabled; **RTO 4 h**.

Layers — replication is not a backup:

1. **Provider PITR** (Neon history retention / managed Postgres PITR). Enable it and set retention to your RPO; this is not configurable from this repository.
2. **Independent logical backup.** `.github/workflows/backup.yml` runs `scripts/db/backup/backup-db.sh` daily and copies the dump to `BACKUP_S3_URI`. Use a bucket in a different account/provider whose write-only credentials the application and database cannot delete (enable object lock/versioning). The workflow skips itself until the `BACKUP_*` secrets exist.
3. **Object storage.** Uploaded files and exports live in the S3 bucket. Enable bucket versioning and cross-region replication or a scheduled copy; the database dump alone does not contain files.

Restore test (do this before go-live and on a schedule):

```sh
BACKUP_DATABASE_URL=<unpooled owner url> sh scripts/db/backup/backup-db.sh
sh scripts/db/backup/restore-test.sh backups/<file>.dump   # restores into a scratch DB, verifies, drops it
```

Recovery procedure:

1. Provision a new database; restore the latest dump (`pg_restore --no-owner`) or use PITR to the instant before the incident.
2. Run `pnpm db:migrate:deploy` with the owner URL, and create the restricted runtime role (`docker/db-init/01-app-role.sh` shows the grants).
3. Point `DATABASE_URL` / `MIGRATION_DATABASE_URL` at it, check `/api/health`, then smoke test.
4. Restore the file bucket if lost.

Single-tenant recovery: restore into a scratch database, then export that organization's rows (or re-import selected rows) — never overwrite the live database for one customer. User mistakes inside the 30-day window need no restore: use the restore actions.

## What is not built

Billing and entitlements, an external error tracker (errors are emitted as structured JSON by `src/instrumentation.ts`), a trash UI, and dedicated-database provisioning.
