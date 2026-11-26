#!/usr/bin/env python3
"""Assemble the protected release record from exact TEST and Pages Actions receipts."""

import argparse
import json
from pathlib import Path

from production_gate import (
    TEST,
    ci_evidence,
    gh,
    digest,
    evidence,
    json_bytes,
    manifest,
    metadata,
    pages_ref,
    positive,
    receipt,
    require,
    run_and_jobs,
    validate,
)


def assemble(api, spec, pages):
    """spec contains identities, recovery, configuration, expiry and three run IDs."""
    record = {**spec, "version": 1, "pages": pages}
    pages_ref(pages)
    source = spec["manifest"]["sourceSha"]
    record["supplyChain"] = {
        **spec["supplyChain"],
        "arcade": ci_evidence.verify_full_ci(api, source, "release"),
    }
    identity = {**spec["manifest"], "evidence": dict.fromkeys(("ci", "uat", "live"))}
    record["manifest"] = identity
    ci, ci_hash = receipt(
        api, metadata(api, pages["runId"], f"pages-preparation-{pages['runId']}", pages["workflowSha"])
    )
    require(ci == pages and ci["sourceSha"] == source, "Prepared Pages source differs")
    identity["evidence"]["ci"] = {
        "sourceSha": source,
        "receiptSha256": ci_hash,
        "checks": dict.fromkeys(sorted(manifest.REQUIRED_CI_CHECKS), "success"),
    }
    for scope in ("uat", "live"):
        run = positive(spec["runs"][scope])
        job = "integrated-test-" + scope
        run_and_jobs(api, run, TEST, source, [job])
        observed, raw_hash = receipt(api, metadata(api, run, f"{job}-{run}-1", source))
        fields = ["sourceSha", "releaseIdentitySha256", "journeys", "target", "providerMode"]
        if scope == "live":
            fields += ["authorizationSha256", "limitMicrousd", "spendMicrousd"]
        identity["evidence"][scope] = {**{k: observed[k] for k in fields}, "receiptSha256": raw_hash}
    validate(record)
    evidence(api, record)
    return record


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--identity-and-recovery", type=Path, required=True)
    p.add_argument("--pages-receipt", type=Path, required=True)
    p.add_argument("--out", type=Path, required=True)
    args = p.parse_args()
    record = assemble(
        gh.GitHub(),
        json_bytes(args.identity_and_recovery.read_bytes()),
        json_bytes(args.pages_receipt.read_bytes()),
    )
    with args.out.open("x") as out:
        json.dump(record, out, sort_keys=True, indent=2)
        out.write("\n")
    print("Package SHA-256", digest(record))


if __name__ == "__main__":
    main()
