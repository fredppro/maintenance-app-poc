# Documentation, portability and replaceability audit

> Archived audit snapshot. Its findings, counts, and line references describe
> the repository at audit time, not the current documentation layout. Use the
> [current index](../README.md) and
> [environment status](../reference/environment-status.md) for current
> navigation and repository evidence.

## Scope and evidence standard

This is a read-only audit of the `develop` worktree: first-party Markdown, the
application and storage seams, deployment configuration, GitHub Actions, and
the documented server runbooks. The original inventory counted 36 first-party
Markdown files, 37 with this report, and 38 after the environment-status
record. These are historical scope counts, not a maintained current total. A
downloaded Terraform-provider README under
`.terraform/` was excluded as generated tooling content. Relative Markdown
target files were checked and none were missing. Link fragments and external
links were not validated as a whole.

No live VPS, Coolify, GitHub secret store, cloud account, or credential-bearing
file was inspected. Statements about those systems are therefore either
operator-reported and dated in the repository or unverified here. This report
does not certify security, privacy compliance, backups, or recoverability.

**Follow-up (2026-10-29):** added an in-repository evidence ledger and linked
it from the documentation index. This does not resolve any external-state
questions or update older provider-specific instructions.

**Documentation reconciliation (2026-10-29):** deployment, privacy,
retention, logging, and recovery guidance now distinguishes repository
behavior from dated reports and unverified live settings. The index labels
documents by evidence status. Project guidance is centralized in `AGENTS.md`,
with Claude and Gemini entry points importing it; Next.js generator markers
are preserved. An offline relative-link check now runs in CI. These changes do
not verify infrastructure, backup execution, restore capability, or provider
settings.

Use these labels when reading the findings:

- **Code-verified**: supported by current tracked application or deployment
  source.
- **Dated observation**: a report of a check performed at the date stated in
  the source document; not rechecked for this audit.
- **Planned**: a decision, target, or procedure that has not been demonstrated
  in the running environment.
- **Unverified**: repository evidence is insufficient to establish the live
  configuration or outcome.
- **Historical**: retained for context, but not an instruction for the current
  deployment.

## Executive findings

1. **The original audit found no single, concise operator view of what is
   live.** The follow-up [environment status record](../reference/environment-status.md)
   now centralizes repository evidence and external checks still needed; it
   does not verify live systems. The self-hosted plan describes a deployed
   synthetic staging app and database, while the dated Coolify bootstrap
   section says no application or database had been deployed. The original
   root README wording also conflated staging provisioning with automated
   deployment. Follow-up edits now direct readers to the evidence ledger and
   distinguish the reported manual staging deployment from an automated
   pipeline. The plan says the production app/database and automated
   staging pipeline are not deployed. The staging claim is not independently
   verified in this audit. Reconcile these as separate facts: manually
   provisioned staging, automated deployment pipeline, and production.
   Evidence: `docs/planning/self-hosted-platform-plan.md:3,594-609`,
   `docs/operations/wireguard-admin-access.md:38-62`,
   `README.md:69-80,419-426`.
2. **The original privacy, retention, and observability documents described
   the former Vercel/Neon hosting model.** Follow-up edits use provider-neutral
   language where live settings are unknown and retain Vercel/Neon only as
   compatibility or historical context. The current platform plan selects
   Coolify/Contabo and distinguishes staging Garage from the planned Scaleway
   production object store and backup destination. Processor, region, PITR,
   encryption, and backup-retention settings remain unverified externally.
   Evidence: `docs/security-privacy/data-map.md:9-12,41-46`,
   `docs/security-privacy/gdpr-readiness.md:20,28-43`,
   `docs/operations/observability.md:13,22-24`,
   `docs/security-privacy/data-retention.md:13-20`,
   `docs/planning/self-hosted-platform-plan.md:43,162,594-609,773`.
3. **The recovery documentation is commendably candid, but recovery claims
   remain unproven.** The VPS replacement procedure explicitly says it has
   never been exercised and has no measured RPO/RTO. The Coolify database
   dump has a recorded successful backup and checksum, but no restore test.
   Application database and file recovery are separate and do not inherit
   that Coolify backup.
   Evidence: `docs/operations/vps-recovery.md:7-8,47`,
   `docs/operations/coolify-backup-and-upgrade.md:8-30,129-139`.
