# Environment and operations status

- **Repository review:** 2026-11-13
- **External systems checked for this record:** shared Coolify application
  logs, Instance Backup, staging resource, and server overview pages on
  2026-10-29; Coolify Advanced settings and GitHub Actions workflow runs on
  2026-10-30; Coolify deployment history and the staging health endpoint on
  2026-10-31; Coolify's reminder scheduled-task list and application
  configuration page, plus the post-merge workflow run and staging health
  endpoint for PR #18 on 2026-11-06; Coolify's Instance Backup and staging
  application pages, plus GitHub PR #21 workflows on 2026-11-13. The firewall
  and WireGuard changes were applied from Ansible on 2026-10-30; see the dated
  evidence below.
- **Local restore validation:** the documented Coolify control-plane dump was
  restored to a disposable, network-isolated PostgreSQL container on 2026-10-29
- **Purpose:** authoritative in-repository ledger of what the checked-in
  evidence does and does not establish. This is not a live deployment
  dashboard or a compliance statement.

Do not treat a dated observation or a planned design as the current state.
Update this record only after checking the relevant system; record the date,
evidence, and result, never secret values. Keep unresolved items marked
**unverified**.

## Status from repository evidence

On 2026-11-06, Coolify showed the `Maintenance reminder delivery` scheduled
task configured for `*/15 * * * *`, with a 300-second timeout and no container
selected. At creation its status was “Not run yet”; a later successful
invocation and email delivery have not been verified. The Coolify application
configuration page also showed unsaved changes. No external configuration was
saved, and no deployment was triggered by the current workflow changes. After
PR #18 was merged, workflow run #34 succeeded, staging returned HTTP 200 with
`X-Application-Revision: 6a1b8bd48cb7452eaee6cfb826cd7efb6ffa7a2c`, and Coolify
reported the app as `Running`. This is evidence for that deployment, not a
verification that the newly changed workflow has run.

On 2026-11-13, PR #21 merged, but staging workflow run #3
(`43495340983`) failed during validation-run lookup and skipped deployment.
The successful test and security runs existed for the PR's latest head SHA;
the workflow lookup depended on a PR association GitHub omitted after merge.
The repository now has a SHA-based lookup and an automated Compose migration
gate. PR #22 contains these changes but is behind `develop`; its initial
`container-image` check failed because the Compose-validation jq expression
treated the normalized networks object as an array. A local correction now
checks network keys, but that correction has not yet been pushed.

A read-only Coolify UI inspection on 2026-11-13 found the existing
`maintenance-staging-migrator` Docker Image application on the `coolify` network,
with `DATABASE_URL` and `MIGRATION_DATABASE_URL` environment-variable entries.
The resource displayed `Exited` and an unhealthy health check; its latest
deployment was shown as successful five days earlier. Coolify also displayed
an auto-generated public `sslip.io` domain, although no ports were exposed.
Coolify v4.6.0 can report a Docker Image deployment as finished without
verifying that a one-shot container remained alive, so this resource's
deployment status alone is not a reliable migration-success gate. The new
Compose dependency is intended to gate app startup on the migrator container's
actual successful exit.

An operator-approved `maintenance-staging-app-compose` resource was created
for PR #22 on the PR branch, using `docker-compose.staging.yml` and the
external `coolify` network. It has no public domain; the existing staging app
was not changed. The required Coolify environment values were configured,
except optional `APP_DATABASE_URL` and `STORAGE_LOCAL_DIR`, which are unset.
A manual no-domain deployment attempt at 2026-11-13 22:42 UTC failed while
pulling the bootstrap image tag because GHCR did not contain that tag. The
failure occurred before the migrator started, so no database migration ran.
The deployment workflow will replace bootstrap tags with validated GHCR tags
after a successful PR build and merge.

A read-only Coolify `localhost` registry inspection on 2026-11-13 showed
`ghcr.io` as **Logged in**, used by two existing applications. No registry
credential values were viewed. The failed bootstrap pull therefore needs a
valid published tag; it is not evidence that the GHCR login is missing.

