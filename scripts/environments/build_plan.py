#!/usr/bin/env python3
"""Decide preview work cumulatively, never from only the last pushed commit.

DEV compares the whole PR to its merge base and replaces previously deployed
application changes even when they have all been reverted. TEST compares the current source
to the last observed successful, owned TEST deployment. An unknown, failed,
unavailable or nonancestor deployment baseline always builds; a docs commit
therefore cannot strand an application commit whose earlier CI was cancelled.
This is an unprivileged cost optimization, never a deployment authorization.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import subprocess

import github
import selection


class BuildPlanError(ValueError):
    pass


def git(repo: Path, *args: str) -> bytes:
    try:
        result = subprocess.run(["git", "-C", str(repo), *args], capture_output=True,
                                timeout=30, check=True)
        if len(result.stdout) > 16 * 1024 * 1024:
            raise BuildPlanError("GIT_RESPONSE_TOO_LARGE")
        return result.stdout
    except (OSError, subprocess.SubprocessError):
        raise BuildPlanError("GIT_SOURCE_UNAVAILABLE") from None


def commit(repo: Path, value: str) -> str:
    try:
        github.sha(value)
    except github.GitHubError:
        raise BuildPlanError("FULL_SOURCE_SHA_REQUIRED") from None
    git(repo, "cat-file", "-e", f"{value}^{{commit}}")
    return value


def changes(repo: Path, baseline: str, source: str) -> list[str]:
    value = git(repo, "diff", "--name-only", "--no-renames", "-z", baseline, source, "--")
    try:
        return [path.decode("utf-8") for path in value.split(b"\0") if path]
    except UnicodeDecodeError:
        raise BuildPlanError("UNSUPPORTED_SOURCE_PATH") from None


def plan(*, source: str, base: str, kind: str, repo: Path = Path.cwd(), api=None,
         pr_number: int | None = None) -> dict:
    source = commit(repo, source)
    if kind not in ("dev", "test"):
        raise BuildPlanError("INVALID_ENVIRONMENT_KIND")
    if pr_number is not None:
        try:
            github.positive_int(pr_number, "PR_NUMBER")
        except github.GitHubError:
            raise BuildPlanError("INVALID_PR_NUMBER") from None
        if kind != "dev":
            raise BuildPlanError("PR_NUMBER_REQUIRES_DEV")
    baseline = None
    if kind == "dev":
        base = commit(repo, base)
        # Current main may have unrelated commits since the PR branched. The
        # common ancestor preserves the actual cumulative PR change set.
        baseline = git(repo, "merge-base", base, source).decode("ascii").strip()
        commit(repo, baseline)
    else:
        # The push event's before SHA is intentionally not a TEST baseline:
        # that commit may never have passed CI or reached the actual website.
        try:
            state = github.inventory(api or github.GitHub())
            entries = [row for row in state["environments"] if row.get("environment") == "test"]
            if len(entries) == 1 and entries[0].get("state") == "success":
                candidate = commit(repo, entries[0].get("sourceSha"))
                git(repo, "merge-base", "--is-ancestor", candidate, source)
                baseline = candidate
        except (github.GitHubError, BuildPlanError, KeyError, TypeError, ValueError):
            baseline = None
        if baseline is None:
            return {"version": 1, "kind": kind, "sourceSha": source, "baselineSha": None,
                    "previewRequired": True, "reason": "TEST_BASELINE_UNVERIFIED_BUILD_CURRENT_SOURCE",
                    "requiredCiUnchanged": True}
    paths = changes(repo, baseline, source)
    try:
        selected = selection.select(paths)
    except ValueError:
        raise BuildPlanError("INVALID_CHANGED_SOURCE_PATH") from None
    if kind == "test" and "tests/environments/deployed-smoke.cjs" in paths:
        # A successful deployment record precedes its browser acceptance. Run a
        # changed live verifier on an exact main-source bundle through this lane.
        selected.update(previewRequired=True, reason="TEST_BROWSER_VERIFIER_CHANGED")
    if kind == "dev" and not selected["previewRequired"] and pr_number is not None:
        # A cumulative docs-only diff can be the result of reverting an app
        # change already served by this PR's preview. Compare with that actual
        # deployment before deciding to leave the old website in place.
        try:
            state = github.inventory(api or github.GitHub())
            entries = [row for row in state["environments"] if row.get("environment") == f"dev-pr-{pr_number}"]
            if entries:
                if len(entries) != 1 or entries[0].get("state") != "success":
                    raise BuildPlanError("DEV_PREVIEW_BASELINE_UNVERIFIED")
                previous = commit(repo, entries[0].get("sourceSha"))
                git(repo, "merge-base", "--is-ancestor", previous, source)
                previous_paths = changes(repo, previous, source)
                previous_selection = selection.select(previous_paths)
                if previous_selection["previewRequired"]:
                    baseline, paths, selected = previous, previous_paths, previous_selection
                    selected["reason"] = "DEV_PREVIEW_REVERSION_REQUIRES_CURRENT_SOURCE"
        except (github.GitHubError, BuildPlanError, KeyError, TypeError, ValueError):
            return {"version": 1, "kind": kind, "sourceSha": source, "baselineSha": None,
                    "previewRequired": True, "reason": "DEV_PREVIEW_BASELINE_UNVERIFIED_BUILD_CURRENT_SOURCE",
                    "requiredCiUnchanged": True}
    return {"version": 1, "kind": kind, "sourceSha": source, "baselineSha": baseline,
            "previewRequired": selected["previewRequired"], "reason": selected["reason"],
            "mode": selected["mode"], "changedPathCount": len(paths), "requiredCiUnchanged": True}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True)
    parser.add_argument("--base", required=True, help="PR base SHA; TEST ignores push-before as a deployment baseline")
    parser.add_argument("--kind", required=True, choices=("dev", "test"))
    parser.add_argument("--pr", type=int, help="DEV PR number used to replace a stale preview after app changes are reverted")
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    try:
        result = plan(source=args.source, base=args.base, kind=args.kind, pr_number=args.pr)
        if args.out:
            args.out.parent.mkdir(parents=True, exist_ok=True)
            args.out.write_text(json.dumps(result, indent=2) + "\n")
        if os.environ.get("GITHUB_OUTPUT"):
            with open(os.environ["GITHUB_OUTPUT"], "a") as output:
                output.write("needed=" + str(result["previewRequired"]).lower() + "\n")
        print(json.dumps(result))
        return 0
    except BuildPlanError as error:
        print(json.dumps({"error": str(error)}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
