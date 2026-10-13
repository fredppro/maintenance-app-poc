# Runbook 00: on-demand VPS replacement and platform recovery

This runbook records the selected recovery model and the required sequence for replacing the Contabo VPS after a
failure. The selected model is **on-demand replacement**, not a continuously running warm standby. Provisioning an
additional VPS may incur charges for as long as it exists.

**Status: untested gated automation; not yet a tested recovery procedure.** No replacement VPS has been created.
Terraform has an opt-in instance/firewall scaffold, Ansible has a separate first-boot WireGuard playbook, and
[`recover_contabo_vps.py`](../../infra/contabo-firewall/recover_contabo_vps.py) coordinates those phases with
explicit approval and verification gates. None has been exercised against a new VPS. Do not treat this document as
evidence that a rebuild has been tested.

## Current automation boundary

| Area | Current state | Recovery gap |
|---|---|---|
| Contabo provider firewall | Terraform manages the active firewall attached to instance `203660431`; policy allows TCP 80/443 and UDP 51820, not public TCP 22. | The configuration now has disabled-by-default support for a second attachment and temporary SSH from one IPv4 `/32`. Live multi-instance behavior remains unverified. |
| VPS provisioning | A disabled-by-default `contabo_instance` resource is now present in the same Terraform root/state as the active firewall. It requires an image ID and local public-key path, and checks Contabo image metadata for standard Linux Ubuntu 24.04. | It has not been enabled, planned against the live account, or applied. Cloud-init key injection must be validated on a disposable/recovery VPS before relying on it. |
| First-boot access | Existing host access is through WireGuard. The Terraform scaffold seeds the operator's public key with cloud-init; its temporary TCP/22 rule is restricted to one configured IPv4 `/32`. | Cloud-init key injection and the bootstrap firewall behavior have not been verified on a new VPS. |
| Host configuration | The existing [Ansible baseline](../../ansible/README.md) hardens the existing host and requires WireGuard already running at `10.242.0.1`. A new [first-boot WireGuard playbook](../../ansible/recovery-firstboot.yml) is scaffolded for a clean Ubuntu 24.04 host and passed a syntax check. | It has not been run against a host. Cloud-init key injection, SSH host-key verification, VPN handoff, and subsequent baseline convergence still need a rehearsal. |
| Orchestration | The recovery runner performs preflight checks, reads the existing WireGuard client public key, creates temporary inventories, limits Terraform plan actions, stores local progress, and resumes with `--resume`. | It has not been run against Contabo. Host-key trust, API behavior, VPN handoff, and provider firewall changes must be proven in a controlled drill. |
| Application and data | The host-level firewall and baseline are documented; application deployment and complete data restoration are separate concerns. | Coolify, application configuration, database, uploaded files, secrets, DNS, and TLS must be restored or re-established. Infrastructure provisioning alone does not restore service. |
| Terraform state | The active firewall's Terraform state is local to the operator workspace and is not in a remote backend. | State recovery and locking are not available if the Mac/workspace is lost. **Remote state is deferred for now, at the operator's request.** This remains a recovery risk and must be resolved before calling this process disaster-ready. |

The Contabo provider is pinned to `0.1.44`. Its documentation describes `contabo_instance`, cloud-init `user_data`,
and snapshots. The default image documented by the provider is Ubuntu 20.04, so replacement configuration must select
and verify an Ubuntu 24.04 image explicitly. Do not put passwords, SSH private keys, or WireGuard private keys in
Terraform inputs or cloud-init.

## Preconditions and information to keep available

Keep the following in the appropriate secure systems, not in this repository or chat:

- Contabo account MFA/recovery material and API credentials; confirm the account can create the selected VPS
  product and attach the firewall.
- A passphrase-protected operator SSH private key on the Mac and its public key for cloud-init.
- The Contabo Ubuntu 24.04 image ID, product ID, region, and contract period. The existing VPS was reported as
  product `V153` in region `EU`; recheck current availability and pricing instead of assuming those values remain
  valid.
