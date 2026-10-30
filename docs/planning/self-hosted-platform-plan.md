# Self-hosted platform plan (pooled multi-tenancy)

Plan origin: `feature/MAINPOC-14-saas-self-hosted` · Status: **historical plan, revision 2 (2026-10-15: Contabo Cloud VPS 4, Coolify on the production server, single operator).** The deployment details in this paragraph describe the state recorded on 2026-10-15, not a live status. At that date, Coolify had been reinstalled with fresh secrets after an earlier local backup was exposed; the first administrator and 2FA were configured, GHCR access was verified, and the operator confirmed the encrypted off-host secret backup was complete. The local plaintext copy had been removed. The synthetic staging app and database were deployed at `staging.maintenance.isosist.com`; HTTPS and `/api/health` returned `{"status":"ok"}` on 2026-10-15. Production app/database and the staging deployment pipeline were reported not deployed. The repository had local Docker Compose development, GitHub Actions checks, and a GHCR image-release job; this did not deploy production or access a production database.

On 2026-10-29, the operator reported that both staging and production were deployed. A read-only Coolify inspection showed the staging app, database, and Garage resource running; the app log reported Next.js ready, but no app health check was configured. Production was not independently viewed. This newer evidence updates deployment-existence reporting only: it does not establish production health, prove that the plan's pilot or go/no-go gates passed, or verify the deployed image and deployment method. See the [environment status ledger](../reference/environment-status.md) for the evidence and remaining unknowns.

## Current scope (operator clarification, 2026-10-29)

The active product scope is a VPS-hosted SaaS using pooled multi-tenancy and
the existing tenant-isolation controls. This is the approach being developed
on `develop`. Dedicated databases per customer are out of scope for now.
Vercel is not an active deployment target; it may be considered only as a
last-resort fallback if the VPS-based approach cannot be made viable and that
change is explicitly approved.

This document preserves the earlier platform plan and its dated evidence.
Sections about dedicated databases are deferred design material, and the
Vercel/Neon cutover content is historical. Neither authorizes work outside the
current scope. Use the [security and product readiness plan](security-and-product-readiness-plan.md)
for current application-hardening priorities and the [environment status ledger](../reference/environment-status.md)
for evidence and live-state unknowns. For storage capacity checks and the
read-only aged-object inventory, use the [storage capacity and portability
runbook](../operations/storage-capacity-and-portability.md).

Evidence rules: facts about Coolify come from its documentation (fetched 2026-10-13) and are cited by page; facts about
this repository come from the code at the branch point (`889df26`); everything else is a **proposal** or marked
**[verify]**. Nothing here is a compliance statement: it describes engineering readiness only.

## 0. Historical decisions (2026-10-13; superseded where they conflict with current scope)

| Decision (operator, 2026-10-13) | Reading in this plan |
| --- | --- |
| Self-host everything; drop Vercel and Neon; use Coolify "or something similar" | Coolify is the deployment control plane **with the hardening in section 3.4**; section 12 keeps a fallback (plain Docker Compose + Caddy) if the pilot rejects it |
| A customer can have **its own database instance running** | A dedicated tenant gets its **own PostgreSQL instance (container)**, with its own volume, credentials, resource limits and backup schedule, not just its own database inside a shared cluster (section 4) |
| Start from an EU VPS from the **first pilot** | The pilot (section 10) runs on the real target stack in the EU; there is no interim Vercel/Neon pilot |
| "Handle everything now (TPS, SSL, firewall, etc.)" | I read "TPS" as **TLS**. Sections 3 (TLS, firewall, hardening) and 10 (capacity targets, which also cover transactions per second) address both readings |
| Everything documented and in the plan | Sections 3–11 and the appendices; runbooks are listed in Appendix D and are written during implementation |

### 0.1 Second-round decisions (2026-10-13) and their consequences

| Decision | Consequence recorded in this plan |
| --- | --- |
| **Contabo Cloud VPS 4** as the first (and only) server | One production server; sizing, provider features and limits in 2.4; provider-specific checks added to the pilot (P16) |
| **Coolify runs on the production server** | The control plane and production share one failure domain and one attack surface; compensating controls in 3.4, 5.4 and 6.3; no "test the Coolify upgrade on a second server first" step |
| **The operator is Frederico; no deputy** | Single point of human failure; mitigations and honest limits on what can be promised to customers in 6.3 (no uptime SLA, no 24/7 response) |

The earlier "server A / server B" design is therefore collapsed into one server. Staging becomes a stopped-by-default
Coolify environment on the same host (2.3), monitoring is external, and restore tests run in a scratch container with
quarterly full drills on a temporary second VPS.

### 0.2 Decision log: Vercel + Neon re-evaluated and not chosen (2026-10-13)

This historical decision log is not a current deployment recommendation.
Vercel is only a last-resort fallback: first assess remediation within the VPS
and self-hosted operating model. Reconsider Vercel only if that model cannot
meet an essential security, availability, or operational requirement and the
operator explicitly approves a scope change. The historical comparison below
contains estimates and provider observations from 2026-10-13, not verified
current prices or configurations.

| Point | Finding |
| --- | --- |
| Vendor sprawl | About equal in both options (about 6 vendors each): object storage is needed either way because the app writes uploads and exports to S3-compatible storage and Vercel has no persistent disk |
| "Object storage in one place" | Files and backups are both at **Scaleway (Paris)**, as two projects with separate keys. Contabo's own object storage could not be found in its current product menu, so it is not assumed to exist **[verify]** |
| Cost | Self-hosted roughly €8–15 per month; Vercel Pro ($20, includes $20 credit and one deploying seat) plus an always-on 0.25-unit Neon compute (about $19) plus storage is roughly $40–45; gap about $30 per month. A dedicated customer database is an extra Neon project (100 projects on Launch) versus RAM on the server |
| Operations | Self-hosting adds permanent duties (patching, firewall, backups and restores, Coolify updates, monitoring) for a single operator with no deputy; the managed stack carries most of these. This is the main argument **for** the managed option and the reason section 6.3 limits what can be promised to customers |
| Jurisdiction | Contabo, Scaleway and Hetzner are European companies; Vercel and Neon are US companies (data location can still be the EU). A data-location observation, not a compliance claim |

Scale assumption (operator): customers have at most about 10 users each; this is a B2B maintenance tool, not a
high-traffic product. Earlier capacity estimates (assumption-based) give roughly 15–300 database transactions per
second at peak for 100–2,000 users, which one small server handles comfortably.

## 1. Goals, non-goals and success criteria

Goals

1. Run the whole product on infrastructure we control, in the EU, with a fixed and predictable monthly cost.
2. Keep the existing pooled multi-tenant model (shared schema, RLS, restricted runtime role) as the default.
3. Keep the current SaaS customer lifecycle and tenant boundaries reliable on the pooled platform.
4. Make security, recovery and operations first-class: TLS, firewall, hardening, backups with tested restores,
   monitoring, runbooks.

Non-goals for the first release

- Dedicated database instances per customer (explicitly out of current scope).
- Vercel as an active deployment target; it is a last-resort fallback only.
- Customer-controlled databases and customer-hosted application deployments (unchanged from the earlier decision).
- Multi-region or automatic failover (a single production server is accepted, with a measured recovery time; see 5.4).
- Automatic migration of existing tenant data from pooled to dedicated.
- Replacing Resend, the object-storage client, or Better Auth.

Success criteria for the platform (all measured in section 10): only the intended ports are reachable from the
internet; TLS grade A; the database is never reachable from outside; a restore from backup works and its duration is
measured; a clean rebuild of production from documentation works; the existing e2e suite passes against the
containerised stack; capacity targets are met.

## 2. Target architecture

### 2.1 Topology (day one)

```
                    Internet
                       │  80/443 (+ SSH only from the VPN / admin IP)
              ┌────────▼─────────┐        ┌──────────────────────────────┐
              │ Contabo firewall  │        │ S3-compatible object storage │  (EU, DIFFERENT provider/account)
              └────────┬─────────┘        │  • app files (private)        │
                       │                   │  • backups (write-only keys)  │
 ┌─────────────────────▼───────────────────┐  └───────────────▲──────────────┘
 │ ONE SERVER: Contabo Cloud VPS 4 (EU)      │                    │ backups, files
 │  host firewall (default deny) + VPN       │ ───────────────────┘
 │  Coolify (dashboard reachable only over VPN)
 │  Coolify proxy (Traefik): TLS, HSTS       │
 │   └► app container (Next.js, 1 replica)    │
 │        ├► pg-shared  (control plane + pooled tenants, RLS)
 │        └► pg-t-<id> … (one Postgres instance per dedicated customer)
 │  staging environment: stopped by default   │
 └───────────────────────────────────────────┘
        External uptime probe ◄── independent of the server
```

