# GDPR readiness (technical)

This is a technical readiness review. **It is not legal advice and the application is not certified or
declared GDPR compliant.** Lawful bases, DPAs, privacy notices and retention periods need human/legal review.

Companions: [privacy data map](data-map.md), [retention](data-retention.md),
[tenant isolation](../architecture/tenant-isolation.md), [lifecycle and recovery](../operations/tenant-lifecycle-and-recovery.md).

## Shared PostgreSQL: is it acceptable?

A shared database is not prohibited by GDPR; the question is isolation. Controls in place: `organizationId` on
every tenant table with composite foreign keys, PostgreSQL row-level security with `FORCE`, a restricted runtime
role (`NOSUPERUSER NOBYPASSRLS`, owns no tables, cannot modify the audit trail), transaction-local `app.org_id`
(safe with connection pooling), explicit application filtering, and a cross-tenant integration test.
`pnpm db:verify-role` checks these role properties against any environment.

Known limits:
- Better Auth tables (`user`, `member`, `invitation`, `session`) and the audit table are **not** under RLS; their
  isolation is application-level only.
- The owner connection used by migrations and operator scripts bypasses RLS.
  The repository does not establish where any deployed copy is stored. Keep it
  out of the application runtime, source control, and ordinary CI jobs; confirm
  its actual secret-store scope with the deployment owner.
- Backups contain all tenants together; tenant-level restore is a manual procedure.

Technical conclusion only: the application implements logical tenant-isolation
controls, but suitability for a pilot or early customers depends on legal and
product review plus validation of the deployed roles, providers, and operating
controls. Separate databases may be justified by a concrete contractual,
residency, or large-tenant requirement (`isolationTier` already reserves the
option).

Before onboarding real customer data, confirm the live hosting, database,
email, file-storage, and backup providers and regions; review their DPAs;
verify private access and encryption settings; configure and test independent
database and file recovery; establish retention and deletion behavior; publish
the privacy notice, terms, and sub-processor list; and decide audit retention.
The repository does not prove that these external controls are configured.

## Status

| Area | Status |
| --- | --- |
| Tenant isolation (RLS, role checks, tests) | Technically addressed; Better Auth tables app-level only |
| Audit trail integrity (append-only for runtime role) | Technically addressed |
| Logging privacy | Partially addressed in code: structured events scrub email/URL strings and redact sensitive-looking field names; error-message text is not covered by the same key-based redaction |
| Analytics | Code is gated by production and an explicit flag; live setting is unverified; legal review before enabling |
| Retention jobs, erasure primitives, export | Partially addressed; daily workflow definitions are conditional on external configuration and run success is unverified; no self-service DSR UI or per-user access report |
| Login/security-event audit | Successful sign-ins are audited (`auth.sign_in`); failed sign-ins are not (no organization to attach them to) |
| Encryption in transit/at rest | Provider and ingress settings are not established by repository code and remain **unverified**; no application-level encryption added since it would not reduce risk without a key-management story |
| Environments | Seed data is synthetic and refuses non-local databases; no technical policy prevents production dumps from being restored locally |
| Lawful basis, roles, DPAs, notices, breach procedure, retention periods | Requires product/legal decisions |

For repository evidence and the operator checks still open, see
[environment status](../reference/environment-status.md). This table is a code-level
readiness snapshot, not evidence that a control is enabled in a live system.

## Breach readiness

Audit events and JSON logs support investigation of admin actions, exports and membership changes. Gaps: failed sign-ins,
file-download access and read access are not audited. A draft [incident runbook](../operations/incident-response.md) exists;
the notification procedure needs legal review. `LEGAL/PRODUCT DECISION REQUIRED`.
