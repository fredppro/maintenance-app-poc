# Dedicated customer databases — revised assessment and implementation plan

> **Superseded in part (2026-10-13).** The operator decided to self-host on an EU VPS with Coolify instead of Vercel +
> Neon. The master plan is now [self-hosted-platform-plan.md](self-hosted-platform-plan.md). Still valid here: the
> schema decision (section 3), the connection-registry findings and experiment (4.1–4.3, 4.5), the state machine and
> gates (5.1–5.2) and the lifecycle design (5.5). Superseded: Vercel/Neon feasibility and networking (section 6.0–6.x
> and the pilot), the capacity table (4.4), the secret-management recommendation (5.3–5.4), Neon-specific backup/cost
> statements, and the estimates (section 7). Kept unchanged below for the record.


Status: **assessment only (revision 2).** No application code, schema, migration, production resource or secret was
changed. Evidence comes from the repository (HEAD `889df26` plus uncommitted docs), the installed dependency source
(`@prisma/client` and `@prisma/adapter-pg` 7.9.1, `pg-pool` 3.14), a **local experiment** against the disposable e2e
database container (section 4.2; the scratch script and throwaway role/database were deleted afterwards), and the
Vercel and Neon documentation fetched on 2026-10-12. Anything not verified is marked **[unverified]**.

## 0. Approved scope and what changed in this revision

Approved direction: central application and authentication; pooled (shared) databases remain the default; **managed
dedicated databases** (a database we provision and operate for one tenant) are the first dedicated tier.
Customer-controlled databases and customer-hosted applications are **out of scope for release 1**.

Changes from revision 1:

| Topic | Revision 1 | Revision 2 |
| --- | --- | --- |
| Schema | Stub organization row, split deferred | Compared in detail; stub row recommended **plus** two prerequisite seam fixes; split rejected for now because Prisma keeps one migration history per database (4 findings in section 3) |
| New finding | — | `tenant_export` is accessed through the routed tenant client, so export state would land in the dedicated database unless reclassified |
| Connection lifecycle | Described | Validated against Prisma 7.9.1 / adapter-pg 7.9.1 and measured; the naive registry pattern creates one client per concurrent request (50 for 50) |
| Secrets | "Secret manager or envelope encryption" | One concrete choice for the actual deployment (Vercel + GitHub Actions + Neon) |
| Provisioning | Steps | A state machine with six verification gates and a routing predicate |
| Operations | Bullet points | Backup, restore test, retention, export, deletion, suspension and outage procedures |
| Estimate | 5–8 engineer-weeks | PoC ≈ 3 weeks; production readiness ≈ 9–13 engineer-weeks, separated |

## 1. Recommendation

**Proceed, in two separated tracks.**

1. **Pilot validation first (no repository code):** a disposable Neon project plus a throwaway Vercel deployment that
   measures connectivity, latency, cold start, capacity, rotation and failure behaviour against explicit pass/fail
   criteria (section 6). This is the smallest safe next step.
2. **Technical proof of concept** only if section 6 passes: flag-guarded routing for one hand-provisioned database.
3. **Production readiness** as a separate, larger track (section 7).

Schema: **keep one schema; give each dedicated database a minimal stub `organization` row; classify every model into
a control plane or data plane in code; move the logo reference into the data plane.** Revisit a true split only when
the triggers in section 3.4 occur.

## 2. Current state (evidence)

| Aspect | Finding | Evidence |
| --- | --- | --- |
| Runtime | Next.js 16 on Vercel serverless; no `vercel.json`, build command is the `vercel-build` script | `package.json`, `next.config.mjs` |
| Database | PostgreSQL on Neon; pooled `DATABASE_URL`, unpooled for migrations | `README.md`, `scripts/db` |
| Client | Prisma 7.9.1, `@prisma/adapter-pg` 7.9.1; one module singleton; the adapter is given only `{ connectionString }`, so `pg-pool` defaults apply: **`max` 10, `idleTimeoutMillis` 10 s, `connectionTimeoutMillis` 0 (wait forever)** | `src/lib/prisma.ts`, `pg-pool/index.js` |
| Tenant scope | `forTenant(orgId)`: each query is a `$transaction([set_config('app.org_id'), query])` | `src/lib/prisma.ts` |
| Isolation | RLS policy `tenant_isolation` on 10 tables + `tenant_export`; restricted runtime role | migrations `20261008…`, `20261009…` |
| Auth | Better Auth on `prismaAdapter(prisma)`; auth tables in the shared DB | `src/features/auth/server/auth.ts` |
| Context | `loadMembership` (cached per request) then `getOrganizationContext` / `getTenantContext` | `src/lib/tenant-context.ts` |
| Migrations | `prisma migrate deploy` in `vercel-build`; 18 migrations; one `_prisma_migrations` history | `package.json`, `prisma/migrations` |
| Jobs | GitHub Actions: nightly retention/purge (owner URL), nightly `pg_dump` | `.github/workflows` |
| Files | S3 or local object storage, keys `${organizationId}/…`; metadata in `StoredFile` | `src/lib/storage`, `src/features/files/server/files.ts` |

### Access inventory

