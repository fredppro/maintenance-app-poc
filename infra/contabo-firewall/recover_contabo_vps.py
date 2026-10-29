#!/usr/bin/env python3
"""Run the on-demand Contabo recovery workflow with explicit operator gates."""

import argparse
import base64
import binascii
import ipaddress
import json
import os
import re
import shlex
import shutil
import socket
import subprocess
import sys
import tempfile
from pathlib import Path

from contabo_credentials import contabo_environment, terraform_path


MODULE_DIR = Path(__file__).resolve().parent
REPOSITORY_DIR = MODULE_DIR.parents[1]
ANSIBLE_DIR = REPOSITORY_DIR / "ansible"
FIRSTBOOT_PLAYBOOK = ANSIBLE_DIR / "recovery-firstboot.yml"
BASELINE_PLAYBOOK = ANSIBLE_DIR / "bootstrap.yml"
RECOVERY_INVENTORY_EXAMPLE = ANSIBLE_DIR / "inventory-recovery.example.yml"
BASELINE_INVENTORY = ANSIBLE_DIR / "inventory.yml"
SESSION_FILE = MODULE_DIR / ".recovery-session.json"
SESSION_VERSION = 1
SERVER_IP_DEFAULT = "10.242.0.1"
CLIENT_IP_DEFAULT = "10.242.0.2"
WIREGUARD_NETWORK = ipaddress.IPv4Network("10.242.0.0/24")
HOSTNAME_DEFAULT = "maint-prod-01"
EXPECTED_PLAN_ACTIONS = {
    "provision": {
        "contabo_instance.recovery": {("create",), ("no-op",)},
        "contabo_firewall.maintenance": {("update",), ("no-op",)},
    },
    "lockdown": {
        "contabo_instance.recovery": {("no-op",)},
        "contabo_firewall.maintenance": {("update",), ("no-op",)},
    },
}


class RecoveryError(Exception):
    """A recovery precondition or operation failed."""


class SafeStop(Exception):
    """The operator declined an explicit action."""


def validate_source_cidr(value):
    try:
        network = ipaddress.ip_network(value, strict=True)
    except ValueError as error:
        raise RecoveryError("Bootstrap source must be a valid IPv4 /32 CIDR.") from error
    if not isinstance(network, ipaddress.IPv4Network) or network.prefixlen != 32:
        raise RecoveryError("Bootstrap source must be exactly one IPv4 /32 CIDR.")
    return str(network)


def validate_public_ipv6(value):
    if value is None or value == "":
        return None
    if not isinstance(value, str):
        raise RecoveryError("Terraform recovery_public_ipv6 was not a string.")
    try:
        address = ipaddress.IPv6Address(value)
    except ValueError as error:
        raise RecoveryError("Terraform recovery_public_ipv6 was not a valid IPv6 address.") from error
    if not address.is_global:
        raise RecoveryError("Terraform recovery_public_ipv6 was not a global IPv6 address.")
    return str(address)


def validate_wireguard_public_key(value):
    if not isinstance(value, str):
        raise RecoveryError("The WireGuard client public key must be a string.")
    try:
        decoded = base64.b64decode(value, validate=True)
    except (ValueError, binascii.Error) as error:
        raise RecoveryError("The WireGuard client public key must be valid base64.") from error
    if len(decoded) != 32:
        raise RecoveryError("The WireGuard client public key must decode to 32 bytes.")
    return value


def validate_wireguard_addresses(server_ip, client_ip):
    try:
        server = ipaddress.IPv4Address(server_ip)
        client = ipaddress.IPv4Address(client_ip)
    except ValueError as error:
        raise RecoveryError("WireGuard server and client addresses must be valid IPv4 addresses.") from error
    if server not in WIREGUARD_NETWORK or client not in WIREGUARD_NETWORK or server == client:
        raise RecoveryError(
            "WireGuard server and client addresses must be distinct usable addresses in 10.242.0.0/24."
        )
    return str(server), str(client)


def terraform_var_args(values):
    result = []
    for name, value in values.items():
        if isinstance(value, bool):
            encoded = "true" if value else "false"
        else:
            encoded = json.dumps(value)
        result.extend(["-var", f"{name}={encoded}"])
    return result