4. **Object-storage code has a useful S3-compatible seam, but provider
   migration is an operational project, not a tested one-variable switch.**
   The interface supports only put/get/delete; files and export archives share
   it. Keys and metadata are stored separately, and the app proxies
   authenticated downloads. A proposed synthetic portability checklist is
   now documented, but no bulk-copy tool, provider contract test, or completed
   rehearsal is evidenced. Garage is described in the plan as the single-node
   staging store on the VPS, not the planned redundant production/off-host
   destination.
5. **The original agent guidance was inconsistent and could misdirect
   changes.** Follow-up edits preserve the Next.js-generated block in
   `AGENTS.md`, add concise project guidance outside its markers, and make
   Claude and Gemini entry points import that canonical guidance. Which files
   each active agent actually loads remains unverified.
6. **Documentation cross-links were in good shape at the file-target level
   in the initial scan.** It found zero broken relative target files among
   the original 36 first-party Markdown files. A separate offline checker is
   being added for the current corpus; neither check establishes external URL
   availability, command accuracy, or live-system state.

## Current deployment picture evidenced by the repository

| Area | Evidence-based picture | Confidence and caveat |
|---|---|---|
| Application | The self-hosted plan reports synthetic staging app/database deployment and a healthy endpoint on its stated date. It says production app/database and a staging deployment pipeline are not deployed. | Dated operator report; not checked against Coolify. |
| Server/control plane | Contabo VPS, WireGuard, Coolify, and GHCR access are documented with dated checks. | Dated observations in runbooks; not live-verified here. |
| Staging object storage | Garage `v2.4.1`, single-node, on the same VPS is described as staging-only. The storage-usage runbook targets a staging bucket. | Dated plan and runbook; no production Garage use is established. |
| Production object storage | The plan selects Scaleway Object Storage for production files and a separate backup project. The runbooks say the Coolify backup has no validated S3 destination and the application backup workflow is optional until its secrets are configured. | Decision is documented; account configuration, private policy, lifecycle, versioning, replication, and backup execution are unverified. |
| Database | PostgreSQL with Prisma, application/runtime role separation, RLS, and committed migrations. Deployment config retains Vercel/Neon compatibility branches. | Code-verified; live production database is not claimed to exist. |
| CI and images | GitHub Actions run checks, build/scan images, and publish commit-tagged GHCR images. The repository says this does not deploy to Coolify. | Code-verified from README/workflow; no deployment workflow found in the reviewed materials. |
| Email and analytics | Resend is called directly for transactional email. Vercel Analytics is conditionally included only when production and explicitly enabled. | Code-verified; active provider settings were not checked. |

The two useful current-state references are
[`self-hosted-platform-plan.md`](../planning/self-hosted-platform-plan.md) and the
numbered [runbooks](../README.md). Neither should be read as proof that an
unverified step has been executed.

## First-party documentation inventory

### Product, architecture, privacy, and operations (`docs/`)

