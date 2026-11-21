#!/usr/bin/env python3
"""Validate and append private DEV secret versions; never print payloads.

Default is a local plan. --apply uses only the keyless DEV bootstrap identity.
All five inputs are validated before any cloud write. A failed/uncertain write
is not retried automatically. No existing secret value is read or copied.
"""
from __future__ import annotations

import argparse
from copy import deepcopy
import json
import os
from pathlib import Path
import re
import sys
from dev_bootstrap import Cloud, inventory, validate_resource_policies
from dev_config import read_private, render
from dev_contract import (SECRETS, DevError, fingerprint, read_manifest, require, required_secrets, resource_summary, validate)


def inputs(m: dict, directory: str, github_key: str, coach_key: str | None = None) -> dict[str, str]:
    paths = {name: str((Path(directory) / (name + ".json")).absolute()) for name in ("app-config", "gateway-config", "preview-config")}
    paths["github-app-key"] = str(Path(github_key).absolute())
    if coach_key:
        paths["coach-key"] = str(Path(coach_key).absolute())
    require(set(required_secrets(m)) <= set(paths), "Active model coaching requires a separate DEV provider-key file")
    payloads = {name: read_private(paths[name]) for name in ("app-config", "gateway-config", "preview-config")}
    gateway = payloads["gateway-config"]
    expected = render(m, initialize=True, previous=gateway, approval=gateway.get("approval"))
    require(payloads == expected, "DEV config files do not exactly match this manifest")
    try:
        pem = Path(paths["github-app-key"]).read_bytes()
        key = Path(paths["coach-key"]).read_bytes() if "coach-key" in paths else None
    except OSError as exc:
        raise DevError("DEV credential input unavailable; contents suppressed") from exc
    require(500 <= len(pem) <= 32768 and pem.startswith((b"-----BEGIN PRIVATE KEY-----", b"-----BEGIN RSA PRIVATE KEY-----")) and
            pem.rstrip().endswith((b"-----END PRIVATE KEY-----", b"-----END RSA PRIVATE KEY-----")), "DEV GitHub RSA private-key file required")
    # Structural check only. The gateway validates RSA, and independent live
    # App/installation/provider acceptance must establish credential scope.
    if key is not None:
        require(16 <= len(key.strip()) <= 2000 and all(32 < b < 127 for b in key.strip()), "Separate DEV coach provider key file required")
    require(len(set(paths.values())) == len(paths), "Distinct DEV config/credential input files required")
    for path in paths.values():
        require(Path(path).is_file() and not Path(path).is_symlink(), "Regular private DEV input files required")
        require(os.stat(path).st_mode & 0o077 == 0, "Private DEV input files must not be group/world accessible")
    return paths


def upload(m: dict, cloud: Cloud, paths: dict[str, str]) -> tuple[dict, dict]:
    current = inventory(m, cloud)
    require(not current.get("missingApis"), "Complete DEV foundation before adding secret versions")
    names = {x.get("name", "").split("/")[-1] for x in current.get("secrets", [])}
    require({"jems-dev-" + name for name in SECRETS} <= names, "Named DEV secret containers are required")
    validate_resource_policies(m, cloud, current, complete=True)
    versions = deepcopy(m["secretVersions"])
    for name in (s for s in SECRETS if s in paths):
        result = cloud.run("secrets", "versions", "add", "jems-dev-" + name, "--data-file", paths[name])
        require(isinstance(result, dict), "DEV secret version creation not verified; inspect metadata before retry")
        match = re.fullmatch(r"projects/" + re.escape(m["projectNumber"]) + r"/secrets/jems-dev-" + re.escape(name) + r"/versions/([1-9][0-9]*)",
                             result.get("name", ""))
        require(bool(match) and result.get("state") == "ENABLED", "DEV secret version creation not verified; inspect metadata before retry")
        versions[name] = match.group(1)  # type: ignore[union-attr]
    target = deepcopy(m)
    target["secretVersions"] = versions
    validate(target)
    return target, {**resource_summary(target), "mode": "private-secret-versions-created", "secretVersions": versions,
        "inputManifestSha256": fingerprint(m), "manifestSha256": fingerprint(target), "payloadsPrinted": False,
        "servicesChanged": False, "providerCredentialScopeVerified": False, "paidAIVerified": False}


def write_manifest(path: str, m: dict) -> None:
    target = Path(path)
    fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as output:
        json.dump(m, output, indent=2, sort_keys=True)
        output.write("\n")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--config-dir", required=True)
    parser.add_argument("--github-key-file", required=True)
    parser.add_argument("--coach-key-file", help="Required only when model coaching is approved; never mounted for inactive/audio-only coaching")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--out-manifest", help="New private manifest path; required with --apply")
    args = parser.parse_args()
    try:
        m = read_manifest(args.manifest)
        paths = inputs(m, args.config_dir, args.github_key_file, args.coach_key_file)
        cloud = Cloud(m)
        if args.apply:
            require(bool(args.out_manifest) and not Path(args.out_manifest).exists() and Path(args.out_manifest).parent.is_dir(),
                    "New output manifest path in an existing private directory required before cloud writes")
            target, result = upload(m, cloud, paths)
            write_manifest(args.out_manifest, target)
            result["manifestFile"] = str(Path(args.out_manifest).absolute())
        else:
            result = {**resource_summary(m), "mode": "offline-secret-plan", "inputFilesValidated": True,
                "commands": [cloud.command(["secrets", "versions", "add", "jems-dev-" + name, "--data-file", paths[name]]) for name in SECRETS if name in paths],
                "cloudWrites": False, "providerCredentialScopeVerified": False, "paidAIVerified": False}
        print(json.dumps(result, indent=2, sort_keys=True))
        return 0
    except (DevError, OSError, TypeError, ValueError, KeyError) as exc:
        print(str(exc) if isinstance(exc, DevError) else "DEV_SECRET_INPUT_INVALID: contents suppressed", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