def render_inventory(group, host, host_vars):
    lines = ["all:", "  children:", f"    {group}:", "      hosts:", f"        {host}:"]
    lines.extend(
        f"          {name}: {json.dumps(str(value))}"
        for name, value in host_vars.items()
    )
    return "\n".join(lines) + "\n"


def validate_plan_actions(plan, stage):
    allowed = EXPECTED_PLAN_ACTIONS[stage]
    unexpected = []
    for change in plan.get("resource_changes", []):
        if change.get("mode") != "managed":
            continue
        address = change.get("address", "").split("[", 1)[0]
        actions = tuple(change.get("change", {}).get("actions", ()))
        if actions == ("no-op",):
            continue
        if address not in allowed or actions not in allowed[address]:
            unexpected.append(f"{change.get('address')}: {list(actions)}")
    if unexpected:
        raise RecoveryError(
            "Terraform plan includes changes outside the reviewed recovery scope: "
            + "; ".join(unexpected)
        )


def run_command(argv, cwd, env=None, capture_output=False):
    try:
        result = subprocess.run(
            [str(argument) for argument in argv],
            cwd=str(cwd),
            env=env,
            check=False,
            text=True,
            capture_output=capture_output,
        )
    except FileNotFoundError as error:
        raise RecoveryError(f"Required command was not found: {argv[0]}") from error

    if result.returncode != 0:
        if capture_output and result.stderr:
            print(result.stderr, file=sys.stderr, end="")
        raise RecoveryError(f"Command failed with exit code {result.returncode}: {argv[0]}")
    return result.stdout if capture_output else ""


def save_session(session):
    SESSION_FILE.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    temporary_path = SESSION_FILE.with_name(SESSION_FILE.name + ".tmp")
    with temporary_path.open("w", encoding="utf-8") as session_file:
        os.fchmod(session_file.fileno(), 0o600)
        json.dump(session, session_file, indent=2)
        session_file.write("\n")
        session_file.flush()
        os.fsync(session_file.fileno())
    os.replace(temporary_path, SESSION_FILE)
    os.chmod(SESSION_FILE, 0o600)


