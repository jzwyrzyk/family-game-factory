#!/usr/bin/env python3
"""Resolve the two known conflicts only, in the local integration preparation branch.

This does not stage, commit, push, or modify another checkout. The caller must
provide the exact final native/generated commit, never a moving branch name.
"""
import json
from pathlib import Path
import re
import subprocess
import sys

REVIEW_BRANCH = "integration/game-quality-main-20261116"
MAIN_SHA = "ca73ceba4ae2c79f9f669c3fcbaa66922230d601"


def git(*args):
    return subprocess.check_output(["git", *args], text=True).strip()


def file_at(commit, name):
    return subprocess.check_output(["git", "show", f"{commit}:{name}"], text=True)


if len(sys.argv) != 2 or not re.fullmatch(r"[0-9a-f]{40}", sys.argv[1]):
    raise SystemExit("Pass the exact 40-character final native/generated commit.")
quality_sha = sys.argv[1]
if git("branch", "--show-current") != REVIEW_BRANCH:
    raise SystemExit("Refusing to change files outside the local integration preparation branch.")
if git("rev-parse", "HEAD") != quality_sha or git("rev-parse", "MERGE_HEAD") != MAIN_SHA:
    raise SystemExit("Unexpected merge parents; no files changed.")
conflicts = set(git("diff", "--name-only", "--diff-filter=U").splitlines())
if not conflicts.issubset({"package.json", "src/main.ts"}):
    raise SystemExit("Unexpected conflicts; review manually: " + ", ".join(sorted(conflicts)))

# Start from FINAL quality scripts and dependencies, preserving newer runners,
# generated-runtime build hooks and future native checks. Add only Studio hooks.
package = json.loads(file_at(quality_sha, "package.json"))
studio_package = json.loads(file_at(MAIN_SHA, "package.json"))
if package.get("dependencies", {}).get("planck") != "1.4.2":
    raise SystemExit("Unexpected Planck dependency; review the new baseline first.")
scripts = package["scripts"]
for key in ("test:studio", "test:coach"):
    scripts[key] = studio_package["scripts"][key]
steps = [s for s in scripts["test"].split(" && ") if s not in ("npm run test:studio", "npm run test:coach")]
index = steps.index("npm run test:real-agent") if "npm run test:real-agent" in steps else len(steps)
steps[index:index] = ["npm run test:studio", "npm run test:coach"]
scripts["test"] = " && ".join(steps)

# Both branches appended an initializer to the same common-base file. Keep all
# final native code, then the Studio addition already merged into pinned main.
base = git("merge-base", quality_sha, MAIN_SHA)
base_main = file_at(base, "src/main.ts")
studio_main = file_at(MAIN_SHA, "src/main.ts")
quality_main = file_at(quality_sha, "src/main.ts")
if not studio_main.startswith(base_main) or "installStudio" in quality_main:
    raise SystemExit("src/main.ts has unexpected edits; review manually.")
studio_suffix = studio_main[len(base_main):]
if "installStudio().then(installStudioHostNavigation)" not in studio_suffix:
    raise SystemExit("Pinned Studio initialization was not found.")

Path("package.json").write_text(json.dumps(package, indent=2) + "\n")
Path("src/main.ts").write_text(quality_main.rstrip() + "\n" + studio_suffix)
print("Resolved package.json and src/main.ts. Review and stage these two files; nothing was committed or pushed.")
