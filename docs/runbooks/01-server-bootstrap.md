# Runbook 01: bootstrap and harden the production server

Part of [self-hosted-platform-plan.md](../self-hosted-platform-plan.md), phase B (platform foundation), part 1.
Part 2 (WireGuard and admin firewall rules) continues in [02-wireguard-admin-access.md](02-wireguard-admin-access.md).

**Scope:** a freshly installed **plain Ubuntu 24.04 LTS** server (no application image, no Docker, no Dokploy/Coolify)
→ a hardened baseline. **Operator-run**: you type the commands, nobody else needs access to the server or your keys.

**Live status (2026-10-13):** the root key `~/.ssh/maintenance_contabo_2026`
(`SHA256:OBu+xwLMT3EoYTGdXnsN6SePz1+AnU/ol+hOUAwkJDo`) and the previously installed key
(`SHA256:URV0GRA3OsquUni+0siCjbOdxjH11zgK/06XXXR2bDs`) are recognized in root's `authorized_keys`. The exposed root
password was reset via Contabo. The `ops` account is in `sudo`; key-only login and sudo were verified. SSH hardening
is now applied and effective: `passwordauthentication no`, `kbdinteractiveauthentication no`,
`permitrootlogin without-password` (OpenSSH's canonical equivalent of `prohibit-password`), `maxauthtries 3`,
`allowusers ops`, and `allowusers root`. Key-only logins for both `ops` and `root` succeeded after the reload.
Fail2ban is enabled with an active `sshd` jail (`maxretry 5`, `findtime 600`, `bantime 600`, zero currently banned).
UFW is active with default-deny incoming and default-allow outgoing. After WireGuard was verified, public TCP 22
rules were removed for IPv4 and IPv6; the remaining host rules are SSH on `wg0`, HTTP, HTTPS, and WireGuard. A new
VPN SSH login succeeded, and an external TCP 22 probe timed out. WireGuard is active on `wg0` (`10.242.0.1/24`).
Automatic package-list updates and unattended security upgrades are enabled; the dry run found no pending upgrades,
and automatic reboot remains disabled. A 2 GiB `/swapfile` is active and `vm.swappiness` is `10`. Final Stage 9
verification passed on 2026-10-13: SSH, UFW, Fail2ban, unattended upgrades, package status, UTC synchronization,
swap, and the `ops` sudo group all matched expectations; Docker is not installed. The Contabo snapshot
`baseline-hardened-2026-10-13` was created before WireGuard configuration.

## Rules (read first)

1. **Never close your first root session until the new-login test in the same stage passes.** Every stage that can lock
   you out says so and gives a rollback.
2. Do not paste passwords, private keys or tokens anywhere (chat, tickets, repository). Public keys and command
   output without secrets are fine.
3. One stage at a time. Do not skip the verification block.
4. If anything differs from the expected output, stop and compare before continuing.

Conventions: commands marked **[Mac]** run on your laptop; **[Server]** run on the server as `root` (stages 1–2) or
`ops` with `sudo`. Set the server address and the key you intend to use before following the steps:

```
# [Mac]
read -r -p "Server IP: " SERVER_IP
export SERVER_IP
export KEY="$HOME/.ssh/maintenance_contabo_2026"
```

## Assumptions and boundaries

Treat these as explicit prerequisites, not facts inferred from a successful SSH connection. Re-check them if the
server, operator, or deployment design changes:

- This procedure targets the one existing Contabo VPS running a plain Ubuntu 24.04 LTS image. It is not a general
  installer for other providers, distributions, or a multi-server environment.
- The operator controls the Mac, the passphrase-protected SSH private key, the `ops` sudo password, and the Contabo
  account. Credentials and private keys stay local or on the server and are never put in this repository.
- The baseline is for an empty/pre-production host. It assumes no application data needs preservation and that a
  reinstall or the named provider snapshot is acceptable recovery. The snapshot is not an independent backup.
- The current intended inbound services are public HTTP (`TCP/80`), HTTPS (`TCP/443`), and WireGuard (`UDP/51820`).
  SSH (`TCP/22`) is intended only through `wg0`; do not restore a public SSH allow rule except as a temporary,
  deliberate recovery action.
- The HTTP rule assumes HTTP-01 ACME validation and/or HTTP-to-HTTPS redirection. If the deployment uses DNS-01 and
  does not need HTTP redirection, reassess whether public TCP/80 is necessary.
- The WireGuard client may roam between networks, so UDP/51820 currently assumes an unrestricted source address.
  Restrict it only if a stable client source range is established and the recovery path is understood.
- Host UFW is configured for IPv4 and IPv6, but public IPv6 assignment and Contabo's IPv6 filtering behavior have
  not been verified. Do not assume IPv6 is absent or protected until the provider panel confirms it.
- Default-deny inbound and default-allow outbound are the intended policy. Unrestricted outbound is assumed for
  package updates, DNS/time services, ACME, and later image pulls. If the provider policy is stateful or has a
  separate egress policy, verify those semantics before applying rules.
- UFW alone is not a reliable boundary for Docker-published ports: Docker may install forwarding/NAT rules that
  bypass UFW. After Docker/Coolify is installed, separately verify published ports and the provider firewall.
- Contabo publishes a Terraform provider with a `contabo_firewall` resource, so API automation is available in
  principle. This does not prove this account/VPS is eligible, that the API credentials have permission, or what the
  provider's default inbound, outbound, stateful, IPv6, or billing behavior is. Inspect those before applying
  [the firewall Terraform configuration](../../infra/contabo-firewall/README.md). The host firewall's observed
  state does not prove that a provider firewall is attached or active.

## Contabo account and initial server access (complete before Stage 0)

1. Sign in to the Contabo Customer Control Panel over HTTPS. Use a unique account password stored in a password
   manager and enable multi-factor authentication if available. This protects the provider account; it is separate
   from the VPS root password.
2. Create a passphrase-protected Ed25519 key on the Mac if you do not already have one. Choose a new filename so an
   existing key is never overwritten. Update `KEY` to that filename before continuing:

   ```
   # [Mac]
   export KEY="$HOME/.ssh/maintenance_vps_new"
   ssh-keygen -t ed25519 -a 100 -f "$KEY" -C ops@maintenance
   chmod 600 "$KEY"
   ssh-keygen -lf "$KEY.pub"
   ```

   Store the key passphrase in your password manager. It unlocks the private key on the Mac; it is not the VPS
   password. Never upload or send the private key (the file without `.pub`).
3. In the Contabo panel, open the VPS and use its SSH-key management to add/import the contents of the public
   `.pub` file. Use **Reset Credentials** for the VPS to set a new, unique root password and store it in your
   password manager. This is distinct from changing the Contabo account password. Do not paste either password into
   chat or a repository.
4. Contabo's SSH-key panel setting may not install a key into `authorized_keys` on an already-installed VPS. Do not
   assume it worked: test key-only login below. If key-only login fails but root password login still works, install
   the public key directly from the Mac (this sends only the `.pub` file and prompts for the VPS password locally):

   ```
   # [Mac]
   cat "$KEY.pub" | ssh \
     -o PubkeyAuthentication=no \
     -o PreferredAuthentications=password \
     root@"$SERVER_IP" \
     'install -d -m 700 /root/.ssh && cat >> /root/.ssh/authorized_keys && chmod 600 /root/.ssh/authorized_keys'
   ```

   Do this once per key; a duplicate authorized-key line is harmless. Never disable password login until key-only
   access and the `ops` login in Stage 3 have both been verified.
5. Set `KEY` to the key that was added and verify key-only access from the Mac. The passphrase prompt is expected;
   the VPS password prompt is not:

   ```
   # [Mac]
   ssh -i "$KEY" -o IdentitiesOnly=yes -o PreferredAuthentications=publickey \
     -o PasswordAuthentication=no -o KbdInteractiveAuthentication=no \
     root@"$SERVER_IP" 'echo KEY_LOGIN_OK'
   ```

   Keep this working access. If the test fails, stop here; do not proceed to SSH hardening or firewall changes.

## Stage 0: connect and verify the server's identity

```
# [Mac]
ssh -i "$KEY" -o IdentitiesOnly=yes root@"$SERVER_IP"
```

The first connection asks whether to trust the host key. Verify it **out-of-band** before answering `yes`; pick the
first option that is available to you:

1. **Provider VNC (if your panel offers it).** Contabo documents VNC access per server in its API (an IP and a port
   used with a VNC client, not a browser console) **[verify in your Customer Control Panel; it may need to be enabled]**.
   On the server run `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`.
2. **A second, independent network.** From a different network (for example your phone's hotspot) run on the Mac:
   `ssh-keyscan -t ed25519 "$SERVER_IP" | ssh-keygen -lf -`. The fingerprint must equal the one you see on your usual
   network. An attacker would need to sit on both paths to fake both.
3. **Accept the first connection** only if neither is possible. Key-only login limits the damage (an impostor cannot
   authenticate as you), but anything you type in that first session, such as the sudo password in stage 3, would be
   visible to an impostor, so in this case do stage 3 only after a second-network check.

The fingerprint seen when this server was installed (2026-10-13) is
`SHA256:ZWALjgWpIn0tWtGISrgWLri1xzb1hQhkUXyp4MkG18s`. (If you ever reinstall the server, the host key changes; remove
the old entry with `ssh-keygen -R "$SERVER_IP"`.)

Your key's own fingerprint, for comparison with the server's `authorized_keys`:
`ssh-keygen -lf "$KEY.pub"` on the Mac.

## Stage 1: read-only baseline (nothing is changed)

```
# [Server]
. /etc/os-release; echo "OS: $PRETTY_NAME | kernel $(uname -r)"
echo "-- docker/dokploy/coolify present?"; command -v docker || echo "no docker (expected)"; ls -d /etc/dokploy /data/coolify 2>&1 | head -2
echo "-- listening sockets"; ss -tlnp
echo "-- firewall"; ufw status
echo "-- ssh service and config"; systemctl is-active ssh; sshd -t && echo "sshd config OK"
sshd -T | grep -E '^(passwordauthentication|kbdinteractiveauthentication|pubkeyauthentication|permitrootlogin|maxauthtries|allowusers|allowgroups) '
echo "-- fail2ban"; if command -v fail2ban-client >/dev/null 2>&1; then fail2ban-client status; else echo "not installed"; fi
echo "-- cloud-init"; cloud-init status --long 2>&1 | head -4
echo "-- resources"; nproc; free -h | sed -n 1,2p; df -h / | tail -1; swapon --show
echo "-- time"; timedatectl | grep -E 'Time zone|synchronized'
echo "-- logins"; last -a | head -5
echo "-- authorized key fingerprints (root)"; ssh-keygen -lf /root/.ssh/authorized_keys
```

Expected before hardening: Ubuntu 24.04, **no Docker**, only SSH (22) and the resolver on localhost listening,
firewall inactive, `cloud-init` status `done`, and an active SSH service with a valid configuration. Compare every
fingerprint in root's `authorized_keys` with keys you recognize, including
`ssh-keygen -lf "$KEY.pub"` on the Mac. Investigate unrecognized keys, listeners, or settings before continuing.
Record the effective `sshd -T` values; the Stage 0 key-only test proves that public-key login works, but does not
prove that server-side password authentication is disabled. Stage 4 disables it and verifies the effective value.

## Stage 2: updates, packages, time zone, host name

```
# [Server]
export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a
apt-get update
apt-get -y full-upgrade
apt-get -y install unattended-upgrades ufw fail2ban curl ca-certificates gnupg wireguard
timedatectl set-timezone UTC
hostnamectl set-hostname maint-prod-01
[ -f /var/run/reboot-required ] && echo "REBOOT REQUIRED" || echo "no reboot needed"
```

If a reboot is required: `reboot`, wait about a minute, reconnect with the stage 0 command, and continue.

Verify: `apt list --upgradable 2>/dev/null | grep -vc '^Listing'` prints `0`.

## Stage 3: non-root administrator

The current server already has an `ops` account. Do not run `adduser ops` again. The block below is safe to use for
an existing account: it preserves its authorized keys, adds any recognized root keys that are missing, repairs SSH
key-file ownership and permissions, and sets the `ops` password used for `sudo`.

```
# [Server, as root]
set -eu
if ! id -u ops >/dev/null 2>&1; then
  adduser --gecos "" --disabled-password ops
fi
usermod -aG sudo ops
install -d -m 700 -o ops -g ops /home/ops/.ssh
touch /home/ops/.ssh/authorized_keys
while IFS= read -r key; do
  grep -Fqx -- "$key" /home/ops/.ssh/authorized_keys || printf '%s\n' "$key" >> /home/ops/.ssh/authorized_keys
done < /root/.ssh/authorized_keys
chown ops:ops /home/ops/.ssh/authorized_keys
chmod 600 /home/ops/.ssh/authorized_keys
ssh-keygen -lf /home/ops/.ssh/authorized_keys
passwd ops
```

`passwd ops` sets a long random password that is used **only for `sudo`** (never for SSH, which is key-only after
stage 4). Store it in your password manager. The fingerprint printed by `ssh-keygen` must equal your Mac's.

**Verify from a NEW terminal** (leave the root session open):

```
# [Mac]
ssh -t -i "$KEY" -o IdentitiesOnly=yes -o PreferredAuthentications=publickey \
  -o PasswordAuthentication=no -o KbdInteractiveAuthentication=no \
  ops@"$SERVER_IP" 'sudo -v && echo SUDO_OK'
```

Expected: it may ask for the local key passphrase, then asks for the `ops` sudo password, and prints `SUDO_OK`.
It must not ask for an SSH account password. Do not continue until this works.

## Stage 4: SSH hardening (can lock you out; keep the root session open)

```
# [Server, root session]
cat > /etc/ssh/sshd_config.d/00-hardening.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
PermitRootLogin prohibit-password
AllowUsers ops root
MaxAuthTries 3
LoginGraceTime 20
X11Forwarding no
AllowAgentForwarding no
ClientAliveInterval 300
ClientAliveCountMax 2
EOF
sshd -t && echo "sshd config OK"
sshd -T | grep -E '^(passwordauthentication|kbdinteractiveauthentication|permitrootlogin|allowusers|maxauthtries) '
```

The file is named `00-` on purpose: sshd uses the **first** value it reads, and the image ships
`50-cloud-init.conf` with `PasswordAuthentication yes`; `sshd -T` must show `passwordauthentication no`.
Before reloading, confirm the effective output shows `passwordauthentication no`,
`kbdinteractiveauthentication no`, `permitrootlogin prohibit-password` (or its canonical output
`permitrootlogin without-password`), `allowusers ops` and `allowusers root`, and `maxauthtries 3`.
If it does not match, do not reload; inspect the SSH drop-ins and correct the precedence issue first. Once all values
match, reload from the still-open root session:

```
systemctl reload ssh
```

Notes: `PermitRootLogin prohibit-password` stays because Coolify manages the host as root over SSH with a key. It is
tightened to local/Docker source addresses in part 2, after Coolify is installed.

**Verify from a NEW terminal:**

```
# [Mac]
ssh -i "$KEY" -o IdentitiesOnly=yes -o PreferredAuthentications=publickey \
  -o PasswordAuthentication=no -o KbdInteractiveAuthentication=no \
  ops@"$SERVER_IP" 'echo KEY_LOGIN_OK'
ssh -i "$KEY" -o IdentitiesOnly=yes -o PreferredAuthentications=publickey \
  -o PasswordAuthentication=no -o KbdInteractiveAuthentication=no \
  root@"$SERVER_IP" 'echo ROOT_KEY_LOGIN_OK'
ssh -o PreferredAuthentications=password -o PubkeyAuthentication=no ops@"$SERVER_IP" 'true'
```

Expected: the first two print `KEY_LOGIN_OK` and `ROOT_KEY_LOGIN_OK`; the password-only attempt fails with
`Permission denied (publickey)` (password logins are off).

**Rollback** (from the still-open root session): `rm /etc/ssh/sshd_config.d/00-hardening.conf && systemctl reload ssh`.

## Stage 5: host firewall

This is the initial-bootstrap state, before the VPN-only SSH transition in
[runbook 02](02-wireguard-admin-access.md). For the current VPS, this stage has already been completed and public
SSH has subsequently been removed. Do not rerun the temporary public-SSH allow rule unless performing an intentional
recovery while another access path is unavailable.

Keep the root session open. Before enabling UFW, confirm IPv6 filtering is enabled so the SSH listener on `[::]:22`
is protected too:

```
# [Server]
grep '^IPV6=' /etc/default/ufw
```

Expected: `IPV6=yes`. If it is not, stop and correct the UFW IPv6 setting before enabling the firewall.

```
# [Server, via sudo or root]
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH (restricted to the VPN in part 2)'
ufw allow 80/tcp comment 'HTTP: ACME challenge and redirect'
ufw allow 443/tcp comment 'HTTPS'
ufw allow 51820/udp comment 'WireGuard'
ufw --force enable
ufw status verbose
```

Expected: UFW is active and each of the four allow rules is present for IPv4 and IPv6.

**Verify from a NEW terminal:** key-only login to `ops` prints `STILL_OK`:

```
# [Mac]
ssh -i "$KEY" -o IdentitiesOnly=yes -o PreferredAuthentications=publickey \
  -o PasswordAuthentication=no -o KbdInteractiveAuthentication=no \
  ops@"$SERVER_IP" 'echo STILL_OK'
```

Rollback: `ufw disable`.

Important limitation, recorded in the plan (3.1): once Docker is installed, **published container ports bypass `ufw`**.
The Contabo firewall (part 2) and the rule "no container publishes a port except the proxy's 80/443" are the
authoritative controls; the pilot's external port scan (P2) proves it.

## Stage 6: brute-force protection

The current server already has an active `sshd` jail. Verify its effective settings before changing any Fail2ban
configuration:

```
# [Server]
systemctl is-active fail2ban
systemctl is-enabled fail2ban
fail2ban-client status sshd
fail2ban-client get sshd maxretry
fail2ban-client get sshd findtime
fail2ban-client get sshd bantime
```

If the jail is active and the thresholds are `5`, `600` seconds (10 minutes), and `600` seconds (10 minutes), leave
it unchanged. The 10-minute ban limits lockout duration for a single operator. If a setting differs or the jail is
missing, inspect the existing local configuration before editing it:

```
# [Server]
grep -RnsE '^\[sshd\]|^enabled|^backend|^maxretry|^findtime|^bantime' /etc/fail2ban/jail.local /etc/fail2ban/jail.d 2>/dev/null
```

Only if the local configuration needs correction, set the intended jail and then verify it:

```
# [Server]
cat > /etc/fail2ban/jail.d/sshd.local <<'EOF'
[sshd]
enabled = true
backend = systemd
maxretry = 5
findtime = 10m
bantime = 10m
EOF
systemctl enable --now fail2ban
fail2ban-client status sshd
fail2ban-client get sshd maxretry
fail2ban-client get sshd findtime
fail2ban-client get sshd bantime
```

Expected: the `sshd` jail is active. A nonzero banned count may be from internet scanners; review it, but do not
unban addresses unless you recognize them. Do not add a dynamic home IP to `ignoreip`.

## Stage 7: automatic security updates

```
# [Server]
dpkg-reconfigure -f noninteractive unattended-upgrades
cat /etc/apt/apt.conf.d/20auto-upgrades
grep -i 'Automatic-Reboot' /etc/apt/apt.conf.d/50unattended-upgrades
unattended-upgrade --dry-run -v
```

Expected: both `APT::Periodic` lines are `"1"`; `Automatic-Reboot` stays `"false"` (commented or false): the
server reboots only in the monthly maintenance window, never on its own.

## Stage 8: swap (a safety margin for the databases)

```
# [Server]
swapon --show   # if a swap area already exists, skip the rest of this stage
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile
grep -qE '^/swapfile[[:space:]]' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
swapon /swapfile
if [ -e /etc/sysctl.d/90-swap.conf ]; then
  echo "Existing sysctl file; inspect and preserve its other settings:"
  cat /etc/sysctl.d/90-swap.conf
else
  printf 'vm.swappiness=10\n' > /etc/sysctl.d/90-swap.conf
fi
sysctl --system >/dev/null
swapon --show
cat /proc/sys/vm/swappiness
```

Expected: `/swapfile` is active at 2G and `vm.swappiness` is `10`. If the existing sysctl file sets another value,
edit it to include `vm.swappiness=10` while preserving unrelated settings, then reapply with `sysctl --system`.

## Stage 9: final verification (paste the output for review)

Stage 9 records the bootstrap checkpoint before runbook 02 removes public SSH. Its four generic allow rules are not
the final VPN-only state; use runbook 02 for the current expected firewall rules.

```
# [Server]
echo "== ssh";     sshd -T | grep -E '^(passwordauthentication|kbdinteractiveauthentication|permitrootlogin|allowusers|maxauthtries) '
echo "== ufw";     ufw status numbered
echo "== f2b";     fail2ban-client status sshd | head -6
echo "== sockets";  ss -tlnp
echo "== updates"; systemctl is-enabled unattended-upgrades; apt list --upgradable 2>/dev/null | grep -vc '^Listing'
echo "== swap/time"; swapon --show; timedatectl | grep -E 'Time zone|synchronized'
echo "== users";    getent passwd ops | cut -d: -f1,6; id ops
echo "== docker";   command -v docker || echo "no docker (expected until Coolify)"
```

Expected: `passwordauthentication no`, `kbdinteractiveauthentication no`,
`permitrootlogin prohibit-password` or `permitrootlogin without-password`, key-only root, firewall active with
exactly the four allow rules above (for both IPv4 and IPv6), only
`22` (and localhost resolver) listening, no pending updates, swap present, time zone UTC and synchronised.

## Stage 10: baseline snapshot

In the Contabo Customer Control Panel create the VPS snapshot **`baseline-hardened-<date>`** (the plan includes one
snapshot slot). It is the rollback point before WireGuard and Coolify are installed. A snapshot lives with the same
provider account as the server, so it is a convenience, not a backup (plan 5.1). For this server,
`baseline-hardened-2026-10-13` was created before WireGuard configuration.

## Recovery if locked out

Out-of-band access is limited: Contabo has no browser console, and VNC access is available only through a VNC client
if your panel offers it **[verify]**. Since nothing of value exists on the server during this runbook, the reliable
recovery is to **reinstall from the plain Ubuntu 24.04 image with your public key** (Customer Control Panel, then
repeat this runbook). From stage 10 on, restore the `baseline-hardened` snapshot instead. This is why the rules at the
top (keep the first session open, test in a new terminal) matter.

## Hardening facts used

- Ubuntu cloud images ship `50-cloud-init.conf` with `PasswordAuthentication yes`; the earlier first-match-wins
  drop-in `00-hardening.conf` overrides it.
- Coolify connects to the host as `root` with a key (the non-root mode is experimental and needs passwordless `sudo`
  for all commands, so it adds no real protection; plan 3.3).
- Docker-published ports bypass `ufw`; see plan 3.1.