| Document | Primary audience and value | Assessment at original audit / action |
|---|---|---|
| [`README.md`](../README.md) | All readers; navigation to project and operational documents. | Good starting point. Add this audit link; make audience and authority labels clearer. |
| [`environment-status.md`](../reference/environment-status.md) | Operator; dated ledger of repository evidence and external verification needs. | Added after the original audit. It deliberately leaves live deployment, backup, provider, and revocation facts unverified until checked externally. |
| [`self-hosted-platform-plan.md`](../planning/self-hosted-platform-plan.md) | Operator/architect; major hosting and dedicated-database decisions, roadmap, risks, and dated state. | Best current platform decision record, but very long and mixes current status, historical evaluation, implementation plan, and future architecture. Keep it as the decision source; extract a short current-state summary rather than copying the whole plan elsewhere. |
| [`baseline-audit.md`](baseline-audit.md) | Product/engineering; a detailed feature and code-quality baseline and backlog. | Explicitly tied to an older commit/date. Mark as historical snapshot in the index and keep its implementation findings separate from live operational tasks. |
| [`dedicated-database-assessment.md`](dedicated-database-assessment.md) | Architecture/engineering; useful schema, routing, lifecycle, and state-machine analysis. | Its header correctly says hosting-specific sections are superseded. Preserve the still-valid analysis, but keep the historical Vercel/Neon findings clearly fenced off. |
| [`pilot-readiness.md`](../planning/pilot-readiness.md) | Engineering/operator; signup, migrations, role checks, backup and smoke-test expectations. | Useful application guidance; distinguish repository limitations from the externally provisioned staging environment. Its provider-backup assumptions require reconciliation. |
| [`tenant-isolation.md`](../architecture/tenant-isolation.md) | Engineering/security; application filtering, PostgreSQL RLS, runtime roles, and verification commands. | Closely aligned with code. Keep the distinction between local procedure and actual deployed-role verification. |
| [`tenant-lifecycle-and-recovery.md`](../operations/tenant-lifecycle-and-recovery.md) | Operator/product; tenant onboarding, suspension, deletion, export, backup, and recovery. | Good lifecycle reference. RPO/RTO are targets, not tested results; Neon PITR and generic bucket-versioning steps are not the current provider state. |
| [`data-retention.md`](../security-privacy/data-retention.md) | Operator/privacy; retention periods and scheduled jobs. | Application retention rules are useful. Backup row currently reads as daily dumps plus PITR although the backup workflow skips until configured; Neon PITR and bucket lifecycle are not verified. |
| [`privacy-data-map.md`](../security-privacy/data-map.md) | Privacy/legal/engineering; data categories, flows, and processors. | Explicitly not a legal record. Its Vercel/Neon processor list and hosting/data-flow diagram are stale for the selected self-hosted plan. Rebuild the processor list from verified deployed services. |
| [`gdpr-readiness.md`](../security-privacy/gdpr-readiness.md) | Privacy/legal/engineering; technical controls and open legal questions. | Correctly disclaims compliance. Neon/Vercel, PITR, encryption, and backup statements are outdated or unverified; update before relying on its status table. |
| [`observability.md`](../operations/observability.md) | Developer/operator; health endpoints, logs, database checks, CI, and deferred tooling. | Contains useful checks, but Neon/Vercel dashboard statements are stale. Its “never `console.*`” guidance does not match the fixed-event `console.error` calls in the health route. The logger's error-message behavior also does not support a blanket “secrets redacted” assurance (see findings below). |
| [`incident-response.md`](../operations/incident-response.md) | Operator/privacy; containment and investigation steps. | Explicit draft and candid about missing events. Update its provider and backup references alongside the data map; verify its claims about log redaction before using them operationally. |
| [VPS recovery](../operations/vps-recovery.md) | Operator; replacement VPS recovery and gates. | Explicitly untested; local Terraform state and absent tested RPO/RTO are correctly disclosed. Rehearse on an isolated VPS before claiming DR readiness. |
| [Server bootstrap](../operations/server-bootstrap.md) | Operator; original Ubuntu host baseline. | Detailed and dated, with a scope limited to a plain clean host. Its “live status” is historical after Coolify/Docker deployment; do not treat bootstrap state as current host state. |
| [WireGuard admin access](../operations/wireguard-admin-access.md) | Operator; VPN, firewall, and Coolify bootstrap. | Detailed but its dated “No application or database” statement predates the reported staging deployment. Reconcile current application, network, and Coolify state. |
| [Coolify backup and upgrade](../operations/coolify-backup-and-upgrade.md) | Operator; Coolify control-plane backup and upgrade. | Clearly separates Coolify backup from application DB/files and records the restore gap. The scheduled settings had an unsaved-changes warning; verify before relying on retention/schedule. |
| [Storage capacity and portability](../operations/storage-capacity-and-portability.md) | Operator; read-only VPS, Docker-mount, and Garage bucket usage. | Useful and appropriately scoped. The script passed shell syntax validation, but it has not been run on the VPS; record the exact tested container/CLI output after a safe read-only run. |
| [Secret rotation](../operations/secret-rotation.md) | Operator; rotation procedure and credential-name inventory. | Broad and correctly says configured values are unknown and must not be copied into chat/repository. Validate each consumer by store name/scope and record only successful rotation evidence. |