def load_session():
    try:
        session = json.loads(SESSION_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise RecoveryError(f"Cannot read recovery session file {SESSION_FILE}.") from error
    if session.get("schema_version") != SESSION_VERSION:
        raise RecoveryError("Recovery session file has an unsupported schema version.")
    return session


def prompt_exact(message, expected):
    response = input(f"{message}\nType {expected} to continue: ").strip()
    if response != expected:
        raise SafeStop("No further changes made in this phase; the recovery session can be resumed.")


def make_arguments():
    parser = argparse.ArgumentParser(
        description=(
            "Provision and configure an on-demand Contabo replacement VPS. "
            "Every billable or access-changing action has an explicit approval gate."
        )
    )
    parser.add_argument("--resume", action="store_true", help="Continue the saved local recovery session.")
    parser.add_argument("--image-id", help="Verified Contabo standard Ubuntu 24.04 image ID.")
    parser.add_argument(
        "--bootstrap-source-cidr",
        help="Current operator public IPv4 /32 allowed for temporary SSH.",
    )
    parser.add_argument(
        "--ssh-private-key",
        default=str(Path.home() / ".ssh" / "maintenance_contabo_2026"),
        help="Local SSH private-key path (used locally only).",
    )
    parser.add_argument(
        "--ssh-public-key",
        help="Public SSH key path; defaults to PRIVATE_KEY.pub.",
    )
    parser.add_argument(
        "--wireguard-server-ip",
        default=SERVER_IP_DEFAULT,
        help="Replacement WireGuard server address (default: 10.242.0.1).",
    )
    parser.add_argument(
        "--wireguard-client-ip",
        default=CLIENT_IP_DEFAULT,
        help="Mac WireGuard client address (default: 10.242.0.2).",
    )
    parser.add_argument(
        "--hostname",
        default=HOSTNAME_DEFAULT,
        help="Replacement host name (default: maint-prod-01).",
    )
    return parser


def collect_inputs(arguments, ansible_inventory, env):
    if not arguments.image_id:
        raise RecoveryError("--image-id is required for a new recovery session.")
    if not arguments.bootstrap_source_cidr:
        raise RecoveryError("--bootstrap-source-cidr is required for a new recovery session.")

    private_key = Path(arguments.ssh_private_key).expanduser().resolve()
    public_key = Path(arguments.ssh_public_key).expanduser().resolve() if arguments.ssh_public_key else Path(
        str(private_key) + ".pub"
    )
    if not private_key.is_file():
        raise RecoveryError(f"SSH private key does not exist: {private_key}")
    if not public_key.is_file():
        raise RecoveryError(f"SSH public key does not exist: {public_key}")
    if private_key == public_key:
        raise RecoveryError("The SSH public-key path must not be the private-key path.")
    public_key_line = public_key.read_text(encoding="utf-8").strip()
    if not public_key_line.startswith("ssh-ed25519 "):
        raise RecoveryError("The recovery bootstrap currently requires an Ed25519 public SSH key.")

    wg_inventory = run_command(
        [
            shutil.which("ansible-inventory"),
            "-i",
            BASELINE_INVENTORY,
            "--host",
            "maintenance-vps",
        ],
        cwd=ANSIBLE_DIR,
        env=env,
        capture_output=True,
    )
    try:
        wireguard_client_public_key = json.loads(wg_inventory)["wireguard_client_public_key"]
    except (json.JSONDecodeError, KeyError, TypeError) as error:
        raise RecoveryError(
            "Could not read wireguard_client_public_key from the existing Ansible inventory."
        ) from error

    server_ip, client_ip = validate_wireguard_addresses(
        arguments.wireguard_server_ip,
        arguments.wireguard_client_ip,
    )

    inputs = {
        "image_id": arguments.image_id.strip(),
        "bootstrap_source_cidr": validate_source_cidr(arguments.bootstrap_source_cidr.strip()),
        "ssh_private_key": str(private_key),
        "ssh_public_key": str(public_key),
        "wireguard_server_ip": server_ip,
        "wireguard_client_ip": client_ip,
        "wireguard_client_public_key": validate_wireguard_public_key(wireguard_client_public_key),
        "hostname": arguments.hostname.strip(),
    }
    if not inputs["image_id"]:
        raise RecoveryError("Image ID must not be blank.")
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9-]{0,62}", inputs["hostname"]):
        raise RecoveryError("Hostname must contain only letters, numbers, and internal hyphens.")
    return inputs


def tool_environment():
    environment = os.environ.copy()
    environment["ANSIBLE_CONFIG"] = str(ANSIBLE_DIR / "ansible.cfg")
    return environment


def preflight(terraform, ansible_playbook, ansible_inventory):
    if not (MODULE_DIR / "terraform.tfvars").is_file():
        raise RecoveryError(
            "terraform.tfvars is missing. Copy terraform.tfvars.example and verify the existing VPS inputs first."
        )
    for required_path in (FIRSTBOOT_PLAYBOOK, BASELINE_PLAYBOOK, RECOVERY_INVENTORY_EXAMPLE):
        if not required_path.is_file():
            raise RecoveryError(f"Required recovery file is missing: {required_path}")

    environment = tool_environment()
    run_command([terraform, "fmt", "-check"], cwd=MODULE_DIR, env=environment)
    run_command([terraform, "init", "-input=false"], cwd=MODULE_DIR, env=environment)
    run_command([terraform, "validate"], cwd=MODULE_DIR, env=environment)
    run_command(
        [
            ansible_playbook,
            "-i",
            RECOVERY_INVENTORY_EXAMPLE,
            "--syntax-check",
            FIRSTBOOT_PLAYBOOK,
        ],
        cwd=ANSIBLE_DIR,
        env=environment,
    )
    run_command(
        [
            ansible_playbook,
            "-i",
            BASELINE_INVENTORY,
            "--syntax-check",
            BASELINE_PLAYBOOK,
        ],
        cwd=ANSIBLE_DIR,
        env=environment,
    )
    run_command(
        [ansible_inventory, "-i", BASELINE_INVENTORY, "--list"],
        cwd=ANSIBLE_DIR,
        env=environment,
        capture_output=True,
    )