| Area | Evidence and classification | Current conclusion |
|---|---|---|
| Application environments | The operator confirmed in chat on 2026-10-29 that staging and production are deployed. On 2026-10-30, Coolify was manually configured to deploy application image digest `sha256:c712ad154402609445cd2912aa6131084f1dd34a97e94626d408675326186cd6`; deployment record `ds95qdvfjltaa4kn0fb5speb` reported a completed rolling update, and the staging login page loaded after refresh. On 2026-10-31, automated deployment record `s6uljmwhwbxikhvuem6kevac` succeeded with image digest `sha256:b95c781cc3793026cc95fca8ebfd9a4dfdc3678cbb3bde5396cc24a35bdf1152`; `/api/health` returned HTTP 200 and `X-Application-Revision: 7a7e55b33744325935eb5fe8d5ce7168ad1362c2`. At the 2026-10-29 inspection, Coolify showed `maintenance-staging-app`, `maintenance-staging-db` (synthetic-data PostgreSQL 17), and `garage-staging` running on `localhost`; the app had no configured health check. | **Automated staging deployment and exact served revision were verified on 2026-10-31.** Production remains operator-reported, not independently viewed; database readiness and production health remain **unverified**. Earlier dated sources: [self-hosted platform plan](../planning/self-hosted-platform-plan.md), [WireGuard and Coolify runbook](../operations/wireguard-admin-access.md). |
| Deployment pipeline | The previous push-to-`develop` workflow was verified in run 24: tests, image scans, GHCR publication, and `deploy-staging` passed; Coolify deployment `s6uljmwhwbxikhvuem6kevac` used digest `sha256:b95c781cc3793026cc95fca8ebfd9a4dfdc3678cbb3bde5396cc24a35bdf1152` and served the expected revision. On 2026-11-13, PR #21's Tests and Security runs succeeded for its latest head, but Deploy staging run #3 (`43495340983`) failed during validation-run lookup and skipped deployment. The existing `maintenance-staging-migrator` Coolify app showed `Exited`/unhealthy despite a recent deployment marked successful. | **Historical staging deployment and exact served revision are verified.** The new Compose migration gate is configured in Coolify but has not completed a verified deployment; see the dated protection failure below. |
| Host and control plane | On 2026-10-30, the `staging-firewall` Ansible tag was applied: UFW denies host access from `10.242.0.3`, restricts WireGuard SSH to `10.242.0.2`, and `DOCKER-USER` permits the staging peer's forwarded TCP traffic only to `10.242.0.1:8000` before dropping other forwarded traffic. The firewall systemd service is enabled and active; a fresh operator SSH connection succeeded. The `wireguard` tag applied the staging peer and its live-peer assertion passed. Coolify Advanced settings show API access enabled and allowed IP `10.242.0.3/32`; on 2026-10-31, the issued-token list showed `write` and `deploy` permissions only, and the operator confirmed the replacement value was saved in the GitHub Environment. On 2026-10-29, Coolify identified the staging host as `localhost`; its overview said reachable, validated, and ready, while its status also showed `Attention required`. The Coolify UI reported a real-time-service connection warning. | **Network policy, WireGuard peer, API allowlist, and token permission scope are verified.** The GitHub secret value is operator-confirmed, not independently inspectable. The cause of the earlier conflicting host-status signals remains unverified. Coolify did not expose a provider or region label in the inspected server overview. See [runbook 02](../operations/wireguard-admin-access.md) and [runbook 03](../operations/coolify-backup-and-upgrade.md). |
| Database | Application code uses PostgreSQL/Prisma, migrations, RLS, and separate migration/runtime connection handling. The code retains a conditional Vercel/Neon compatibility path. | **Code-verified.** The current staging or production database host, region, account, and availability are **unverified**. |
| Object storage | Code uses an S3-compatible interface. Coolify lists a running service named `garage-staging` on the staging `localhost` server. The platform plan describes single-node Garage for synthetic staging files and selects Scaleway Object Storage for planned production files. The focused storage unit suite passed 7 tests on 2026-10-29, covering local storage and backend selection, not S3 requests or provider portability. | **A staging Garage resource is present; its app integration, data location, and region are unverified.** No provider-portability test was run. Production provider remains planned, not confirmed deployed. See [the platform plan](../planning/self-hosted-platform-plan.md) and [storage usage runbook](../operations/storage-capacity-and-portability.md). |
| Coolify control-plane backup | The Instance Backup page showed backups enabled, cron `0 0 * * *` UTC, local retention of 3 backups and 7 days, and max-storage value 2 (unit not displayed). No validated S3 storage was configured. The page showed an unsaved-changes banner, so schedule and retention persistence are not confirmed. On 2026-11-13, a fresh manual local backup completed successfully at 21:28:43 UTC; the operator reported downloading it to the local machine. The local path and checksum were not independently verified. The documented 2026-10-28 dump was restored on 2026-10-29 into a disposable network-isolated PostgreSQL 17 container; `pg_restore --no-owner --no-acl --exit-on-error` succeeded and 83 public base tables were present. | **A fresh server-side backup and earlier scratch restore are verified; the operator reports downloading the new archive.** Local file integrity, settings persistence, owner/ACL restoration, restore on a Coolify host, and remote backup destination remain **unverified**. |
| Application database backup | `.github/workflows/backup.yml` exists on `develop`, with a daily `02:17 UTC` schedule and manual dispatch; it skips if `BACKUP_DATABASE_URL` or `BACKUP_S3_URI` is absent. On 2026-10-29, GitHub Actions listed only Security and Tests for the default branch. The 14 recorded runs on `develop` were Security/Tests runs through 2026-10-15; none was a backup run. | **No application-backup workflow execution is evidenced.** The scheduled workflow is not present in the default-branch workflow list, so its schedule is not active there. Secret configuration, off-host copies, external/manual backups, retention, and application restore remain **unverified**. |
| Application file backup | The database backup script does not copy Garage objects. The platform plan identifies Garage as single-node staging storage and Scaleway as the planned production storage/backup direction. | **Independent file backup and restore are unverified.** A database dump is not a file backup. |
| Retention and point-in-time recovery | Documentation contains target retention and RPO/RTO values and provider-specific Neon PITR references. The recovery runbook says no tested RPO/RTO is established. | **Targets/proposals only; current provider retention, PITR, lifecycle, and measured recovery times are unverified.** |
| Garage key revocation | The operator confirmed in chat on 2026-10-29 that the previously exposed Garage key was revoked. No key values were requested or recorded, and no Garage key listing was independently inspected. The latest related staging upload log recorded `Invalid signature` on 2026-10-28 23:52 UTC; no newer upload test was performed. | **Revocation is operator-reported.** Replacement-key validity and access to the staging bucket remain **unverified**. |
| AI-agent instruction files | `AGENTS.md` contains a Next.js-managed block plus project guidance outside the markers. `CLAUDE.md` imports it; root `GEMINI.md` imports it; `.gemini/GEMINI.md` forwards to root `GEMINI.md`. | **File contents and import paths are repository-verified; which instructions each active agent actually loads is unverified.** Use the relevant tool's context/memory display. |