- The operator's current public IPv4 CIDR (normally a single `/32`) for any temporary bootstrap SSH allow rule.
  Do not allow TCP 22 from `0.0.0.0/0` or `::/0`.
- The Mac's WireGuard client private key and profile, held locally. The server's WireGuard private key must be
  generated and kept on the replacement host.
- DNS registrar access, Coolify/application secrets, the Coolify `APP_KEY`, object-storage access, and the latest
  verified database and file backups.
- A known-good backup timestamp and an agreed recovery point/time objective. No tested RPO or RTO is established
  by this runbook.

The Contabo snapshot `baseline-hardened-2026-10-13` was created before WireGuard configuration. It is not a complete
recovery image, and snapshot cloning/identity behavior has not been verified. Prefer a clean Ubuntu 24.04 install
and repeatable configuration; treat snapshots as a possible supplemental recovery aid only after a restore test.

## Recovery sequence

Do not skip the access gates. Keep the failed/old VPS and its data intact until the replacement is verified, unless
the incident requires isolation. If compromise is suspected, follow the [incident response runbook](../incident-response.md)
and rotate credentials rather than copying identities or secrets from the suspect host.

### 1. Confirm the incident and preserve recovery material

1. Confirm whether the old host is failed, unreachable, or intentionally isolated. Record the last known-good
   application, database, file-backup, and DNS state.
2. Do not destroy the old Contabo instance or Terraform state. If Terraform state is unavailable, stop before making
   provider changes; recover or import state under a reviewed procedure rather than creating a competing firewall.
3. Choose whether this is a real failover or a rehearsal. Do not assign the existing VPN address to a replacement
   while the old server may still be reachable.

### 2. Provision a clean replacement

Use the [gated recovery runner](../../infra/contabo-firewall/recover_contabo_vps.py), which passes temporary
Terraform overrides without editing `terraform.tfvars`. From the repository root:

```sh
python3 infra/contabo-firewall/recover_contabo_vps.py \
  --image-id 'VERIFIED_UBUNTU_24_04_IMAGE_ID' \
  --bootstrap-source-cidr 'YOUR_CURRENT_PUBLIC_IPV4/32'
```

Before approving `CREATE`, confirm current Contabo product availability/pricing, verify the image ID resolves to
Ubuntu 24.04, and review the complete Terraform plan. The runner rejects destructive/replacement actions and
unrelated resource changes. The firewall's temporary TCP/22 allow applies to every instance attached to it; the
existing production host's UFW should continue to deny public SSH. Verify that behavior and the provider's
multi-instance attachment semantics before live use. The recovery resource has `prevent_destroy`; changing image
or cloud-init user data can reinstall a host according to provider documentation.

Terraform outputs the new instance ID and primary IPv4, plus the primary IPv6 when assigned. No live plan or apply has been run for this scaffold.
Creating the instance is billable; do not approve `CREATE` without explicit cost authorization.

### 3. Configure the clean host

The runner uses the dedicated [first-boot Ansible playbook](../../ansible/recovery-firstboot.yml) rather than
weakening the existing VPN-only convergence checks. It connects using the temporary public path and:

1. Verify Ubuntu 24.04 and the expected replacement address.
2. Install Python if needed, UFW, and WireGuard; create the `ops` account and install the operator public key.
3. Generate a **new** WireGuard server private key on the replacement, with root-only permissions. Never fetch or
   print it. Only the public key may be displayed.
4. Configure the WireGuard peer using the existing Mac client's public key and the agreed VPN addresses.
5. Enable UFW with the temporary SSH `/32`, intended web/WireGuard ports, and SSH on `wg0`. The existing baseline
   playbook later adds Fail2ban, unattended security updates, swap, and the remaining convergence checks.
6. Do not remove the temporary provider TCP/22 rule before VPN access has been tested.

