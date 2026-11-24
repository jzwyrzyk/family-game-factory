#!/usr/bin/env python3
"""Trusted-main GitHub adapter for nonproduction previews.

Never imports or executes code from a PR artifact. All repository, workflow,
run, source, current-head and required-check decisions come from authenticated
GitHub metadata. The only downloadable payload is a bounded ZIP containing one
bundle.tgz; bundle.py independently validates that inner data archive.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import resource
import subprocess
import zipfile
from typing import Any

REPOSITORY = "jzwyrzyk/family-game-factory"
REPOSITORY_ID = 1458033181
PREFIX = f"repos/{REPOSITORY}"
BUNDLE_WORKFLOW = ".github/workflows/jems-preview-build.yml"
TRIGGER_WORKFLOWS = {
    BUNDLE_WORKFLOW,
    ".github/workflows/test.yml",
    ".github/workflows/documentation.yml",
    ".github/workflows/jems-operations-contracts.yml",
}
CHECK_WORKFLOWS = {
    "browser": ".github/workflows/test.yml",
    "learning": ".github/workflows/test.yml",
    "creative": ".github/workflows/test.yml",
    "private-coach-image": ".github/workflows/test.yml",
    "Jems operations policy": ".github/workflows/jems-operations-contracts.yml",
    "Documentation references": ".github/workflows/documentation.yml",
}
SHA = re.compile(r"[0-9a-f]{40}\Z")
DIGEST = re.compile(r"[0-9a-f]{64}\Z")
MAX_ARCHIVE = 512 * 1024 * 1024
MAX_PAGES = 20
COMMENT_MARKER = "<!-- jems-nonproduction-preview:v1 -->"
DIRECTORY_MARKER = "<!-- jems-environment-directory:v1 -->"


class GitHubError(ValueError):
    """Sanitized public failure; never includes raw API errors or credentials."""


def positive_int(value: Any, label: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise GitHubError(f"INVALID_{label}")
    return value


def sha(value: Any) -> str:
    if not isinstance(value, str) or not SHA.fullmatch(value):
        raise GitHubError("INVALID_SOURCE_SHA")
    return value


class GitHub:
    """Authenticated gh API transport with a fixed repository boundary."""

    @staticmethod
    def _endpoint(endpoint: str) -> str:
        if not endpoint.startswith(PREFIX + "/") or any(c in endpoint for c in "\n\r#"):
            raise GitHubError("FOREIGN_API_ENDPOINT")
        if ".." in endpoint or "://" in endpoint:
            raise GitHubError("INVALID_API_ENDPOINT")
        return endpoint

    def request(self, endpoint: str, method: str = "GET", data: dict | None = None) -> Any:
        command = ["gh", "api", self._endpoint(endpoint), "--method", method]
        if data is not None:
            command += ["--input", "-"]
        try:
            result = subprocess.run(
                command, input=None if data is None else json.dumps(data),
                capture_output=True, text=True, check=True, timeout=90,
                env={**os.environ, "GH_DEBUG": "", "GH_PROMPT_DISABLED": "1"},
            )
            if len(result.stdout) > 16 * 1024 * 1024:
                raise GitHubError("API_RESPONSE_TOO_LARGE")
            return json.loads(result.stdout)
        except (subprocess.SubprocessError, OSError, json.JSONDecodeError):
            raise GitHubError("GITHUB_API_FAILED") from None

    def pages(self, endpoint: str, key: str | None = None) -> list:
        values: list = []
        separator = "&" if "?" in endpoint else "?"
        for page in range(1, MAX_PAGES + 1):
            response = self.request(f"{endpoint}{separator}per_page=100&page={page}")
            rows = response.get(key) if key is not None and isinstance(response, dict) else response
            if not isinstance(rows, list):
                raise GitHubError("INVALID_API_COLLECTION")
            values.extend(rows)
            if len(rows) < 100:
                return values
        raise GitHubError("API_COLLECTION_TRUNCATED")

    def download(self, artifact_id: int, destination: Path) -> None:
        positive_int(artifact_id, "ARTIFACT_ID")
        command = ["gh", "api", f"{PREFIX}/actions/artifacts/{artifact_id}/zip"]
        def bounded_output() -> None:
            # GitHub-hosted Linux runner: stop an oversized response while it is
            # arriving, rather than trusting remote size metadata until EOF.
            resource.setrlimit(resource.RLIMIT_FSIZE, (MAX_ARCHIVE, MAX_ARCHIVE))
        try:
            with destination.open("xb") as output:
                subprocess.run(command, stdout=output, stderr=subprocess.PIPE, check=True,
                               timeout=180, preexec_fn=bounded_output,
                               env={**os.environ, "GH_DEBUG": "", "GH_PROMPT_DISABLED": "1"})
            if destination.stat().st_size > MAX_ARCHIVE:
                raise GitHubError("ARTIFACT_TOO_LARGE")
        except (subprocess.SubprocessError, OSError):
            raise GitHubError("ARTIFACT_DOWNLOAD_FAILED") from None


def _same_repository(value: Any) -> bool:
    return isinstance(value, dict) and value.get("id") == REPOSITORY_ID and value.get("full_name") == REPOSITORY


def _valid_run(run: Any, source: str, workflow: str | None = None) -> bool:
    return (isinstance(run, dict) and _same_repository(run.get("repository"))
            and _same_repository(run.get("head_repository")) and run.get("head_sha") == source
            and (workflow is None or run.get("path") == workflow)
            and run.get("status") == "completed" and run.get("conclusion") == "success")


def _latest(runs: list) -> dict | None:
    if not runs:
        return None
    for run in runs:
        positive_int(run.get("id"), "RUN_ID")
        positive_int(run.get("run_attempt", 1), "RUN_ATTEMPT")
    return max(runs, key=lambda r: (r["id"], r.get("run_attempt", 1)))


def required_checks(ruleset: dict) -> list[dict]:
    checks = [check for rule in ruleset.get("rules", []) if rule.get("type") == "required_status_checks"
              for check in rule.get("parameters", {}).get("required_status_checks", [])]
    if not checks or any(c.get("context") not in CHECK_WORKFLOWS or c.get("integration_id") != 15368 for c in checks):
        raise GitHubError("INVALID_REQUIRED_CHECK_POLICY")
    return checks


def check_provenance(api: GitHub, check: dict, source: str) -> bool:
    """A same-named Actions check from a different workflow cannot satisfy policy.

    PR code remains untrusted even after checks pass. These checks establish
    source eligibility, never cloud authority. Trusted-main deployment serves
    the resulting data under a role-free identity and never runs PR scripts.
    """
    details = check.get("details_url", "")
    if not isinstance(details, str):
        return False
    match = re.fullmatch(r"https://github\.com/" + re.escape(REPOSITORY) + r"/actions/runs/([1-9][0-9]*)/job/([1-9][0-9]*)(?:\?pr=[1-9][0-9]*)?", details)
    if not match:
        return False
    run_id, job_id = map(int, match.groups())
    job = api.request(f"{PREFIX}/actions/jobs/{job_id}")
    if (job.get("id") != job_id or job.get("run_id") != run_id
            or job.get("name") != check.get("name") or job.get("head_sha") != source
            or job.get("status") != "completed" or job.get("conclusion") != "success"
            or job.get("check_run_url") != f"https://api.github.com/{PREFIX}/check-runs/{check.get('id')}"):
        return False
    parent = api.request(f"{PREFIX}/actions/runs/{run_id}")
    return (parent.get("event") in ("push", "pull_request")
            and _valid_run(parent, source, CHECK_WORKFLOWS.get(check.get("name"))))


def check_source(api: GitHub, source: str, policy: list[dict]) -> bool:
    checks = api.pages(f"{PREFIX}/commits/{source}/check-runs?filter=all", "check_runs")
    for requirement in policy:
        matching = [c for c in checks if c.get("name") == requirement["context"]
                    and c.get("app", {}).get("id") == requirement["integration_id"]
                    and c.get("head_sha") == source]
        if not matching:
            return False
        # A new failed/in-progress rerun must never be replaced by an old pass.
        current = max(matching, key=lambda c: positive_int(c.get("id"), "CHECK_ID"))
        if current.get("status") != "completed" or current.get("conclusion") != "success":
            return False
        if not check_provenance(api, current, source):
            return False
    runs = api.pages(f"{PREFIX}/actions/workflows/test.yml/runs?head_sha={source}&event=push", "workflow_runs")
    current = _latest(runs)
    return current is not None and current.get("event") == "push" and _valid_run(current, source, ".github/workflows/test.yml")


def _current_target(api: GitHub, source: str) -> tuple[str, int | None]:
    main = api.request(f"{PREFIX}/git/ref/heads/main")
    if main.get("object", {}).get("sha") == source:
        return "test", None
    candidates = api.pages(f"{PREFIX}/commits/{source}/pulls")
    current = [p for p in candidates if p.get("state") == "open"
               and p.get("head", {}).get("sha") == source
               and _same_repository(p.get("head", {}).get("repo"))
               and _same_repository(p.get("base", {}).get("repo"))
               and p.get("base", {}).get("ref") == "main"]
    if len(current) != 1:
        raise GitHubError("NO_UNIQUE_CURRENT_PR")
    return "dev", positive_int(current[0].get("number"), "PR_NUMBER")


def current_target(api: GitHub, candidate: dict) -> bool:
    """Call immediately before cloud mutation and again before success reporting."""
    try:
        return _current_target(api, sha(candidate.get("sourceSha"))) == (candidate.get("environment"), candidate.get("prNumber"))
    except GitHubError:
        return False


def _artifact(api: GitHub, run: dict, source: str) -> dict:
    artifacts = api.pages(f"{PREFIX}/actions/runs/{run['id']}/artifacts", "artifacts")
    matching = [a for a in artifacts if a.get("name") == "jems-site-bundle"]
    if not matching:
        raise GitHubError("NO_DEPLOYABLE_BUNDLE")
    if len(matching) != 1:
        raise GitHubError("NO_UNIQUE_BUNDLE_ARTIFACT")
    artifact = matching[0]
    positive_int(artifact.get("id"), "ARTIFACT_ID")
    size = positive_int(artifact.get("size_in_bytes"), "ARTIFACT_SIZE")
    metadata = artifact.get("workflow_run", {})
    if (artifact.get("expired") is not False or size > MAX_ARCHIVE
            or metadata.get("id") != run["id"] or metadata.get("head_sha") != source
            or metadata.get("head_repository_id") != REPOSITORY_ID
            or metadata.get("repository_id") != REPOSITORY_ID):
        raise GitHubError("ARTIFACT_PROVENANCE_MISMATCH")
    digest = artifact.get("digest")
    if not isinstance(digest, str) or not re.fullmatch(r"sha256:[0-9a-f]{64}", digest):
        raise GitHubError("MISSING_ARTIFACT_DIGEST")
    return artifact


def extract_artifact(archive: Path, destination: Path, expected_digest: str) -> str:
    if archive.stat().st_size > MAX_ARCHIVE:
        raise GitHubError("ARTIFACT_TOO_LARGE")
    with archive.open("rb") as file:
        actual_digest = "sha256:" + hashlib.file_digest(file, "sha256").hexdigest()
    if expected_digest != actual_digest:
        raise GitHubError("ARTIFACT_DIGEST_MISMATCH")
    try:
        with zipfile.ZipFile(archive) as payload:
            entries = payload.infolist()
            if len(entries) != 1 or entries[0].filename != "bundle.tgz" or entries[0].is_dir():
                raise GitHubError("INVALID_ARTIFACT_ENVELOPE")
            entry = entries[0]
            if entry.file_size <= 0 or entry.file_size > MAX_ARCHIVE or (entry.external_attr >> 16) & 0o170000 == 0o120000:
                raise GitHubError("INVALID_ARTIFACT_ENTRY")
            if destination.exists():
                raise GitHubError("ARTIFACT_DESTINATION_EXISTS")
            digest = hashlib.sha256()
            total = 0
            with payload.open(entry) as src, destination.open("xb") as out:
                while chunk := src.read(1024 * 1024):
                    total += len(chunk)
                    if total > MAX_ARCHIVE:
                        raise GitHubError("ARTIFACT_TOO_LARGE")
                    digest.update(chunk)
                    out.write(chunk)
            if total != entry.file_size:
                raise GitHubError("ARTIFACT_SIZE_MISMATCH")
            return digest.hexdigest()
    except (zipfile.BadZipFile, RuntimeError, OSError):
        raise GitHubError("INVALID_ARTIFACT_ARCHIVE") from None


def choose_candidate(api: GitHub, run_id: int, policy: list[dict], download_dir: Path | None = None) -> dict:
    """Return a fail-closed candidate; downloads happen only after eligibility."""
    positive_int(run_id, "RUN_ID")
    trigger = api.request(f"{PREFIX}/actions/runs/{run_id}")
    source = sha(trigger.get("head_sha"))
    if trigger.get("path") not in TRIGGER_WORKFLOWS or not _valid_run(trigger, source):
        return {"eligible": False, "reason": "UNTRUSTED_OR_UNSUCCESSFUL_TRIGGER"}
    try:
        environment, pr = _current_target(api, source)
    except GitHubError:
        return {"eligible": False, "reason": "SOURCE_NO_LONGER_CURRENT"}
    if not check_source(api, source, policy):
        return {"eligible": False, "reason": "REQUIRED_CHECKS_PENDING_OR_FAILED"}
    event = "push" if environment == "test" else "pull_request"
    runs = api.pages(f"{PREFIX}/actions/workflows/jems-preview-build.yml/runs?head_sha={source}&event={event}", "workflow_runs")
    current = _latest(runs)
    if current is None or current.get("event") != event or not _valid_run(current, source, BUNDLE_WORKFLOW):
        return {"eligible": False, "reason": "BUNDLE_PENDING_OR_FAILED"}
    if environment == "test" and current.get("head_branch") != "main":
        raise GitHubError("TEST_BUNDLE_NOT_MAIN")
    if environment == "dev" and not any(p.get("number") == pr and p.get("head", {}).get("sha") == source for p in current.get("pull_requests", [])):
        raise GitHubError("BUNDLE_PR_MISMATCH")
    try:
        artifact = _artifact(api, current, source)
    except GitHubError as error:
        if str(error) == "NO_DEPLOYABLE_BUNDLE":
            return {"eligible": False, "reason": "NO_DEPLOYABLE_BUNDLE"}
        raise
    candidate = {"eligible": True, "environment": environment, "prNumber": pr,
                 "sourceSha": source, "runId": current["id"], "artifactId": artifact["id"],
                 "artifactDigest": artifact["digest"]}
    if download_dir is not None:
        download_dir.mkdir(parents=True, exist_ok=True)
        archive = download_dir / f"artifact-{artifact['id']}.zip"
        bundle = download_dir / "bundle.tgz"
        api.download(artifact["id"], archive)
        candidate["bundleSha256"] = extract_artifact(archive, bundle, artifact["digest"])
        candidate["bundlePath"] = str(bundle.resolve())
        archive.unlink()
        # Re-read immutable artifact metadata; deletion/replacement/expiry is not ignored.
        refreshed = _artifact(api, current, source)
        if refreshed["id"] != artifact["id"] or refreshed["digest"] != artifact["digest"]:
            raise GitHubError("ARTIFACT_CHANGED_DURING_DOWNLOAD")
    if not current_target(api, candidate):
        return {"eligible": False, "reason": "SOURCE_CHANGED_DURING_VALIDATION"}
    return candidate


def _safe_url(value: Any) -> str:
    if not isinstance(value, str) or not re.fullmatch(r"https://jems-(?:dev-pr-[1-9][0-9]*|test)-[a-z0-9-]+\.(?:[a-z0-9-]+\.)?run\.app/?", value):
        raise GitHubError("INVALID_NONPRODUCTION_URL")
    return value.rstrip("/")


def validate_receipt(receipt: dict) -> dict:
    source = sha(receipt.get("sourceSha"))
    environment = receipt.get("environment")
    pr = receipt.get("prNumber", receipt.get("pr"))
    if environment == "dev":
        positive_int(pr, "PR_NUMBER")
    elif environment != "test" or pr is not None:
        raise GitHubError("INVALID_ENVIRONMENT_RECEIPT")
    if receipt.get("status") != "deployed":
        raise GitHubError("UNVERIFIED_DEPLOYMENT_RECEIPT")
    digest = receipt.get("bundleSha256")
    if not isinstance(digest, str) or not DIGEST.fullmatch(digest):
        raise GitHubError("INVALID_BUNDLE_DIGEST")
    url = _safe_url(receipt.get("url"))
    expected_name = f"jems-dev-pr-{pr}" if pr is not None else "jems-test"
    if receipt.get("service") != expected_name or not url.startswith(f"https://{expected_name}-"):
        raise GitHubError("DEPLOYMENT_SERVICE_MISMATCH")
    return {"environment": environment, "prNumber": pr, "sourceSha": source, "url": url,
            "service": expected_name, "bundleSha256": digest, "status": "deployed"}


def report(api: GitHub, receipt: dict) -> dict:
    """Only the trusted deployment job may supply a successful cloud receipt."""
    data = validate_receipt(receipt)
    if not current_target(api, data):
        raise GitHubError("SOURCE_CHANGED_BEFORE_REPORTING")
    environment_name = f"dev-pr-{data['prNumber']}" if data["environment"] == "dev" else "test"
    deployment = api.request(f"{PREFIX}/deployments", "POST", {
        "ref": data["sourceSha"], "auto_merge": False, "required_contexts": [],
        "environment": environment_name, "transient_environment": data["environment"] == "dev",
        "production_environment": False, "description": "Private Jems nonproduction fixture website",
        "payload": {"jemsEnvironmentVersion": 1, "bundleSha256": data["bundleSha256"], "service": data["service"]},
    })
    deployment_id = positive_int(deployment.get("id"), "DEPLOYMENT_ID")
    api.request(f"{PREFIX}/deployments/{deployment_id}/statuses", "POST", {
        "state": "success", "environment_url": data["url"], "auto_inactive": True,
        "description": "Fixture site deployed; owner review and complete TEST acceptance remain pending",
    })
    if data["prNumber"] is not None:
        body = (f"{COMMENT_MARKER}\n### DEV preview available\n\n"
                f"[Open private preview]({data['url']}) · Source `{data['sourceSha']}`\n\n"
                "Deterministic disconnected site. Check the affected journeys and screenshots listed in this PR. "
                "Owner visual acceptance is pending; this is not production deployment or live-AI acceptance.\n")
        comments = api.pages(f"{PREFIX}/issues/{data['prNumber']}/comments")
        owned = [c for c in comments if c.get("user", {}).get("login") == "github-actions[bot]"
                 and c.get("body", "").startswith(COMMENT_MARKER)]
        if len(owned) > 1:
            raise GitHubError("DUPLICATE_PREVIEW_COMMENTS")
        if owned:
            api.request(f"{PREFIX}/issues/comments/{positive_int(owned[0].get('id'), 'COMMENT_ID')}", "PATCH", {"body": body})
        else:
            api.request(f"{PREFIX}/issues/{data['prNumber']}/comments", "POST", {"body": body})
    return {**data, "deploymentId": deployment_id, "ownerReview": "pending", "production": "not_deployed"}


def inventory(api: GitHub) -> dict:
    deployments = api.pages(f"{PREFIX}/deployments")
    seen: set[str] = set()
    entries: list[dict] = []
    for deployment in sorted(deployments, key=lambda d: positive_int(d.get("id"), "DEPLOYMENT_ID"), reverse=True):
        name = deployment.get("environment", "")
        if not isinstance(name, str) or not re.fullmatch(r"dev-pr-[1-9][0-9]*|test", name) or name in seen:
            continue
        payload = deployment.get("payload", {})
        expected_service = "jems-test" if name == "test" else "jems-" + name
        if (not isinstance(payload, dict) or payload.get("jemsEnvironmentVersion") != 1
                or payload.get("service") != expected_service or deployment.get("production_environment") is not False):
            continue
        seen.add(name)
        statuses = api.pages(f"{PREFIX}/deployments/{deployment['id']}/statuses")
        status = max(statuses, key=lambda s: positive_int(s.get("id"), "STATUS_ID")) if statuses else {}
        row = {"environment": name, "sourceSha": sha(deployment.get("sha")),
               "state": status.get("state", "unknown"), "deploymentId": deployment["id"]}
        if row["state"] == "success":
            row["url"] = _safe_url(status.get("environment_url"))
        entries.append(row)
    return {"version": 1, "environments": entries, "production": {"status": "not_observed"}}


def retire(api: GitHub, receipt: dict) -> dict:
    """Retire GitHub links only after cloud.py proved each DEV service absent."""
    if receipt.get("status") != "cleanup_verified" or not isinstance(receipt.get("deleted"), list):
        raise GitHubError("UNVERIFIED_CLEANUP_RECEIPT")
    deleted = receipt["deleted"]
    if len(deleted) > 100:
        raise GitHubError("CLEANUP_RECEIPT_TOO_LARGE")
    seen: set[int] = set()
    for row in deleted:
        if not isinstance(row, dict):
            raise GitHubError("INVALID_CLEANUP_ENTRY")
        pr = positive_int(row.get("pr"), "PR_NUMBER")
        if row.get("service") != f"jems-dev-pr-{pr}" or row.get("reason") not in ("closed", "expired") or pr in seen:
            raise GitHubError("INVALID_CLEANUP_ENTRY")
        seen.add(pr)
    deployments = api.pages(f"{PREFIX}/deployments") if deleted else []
    retired: list[int] = []
    for row in deleted:
        for deployment in deployments:
            payload = deployment.get("payload", {})
            if (deployment.get("environment") == f"dev-pr-{row['pr']}"
                    and deployment.get("production_environment") is False
                    and isinstance(payload, dict) and payload.get("jemsEnvironmentVersion") == 1
                    and payload.get("service") == row["service"]):
                identifier = positive_int(deployment.get("id"), "DEPLOYMENT_ID")
                api.request(f"{PREFIX}/deployments/{identifier}/statuses", "POST", {
                    "state": "inactive", "description": f"DEV preview removed: {row['reason']}; cloud absence verified",
                    "auto_inactive": False,
                })
                retired.append(identifier)
        comments = api.pages(f"{PREFIX}/issues/{row['pr']}/comments")
        owned = [c for c in comments if c.get("user", {}).get("login") == "github-actions[bot]"
                 and c.get("body", "").startswith(COMMENT_MARKER)]
        if len(owned) > 1:
            raise GitHubError("DUPLICATE_PREVIEW_COMMENTS")
        if owned:
            api.request(f"{PREFIX}/issues/comments/{positive_int(owned[0].get('id'), 'COMMENT_ID')}", "PATCH", {
                "body": f"{COMMENT_MARKER}\n### DEV preview removed\n\nThe temporary site was removed because its PR is {row['reason']}. No production deployment is implied.\n",
            })
    return {"status": "retired", "deploymentIds": retired}


def directory(api: GitHub, issue_number: int) -> dict:
    positive_int(issue_number, "DIRECTORY_ISSUE")
    issue = api.request(f"{PREFIX}/issues/{issue_number}")
    if "pull_request" in issue or not issue.get("body", "").startswith(DIRECTORY_MARKER):
        raise GitHubError("DIRECTORY_ISSUE_NOT_OPTED_IN")
    data = inventory(api)
    lines = [DIRECTORY_MARKER, "# Jems environment directory", "", "Private sites require their nonproduction IAP sign-in.", "",
             "| Environment | Available website | Status |", "| --- | --- | --- |"]
    for row in data["environments"]:
        link = f"[Open]({row['url']})" if row.get("url") else "Unavailable"
        state = "Awaiting owner review (fixture site)" if row["state"] == "success" else row["state"]
        if not isinstance(state, str) or not re.fullmatch(r"[A-Za-z ()-]+", state):
            state = "Unknown"
        lines.append(f"| {row['environment']} | {link} | {state} |")
    if not data["environments"]:
        lines.append("| DEV / TEST | Not deployed | Setup pending |")
    lines += ["", "[Production website](https://jzwyrzyk.github.io/arcade/) — production release status is not inferred from merges or nonproduction deployments.",
              "[Current release evidence](https://github.com/jzwyrzyk/family-game-factory/blob/main/DELIVERY-STATE.md)",
              "", "Complete TEST journeys, live-provider acceptance and exact-release production approval are separate gates."]
    api.request(f"{PREFIX}/issues/{issue_number}", "PATCH", {"body": "\n".join(lines) + "\n"})
    return data


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    candidate = commands.add_parser("choose-candidate")
    candidate.add_argument("--run-id", type=int, required=True)
    candidate.add_argument("--out", type=Path, required=True)
    candidate.add_argument("--download-dir", type=Path)
    candidate.add_argument("--ruleset", type=Path, default=Path("ops/github-main-ruleset.json"))
    verify = commands.add_parser("check-current")
    verify.add_argument("--candidate", type=Path, required=True)
    listing = commands.add_parser("inventory")
    listing.add_argument("--out", type=Path, required=True)
    reporting = commands.add_parser("report")
    reporting.add_argument("--receipt", type=Path, required=True)
    reporting.add_argument("--directory-issue", type=int)
    retiring = commands.add_parser("retire")
    retiring.add_argument("--receipt", type=Path, required=True)
    retiring.add_argument("--directory-issue", type=int)
    refresh = commands.add_parser("directory")
    refresh.add_argument("--directory-issue", type=int, required=True)
    args = parser.parse_args()
    api = GitHub()
    try:
        if args.command == "choose-candidate":
            result = choose_candidate(api, args.run_id, required_checks(json.loads(args.ruleset.read_text())), args.download_dir)
        elif args.command == "check-current":
            if not current_target(api, json.loads(args.candidate.read_text())):
                raise GitHubError("SOURCE_NO_LONGER_CURRENT")
            result = {"current": True}
        elif args.command == "inventory":
            result = inventory(api)
        elif args.command == "directory":
            result = directory(api, args.directory_issue)
        elif args.command == "retire":
            result = retire(api, json.loads(args.receipt.read_text()))
            if args.directory_issue:
                directory(api, args.directory_issue)
        else:
            result = report(api, json.loads(args.receipt.read_text()))
            if args.directory_issue:
                directory(api, args.directory_issue)
        if hasattr(args, "out"):
            args.out.parent.mkdir(parents=True, exist_ok=True)
            args.out.write_text(json.dumps(result, indent=2) + "\n")
        print(json.dumps(result))
        return 0
    except (GitHubError, OSError, json.JSONDecodeError) as error:
        print(json.dumps({"error": str(error) if isinstance(error, GitHubError) else "INVALID_LOCAL_INPUT", "eligible": False}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
