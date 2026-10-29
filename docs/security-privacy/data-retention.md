# Data retention and deletion

The application rules below are implemented or represented in code; they do
not prove that scheduled jobs, provider policies, or backup expirations are
active in a deployed environment. Check
[environment status](../reference/environment-status.md) before making an operational or
customer-facing retention claim.

| Data | Rule | Mechanism |
| --- | --- | --- |
| Soft-deleted equipment, tasks, workers | Permanently removed after 30 days | `pnpm ops:purge-trash` (daily) |
| Organization pending deletion | 30-day grace, then rows and stored objects purged | `pnpm ops:tenant purge-due` (daily) |
| Expired sessions | Removed 7 days after expiry | `pnpm ops:retention` (daily) |
| Expired verification/reset tokens | Removed on expiry | `pnpm ops:retention` |
| Expired invitations | Removed 30 days after expiry | `pnpm ops:retention` |
| Rate-limit counters | Removed after 24 h | `pnpm ops:retention` |
| Tenant export archives | Expire after 7 days; object and row removed | `pnpm ops:retention` |
| Audit events | **No automatic deletion** | The runtime DB role cannot update or delete them (migration `20261010000000_privacy_hardening`) |
| Backups | The application backup workflow file declares a daily schedule on `develop`, but is absent from the default-branch workflow list; no backup run was found in the recorded `develop` runs through 2026-10-15. Provider PITR and actual backup retention are unknown. | The workflow may skip when required settings are absent; it is not evidenced as active. Bucket lifecycle, provider retention, and application backup/restore remain unverified. |

Run all jobs with the owner connection (`MIGRATION_DATABASE_URL`).
`.github/workflows/maintenance-jobs.yml` is scheduled daily and skips when
`MIGRATION_DATABASE_URL` is absent; the workflow definition does not establish
that its environment is configured or that any run succeeded. Confirm execution
and object-storage settings in the workflow and service logs before relying on
the jobs.

## Backups are not instantly erased

Deleting a row does not remove it from existing backups or provider PITR history. A deleted record disappears from
backups only when those backups expire. Set and publish the actual backup
retention after confirming provider and bucket policies; provider PITR and
object lifecycle settings are not established here. After an authorized
recovery, re-run the erasure/purge jobs and re-apply processed erasure requests
(keep a log of them).

## Data-subject requests

| Right | Support |
| --- | --- |
| Access / portability | Tenant export (ZIP of CSV+JSON, files). Per-user report: `pnpm ops:privacy access-report <email>`. |
| Rectification | Owners/admins edit worker and member data in the app. |
| Erasure | Users: `pnpm ops:privacy erase-user <email>` (blocked for sole owners). Workers: `eraseWorkerPersonalData`. Organizations: deletion workflow. |
| Restriction / objection | Operator workflow only (suspend tenant, trash record). |

`LEGAL/PRODUCT DECISION REQUIRED:` audit-event retention period, legal-hold rules, backup retention period, how
DSRs received from a customer's workers are routed (customer is the controller of that data), self-service
account deletion UI.
