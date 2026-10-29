# Documentation index

Use the guides by task, not by date or author. “Current” describes
repository-backed guidance; it does not prove that an external service is
configured or that an operator procedure has been run. Live-system questions
belong in the [environment status record](reference/environment-status.md).

## Getting started

- [Development setup and workflows](getting-started/development.md) — local
  setup, tests, build, and dependency workflow.
- [Configuration reference](reference/configuration.md) — environment-variable
  names and code-level behavior; never a place to record secret values.
- [Browser test safety](../tests/e2e/README.md) — isolated database setup and
  fixture lifecycle.

## Architecture

- [Database and migrations](architecture/database-and-migrations.md) —
  PostgreSQL, Prisma, migration workflow, and legacy ownership migration.
- [Object storage](architecture/object-storage.md) — local files, MinIO, and
  the application storage configuration.
- [Tenant isolation](architecture/tenant-isolation.md) — application scoping,
  PostgreSQL row-level security, and runtime-role checks.

## Operations

- [Deployment and release](operations/deployment-and-release.md) — CI images,
  release flow, and operational deployment gates.
- [Tenant lifecycle and recovery](operations/tenant-lifecycle-and-recovery.md)
  — tenant administration, exports, backups, and recovery guidance.
- [Incident response](operations/incident-response.md) — draft response
  procedure; validate contacts and service dependencies before use.
- [Observability](operations/observability.md) — health endpoints, logs,
  database checks, and CI security checks.
- [VPS recovery (runbook 00)](operations/vps-recovery.md) — replacement
  infrastructure procedure; not yet rehearsed.
- [Server bootstrap (runbook 01)](operations/server-bootstrap.md) — dated
  initial host setup guidance.
- [WireGuard and admin access (runbook 02)](operations/wireguard-admin-access.md)
  — dated network and Coolify observations; live state unverified.
- [Coolify backup and upgrade (runbook 03)](operations/coolify-backup-and-upgrade.md)
  — current backup observations and scratch-restore result; full service
  recovery and remote destination remain unverified; displayed settings were
  not confirmed saved.
- [Storage capacity and portability (runbook 04)](operations/storage-capacity-and-portability.md)
  — read-only VPS usage procedure and an untested portability checklist.
- [Secret rotation (runbook 05)](operations/secret-rotation.md) — procedures
  and credential-name inventory; active consumers and revocation unverified.
- [Ansible VPS baseline](../ansible/README.md) and
  [Contabo firewall Terraform](../infra/contabo-firewall/README.md) — provider
  and host-specific procedures with dated observations.
- [Script reference](../scripts/README.md) — repository operations commands.

## Security and privacy

- [Privacy data map](security-privacy/data-map.md) — technical inventory, not
  a legal record; live providers and regions unverified.
- [Data retention and deletion](security-privacy/data-retention.md) —
  application rules; scheduled-job and provider retention unverified.
- [GDPR technical readiness](security-privacy/gdpr-readiness.md) — technical
  review only, not legal advice or a compliance claim.

## Planning and status

- [Pilot readiness](planning/pilot-readiness.md) — application controls and
  deployment checklist; live environment unverified.
- [Self-hosted platform plan](planning/self-hosted-platform-plan.md) — plan
  and dated operator reports, not a live dashboard.
- [Environment status](reference/environment-status.md) — authoritative
  repository-evidence ledger and external confirmation checklist.

## Archive

These are retained for traceability and should not be read as current
operational instructions:

- [Documentation audit](archive/documentation-audit.md) — dated audit and
  original findings.
- [Baseline audit](archive/baseline-audit.md) — historical code/product
  snapshot.
- [Dedicated database assessment](archive/dedicated-database-assessment.md) —
  historical assessment, partly superseded by the platform plan.
- [Vercel and Neon compatibility notes](archive/vercel-neon-compatibility.md)
  — retained code-path notes, not the current deployment recommendation.

Component-specific UI guidance remains in
[`.agents/skills/shadcn/SKILL.md](../.agents/skills/shadcn/SKILL.md).
The repository overview and quick start are in the [root README](../README.md).
