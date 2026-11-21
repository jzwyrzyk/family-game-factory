#!/usr/bin/env python3
"""Render DEV-only config templates, or initialize fresh private signing keys.

No cloud access. A new output directory is required; existing files are never
overwritten. --initialize-private creates random keys only for a first DEV
installation. For a config update, additionally pass --existing-gateway so both
signing keys remain unchanged. Provider approvals are explicit operator inputs.
Files containing private material have mode 0600 in a directory with mode 0700.
"""
from __future__ import annotations

import argparse
from datetime import date, timedelta
import json
import math
import os
from pathlib import Path
import secrets
import sys
from dev_contract import (DevError, fingerprint, native_origin, read_manifest, record,
                          reject_production, require, resource_summary)


def read_private(path: str) -> dict:
    try:
        data = Path(path).read_bytes()
        require(len(data) < 100_000, "DEV private input too large")
        value = json.loads(data)
        require(isinstance(value, dict), "DEV private input must be an object")
        reject_production(value)
        return value
    except (OSError, ValueError) as exc:
        raise DevError("Cannot read private DEV input; contents suppressed") from exc


def validate_approval(raw: dict, enabled: bool) -> dict:
    record(raw, {"enabled", "approvalId", "model", "inputUsdPerMillion", "outputUsdPerMillion",
        "maxInputTokens", "maxOutputTokens", "priceReviewedOn"}, "generation approval")
    require(type(raw["enabled"]) is bool and raw["enabled"] == enabled, "Explicit generation approval must match DEV activation")
    if not enabled:
        return raw
    import re
    require(isinstance(raw["approvalId"], str) and 1 <= len(raw["approvalId"]) <= 200 and
            isinstance(raw["model"], str) and bool(re.fullmatch(r"[-a-zA-Z0-9.]{1,100}", raw["model"])),
            "Actual reviewed generation approval/model required")
    for key in ("inputUsdPerMillion", "outputUsdPerMillion"):
        require(type(raw[key]) in (int, float) and math.isfinite(raw[key]) and raw[key] > 0,
                "Actual positive reviewed provider prices required")
    require(type(raw["maxInputTokens"]) is int and 2000 <= raw["maxInputTokens"] <= 64000 and
            type(raw["maxOutputTokens"]) is int and 1000 <= raw["maxOutputTokens"] <= 16000, "Reviewed bounded token limits required")
    try:
        at = date.fromisoformat(raw["priceReviewedOn"])
    except (ValueError, TypeError) as exc:
        raise DevError("Current provider price review date required") from exc
    require(date.today() - timedelta(days=31) < at <= date.today(), "Current provider price review date required")
    return raw


def dev_access(m: dict, component: str) -> dict:
    require(component in ("app", "preview"), "DEV IAP scope must be app or preview")
    return {"environment": "development", "projectNumber": m["projectNumber"],
        "iapAudience": f"/projects/{m['projectNumber']}/locations/{m['region']}/services/jems-dev-{component}",
        "allowedAdults": m["allowedAdults"], "syntheticDataOnly": True,
        "syntheticFamilyId": "dev-synthetic", "syntheticWorkspace": "dev-synthetic",
        "workerOwner": m["worker"]["repository"].split("/")[0], "workerOwnerId": m["worker"]["ownerId"],
        "maxTotalMicroUsd": m["budget"]["totalMicroUsd"]}


