#!/usr/bin/env python3
"""Build DEV images from exact source, then verify an existing build; never deploy.

The default prints an offline recipe. --submit records an operation before one
asynchronous submission. --verify reads that same build; it never resubmits.
SourceProvenance SHA256 binds the uploaded archive to the reviewed Git blobs.
https://docs.cloud.google.com/build/docs/api/reference/rest/v1/projects.builds
"""
from __future__ import annotations

import argparse
import base64
import gzip
import hashlib
import io
import json
import re
import sys
import tarfile
import tempfile
import uuid
from pathlib import Path
from build import source_archive, stage_sources, run
from dev_bootstrap import Cloud, verify_project
from dev_contract import DevError, account, fingerprint, read_manifest, require, valid_image

COMPONENTS = ("gateway", "preview", "coach", "sandbox", "app")
UUID = re.compile(r"[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}")
HASH = re.compile(r"[a-f0-9]{64}")


def image_tag(m: dict, component: str, operation: str) -> str:
    require(component in COMPONENTS and bool(UUID.fullmatch(operation)), "Known DEV image component and operation ID required")
    registry = "jems-dev-sandbox" if component == "sandbox" else "jems-dev-images"
    return f"{m['region']}-docker.pkg.dev/{m['projectId']}/{registry}/{component}:{m['sourceSha']}-{operation}"


def components(value: list[str]) -> list[str]:
    require(bool(value) and len(value) == len(set(value)) and set(value) <= set(COMPONENTS), "Finite unique DEV image components required")
    require("app" not in value or value == ["app"], "App packaging uses its own verified image context")
    return [c for c in COMPONENTS if c in value]


def recipe(m: dict, selected: list[str], operation: str) -> dict:
    selected = components(selected)
    require(bool(UUID.fullmatch(operation)), "Exact DEV build operation ID required")
    steps = []
    for component in selected:
        dockerfile = "server/Dockerfile.dev-site-source" if component == "app" else "server/sandbox/Dockerfile" if component == "sandbox" else "server/Dockerfile." + component
        steps.append({"name": "gcr.io/cloud-builders/docker", "args": ["build", "--pull",
            "--label", "org.opencontainers.image.revision=" + m["sourceSha"],
            "--label", "org.opencontainers.image.source=https://github.com/jzwyrzyk/family-game-factory",
            "--label", "org.opencontainers.image.environment=development",
            *(["--build-arg", "REVIEWED_SOURCE_SHA=" + m["sourceSha"]] if component == "app" else []),
            "-f", dockerfile, "-t", image_tag(m, component, operation), "."]})
    return {"steps": steps, "images": [image_tag(m, c, operation) for c in selected],
        "serviceAccount": f"projects/{m['projectId']}/serviceAccounts/{account(m, 'build')}",
        "options": {"logging": "CLOUD_LOGGING_ONLY", "machineType": "E2_MEDIUM", "sourceProvenanceHash": ["SHA256"]},
        "timeout": "1800s", "tags": ["jems-development", "source-" + m["sourceSha"], "operation-" + operation]}


APP_SCOPE = ["package.json", "package-lock.json", "index.html", "src", "public",
    "server/dev-access.ts", "server/dev-site.ts", "server/Dockerfile.dev-site-source",
    "tools/offline-build.ts", "scripts/development/build-site-image.ts"]