| Class | Where |
| --- | --- |
| Tenant data via the context `db` | 45 `getTenantContext` / `getOrganizationContext` call sites; 9 direct `forTenant()` calls in 4 files |
| Control-plane tables via bare `prisma` | auth, onboarding, members, settings, lifecycle, provisioning, privacy, health, rate limit (~30 files) |
| **Tenant tables via bare `prisma`** | `scripts/ops/purge-trash.ts`, `scripts/ops/tenant-admin.ts` (stored-file keys during purge), `scripts/legacy/verify-legacy-ownership.ts` |
| Tenant-scoped access to a *control-flavoured* table | `db.tenantExport` in `src/features/export/server/run-export.ts` (RLS applies to `tenant_export`) |
| Cross-organization reads | `getAvailableTenantContexts` reads sites of **every** membership organization; `onboarding/page.tsx` and `switchTenantContext` read sites per organization |
| One-database tooling | `migrate deploy`, `provision-runtime-role`, `verify-runtime-role`, `ops:retention`, `ops:purge-trash`, `ops:tenant purge-due`, `db:backup`, `db:restore-test`, `/api/health` |

## 3. Schema decision: stub organization vs control-plane / data-plane split

### 3.1 Plane classification (needed under either option)

| Plane | Models | Lives in |
| --- | --- | --- |
| **Control** | `user`, `session`, `account`, `verification`, `rateLimit`, `organization`, `member`, `invitation`, `legacy_ownership_assignment`, `organization_audit_event`, `tenant_settings`, `tenant_export` (proposed), new `tenant_database` | shared DB only |
| **Data** | `Site`, `Section`, `Equipment`, `EquipmentRelocation`, `StoredFile`, `MaintenanceTask`, `MaintenanceTaskAssignment`, `Material`, `Worker`, `Vendor` | the tenant's database (shared for POOLED, dedicated for DEDICATED) |

`tenant_export` is the one model that is ambiguous today. It holds job state and a storage key, not customer data,
and the retention sweep (`ops:retention`) expires exports centrally. **Classify it as control**, access it through a
tenant-scoped client on the shared database, and keep RLS on it. This needs a small code change in
`run-export.ts` and the export routes; otherwise a dedicated tenant's export history would live in its own database
where the central sweep cannot see it.

### 3.2 Option S: same schema everywhere + stub `organization` row (recommended)

How each concern is handled:

| Concern | Handling under S |
| --- | --- |
| Organization FKs | 7 data tables (`Site`, `Section`, `Equipment`, `StoredFile`, `MaintenanceTask`, `Worker`, `Vendor`) keep `FOREIGN KEY (organizationId) REFERENCES organization(id) ON DELETE CASCADE`. Provisioning inserts a **minimal stub** `organization` row: the same `id`, placeholder `name`/`slug` derived from the id (no company name copied, for data minimisation), `createdAt`. |
| Same-tenant triggers | `equipment_same_tenant` (Equipment → StoredFile/Section) is data-plane only and works unchanged. `tenant_settings_same_tenant` (control row → `StoredFile`) **cannot span two databases** and is removed by the logo change below. |
| `tenant_settings.logoFileId` | Move the logo into the data plane: add `StoredFile.purpose` (`EQUIPMENT_IMAGE` \| `LOGO`) with a partial unique index (one `LOGO` per organization); read the logo with a data-plane query; remove `tenant_settings.logoFileId`, its FK and trigger via expand → backfill → contract. This also removes a control→data FK for pooled tenants, so there is **one** code path. |
| Exports | Data tables via the routed `db`; members, audit, organization profile, settings via the shared client (this is how `build-export.ts` already splits its reads); file bytes from storage. Export state (`tenant_export`) is control. The export format is unchanged. |
| Deletion | Explicit, resumable decommission (section 5.5): objects → dedicated database/project → control rows. In a dedicated database the stub row's cascade can wipe data, but the project is deleted anyway. |
| Control tables in dedicated DBs | They exist (same migrations) but stay **empty**. Guarded by a boundary rule (3.3) and by verification gate G4 (section 4.4): control tables must contain no rows other than the stub. |
| Migrations | One history, applied identically everywhere. No change to `prisma migrate deploy` semantics. |

Trade-offs: dead, empty control tables in each dedicated database; the stub row is a second copy of the id (never
read by the application); one more invariant to verify. In exchange: no refactor of Prisma generation, migrations,
Better Auth or the 18 existing migrations, and RLS and triggers keep working unchanged.

### 3.3 Boundary enforcement (part of S)

Make the planes unforgeable in code rather than by convention:

