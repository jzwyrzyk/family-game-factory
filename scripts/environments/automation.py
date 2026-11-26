#!/usr/bin/env python3
"""Trusted workflow glue. Only reviewed controller code executes with credentials.

Preparation verifies GitHub provenance and extracts data without credentials.
Publication loads (never runs) the fixed-server image produced by preparation.
Cloud identities and every resource are constrained by cloud.py and reviewed
nonproduction configuration. This file never calls the production controller.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess

import bundle
import cloud
import github as gh


class AutomationError(ValueError):
    pass


def run(args):
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=900, check=True)
        return result.stdout.strip()
    except (subprocess.SubprocessError, OSError):
        raise AutomationError("TRUSTED_COMMAND_FAILED_OR_UNCERTAIN") from None


def read_config():
    config = json.loads(Path("ops/environments.json").read_text())
    cloud.validate_config(config, require_enabled=False, public_record=True)
    return config


def output(**values):
    # Outputs never contain untrusted multiline strings or artifact paths.
    for key, value in values.items():
        if isinstance(value, bool):
            value = str(value).lower()
        value = "" if value is None else str(value)
        if "\n" in value or "\r" in value:
            raise AutomationError("OUTPUT_CONTAINS_NEWLINE")
        if os.environ.get("GITHUB_OUTPUT"):
            with open(os.environ["GITHUB_OUTPUT"], "a") as stream:
                stream.write(f"{key}={value}\n")


def configuration():
    config = read_config()
    cloud.validate_config(config, public_record=True)
    output(provider=config["wifProvider"], deployer=config["deployServiceAccount"],
           uat=config["uatServiceAccount"], audience=config["iapAudience"])


def prepare(root, api=None):
    config = read_config()
    output(enabled=config["enabled"], eligible=False)
    if not config["enabled"]:
        print("NONPRODUCTION_SETUP_PENDING: no authentication or mutation attempted")
        return
    value = os.environ.get("CANDIDATE_RUN", "")
    if not value:
        return
    if not re.fullmatch(r"[1-9][0-9]*", value):
        raise AutomationError("INVALID_CANDIDATE_RUN")
    api = api or gh.GitHub()
    policy = gh.required_checks(json.loads(Path("ops/github-main-ruleset.json").read_text()))
    candidate = gh.choose_candidate(api, int(value), policy, root / "jems-download")
    if not candidate["eligible"]:
        print(candidate["reason"])
        return
    # Ignore the supplied path after proving it equals our fixed download path.
    archive = root / "jems-download" / "bundle.tgz"
    if candidate["bundlePath"] != str(archive.resolve()):
        raise AutomationError("BUNDLE_PATH_CHANGED")
    if bundle.file_digest(archive) != candidate["bundleSha256"]:
        raise AutomationError("BUNDLE_TRANSPORT_CHANGED")
    context = root / "jems-context"
    context.mkdir()
    args = ["python3", "scripts/environments/bundle.py", "extract", "--archive", str(archive),
            "--source", candidate["sourceSha"], "--environment", candidate["environment"],
            "--dest", str(context / "site")]
    if candidate["prNumber"] is not None:
        args += ["--pr", str(candidate["prNumber"])]
    run(args)
    candidate["identitySha256"] = hashlib.sha256((context / "site" / "jems-environment.json").read_bytes()).hexdigest()
    for name in ("Dockerfile", "site_server.py"):
        shutil.copyfile(Path("scripts/environments") / name, context / name)
    (root / "jems-candidate.json").write_text(json.dumps(candidate, indent=2) + "\n")
    output(eligible=True, source=candidate["sourceSha"], kind=candidate["environment"],
           pr=candidate["prNumber"], run=candidate["runId"], bundle=candidate["bundleSha256"])


def recheck(root, api=None):
    config = read_config()
    cloud.validate_config(config, public_record=True)
    api = api or gh.GitHub()
    candidate = json.loads((root / "jems-candidate.json").read_text())
    policy = gh.required_checks(json.loads(Path("ops/github-main-ruleset.json").read_text()))
    fresh = gh.choose_candidate(api, candidate["runId"], policy)
    fields = ("environment", "prNumber", "sourceSha", "runId", "artifactId", "artifactDigest", "ciEvidence")
    if not fresh.get("eligible") or any(fresh.get(k) != candidate.get(k) for k in fields):
        raise AutomationError("CANDIDATE_NO_LONGER_ELIGIBLE")
    current_controller(api)
    return config, candidate


def current_controller(api):
    main = api.request(f"{gh.PREFIX}/git/ref/heads/main")["object"]["sha"]
    if not re.fullmatch(r"[a-f0-9]{40}", str(main)) or os.environ.get("GITHUB_SHA") != main:
        raise AutomationError("TRUSTED_CONTROLLER_MAIN_CHANGED")


def deploy(root):
    config, candidate = recheck(root)
    config = cloud.bind_private_members(config, os.environ.get("JEMS_OWNER_IAP_BINDING"))
    client = cloud.Cloud(config)
    cloud.preflight(config, client)
    prior_test_image = None
    if candidate['environment'] == 'test':
        for service in cloud.services(config, client):
            if cloud.metadata(service).get('name') == 'jems-test':
                cloud.owned(service, 'test')
                prior_test_image = service['spec']['template']['spec']['containers'][0]['image']
                cloud.validate_image(config, prior_test_image)
    host = config["registry"].split("/")[0]
    run(["gcloud", "auth", "configure-docker", host, "--quiet"])
    run(["docker", "load", "--input", str(root / "jems-site-image.tar.gz")])
    run_id = os.environ.get("GITHUB_RUN_ID", "")
    attempt = os.environ.get("GITHUB_RUN_ATTEMPT", "")
    if not re.fullmatch(r"[1-9][0-9]*", run_id) or not re.fullmatch(r"[1-9][0-9]*", attempt):
        raise AutomationError("INVALID_CONTROLLER_RUN")
    tag = f"{config['registry']}/site:ci-{run_id}-{attempt}"
    run(["docker", "tag", "jems-site:ci", tag])
    run(["docker", "push", tag])
    digest = json.loads(run(["docker", "buildx", "imagetools", "inspect", "--format",
                            "{{json .Manifest.Digest}}", tag]))
    if not re.fullmatch(r"sha256:[a-f0-9]{64}", str(digest)):
        raise AutomationError("IMMUTABLE_IMAGE_DIGEST_MISSING")
    # Re-read eligibility after publication, immediately before the service write.
    recheck(root)
    receipt = cloud.deploy(config, kind=candidate["environment"], pr=candidate["prNumber"],
                           source_sha=candidate["sourceSha"], bundle_sha256=candidate["bundleSha256"],
                           image=f"{config['registry']}/site@{digest}")
    receipt["prNumber"] = receipt.pop("pr")
    (root / "jems-deployment.json").write_text(json.dumps(receipt, indent=2) + "\n")
    if candidate['environment'] == 'test':
        # Retain only current and previous TEST images. These mutable retention
        # tags are never release identities; deployment always uses the digest.
        for image, tag_name in ((prior_test_image, 'keep-test-previous'), (receipt['image'], 'keep-test-current')):
            if image:
                run(['gcloud', 'artifacts', 'docker', 'tags', 'add', image,
                     f"{config['registry']}/site:{tag_name}", '--project=' + config['projectId'], '--quiet'])
    api = gh.GitHub()
    # If source advanced during deployment, do not publish it as the current preview.
    if not gh.current_target(api, candidate):
        raise AutomationError("SOURCE_CHANGED_DURING_DEPLOYMENT")
    gh.report(api, receipt)
    if config.get("directoryIssue"):
        gh.directory(api, config["directoryIssue"])
    output(url=receipt["url"], identity=candidate["identitySha256"])
    print("PRIVATE_FIXTURE_SITE_DEPLOYED: full TEST and production acceptance remain incomplete")


def cleanup(root):
    config = cloud.bind_private_members(read_config(), os.environ.get("JEMS_OWNER_IAP_BINDING"))
    client, api = cloud.Cloud(config), gh.GitHub()
    current_controller(api)
    cloud.preflight(config, client)
    closed = []
    for service in cloud.services(config, client):
        meta = cloud.metadata(service)
        match = re.fullmatch(r"jems-dev-pr-([1-9][0-9]{0,7})", meta.get("name", ""))
        if not match or meta.get("labels", {}).get("jems-managed") != cloud.MARKER:
            continue
        pr = int(match[1])
        record = api.request(f"{gh.PREFIX}/pulls/{pr}")
        if record.get("number") != pr or record.get("state") not in {"open", "closed"}:
            raise AutomationError("PREVIEW_PR_STATE_UNKNOWN")
        if record["state"] == "closed":
            closed.append(pr)
    current_controller(api)
    receipt = cloud.cleanup(config, closed_prs=closed, cloud=client)
    (root / "jems-cleanup.json").write_text(json.dumps(receipt, indent=2) + "\n")
    gh.retire(api, receipt)
    if config.get("directoryIssue"):
        gh.directory(api, config["directoryIssue"])
    print(json.dumps(receipt))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("prepare", "config", "recheck", "deploy", "cleanup"))
    args = parser.parse_args()
    root = Path(os.environ.get("RUNNER_TEMP", "work/environment-automation")).resolve()
    root.mkdir(parents=True, exist_ok=True)
    try:
        if args.command == "config":
            configuration()
        else:
            globals()[args.command](root)
    except (AutomationError, cloud.EnvironmentError, gh.GitHubError, bundle.BundleError,
            OSError, ValueError, KeyError, TypeError) as error:
        message = str(error) if isinstance(error, (AutomationError, cloud.EnvironmentError, gh.GitHubError, bundle.BundleError)) else "INVALID_CONTROLLER_INPUT"
        raise SystemExit("JEMS_ENVIRONMENT_BLOCKED: " + message) from None


if __name__ == "__main__":
    main()
