#!/usr/bin/env python3
"""Run a complete, checked partition of npm test on isolated CI runners.

Each job must build the selected application source before invoking its shard.
Only test:browser is split: its independent commands already run as separate
steps in Arcade journeys. Other suites keep their existing command ordering.
The private worker carries the same reviewed helper so its frozen application
source need not change just to repair release orchestration.
"""
import argparse
from collections import Counter
import json
from pathlib import Path
import shlex
import subprocess
import sys
import time


def npm(*names):
    return tuple("npm run test:" + name for name in names)


SHARDS = {
    "core": npm("unit", "deployment", "gem-progress", "rewards", "art",
                "creation", "problem-solving", "pals"),
    "learning": npm("learning-ui", "learning-integration", "parent-dashboard-browser",
                    "language-ui", "language-integration", "problem-solving-browser"),
    "gameplay": (
        "npm run test:quality",
        "node tests/journeys.cjs",
        "node tests/live-remix.cjs",
        "node --import tsx tests/builder-browser.ts",
        "node --import tsx tests/actions-e2e.ts",
    ),
    "browser-security": (
        "node --import tsx tests/generated-worker-security.ts",
        "node tests/restored-games.cjs",
        "node tests/learning-repair.cjs",
        "node tests/offline-shell.cjs",
        "node tests/construction-touch.cjs",
        "node tests/private-drawings.cjs",
    ),
    "generated": npm("intent-playtest", "intent-repair-browser", "generated-art",
                     "quality-capture"),
    "creative": npm("art-browser", "creation-browser", "rewards-browser", "pals-browser"),
    "studio": npm("studio", "studio-notifications", "gem-journey", "navigation-continuity"),
    "coach": npm("coach", "child-journey", "real-agent"),
}


class CoverageError(ValueError):
    pass


def commands(value):
    """Recognize only a nonempty && chain; never interpret arbitrary shell syntax."""
    if not isinstance(value, str) or not value.strip():
        raise CoverageError("REGRESSION_COMMAND_INVALID")
    result = []
    for command in value.split("&&"):
        try:
            tokens = shlex.split(command)
        except ValueError as error:
            raise CoverageError("REGRESSION_COMMAND_INVALID") from error
        if not tokens or any(any(c in word for c in "|;&<>`$\n\r") for word in tokens):
            raise CoverageError("REGRESSION_COMMAND_INVALID")
        result.append(tuple(tokens))
    return result


def verify_coverage(package, shards=SHARDS):
    """Reject missing, duplicated, newly unassigned or malformed test commands."""
    scripts = package.get("scripts") if isinstance(package, dict) else None
    if not isinstance(scripts, dict):
        raise CoverageError("REGRESSION_SCRIPTS_MISSING")
    top = commands(scripts.get("test"))
    if top[0] != ("npm", "run", "build") or top.count(("npm", "run", "build")) != 1:
        raise CoverageError("REGRESSION_BUILD_REQUIRED")
    if not isinstance(scripts.get("build"), str) or not scripts["build"].strip():
        raise CoverageError("REGRESSION_BUILD_REQUIRED")
    expected = []
    for command in top[1:]:
        if len(command) != 3 or command[:2] != ("npm", "run") or not command[2].startswith("test:"):
            raise CoverageError("REGRESSION_TOP_LEVEL_COMMAND_INVALID")
        if not isinstance(scripts.get(command[2]), str) or not scripts[command[2]].strip():
            raise CoverageError("REGRESSION_SCRIPT_MISSING")
        expected.extend(commands(scripts["test:browser"]) if command[2] == "test:browser" else [command])
    assigned = []
    for shard, entries in shards.items():
        if not isinstance(shard, str) or not entries:
            raise CoverageError("REGRESSION_EMPTY_SHARD")
        for entry in entries:
            parsed = commands(entry)
            if len(parsed) != 1:
                raise CoverageError("REGRESSION_ASSIGNMENT_INVALID")
            command = parsed[0]
            if command[:2] == ("npm", "run") and (len(command) != 3 or not isinstance(scripts.get(command[2]), str)):
                raise CoverageError("REGRESSION_SCRIPT_MISSING")
            assigned.append(command)
    if len(set(expected)) != len(expected) or len(set(assigned)) != len(assigned):
        raise CoverageError("REGRESSION_DUPLICATE_COMMAND")
    if Counter(expected) != Counter(assigned):
        raise CoverageError("REGRESSION_COVERAGE_MISMATCH")
    return {"suites": len(top) - 1, "commands": len(expected), "shards": len(shards)}


def run_shard(source, shard, run=subprocess.run, emit=print):
    if shard not in SHARDS:
        raise CoverageError("REGRESSION_UNKNOWN_SHARD")
    for command in SHARDS[shard]:
        started = time.monotonic()
        emit(f"REGRESSION_START shard={shard} command={command}", flush=True)
        result = run(shlex.split(command), cwd=source, check=False)
        elapsed = round(time.monotonic() - started, 1)
        emit(f"REGRESSION_END shard={shard} seconds={elapsed} exit={result.returncode}", flush=True)
        if result.returncode != 0:
            return result.returncode if result.returncode > 0 else 1
    emit(f"REGRESSION_SHARD_PASSED={shard}", flush=True)
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=Path.cwd())
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true", help="Verify complete coverage without running tests")
    mode.add_argument("--shard", choices=tuple(SHARDS))
    args = parser.parse_args(argv)
    source = args.source.resolve()
    try:
        package = json.loads((source / "package.json").read_text())
        coverage = verify_coverage(package)
        print("REGRESSION_COVERAGE_VERIFIED " + json.dumps(coverage, sort_keys=True), flush=True)
        if args.check:
            return 0
        if not (source / "dist" / "index.html").is_file():
            raise CoverageError("REGRESSION_BUILD_OUTPUT_MISSING")
        (source / "test-results").mkdir(exist_ok=True)
        return run_shard(source, args.shard)
    except (CoverageError, OSError, json.JSONDecodeError) as error:
        print(f"REGRESSION_FAILED {error}", file=sys.stderr, flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