def app_source_archive(root: Path, directory: Path, sha: str) -> tuple[Path, str]:
    context = directory / "app-source"
    # Read Git blobs, never caller-built JS, a package manifest, or the mutable
    # working tree. The deliberately narrow archive has no root .dockerignore.
    stage_sources(root, context, sha, APP_SCOPE, services=True)
    # The generic private-service archiver deliberately excludes config.json;
    # this one known public configuration is safe only in disconnected form.
    public_config = run(["git", "show", sha + ":public/factory-config.json"], root)
    require(json.loads(public_config) == {"version": 1, "mode": "unavailable"}, "DEV source public configuration must be disconnected")
    (context / "public").mkdir(parents=True, exist_ok=True)
    (context / "public/factory-config.json").write_bytes(public_config)
    for name in [x for x in APP_SCOPE if x not in ("src", "public")]:
        require((context / name).is_file(), "Reviewed DEV app source is incomplete")
    require((context / "src/main.ts").is_file() and (context / "public/factory-config.json").is_file(), "Reviewed DEV application files missing")
    output = directory / "source.tgz"
    with output.open("wb") as target, gzip.GzipFile(fileobj=target, mode="wb", filename="", mtime=0) as compressed, tarfile.open(fileobj=compressed, mode="w") as archive:
        for file in sorted(context.rglob("*")):
            if file.is_file():
                content = file.read_bytes()
                item = tarfile.TarInfo(file.relative_to(context).as_posix())
                item.size, item.mode = len(content), 0o644
                archive.addfile(item, io.BytesIO(content))
    return output, hashlib.sha256(output.read_bytes()).hexdigest()


def reviewed_archive(root: Path, directory: Path, sha: str, selected: list[str]) -> tuple[Path, str]:
    return app_source_archive(root, directory, sha) if selected == ["app"] else source_archive(root, directory, sha)


def validate_receipt(m: dict, receipt: dict) -> list[str]:
    require(isinstance(receipt, dict) and receipt.get("version") == 1 and receipt.get("environment") == "development"
            and receipt.get("projectId") == m["projectId"] and receipt.get("projectNumber") == m["projectNumber"]
            and receipt.get("sourceSha") == m["sourceSha"] and receipt.get("region") == m["region"], "DEV build receipt target mismatch")
    require(bool(UUID.fullmatch(receipt.get("operationId", ""))) and bool(UUID.fullmatch(receipt.get("buildId", "")))
            and bool(HASH.fullmatch(receipt.get("sourceArchiveSha256", ""))), "DEV build/source identity required")
    return components(receipt.get("components", []))


def verify_build_metadata(m: dict, receipt: dict, result: dict) -> dict[str, str]:
    selected = validate_receipt(m, receipt)
    expected = recipe(m, selected, receipt["operationId"])
    require(result.get("id") == receipt["buildId"] and result.get("projectId") == m["projectId"], "DEV Cloud Build identity mismatch")
    require(result.get("status") == "SUCCESS", "DEV_BUILD_NOT_SUCCESSFUL: inspect the existing build; do not resubmit")
    for key in ("serviceAccount", "images", "tags", "timeout"):
        require(result.get(key) == expected[key], "DEV executable build configuration differs from the reviewed recipe")
    require(not any(result.get(k) for k in ("availableSecrets", "secrets", "substitutions", "artifacts", "gitConfig")), "DEV build has unexpected executable inputs")
    actual_options = result.get("options", {})
    for key, value in expected["options"].items():
        require(actual_options.get(key) == value, "DEV build options differ from reviewed recipe")
    require(not any(actual_options.get(k) for k in ("env", "secretEnv", "volumes", "pool", "workerPool", "dynamicSubstitutions", "automapSubstitutions")), "DEV build has unreviewed runtime overrides")
    runtime_fields = {"status", "pullTiming", "timing", "exitCode"}
    actual = result.get("steps", [])
    require(len(actual) == len(expected["steps"]) and all({k: v for k, v in a.items() if k not in runtime_fields} == e
        for a, e in zip(actual, expected["steps"])), "DEV build steps were substituted")
    provenance = result.get("sourceProvenance", {})
    source = provenance.get("resolvedStorageSource", {})
    require(source.get("bucket") == m["projectId"] + "-build-source" and
            isinstance(source.get("object"), str) and source["object"].startswith("source/") and
            bool(re.fullmatch(r"[1-9][0-9]*", str(source.get("generation", "")))), "DEV immutable source object not verified")
    declared = result.get("source", {}).get("storageSource", {})
    require(declared.get("bucket") == source["bucket"] and declared.get("object") == source["object"] and
            (not declared.get("generation") or str(declared["generation"]) == str(source["generation"])), "DEV declared and resolved source differ")
    source_hashes = provenance.get("fileHashes", {})
    require(isinstance(source_hashes, dict) and len(source_hashes) == 1, "DEV archive source provenance required")
    values = next(iter(source_hashes.values())).get("fileHash", [])
    expected_hash = base64.b64encode(bytes.fromhex(receipt["sourceArchiveSha256"])).decode()
    require(any(h.get("type") == "SHA256" and h.get("value") == expected_hash for h in values), "DEV uploaded source archive digest mismatch")
    images = result.get("results", {}).get("images", [])
    require(len(images) == len(selected) and {i.get("name") for i in images} == set(expected["images"]), "DEV image result set mismatch")
    output = {}
    for component in selected:
        image = next(i for i in images if i["name"] == image_tag(m, component, receipt["operationId"]))
        value = image_tag(m, component, receipt["operationId"]).rsplit(":", 1)[0] + "@" + image.get("digest", "")
        require(valid_image(m, component, value), "DEV immutable image result invalid")
        output[component] = value
    return output


