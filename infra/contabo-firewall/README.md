# Contabo provider firewall

This Terraform configuration manages the provider-level firewall for the existing Contabo VPS and includes an
optional, disabled-by-default recovery VPS scaffold. The Contabo Customer Control Panel may not offer a create
action; the Contabo-maintained
[Terraform provider](https://github.com/contabo/terraform-provider-contabo) documents a `contabo_firewall` resource
with inbound rules and instance attachment. The configuration was applied on 2026-10-13. A fresh read-only API
listing confirms the firewall is active and attached to the intended instance; connectivity checks remain.

## Assumptions and unresolved checks

- The target is the existing VPS, identified by its numeric Contabo instance ID. The public IP and subscription ID
  are not substitutes for this value.
- Read-only API output confirms target instance ID `203660431`, provider name `vmi3660431`, display name `Machsist`,
  IPv4 `169.58.161.222`, and an IPv6 assignment. The pre-apply firewall listing returned no rows. Terraform has
  since created firewall `ecb5bdfa-08ad-4f91-a4dc-8fbb52a3a5e7`, and the API confirms it is active and attached to
  instance `203660431`.
- The operator believes the subscription includes one firewall. Successful creation confirms API eligibility for
  this operation, but any charge remains unverified. On 2026-10-13 the operator explicitly authorized proceeding
  despite the unresolved billing and traffic-behavior questions; this is accepted risk, not confirmation from
  Contabo.
- The selected target allows only inbound TCP 80/443 and UDP 51820 from all IPv4 and IPv6 sources
  (`0.0.0.0/0` and `::/0`). The operator explicitly approved these public sources. It does not allow public TCP 22,
  Coolify ports, or database ports. The host UFW already restricts SSH to `wg0`.
- Web and WireGuard source lists remain separate inputs. The WireGuard source is public because the client may roam;
  narrow it only if a stable source range is established.
- The latest API listing includes an active catch-all inbound `drop` rule after the explicit allows. Unmatched
  inbound is configured to drop. IPv6 source rules are present. Outbound behavior and connection statefulness
  remain unverified; verify service reachability and return traffic.
- Inspect existing firewall attachments first. If a firewall is already attached, do not create a competing policy;
  import and review the existing resource or stop. The provider's delete operation can detach instances and delete
  the firewall, so preserve Terraform state and do not run `terraform destroy`.
- The provider credentials are API credentials, not the VPS SSH key or `ops` password. The provider's documentation
  supports these environment variables: `CNTB_OAUTH2_CLIENT_ID`, `CNTB_OAUTH2_CLIENT_SECRET`, `CNTB_OAUTH2_USER`,
  and `CNTB_OAUTH2_PASS`. The API password is managed separately in the Contabo account. Never commit credentials
  or state files.

## Preflight

1. Review the provider-default and billing unknowns above. The operator has accepted proceeding despite them; record
   any later Contabo confirmation in the runbook without recording credentials.
2. To match the numeric ID and inspect existing firewall attachments when the panel displays only a VPS name, run
   the read-only helper from this directory:

   ```sh
   python3 list_contabo_instances.py
   ```

   It prompts locally for the Contabo API client ID, client secret, API user, and API password. Secret fields are
   hidden; credentials are sent over HTTPS only to Contabo's OAuth/API endpoints and are not written to disk or
   printed. The confirmed row reports `instanceId` `203660431`, `name` `vmi3660431`, `displayName` `Machsist`,
   and IPv4 `169.58.161.222`; an IPv6 address is also assigned. The firewall listing returned no rows. The helper
   lists firewall IDs, statuses, attached instances, and rules when present. The Linux hostname `maint-prod-01`
   need not match the Contabo name. These are read-only listings.
3. Install Terraform and ensure the account has API access to firewall operations. Recovery provisioning additionally
   requires compute/image permissions, which have not been verified. The provider reads
   `CNTB_OAUTH2_CLIENT_ID`, `CNTB_OAUTH2_CLIENT_SECRET`, `CNTB_OAUTH2_USER`, and `CNTB_OAUTH2_PASS`. Supply them
   locally for each Terraform invocation; a token cache alone did not authenticate a later invocation. Do not paste
   API credentials into chat or source files. The provider caches its OAuth token under
   `~/.cache/contabo/terraform/token`; protect that cache before the first authenticated command, and recheck it
   after any provider upgrade:

   ```sh
   umask 077
   mkdir -p "$HOME/.cache/contabo/terraform"
   chmod 700 "$HOME/.cache/contabo" "$HOME/.cache/contabo/terraform"
   if [ -e "$HOME/.cache/contabo/terraform/token" ]; then
     chmod 600 "$HOME/.cache/contabo/terraform/token"
   fi
   ```
4. From this directory, copy the approved, non-secret inputs into the ignored `terraform.tfvars` file:

   ```sh
   cp terraform.tfvars.example terraform.tfvars
   ```

   The example contains the operator-approved source ranges and confirmed target ID; it contains no credentials.
   Recheck the instance/IP mapping before planning or applying.

## Local validation and live-plan gate

```sh
terraform init
terraform fmt -check
terraform validate
```

`terraform plan` authenticates to Contabo but does not create or attach resources. It can be run to review the
proposed change; it does not establish cost, outbound/return-traffic behavior, or effective IPv6 enforcement.
Review the complete plan and refresh results. Stop if a future plan proposes replacing/deleting an existing
firewall, attaching to an unexpected instance, or opening unapproved CIDRs. The operator authorized proceeding
despite the unresolved provider details, but only for the reviewed one-add/no-change/no-destroy plan.

## Post-apply verification

Terraform created firewall `ecb5bdfa-08ad-4f91-a4dc-8fbb52a3a5e7`; the fresh read-only API listing reports it
`active` and attached to instance `203660431`. Terraform state briefly showed `processing`, which has since settled.
Public TCP/22 probes to the VPS's IPv4 and IPv6 addresses both timed out from this Mac; a fresh SSH login over
WireGuard returned `VPN_SSH_OK`. HTTP and HTTPS reachability can only be verified after a service is listening;
recheck externally after deployment. General outbound behavior, TCP return-traffic behavior, and any charge remain
unverified.

## On-demand recovery VPS scaffold

The `contabo_instance.recovery` resource is disabled unless `recovery_instance_enabled = true`. When enabled, it
requires a local public-key path and an image ID that resolves to a standard Linux Ubuntu 24.04 image. The image
metadata postcondition rejects other images. The provider documentation warns that changing `image_id` or
`user_data` can reinstall a VPS; do not change either after creation without an explicit reinstall plan. The resource
has `prevent_destroy` to guard against accidental removal.

The firewall can attach to the new instance and optionally allow TCP/22 only from a single explicit IPv4 `/32`.
Enable `bootstrap_ssh_enabled` only for the bootstrap phase, then disable it after VPN access is verified. The
temporary rule applies to every instance attached to the firewall; the existing production host's UFW is expected
to continue denying public SSH. This multi-instance attachment and bootstrap behavior have not been confirmed with
a live recovery VPS.

No recovery VPS has been created, and no live plan/apply has been run for this scaffold. It is not yet a tested
recovery procedure. Follow the staged [recovery runbook](../../docs/operations/vps-recovery.md); do not
apply without explicit cost authorization.

### Gated recovery runner

`recover_contabo_vps.py` coordinates the Terraform and Ansible phases, creates temporary inventories from Terraform
outputs, and saves a local checkpoint so an interrupted run can resume:

```sh
python3 recover_contabo_vps.py \
  --image-id 'VERIFIED_UBUNTU_24_04_IMAGE_ID' \
  --bootstrap-source-cidr 'YOUR_CURRENT_PUBLIC_IPV4/32'
```

Run it from this directory after creating and reviewing `terraform.tfvars`. It runs formatting, Terraform
initialization/validation, and both Ansible syntax checks before reaching the provisioning gate. Contabo credentials
are prompted locally (or read from the provider environment); they are never written to the checkpoint.

The runner shows the full Terraform plan and requires `CREATE` before applying. It rejects plans that destroy or
replace managed resources or modify resources outside the recovery instance and firewall. It then pauses for SSH
host-key verification, WireGuard profile update and SSH verification, `ops` password setup, Ansible baseline review,
and provider-firewall lockdown (`LOCKDOWN`). After lockdown, it probes TCP/22 over IPv4 and over IPv6 when one is
assigned; a failed probe is only meaningful if the operator network has a working route for that address family.
If interrupted, continue the same run with:

```sh
python3 recover_contabo_vps.py --resume
```

The checkpoint at `.recovery-session.json` contains only non-secret inputs and progress (including public keys,
addresses, and local key-file paths); it is ignored by Git and mode `0600`. Keep the matching Terraform state and
checkpoint together. Because state remains local, this runner cannot recover safely on a different Mac if that
state is lost. After the runner completes, Coolify/application setup, database and file restoration, health checks,
and DNS/TLS cutover remain manual; follow the recovery runbook. The runner has not been used against Contabo and
must first be rehearsed without deleting the production VPS.

## Terraform state limitation

The state is local to the operator workspace, not remotely stored or locked. Remote state is deferred for now at the
operator's request; if the Mac/workspace is lost, state must be recovered or the existing firewall carefully
imported before making provider changes. This is a recovery risk. Do not run `terraform destroy` as a recovery
shortcut.

The staged on-demand replacement design, first-boot requirements, data restore, and remaining automation work are
documented in the [VPS recovery runbook](../../docs/operations/vps-recovery.md).
