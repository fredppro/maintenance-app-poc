# Runbook 02: WireGuard and VPN-only SSH

Part of [self-hosted-platform-plan.md](../planning/self-hosted-platform-plan.md), phase B (platform foundation), part 2.
Prerequisite: [runbook 01](server-bootstrap.md) Stage 9 passed and the `baseline-hardened` Contabo snapshot
exists.

For repeatable host configuration after this one-time WireGuard setup, see the
[Ansible baseline](../../ansible/README.md). Provider firewall creation and attachment are managed in
[Terraform](../../infra/contabo-firewall/README.md).

## Dated server observations (2026-10-13)

These are historical operator reports, not a live status check. See
[environment status](../reference/environment-status.md) for current staging
deployment verification and the facts that still require external confirmation.

Recorded on 2026-10-13:

- WireGuard is running as `wg0` on `10.242.0.1/24`, UDP port `51820`.
- The Mac peer is `10.242.0.2`; the Mac profile routes only `10.242.0.1/32` through the tunnel (split tunnel).
- SSH to `ops@10.242.0.1` succeeded with the operator's SSH key and the server host fingerprint matched.
- UFW now has the `wg0`-specific SSH allow rule for IPv4 and IPv6; the general public `22/tcp` rules for both address
  families were deleted on 2026-10-13. A new VPN SSH session succeeded after removal, and a public port-22 probe
  timed out, confirming host-level SSH restriction.
- The pre-apply read-only inventory returned no firewall entries. Terraform subsequently created firewall
  `ecb5bdfa-08ad-4f91-a4dc-8fbb52a3a5e7`; its top-level status is `active`.
- The Terraform state briefly showed instance `203660431` as `processing`; the fresh read-only API listing now
  confirms firewall `ecb5bdfa-08ad-4f91-a4dc-8fbb52a3a5e7` is `active` and attached to that instance.
- From this Mac after attachment, public TCP/22 probes to the VPS's IPv4 and IPv6 addresses both timed out.
  A new SSH connection to `ops@10.242.0.1` over WireGuard returned `VPN_SSH_OK` after apply.
- The operator believes the subscription includes one firewall. Entitlement and any charge for creation/attachment
  have not been confirmed; the API accepted the creation request.
- The reviewed Terraform plan proposed exactly one active firewall attached to instance `203660431`, allowing
  TCP/80, TCP/443, and UDP/51820 from `0.0.0.0/0` and `::/0`, with no other changes. On 2026-10-13 the operator
  explicitly authorized applying despite the unresolved provider-behavior and billing questions. Apply completed
  and Terraform returned the firewall ID and active status.
- The read-only Contabo API inventory matched instance ID `203660431`, provider name `vmi3660431`, display name
  `Machsist`, and IPv4 `169.58.161.222`; it also showed an IPv6 assignment. The firewall list was empty before
  this apply.
- The server private key is in `/etc/wireguard/server_private.key`; do not print, copy, or share it.

## Coolify bootstrap status (2026-10-15)

- Installed Coolify `4.4.6` from the official installer; Docker Engine is `29.9.0`. Automatic Coolify updates are
  disabled so upgrades remain an explicit, reviewed operation.
- The control plane and its generated secrets were reset and reinstalled on 2026-10-14 after an earlier local
  `.env` backup was exposed. The new server `.env` is mode `0600`; the operator confirms an encrypted off-host
  backup is complete. The local plaintext copy was removed after that confirmation. Its encrypted destination is
  not recorded. Never restore the old backup, print `.env` contents, or paste them into chat.
- Docker's default address pool is `172.30.0.0/16` with subnet size `24`, avoiding overlap with WireGuard's
  `10.242.0.0/24`.
- Coolify's `localhost` server uses `host.docker.internal` (`172.30.0.1`) for SSH. Its container is on
  `172.30.1.0/24` via `br-9eb9aafa0153`; UFW initially allowed SSH only on `wg0`, so Coolify could not reach the
  host. The prior bridge rule was removed during reset; restored a narrow allow rule from that subnet/interface to
  `172.30.0.1:22`. After the rule, Coolify's live server recheck reported both reachable and usable. There is still
  no public SSH allow rule. If Docker recreates this network, re-check the bridge and subnet and update the rule
  accordingly.
- The Coolify, PostgreSQL, and Redis containers reported healthy. From the operator Mac with WireGuard active,
  `http://10.242.0.1:8000` returned HTTP 302.
- Docker publishes Coolify ports `8000`, `6001`, and `6002` on IPv4 and IPv6 host interfaces. Direct public probes
  from the operator Mac could not connect to those ports on either public address family. Docker-published ports can
  bypass UFW, so retain the provider firewall and verify from an independent network in the plan's P2 scan.
- The previous Coolify account and 2FA state were removed with the reset. The first root account has since been
  recreated and `/register` redirects to `/login`, confirming registration is disabled. On 2026-10-15, the
  Coolify profile showed 2FA **Enabled**.
- This runbook recorded that no application or database had been deployed at the time. The platform plan records a
  staging application and database as deployed on the same date; the repository does not resolve that conflict.
  The **new** `/data/coolify/source/.env` is mode `0600`. The operator
  confirms an encrypted off-host backup is complete; its destination is not recorded. The local plaintext copy has
  been removed. Never print or paste the file contents into chat.
