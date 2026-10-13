#!/usr/bin/env python3
"""Run Terraform apply with Contabo credentials entered locally and hidden."""

import os
import subprocess
import sys
from pathlib import Path

from contabo_credentials import contabo_environment, terraform_path


MODULE_DIR = Path(__file__).resolve().parent


def main():
    if not (MODULE_DIR / "terraform.tfvars").is_file():
        print(
            "terraform.tfvars is missing. Copy terraform.tfvars.example to terraform.tfvars first.",
            file=sys.stderr,
        )
        return 2

    terraform = terraform_path()
    environment = contabo_environment()
    os.umask(0o077)
    result = subprocess.run(
        [terraform, "apply"],
        cwd=MODULE_DIR,
        env=environment,
        check=False,
    )
    return result.returncode


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RuntimeError as error:
        print(error, file=sys.stderr)
        raise SystemExit(1) from error
