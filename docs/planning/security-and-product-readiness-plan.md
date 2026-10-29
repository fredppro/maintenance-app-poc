# Security and product readiness plan

**Status:** Active, incremental plan based on a static repository review dated
2026-10-29 and the operator's scope clarification the same day. This is a work
plan, not evidence that any live control is enabled or tested.

## Goal and scope

Close the highest-risk authentication, upload, recovery, and operational gaps
for the VPS-hosted pooled multi-tenant SaaS. This is the active scope on
`develop`; dedicated databases per customer are explicitly out of scope for
now. Vercel is not a deployment target and may be considered only as a
last-resort fallback if the VPS approach becomes untenable.

The application already has production email-verification and password-reset
flows, invitation-based onboarding, tenant roles and PostgreSQL RLS, and
authenticated image uploads. Prioritize verification and hardening rather than
rebuilding those features. The operator-reported deployment and external
verification gaps are tracked in the
[environment status ledger](../reference/environment-status.md).

## Ordered work

| Order | Work item | Acceptance criteria | Dependencies / decisions | Status |
|---|---|---|---|---|
| 0 | Remove hosting-specific signup and verification overrides | Production account creation is limited to the bootstrap owner or invitations, and production email verification is required; neither policy depends on Vercel environment variables. Tests cover local signup and production enforcement. | None | **Done 2026-10-29** |
| 1 | Prove account and email lifecycle | Automated coverage for invitation signup, email verification, expired/invalid links, resend, password reset, and account enumeration behavior; staging delivery verified without recording tokens or secret values | Use a safe test inbox/provider; confirm sender and delivery operationally | Pending |
| 2 | Bound upload ingestion and fail closed on security throttles | Enforce a streamed request-body limit before multipart parsing; return 503 when the shared limiter is unavailable and 429 only when a configured limit is exceeded; cover upload, report, and export callers. Continue image decoding/dimension checks, re-encoding, organization quotas, and retryable object deletion as follow-up hardening. | Generic task/equipment documents remain a separate product-scope decision. | **Partially implemented 2026-10-29** |
| 3 | Establish application recovery | Active off-host database backup and independent file/object backup; isolated restore verifies app-level behavior and records measured recovery results | Confirm providers, destination, retention, access, and authorize isolated recovery work | Pending |
| 4 | Strengthen user-account security | Decide and implement MFA for organization owners/admins, session listing/revocation, and recovery/step-up behavior for sensitive actions | Select MFA methods and recovery policy | Pending |
| 5 | Improve security operations and release gates | Add actionable monitoring for auth abuse, upload failures, storage capacity, and backup failures; decide when dependency audit findings block release; evaluate a stricter nonce-based CSP | Confirm monitoring destination and alert recipients; assess Next.js CSP impact | Pending |
| 6 | Resolve deferred product-scope items | Explicitly accept or defer generic task/equipment attachments, maintenance reminders, a trash-restore UI, and self-service personal data requests. Dedicated-database-per-customer work is excluded from this plan. | Product/operator scope decisions for the listed product features | Pending |

## Evidence and boundaries

- Production signup is limited to the initial bootstrap owner and organization
  invitations, and production email verification is required. Neither policy
  has a Vercel-specific bypass.
- The upload endpoint accepts images, not arbitrary documents. It checks a
  declared `Content-Length` and bounds streamed request bytes before multipart
  parsing; the file service also enforces its image-size and format checks.
  Decoded-image safety, re-encoding, storage quotas, and deletion
  reconciliation remain open.
- Application rate-limit storage failures now fail closed. Upload, task-report,
  and export callers distinguish an exceeded limit (429) from an unavailable
  limiter (503); authentication endpoints also have explicit verification and
  invitation throttles.
- The application backup workflow is not evidenced as active, and database
  backups do not cover uploaded objects. A successful Coolify control-plane
  restore is not an application restore.
- The current product scope is pooled multi-tenancy on the VPS. Dedicated
  databases per customer are out of scope, not an available feature or a
  pending implementation task. Vercel is only a last-resort fallback.
- Do not inspect or record secret values, perform production restore tests,
  change live provider settings, or claim a deployment is healthy without new
  operator/system evidence.

## Validation record

- 2026-10-29: `signup-policy.test.ts` and `email-verification.test.ts` passed,
  19 tests total, after item 0.
- 2026-10-29: focused signup, email-verification, upload, report-rate-limit,
  and shared rate-limit tests passed (37 tests); application typecheck,
  targeted ESLint, documentation link check, and `git diff --check` passed
  after the current changes.
- Item 2 remains partial: decoded-image safety, re-encoding, storage quotas,
  and deletion reconciliation are not implemented.
- No work item in this plan constitutes external or live-system validation.