### Project setup, deployment, and agent guidance outside `docs/`

| Document(s) | Audience and audit note |
|---|---|
| [`README.md`](../../README.md) | Developer setup and tests are useful. Later sections retain Vercel/Neon deployment instructions and say staging still needs provisioning; separate these as historical/compatibility material and state the current manual Coolify staging vs. absent automated pipeline and production. |
| [`AGENTS.md`](../../AGENTS.md), [`CLAUDE.md`](../../CLAUDE.md) | `AGENTS.md` is a short Next.js-generated rules block; `CLAUDE.md` imports it. Neither gives durable project-level commands, architecture, or documentation authority. Do not overwrite generator-owned content without understanding its regeneration behavior. |
| [`.gemini/GEMINI.md`](../../.gemini/GEMINI.md) | Stale architectural blueprint: it prescribes Neon/Vercel, Next.js 15+, an older Node baseline, Zustand/`@dnd-kit`, and an old schema. It conflicts with the current package, code, and self-hosted plan. Its nested path is not Gemini CLI's default root `GEMINI.md`; verify loaded context with the CLI before assuming it applies. |
| [`scripts/README.md`](../../scripts/README.md) | Useful operational-script catalog; the environment table still labels serving as Vercel and should be aligned with the Docker/Coolify deployment and optional backup configuration. |
| [`ansible/README.md`](../../ansible/README.md) | Good distinction between existing-host convergence and the untested first-boot recovery path. Preserve the explicit rehearsal caveat. |
| [`infra/contabo-firewall/README.md`](../../infra/contabo-firewall/README.md) | Detailed provider-specific Terraform guide with accepted risks and unresolved billing/behavior checks. Contains server/provider identifiers and IP information; confirm repository visibility is appropriate and keep credentials/state out of Git. |
| [`tests/e2e/README.md`](../../tests/e2e/README.md) | Clear, current safety boundary for isolated test databases and E2E fixtures. |
| `.agents/skills/shadcn/` (10 Markdown files: `SKILL.md`, `cli.md`, `customization.md`, `mcp.md`, `registry.md`, and five `rules/*.md`) | Tool-specific UI implementation reference, not product or deployment documentation. Retain as a localized skill; avoid duplicating its component rules in general architecture docs. |

## Proposed information architecture

This is a proposal only; no files are moved or renamed by this audit.

1. **Repository root — developer entry point.** Keep root `README.md` focused
   on prerequisites, local setup, tests, and a short link to `docs/README.md`.
   Move old Vercel/Neon instructions under a clearly marked historical or
   compatibility heading rather than leaving them in the default deployment
   path.
2. **`docs/README.md` — audience-based navigation.** Organize links into:
   - Start here: local development, tests, current deployment status.
   - Architecture: tenant isolation, storage, database and service boundaries.
   - Operations: access, deploy/release, backup/restore, storage capacity,
     secrets, incident response, recovery.
   - Privacy: data map, retention, technical GDPR readiness (not legal advice).
   - Decisions and history: current self-hosted decision record and explicitly
     superseded assessments/baselines.
3. **One current-state record.** Maintain a short environment matrix with
   `local`, `staging`, and `production` columns, an “as of” date, evidence
   source, and verified/unverified state. Treat “manually provisioned” and
   “automated pipeline” as separate statuses. Link to it from runbooks instead
   of repeating deployment state.
4. **Runbooks stay procedural.** Keep numbered steps, prerequisites,
   rollback, success evidence, and tested/untested status. Mark destructive
   steps and commands needing a particular host/account. Separate application
   database, uploaded-file, and Coolify-control-plane recovery.
5. **Decision/history records stay explicit.** Retain dated decisions and old
   research for traceability, but label what is superseded and link to the
   current decision. Do not silently rewrite past observations as current.
6. **Agent instructions stay concise and consistent.** Keep one canonical,
   short set of project engineering instructions and use supported forwarding
   or imports for tools. Put longer component-specific rules in the existing
   `.agents/skills/` reference rather than embedding a second application
   blueprint.