- **Everything runs on one server**, including Coolify. This is accepted for the pilot and early customers, with its
  consequences stated openly:
  - Coolify holds SSH access and every secret on the same host that holds customer data; a compromise of the panel
    is a compromise of production (3.4 mitigations: VPN-only dashboard, no registration, 2FA, scoped tokens).
  - Server loss takes the control plane **and** the workloads together; recovery means rebuilding the host, then Coolify
    (instance backup + `APP_KEY`), then the data (5.4). Running containers keep serving if only the Coolify *dashboard*
    is down.
  - A Coolify or OS upgrade cannot be rehearsed on a second server first. Compensation: take the provider snapshot
    and an instance backup immediately before, upgrade in a maintenance window, and do not adopt a Coolify release
    for several days after publication (watch the advisories first).
- A **second, separate server** (control/staging/monitoring) remains the recommended next step once there is a paying
  customer or a second developer; the plan is written so that adding it later changes placement, not design.
- Object storage (files and backups) lives at a **different provider and account** from the VPS (decision D11), so one
  account lock, billing problem or compromise cannot remove data and its backups together.

### 2.2 Request path

1. DNS (A/AAAA, CAA) → the server's public IP.
2. Contabo firewall → host firewall → Coolify proxy (Traefik by default) terminates TLS and redirects HTTP to HTTPS.
3. App container (single replica initially) reads the session and membership from `pg-shared`, resolves the tenant's
   database, and queries `pg-shared` (pooled) or `pg-t-<id>` (dedicated) over the internal Docker network with TLS.
4. Files go to the object store; email through the configured provider.

### 2.3 Environments

| Environment | Where | Data | Purpose |
| --- | --- | --- | --- |
| production | the Contabo server | real | customers |
| staging | a separate Coolify environment on the same server, **stopped by default**, CPU/memory-limited, own database instance | synthetic only | release rehearsal, e2e against the container image; started on demand, stopped afterwards |
| CI | GitHub Actions (ephemeral containers) | synthetic | unit, RLS, e2e on every PR |
| local | developer machine (`docker-compose.yml`) | synthetic | development |

Staging on the production host shares CPU, disk and kernel with production, so it is a convenience, not isolation:
resource limits are mandatory, it is stopped when not in use, and the pilot (P12) measures its impact. No production
data in staging; staging secrets differ and are never reused. **Real customer data never leaves the server for CI or
GitHub-hosted runners**, which are US-operated.

### 2.4 Provider: Contabo Cloud VPS 4 (decision D1, taken)

Facts taken from Contabo's public pages on 2026-10-13 (prices and terms change; re-check at order time):

| Item | Finding |
| --- | --- |
| Plan | Cloud VPS 4: **4 vCPU, 8 GB RAM, 100 GB SSD**, 1 snapshot, 200 Mbit/s port, unlimited traffic under a fair-use policy that allows throttling of exceptionally high or disruptive usage |
| Price | shown as about **€5.50 per month** (including VAT) on a **24-month** term; **minimum following contract length equals the initial contract length**, so a short pilot should use the **1-month** term even though it costs more per month **[verify price at checkout]** |
| Security features | free firewall and always-on DDoS protection with every Cloud VPS, configured in the Customer Control Panel; Contabo states its protection filters about 99 % of attack patterns and that a small share cannot be mitigated; dedicated IPv4 and IPv6 |
| Backups | one snapshot included; **Auto Backup** is a paid add-on **[verify price and retention]** |
| Networking | layer-2 private networking between Cloud VPSs is available (useful later for a second server); API, CLI, cloud-init and custom images exist |
| Support scope | Contabo supports the VPS itself (network, hardware, initial setup of 1-click add-ons); maintaining and upgrading software, including a pre-installed Coolify image, is the customer's responsibility. **Install Coolify from its official installer on a clean OS image rather than using a pre-built app image**, so the version and configuration are known |
| Company/location | Contabo GmbH, Munich, Germany; an **EU region** is selectable at order time; the exact datacentre city and whether Portugal/France locations exist are **[verify at checkout]** |
| Not verified | exact firewall rule capabilities (stateful/IPv6, limits), snapshot restore speed, whether volumes are encrypted at rest, CPU steal and disk IOPS under sustained load (the last two are measured by P16) |

Other providers chosen on 2026-10-13:

| Need | Choice | Evidence and caveats |
| --- | --- | --- |
| Domain registrar and DNS | **Squarespace Domains** (the existing domain, formerly Google Domains; Squarespace took over those domains, it is **not** PlanetScale, which is a database company) | Squarespace's DNS documentation lists CAA among the supported record types and advertises DNSSEC; whether it has a DNS API (needed only for wildcard DNS-01 certificates) is **[verify]**, and HTTP-01 certificates do not need one. Secure the account: 2FA, registrar/transfer lock |
| Object storage | **Scaleway Object Storage, Paris** (French company) | Standard Multi-AZ about **€0.016 per GB per month**, requests and ingress included, 75 GB egress free per month; S3-compatible API with **versioning and Object Lock** (Governance/Compliance retention); IAM permission sets include `ObjectStorageObjectsWrite` separate from `ObjectStorageObjectsDelete`, which allows a write-only key. For example 50 GB costs about €0.80 per month (calculation from the published rate, before tax) |
| VPN | **WireGuard** on the server | free and open source; needs one UDP port reachable from the internet (see 3.1) |

Procurement log (2026-10-13, phase A):

| Observation | Consequence |
| --- | --- |
| The delivered server matches the plan: Ubuntu 24.04.5 LTS, 4 vCPU (AMD EPYC), 7.8 GB RAM, 100 GB disk, time synchronised, SSH host key consistent between two connections | Plan sizing holds |
| The image was **not clean**: it shipped with **Dokploy v0.30.8** in Docker Swarm (UI on port 3000, Traefik on 80/443, Swarm ports 2377/7946 listening on all interfaces), `cloud-init` reporting an error, `PermitRootLogin yes`, `PasswordAuthentication yes`, firewall inactive | The one-click application image was selected at order time instead of a plain OS image. A first-run admin panel was **reachable from the internet** |
| Immediate action taken: the Dokploy UI service was scaled to 0 (reversible with `docker service scale dokploy=1`); nothing else was modified; access logs showed no logins other than the operator's | Port 3000 closed; remaining exposure: Swarm ports until reinstall |
| Credentials were pasted into the chat during setup | Treated as compromised: rotate or replace with key-only access (reinstall with an SSH key; disable password and root password logins) |

Decision: **reinstall the VPS from the plain Ubuntu 24.04 image (no application image) with the operator's SSH public key**
before any further configuration; this also removes Dokploy, Swarm, and the password. Lesson recorded for the
provisioning runbook: verify the image type and that no application is pre-installed before first use, and never
put credentials in chat or tickets.

Sizing against the plan (RAM is the binding constraint; figures to be confirmed by the pilot):