def verify_existing_build(m: dict, cloud: Cloud, receipt: dict, root: Path | None = None) -> dict:
    selected = validate_receipt(m, receipt)
    root = root or Path(__file__).resolve().parents[2]
    # For the public sandbox in particular, a caller-written JSON receipt must
    # never substitute an unrelated archive merely bearing the same source label.
    with tempfile.TemporaryDirectory(prefix="jems-dev-source-verify-") as directory:
        _, expected = reviewed_archive(root, Path(directory), m["sourceSha"], selected)
    require(expected == receipt["sourceArchiveSha256"], "DEV receipt does not bind the selected Git source")
    verify_project(m, cloud)
    result = cloud.run("builds", "describe", receipt["buildId"], "--region", m["region"])
    require(isinstance(result, dict), "DEV build metadata missing")
    images = verify_build_metadata(m, receipt, result)
    for image in images.values():
        metadata = cloud.run("artifacts", "docker", "images", "describe", image)
        summary = metadata.get("image_summary", metadata.get("imageSummary", {})) if isinstance(metadata, dict) else {}
        require(summary.get("digest") == image.rsplit("@", 1)[1] and
                summary.get("fully_qualified_digest", summary.get("fullyQualifiedDigest")) == image, "DEV registry digest verification failed")
    if receipt.get("verified"):
        require(receipt.get("images") == images, "Previously verified DEV image receipt changed")
    return {**receipt, "images": images, "verified": True, "status": "build-verified", "deployed": False}


