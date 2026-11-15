#!/usr/bin/env python3
"""Owner-only runner VM lifecycle. Defaults to offline planning; NEVER activates paid generation."""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

PROJECT = "family-game-factory-jzw"
REGION = "us-east5"
ZONE = "us-east5-a"
NAME = "factory-004-ephemeral"
WORKER_SHA = "dcb887e6a51ba000fda1ccc42b9d198f8b9895f9"
REPO = "jzwyrzyk/family-game-factory"
BOOTSTRAP = Path(__file__).with_name("bootstrap.sh")
LABELS = "app=family-game-factory,assignment=004,owner-managed=true"
# A reservation + shutdown timer is defense in depth, not a replacement for explicit deletion.
MAX_LIFETIME_MIN = 90

def cmd(args, execute=False):
    if not execute:
        return args
    result = subprocess.run(args, check=True, capture_output=True, text=True)
    return result.stdout

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("action", choices=["plan", "provision", "teardown"], nargs="?", default="plan")
    p.add_argument("--authorize-billing", action="store_true", help="Explicit owner consent for a billable VM")
    p.add_argument("--trusted-workflows-reviewed", action="store_true", help="Owner confirmed untrusted workflows cannot reach this runner")
    p.add_argument("--runner-isolation-reviewed", action="store_true", help="Owner verified repo/org restrictions on allowed workflow and runner group")
    p.add_argument("--delete-confirm", choices=[NAME], help="Required to delete only this named runner VM")
    p.add_argument("--zone", default=ZONE)
    args = p.parse_args()
    if not re.fullmatch(r"us-east5-[a-c]", args.zone):
        p.error("Only us-east5 zones allowed")
    bootstrap = str(BOOTSTRAP.resolve())
    create = ["gcloud", "compute", "instances", "create", NAME,
        "--project", PROJECT, "--zone", args.zone, "--machine-type", "e2-standard-4",
        "--image-family", "ubuntu-2404-lts-amd64", "--image-project", "ubuntu-os-cloud",
        "--boot-disk-size", "40GB", "--boot-disk-type", "pd-balanced",
        "--no-service-account", "--no-scopes", "--no-address",
        "--provisioning-model", "SPOT", "--instance-termination-action", "DELETE",
        "--max-run-duration", f"{MAX_LIFETIME_MIN * 60}s",
        "--instance-termination-action", "DELETE",
        "--metadata-from-file", f"startup-script={bootstrap}", "--labels", LABELS,
        "--quiet"]
    delete = ["gcloud", "compute", "instances", "delete", NAME, "--project", PROJECT,
        "--zone", args.zone, "--quiet"]
    if args.action == "plan":
        print(json.dumps({"project": PROJECT, "region": REGION, "zone": args.zone,
            "approvedWorkerSha": WORKER_SHA, "existingServices": "untouched",
            "vm": NAME, "machine": "e2-standard-4 spot", "diskGB": 40,
            "gcpIdentity": "none", "publicIp": False, "ttlMinutes": MAX_LIFETIME_MIN,
            "createCommand": create, "deleteCommand": delete,
            "runnerRegistration": "NOT performed: requires isolated, owner-authorized JIT registration",
            "paidGeneration": False, "FACTORY_ACTIONS_APPROVED": False}, indent=2))
        return
    if args.action == "provision":
        if not (args.authorize_billing and args.trusted_workflows_reviewed and args.runner_isolation_reviewed):
            p.error("Refusing billable provisioning: explicit approval and BOTH runner trust reviews required")
        if not BOOTSTRAP.is_file():
            p.error("Bootstrap missing")
        print("Owner-authorized VM provisioning; runner NOT registered. No existing Cloud Run service touched.")
        cmd(create, True)
        print("VM created; check startup logs, runner restriction and 20 GiB disk gate before owner-run JIT registration.")
    else:
        if args.delete_confirm != NAME:
            p.error("Teardown requires --delete-confirm " + NAME)
        cmd(delete, True)
        print("VM deletion requested; verify removal and unattached disks in Google Cloud console.")

if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError:
        print("GCP command failed; inspect project and VM metadata, not secrets, then teardown if needed.", file=sys.stderr)
        sys.exit(1)