def validate_saved_session(session):
    required_fields = {
        "image_id",
        "bootstrap_source_cidr",
        "ssh_private_key",
        "ssh_public_key",
        "wireguard_server_ip",
        "wireguard_client_ip",
        "wireguard_client_public_key",
        "hostname",
    }
    inputs = session.get("inputs")
    if not isinstance(inputs, dict) or not required_fields.issubset(inputs):
        raise RecoveryError("Saved recovery session is missing required inputs.")
    validate_source_cidr(inputs["bootstrap_source_cidr"])
    validate_wireguard_public_key(inputs["wireguard_client_public_key"])
    for key_name in ("ssh_private_key", "ssh_public_key"):
        if not Path(inputs[key_name]).is_file():
            raise RecoveryError(f"Saved session SSH key file is missing: {inputs[key_name]}")
    validate_wireguard_addresses(inputs["wireguard_server_ip"], inputs["wireguard_client_ip"])
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9-]{0,62}", inputs["hostname"]):
        raise RecoveryError("Saved recovery hostname is invalid.")


def terraform_values(inputs, bootstrap_enabled):
    return {
        "recovery_instance_enabled": True,
        "recovery_instance_image_id": inputs["image_id"],
        "recovery_ssh_public_key_path": inputs["ssh_public_key"],
        "bootstrap_ssh_enabled": bootstrap_enabled,
        "bootstrap_ssh_ipv4_source_cidrs": [inputs["bootstrap_source_cidr"]],
    }


def review_and_apply(terraform, environment, inputs, stage):
    terraform_values_map = terraform_values(inputs, bootstrap_enabled=stage == "provision")
    with tempfile.TemporaryDirectory(prefix=".recovery-plan-", dir=MODULE_DIR) as temporary_dir:
        os.chmod(temporary_dir, 0o700)
        plan_path = Path(temporary_dir) / "reviewed.tfplan"
        run_command(
            [
                terraform,
                "plan",
                "-input=false",
                "-no-color",
                "-out",
                plan_path,
                *terraform_var_args(terraform_values_map),
            ],
            cwd=MODULE_DIR,
            env=environment,
        )
        plan_json = run_command(
            [terraform, "show", "-json", plan_path],
            cwd=MODULE_DIR,
            env=environment,
            capture_output=True,
        )
        try:
            plan = json.loads(plan_json)
        except json.JSONDecodeError as error:
            raise RecoveryError("Terraform returned an unreadable plan; refusing to apply it.") from error
        validate_plan_actions(plan, stage)

        print("\nReview the complete Terraform plan below.")
        run_command([terraform, "show", "-no-color", plan_path], cwd=MODULE_DIR, env=environment)
        if stage == "provision":
            prompt_exact(
                "This plan may create a billable Contabo VPS and change the shared firewall.",
                "CREATE",
            )
        else:
            prompt_exact(
                "This plan removes temporary public SSH access. Confirm VPN SSH has already passed.",
                "LOCKDOWN",
            )
        run_command(
            [terraform, "apply", "-input=false", plan_path],
            cwd=MODULE_DIR,
            env=environment,
        )


def terraform_output(terraform, environment, name):
    return run_command(
        [terraform, "output", "-raw", name],
        cwd=MODULE_DIR,
        env=environment,
        capture_output=True,
    ).strip()


def terraform_output_json(terraform, environment, name):
    output = run_command(
        [terraform, "output", "-json", name],
        cwd=MODULE_DIR,
        env=environment,
        capture_output=True,
    )
    try:
        return json.loads(output)
    except json.JSONDecodeError as error:
        raise RecoveryError(f"Terraform returned invalid JSON for output {name}.") from error


def host_alias(instance_id):
    safe_id = re.sub(r"[^A-Za-z0-9-]", "-", instance_id)
    return f"maintenance-recovery-{safe_id}"


def ssh_command(
    inputs,
    host,
    username,
    remote_command,
    alias,
    allocate_tty=False,
    strict_host_key="yes",
):
    command = [
        "ssh",
        "-i",
        inputs["ssh_private_key"],
        "-o",
        "IdentitiesOnly=yes",
        "-o",
        "PreferredAuthentications=publickey",
        "-o",
        "PasswordAuthentication=no",
        "-o",
        "KbdInteractiveAuthentication=no",
        "-o",
        f"StrictHostKeyChecking={strict_host_key}",
        "-o",
        f"HostKeyAlias={alias}",
    ]
    if allocate_tty:
        command.append("-tt")
    command.extend([f"{username}@{host}", remote_command])
    return command


