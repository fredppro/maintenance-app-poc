# Data retention and deletion

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
| Backups | Daily dumps plus provider PITR | Bucket lifecycle rule (to be configured) |

Run all jobs with the owner connection (`MIGRATION_DATABASE_URL`). `.github/workflows/maintenance-jobs.yml` runs them daily once the `production-maintenance` environment has `MIGRATION_DATABASE_URL` and the `S3_*` secrets.

## Backups are not instantly erased

Deleting a row does not remove it from existing backups or provider PITR history. A deleted record disappears from
backups only when those backups expire. Set the backup retention (bucket lifecycle and Neon PITR window), publish it
to customers, and ensure restored data is re-purged: after any restore, re-run the erasure/purge jobs and re-apply
processed erasure requests (keep a log of them).

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