| Consumer | Memory (approx.) |
| --- | --- |
| OS, Docker, Traefik proxy | 0.5–1 GB |
| Coolify (its own database, Redis, realtime) | ~1–2 GB **[verify against Coolify's stated minimum requirements]** |
| Application (Next.js, 1 replica) | 0.5–1 GB |
| `pg-shared` | 1–2 GB |
| Each dedicated Postgres instance | 0.5–1 GB (limit) |
| Staging (when running) | ~1.5 GB |

That leaves room for roughly **2–3 dedicated instances** next to production on 8 GB, fewer if staging is running.
Upgrade path in order: a larger Cloud VPS plan (12/24 GB RAM tiers exist **[verify upgrade/resize rules]**), then a
**second VPS dedicated to databases** connected over Contabo private networking with TLS. Plan the first customer
with a dedicated instance together with a capacity review (4.6).

Provider caveats for a business workload (to be checked by the pilot, not assumed): low-priced shared VPS plans can
show variable CPU steal and disk latency; the 200 Mbit/s port is ample for this app but is a shared-fair-use
allowance; there is one snapshot slot. These are why P16 measures steal time, fsync latency and network throughput
before any customer data is placed on the server.

### 2.5 Control-plane evaluation: Coolify versus Dokploy (2026-10-13)

Prompted by the server arriving with Dokploy pre-installed. Method: each project's published GitHub security
advisories (API, 2026-10-13) tested against its **latest release**, plus its documentation; no code review.

| Criterion | Coolify | Dokploy |
| --- | --- | --- |
| Project age / popularity | created 2021-01; ~62.9k stars | created 2024-04; ~37.8k stars |
| Latest release | v4.4.6 (2026-10-09) | v0.30.8 (2026-09-29) |
| Published advisories | **210** (63 critical, 78 high, 45 medium, 24 low); 102 published in July 2026 | **180** (102 critical, 51 high, 24 medium, 3 low); 126 published in July 2026, mostly on 2026-07-21 |
| Advisory metadata | 198 of 210 list a patched version | only **30 of 180** list a patched version, so fixes are harder to verify from the advisory alone |
| Affected-range check against the latest release | 207 ranges exclude v4.4.6; 3 are one January 2025 issue filed three times with an open-ended range (almost certainly fixed, not provable from metadata) | 159 ranges exclude v0.30.8; 15 unparseable but with upper bounds of 0.29.x or lower; **6 carry placeholder ranges ("<= 99.99.99", "<= 2.5.0")**, two distinct command-injection issues each filed three times, whose fix status cannot be determined from the advisory |
| Architecture | plain Docker, Traefik or Caddy proxy | **Docker Swarm** (single-node), Traefik; Swarm ports 2377/7946 listen on all interfaces unless firewalled |
| Database instances | Postgres/MySQL/etc. resources with **CPU/memory limits** and **database SSL (CA-signed certificate)** (docs) | Postgres/MySQL/etc. resources with memory/CPU limits and `externalPort` in its API; database TLS support **[not found in the docs fetched]** |
| Backups | scheduled `pg_dump` (custom format), local and S3 retention, **Coolify's own instance backup** and a documented `APP_KEY` procedure | scheduled backups to S3 destinations with a Test button; volume backups; restore docs; backup of Dokploy's own state **[not found in the docs fetched]** |
| API tokens | team-scoped, permissions `read`, `read:sensitive`, `write`, `deploy`, expiry, **optional source-IP allow-list** | organisation-scoped key with an "access to API/CLI" permission and optional expiry; the documented example response includes database passwords in clear; finer scoping and an IP allow-list **[not found]** |
| Hardening guidance | Security-model page; firewall, SSH and patching pages | **detailed Production Hardening Guide** and an automated host check (OS, UFW, SSH, Fail2Ban) for remote servers; says to keep UI port 3000 closed and use a VPN such as Tailscale |
| Zero-downtime deploys | rolling updates for Docker Image applications (not Compose) | native Swarm rolling updates |
| Licence | Apache-2.0 | Apache-2.0 plus a `/proprietary` directory; audit logs, SSO and custom roles are Enterprise features |
| Minimum host | 2 vCPU, 2 GB (Coolify docs) **[verify]** | 2 GB RAM, 30 GB disk |

Reading the evidence: **both projects have a poor 2026 advisory record, concentrated in a mid-2026 disclosure wave,
and both are privileged control planes, so the same mitigations apply to either** (VPN-only dashboard, no
registration, 2FA, short-lived scoped tokens, delayed adoption of releases). Coolify's advantages here are maturity,
better advisory hygiene (fixed versions recorded), granular IP-restricted API tokens (important for the operator
provisioning tool), documented database TLS and instance backup/restore, and plain Docker instead of Swarm.
Dokploy's advantages are native rolling updates and a more explicit hardening guide.

**Recommendation: keep Coolify (decision D15).** Independently of this choice the server is reinstalled from a plain
Ubuntu 24.04 image: the delivered vendor image carries Dokploy and Swarm, reports a `cloud-init` error, and is not a
known-good baseline. If Dokploy were chosen, it would be installed on that clean image with the official installer
(pinned version), not kept from the vendor image.

## 3. Security baseline

### 3.1 Network and firewall

Two layers, both default-deny: the **Contabo firewall** from the Customer Control Panel (free with the plan, applies before traffic reaches the host; exact rule capabilities **[verify]**) and the **host
firewall** (nftables/ufw). IPv6 gets the same rules as IPv4.

| Port | Exposure | Notes |
| --- | --- | --- |
| 80/tcp | world | HTTP-01 certificate challenge and redirect to HTTPS only |
| 443/tcp | world | application |
| 51820/udp (WireGuard; any free UDP port) | world | answers only to peers with a valid key; no response to anything else; the only way to reach 22 and the Coolify ports |
| 22/tcp | **VPN / admin IP only** | key-only SSH; Coolify manages its own host over SSH from the same machine |
| 8000, 6001, 6002/tcp | **VPN only; never world** | Coolify dashboard, realtime and web terminal ports **[verify exact ports in the firewall page table, which did not render in the fetched page]** |
| 5432 and every database port | **never published** | databases are reachable only on the Docker network; verified by an external port scan |
| everything else | closed | |

- **Docker and host firewalls:** Docker publishes container ports through its own iptables rules, which can bypass
  `ufw`. The rule is therefore: the provider firewall is authoritative (and the host firewall covers what the provider rules cannot express); no container publishes a port except the
  proxy's 80/443; and the pilot includes an external scan to prove it (P2).
- **Administrative access path:** a VPN (WireGuard/Tailscale) between the operator's machine and the server. Keep an out-of-band recovery path in case the VPN or SSH is misconfigured: Contabo's control panel console **[verify availability]**, and never lock the firewall without testing a second session first.
  Coolify's dashboard is reachable only over the VPN. This closes the main exposure given Coolify's advisory history
  (3.4).
- **Egress:** default allow, with logging; restrict later if a requirement appears.
- Coolify's own guidance applies: open only the ports the proxy and the instance need; restrict SSH in the provider
  and host firewalls.

### 3.2 TLS and certificates

| Layer | Plan |
| --- | --- |
| Public HTTPS | Let's Encrypt through Coolify's Traefik proxy (HTTP-01 on port 80); DNS-01 only if wildcard certificates are needed for per-customer subdomains (Coolify supports both: TLS Certificates, DNS Challenge pages). TLS 1.2 minimum, 1.3 preferred, modern cipher list. |
| HSTS | `Strict-Transport-Security` is **already set** in `next.config.mjs` (line 44); also set it on the proxy so non-app responses (errors, redirects) carry it. Add to the HSTS preload list only after the domain is stable. |
| DNS and CAA records | at Squarespace Domains: A and AAAA for the application, a CAA record restricting issuance to the chosen CA (Let's Encrypt); the dashboard hostname resolves only inside the VPN or is not published at all; enable DNSSEC if the registrar supports it for this domain **[verify]** |
| Certificate monitoring | alert at 21 days to expiry and on renewal failure |
| App → database | PostgreSQL TLS enabled (Coolify can generate a server certificate signed by the server CA; mount the CA into the app container read-only). Use `sslmode=verify-full`. Regenerating the CA requires restarting databases and re-trusting clients, so it is a runbook item, not routine. |
| SSH | ED25519 keys, no password logins |
| Target | SSL Labs grade A (public endpoint), no TLS 1.0/1.1 (verified in P3) |

### 3.3 Host hardening checklist

- OS: a supported LTS release (Ubuntu LTS or Debian stable); only needed packages; minimal services.
- SSH: key-only; `PermitRootLogin prohibit-password`; `AllowUsers`; non-default port optional; fail2ban or CrowdSec.
- **Coolify's non-root mode is experimental and still needs passwordless `sudo` for everything** (non-root-user
  page), which is equivalent to root. It adds little real protection, so use the supported root-with-key default and
  rely on SSH restriction (firewall + VPN) instead. Revisit when Coolify marks non-root as supported.
- Patching: `unattended-upgrades` for security updates; Coolify only *notifies* weekly about available packages and
  does not install them (server-patching page), so patching stays an explicit operator duty with a monthly window and a
  documented reboot procedure; kernel/Docker updates follow a backup first.
- Docker: log rotation, `no-new-privileges`, no `docker.sock` mounted into the application container, containers run
  as non-root, drop unneeded capabilities, memory/CPU limits on every container.
- Clock sync, swap policy, disk-full protection (separate volume for database data where available; alerts at 70/85 %).
- At-rest encryption: provider volume encryption **[verify per provider]**; otherwise rely on encrypted backups and
  on the trust model of the provider's hardware access. State the residual risk in the privacy documentation.
- Provider account: hardware-key 2FA, separate billing/admin roles, audit logging enabled, break-glass access
  documented.

### 3.4 Coolify hardening (control plane)

From Coolify's security-model and related pages:

- Coolify "stores credentials and connects to servers over SSH"; an attacker with enough administrative access can
  use the same paths. Treat it like root access to every managed server.
- Keep **Registration Allowed disabled**; enable **2FA for every account**; lowest roles.
- API: leave **API access disabled** except for the operator tooling that needs it (provisioning, section 4.5); when
  enabled, restrict **Allowed API IPs**, use one token per integration, minimal permissions (`read`, `read:sensitive`,
  `write`, `deploy`), and short expiry (7–90 days). `read:sensitive` can read passwords and private keys, so it is
  used only by the provisioning tool, only from the operator environment.
- Back up the instance daily to storage **off the server**; save the `APP_KEY` (`/data/coolify/source/.env`) in the
  password manager: the backup does not include it and a restored instance cannot decrypt secrets without it.
- Update policy (single server, no second host to rehearse on): take the Contabo snapshot and a Coolify instance backup right before an upgrade, upgrade in a maintenance window, wait several days after a release and read the advisories first, and subscribe to the project's GitHub security advisories. As of the
  fetch on 2026-10-12 that page lists multiple **High/Critical** advisories published in June–July 2026 (for
  example root-level command injection paths and API tokens without expiry). Patch status of each is **[verify]**;
  the consequence for this plan is the VPN-only dashboard, no public registration, scoped tokens and prompt updates.
- **Coolify shares the host with production (decision of 2026-10-13).** Compensating controls: the dashboard is reachable only over the VPN and is stopped when not in use if the pilot shows that is workable **[verify Coolify supports stopping its UI without affecting running resources]**; the Coolify API is disabled except during provisioning windows; its token is short-lived and IP-restricted; a periodic review of Coolify's SSH keys and of the containers it created.
- Dashboard availability is not on the application's critical path: running containers keep serving if Coolify is
  down. A Coolify outage blocks deployments and operator provisioning, not customers.

### 3.5 Secrets inventory and handling

| Secret | Held in | Notes |
| --- | --- | --- |
| Application secrets (`BETTER_AUTH_SECRET`, email key, S3 keys, DB credentials) | Coolify environment variables (encrypted at rest with Coolify's `APP_KEY`) | never in the image or the repository |
| Tenant credential key ring `TENANT_CREDENTIAL_KEYS` | Coolify env of the app; offline escrow copy | separate from `BETTER_AUTH_SECRET` |
| Tenant runtime database passwords | control-plane column, AES-256-GCM envelope (as in the assessment, section 5.4) | decrypted in memory only |
| Tenant owner/migrator passwords | **fetched on demand** from Coolify (needs `read:sensitive`) by the operator tool, never stored by us | |
| Coolify API token (operator) | operator machine / protected CI environment, IP-restricted, expiring | **never** in the app runtime |
| Container registry token | Coolify and the CI environment | read-only for deploys |
| Backup storage keys | write-only/append-only for the servers; a separate read key held by the operator and the restore-test job | a compromised server cannot delete or read old backups |
| `APP_KEY` of Coolify, root passwords, recovery codes | password manager + offline copy | tested as part of the DR drill |

Rotation calendar: API tokens ≤ 90 days; tenant runtime credentials on demand and yearly; `BETTER_AUTH_SECRET` only
with a planned session invalidation; backup keys yearly; every secret rotates after any suspected exposure. Note: the
`neondb_owner` credential in `.env` appeared in a prior session; it must be rotated or the Neon project deleted as
part of the cutover (section 9).

### 3.6 Supply chain and CI

- Build in GitHub Actions, push a private image (GHCR or an EU registry) tagged with the commit and pinned by digest;
  Coolify deploys the **image**, not a build on the production server (smaller attack surface, reproducible, and
  Coolify's rolling updates are supported for Docker Image applications, not for Compose applications; see 6.2).
- Keep the existing `security.yml` (dependency/security checks) and add image scanning; base image pinned by digest
  (as `docker-compose.yml` already does for Postgres).
- Branch protection and required checks on the deploy branch; deploy tokens minimal (`deploy` permission only).

### 3.7 Abuse, rate limiting and DDoS

- Application rate limiting already exists (`src/lib/rate-limit.ts`, Better Auth rules on sign-in/sign-up/reset).
  Add proxy-level limits on auth endpoints (Traefik middleware) as defence in depth.
- Volumetric DDoS protection is a provider feature **[verify per provider]**; a CDN/WAF in front (for example
  Cloudflare) is optional and introduces another sub-processor in a non-EU jurisdiction: decision D10, default **no**.
- Request size/time limits at the proxy; the upload pipeline caps are already enforced in the app (5 MB).

### 3.8 Logging, audit and monitoring inputs

- The app already emits structured JSON logs with redaction of URLs and sensitive keys (`src/lib/logger.ts`).
- Collect container logs with rotation; ship to a log store (for example Vector → object storage or Loki) with a
  retention decision (D8, default 90 days for operational logs); keep SSH auth logs; alert on privileged logins.
- Keep application audit events (`organization_audit_event`) as today; add audit events for provisioning, credential
  rotation and database lifecycle (assessment 8.8).

## 4. Database architecture

The dedicated-instance architecture in this section is deferred design, not
part of the current pooled SaaS scope. The shared `pg-shared` model is the
current target; dedicated-instance tables, lifecycle, gates, and implementation
steps must not be treated as approved current work.

### 4.1 Planes and schema

Unchanged from the assessment (Option S): one schema everywhere; control-plane vs data-plane model classification;
a minimal stub `organization` row in each dedicated instance; the logo moves to `StoredFile.purpose`;
`tenant_export` is control-plane; boundary enforcement by test/lint. These remain the right choice because the plan
still has one migration history applied to every database.

### 4.2 Instances

| Instance | Holds | Notes |
| --- | --- | --- |
| `pg-shared` | control plane (auth, organizations, members, settings, audit, exports) and **pooled** tenants' data | PostgreSQL 17 (matches `docker-compose.yml`); RLS retained; always on |
| `pg-t-<shortid>` | one dedicated customer's data-plane tables (+ stub organization) | its own Coolify database resource, volume, credentials, SSL certificate, resource limits and backup schedule |

Why one **instance** per customer (as requested) rather than one database in a shared cluster: stronger blast-radius
and resource isolation, per-customer backup/restore and deletion, per-customer upgrade timing. Cost: more RAM and more
objects to operate (4.6).

PostgreSQL settings (all instances): `password_encryption = scram-sha-256`, `ssl = on`, `listen` on the internal
interface only, `statement_timeout`, `idle_in_transaction_session_timeout`, `log_min_duration_statement`,
`pg_stat_statements` for capacity monitoring; `max_connections` sized to the pool math in 4.4.

### 4.3 Roles

| Role | Purpose | Attributes |
| --- | --- | --- |
| superuser (provided by Coolify) | operator tooling only | never used by the application; password never stored by us |
| `migrator` | applies migrations, owns objects | not superuser |
| `app_runtime` | the application | `NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`, DML only; two slots (`_a`, `_b`) for rotation |

Self-hosting removes a Neon-specific constraint: the Neon owner could not set role attributes, which is why
`scripts/db/provision-runtime-role.ts` avoids them today. On our own Postgres the provisioning tool can set
`NOBYPASSRLS` explicitly and `verify-runtime-role` can assert it. The Vercel/Neon-specific role derivation
(`src/lib/database-url.ts`, `VERCEL_ENV`-named roles, HMAC password from `BETTER_AUTH_SECRET`) is replaced by
explicit environment-provided credentials.

### 4.4 Connection management

The application is now a long-lived Node process (single replica at first), so the serverless fan-out analysis of the
earlier assessment is replaced by simple arithmetic:

- Shared client: pool max 10–20 (explicit options; today it is `pg` defaults with no acquisition timeout).
- Dedicated clients: **promise-cached registry**, pool max 5, `connectionTimeoutMillis` 3 s,
  `idleTimeoutMillis` 30 s, `maxLifetimeSeconds` 600 so credentials/endpoints refresh naturally, LRU cap 50 clients,
  drained (not just dropped) on eviction. The experiment results from the assessment still hold: concurrent first use
  must share one promise (50 requests created 50 clients otherwise); `$disconnect()` releases connections and a client
  reconnects if used again; warm connections survive an `ALTER ROLE` password change, so rotation uses a versioned
  swap between two role slots.
- Per-tenant circuit breaker (5 failures → open 30 s → half-open probe); typed `TenantDatabaseUnavailableError`;
  **no fallback to the shared client under any condition**, enforced by a test that poisons the registry.
- No PgBouncer at first: worst case is shared 20 + dedicated 5 × (active dedicated tenants), far below any
  `max_connections`. Add a pooler only if the pilot's capacity test (P12) or growth requires it.
- Graceful shutdown on SIGTERM (stop accepting requests, drain pools) because rolling updates run old and new
  containers together (6.2).

### 4.5 Provisioning workflow and verification gates

Operator-run tool (extension of `ops:tenant`), never customer-facing, never part of the application runtime.

State machine and routing predicate are exactly those of the assessment (5.1): `REQUESTED → PROVISIONING →
PROVISIONED → MIGRATING → MIGRATED → VERIFYING → VERIFIED → ACTIVE`, with `FAILED(step)` resumable, `DEGRADED`,
`UNAVAILABLE`, `SUSPENDED`, `DECOMMISSIONING`, `DECOMMISSIONED`. A tenant is routed to its dedicated instance only
when `isolationTier = DEDICATED` **and** state `ACTIVE` **and** `verifiedAt` fresh (≤ 24 h) **and** the schema version
satisfies the app minimum; any other state yields a controlled error, never the shared database.

Provisioning step: the tool asks Coolify (API token, operator environment only) to create a PostgreSQL resource on
the server in the chosen destination, with SSL enabled, CPU/memory limits (Coolify database resource-limits page) and a
backup schedule to S3. **[verify in the spike]** that the Coolify API exposes database creation, SSL, limits and
backup schedules as needed; the fallback is generating a Docker Compose resource through the API or a reviewed
host-side script. Coolify's documentation confirms the capabilities exist in the product (database resources, SSL,
limits, scheduled backups), not that each is available through its API.

Gates (all must pass; stored with a report hash; re-run at activation):

| Gate | Check |
| --- | --- |
| G0 | The organization has no data-plane rows in `pg-shared` (v1 does not migrate data) |
| G1 | Instance exists with the intended limits; **no published host port**; reachable **from the app container over the internal network** with `verify-full` TLS |
| G2 | All migrations applied; `_prisma_migrations` identical to the repository; stub organization present |
| G3 | `app_runtime` is not superuser, has `NOBYPASSRLS`, no `CREATEDB`/`CREATEROLE`; migrator and runtime roles distinct (extended `verify-runtime-role`) |
| G4 | RLS enabled and forced on all tenant tables and `tenant_export`; control tables empty except the stub; exactly one organization row |
| G5 | As `app_runtime` in rolled-back transactions: no tenant setting ⇒ no rows and writes rejected; another organization id ⇒ none; same-tenant triggers reject cross-tenant references |
| G6 | Canary through the **real application path**; the shared database's canary counter is unchanged (proves no fallback) |
| **G7 (new)** | **A backup has been taken and restored into a scratch instance, and row counts match**; backup schedule and destination verified |
| **G8 (new)** | Resource limits applied and monitored; alerts registered for the instance (disk, memory, connections, backup age) |

### 4.6 Capacity and when to split servers

- Each Postgres instance has a fixed idle footprint plus `shared_buffers`; with a 512 MB–1 GB limit, ten dedicated
  tenants consume 5–10 GB on top of the application and `pg-shared`. **[measure in P10]**
- The day-one server (Cloud VPS 4, 8 GB) shares memory with Coolify (about 1–2 GB), so it supports roughly **2–3** dedicated instances comfortably (fewer while staging runs; see the sizing table in 2.4); beyond that, move dedicated
  instances to a **database server** (Contabo private networking between two Cloud VPSs, with TLS; Coolify manages multiple servers; a destination is a Docker network on one
  server and does not route between servers, so cross-server access needs private networking plus TLS).
- Review capacity monthly; alert at 70 % memory and 70 % disk.

### 4.7 Migrations

- `prisma migrate deploy` runs as an explicit **pre-deploy job** using the migrator role against `pg-shared` and then
  each `ACTIVE`/`SUSPENDED` dedicated instance (bounded concurrency, per-tenant result, resumable). It is not run
  inside the application container's start command.
- Coolify's rolling updates keep the old and new containers running together (rolling-updates page), so every
  release must be **N/N-1 compatible** (expand → contract). The app must report readiness accurately and shut down
  gracefully.
- A tenant whose schema version is below the app's minimum shows a maintenance state; others are unaffected.

## 5. Backup, recovery and disaster recovery

The layers, schedules, and objectives below are proposed target controls, not
evidence of an active application backup configuration or a successful
application restore. See the [environment status ledger](../reference/environment-status.md)
and current recovery runbooks for verified observations.

### 5.1 Backup layers

| Layer | What | Frequency (proposal) | Notes |
| --- | --- | --- | --- |
| L1 logical dumps | each Postgres instance via Coolify's scheduled backups (`pg_dump` custom format) uploaded to S3 | `pg-shared` and dedicated every 6 h; retention 14 daily + 8 weekly + 6 monthly | Coolify confirms scheduled, engine-aware backups with optional S3 copy; "a backup is not a restore test" |
| L2 point-in-time | WAL archiving (pgBackRest or WAL-G) to object storage | continuous | **Phase 2** (needs a custom image or configuration outside Coolify's UI); lowers RPO to minutes; decision D6 |
| L3 server snapshot | Contabo snapshot (**one slot** on this plan) and, if worth the price, the paid **Auto Backup** add-on **[verify price/retention]** | before every OS/Coolify/Docker upgrade, and weekly if the add-on is bought | same provider and account as the server, so it speeds rebuilds but is **not** an independent backup; not a substitute for L1/L2 |
| L4 Coolify instance backup | Coolify's own database | daily (Coolify default), copied to the off-provider S3 storage | plus the `APP_KEY` escrow; essential now that Coolify shares the host |
| L5 files | object-storage bucket versioning + lifecycle + replication/copy to a second account | continuous | |
| L6 configuration | runbooks and this repository | on change | server setup should be reproducible from docs/IaC |

**Chosen storage (Scaleway, Paris), two separate projects with separate IAM applications and keys:**

| Bucket | Used by | Key permissions | Protection |
| --- | --- | --- | --- |
| `…-files` | the application (uploads, exports) | objects read/write/delete, no bucket administration | private; versioning; lifecycle rule for old versions |
| `…-backups` | Coolify backups, restore tests | **server key: `ObjectStorageObjectsWrite` only** (no delete); a separate **read key** held only by the operator and the restore-test job | **versioning + Object Lock** with a default retention (proposal: Compliance, 14 days) so even a stolen full-access key cannot delete recent backups |

Caveat to test in P7: Coolify prunes old backups by deleting objects; with Object Lock those deletions fail until the
retention expires, so Coolify's retention must be longer than the lock, or old objects must be removed by a bucket
lifecycle rule instead. Also test that Coolify accepts Scaleway's S3 endpoint and region (`fr-par`) and that the
application's `S3_*` settings work with it (path-style vs virtual-host addressing).

Backup storage rules: a separate provider/account from the server (not Contabo's own object storage); keys used by the servers are **write-only** (or
the bucket uses object lock/versioning) so a compromised server cannot delete history; the read key lives only with
the operator and the restore-test job; backups are encrypted (provider SSE at minimum; client-side encryption of dump
files if the provider is not trusted for confidentiality: decision D7).

**Current implementation status (2026-10-28):** Coolify's instance backup ran successfully to local disk and a verified
copy was placed on the FileVault-protected operator Mac; local retention is set to 3 backups / 7 days / 2 GB. No
validated S3 destination is configured in Coolify, so the planned off-provider backup layer is **not implemented**.
The Contabo snapshot is supplemental and remains in the same provider/failure domain. The manual instance backup has
not been restore-tested. It does not back up `pg-shared`, dedicated tenant databases, or Garage files. See
[runbook 03](../operations/coolify-backup-and-upgrade.md) for the procedure and current evidence.

### 5.2 Restore testing

- **Automated weekly (off-peak, resource-limited):** a restore job on the server restores the newest `pg-shared` dump
  (downloaded with the read key) into a scratch container, runs integrity checks (row counts vs manifest, `verify-runtime-role`, RLS assertions) and records the result;
  failure alerts the operator.
- **Per dedicated tenant:** gate G7 at activation; then a monthly rotating sample.
- Restore tests deliberately do **not** run on GitHub-hosted runners, because dumps contain customer data and those
  runners are operated outside the EU; alternatively run them on the operator's own machine.
- **Quarterly DR drill:** rebuild production from nothing on a **temporary second Contabo VPS (1-month term, then
  cancelled)** using only the runbooks, restore the data
  and measure the elapsed time; record it as the real RTO.
- A backup that has never been restored is shown as **untested** in the operations checklist.

### 5.3 Objectives (proposals, decision D5)

| | Phase 1 (dumps) | Phase 2 (WAL archiving) |
| --- | --- | --- |
| RPO | ≤ 6 h | ≤ 15 min |
| RTO (single server loss) | ≤ 8 h until measured (single operator; P1 and the drill replace this with the real figure) | ≤ 4 h |

### 5.4 Failure scenarios

| Scenario | Behaviour / response |
| --- | --- |
| App container crash | Docker/Coolify restarts it; health check gates traffic |
| Database container OOM or crash | restart; alert; tenant-only impact for a dedicated instance; typed error, no fallback |
| Disk full | alert at 70/85 %; runbook: expand volume, vacuum, prune; Postgres protected by a separate volume |
| **Server lost (includes Coolify)** | provision a replacement VPS, harden it (Appendix B), install Coolify, restore its instance backup with the saved `APP_KEY` (or recreate resources from documentation), restore L1/L2 data from object storage, redeploy the image, repoint DNS; measured RTO |
| Region/provider outage | same as above at another provider/region using offsite backups; documented, slower |
| Coolify down (dashboard or its containers) | running application and database containers are unaffected; deployments and provisioning wait; restore Coolify from L4 + `APP_KEY` |
| Coolify or SSH key compromise | treat as full compromise: rotate every secret and key, rebuild servers from clean images, restore data from backups taken **before** the compromise window |
| Accidental deletion of a tenant instance | restore from the latest dump into a new instance, re-run gates, rotate credentials |
| Backup storage lost/locked | the second copy (L5/L6, another account) and the next scheduled dump; alert on backup age |

## 6. Operations

### 6.1 Monitoring and alerts

Probe from outside (an **external** uptime service, independent of the server, since there is no second host): HTTPS availability, certificate expiry, `/api/health`; from inside:
host CPU/memory/disk/IO, container restarts, Postgres connections, replication none, long-running queries, backup
age and success per instance, restore-test result, queue of pending patches, Coolify notifications (backups, deploys,
server patching, server unreachable). Channels: email plus one chat channel; every alert has an owner and a runbook.
A readiness endpoint separate from liveness: the current `/api/health` also fails when email configuration or the
pilot-bootstrap setting is incomplete (`src/app/api/health/route.ts`), which is correct for readiness but wrong as a
container liveness probe; split them.

### 6.2 Deployments

- Application type in Coolify: **Docker Image** (rolling updates supported; they are *not* supported for Docker Compose
  applications). Health check gates the switch; old and new run together briefly.
- Pipeline: PR → tests (existing `tests.yml`) → build image → scan → push → staging deploy → e2e against staging →
  manual approval → production deploy of the same image digest → migrations job before the switch.
- Rollback: Coolify rollbacks (rollbacks page) plus the N/N-1 migration rule, so a rollback never meets an
  incompatible schema.

**Implementation status:** `tests.yml` builds the pinned, non-root production Docker image only after its unit and
browser jobs pass. Pull requests build and scan without publishing; pushes to `main` or `develop` scan first, then
publish a commit-tagged image to GHCR and expose its digest for a later promotion step. High and critical Trivy
findings fail the image job. The GHCR package is private. The post-merge image is
`ghcr.io/fredppro/maintenance-app-poc:164e55e4508afaa1c2995a297788f1994fcef69c`, digest
`sha256:879e75e3f49d3edd751aa937690e6f87f9393776d3a417f208c75c33f21b27a8`.

Staging preparation added a non-root `migrator` Docker target and entrypoint that applies committed Prisma
migrations, provisions the restricted runtime role, and verifies that role. The workflow now builds, scans, and
publishes a separate `-migrator` image and digest alongside the app image. The migrator target built locally and
successfully applied all 18 migrations to a disposable PostgreSQL 17 database; runtime-role verification passed.
The change merged to `develop` as `880e715`. Its lint, typecheck, unit, browser, and security jobs passed, but image
publishing was blocked because Trivy found high-severity findings in the migrator image. The app image built and
scanned successfully; neither image was published because the combined image job failed.

The current remediation prunes development dependencies and removes the base image's npm/Corepack tooling from the
migrator, moves Prisma CLI to production dependencies for that image, and pins patched `deepmerge-ts`, `fast-uri`,
`mysql2`, `source-map-js`, and `undici` versions. Local AMD64 migrator and ARM64 app-runner builds pass; both images
scan with no high or critical findings. The migrator again applied all 18 migrations and verified the restricted
runtime role. Local lint, typecheck, production build, and coverage tests pass. The full dependency scan's only
remaining advisory is unpatched `braces@3.0.3`, a development-only dependency excluded from the migrator image.
These remediation changes were committed to `develop` as `8bcc2fc`; image publication is gated on the CI tests and scans for that commit.

Coolify 4.4.6 was installed on the Contabo host from the official installer, with automatic Coolify updates disabled.
After an earlier local copy of its generated `.env` was exposed, Coolify's control-plane state and secrets were
reset and the installer was rerun on 2026-10-14. Docker Engine 29.9.0 uses the `172.30.0.0/16` address pool (size
24), avoiding overlap with WireGuard's `10.242.0.0/24`. The Coolify, PostgreSQL, and Redis containers are healthy.
The dashboard responds over the VPN at `http://10.242.0.1:8000`; public IPv4/IPv6 probes from the operator's Mac
did not connect to ports 8000, 6001, or 6002. Docker publishes those ports on all host interfaces, so the provider
firewall remains a required control and the external scan in P2 is still a gate.

On 2026-10-28, Coolify's update check reported no newer version available, and the PHP CLI in the running `coolify`
container reported PHP 8.4.27. No manual upgrade was performed. See [runbook 03](../operations/coolify-backup-and-upgrade.md)
for the pre-upgrade backup and verification procedure.

The fresh Coolify `localhost` server is reachable and usable after restoring the narrow UFW SSH allow rule from
`172.30.1.0/24` on `br-9eb9aafa0153` to `172.30.0.1:22`. The first administrator has been recreated over WireGuard and `/register` redirects to `/login`; the account's 2FA
is enabled, as confirmed in the Coolify profile on 2026-10-15. The new `/data/coolify/source/.env` is restricted to
root (`0600`). The operator confirms an encrypted off-host backup is complete; the destination is not recorded,
and the local plaintext copy has been removed. GHCR is configured on the host and an authenticated manifest request
for the pinned image digest succeeded on 2026-10-15; token scopes and expiry remain unverified. The Maintenance App
Staging project now contains the staging database, private Garage service, migrator, and app. The one-shot migrator
completed successfully and its container is stopped with Docker restart disabled; its `MIGRATION_DATABASE_URL`
remains configured in the Coolify resource and should be removed after migration or supplied only for future
migration runs. The app is deployed from the pinned digest below and Coolify reports it running without a container
healthcheck. Its public HTTPS `/api/health` endpoint returned `{"status":"ok"}` on 2026-10-15. This verifies the
application readiness endpoint, but email delivery, the owner account flow, and authenticated Garage
upload/download still needed end-to-end testing. The 2026-10-15 plan therefore did not authorize production
promotion until those tests and the remaining controls were complete. The operator later reported production
deployed on 2026-10-29; that report does not verify that those prerequisites or pilot gates passed. Treat production
readiness as unverified until the [environment status ledger](../reference/environment-status.md) records independent
evidence.

Staging choices confirmed on 2026-10-15: use `staging.maintenance.isosist.com` through Cloudflare; use the
existing Resend integration and the same initial owner address as the Coolify administrator; and use a private,
persistent Garage `v2.4.1` single-node service on this VPS for synthetic staging files only. Garage single-node
mode has no data redundancy ([Garage quick start](https://garagehq.deuxfleurs.fr/documentation/quick-start/)); it
does not replace the planned Scaleway production object storage or backup destination. Public Contabo information
did not confirm an included S3 tier, and the [MinIO server repository is archived](https://github.com/minio/minio),
so Garage is the staging alternative. On 2026-10-15, Cloudflare DNS was changed to DNS-only; public DNS now resolves
the hostname directly to VPS IPv4 `169.58.161.222` and IPv6 `2a02:c207:2366:431::1`. The Resend key and verified
sender are configured in Coolify, but delivery has not been tested. The deployed app image is
`ghcr.io/fredppro/maintenance-app-poc@sha256:2dcd1cce50060f25d6a820e914bb5e48a8db5d58a0e9f603a265802cb4a2601c`.
The VPS had approximately 6.7 GiB memory available and 89 GiB disk free before deployment; recheck before
increasing staging load.

### 6.3 Maintenance and people

Monthly: patch window, Coolify update (snapshot + instance backup first, see 3.4), capacity review, backup/restore
review, secret rotation check. Quarterly: DR drill, firewall/port scan, access review.

**Single operator, no deputy (decision of 2026-10-13).** The operator is a single point of failure for response time
and for knowledge. What this means and how it is limited:

- **No 24/7 promise.** Do not offer an uptime SLA or a response-time commitment to customers until a deputy exists;
  publish support hours and an incident-communication channel instead. Alerts will wake only one person.
- **Runbooks are the deputy.** Appendix D is written so that a competent engineer could rebuild and restore from
  scratch; keep them current and test them in the quarterly drill.
- **Break-glass access:** an emergency-access arrangement in the password manager (or a sealed copy of the recovery
  material held by one trusted person) so that the company can recover if the operator is unavailable; includes the
  Contabo account, DNS registrar, object-storage account, Coolify `APP_KEY`, root/recovery codes.
- **Alert fatigue control:** few alerts, each actionable, each with a runbook; an external probe that notifies by two
  channels.
- Revisit as soon as there is a paying customer with availability expectations: add a deputy and a second server.

### 6.4 Lifecycle for dedicated tenants (deferred; out of current scope)

| Event | Procedure |
| --- | --- |
| Suspend (policy) | `tenant_settings.status = SUSPENDED` blocks requests before any database resolution; the instance stays up |
| Suspend (infrastructure) | operator-only `SUSPENDED` state; instance stopped; backups continue to exist |
| Export | data from the routed client, control data from `pg-shared`; export state is control-plane |
| Delete | `PENDING_DELETION` stops routing; at the scheduled time: final logical dump to restricted storage (retention D5), delete storage objects, delete the Coolify instance **and its volume and backups per policy**, then control rows; the `tenant_database` row is removed last so an interrupted run can resume |
| Prolonged outage of one instance | `DEGRADED` after 3 min, `UNAVAILABLE` after 15; tenant-only 503 with `Retry-After`; restore from the latest dump/PITR into a new instance, new credential version, re-run gates G1–G8 |

## 7. Original repository changes proposed (historical snapshot)

This table records work proposed against the code at branch point `889df26`.
It is not a current repository status report; some listed changes have since
been implemented or superseded. Current application work is tracked in the
[security and product readiness plan](security-and-product-readiness-plan.md).

| Area | Change |
| --- | --- |
| Container image | add `Dockerfile` and `.dockerignore`; set `output: "standalone"` in `next.config.mjs` (not set today); non-root user; pinned base; build in CI |
| Vercel coupling | `vercel-build` script, `VERCEL`-dependent logic in `src/lib/database-url.ts`, `signup-policy.ts` and `email-verification.ts` (production-flag guards keyed on `VERCEL_ENV`), README Vercel/Neon section: replace with an explicit `APP_ENV`-style contract and docs |
| Database URL and roles | replace derived roles with explicit credentials; generalise `scripts/db/provision-runtime-role.ts` and `verify-runtime-role.ts` for any Postgres |
| Health | split liveness and readiness; readiness also checks the shared database and (for tenant requests) the routed one |
| Shutdown | SIGTERM handler draining pools (instrumentation hook) |
| Migrations | a standalone `migrate` command/job image entrypoint; N/N-1 check in CI |
| Scheduled jobs | `ops:retention`, `ops:purge-trash`, `ops:tenant purge-due` and backups move from GitHub Actions (`maintenance-jobs.yml`, `backup.yml`; they need a publicly reachable owner URL) to Coolify scheduled tasks or host timers on the server; workflows are kept only for tests/security |
| Object storage | S3 settings already supported (`S3_*`); choose an EU provider; bucket private; lifecycle/versioning |
| Email | currently Resend; decide whether to keep it or move to an EU SMTP provider (D9); update the sub-processor list |
| Docs | update `docs/security-privacy/gdpr-readiness.md`, `privacy-data-map.md`, `incident-response.md`, `tenant-isolation.md`, `tenant-lifecycle-and-recovery.md`, `README.md`; remove Vercel/Neon from the sub-processor list, add Contabo (hosting), Scaleway (object storage), Squarespace (domain/DNS), the email provider and the monitoring service (readiness documentation, not a compliance claim) |
| Dedicated-database feature | as in the assessment (sections 3–5), with the adaptations in section 4 here |

## 8. Dedicated-database implementation notes (deferred; out of current scope)

| Topic | Assessment (Vercel/Neon) | This plan |
| --- | --- | --- |
| Provisioning target | Neon API, one project per tenant | Coolify database resource (instance) on the DB host |
| Secrets | Vercel key ring; Neon API key in a protected CI env | Coolify env for the key ring; Coolify API token only on the operator side; owner passwords fetched on demand |
| Connection pooling | serverless fan-out analysis, pooled endpoint, pool 3 | persistent pools, pool 5, no external pooler initially |
| Networking | public TLS endpoint, Static IPs | internal Docker network + TLS; no public database port |
| Backups | Neon PITR + snapshots + dumps | Coolify scheduled dumps (+ WAL archiving in phase 2) |
| Pilot | disposable Neon + Vercel | the real VPS stack (section 10) |
| Cost per dedicated tenant | one Neon project each | RAM on the DB host; ~free until the host is full |

## 9. Cutover from Vercel and Neon (historical procedure; not current scope)

Only needed if real data exists there (the development database holds one real organization; the state of the Neon
production database is **[verify]**).

1. Inventory data and secrets on Vercel/Neon (organizations, files bucket location, DNS, email domain).
2. Build and verify the target on staging first; restore a real dump into staging and run the e2e suite.
3. Lower DNS TTL; announce a short maintenance window.
4. Freeze writes, take a final `pg_dump` (direct endpoint), restore into `pg-shared`, compare counts per table and run
   the isolation checks; copy objects between buckets and verify counts and checksums.
5. Switch DNS; smoke-test sign-in, a task create/edit, an upload, a PDF report and an export.
6. Keep Neon read-only for 14 days as a rollback path; then delete the project, **rotate the exposed `neondb_owner`
   credential before deletion**, remove Vercel project variables, revoke tokens.

## 10. Pilot validation on the target VPS stack

Purpose: validate the VPS platform without customer data.
Thresholds are **proposals** to agree before running; M-numbers from the earlier assessment are retired.

This validation set was drafted to support a future dedicated-database tier.
Dedicated-specific checks (including provisioning and cross-instance checks)
are not current release gates. Review and adapt the remaining checks to the
pooled VPS SaaS before execution; none should be read as passed based only on
this plan.

| # | Check | Pass criterion |
| --- | --- | --- |
| P1 | Rebuild: a **temporary second Contabo VPS** from fresh OS image to a running stack, from the documented steps only | ≤ 4 h, no undocumented manual step |
| P2 | External port scan of the server (IPv4+IPv6) | only 80/443 (and SSH from allowed IPs); **no** database or Coolify port reachable |
| P3 | TLS | SSL Labs A; TLS 1.2+ only; HSTS present; HTTP redirects; certificate renews in a staging dry run |
| P4 | Coolify exposure | dashboard unreachable without the VPN; registration disabled; 2FA on; API restricted by IP |
| P5 | Containerised app passes the full e2e suite (13 tests) and the RLS suite against the stack | 100 % pass, three consecutive runs |
| P6 | Deploy and rollback with a failing health check | old container stays up; rollback restores service ≤ 5 min; no downtime on a good deploy |
| P7 | Backup + restore of `pg-shared` | restore completes; counts match; **measured RTO recorded** |
| P8 | Reboot test and `docker restart` of every container | all services return without manual action ≤ 5 min |
| P9 | Failure injection: stop a dedicated instance, revoke the runtime role, fill a **test volume** (never the production disk) | tenant-only typed error ≤ 5 s; other tenants unaffected; shared canary unchanged; alerts fire |
| P10 | Memory cost per dedicated Postgres instance (idle and under load) | recorded; the limit chosen leaves ≥ 25 % server headroom with N instances |
| P11 | Provisioning a dedicated instance end to end (Coolify API) | ≤ 10 min incl. migrations and gates G0–G8; **or** documented fallback if the API lacks a capability |
| P12 | Capacity: sustained 50 req/s (≈ 10× the estimated peak of 500 users) for 10 min, mixed pooled/dedicated tenants, **with staging stopped and then running** | p95 page time ≤ 300 ms; 0 5xx; 0 pool-timeout errors; CPU ≤ 70 %; staging's presence changes production p95 by ≤ 20 %; transaction rate recorded (this is the "TPS" figure) |
| P13 | Cross-tenant isolation with two instances | 0 cross-tenant reads/writes in the RLS suite on both |
| P14 | Alerting | each defined alert fires in a drill and reaches a human |
| P15 | Coolify upgrade and instance restore on the **temporary second VPS** | the documented upgrade procedure (snapshot + instance backup first) succeeds; instance restore with `APP_KEY` works |
| **P16** | **Provider baseline on the Contabo VPS before any customer data:** 24 h soak with CPU load, `sysbench`/`fio`, network throughput test | CPU steal ≤ 5 % average and ≤ 15 % at p99; `fsync` latency p99 ≤ 10 ms and sustained 4k random write IOPS recorded; throughput ≥ 150 Mbit/s to an EU endpoint; no throttling notice; results recorded as the baseline for later comparison |

**Historical go/no-go proposal:** P2, P3, P4, P7, P9, P13 and P16 were marked
blocking for the original plan; P9, P11 and P13 include dedicated-database
assumptions and are not current-scope gates. P11 failing was not a blocker in
that proposal. Do not apply this gate set to the pooled SaaS without review.
If P4/P15 expose unacceptable Coolify risk, the historical plan proposes plain
Docker Compose + Caddy as a self-hosted alternative (section 12).

## 11. Historical roadmap and estimates (2026-10-13)

The roadmap below is retained for planning history, not as the active delivery
sequence. Phase E assumes a Vercel/Neon cutover, and phases F–G implement
dedicated databases; none is current-scope work. The dedicated-database
estimates and related runbooks are deferred. Use the security and product
readiness plan for the current SaaS hardening work.

Estimates are engineer-days for one person who knows the codebase; **U** = uncertainty.

| Phase | Work | Depends on | Estimate |
| --- | --- | --- | --- |
| A | Remaining decisions (D2, D4–D11, D13–D14); order the Contabo VPS (1-month term, EU region); domain/DNS; accounts and 2FA; object-storage account at another provider | — | 1–2 d (U: billing) |
| B | Platform foundation on the single server: OS hardening, VPN, Contabo + host firewalls, Coolify (official installer), TLS, object storage, external monitoring, backups, alerting | A | 5–7 d |
| C | Containerisation, CI image pipeline, staging, scheduled jobs moved, health/readiness split, graceful shutdown, config contract | B | 5–6 d |
| D | **Pilot validation P1–P16; go/no-go** (includes a 24 h provider soak and a rebuild on a temporary second VPS) | C | 4–5 d |
| E | Cutover and Vercel/Neon decommission | D | 3–4 d |
| F | Dedicated-DB proof of concept: plane classification, `controlDb`, registry/resolver behind a flag, one hand-provisioned instance, two-database test profile, no-fallback test | D | 10–12 d |
| G | Production readiness of dedicated DBs: logo move, `tenant_database` model and state machine, credential encryption, provisioning tool (Coolify API), migration fan-out, backup/restore automation per instance, lifecycle/export/deletion, cross-organization read rules | F | 20–28 d (U: Coolify API coverage) |
| H | Runbooks, security review, quarterly DR drill, documentation set | all | 5–6 d |

Totals: **platform to production (A–E) ≈ 19–25 working days (4–5 weeks)** (one fewer server to build, offset by the longer pilot); **dedicated databases (F–H) ≈ 35–46 days
(7–9 weeks)**. The dedicated portion is smaller than the earlier 9–13-week estimate because the Neon API, the pooler and
the serverless capacity work disappear, but the platform migration is new work, so the **combined total is larger**
(about 11–14 weeks). Phases F and G can start in parallel with E once D passes, since the dedicated work does not touch
production until activation.

Critical path: A → B → C → D → F → G. The dedicated feature must not ship to a customer until phase G gates (including
G7 restore testing) pass.

## 12. Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Coolify vulnerabilities (advisories listed in 3.4) **and Coolify shares the production host** | a control-plane compromise is a production compromise | VPN-only dashboard, no registration, 2FA, API off outside provisioning windows, scoped expiring tokens, delayed adoption of releases, snapshot + instance backup before upgrades; **fallback**: Docker Compose + Caddy with the same image pipeline; **next step**: a separate control server |
| Single production server (also holds Coolify and staging) | outage until rebuild; control plane lost together with workloads | measured RTO (P1, quarterly drill), off-provider backups incl. the Coolify instance backup and `APP_KEY`, runbooks, second server later |
| Low-priced shared VPS performance (CPU steal, disk latency) and the single snapshot slot | latency spikes, slow restores | P16 baseline before any customer data, capacity alerts, ability to move up a plan or add a database server; snapshot only as a convenience |
| Provider contract terms (minimum following contract length equals the initial term) | paying for a server that fails the pilot | order the **1-month** term for the pilot; switch to a longer term only after P16 passes |
| Fair-use traffic policy and the 200 Mbit/s port | throttling | monitor throughput; the app's traffic is small; revisit if exports or file volume grow |
| No point-in-time recovery in phase 1 | up to 6 h of data lost | frequent dumps; WAL archiving (phase 2) decision D6; communicate the RPO |
| **Operator is a single person (no deputy)** | slow or no response out of hours, knowledge loss, no cover for illness | no SLA promise, support hours published, runbooks tested in drills, break-glass access (6.3), few actionable alerts; add a deputy before taking availability commitments |
| Dedicated instances exhaust RAM | outage or OOM kills | limits per instance, capacity alerts at 70 %, move to a DB host at 3–5 instances |
| Docker bypasses host firewall | accidental exposure | Contabo firewall authoritative; no published ports; external scan in P2 and quarterly |
| Backup credentials on a compromised server | backups deleted | write-only/object-lock storage in a separate account |
| Coolify API lacks a provisioning capability | slower provisioning tooling | spike in P11, documented fallback |
| Secrets in Coolify readable by `read:sensitive` tokens | credential exposure | tokens only on the operator side, IP-restricted, short expiry |
| Migration to self-hosting adds work before customers | schedule | cutover only after the go/no-go; keep Neon read-only for rollback |
| Data location claims | regulatory misstatement | document facts only (regions, sub-processors); no compliance claims |

## 13. Decisions needed

| # | Decision | Status / recommendation | Blocks |
| --- | --- | --- | --- |
| D1 | VPS provider | **Decided: Contabo Cloud VPS 4** (1-month term for the pilot) | — |
| D2 | Domain/DNS provider and hostnames | **Decided: keep the existing domain at Squarespace Domains (the former Google Domains)**; DNS stays there for now (supports A/AAAA/CAA and DNSSEC); hostnames still to choose | — |
| D3 | Where Coolify runs | **Decided: on the production server**, with the compensating controls in 3.4 | — |
| D4 | VPN | **Decided: WireGuard** ($0, open source, no third-party account in the admin access path); Tailscale's free Personal plan is also $0 but its commercial-use terms are unverified | — |
| D5 | RPO/RTO, backup retention, final-dump retention at deletion | open: 6 h / 8 h now (to be measured); 15 min / 4 h with phase 2 | Phase B/G |
| D6 | When to add WAL archiving (PITR) | open: before the first paying customer, if budget allows | Phase G |
| D7 | Client-side encryption of backups | open: yes for dumps stored at a general-purpose provider | Phase B |
| D8 | Log shipping and retention | open: ship to object storage, 90 days | Phase B |
| D9 | Email provider (keep Resend or EU SMTP) | open: decide with the privacy documentation | Phase C |
| D10 | CDN/WAF in front | open: no, initially | — |
| D11 | Object storage provider for files and backups | **Decided and re-confirmed 2026-10-13: Scaleway Object Storage (Paris) for both**, one provider, two projects with separate keys, Object Lock on the backup bucket (see 5.1) | — |
| D12 | Operator and deputy | **Decided: Frederico is the operator; no deputy yet** (see 6.3 for limits) | — |
| D13 | Contract term | open: 1-month for the pilot; longer only after P16 passes | Phase A |
| D15 | Deployment control plane | **Decided 2026-10-13: Coolify** (evaluation in section 2.5); install from the official installer on a clean Ubuntu 24.04 image, pinned version | — |
| D14 | Datacentre location | **Decided: Contabo region "European Union"** (five datacentres, all in Germany; the order form offers the region, not the city); the UK region is outside the EU | — |

## 14. What still applies from the earlier assessment

[dedicated-database-assessment.md](../archive/dedicated-database-assessment.md) remains the reference for: the schema decision
(Option S, stub organization, logo move, `tenant_export`, boundary rules), the connection-registry race and rotation
findings (4.2 experiment), the state machine and gates G0–G6, and the lifecycle design. **Superseded** by this plan: the
Vercel/Neon feasibility and networking sections, Neon-specific backup and pricing statements, the serverless capacity
table (4.4), the secret-management recommendation (5.4), the disposable Vercel/Neon pilot (section 6) and the estimates
(section 7).

## Appendix A — Port and exposure checklist

Verify from outside the provider network after every infrastructure change: `nmap` TCP scan of the server (IPv4 and
IPv6); expected open ports are exactly those in the table in 3.1; confirm that no database or Coolify port answers.

## Appendix B — Server hardening acceptance

- [ ] key-only SSH, root password login disabled, SSH reachable only from VPN/admin IPs
- [ ] provider firewall and host firewall in place; no container publishes a port other than the proxy's 80/443
- [ ] unattended security updates on; monthly patch/reboot procedure written
- [ ] Docker log rotation; no `docker.sock` in application containers; resource limits on every container
- [ ] fail2ban/CrowdSec active; SSH login alerts
- [ ] time sync; disk alerts 70/85 %; separate data volume where available (a disk-full event must not stop Coolify or the OS)
- [ ] Coolify: registration off, 2FA on, API off or IP-restricted, `APP_KEY` escrowed, instance backups to S3
- [ ] TLS grade A, HSTS, CAA, certificate-expiry alert

## Appendix C — Historical target environment contract

Names below were proposed for the original target architecture; this is not a
record of deployed configuration. No environment variable may relax production
signup restrictions or the email-verification requirement.

| Variable | Purpose | Secret |
| --- | --- | --- |
| `DATABASE_URL` | `pg-shared` runtime URL (explicit, `verify-full`) | yes |
| `MIGRATION_DATABASE_URL` | migrator URL, used only by the migrate job and operator tools | yes |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` | authentication | secret / no |
| `TENANT_CREDENTIAL_KEYS` | key ring for tenant credentials | yes |
| `S3_*` | object storage | yes |
| `RESEND_API_KEY`, `AUTH_EMAIL_FROM` (or SMTP settings) | email | yes |
| `APP_ENV` | Proposed deployment label for scripts or diagnostics; it does not control production signup or verification policy | no |

## Appendix D — Runbooks to write (phase H, drafted as each area lands)

1. Provision the server from scratch (Contabo order, OS image, hardening, VPN) and install Coolify (bootstrap and VPN runbooks: [01-server-bootstrap.md](../operations/server-bootstrap.md), [02-wireguard-admin-access.md](../operations/wireguard-admin-access.md); Ansible baseline: [../ansible/README.md](../../ansible/README.md); Contabo provider firewall API still to verify)
2. Rebuild production after server loss using the staged [on-demand VPS recovery runbook](../operations/vps-recovery.md); Terraform VPS creation, first-boot Ansible, remote state, restore validation, and DNS cutover automation remain outstanding
3. Restore `pg-shared` / PITR (phase 2); dedicated-instance restore is deferred
4. [Deferred] Provision, rotate credentials for, suspend, and decommission a dedicated instance
5. Deploy, roll back, and run migrations (including a failed migration)
6. Renew or replace certificates; regenerate the database CA
7. Respond to a suspected compromise (rotate everything, rebuild, restore pre-compromise)
8. Patch, reboot and upgrade Coolify/Docker/Postgres (minor and major; Coolify backup and pre-upgrade steps are in [runbook 03](../operations/coolify-backup-and-upgrade.md))
9. Disk-full and out-of-memory incidents
10. Operator absence: break-glass access and deputy procedure
11. Quarterly DR drill and port-scan procedure
