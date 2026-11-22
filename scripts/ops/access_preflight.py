#!/usr/bin/env python3
"""Check a pinned local checkout and tools before read-only Jems account planning."""

import argparse
import json
from pathlib import Path
import re
import shutil

from admin_api import SetupError, command

ROOT = Path(__file__).resolve().parents[2]
SHA = re.compile(r"[a-f0-9]{40}")


def inspect(expected_head, *, with_drill=False, root=ROOT):
    """Use local git reads only; never start authentication or contact a service."""
    tools = {name: shutil.which(name) is not None for name in ("python3", "git", "gh", "gcloud", "docker")}
    required = ("python3", "git", "gh", "gcloud") + (("docker",) if with_drill else ())
    blockers = [f"Required tool unavailable: {name}" for name in required if not tools[name]]
    source = {"expected_head": expected_head, "local_head": None, "clean": None,
              "current_pr107_head": "not_checked_locally"}
    if not SHA.fullmatch(expected_head):
        blockers.append("Use the complete reviewed 40-character lowercase commit SHA")
    elif tools["git"]:
        try:
            source["local_head"] = command(["git", "-C", str(root), "rev-parse", "HEAD"])
            if source["local_head"] != expected_head:
                blockers.append("Local checkout does not match the reviewed source SHA")
            source["clean"] = not bool(command([
                "git", "-C", str(root), "status", "--porcelain", "--untracked-files=all"
            ]))
            if not source["clean"]:
                blockers.append("Use a clean pinned checkout; local changes or untracked files are present")
        except SetupError:
            blockers.append("Could not verify the local checkout")
    return {
        "operation": "READ_ONLY_LOCAL_PREFLIGHT",
        "ready_for_account_plan": not blockers,
        "activation_ready": False,
        "source": source,
        "tools_present": tools,
        "blockers": blockers,
        "unverified": [
            "Current remote PR107 head, required checks and GitHub account protections",
            "Existing GitHub administrator and Google Cloud authentication",
            "Effective cloud permissions, including inherited grants and deny policies",
            "Cloud resources, production state, logging privacy and isolated drill",
            "Docker daemon availability" if with_drill else "Docker is optional until the isolated live drill is planned",
            "Network access from the published Codex environment",
        ],
        "next_read_only_command": "python3 scripts/ops/admin_setup.py plan" if not blockers else None,
        "note": "The account plan independently verifies the exact current draft PR107 head. This local check neither reads credential values nor invokes authentication, cloud APIs, workflow dispatches or apply modes.",
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--expected-head", required=True)
    parser.add_argument("--with-drill", action="store_true", help="Require the Docker command for a later isolated drill")
    args = parser.parse_args()
    result = inspect(args.expected_head, with_drill=args.with_drill)
    print(json.dumps(result, indent=2, sort_keys=True))
    if not result["ready_for_account_plan"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