Suggested metadata for operational and decision documents: `Purpose`,
`Audience`, `Status` (`current`, `planned`, `historical`, `draft`),
`Last verified` (date plus evidence), `Owner`, and `Related source`. Avoid
claims such as “configured,” “encrypted,” “backed up,” or “tested” without
recording the verification method and result.

## Replaceability and provider lock-in

“Easy” below means a likely small change based on the checked-in seam, not a
tested migration estimate. Live provider features, contractual terms,
availability, and pricing were not verified.

| Component | Current seam / provider coupling | Replaceability | Work and evidence required |
|---|---|---|---|
| Runtime / hosting | Next.js standalone Docker image, non-root runtime; Coolify deployment and VPS configuration are external/manual. | **Moderate** | Another container host can run the image, but secrets, health checks, ingress/TLS, migration-before-deploy, background work, log collection, and rollback need a tested deployment recipe. CI publishes GHCR images but does not deploy them. |
| PostgreSQL | Prisma PostgreSQL adapter, standard connection URLs, SQL migrations, raw PostgreSQL/RLS logic, owner/runtime role split. Vercel/Neon URL derivation remains as a conditional legacy path. | **Moderate within PostgreSQL; low across database engines** | A PostgreSQL-compatible host is plausible, but confirm RLS, role ownership, transaction-local settings, pooler behavior, extensions, connection limits, backups, and restore. Changing database engines would require SQL/migration and isolation redesign. |
| Object storage (Garage case study) | `ObjectStorage` exposes `put/get/delete`; one AWS SDK S3 client is configured with bucket, endpoint, region, credentials, and path-style options. No Garage SDK or public URL is embedded in the file route. | **Moderate at the API boundary; migration unproven** | Configure a compatible endpoint and copy every object while preserving keys; verify counts, bytes, representative reads, exports, permissions, and rollback before switching. There is no in-app bulk-copy tool, listing, provider contract suite, or dual-read/cutover procedure. Test target-provider semantics rather than assuming “S3-compatible” means identical. |
| Transactional email | `src/features/auth/server/email.ts` calls Resend's HTTP API directly; auth supplies verification, invitation, and reset flows. | **Low to moderate** | Replace direct calls with a small mail-provider port and map sender, templates/content, error handling, rate limits, bounce semantics, and verification. Test actual delivery and domain authentication. |
| Authentication | Better Auth endpoints/plugins and Prisma-backed auth tables; organization membership and authorization policy are integrated with its APIs. | **Low** | Replacing the library requires user/password-hash, session, invitation, callback, and authorization migration or forced reauthentication. Not equivalent to changing a hosting provider. |
| Analytics | `@vercel/analytics/next` is a direct dependency, gated by production and `NEXT_PUBLIC_ENABLE_ANALYTICS=true`. | **Moderate / optional** | Disabled by default. Remove or replace the SDK and reassess consent, data flow, privacy notice, and processor inventory before enabling an alternative. |
| Logs / monitoring | Structured JSON to process stdout; no external error tracker or telemetry collector. Coolify/VPS log retention and alerts are not represented in app code. | **Moderate** | Hosting can change, but collection, retention, alert routing, redaction, request correlation, and access controls must be configured and tested separately. |
| Scheduled operations / backup | GitHub Actions scheduled workflows, GitHub secrets/environments, `pg_dump`, and S3 upload. Backup workflow skips if its required secrets are absent. | **Moderate** | Moving schedulers requires recreating identity, secret scope, concurrency, retries, alerting, and backup retention. Test the restored output; do not equate a green/no-op workflow with a backup. |
| Job execution | Export uses Next.js `after()` from a request action; no durable queue is present. Retention and purge are separate scripts/jobs. | **Low across runtime models** | If changing host/runtime, prove completion, retries, duplicate handling, and behavior on process termination. A durable queue would be a product/architecture change, not a configuration swap. |
| Infrastructure | Contabo-specific Terraform provider, Ubuntu/Ansible baseline, WireGuard, and Coolify procedures. Terraform state is local per the recovery runbook. | **Low to moderate** | A provider change needs new Terraform resources, state migration, network/access model, host bootstrap, firewall verification, and a rehearsed recovery. Do not infer cloud portability from the Docker image alone. |
| Payment, search, AI, application Redis | No corresponding application dependency or integration was found in the reviewed package/source paths. Redis is present in Coolify's control plane, not established as an application service. | **Not applicable today** | Revisit the map if these integrations are introduced. |