def verify_ssh(inputs, host, username, alias, expected_output):
    output = run_command(
        ssh_command(inputs, host, username, "printf '%s' " + shlex.quote(expected_output), alias),
        cwd=REPOSITORY_DIR,
        capture_output=True,
    ).strip()
    if output != expected_output:
        raise RecoveryError(f"SSH verification returned unexpected output from {username}@{host}.")


def write_temporary_inventory(directory, group, host, host_vars):
    inventory_path = Path(directory) / "inventory.yml"
    inventory_path.write_text(render_inventory(group, host, host_vars), encoding="utf-8")
    os.chmod(inventory_path, 0o600)
    return inventory_path


def run_firstboot(ansible_playbook, inputs, session):
    instance_id = session["instance_id"]
    alias = host_alias(instance_id)
    host_vars = {
        "ansible_host": session["public_ipv4"],
        "ansible_user": "root",
        "ansible_ssh_private_key_file": inputs["ssh_private_key"],
        "ansible_ssh_common_args": (
            f"-o HostKeyAlias={alias} -o StrictHostKeyChecking=yes -o IdentitiesOnly=yes"
        ),
        "recovery_public_ipv4": session["public_ipv4"],
        "recovery_hostname": inputs["hostname"],
        "bootstrap_ssh_source_cidr": inputs["bootstrap_source_cidr"],
        "operator_ssh_public_key_path": inputs["ssh_public_key"],
        "wireguard_server_ip": inputs["wireguard_server_ip"],
        "wireguard_client_ip": inputs["wireguard_client_ip"],
        "wireguard_client_public_key": inputs["wireguard_client_public_key"],
    }
    with tempfile.TemporaryDirectory(prefix="contabo-recovery-inventory-") as temporary_dir:
        inventory = write_temporary_inventory(temporary_dir, "recovery", "replacement", host_vars)
        run_command(
            [ansible_playbook, "-i", inventory, "--syntax-check", FIRSTBOOT_PLAYBOOK],
            cwd=ANSIBLE_DIR,
            env=tool_environment(),
        )
        run_command(
            [ansible_playbook, "-i", inventory, FIRSTBOOT_PLAYBOOK],
            cwd=ANSIBLE_DIR,
            env=tool_environment(),
        )
    public_key = run_command(
        ssh_command(
            inputs,
            session["public_ipv4"],
            "root",
            "cat /etc/wireguard/server_public.key",
            alias,
        ),
        cwd=REPOSITORY_DIR,
        capture_output=True,
    ).strip()
    validate_wireguard_public_key(public_key)
    return public_key


def update_session(session, phase, **values):
    session["phase"] = phase
    session.update(values)
    save_session(session)


def run_baseline(ansible_playbook, inputs, session):
    alias = host_alias(session["instance_id"])
    host_vars = {
        "ansible_host": inputs["wireguard_server_ip"],
        "ansible_user": "ops",
        "ansible_ssh_private_key_file": inputs["ssh_private_key"],
        "ansible_ssh_common_args": (
            f"-o HostKeyAlias={alias} -o StrictHostKeyChecking=yes -o IdentitiesOnly=yes"
        ),
        "wireguard_client_public_key": inputs["wireguard_client_public_key"],
    }
    extra_vars = {
        "expected_host": inputs["wireguard_server_ip"],
        "expected_hostname": inputs["hostname"],
        "wireguard_server_ip": inputs["wireguard_server_ip"],
        "wireguard_client_ip": inputs["wireguard_client_ip"],
        "wireguard_client_public_key": inputs["wireguard_client_public_key"],
    }
    with tempfile.TemporaryDirectory(prefix="contabo-recovery-inventory-") as temporary_dir:
        inventory = write_temporary_inventory(temporary_dir, "maintenance", "replacement", host_vars)
        common_args = [
            ansible_playbook,
            "-i",
            inventory,
            "--private-key",
            inputs["ssh_private_key"],
            "--extra-vars",
            json.dumps(extra_vars),
        ]
        run_command(
            [ansible_playbook, "-i", inventory, "--syntax-check", BASELINE_PLAYBOOK],
            cwd=ANSIBLE_DIR,
            env=tool_environment(),
        )
        print("\nReview the Ansible check-mode changes before applying the baseline.")
        run_command(
            [
                *common_args,
                "--ask-become-pass",
                "--check",
                "--diff",
                BASELINE_PLAYBOOK,
            ],
            cwd=ANSIBLE_DIR,
            env=tool_environment(),
        )
        prompt_exact(
            "Apply the existing Ansible hardening baseline over the verified WireGuard connection.",
            "APPLY_BASELINE",
        )
        run_command(
            [*common_args, "--ask-become-pass", BASELINE_PLAYBOOK],
            cwd=ANSIBLE_DIR,
            env=tool_environment(),
        )