The playbook passed an Ansible Core 2.15.13 syntax check with `community.general` 10.3.0, but it has not been
executed. Its assumptions, cloud-init behavior, and SSH/UFW handoff must be verified during a controlled rehearsal
before using it for a production recovery.

### 4. Verify and hand off administration to WireGuard

1. For an actual failover, after confirming the old server is offline/isolated, configure the replacement with the
   service VPN address `10.242.0.1/24` and UDP port `51820`. Generate a fresh server key; do not reuse the old
   server's private key.
2. Update the Mac WireGuard peer locally with the replacement's public key and endpoint. Keep the Mac private key
   local. Connect and verify a **new** SSH session to `root@10.242.0.1`.
3. For a rehearsal while the old VPS is running, use a separate VPN address and a separate/test client profile.
   Never let two live servers claim `10.242.0.1`.
4. The runner pauses to set the `ops` password interactively, reviews and applies the existing Ansible baseline over
   WireGuard, then removes the temporary provider SSH rule after explicit `LOCKDOWN` approval. It probes public
   TCP/22 over IPv4 and, when assigned, IPv6 from the operator network. A failed connection is not proof of a
   blocked port if that network lacks a working route; confirm externally if either address family is unavailable.
   Confirm a new VPN SSH session.

The current Ansible inventory points to `10.242.0.1`; this is appropriate for the production cutover but not for
bootstrapping or testing a second live instance.

If the runner is interrupted, resume it from the same workspace with
`python3 infra/contabo-firewall/recover_contabo_vps.py --resume`. Do not remove the ignored local
`.recovery-session.json` checkpoint or switch workspaces mid-run. The checkpoint is not a replacement for Terraform
state, which remains local.

### 5. Restore service and data

1. Install/recover Coolify and deploy the application from the recorded release or image digest. Recover the Coolify
   `APP_KEY` and application environment from the password manager/approved secret store.
2. Restore the shared database and any tenant databases from the latest verified backup. Restore uploaded files and
   other persistent objects from off-host storage. Follow the database and tenant recovery runbooks; do not assume
   a VPS snapshot contains these data.
3. Verify migrations, tenant routing/isolation, login/email flows, health checks, scheduled jobs, and external
   backups before routing production traffic.
4. Update DNS at the registrar to the new public address and verify TLS issuance/renewal and external HTTPS health.
   Preserve the old DNS values until the new service passes its checks.
5. Record actual outage time, backup point restored, data loss (if any), and recovery duration. These measurements
   are the basis for setting an RPO/RTO.

### 6. Close out

Keep the old instance and recovery materials until the replacement is stable and rollback is no longer required.
Then remove temporary bootstrap access, update the authoritative inventory and runbooks, and decommission the old
instance only after checking its data, backups, billing, firewall attachment, and Terraform state.

## Automation work required before a tested DR claim

1. Rehearse the gated runner without deleting the production VPS; confirm Contabo image metadata, multi-instance
   attachment behavior, pricing, cloud-init key delivery, and lockout/rollback handling.
2. Verify the runner's first-boot and existing baseline Ansible phases over public-bootstrap and VPN connections.
3. Extend orchestration only after tested restore procedures exist; data-restore approval, health checks, and DNS
   cutover remain explicit operator gates.
4. Decide and implement protected remote Terraform state with locking. Deferred for now; without this, loss of the
   operator workspace can prevent safe provider recovery.
5. Test restore of databases and files from off-host backups, and run a full replacement drill without deleting the
   production host.
6. Set and measure an RPO/RTO, then update the procedure with actual timings, costs, and verified provider behavior.

Related procedures: [server baseline](01-server-bootstrap.md), [WireGuard and provider firewall](02-wireguard-admin-access.md),
[Ansible baseline](../../ansible/README.md), [Contabo Terraform firewall](../../infra/contabo-firewall/README.md),
and [self-hosted platform plan](../self-hosted-platform-plan.md).
