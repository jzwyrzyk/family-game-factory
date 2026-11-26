#!/usr/bin/env python3
"""Prepare the public IAP commitment and the private GitHub environment secret."""
import argparse
from getpass import getpass
import hashlib
import json
import os
from pathlib import Path
import secrets
import sys

import cloud


def prepare(config, addresses):
    members = ["user:" + address.strip() for address in addresses.split(",")]
    private_value = json.dumps({"nonce": secrets.token_hex(32), "members": members},
                               separators=(",", ":"))
    public = {**config, "ownerIapMembers": [],
              "ownerIapBindingSha256": hashlib.sha256(private_value.encode()).hexdigest()}
    cloud.bind_private_members(public, private_value)
    return public, private_value


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("proposal", type=Path, help="Enabled, identifier-bound configuration with an empty ownerIapMembers")
    parser.add_argument("output", type=Path, help="New private output directory")
    args = parser.parse_args()
    try:
        config = json.loads(args.proposal.read_text())
        if config.get("ownerIapMembers") != [] or config.get("ownerIapBindingSha256") is not None:
            raise ValueError("Unexpected populated proposal")
        public, secret = prepare(config, getpass("Approved adult email addresses, comma separated: "))
        args.output.mkdir(mode=0o700)
        for name, value in (("environments.json", json.dumps(public, indent=2) + "\n"),
                            ("iap-binding.json", secret)):
            with os.fdopen(os.open(args.output / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w") as f:
                f.write(value)
    except (cloud.EnvironmentError, OSError, ValueError, TypeError, EOFError):
        sys.exit("IAP_BINDING_PREPARATION_FAILED")
    print("Prepared environments.json for protected review and iap-binding.json for the protected environment secret.")


if __name__ == "__main__":
    main()
