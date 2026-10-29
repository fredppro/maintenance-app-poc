# Environment and operations status

- **Repository review:** 2026-10-29
- **External systems checked for this record:** none
- **Purpose:** authoritative in-repository ledger of what the checked-in
  evidence does and does not establish. This is not a live deployment
  dashboard or a compliance statement.

Do not treat a dated observation or a planned design as the current state.
Update this record only after checking the relevant system; record the date,
evidence, and result, never secret values. Keep unresolved items marked
**unverified**.

## Status from repository evidence

| Area | Evidence and classification | Current conclusion |
|---|---|---|
| Application environments | The self-hosted plan reports a synthetic staging app and database, with a successful HTTPS health check on 2026-10-15. The WireGuard/Coolify runbook, also dated 2026-10-15, says no application or database had been deployed. | **Conflicting dated observations; current staging status unverified.** Production is reported as not deployed in the plan as of 2026-10-15; its current status is unverified. Sources: [self-hosted platform plan](../planning/self-hosted-platform-plan.md), [WireGuard and Coolify runbook](../operations/wireguard-admin-access.md). |
| Deployment pipeline | Repository documentation and the checked-in workflows describe CI checks, image build/scan, and GHCR publication. The reviewed repository contains no Coolify deployment workflow. | **Code/repository-verified:** CI publication is not proof of deployment. Whether Coolify currently deploys manually or through an external mechanism must be confirmed in Coolify. |
| Host and control plane | Runbooks record Contabo, WireGuard, Coolify, and GHCR checks, with dates and specific verification steps. | **Dated operator observations; not rechecked on 2026-10-29.** See [runbook 02](../operations/wireguard-admin-access.md) and [runbook 03](../operations/coolify-backup-and-upgrade.md). |
| Database | Application code uses PostgreSQL/Prisma, migrations, RLS, and separate migration/runtime connection handling. The code retains a conditional Vercel/Neon compatibility path. | **Code-verified.** The current staging or production database host, region, account, and availability are **unverified**. |
| Object storage | Code uses an S3-compatible interface. The platform plan describes single-node Garage on the VPS for synthetic staging files and selects Scaleway Object Storage for planned production files. | **Staging provider is a dated plan observation; production provider is planned, not confirmed deployed.** Current endpoints, regions, buckets, policies, and data locations are **unverified**. See [the platform plan](../planning/self-hosted-platform-plan.md) and [storage usage runbook](../operations/storage-capacity-and-portability.md). |
| Coolify control-plane backup | Runbook 03 records a successful manual database dump and checksum on 2026-10-28. It also says the dump was not restored, the backup page showed an unsaved-changes warning, and no validated S3 destination was configured. | **Dated backup observation only; scheduled backup and restore are unverified.** |
| Application database backup | A GitHub Actions workflow and `pg_dump` script exist. The workflow skips when its required database URL or destination URI is absent. No successful workflow run or restore evidence is recorded in this repository. | **Implementation exists; configuration, execution, off-host copy, retention, and restore are unverified.** |
| Application file backup | The database backup script does not copy Garage objects. The platform plan identifies Garage as single-node staging storage and Scaleway as the planned production storage/backup direction. | **Independent file backup and restore are unverified.** A database dump is not a file backup. |
| Retention and point-in-time recovery | Documentation contains target retention and RPO/RTO values and provider-specific Neon PITR references. The recovery runbook says no tested RPO/RTO is established. | **Targets/proposals only; current provider retention, PITR, lifecycle, and measured recovery times are unverified.** |
| Garage key revocation | No current key value is recorded here or needed for this check. The prior audit noted a Garage key revocation follow-up that cannot be established from repository files. | **Unverified.** Confirm by non-secret key identifier/status in Garage. |
| AI-agent instruction files | `AGENTS.md` contains a Next.js-managed block plus project guidance outside the markers. `CLAUDE.md` imports it; root `GEMINI.md` imports it; `.gemini/GEMINI.md` forwards to root `GEMINI.md`. | **File contents and import paths are repository-verified; which instructions each active agent actually loads is unverified.** Use the relevant tool's context/memory display. |

## External confirmation checklist

Inspect systems by status, names, and configuration labels only. Do not copy,
print, request, or record secret values.

- [ ] **Deployment:** Is staging currently running and healthy? Record its
  application/database presence, last verified time, and deployed image digest.
  Is production deployed? Distinguish manual Coolify deployment from an
  automated pipeline.
- [ ] **Providers and regions:** Confirm the actual hosting, database, email,
  analytics, file-storage, and backup providers and regions. Identify which
  services are live versus only planned; confirm the relevant processor/DPA
  inventory with the responsible privacy reviewer.
- [ ] **Coolify backup:** Confirm the current schedule, retention, destination,
  latest successful execution, and whether the recorded 2026-10-28 dump still
  exists. Separately record whether a restore has been tested.
- [ ] **Application database backup:** Confirm whether the GitHub Actions
  backup workflow is configured and when it last completed successfully. Verify
  the off-host copy, its retention, and an isolated restore result.
- [ ] **Application files:** Confirm the live bucket/service, private-access
  policy, region, lifecycle/versioning/replication settings, and whether an
  independent file copy and restore have been tested.
- [ ] **Recovery objectives:** Record measured recovery results before
  promoting any RPO/RTO target to a commitment.
- [ ] **Garage key:** Verify that the previously exposed key is revoked and
  that any replacement is active, using key identifiers/status only.
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
  those dates. Do not overwrite them; add a newer dated verification when one
  is performed.
- **Not established by this record:** current live deployment, secret-store
  contents, backup workflow configuration or success, restore capability,
  provider account/region configuration, Garage key revocation, legal
  compliance, or active agent context.

Related references: [documentation audit](../archive/documentation-audit.md),
[documentation index](../README.md).