def probe_public_ssh_blocked(public_ipv4, public_ipv6=None):
    targets = [("IPv4", (str(ipaddress.IPv4Address(public_ipv4)), 22))]
    if public_ipv6:
        targets.append(("IPv6", (str(ipaddress.IPv6Address(public_ipv6)), 22, 0, 0)))
    else:
        print("No recovery public IPv6 address was assigned; skipping the IPv6 TCP/22 probe.")

    for family, address in targets:
        try:
            with socket.create_connection(address, timeout=5):
                raise RecoveryError(
                    f"Public TCP/22 is reachable over {family} after lockdown; "
                    "keep the service off production and investigate."
                )
        except OSError:
            print(
                f"Public TCP/22 did not connect over {family} from this operator network; "
                "this does not prove that the network had a working route."
            )


def run_workflow(session, terraform, ansible_playbook, environment):
    inputs = session["inputs"]

    while True:
        phase = session["phase"]
        if phase == "provision":
            review_and_apply(terraform, environment, inputs, "provision")
            instance_id = terraform_output(terraform, environment, "recovery_instance_id")
            public_ipv4 = terraform_output(terraform, environment, "recovery_public_ipv4")
            try:
                address = ipaddress.IPv4Address(public_ipv4)
            except ValueError as error:
                raise RecoveryError("Terraform did not return a valid recovery public IPv4.") from error
            if not address.is_global:
                raise RecoveryError("Terraform recovery_public_ipv4 was not a global IPv4 address.")
            public_ipv6 = validate_public_ipv6(
                terraform_output_json(terraform, environment, "recovery_public_ipv6")
            )
            if not instance_id:
                raise RecoveryError("Terraform did not return a recovery instance ID.")
            update_session(
                session,
                "host_key",
                instance_id=instance_id,
                public_ipv4=str(address),
                public_ipv6=public_ipv6,
            )
            continue

        if phase == "host_key":
            alias = host_alias(session["instance_id"])
            manual_command = ssh_command(
                inputs,
                session["public_ipv4"],
                "root",
                "echo HOST_SSH_OK",
                alias,
                strict_host_key="ask",
            )
            print(
                "\nVerify the server's SSH host-key fingerprint through the trusted provider console. "
                "Then run this command and accept the key only if it matches:"
            )
            print(shlex.join(manual_command))
            prompt_exact("Confirm the public-IP SSH host key was verified and accepted.", "HOST_KEY_VERIFIED")
            verify_ssh(
                inputs,
                session["public_ipv4"],
                "root",
                alias,
                "HOST_SSH_OK",
            )
            update_session(session, "firstboot")
            continue

        if phase == "firstboot":
            server_public_key = run_firstboot(ansible_playbook, inputs, session)
            update_session(session, "wireguard", wireguard_server_public_key=server_public_key)
            continue

        if phase == "wireguard":
            print("\nAdd/update the Mac WireGuard peer locally; do not share its private key.")
            print(f"Server public key: {session['wireguard_server_public_key']}")
            print(f"Endpoint: {session['public_ipv4']}:51820")
            print(f"Server tunnel address: {inputs['wireguard_server_ip']}/32")
            print(
                "For a real failover, replace the old server peer only after the old host is offline. "
                "For a rehearsal, use a separate profile and a distinct tunnel address."
            )
            prompt_exact("Activate the updated WireGuard profile.", "VPN_PROFILE_UPDATED")
            verify_ssh(
                inputs,
                inputs["wireguard_server_ip"],
                "root",
                host_alias(session["instance_id"]),
                "VPN_SSH_OK",
            )
            update_session(session, "ops_password")
            continue

        if phase == "ops_password":
            print("\nSet the ops password interactively over the verified WireGuard tunnel.")
            run_command(
                ssh_command(
                    inputs,
                    inputs["wireguard_server_ip"],
                    "root",
                    "passwd ops",
                    host_alias(session["instance_id"]),
                    allocate_tty=True,
                ),
                cwd=REPOSITORY_DIR,
            )
            verify_ssh(
                inputs,
                inputs["wireguard_server_ip"],
                "ops",
                host_alias(session["instance_id"]),
                "OPS_SSH_OK",
            )
            update_session(session, "baseline")
            continue

        if phase == "baseline":
            run_baseline(ansible_playbook, inputs, session)
            update_session(session, "lockdown")
            continue

        if phase == "lockdown":
            review_and_apply(terraform, environment, inputs, "lockdown")
            verify_ssh(
                inputs,
                inputs["wireguard_server_ip"],
                "ops",
                host_alias(session["instance_id"]),
                "VPN_SSH_OK",
            )
            probe_public_ssh_blocked(
                session["public_ipv4"],
                session.get("public_ipv6"),
            )
            update_session(session, "infrastructure_locked")
            continue

        if phase == "infrastructure_locked":
            print(
                "\nInfrastructure recovery is complete. Application deployment, database/file restoration, "
                "health checks, and DNS/TLS cutover remain operator steps; follow "
                "docs/operations/vps-recovery.md."
            )
            update_session(session, "complete")
            continue

        if phase == "complete":
            print(
                "Infrastructure recovery gates completed. Do not route production traffic until data restore, "
                "application health, and DNS/TLS checks in the runbook pass."
            )
            return

        raise RecoveryError(f"Unknown recovery phase in session file: {phase}")


