"""Local Contabo credential prompts and Terraform setup shared by operator tools."""

import getpass
import os
import shutil
from pathlib import Path


CREDENTIAL_PROMPTS = (
    ("CNTB_OAUTH2_CLIENT_ID", "Contabo API client ID: ", False),
    ("CNTB_OAUTH2_CLIENT_SECRET", "Contabo API client secret: ", True),
    ("CNTB_OAUTH2_USER", "Contabo API user: ", False),
    ("CNTB_OAUTH2_PASS", "Contabo API password: ", True),
)


def terraform_path():
    path = shutil.which("terraform")
    if path:
        return path

    local_path = Path.home() / ".local" / "bin" / "terraform"
    if local_path.is_file() and os.access(local_path, os.X_OK):
        return str(local_path)
    raise RuntimeError("Terraform was not found on PATH or at ~/.local/bin/terraform.")


def contabo_environment():
    environment = os.environ.copy()
    for variable, prompt, hidden in CREDENTIAL_PROMPTS:
        if environment.get(variable, "").strip():
            continue
        value = getpass.getpass(prompt) if hidden else input(prompt)
        if not value.strip():
            raise RuntimeError("All four Contabo API credentials are required.")
        environment[variable] = value.strip()

    cache_dir = Path.home() / ".cache" / "contabo" / "terraform"
    cache_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(cache_dir.parent, 0o700)
    os.chmod(cache_dir, 0o700)
    token_file = cache_dir / "token"
    if token_file.exists():
        os.chmod(token_file, 0o600)

    return environment