def verify_release_images(m: dict, cloud: Cloud, receipts: list[dict], root: Path | None = None) -> dict:
    """Verify every selected image, reusing older backend bytes only when the
    exact source inputs are identical to those in the selected app commit.
    UI-only iteration can therefore retain the previously verified backend.
    """
    require(isinstance(receipts, list) and 1 <= len(receipts) <= 5, "Verified DEV build receipts required for all images")
    root = root or Path(__file__).resolve().parents[2]
    verified: dict[str, str] = {}
    evidence = []
    for receipt in receipts:
        require(isinstance(receipt, dict) and isinstance(receipt.get("sourceSha"), str) and
                bool(re.fullmatch(r"[a-f0-9]{40}", receipt["sourceSha"])), "DEV build receipt source required")
        historical = {**m, "sourceSha": receipt["sourceSha"]}
        selected = validate_receipt(historical, receipt)
        if historical["sourceSha"] != m["sourceSha"]:
            require("app" not in selected, "DEV app must be built from the selected source")
            with tempfile.TemporaryDirectory(prefix="jems-dev-compatible-source-") as directory:
                _, expected = reviewed_archive(root, Path(directory), m["sourceSha"], selected)
            require(expected == receipt["sourceArchiveSha256"], "DEV backend source changed; build new images")
        result = verify_existing_build(historical, cloud, receipt, root)
        for component, image in result["images"].items():
            require(component not in verified and image == m["images"][component], "DEV selected image lacks unique verified provenance")
            verified[component] = image
        evidence.append({"buildId": result["buildId"], "sourceSha": historical["sourceSha"], "images": result["images"]})
    require(set(verified) == set(COMPONENTS), "Every DEV image needs verified source/build evidence")
    return {"images": verified, "builds": evidence, "selectedSourceSha": m["sourceSha"]}


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--manifest", required=True)
    p.add_argument("--components", default="gateway,preview,coach,sandbox")
    p.add_argument("--receipt", help="New operation receipt for submit; saved receipt for verify")
    p.add_argument("--build-id", help="Resolve an uncertain submit using the existing build ID; never resubmit")
    mode = p.add_mutually_exclusive_group()
    mode.add_argument("--submit", action="store_true")
    mode.add_argument("--verify", action="store_true")
    args = p.parse_args()
    try:
        m = read_manifest(args.manifest)
        selected = components(args.components.split(","))
        cloud = Cloud(m, "bootstrap")
        root = Path(__file__).resolve().parents[2]
        if args.verify:
            require(bool(args.receipt), "Saved DEV build receipt required")
            receipt = json.loads(Path(args.receipt).read_text())
            if args.build_id:
                require(not receipt.get("buildId") or receipt["buildId"] == args.build_id, "Cannot replace a known DEV build ID")
                receipt["buildId"] = args.build_id
            result = verify_existing_build(m, cloud, receipt, root)
            Path(args.receipt).write_text(json.dumps(result, indent=2) + "\n")
            print(json.dumps(result, indent=2))
            return 0
        require(not args.build_id, "Existing build IDs are only accepted with --verify")
        operation = str(uuid.uuid4())
        config = recipe(m, selected, operation)
        if not args.submit:
            print(json.dumps({"mode": "offline-plan", "environment": "development", "sourceSha": m["sourceSha"], "build": config,
                "sourceBucket": m["projectId"] + "-build-source", "deployed": False}, indent=2))
            return 0
        require(bool(args.receipt), "New DEV operation receipt path required before submission")
        receipt_path = Path(args.receipt)
        require(not receipt_path.exists(), "DEV build receipt already exists; verify/resume that operation")
        verify_project(m, cloud)
        with tempfile.TemporaryDirectory(prefix="jems-dev-build-") as directory:
            archive, digest = reviewed_archive(root, Path(directory), m["sourceSha"], selected)
            cfg = Path(directory) / "cloudbuild.json"
            cfg.write_text(json.dumps(config))
            receipt = {"version": 1, "environment": "development", "projectId": m["projectId"], "projectNumber": m["projectNumber"],
                "region": m["region"], "sourceSha": m["sourceSha"], "manifestSha256": fingerprint(m), "operationId": operation,
                "sourceArchiveSha256": digest, "components": selected, "buildId": None, "verified": False,
                "status": "submission-uncertain", "images": {}, "deployed": False}
            with receipt_path.open("x") as output:
                output.write(json.dumps(receipt, indent=2) + "\n")
            result = cloud.run("builds", "submit", str(archive), "--config", str(cfg), "--region", m["region"],
                "--gcs-source-staging-dir", "gs://" + m["projectId"] + "-build-source/source", "--async")
            require(isinstance(result, dict) and bool(UUID.fullmatch(result.get("id", ""))), "DEV submission identity uncertain; inspect by operation tag, never repeat blindly")
            receipt.update(buildId=result["id"], status="submitted-awaiting-verification")
            receipt_path.write_text(json.dumps(receipt, indent=2) + "\n")
            print(json.dumps(receipt, indent=2))
        return 0
    except (OSError, ValueError, TypeError, KeyError, RuntimeError) as exc:
        print(str(exc) if isinstance(exc, DevError) else "DEV_BUILD_FAILED: inspect the saved operation; no automatic retry", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