def main(argv=None):
    parser = make_arguments()
    arguments = parser.parse_args(argv)
    if arguments.resume and (arguments.image_id or arguments.bootstrap_source_cidr):
        parser.error("Do not override recovery inputs when using --resume.")
    if not arguments.resume and (not arguments.image_id or not arguments.bootstrap_source_cidr):
        parser.error("A new recovery session requires --image-id and --bootstrap-source-cidr.")

    terraform = terraform_path()
    ansible_playbook = shutil.which("ansible-playbook")
    ansible_inventory = shutil.which("ansible-inventory")
    if not ansible_playbook or not ansible_inventory:
        raise RecoveryError("Install Ansible Core before starting VPS provisioning.")
    if not shutil.which("ssh"):
        raise RecoveryError("OpenSSH client was not found on PATH.")

    os.umask(0o077)
    environment = tool_environment()
    if arguments.resume:
        if not SESSION_FILE.is_file():
            raise RecoveryError(f"No saved recovery session exists at {SESSION_FILE}.")
        session = load_session()
        validate_saved_session(session)
    else:
        session = None
        if SESSION_FILE.exists():
            raise RecoveryError(
                f"A recovery session already exists at {SESSION_FILE}; use --resume or inspect it before proceeding."
            )

    preflight(terraform, ansible_playbook, ansible_inventory)
    if session is None:
        inputs = collect_inputs(arguments, ansible_inventory, environment)
        provider_environment = contabo_environment()
        session = {
            "schema_version": SESSION_VERSION,
            "phase": "provision",
            "inputs": inputs,
        }
        save_session(session)
    else:
        provider_environment = None

    if session["phase"] in ("provision", "lockdown"):
        if provider_environment is None:
            provider_environment = contabo_environment()
        environment = provider_environment
    run_workflow(session, terraform, ansible_playbook, environment)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SafeStop as error:
        print(error)
        raise SystemExit(0)
    except (RecoveryError, OSError, RuntimeError) as error:
        print(f"Recovery stopped safely: {error}", file=sys.stderr)
        print("If the local session was saved, continue with --resume after resolving the issue.", file=sys.stderr)
        raise SystemExit(1) from error