## External confirmation checklist

Inspect systems by status, names, and configuration labels only. Do not copy,
print, request, or record secret values.

- [x] **Deployment existence (operator-reported 2026-10-29):** Both staging and
  production are deployed. This does not establish health or verify the
  currently deployed application and database.
- [x] **Manual staging deployment (2026-10-30):** Coolify reported a completed
  rolling update for the configured image digest
  `sha256:c712ad154402609445cd2912aa6131084f1dd34a97e94626d408675326186cd6`
  (deployment record `ds95qdvfjltaa4kn0fb5speb`); the staging login page loaded
  after refresh. The active runtime digest was not independently verified.
- [ ] **Deployment verification:** Confirm each environment's health, database
  availability, deployed image digest, and last verification time. Distinguish
  manual Coolify deployment from an automated pipeline. Production was not
  independently viewed.
- [x] **Staging automation (2026-10-31):** One `develop` workflow run deployed
  the image to Coolify and `/api/health` returned the matching revision. This
  verifies one successful staging deployment, not production deployment or
  ongoing health.
- [ ] **Reminder delivery:** Inspect the Coolify task's latest execution and
  confirm the authorized endpoint call and email delivery. The configured
  `*/15 * * * *` schedule alone does not establish a successful run.
- [ ] **Providers and regions:** Coolify lists staging services on its
  `localhost` server and a running `garage-staging` resource, but the inspected
  pages exposed no provider or region. Confirm the actual hosting, database,
  email, analytics, file-storage, and backup providers and regions. Identify
  live versus planned services and confirm the processor/DPA inventory with
  the responsible privacy reviewer.
- [x] **Coolify backup executions and restore (2026-10-29):** Two recent
  executions showed Success, and the documented Coolify dump restored in a
  disposable local database as described below.
