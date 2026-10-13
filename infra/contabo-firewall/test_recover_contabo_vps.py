import stat
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import recover_contabo_vps as recovery


class RecoveryValidationTests(unittest.TestCase):
    def test_accepts_only_a_single_ipv4_host_cidr(self):
        self.assertEqual(
            recovery.validate_source_cidr("203.0.113.7/32"),
            "203.0.113.7/32",
        )
        for value in ("203.0.113.0/24", "2001:db8::7/128", "not-a-cidr"):
            with self.subTest(value=value):
                with self.assertRaises(recovery.RecoveryError):
                    recovery.validate_source_cidr(value)

    def test_validates_optional_global_ipv6_output(self):
        self.assertIsNone(recovery.validate_public_ipv6(None))
        self.assertIsNone(recovery.validate_public_ipv6(""))
        self.assertEqual(
            recovery.validate_public_ipv6("2606:4700:4700::1111"),
            "2606:4700:4700::1111",
        )
        for value in ("2001:db8::1", "not-an-ip", 42):
            with self.subTest(value=value):
                with self.assertRaises(recovery.RecoveryError):
                    recovery.validate_public_ipv6(value)

    def test_validates_wireguard_public_key_encoding_and_size(self):
        public_key = "jZiFmiKoOTCaXULSreQdyOBWoICa4wrZXrsxH3TxN3c="
        self.assertEqual(recovery.validate_wireguard_public_key(public_key), public_key)
        for value in ("not-base64", "YQ=="):
            with self.subTest(value=value):
                with self.assertRaises(recovery.RecoveryError):
                    recovery.validate_wireguard_public_key(value)

    def test_requires_distinct_wireguard_addresses_in_the_configured_subnet(self):
        self.assertEqual(
            recovery.validate_wireguard_addresses("10.242.0.3", "10.242.0.2"),
            ("10.242.0.3", "10.242.0.2"),
        )
        for server_ip, client_ip in (
            ("10.242.0.1", "10.242.0.1"),
            ("10.242.1.1", "10.242.0.2"),
            ("not-an-ip", "10.242.0.2"),
        ):
            with self.subTest(server_ip=server_ip, client_ip=client_ip):
                with self.assertRaises(recovery.RecoveryError):
                    recovery.validate_wireguard_addresses(server_ip, client_ip)

    def test_saves_and_loads_checkpoint_with_private_permissions(self):
        session = {
            "schema_version": recovery.SESSION_VERSION,
            "phase": "wireguard",
            "inputs": {"wireguard_server_ip": "10.242.0.1"},
        }
        with tempfile.TemporaryDirectory() as temporary_directory:
            session_path = Path(temporary_directory) / ".recovery-session.json"
            with patch.object(recovery, "SESSION_FILE", session_path):
                recovery.save_session(session)
                self.assertEqual(recovery.load_session(), session)
                self.assertEqual(stat.S_IMODE(session_path.stat().st_mode), 0o600)

    def test_encodes_terraform_variables_without_shell_interpolation(self):
        arguments = recovery.terraform_var_args(
            {
                "enabled": True,
                "image_id": "image-42",
                "source_cidrs": ["203.0.113.7/32"],
            }
        )
        self.assertEqual(
            arguments,
            [
                "-var",
                "enabled=true",
                "-var",
                'image_id="image-42"',
                "-var",
                'source_cidrs=["203.0.113.7/32"]',
            ],
        )

    def test_renders_inventory_as_quoted_yaml_scalars(self):
        content = recovery.render_inventory(
            "recovery",
            "replacement",
            {
                "ansible_host": "198.51.100.12",
                "ansible_user": "root",
                "ansible_ssh_common_args": "-o HostKeyAlias=recovery-42",
            },
        )
        self.assertIn("    recovery:\n      hosts:\n        replacement:\n", content)
        self.assertIn('ansible_host: "198.51.100.12"', content)
        self.assertIn('ansible_ssh_common_args: "-o HostKeyAlias=recovery-42"', content)

    def test_allows_only_recovery_scoped_non_destructive_plan_actions(self):
        plan = {
            "resource_changes": [
                {
                    "mode": "managed",
                    "address": "contabo_instance.recovery[0]",
                    "change": {"actions": ["create"]},
                },
                {
                    "mode": "managed",
                    "address": "contabo_firewall.maintenance",
                    "change": {"actions": ["update"]},
                },
                {
                    "mode": "data",
                    "address": "data.contabo_image.recovery[0]",
                    "change": {"actions": ["read"]},
                },
            ]
        }
        recovery.validate_plan_actions(plan, "provision")
        recovery.validate_plan_actions(
            {
                "resource_changes": [
                    {
                        "mode": "managed",
                        "address": "contabo_firewall.maintenance",
                        "change": {"actions": ["update"]},
                    }
                ]
            },
            "lockdown",
        )

    def test_rejects_destroy_replace_and_unrelated_changes(self):
        plans = (
            {
                "resource_changes": [
                    {
                        "mode": "managed",
                        "address": "contabo_firewall.maintenance",
                        "change": {"actions": ["delete", "create"]},
                    }
                ]
            },
            {
                "resource_changes": [
                    {
                        "mode": "managed",
                        "address": "contabo_instance.production",
                        "change": {"actions": ["update"]},
                    }
                ]
            },
        )
        for plan in plans:
            with self.subTest(plan=plan):
                with self.assertRaises(recovery.RecoveryError):
                    recovery.validate_plan_actions(plan, "provision")


if __name__ == "__main__":
    unittest.main()
