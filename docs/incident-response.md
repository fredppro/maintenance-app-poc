# Incident response runbook (draft)

Technical runbook for a suspected personal-data breach or tenant-isolation failure. Deadlines and notification
duties are legal matters: `LEGAL/PRODUCT DECISION REQUIRED` — have counsel confirm the process. Under GDPR Art. 33
a controller must notify the supervisory authority (in Portugal, the CNPD) without undue delay and, where
feasible, within 72 hours of becoming aware; processors must notify the controller without undue delay.

## 1. Detect and triage
- Sources: structured JSON logs (`level":"error"`), `/api/health`, customer reports, provider alerts.
- Record the time of awareness, reporter, and a one-line description. Assign an incident lead.

## 2. Contain
- Suspend an affected tenant: `pnpm ops:tenant suspend <orgId> "<reason>"`.
- Revoke sessions: delete rows from `session` (owner connection) for the affected user(s) or everyone.
- Rotate exposed secrets: `BETTER_AUTH_SECRET` (invalidates sessions), database passwords (`maintenance_app_runtime`,
  owner), `RESEND_API_KEY`, storage keys. Rotation is a manual, deliberate step.
- Block a bad deploy by redeploying the previous build; check `pnpm db:verify-role` against the database.

## 3. Investigate
- Audit trail: `organization_audit_event` (append-only for the app role) — sign-ins (`auth.sign_in`), exports
  (`export.requested/downloaded`), membership/role changes, deletions.
- Per-person view: `pnpm ops:privacy access-report <email>`.
- Logs: filter by `organizationId`; logs contain no secrets, URLs or email addresses.
- Not recorded today: failed sign-ins, file downloads, read access. State this limitation in the assessment.
- Determine: which tenants, which data categories, how many data subjects, whether data was exposed, altered or lost.

## 4. Recover
- Data loss/corruption: follow [tenant lifecycle and recovery](./tenant-lifecycle-and-recovery.md)
  (PITR, `restore-test.sh`, tenant export). After any restore, re-run erasure/purge jobs and re-apply logged erasure requests.

## 5. Notify and document
- Controller decisions and authority/data-subject notices are made by the responsible person with legal advice.
- Keep an incident record: timeline, data affected, cause, containment, notifications sent, follow-up actions.

## 6. Review
- Add a regression test for the root cause; update this runbook.
