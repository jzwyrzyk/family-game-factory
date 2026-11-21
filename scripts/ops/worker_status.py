#!/usr/bin/env python3
"""Read bounded worker workflow status without fetching Actions logs or artifacts."""
import argparse
from collections import Counter
import json
import subprocess

REPOSITORY = "family-game-factory-lab/family-game-factory-worker"
WORKFLOWS = ("factory-private.yml", "factory-smoke.yml")
OUTCOMES = {"success", "failure", "cancelled", "skipped", "timed_out", "action_required",
            "in_progress", "queued", "pending", "waiting", "requested"}


def github(path):
    result = subprocess.run(["gh", "api", f"repos/{REPOSITORY}/actions/{path}"],
                            capture_output=True, text=True, timeout=20)
    if result.returncode:
        raise RuntimeError("GitHub worker metadata read failed")
    return json.loads(result.stdout)


def outcome(item):
    value = item.get("conclusion") or item.get("status")
    return value if value in OUTCOMES else "unknown"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workflow", choices=WORKFLOWS, default="factory-smoke.yml")
    args = parser.parse_args()
    try:
        runs = github(f"workflows/{args.workflow}/runs?branch=main&per_page=5")["workflow_runs"]
        output = []
        for run in runs[:5]:
            run_id = run["id"]
            if type(run_id) is not int or run_id < 1:
                raise ValueError("Invalid run")
            page = github(f"runs/{run_id}/jobs?per_page=50")
            output.append({"run": run_id, "outcome": outcome(run),
                           "jobs": dict(Counter(outcome(job) for job in page["jobs"])),
                           "truncated": page["total_count"] > 50})
        print(json.dumps({"workflow": args.workflow, "runs": output}))
    except (OSError, KeyError, ValueError, RuntimeError, subprocess.SubprocessError):
        raise SystemExit("Worker status unavailable. Check repository Actions-read access and API egress.") from None


if __name__ == "__main__":
    main()