### Garage object-storage case study

**What the code makes portable**

- `src/lib/storage/types.ts:7-10` defines only put, get, and delete.
- `src/lib/storage/index.ts:12-36` selects S3-compatible storage from `S3_*`
  configuration; production refuses the local-disk fallback.
- `src/lib/storage/s3-storage.ts:34-63` uses AWS SDK Put/Get/Delete object
  commands. It does not import Garage-specific APIs.
- `src/features/files/server/files.ts:55-64` keys image objects by
  organization ID plus random UUID/extension and stores file metadata in
  PostgreSQL. `src/features/export/server/run-export.ts:8-22` stores
  organization export ZIPs through the same abstraction.
- `src/app/api/files/[id]/route.ts:8-33` authorizes tenant access and serves
  objects through the application with private caching; the browser is not
  given a Garage URL.

These are real portability advantages: the database stores object keys rather
than provider URLs, and changing a compatible endpoint need not change
application-facing file IDs or URL routes.

**What remains provider- and operations-dependent**

- Current Garage is documented as **single-node staging storage on the same
  VPS**; the platform plan names Scaleway for production files and separate
  backups. Do not describe staging Garage as redundant or as the production
  backup destination.
- The database backup script does not copy Garage objects. Application file
  recovery therefore needs its own backup/copy, integrity check, and restore
  procedure.
- The configured S3-like endpoint, region, path-style mode, credentials,
  permissions, private-bucket policy, versioning, lifecycle/retention, and
  redundancy are environment/provider concerns. The repository cannot prove
  their live values.
- Existing tests cover local storage, environment selection, and key checks;
  they do not execute real S3 commands against Garage or a second provider.
- No list/size/copy/restore operation exists in `ObjectStorage`; the VPS usage
  script separately calls Garage's CLI for bucket totals. The logical bucket
  total is not the same measure as filesystem/disk consumption.

**Minimum replaceability proof before moving providers**

1. Confirm source and destination bucket identity, region/endpoint,
   path-style requirements, private access, and least-privilege credentials
   from the provider consoles without copying secret values into the
   repository.
2. Use a reviewed, resumable object-copy method outside the app; preserve the
   exact object keys. Keep source objects and do not change app configuration
   during the copy.
3. Compare object count and total bytes, then read a representative sample of
   image and export objects through the authenticated application routes.
4. Verify upload, download, replacement, delete, tenant isolation, and export
   expiry/cleanup against the destination. Check application and provider logs
   for failures.
5. Switch the app configuration, redeploy, and retain a documented rollback
   window. Delete the old copy only after application checks and an independent
   backup/restore plan pass.
6. Separately test a loss/recovery scenario. Replication or a second copy is
   not a restore test, and a second bucket in the same failure/account domain
   may not provide independent recovery.

No provider migration, Garage restore, or off-host file-backup verification
was performed by this audit.

## Runbook and agent-instruction assessment

### Runbooks

- **Strong practice:** the documents state scope, separate Coolify's
  control-plane dump from app databases and files, mark the VPS recovery
  untested, and prohibit putting credential values in docs/chat.
- **Stale-state risk:** dated host and Coolify observations are repeated in
  runbooks. Keep the dates, but add an explicit “last checked/current status”
  line and link to the single environment matrix. In particular reconcile the
  old “no application or database” state in runbook 02 with the reported
  staging deployment.
- **Backup readiness:** the application backup workflow has an optional
  secrets gate; the retention and privacy docs should distinguish “workflow
  exists,” “workflow ran successfully,” “off-host object present,” and
  “restore tested.” Coolify's successful dump is not an application-data
  restore. No tested RPO/RTO is established.
