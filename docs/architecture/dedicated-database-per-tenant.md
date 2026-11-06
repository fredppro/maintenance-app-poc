# Dedicated database per tenant: feasibility and target architecture

**Status: future capability, not implemented.** The application currently uses
one shared PostgreSQL database. The `DEDICATED` enum value is reserved metadata,
not a switch that routes requests to another database. Do not assign tenants
this tier or place tenant connection strings in application configuration.

## What exists today

- `TenantSettings.isolationTier` has `POOLED` and `DEDICATED` values and
  defaults to `POOLED`; the code comment reserves `DEDICATED` for a future
  database.
- `src/lib/prisma.ts` creates one module-level Prisma client from the runtime
  database URL. `forTenant(organizationId)` wraps that same client and sets
  `app.org_id` transaction-locally; it does not select another host, database,
  or Prisma client.
- `src/lib/tenant-context.ts` validates the signed-in user's membership before
  producing a tenant client. Authentication, user accounts, organizations,
  memberships, and tenant data currently use the same database.
- `src/app/api/cron/maintenance-reminders/route.ts` reads organizations from
  the shared client and currently skips organizations whose isolation tier is
  not `POOLED`. It does not route dedicated tenants.
- Prisma has one schema and one migration history per database. Existing
  operational scripts assume a single configured database; there is no
  migration fan-out or per-tenant provision/backup/restore workflow.
- PostgreSQL RLS and the restricted runtime role are meaningful protections
  for the shared database. They do not provide dedicated-database routing.

These are architectural gaps, not just missing environment variables. A global
`TENANT_DATABASE_URL` or a URL stored on an organization row would not safely
implement this feature.

## Feasibility and recommended shape

Dedicated PostgreSQL databases are technically feasible, but safe support
requires an explicit boundary between the shared control plane and tenant data.
The simplest maintainable first design to evaluate is:

1. **Keep a central control plane** for users, sessions, organizations,
   memberships, tenant status, and authoritative database-routing metadata.
2. **Route only tenant data operations** to either the shared database or the
   tenant's dedicated database. Preserve organization-scoped authorization
   before resolving or using a connection.
3. **Keep credentials out of tenant records and global environment files.**
   Store a secret reference and credential version in the control plane; resolve
   the secret from an approved secret store at runtime. Never log the URL or
   credential.
4. **Use a bounded, promise-cached Prisma client registry.** Key clients by
   tenant and credential version; prevent duplicate concurrent creation, set
   explicit pool/acquisition limits, drain clients on rotation/eviction, and
   close them on shutdown. A failed dedicated connection must fail closed with
   a tenant-scoped error. It must never silently fall back to the shared
   database.
5. **Keep schema and migration state explicit.** A control/data model
   classification must determine which database owns every model. A proposed
   same-schema approach can retain a minimal organization row in each tenant
   database for existing foreign keys, but this needs a Prisma/migration spike
   and is not an implemented decision.
6. **Route every execution context.** Requests, exports, email reminders,
   retention/purge operations, storage cleanup, administration tools, and
   recovery procedures must use the same resolver and tenant failure policy.
7. **Provision behind an audited state machine.** Create the database, apply
   migrations, provision a restricted runtime role, verify TLS/network
   boundaries and RLS, run isolation and application-path canaries, and only
   then activate routing. Provisioning must be resumable and idempotent.

The existing detailed
[dedicated-database assessment](../archive/dedicated-database-assessment.md)
contains historical schema and connection experiments. Its provider-specific
recommendations and estimates are not current implementation or approval;
revalidate them against the current code and chosen infrastructure before use.

## Benefits and costs

| Benefits | Costs and risks |
| --- | --- |
| A tenant's database outage or capacity issue can be isolated from other tenants. | The application, control plane, and every background job gain routing and failure-handling complexity. |
| Per-tenant restore, retention, maintenance, and potential data-location choices become possible. | Every migration, backup, restore test, monitoring check, and credential rotation must fan out across databases. |
| A customer can receive a stronger infrastructure isolation boundary. | A database per tenant adds fixed cost, connection pools, operational state, and capacity pressure; separate VPSs also require private networking and TLS. |
| Tenant-specific maintenance windows and upgrade gates can be introduced. | The current shared database remains a dependency for identity and membership, so a dedicated data database is not a fully independent application. |

## Required design decisions

Resolve these decisions before a proof of concept:

- Is the isolation unit a separate PostgreSQL database in one cluster, a
  separate managed instance, or a separately hosted server? What customer
  requirement justifies each tier?
- Which records remain central, and which tenant-data models move? How do
  cross-tenant memberships, organization/site selectors, exports, audit events,
  and invitations behave?
- Does the first release support only newly created empty tenants, or must it
  migrate existing tenant data? A shared-to-dedicated data move needs a
  consistency, cutover, verification, and rollback plan.
- Which secret manager stores connection credentials, what identity may read
  them, and how are versions rotated without leaking or cross-routing them?
- What network and certificate policy covers managed databases, another VPS,
  and bare metal? Public database ports are not acceptable.
- What are the schema compatibility window, migration concurrency limit,
  backup retention, restore target, tenant-specific outage behavior, and
  operator response responsibilities?

## Implementation roadmap

1. **Inventory and boundary tests:** classify every Prisma model and call site
   as control-plane or tenant-data; inventory direct global-client access;
   add tests that make accidental cross-boundary access fail.
2. **Design the registry contract:** define routing metadata, secret references,
   error behavior, connection lifecycle, pool budgets, rotation, shutdown, and
   never-fallback tests without enabling routing.
3. **Prove the database/migration model:** use two disposable PostgreSQL
   databases to validate schema creation, Prisma migration history, RLS,
   restricted roles, foreign keys, and deploy/rollback compatibility.
4. **Build operator tooling:** add a protected, audited, resumable provisioner
   and per-tenant migration, health, backup, restore, suspend, and decommission
   operations. Keep activation separate from provisioning.
5. **Run a synthetic canary:** route one test tenant through the real request
   and background-job paths; verify the shared database is not touched for
   dedicated data and that a tenant outage does not block unrelated tenants.
6. **Production-readiness review:** complete security review, capacity/load
   tests, credential-rotation drill, isolated restore test, monitoring and
   incident runbooks before activating a real customer.

## Acceptance gate

Do not mark this capability supported until a tenant's database selection is
derived only from authenticated server-side tenant context; credentials are
secret-store references; all request and job paths use the resolver; a failed
dedicated database never falls back to shared; migrations and backup/restore
are tested across both tiers; RLS and cross-tenant tests pass; and tenant-level
failure behavior is observable and documented.

See the [current deployment architecture](../operations/deployment-architecture.md)
for the supported shared-database path.