def render(m: dict, *, initialize: bool = False, previous: dict | None = None, approval: dict | None = None) -> dict[str, dict]:
    require(previous is None or initialize, "Existing signing keys are used only for private config output")
    require(not initialize or previous is not None or m["secretVersions"]["gateway-config"] is None,
            "Existing DEV installation requires --existing-gateway; never rotate signing keys implicitly")
    if previous is not None:
        reject_production(previous)
        require(previous.get("projectId") == m["projectId"] and previous.get("familyId") == "dev-synthetic" and
                previous.get("workspace") == "dev-synthetic" and previous.get("artifactBucket") == m["projectId"] + "-artifacts" and
                previous.get("devAccess", {}).get("projectNumber") == m["projectNumber"],
                "Existing config must belong to this isolated DEV stack")
        session, preview = previous.get("sessionKey"), previous.get("previewKey")
        require(isinstance(session, str) and isinstance(preview, str) and min(len(session), len(preview)) >= 32 and
                session != preview and "REQUIRED_" not in session and "REQUIRED_" not in preview, "Valid distinct existing DEV signing keys required")
    else:
        session = secrets.token_urlsafe(48) if initialize else "REQUIRED_NEW_DEV_SESSION_SIGNING_KEY"
        preview = secrets.token_urlsafe(48) if initialize else "REQUIRED_DISTINCT_DEV_PREVIEW_SIGNING_KEY"
    if approval is None:
        require(not (initialize and m["generationEnabled"]), "Generation activation requires an explicit reviewed approval file")
        approval = {"enabled": False, "approvalId": "", "model": "", "inputUsdPerMillion": 0,
            "outputUsdPerMillion": 0, "maxInputTokens": 24000, "maxOutputTokens": 4000, "priceReviewedOn": ""}
    else:
        approval = validate_approval(approval, m["generationEnabled"])
    shared = {"projectId": m["projectId"], "artifactBucket": m["projectId"] + "-artifacts",
        "workspace": "dev-synthetic", "previewOrigin": native_origin(m, "preview"), "previewKey": preview}
    gateway = {**shared, "active": m["generationEnabled"], "appOrigin": native_origin(m, "app"),
        "gatewayOrigin": native_origin(m, "gateway"), "sessionKey": session, "familyId": "dev-synthetic",
        "repository": "jzwyrzyk/family-game-factory", "repositoryId": "1458033181", "workflow": "factory-agent.yml",
        "approvedSha": m["sourceSha"], "workerRepository": m["worker"]["repository"],
        "workerRepositoryId": m["worker"]["repositoryId"], "workerWorkflow": m["worker"]["workflow"],
        "workerApprovedSha": m["worker"]["sha"], "githubAppId": m["worker"]["githubAppId"],
        "githubInstallationId": m["worker"]["githubInstallationId"],
        "githubPrivateKeyFile": "/var/run/factory-github/key.pem", "approval": approval,
        "maxJobMicroUsd": m["budget"]["maxJobMicroUsd"], "coachPrivateOrigin": native_origin(m, "coach"),
        "devAccess": dev_access(m, "app")}
    return {"app-config": {"version": 1, "environment": "development", "projectId": m["projectId"],
                "appOrigin": native_origin(m, "app"), "gatewayServiceOrigin": native_origin(m, "gateway"),
                "previewOrigin": native_origin(m, "preview"), "devAccess": dev_access(m, "app")},
            "gateway-config": gateway, "preview-config": {**shared, "devAccess": dev_access(m, "preview")}}


def write_new(directory: str, payloads: dict[str, dict]) -> list[str]:
    target = Path(directory).absolute()
    require(not target.exists(), "New DEV config output directory required; never overwrite signing keys")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.mkdir(mode=0o700)
    paths = []
    for name, value in payloads.items():
        path = target / (name + ".json")
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w") as output:
            json.dump(value, output, indent=2, sort_keys=True)
            output.write("\n")
        paths.append(str(path))
    return paths


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--initialize-private", action="store_true")
    parser.add_argument("--existing-gateway", help="Prior private DEV gateway JSON; preserves signing keys for an explicit config change")
    parser.add_argument("--approval", help="Explicit generation approval JSON with current reviewed model/prices")
    args = parser.parse_args()
    try:
        manifest = read_manifest(args.manifest)
        payloads = render(manifest, initialize=args.initialize_private,
            previous=read_private(args.existing_gateway) if args.existing_gateway else None,
            approval=read_private(args.approval) if args.approval else None)
        paths = write_new(args.out, payloads)
        print(json.dumps({**resource_summary(manifest), "mode": "private-config-created" if args.initialize_private else "templates-only",
            "configFiles": paths, "manifestSha256": fingerprint(manifest), "secretPayloadsPrinted": False,
            "cloudWrites": False, "deployableKeys": bool(args.initialize_private),
            "remaining": ["Store configs and independently provisioned DEV GitHub/coach keys only in the five named DEV secrets",
                "Pin each resulting numeric version in a new manifest", "Verify exact live IAP audiences and build receipts before release"]}, indent=2))
        return 0
    except (DevError, OSError, TypeError, ValueError, KeyError) as exc:
        print(str(exc) if isinstance(exc, DevError) else "DEV_CONFIG_FAILED: contents suppressed", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