- The baseline snapshot predates WireGuard, so restoring it requires repeating this runbook before Coolify can be
  reached.

### Add the GHCR pull credential

Sign in to Coolify over WireGuard, then use **Servers → the Contabo/local server → Registries → New** (the button
opens **Log in to a registry**). If the server page is unavailable, use the main **Registries → Multi-server login**
page and select only this server. Choose **GitHub Container Registry**; confirm the registry is `ghcr.io`; enter the
GitHub username and a personal access token (classic) scoped to `read:packages` only; then click **Log in**. Confirm
that the `ghcr.io` row shows a successful login. Do not use `repo`, `write:packages`, or `delete:packages`.

Coolify runs `docker login` on the server. Docker stores the credential in `~/.docker/config.json` encoded but not
encrypted, so treat it as a server secret and keep the token read-only and expiring. Never paste the token into chat.

Status on 2026-10-15: the GHCR login is restored and `ghcr.io` appears in the host's Docker registry configuration.
An authenticated manifest request for the pinned image digest succeeded. The token's scopes and expiry have not
been independently verified; ensure it is read-only (`read:packages`) and expiring.

## Dedicated peer for GitHub Actions staging deployment

On 2026-10-30, the dedicated `github-staging` peer was provisioned at
`10.242.0.3/32`. The `wireguard` Ansible run completed and its live-peer
postcondition passed. Its private key is held only in the GitHub
`staging` Environment secret `STAGING_WIREGUARD_CONFIG`; never print or paste
that secret. Before reusing this procedure for a replacement peer, first
inventory `wg show wg0` and reserve a unique address.

The client configuration routes only `10.242.0.1/32`; it does not install a
default route or reuse the operator Mac peer at `10.242.0.2`. On 2026-10-30,
the `staging-firewall` Ansible tag was applied and verified: UFW denies host
access from `10.242.0.3`, permits SSH on `wg0` only from `10.242.0.2`, and a
persistent systemd service installs a `DOCKER-USER` rule that permits the
staging peer's forwarded TCP traffic to `10.242.0.1:8000` and drops its other
forwarded traffic. The service is enabled and active, and a new operator SSH
connection succeeded after the change. Docker-published ports `8000`, `6001`,
and `6002` may bypass UFW, so verify the effective policy in the Docker
firewall path, not just `ufw status`. See the [Ansible runbook](../../ansible/README.md)
for the check/apply sequence.

The network rule limits access to the Coolify listener on port `8000`; it cannot
distinguish API URLs from the web UI on that same listener. On 2026-10-30,
Coolify API access was enabled with its allowed-IP list set to
`10.242.0.3/32`. The operator confirmed creation of the least-privilege token
and storage in the `staging` Environment; its value is not recorded here.

The `COOLIFY_API_TOKEN` uses Coolify's `write` and `deploy` permissions to pin
the image digest and trigger a deployment; do not grant `root` or
`read:sensitive`. On 2026-10-31, the issued-token list showed those two
permissions only. The operator confirmed that the GitHub `staging` Environment
is restricted to `develop` and that the replacement token value is saved
there. The repository Actions variable `STAGING_AUTODEPLOY_ENABLED` is enabled;
workflow run 24 verified the automated staging deployment end to end. See the
[deployment and release runbook](deployment-and-release.md) for setup details
and [environment status](../reference/environment-status.md) for dated
verification.

## Stage 1: permit SSH only on the VPN interface

Keep the existing public-key root session open as a recovery path. The server has UFW active with default-deny
incoming. First add a more-specific allow rule for SSH arriving through `wg0`:

```
# [Server, root]
ufw allow in on wg0 to any port 22 proto tcp comment 'SSH via WireGuard'
ufw status numbered
```

From a **new Mac terminal** with the WireGuard tunnel active, verify a new VPN SSH session:

```
# [Mac]
ssh -i "$HOME/.ssh/maintenance_contabo_2026" \
  -o IdentitiesOnly=yes \
  -o PreferredAuthentications=publickey \
  -o PasswordAuthentication=no \
  -o KbdInteractiveAuthentication=no \
  ops@10.242.0.1 'echo VPN_SSH_OK'
```

Do not remove the public SSH rule unless this prints `VPN_SSH_OK`.

## Stage 2: remove public SSH access

After the VPN SSH test passes, remove the general SSH allow rule:

```
# [Server, root]
ufw delete allow 22/tcp
ufw status numbered
```

Verify there is no `22/tcp ALLOW IN Anywhere` or `22/tcp (v6) ALLOW IN Anywhere (v6)` rule. The `wg0` SSH rule
must remain. If the general rule remains for either address family, inspect the numbered rules and remove only the
remaining public SSH rule; do not delete the `wg0` rule.

Open another **new** Mac terminal with WireGuard active and repeat the VPN SSH test. Then turn the WireGuard tunnel
off and test that public TCP 22 is blocked:

```
# [Mac, tunnel off]
nc -vz -w 5 169.58.161.222 22
```

