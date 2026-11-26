#!/usr/bin/env python3
"""Record the actual fixed Pages artifact produced by this protected preparation."""

import hashlib
import json
import os
from pathlib import Path

from production_gate import ROOT, gh, metadata, positive, require


def main():
    source = os.environ["REVIEWED_SOURCE_SHA"]
    env = os.environ
    require(
        env["GITHUB_REF"] == "refs/heads/main"
        and env["GITHUB_REF_PROTECTED"] == "true"
        and env["GITHUB_JOB"] == "prepare-receipt"
        and env["GITHUB_RUN_ATTEMPT"] == "1",
        "Only first-attempt protected preparation can issue a receipt",
    )
    run = positive(int(env["GITHUB_RUN_ID"]))
    item = metadata(gh.GitHub(), run, "github-pages", env["GITHUB_SHA"])
    result = {
        "sourceSha": source,
        "workflowSha": env["GITHUB_SHA"],
        "runId": run,
        "artifactId": item["id"],
        "archiveSha256": item["digest"].removeprefix("sha256:"),
        "policySha256": hashlib.sha256((ROOT / "ops/pages-delivery.json").read_bytes()).hexdigest(),
    }
    if env["PREPARATION"] == "prepare-retained":
        from retained_pages import SOURCE

        require(
            source == SOURCE and len(env["RETAINED_INVENTORY"]) == 64,
            "Missing verified household inventory",
        )
        result["retainedInventorySha256"] = env["RETAINED_INVENTORY"]
    (Path(env["RUNNER_TEMP"]) / "receipt.json").write_text(json.dumps(result, sort_keys=True) + "\n")


if __name__ == "__main__":
    main()