- `src/lib/prisma.ts` exports `controlDb(orgId?)` (shared client, tenant-scoped when an id is given) and the context
  returns `db` (routed data client). Data models are typed only on the routed client; control models only on the
  shared one (a thin wrapper type that omits the other plane's delegates).
- A unit test enumerates the Prisma models and fails when a model is not classified; an ESLint rule bans importing
  the bare shared `prisma` in feature code outside an allow-list.
- Fix the three scripts that use bare `prisma` on tenant tables to go through the resolver.

### 3.4 Option P: control-plane / data-plane split (rejected for release 1)

Two Prisma schemas and generated clients; data tables keep `organizationId` as a plain column and RLS; no FK to
`organization`; deletion becomes entirely explicit.

Findings that make P more expensive than it first appears:

1. **The shared database must contain both planes** (pooled tenants' data lives there), but Prisma keeps **one
   migration history (`_prisma_migrations`) per database**. A split therefore needs either Prisma multi-schema with one
   combined history applied everywhere (dedicated databases then still receive the control tables, which is S again)
   or two separate histories and a custom runner so that the shared DB applies both and dedicated DBs only the data
   history. **[needs a spike on Prisma 7.9.1 multi-schema and `migrate deploy` behaviour; not verified.]**
2. Better Auth is bound to one client; it stays on the control client, so the split must not touch it.
3. Seven FKs and cascades are replaced by application code, which weakens integrity for pooled tenants too.
4. The cross-organization reads (site selector, onboarding) are unchanged by either option.

Revisit P when: dedicated tenants exceed roughly 20–30; a customer or auditor requires that no control schema exists in
their database; or the stub row causes operational errors. Cost estimate for P when needed: about 3–4 additional
engineer-weeks plus a migration-tooling spike.

### 3.5 Cross-organization reads (both options)

`getAvailableTenantContexts` (site selector) and the onboarding page read sites for **every** membership organization.
With a dedicated tenant in the list that read hits another database. Required behaviour: read each tenant's sites with
a short per-tenant timeout (e.g. 1.5 s) in parallel; on failure show that organization as "temporarily unavailable"
and keep the others working; never fail the whole selector. Optionally cache the site list for the selector in the
control plane later.

### 3.6 Recommendation

**Option S**, with the logo move, the `tenant_export` reclassification, the boundary enforcement, and the selector
fan-out rule. It delivers the managed-dedicated tier with the smallest blast radius on existing behaviour.

## 4. Prisma connection lifecycle

### 4.1 Validation against the installed stack

- `PrismaPg` accepts a **`pg.Pool`, a `pg.PoolConfig`, or a string** (`node_modules/@prisma/adapter-pg/dist/index.d.ts`).
  With a config object it creates and owns a pool; `dispose()` ends it. With an external pool it does not end it
  unless `disposeExternalPool: true`. It also exposes `onPoolError` and `onConnectionError` callbacks.
- Our current code passes `{ connectionString }`, so it inherits `max 10`, `idleTimeoutMillis 10000`,
  `connectionTimeoutMillis 0`. There is **no per-request acquisition timeout** on the `pg` side; the only bound today is
  Prisma's transaction start wait (default 2 s), which is the source of the `Unable to start a transaction in the
  given time` errors seen during the loaded e2e runs.
- `forTenant` does a batch `$transaction` per query, so one request issues many short transactions that each
  acquire a pooled connection.
- `$extends` returns a thin wrapper. `createTenantClient(base, orgId)` is cheap and stays **per request** over a cached
  base client. Only the base client (adapter + pool) is expensive.

### 4.2 Experiment results (local, disposable)

Run against the e2e Postgres container (`max_connections` 100); script and throwaway objects deleted afterwards.

| # | Question | Result |
| --- | --- | --- |
| 1 | Cost and connections per client (pool `max=2`, one query each) | 1, 10 and 30 clients opened exactly **1 connection each**; no connection is held before first use. RSS: ~80 MB for the first client (module load) and **≤ ~10 MB per additional client** (measurement noisy; 30 clients ≈ 10 clients) |
| 2 | `$disconnect()` | Releases **all** connections (30 → 0 in ~0.4 s); a client **reconnects transparently** if used afterwards. So an evicted client that is still referenced by an in-flight request does not crash, but it silently reopens its pool: the registry must drain, not just drop |
| 3 | Concurrent first use of one tenant key (50 requests) | check-then-`await`-then-set creates **50 clients and 50 live connections** for one tenant; caching the **promise** creates **1** |
| 4 | Saturation, 30 concurrent `[set_config, query]` transactions | 50 ms queries: all succeed at `max 2` (0.87 s) and `max 10` (0.20 s). **300 ms queries at `max 2`: 14 ok, 16 failed with `Transaction API error: Unable to start a transaction in the given time`**; `max 5` and `max 10`: all ok (1.87 s and 0.95 s) |
| 5 | Credential rotation with a warm pool | After `ALTER ROLE … PASSWORD`, **warm connections keep working** (existing sessions are not re-authenticated). A **new** connection with the old password fails with `28P01` in ~27 ms. A new client with the new password works |
| 6 | Idle shrink (`idleTimeoutMillis` 10 s, pool 5) | 5 → **0** connections after 11.5 s idle |

Conclusions: (a) the registry must cache promises and be race-safe; (b) pool size is a latency/capacity trade-off and
a too-small pool fails requests rather than slowing them, because of the 2 s wait; (c) rotation must be a **versioned
swap**, not an in-place password change, otherwise failures appear only when old connections recycle; (d) idle pools
shrink on their own, which keeps per-instance footprint proportional to *active* tenants.

### 4.3 Design

`TenantDatabaseRegistry` (module scope; `globalThis` in development so HMR does not leak pools):

- Key: `${organizationId}:${credentialVersion}`. Value: `Promise<Entry>` so concurrent requests share one creation.
  Entry = `{ client, createdAt, lastUsedAt, inFlight, state }`.
- Resolution order on every request: `loadMembership` (cached per request) → `status === ACTIVE` →
  `tenant_database` row (cached per request, plus a 30–60 s in-memory metadata cache to bound control-plane load)
  → registry. The `tenant_database` read joins the same request-scoped cache as the membership.
- **Pool options for dedicated clients:** `max 3`, `idleTimeoutMillis 10_000`, `connectionTimeoutMillis 3_000`,
  `maxLifetimeSeconds 300` (so a stale credential or endpoint is naturally retired), `allowExitOnIdle false`, and an
  `onPoolError` that logs the event name only. Align Prisma's transaction start wait (client constructor `transactionOptions.maxWait`, default
  2 s per experiment 4) with the acquisition budget so failures are classified as
  `TenantDatabaseUnavailableError` rather than a generic transaction error. **[unverified: whether `maxWait` applies to
  the array-form `$transaction([...])` that `forTenant` uses; experiment 4 shows the 2 s wait does apply to it. Confirm
  in the pilot (M5) and in a unit test before relying on it.]**
- **Registry cap:** at most 8 dedicated clients per instance (configurable). Eviction is LRU among entries with
  `inFlight === 0`; an entry is **drained** (stop handing out; `$disconnect()` after in-flight reaches 0 or a 10 s
  deadline), never just dropped, because a referenced client reopens its pool after `$disconnect()` (experiment 2).
- **Failure handling:** connect/auth failures map to a typed error; a per-tenant circuit breaker (5 failures → open
  for 30 s, half-open probe) prevents pool thrash and 3 s timeouts on every request. **No path ever falls back to the
  shared client.** An integration test with a poisoned registry asserts this.
- **Rotation** (versioned swap, two role slots A/B per database, section 4.5): metadata cache TTL 60 s picks up the new
  `credentialVersion`; new requests use the new key; the old entry drains. A request that fails with `28P01` or
  `57P01` re-resolves metadata **once** and retries before surfacing an error.
- **Interaction with the pooler:** `set_config(..., true)` is transaction-local and Prisma issues the batch as one
  transaction, which is compatible with PgBouncer **transaction mode** (Neon's pooler). `statementNameGenerator` is
  unset, so no named prepared statements are created. Session state (`SET`) must never be used. Migrations, `pg_dump`
  and the verification suite use the **direct** (unpooled) endpoint.

### 4.4 Capacity across Vercel instances

Per tenant database, client connections ≈ `I × P`, where `I` = warm instances that served the tenant within the idle
window and `P` = pool max (3). Instance counts depend on traffic and Vercel concurrency settings **[unverified for our
plan]**, so size by parameter:

| Warm instances `I` | Client connections to one tenant DB (`P` = 3) | Direct to a 0.25 CU compute (97 usable) | Through Neon's pooler |
| --- | --- | --- | --- |
| 5 | 15 | ok | ok |
| 33 | 99 | **exhausted** | ok |
| 100 | 300 | **exhausted** | ok (limit 10,000 client connections; backend pool 0.9 × `max_connections`) |

Neon facts used (docs, 2026-10-12): `max_connections` 104 (0.25 CU) to 4,000 (9+ CU), seven reserved; PgBouncer in
transaction mode accepts up to **10,000 client connections**, with pools per user and database sized at 90 % of
`max_connections`; pooled endpoints do not support session-level `SET`/`LISTEN`; protocol-level prepared statements are
supported.

Therefore: **runtime always uses the pooled (`-pooler`) endpoint**, `P` stays small, and capacity is monitored per
tenant (`pg_stat_activity` via the health job, alert at 70 % of `max_connections` or of the pooler pool). Per-instance
worst case is `8 tenants × 3 = 24` connections for dedicated plus the shared pool of 10.

The existing shared pool (`max` 10, no acquisition timeout) should get the same explicit options **before** the
dedicated work, as a small independent hardening (the e2e failures show the current behaviour under load).

### 4.5 Credential rotation procedure

1. Operator job (GitHub protected environment) connects with the migrator role, sets a new random password on the
   **inactive** runtime slot (`maintenance_runtime_a` / `_b`).
2. Encrypts it (section 5.4), writes `credentialVersion + 1`, `activeSlot` flipped, audit event.
3. Instances pick it up within the 60 s metadata TTL; old entries drain.
4. After a 5-minute overlap, revoke the old slot (set `NOLOGIN` or rotate its password) and terminate its sessions.
Failure at any step leaves the previous slot active, which is why slots are used instead of in-place `ALTER ROLE`.

## 5. Provisioning, secrets, operations

### 5.1 State machine

`tenant_database.state` (and the routing predicate) — transitions are performed only by the provisioning tool and each
writes an audit event with ids only:

```
REQUESTED ──► PROVISIONING ──► PROVISIONED ──► MIGRATING ──► MIGRATED ──► VERIFYING ──► VERIFIED ──► ACTIVE
     │             │               │              │             │             │             │          │
     └─────────────┴───────────────┴──────────────┴─────────────┴─────────────┴──► FAILED(step) ◄────┘   │
ACTIVE ◄──► DEGRADED ──► UNAVAILABLE      ACTIVE ──► SUSPENDED ──► ACTIVE      ACTIVE/SUSPENDED ──► DECOMMISSIONING ──► DECOMMISSIONED
```

- `VERIFIED` means all gates passed but **routing is still off**. `ACTIVE` is a deliberate operator action
  (`ops:tenant activate-db`) that re-runs the gates and then flips `tenant_settings.isolationTier`.
- `FAILED(step)` records the failing step and is resumable (each step is idempotent); it never changes the tier.
- **Routing predicate (all must hold, evaluated per request from the control plane):**
  `isolationTier = DEDICATED` **and** `tenant_database.state = ACTIVE` **and**
  `verifiedAt` is set **and** `schemaVersion ≥ app minimum` **and** `credentialVersion` decryptable.
  Anything else yields `TenantDatabaseUnavailableError` (never the shared database).
- DB-level guard: a `CHECK` that `state = 'ACTIVE'` requires `verifiedAt IS NOT NULL AND verifiedSchemaVersion IS NOT
  NULL`; the application has a single function that writes `isolationTier = DEDICATED` (no other code path), covered by a
  test that greps for writes.

### 5.2 Verification gates (all must pass before `VERIFIED`; re-run at activation)

| Gate | Check | Evidence stored |
| --- | --- | --- |
| G0 Empty-tenant | The organization has **no** data-plane rows in the shared database (v1 does not migrate existing data); sites/equipment counts are 0 | counts |
| G1 Provisioned | Project/branch/database exist in the intended region and Postgres version; endpoint reachable over TLS `verify-full` from the **Vercel runtime** (probe route), not only from the operator machine | region, version, probe latency |
| G2 Migrated | All migrations applied; `_prisma_migrations` matches the repository exactly; stub `organization` row present | migration list hash, `schemaVersion` |
| G3 Runtime role | Role is not superuser, not `BYPASSRLS`, no `CREATEDB`/`CREATEROLE`/replication, not an owner of tables; password authenticates; migrator and runtime roles are distinct | output of the generalised `verify-runtime-role` |
| G4 Structure | RLS enabled and forced on all tenant tables and `tenant_export`; policy present on each; control tables empty except the stub; exactly **one** `organization` row; every tenant row's `organizationId` equals this tenant | per-table report |
| G5 Isolation | As the **runtime role**, inside rolled-back transactions: no `app.org_id` ⇒ 0 rows and writes rejected; another org id ⇒ 0 rows and writes rejected; same-tenant triggers reject cross-tenant file/section references | pass/fail per assertion |
| G6 Canary from runtime | A signed probe call from the deployed app reads and writes a canary through the real code path (routing predicate, registry, RLS client) and a **shared-database canary counter is unchanged** (proves no fallback) | request ids |

`VERIFIED` stores a report hash, `verifiedSchemaVersion` and timestamp. **`ACTIVE` is refused if `verifiedAt` is older
than 24 hours or the schema version moved.**

### 5.3 Secret inventory (actual deployment: Vercel + GitHub Actions + Neon)

| Secret | Where | Never |
| --- | --- | --- |
| `NEON_API_KEY` (organization-scoped) | GitHub **protected environment** `tenant-operations` only | in Vercel, in the repository |
| Tenant **runtime** role password | Control-plane column `tenant_database.credentialCiphertext` (AES-256-GCM; AAD = `organizationId \| credentialVersion \| keyId`) | in logs, exports, audit `details`, the browser |
| Credential encryption keyring `TENANT_CREDENTIAL_KEYS` (`{keyId: key}`) | Vercel **sensitive** environment variable; separate from `BETTER_AUTH_SECRET`; a copy escrowed offline | derived from `BETTER_AUTH_SECRET` |
| Tenant **owner/migrator** password | **Not stored.** Operator jobs obtain/reset it through the Neon API per run (`POST /projects/{id}/branches/{id}/roles/{role}/reset_password`) for a dedicated `maintenance_migrator` role | persisted anywhere |

### 5.4 Secret-management recommendation

**Application-level envelope encryption with a Vercel-held key ring; no external secret manager for release 1.**

Why this fits the actual deployment: Vercel environment variables are already the trust root (they hold the shared
owner/runtime credentials today); an external secret manager would add a cloud account, OIDC federation and a
latency-sensitive call on the request path for little extra protection. Compared with the alternatives:

| Option | Assessment |
| --- | --- |
| **Encrypted column + Vercel key ring (recommended)** | No new infrastructure; random per-tenant passwords; per-tenant rotation without redeploy; key rotation by `keyId` re-encryption; same trust root as today |
| Derive passwords from a master secret (as the shared runtime role does today) | Zero stored secrets, but rotating the master secret forces a redeploy-coupled rotation of **every** tenant at once (already true for `BETTER_AUTH_SECRET` and the shared role); rejected |
| One Vercel env var per tenant | Env var count/size limits, redeploy per rotation, all visible to every function; rejected |
| AWS/GCP secret manager or Vault via OIDC | Strongest separation and audit trail; adds infrastructure and a runtime dependency; **upgrade path**: the `credentialRef` indirection lets a `CredentialStore` implementation swap in later without schema change |

Honest limits: anyone who can read Vercel's sensitive variables and the control-plane database can decrypt tenant
runtime credentials, and that same actor can already reach the shared database. Mitigations: sensitive variables,
access restricted to the runtime and a small operator group, decryption only in memory, no logging (the logger already
redacts URLs and keys named `password`/`secret`/`database_url`; add a test), audit of every credential write, and
per-tenant revocation by rotation. Re-evaluate when a customer or auditor requires hardware-backed keys.

### 5.5 Operations and recovery for managed dedicated tenants

**Backups**

- Neon point-in-time restore: history window **up to 7 days (Launch) / 30 days (Scale)**, billed per GB-month; manual
  **snapshots** (100 manual snapshots on paid plans) via API; branch restore API exists. We rely on these for fast recovery.
- Independent logical backup: generalise `scripts/db/backup/backup-db.sh` into a fan-out job (GitHub protected
  environment) that, per `ACTIVE` dedicated database, resets the migrator password through the Neon API, runs
  `pg_dump` on the **direct** endpoint, writes to the off-site bucket that the app cannot write to, and records
  `lastBackupAt` and checksum in the control plane. A tenant with no successful backup in 36 hours raises an alert.
- Files are in the central bucket (prefix per organization); bucket versioning/lifecycle covers them. Backups of the
  control plane are the existing nightly dump of the shared database.
- **Proposed objectives [decision needed]:** RPO ≤ 5 min within the PITR window and ≤ 24 h outside it; RTO ≤ 2 h for a
  PITR/branch restore, ≤ 8 h for a cross-region logical restore.

**Restore testing**

- Monthly automated: restore the newest logical dump into a scratch Neon project, run gates G2–G5 plus row counts
  against the dump manifest, record the result, delete the project. Quarterly drill: PITR a canary dedicated tenant to
  a new branch and repoint it with a credential rotation. A backup job that has never been restored is treated as
  untested in the dashboard.

**Retention and purge**

- `ops:retention` and `ops:purge-trash` fan out over `ACTIVE`/`SUSPENDED` dedicated databases with bounded concurrency
  and per-tenant failure isolation; the shared-database sweep is unchanged. Per-tenant `lastRetentionAt`; alert when a
  tenant misses 48 hours. `purge-trash` must stop using bare `prisma` for tenant tables (section 3.3).

**Exports**

- The routed `db` reads data; control reads use the shared client; `tenant_export` is control (3.1). If the database is
  `DEGRADED` the export is recorded `FAILED` with a generic reason and can be re-queued. Large exports must respect
  function duration limits **[unverified]**; the first release may run exports from the operator job for dedicated
  tenants.

**Deletion (extends the existing 30-day pending-deletion flow)**

1. Status `PENDING_DELETION` stops routing (already enforced before database resolution) and blocks writes.
2. At `deletionScheduledFor`: state `DECOMMISSIONING`; list stored-file keys **from the dedicated database**.
3. Take a final logical dump to the restricted bucket with a documented retention (decision needed; default 30 days),
   because Neon keeps a deleted project recoverable for **7 days** and the dump is our auditable window.
4. Delete storage objects, then delete the Neon project through the API, verify it is gone.
5. Delete control-plane rows (cascade), keeping a tombstone audit event (ids and timestamps only).
6. Each step is idempotent and resumable; the `tenant_database` row is removed **last**, so an interrupted run can
   always find the project to finish. Backups age out by policy; this is a readiness measure, **not a compliance claim**.

**Suspension**

- Tenant suspension (policy/billing) is a `tenant_settings.status` change and already blocks requests before any
  database resolution; the database stays up so operators can export and so the tenant can be reactivated quickly.
- Database suspension (infrastructure/cost) is a separate `SUSPENDED` database state used only by operators.

**Prolonged outage of one tenant's database**

- Detect: failed probes ⇒ `DEGRADED` after 3 minutes, `UNAVAILABLE` after 15; per-tenant circuit breaker (4.3).
- Behaviour: that tenant sees a controlled "temporarily unavailable" page (HTTP 503 with `Retry-After`); other tenants,
  authentication, and the site selector are unaffected (3.5); background jobs skip and alert; there is **no fallback and
  no write to the shared database**.
- Recover: check Neon status and the compute; if the data is intact, restart or resize; otherwise restore a PITR
  branch (`restore` API) or a logical dump into a new project, repoint with a new `credentialVersion`, rerun gates G1–G6,
  and return to `ACTIVE`. Use `docs/incident-response.md`; notify the customer after 15 minutes, escalate after 4 hours
  **[thresholds are proposals]**.
- Regional loss: restore the latest logical dump into a project in another region (RTO measured in hours; stated
  openly to customers).

### 5.6 Authorisation

Only operators (the `ops:tenant` CLI, later an admin console) may create `tenant_database` rows, rotate credentials,
activate, suspend or decommission. No customer action, organization id or connection string from the client
participates; `updateOrganization`/`deleteOrganization` stay closed.

## 6. Pilot validation: disposable connectivity and performance experiment

Purpose: prove the platform assumptions **before** implementing the feature. No repository code, no production
resource, no production secret, no customer data.

### 6.0 Prerequisite checks (2026-10-12)

| Check | Finding | Status |
| --- | --- | --- |
| Neon account type | `.env` holds `POSTGRES_*`, `PG*`, `POSTGRES_PRISMA_URL`, `DATABASE_URL_UNPOOLED`: the variable set injected by the **Neon–Vercel Marketplace integration**. No `NEON_API_KEY` or project id is present anywhere in the repository or `.env`. A separate test Neon organization (empty, no projects) with a **personal** API key was used for the check | **Verified 2026-10-12:** list `200`; create `201` in 0.5 s (`aws-us-east-1`, Postgres 18 default); delete `200`; organization back to 0 projects. A personal key needs an explicit `org_id` (query on list, `project.org_id` on create); an organization-scoped key infers it |
| Marketplace implications | Neon docs: in the **Vercel-managed** integration, plan, billing and compute settings are changed **only in the Vercel dashboard**, and the Neon CLI needs API-key authentication because the account is Vercel-managed. Whether that account may create *additional* projects through the Neon API is **[unverified]** | Needs a live test |
| Production Neon region | Host `ep-…-pooler.c-6.us-east-1.aws.neon.tech`: **AWS us-east-1 (N. Virginia)** for pooled, unpooled and migration URLs | Verified from the hostname |
| Vercel function region | Operator confirmed the dashboard setting: **Washington, D.C. (`iad1`)**. The production Neon hostname resolves to **AWS us-east-1 (N. Virginia)**, the same metro/region | **Verified by operator** |
| Data-location conflict | `docs/gdpr-readiness.md` lists "confirm EEA regions" for Neon, Vercel, Resend and the bucket as a pre-onboarding item; the production database is in us-east-1 | **Open decision** (not a compliance statement) |

Consequences for the pilot:

- The pilot needs **only a disposable Neon project**, so it does **not** depend on the production Neon account. Use a
  separate personal/test Neon account with its own API key. The Marketplace question (D1) then matters for
  production, not for running the experiment.
- **Target market is the EU (operator decision, 2026-10-13).** Today's layout is us-east-1 ↔ `iad1`. The pilot's
  **primary arm is therefore Frankfurt: Neon `aws-eu-central-1` ↔ Vercel `fra1`** (the same AWS region on both sides,
  verified in both providers' docs). London (`aws-eu-west-2` ↔ `lhr1`) is the alternative.
- **Moving only the dedicated databases to the EU is the wrong design.** Every request first reads the *control plane*
  (session, membership, `tenant_settings`, `tenant_database`) from the shared database. If the function runs in `fra1`
  and the shared database stays in us-east-1, each request pays the Atlantic round trip on those reads; if the function
  stays in `iad1` and the dedicated database is in Frankfurt, each tenant query pays it. Dedicated and pooled tenants
  should therefore share one region: **function region, shared database, dedicated databases and the file bucket all in
  the same EU region.** This makes the EU decision a migration of the *existing* production deployment
  (D2), not only a dedicated-tier choice.
- Pilot arms: **A) Frankfurt ↔ `fra1` (primary)**; **B) cross-region negative control** (`fra1` function ↔ us-east-1
  database, i.e. a half-migrated deployment) to quantify the cost; **C) us-east-1 ↔ `iad1`** as a baseline for today;
  **D) adjacent-region check: `cdg1` (Paris) function ↔ Frankfurt database.** Neon has **no Paris region** (verified:
  its AWS regions are us-east-1/2, us-west-2, eu-central-1, eu-west-2, ap-southeast-1/2, sa-east-1, plus three Azure
  regions), so Paris is only reachable on the function side. Arm D tests whether the ~10 ms user-side saving
  outweighs a cross-region hop on every statement (expected: no; **[unverified until measured]**).
  Compare B and D against the M2/M3 thresholds.
- Data location is a readiness item, not a compliance claim: region choice does not by itself establish compliance.

**Setup (2–3 days, ≈ one engineer):**

- Three throwaway Neon projects (`probe-a`, `probe-b`, `probe-c`) in the **same cloud region** as the Vercel function
  region, plus one in a different region for information. Each has a pooled and a direct endpoint, a runtime role and a
  migrator role created exactly as section 5.2 describes (SQL as owner).
- A **separate throwaway Vercel project** (a tiny Next route-handler app in a scratch repository or directory outside
  this repository) with the Neon credentials in its own sensitive env vars. It must not share env vars, domain or code
  with the product.
- The probe replays the same patterns the product uses: `[set_config('app.org_id'), query]` batch transactions, a
  12-transaction "page", the registry (promise-cached clients, pool `max 3`, `maxWait` 3 s), and a load generator.

**Measurements and pass/fail criteria** (thresholds are **proposals to agree before running**):

| # | Measurement | Pass | Fail ⇒ action |
| --- | --- | --- | --- |
| M1 | Connectivity: 2,000 mixed cold/warm invocations; TLS `verify-full` on every connection | ≥ 99.9 % success; no TLS downgrade | Re-evaluate endpoint/TLS config |
| M2 | Latency, same region: p95 of one `[set_config, query]` transaction vs the existing shared-DB baseline | ≤ +20 ms p95; absolute ≤ 40 ms | Reduce statements per page first (finding P1) or reconsider region |
| M3 | A realistic page (12 transactions, tenant on a dedicated DB) | p95 ≤ 250 ms database time | Same as M2 |
| M4 | Cold path: first query on a cold function after 10 min idle, including compute wake-up (scale to zero) | p95 ≤ 1.5 s; document with and without scale-to-zero | Decide whether dedicated computes may scale to zero |
| M5 | Capacity: 200 req/s for 5 min across the three tenants; also tests whether `transactionOptions.maxWait` changes the batch-transaction wait | 0 `Unable to start a transaction`, 0 connection errors, backend connections ≤ the bound of section 4.4 | Resize pools or compute |
| M6 | Transaction-local tenant setting through the pooler: 10,000 interleaved transactions over two tenants/two sessions | 0 cross-tenant reads (tenant id observed always equals the set id) | **Blocking** — do not proceed |
| M7 | Rotation under load (slot swap, section 4.5) | ≤ 0.1 % failed requests during the window; 0 outage | Rework rotation |
| M8 | Failure injection: wrong password, revoked role, suspended compute, firewall-style block | Typed tenant-only error within 5 s; **other tenants' error rate unchanged**; shared canary counter = 0 | **Blocking** — no fallback allowed |
| M9 | Provisioning timing: project create + 18 migrations + gates | ≤ 5 min end to end | Optimise or run async |
| M10 | Cost: idle and light-load monthly cost per project; project-count limits (docs: 100 on Launch, 1,000 on Scale, increasable) | Documented; fits the pricing hypothesis | Revisit packaging |

**Exit:** a one-page result table with raw numbers, the decision (go / adjust / stop), and teardown confirmation
(all probe projects and the Vercel project deleted). M6 and M8 are blocking; the others adjust parameters.

## 7. Implementation sequence

Two tracks. Estimates are engineer-days for one person who knows the codebase; confidence in brackets.

### Track 1 — technical proof of concept (flagged off; not production)

| # | Work | Depends on | Est. |
| --- | --- | --- | --- |
| 1.0 | Decisions D1–D6 (section 9) | — | 2 d, people-bound [low] |
| 1.1 | Pilot validation experiment (section 6) | D1, Neon API key | 3 d [medium] |
| 1.2 | Pool options for the shared client + statements-per-page budget (independent hardening) | — | 2 d [high] |
| 1.3 | Plane classification, boundary test, `controlDb`, `tenant_export` reclassification | — | 3–4 d [medium] |
| 1.4 | Registry + resolver behind an env flag, one hand-provisioned database, typed errors, no fallback test | 1.1, 1.3 | 5–6 d [medium] |
| 1.5 | Two-database test profile (`docker compose --profile dedicated`), RLS suite run against both | 1.4 | 2 d [high] |
| | **PoC total** | | **≈ 3 weeks (≈ 15–17 working days)** |

PoC exit: a tenant routed to a second database passes the existing e2e journeys and tenant-isolation specs; a
poisoned-registry test proves no fallback; M1–M8 numbers are reproduced against the real code path.

### Track 2 — production readiness

| # | Work | Depends on | Est. |
| --- | --- | --- | --- |
| 2.1 | Logo move to `StoredFile.purpose` (expand → backfill → contract migrations, upload/read/delete, export, tests) | 1.3 | 4 d [medium] |
| 2.2 | `tenant_database` model + migration, state machine, audit events, activation guard | 1.3 | 4 d [medium] |
| 2.3 | Credential encryption (key ring, versions, rotation slots, tests incl. no-leak) | D3 | 4 d [medium] |
| 2.4 | Provisioning CLI against Neon API (create, roles, migrate, stub org, gates G0–G6, report) | 2.2, 2.3, 1.4 | 8–10 d [**uncertain**: Neon API behaviours] |
| 2.5 | Migration fan-out (`ops:db migrate`), `schemaVersion`, N/N-1 compatibility CI check, tenant maintenance state | 2.2 | 4–5 d [medium] |
| 2.6 | Cross-organization reads with per-tenant timeouts (selector, onboarding, switch) | 1.4 | 2–3 d [medium] |
| 2.7 | Operations: health probes, circuit breaker metrics, alerts, rotation job | 2.4 | 5 d [medium] |
| 2.8 | Backup fan-out, restore test automation, retention/purge fan-out | 2.4, D4 | 6–8 d [medium] |
| 2.9 | Deletion/decommission and suspension flows; export for dedicated tenants | 2.4 | 4–5 d [medium] |
| 2.10 | Runbooks (provisioning, rotation, outage, restore), documentation, security review | all | 3–4 d [high] |
| 2.11 | Internal pilot tenant (canary) then one real customer | 2.1–2.10 | 1–2 weeks elapsed [**customer-bound**] |
| | **Production readiness total** | | **≈ 9–13 engineer-weeks plus pilot elapsed time** |

Critical path: 1.1 → 1.4 → 2.4 → 2.8 → 2.11. Parallelisable: 2.1, 2.2, 2.3 (after 1.3). Items 1.2 and the logo move
are valuable even if dedicated databases are later cancelled.

## 8. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Silent fallback to the shared DB | No fallback path; typed error; shared-canary counter in tests and gate G6 |
| Cross-tenant reads through a mis-set tenant setting on the pooler | M6 blocks the project; RLS tests run against both databases |
| Pool exhaustion / failed requests under load | Small `P`, pooled endpoint, explicit acquisition budget, capacity alerts (4.4, experiment 4) |
| Rotation outage | Two role slots, versioned registry key, one retry (experiment 5) |
| Credential exposure | Encrypted column, sensitive env key ring, no logging, tests (5.3, 5.4) |
| Operator mistakes at provisioning | Resumable state machine, gates, no manual flag flip, audit |
| Schema skew across databases | Fan-out migrations, N/N-1 CI check, per-tenant maintenance state |
| Backups untested | Monthly automated restore test; untested backups flagged |
| Neon plan limits | Documented project limits; check before sales commitments |
| Latency multiplication (67–86 statements/page measured earlier, reduced by per-request caching) | M2/M3 criteria; statement budget test before dedicated launch |

## 9. Unresolved decisions

**Block Track 1 start**

- D1. Neon account model for **production** dedicated projects (not needed for the pilot): the current database
  appears to come from the **Vercel-managed Marketplace integration** (section 6.0). Decide between a separate
  Neon-managed organization with its own API key and billing (cleanest for API-driven provisioning), or confirming
  that the Vercel-managed account can create projects through the API **[unverified]**.
- D2. Region(s): read the Vercel function region from the dashboard, and decide whether production data must be in the
  EEA. This chooses the pilot's regions and may move the **existing** deployment too.

**Block Track 2 start**

- D3. Confirm the secret approach in 5.4 (Vercel-held key ring, no external secret manager for release 1).
- D4. Backup/restore objectives (RPO/RTO), PITR window and plan (Launch 7 days vs Scale 30 days), final-dump retention
  at deletion.
- D5. Who operates provisioning and holds `NEON_API_KEY` and the GitHub protected environment.
- D6. Packaging: which customers qualify, expected count in year one (drives project limits and cost).

**Can be deferred:** customer-controlled databases (and Static IPs / Secure Compute), customer-hosted application,
shared→dedicated data migration, control/data schema split (triggers in 3.4), self-service UI, per-customer buckets.

## 10. Smallest safe next step

Run the **disposable pilot validation (section 6)** once the two prerequisite checks in 6.0 are done (a test Neon API key that can create and delete a project, and the Vercel function region). It needs **no repository change**,
touches no production resource or secret, costs a few days, and answers the questions that would otherwise be expensive
to discover mid-implementation (pooler behaviour for the tenant setting, cold-start and latency, capacity, rotation,
failure isolation). The independent hardening in 1.2 (explicit pool options for the shared client) can be done in
parallel and is worth doing regardless.