Expected: the connection fails or times out. If VPN SSH fails at any point, keep any existing session open and
restore public SSH from the server session with `ufw allow 22/tcp`; verify VPN access before trying again.

## Stage 3: Contabo network firewall

**Status: active and attached; admin path verified.** Terraform created firewall
`ecb5bdfa-08ad-4f91-a4dc-8fbb52a3a5e7`; the fresh API listing confirms it is active and attached to instance
`203660431`. The rules allow TCP/80 and TCP/443 plus UDP/51820 from all IPv4 and IPv6 sources, with an active
catch-all inbound `drop` rule. Outbound behavior, return-traffic statefulness, effective IPv6 enforcement, and any
charge remain unverified. Public TCP/22 timed out over IPv4 and IPv6 from this Mac, and a fresh VPN SSH login
succeeded. TCP/80 and TCP/443 cannot be tested until a service is listening. See the
[Terraform firewall setup](../../infra/contabo-firewall/README.md).

### Policy assumptions and verification

- The intended public services are HTTP and HTTPS; the application is not yet deployed, so allowing these ports
  creates network reachability but does not prove an application is listening or healthy.
- HTTP (`TCP/80`) is currently retained for HTTP-01 ACME validation and/or redirecting HTTP to HTTPS. If neither is
  required by the eventual deployment, remove this allowance from the target policy.
- The WireGuard client can roam, so `UDP/51820` currently assumes any source address. A fixed trusted source CIDR
  could narrow it, but must not be assumed.
- Public SSH (`TCP/22`) is not required. The tested admin path is SSH to `10.242.0.1` over WireGuard; the provider
  policy must not permit public TCP/22 on either address family.
- The API listing contains an active catch-all inbound `drop` rule after the explicit allows. Public TCP/22 timed
  out over IPv4 and IPv6 from this Mac. A fresh WireGuard SSH login succeeded, confirming the UDP tunnel and its
  response path. General outbound access and TCP return traffic for the web ports remain to be verified.
- The API inventory showed an IPv6 assignment. The operator chose the same public ports over IPv6 as IPv4, from all
  sources (`::/0`); Terraform state contains those IPv6 rules. Verify effective IPv6 enforcement externally.
- The public IPv4 recorded for this VPS is `169.58.161.222`; verify that the panel's selected VPS and address still
  match before making later changes.
- The read-only API listing confirms instance ID `203660431` (`vmi3660431`, display name `Machsist`) maps to
  `169.58.161.222`; it also shows an IPv6 assignment. These identifiers are confirmed for the listing date, but
  should be rechecked before making later policy changes.
- The Contabo panel/API behavior is not fully established. The latest API listing reports the firewall active and
  attached; verify effective filtering and outbound behavior with tests.

### Read-only inventory and status check

Use the Contabo panel or the read-only [instance and firewall inventory helper](../../infra/contabo-firewall/README.md)
to confirm the new firewall's attachment status and rules. The helper lists `instanceId`, Contabo `name`, display
name, IPv4/IPv6 addresses, and firewall IDs, status, attachments, and rules. The target is instance `203660431`,
provider name `vmi3660431`, display name `Machsist`, IPv4 `169.58.161.222`. Do not assume the Linux hostname is the
Contabo name. Do not place API credentials in command-line arguments or share them. Record the attachment status,
the effective inbound/outbound behavior, IPv4/IPv6 coverage, and how to disable or detach the policy to roll back.
If the panel or provider documentation does not make these properties clear, verify with Contabo rather than
guessing.

### Target inbound policy

The applied policy is the operator-approved public source policy:

| Port | Protocol | IPv4 source | IPv6 source |
|---|---|---|---|
| 80 | TCP | `0.0.0.0/0` | `::/0` |
| 443 | TCP | `0.0.0.0/0` | `::/0` |
| 51820 | UDP | `0.0.0.0/0` | `::/0` |

Do not allow public TCP 22. SSH is carried inside UDP `51820` and reaches `wg0`; it does not need an Internet-facing
TCP 22 rule. Do not expose Coolify ports (`8000`, `6001`, `6002`) or database ports. Preserve outbound access.
The operator has approved public IPv6 allowances because the VPS has an IPv6 assignment. Keep the VPN SSH session
open while applying the policy, and use the panel's documented disable/detach action as the rollback path. If the
panel's behavior differs from this target, stop and inspect before applying.

The API now confirms the instance attachment is active. Post-apply checks from this Mac confirmed a new WireGuard
SSH login and public TCP/22 timeouts over IPv4 and IPv6. HTTP/HTTPS reachability cannot be verified until a service
is deployed and listening. Repeat external port checks after deployment, and confirm no other ports are exposed.

## Recovery and verification

- Keep a VPN SSH session open while changing either firewall.
- If public SSH is accidentally blocked before VPN access works, restore it in the still-open server session:
  `ufw allow 22/tcp`.
- The Contabo snapshot is the rollback point for this initial, disposable host; it is not an independent backup.
- Final check: `wg show wg0`, `ufw status numbered`, a new SSH login to `ops@10.242.0.1`, and an external TCP 22
  probe with the tunnel off.
