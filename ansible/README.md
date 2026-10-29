# Ansible VPS baseline

This playbook converges the existing Contabo Ubuntu 24.04 VPS over its verified WireGuard address. It manages SSH
hardening, UFW, Fail2ban, unattended security updates, UTC, the `ops` sudo group, swap, and the WireGuard service.
It reconciles the existing `wg0` configuration while keeping the server private key on the VPS; the only peer key in
inventory is the public key. Check mode reports whether `wg0.conf` would change without displaying its contents.

It deliberately does **not** store or change passwords, SSH private keys, WireGuard private keys, or provider-account
credentials. The Contabo provider firewall is handled separately by the
[Terraform firewall configuration](../infra/contabo-firewall/README.md); its account-level API access and behavior
have not yet been validated. Creating the Contabo snapshot remains a panel operation.

## Requirements

- WireGuard tunnel connected on the Mac; SSH to `ops@10.242.0.1` succeeds.
- A supported Python and Ansible Core installation on the Mac. The Xcode-provided Python 3.9 is too old for current
  Ansible releases; install a current Python/Ansible using the official Ansible installation instructions.
- The `community.general` collection:

  ```sh
  ansible-galaxy collection install -r requirements.yml
  ```

- SSH private key unlocked locally through `ssh-agent`; Ansible never needs the passphrase in inventory.

## Review and apply

From this directory, first load the private key into the local agent. This prompts locally for its passphrase:

```sh
ssh-add "$HOME/.ssh/maintenance_contabo_2026"
ssh -o IdentitiesOnly=yes -o PreferredAuthentications=publickey \
  -o PasswordAuthentication=no ops@10.242.0.1 'echo VPN_SSH_OK'
```

Review the proposed changes before applying:

```sh
ansible-playbook bootstrap.yml --private-key "$HOME/.ssh/maintenance_contabo_2026" \
  --ask-become-pass --check --diff
```

Apply after reviewing the check-mode output:

```sh
ansible-playbook bootstrap.yml --private-key "$HOME/.ssh/maintenance_contabo_2026" \
  --ask-become-pass
```

The become password is the `ops` sudo password; enter it at the prompt, never in a file or command-line variable.
Run only while WireGuard is connected. The playbook refuses to operate against a different address or without the
expected WireGuard peer or if the on-disk server key differs from the active interface key, adds the `wg0` SSH rule
before removing public SSH, and verifies effective settings at the end. Keep a VPN SSH session open while applying.

This playbook reconciles the current host; it does not provision a VPS, reset provider credentials, create a
Contabo snapshot, or configure the Contabo panel firewall.

## Replacement VPS limitation

This playbook is **not** a clean-server bootstrap. It requires the existing WireGuard interface, address, server
key, and peer to be present and verified. A separate [first-boot WireGuard playbook](recovery-firstboot.yml) and
[recovery inventory example](inventory-recovery.example.yml) are now scaffolded. The first-boot playbook passed
Ansible Core 2.15.13 syntax-check with `community.general` 10.3.0; it has not been run against a host. Rehearse it
before relying on it for production recovery.

### Gated end-to-end infrastructure recovery

Use the [gated recovery runner](../infra/contabo-firewall/recover_contabo_vps.py) from the repository root. It
generates a temporary Ansible inventory from Terraform outputs and drives provisioning, first boot, VPN handoff,
baseline convergence, and removal of temporary provider SSH:

```sh
python3 infra/contabo-firewall/recover_contabo_vps.py \
  --image-id 'VERIFIED_UBUNTU_24_04_IMAGE_ID' \
  --bootstrap-source-cidr 'YOUR_CURRENT_PUBLIC_IPV4/32'
```

The runner requires exact interactive confirmations before billable provisioning, hardening, and firewall lockdown.
It stops for host-key verification and WireGuard profile handoff; server private keys are generated on-host and
never returned to Ansible. If interrupted, resume with `--resume`. It stops after infrastructure hardening:
Coolify, application/data restore, health verification, and DNS/TLS cutover remain operator steps in the
[recovery runbook](../docs/operations/vps-recovery.md).

For a rehearsal while the production VPS remains live, use a distinct VPN address and separate/test client profile;
never run two live servers with `10.242.0.1`. This first-boot path does not restore Coolify, databases, files, DNS, or
TLS. See the full [on-demand VPS recovery runbook](../docs/operations/vps-recovery.md).
