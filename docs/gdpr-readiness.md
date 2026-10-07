# GDPR readiness (technical)

This is a technical readiness review. **It is not legal advice and the application is not certified or
declared GDPR compliant.** Lawful bases, DPAs, privacy notices and retention periods need human/legal review.

Companions: [privacy data map](./privacy-data-map.md), [retention](./data-retention.md),
[tenant isolation](./tenant-isolation.md), [lifecycle and recovery](./tenant-lifecycle-and-recovery.md).

## Shared PostgreSQL: is it acceptable?

A shared database is not prohibited by GDPR; the question is isolation. Controls in place: `organizationId` on
every tenant table with composite foreign keys, PostgreSQL row-level security with `FORCE`, a restricted runtime
role (`NOSUPERUSER NOBYPASSRLS`, owns no tables, cannot modify the audit trail), transaction-local `app.org_id`
(safe with connection pooling), explicit application filtering, and a cross-tenant integration test.
`pnpm db:verify-role` checks these role properties against any environment.

Known limits:
- Better Auth tables (`user`, `member`, `invitation`, `session`) and the audit table are **not** under RLS; their
  isolation is application-level only.
- The owner connection (migrations, operator scripts) bypasses RLS and sits in `.env` for Neon. Keep it out of the
  deployed application and CI runtime, and rotate it if exposed.
- Backups contain all tenants together; tenant-level restore is a manual procedure.

Conclusion: reasonable for a pilot and early customers with strong logical isolation. Separate databases are
justified only by a concrete contractual, residency or large-tenant requirement (`isolationTier` already reserves
the option).

Before onboarding real customer data: confirm EEA regions and DPAs for Neon, Vercel, Resend and the bucket; make
the bucket private and encrypted; enable Neon PITR; configure the off-site backup and a lifecycle rule; schedule
the daily jobs; publish the privacy notice, terms and sub-processor list; decide audit retention.

## Status

| Area | Status |
| --- | --- |
| Tenant isolation (RLS, role checks, tests) | Technically addressed; Better Auth tables app-level only |
| Audit trail integrity (append-only for runtime role) | Technically addressed |
| Logging privacy (structured, secrets/URLs/emails redacted) | Technically addressed |
| Analytics | Off by default; legal review before enabling |
| Retention jobs, erasure primitives, export | Partially addressed (jobs unscheduled; no self-service DSR UI or per-user access report) |
| Login/security-event audit | Successful sign-ins are audited (`auth.sign_in`); failed sign-ins are not (no organization to attach them to) |
| Encryption in transit/at rest | Provided by providers (TLS, Neon and bucket encryption) — **to be verified**; no application-level encryption added since it would not reduce risk without a key-management story |
| Environments | Seed data is synthetic and refuses non-local databases; no policy prevents production dumps from being restored locally beyond process |
| Lawful basis, roles, DPAs, notices, breach procedure, retention periods | Requires product/legal decisions |

## Breach readiness

Audit events and JSON logs support investigation of admin actions, exports and membership changes. Gaps: failed sign-ins,
file-download access and read access are not audited. A draft [incident runbook](./incident-response.md) exists;
the notification procedure needs legal review. `LEGAL/PRODUCT DECISION REQUIRED`.