- [ ] **Coolify settings persistence:** The page displayed cron `0 0 * * *`,
  local retention values, no validated S3 destination, and an unsaved-changes
  banner. The timezone and unit for max-storage value `2` were not displayed;
  verify the settings are saved before relying on them.
- [x] **Coolify restore:** The documented 2026-10-28 Coolify dump restored in a
  disposable local PostgreSQL 17 container on 2026-10-29. `pg_restore` ran with
  `--no-owner --no-acl`; 83 public base tables were present afterward. The
  temporary container was removed. This validates a scratch data/schema
  restore, not ownership/ACL recovery or a full Coolify service recovery.
- [ ] **Application database backup:** Confirm whether the GitHub Actions
  secrets are configured and whether any off-host/manual application backup
  exists. The workflow file is on `develop`, not in the default-branch workflow
  list; no backup runs appear in the 14 recorded `develop` runs through
  2026-10-15. Verify configuration, off-host copy, retention, and an isolated
  restore result before relying on it.
- [ ] **Application files:** Confirm the live bucket/service, private-access
  policy, region, lifecycle/versioning/replication settings, and whether an
  independent file copy and restore have been tested.
- [ ] **Garage portability:** Rehearse a copy between disposable buckets using
  synthetic objects; verify object counts, byte totals, representative
  checksums, content types, and authenticated application reads. Do not switch
  live traffic or delete the source during this test.
- [ ] **Recovery objectives:** Record measured recovery results before
  promoting any RPO/RTO target to a commitment.
- [x] **Garage key revocation (operator-reported 2026-10-29):** The previously
  exposed key is reported revoked. No secret value was requested or recorded.
- [ ] **Garage replacement key:** Verify that the replacement key is active
  and works for its intended bucket; use status only and check other consumers
  before any further rotation.
- [ ] **AI-agent context:** For each agent actually used, inspect its loaded
  instruction list (for example, Claude `/context`, Gemini `/memory show`, or
  the relevant Copilot instruction/context view). Record filenames and scope,
  not prompt contents that may contain secrets.
- [ ] **Repository visibility:** Confirm whether the Contabo addresses,
  instance/firewall identifiers, and SSH fingerprints in infrastructure
  documentation are appropriate for the repository's visibility.

## Proposals and historical evidence

- **Planned, not confirmed:** production Scaleway object storage, separate
  backup storage, provider-specific retention/PITR, and the RPO/RTO targets in
  the lifecycle documentation.
- **Historical:** the 2026-10-15 staging/deployment statements and 2026-10-28
  Coolify backup observations remain useful evidence of what was reported at
  those dates. The 2026-10-29 Coolify page inspection is a newer observation;
  it does not prove a restore. The operator's 2026-10-29 production deployment
  confirmation is a report, not an independent health check. Do not overwrite
  historical observations; add dated verification when it is performed.
- **Not established by this record:** production deployment health, current
  secret-store contents, application-backup workflow configuration or success,
  application database/file restore capability, provider account/region
  configuration, replacement Garage key validity, legal compliance, or active
  agent context. Coolify restore was tested only in a local scratch database;
  Garage key revocation is operator-reported, not independently verified.

Related references: [documentation audit](../archive/documentation-audit.md),
[documentation index](../README.md).

## 2026-11-13 staging deployment failures

After PR #22 was merged, the staging deployment workflow ran from
`refs/pull/22/merge` and GitHub rejected the `staging` Environment deployment
because the Environment permits only the `develop` branch. The validation
lookup job passed, but the deploy job was rejected before a successful
deployment. Coolify showed no deployment for the merged change: its latest
history entry was an earlier failed manual deployment, and the Compose app
remained `Exited` with no public domain. The workflow was changed to trigger on
the post-merge push to `develop`, preserving the Environment's branch
restriction rather than broadening it to all branches.

After PR #23 merged, workflow run #5 (`43530583061`) triggered on
`refs/heads/develop` and successfully located the PR validation artifact and
promoted both immutable images. Its Coolify deployment step then failed with
HTTP 401 while updating image-tag environment variables. Inspection of the
workflow found that this one API request used a literal masked authorization
placeholder instead of the `COOLIFY_API_TOKEN`; the other Coolify requests use
the token. No Coolify deployment was queued. The Compose resource remains
`Exited` with no domains configured, and the existing staging app/domain was
not changed. The workflow authorization header is corrected in source; a new
merge-triggered run is needed to verify the fix and deployment.
