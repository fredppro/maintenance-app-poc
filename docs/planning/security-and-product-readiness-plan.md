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
| 1 | Prove account and email lifecycle | Automated coverage for invitation signup, email verification, expired/invalid links, resend, password reset, and account enumeration behavior; staging delivery verified without recording tokens or secret values | Use a safe test inbox/provider; confirm sender and delivery operationally | **Partially covered 2026-10-29; real delivery and full lifecycle validation pending** |
| 2 | Bound upload ingestion and fail closed on security throttles | Bound streamed request bytes before multipart parsing; decode and re-encode only PNG/JPEG/WebP images with dimension and pixel limits; return 503 when the shared limiter is unavailable and 429 when a configured limit is exceeded. Add organization storage quotas and safe orphan detection/remediation as follow-up hardening. | Generic task/equipment documents remain a separate product-scope decision. | **Core ingestion, throttling, durable deletion outbox, and maintenance runner implemented 2026-10-29; read-only aged-object inventory added 2026-10-30; quota policy and safe automated orphan remediation remain open** |
| 3 | Establish application recovery | Active off-host database backup and independent file/object backup; isolated restore verifies app-level behavior and records measured recovery results | Confirm providers, destination, retention, access, and authorize isolated recovery work | Pending |
| 4 | Strengthen user-account security | Decide and implement MFA for organization owners/admins, session listing/revocation, and recovery/step-up behavior for sensitive actions | Select MFA methods and recovery policy | **Session listing/revocation and 24-hour fresh-session password step-up implemented; MFA and recovery policy remain open** |
| 5 | Improve security operations and release gates | Add actionable monitoring for auth abuse, upload failures, storage capacity, and backup failures; decide when dependency audit findings block release; evaluate a stricter nonce-based CSP | Confirm monitoring destination and alert recipients; assess Next.js CSP impact | Pending |
| 6 | Resolve deferred product-scope items | Explicitly accept or defer generic task/equipment attachments, maintenance reminders, a trash-restore UI, and self-service personal data requests. Dedicated-database-per-customer work is excluded from this plan. | Product/operator scope decisions for the listed product features | Pending |

## Evidence and boundaries

- Production signup is limited to the initial bootstrap owner and organization
  invitations, and production email verification is required. Neither policy
  has a Vercel-specific bypass.
- Signup policy, invitation callback propagation, verification resend, and
  password-reset UI behavior have focused tests. The reset-request completion
  message is generic, and a rejected reset token produces a generic error.
  These tests do not prove Better Auth's full token lifecycle (including
  expiration and invalid verification links) or delivery through the deployed
  email provider.
- The upload endpoint accepts images, not arbitrary documents. It checks a
  declared `Content-Length` and bounds streamed request bytes before multipart
  parsing. The file service decodes and re-encodes single-frame PNG, JPEG, and
  WebP images, rejects inputs above 16 megapixels or 8,192 pixels per edge,
  resizes stored output to 4,096 pixels per edge, and enforces the 5 MiB
  source/output limit. Object deletion is recorded in a tenant-isolated
  PostgreSQL outbox before file metadata is removed. Failures are retained and
  retried with bounded exponential backoff; the scheduled maintenance workflow
  has a runner step, but live workflow configuration/execution is not verified.
  Upload cleanup is also queued if storage cleanup fails and the database can
  accept the outbox row. A simultaneous database/storage failure can still
  leave an untracked object. A read-only aged-object inventory command now
  supports orphan detection. It requires an explicit age threshold, uses a
  separate read-only S3 list credential, and never deletes or queues objects.
  Automated orphan remediation and organization storage quotas remain open.
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

- 2026-10-29: focused signup, email-verification, password-reset, upload,
  storage, report-rate-limit, and shared rate-limit tests passed (63 tests
  across 8 files). Application typecheck, targeted ESLint, documentation link
  check, and `git diff --check` passed.
- 2026-10-29: production build succeeded with temporary non-secret build
  settings; Sharp loaded and processed an image from the standalone output.
  The build emitted a dynamic-filesystem tracing warning from the existing
  local-storage path.
- 2026-10-29: `appmod-cve-assessment` found no known CVEs in Sharp 0.35.5 and
  the scanned runtime dependency closure. This was a targeted dependency scan,
  not a full-project audit.
- 2026-10-29: the prior incremental cleanup behavior and invitation callback
  coverage passed 38 focused tests across 5 files;
  typecheck, targeted ESLint, documentation link check, and `git diff --check`
  passed.
- 2026-10-29: added a tenant-isolated deletion outbox, lease-based worker,
  retry backoff, a manual/scheduled maintenance command, and durable queueing
  during tenant purge. Purge locks the organization row before enumerating
  stored objects and committing the deletion jobs, preventing concurrent
  organization-bound uploads from escaping that inventory. The final full
  suite passed (421 tests; 14 skipped), as did typecheck, targeted ESLint,
  Prisma schema validation, documentation link checks, and `git diff --check`.
  The production build passed before the final purge-script locking change,
  which does not affect the application bundle; it retained the existing
  dynamic-filesystem tracing warning in `src/lib/storage/index.ts`. The
  PostgreSQL RLS integration tests were not run because they require a
  disposable superuser test database.
- 2026-10-30: added S3/local object listing and a read-only inventory command
  that compares aged objects against file/export metadata and deletion jobs.
  The command requires an explicit age threshold, a database role that
  bypasses RLS, and separate S3 audit credentials; it does not mutate storage
  or the database. Focused inventory/storage tests (16) and the full suite
  (430 passed, 14 skipped) succeeded; typecheck, targeted ESLint, documentation
  link checks, and `git diff --check` passed. The production build also passed
  with dummy local-only connection settings; the existing dynamic-filesystem
  tracing warning remains. Provider access and a live inventory run remain
  unverified.
- Item 2 remains partial: organization storage quotas and automated
  reconciliation/removal of untracked objects (for example, when both storage
  deletion and outbox writes fail) are not implemented. The maintenance
  workflow's live configuration and successful execution remain unverified.
- No work item in this plan constitutes external or live-system validation.