- **Runbook 04:** document one successful non-destructive VPS run, including
  tool versions and sanitized output, before calling the command operationally
  verified. Do not include credentials in that output.
- **Runbook 05:** it is a useful name/scope inventory, not proof of the live
  secret inventory. The user-context follow-up that a previously exposed
  Garage key still needs revocation verification is not something repository
  inspection can settle; confirm by key name/status in Garage and record only
  the verification result.
- **Sensitive operational detail:** the Contabo guide contains public
  addresses, instance/firewall IDs, and SSH fingerprints. These are not
  passwords or private keys, but review repository visibility and avoid
  publishing unnecessary infrastructure identifiers.

### Coding-agent instructions

- GitHub Copilot's documented repository options include `.github/copilot-instructions.md`
  and `AGENTS.md`; its agent instructions use the nearest `AGENTS.md`.
- Claude Code supports `CLAUDE.md` and `AGENTS.md`; its current docs also
  support `@path` imports. The current root `CLAUDE.md` is only `@AGENTS.md`,
  so it forwards the generated Next.js rules rather than project-specific
  engineering practices.
- Gemini CLI's default context filename is `GEMINI.md`, loaded hierarchically
  from workspace/parent locations. The repository instead has
  `.gemini/GEMINI.md`; no repository context setting was found to establish
  that this file is loaded by default. Confirm with Gemini CLI's `/memory
  show` rather than assuming it is active.
- Official convention references: [Gemini CLI context files](https://geminicli.com/docs/cli/gemini-md/),
  [Claude Code memory and imports](https://code.claude.com/docs/en/memory),
  and [GitHub Copilot repository instructions](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/add-custom-instructions/add-repository-instructions).

**Recommended instruction hierarchy:** put concise, factual project rules and
canonical setup/test commands in a stable project-owned instruction file;
leave Next.js-generated content intact or regenerate it as intended; have
Claude/Gemini/Copilot load the same canonical material through their supported
mechanisms; remove the stale Gemini blueprint once its useful rules have been
reviewed. Keep vendor-specific UI skill details in `.agents/skills/shadcn/`.

## Findings and prioritized documentation backlog

At the time of this audit, no remediation in this backlog had been implemented.
Priorities describe the documentation/verification risk, not a confirmed
security incident; later changes are not tracked in this historical backlog.

| Priority | Finding | Evidence | Recommended follow-up |
|---|---|---|---|
| **P1** | Environment state is contradictory or easy to misread. | `README.md:76-80,419-426`; `docs/planning/self-hosted-platform-plan.md:3`; `docs/operations/wireguard-admin-access.md:62` | A dated repository-evidence ledger now exists at `docs/reference/environment-status.md`. Confirm live facts there first; then update README and runbook 02, distinguishing environment existence from manual/automated deployment and verified data/backup state. |
| **P1** | Privacy and retention processor map is tied to Neon/Vercel rather than verified current services. | `docs/security-privacy/data-map.md:9-12,41-46`; `docs/security-privacy/gdpr-readiness.md:20,28-43`; `docs/security-privacy/data-retention.md:13-20` | Reconcile actual providers, regions, data flows, DPAs, analytics state, backup path, and retention with the deployment owner/legal reviewer. Mark unknowns instead of assuming provider features. |
| **P1** | Backup documentation can be read as stronger than the implementation evidence. | `.github/workflows/backup.yml` configuration gate; `scripts/db/backup/backup-db.sh`; `docs/operations/vps-recovery.md:7-8,47`; `docs/operations/coolify-backup-and-upgrade.md:8-30,129-139` | Record workflow configuration and last successful run; validate off-host dump and file backup; complete an isolated restore drill; then set measured RPO/RTO. Keep Coolify, PostgreSQL, and Garage recovery distinct. |
| **P1** | The Gemini architectural blueprint conflicts with current architecture and may be loaded inconsistently. | `.gemini/GEMINI.md:3,13-15,26-31,178-179`; official Gemini context-file convention above | Review/retire stale claims and define one canonical project instruction source. Verify loaded context in each tool before relying on it. |
| **P1** | Logging documentation overstates redaction assurance. | `docs/operations/observability.md:8`; `docs/operations/incident-response.md:25`; `src/lib/logger.ts:6-12` | The logger treats `Error` specially and applies URL/email scrubbing to `Error.message`; sensitive-looking object-key redaction is applied to ordinary objects, not arbitrary secret text embedded in an error message. Add a focused privacy/security review and tests; until then, narrow the documentation claim. This audit did not attempt to exploit or reproduce a leak. |
| **P2** | Garage/S3 replaceability is not demonstrated end to end. | `src/lib/storage/types.ts:7-10`; `src/lib/storage/storage.test.ts`; `docs/operations/storage-capacity-and-portability.md`; `docs/planning/self-hosted-platform-plan.md:594-609` | Document source/destination bucket ownership and policies without secret values; add a provider contract/copy/restore rehearsal and record rollback and integrity checks. |
| **P2** | Several docs repeat the same deployment, backup, and credential facts with different providers/status. | Root README; `docs/planning/pilot-readiness.md`; `docs/security-privacy/data-retention.md`; `docs/security-privacy/data-map.md`; `docs/operations/observability.md`; `scripts/README.md`; runbooks 02/03/05 | Adopt the proposed audience structure and link to one source for environment state and one for the variable/consumer inventory. Retain dated history. |
| **P2** | Operational docs contain infrastructure identifiers that may be inappropriate for a public repository. | `docs/operations/server-bootstrap.md`; `docs/operations/wireguard-admin-access.md`; `infra/contabo-firewall/README.md` | Confirm repository visibility and decide whether precise IPs, instance/firewall IDs, and key fingerprints belong in versioned docs. Credentials and private keys must remain outside source control. |
| **P2** | The logging policy says `console.*` must not be used, while the readiness route logs fixed events with `console.error`. | `docs/operations/observability.md:8`; `src/app/api/health/route.ts` | Either permit a documented exception for fixed sanitized readiness events or make the policy match the implementation. |
| **P3** | Documentation checks are manual and do not verify fragments or external links. | CI workflows checked; no Markdown-link job found. Relative target-file scan passed. | Consider a lightweight Markdown lint/link check in CI after choosing rules, with exclusions for generated/vendor content and a process for stale external references. |
| **P3** | Historical implementation baselines and assessment documents can look like active work. | `docs/archive/baseline-audit.md` dates its baseline; `docs/archive/dedicated-database-assessment.md` marks superseded sections | Label them “historical snapshot” in the index and link current decisions; do not delete useful evidence. |

## Open questions that require an operator or product decision

1. Is staging still deployed and healthy, and is it intentionally manual? Which
   exact release/image digest is live? This audit did not access Coolify.
2. Does any production application/database exist now, or is production still
   only planned? The plan says it is not deployed; verify before updating
   public-facing or privacy documentation.
3. Which provider/account/bucket currently holds staging uploads, planned
   production files, application database backups, and Coolify instance
   backups? Which are actually enabled, private, encrypted, retained, and
   independently recoverable?
4. Has the exposed Garage key been revoked and replaced, verified by
   non-secret key identifier/status? Do not paste the key value into docs,
   tickets, or chat.
5. Are application backup workflow secrets configured, and has the workflow
   completed successfully? Has its dump and object backup been restored in an
   isolated environment?
6. What RPO/RTO can be claimed after a measured recovery drill? Until then,
   keep the documented values labeled as targets, not commitments.
7. Which repository visibility is intended for the host, provider, firewall,
   and SSH-fingerprint details currently in the runbooks?
8. Which agent tools are actively used by the team? Verify their loaded
   instruction files and decide whether a Copilot-specific repository
   instruction file is useful in addition to `AGENTS.md`.

## Audit validation

- First-party Markdown inventory: **38 files** (36 pre-existing documents,
  this report, and the environment-status record). The downloaded Terraform
  provider README under `.terraform/` was excluded.
- Relative Markdown target files: **0 missing** across all 38 files. Heading
  fragments and external URLs were not checked.
- No source, deployment configuration, secret, infrastructure, or runbook was
  changed as part of this audit. The only intended changes are this report and
  its link from `docs/README.md`.
