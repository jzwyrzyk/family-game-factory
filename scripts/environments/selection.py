#!/usr/bin/env python3
"""Select supplemental DEV checks; this never removes existing required CI gates."""
import argparse
import json
from pathlib import Path, PurePosixPath


RULES = (
    (("src/pals/", "public/jems-pals/"), ("test:pals", "test:pals-browser", "test:creation-browser")),
    (("src/rewards/",), ("test:rewards", "test:rewards-browser", "test:gem-progress")),
    (("src/learning/",), ("test:learning-ui", "test:learning-integration", "test:learning-readability", "test:play-view")),
    (("src/language/",), ("test:language-ui", "test:language-integration", "test:learning-readability", "test:play-view")),
    (("src/parent/",), ("test:parent-dashboard", "test:parent-dashboard-browser")),
    (("src/drawing/", "src/assets/"), ("test:art", "test:art-browser", "test:creation-browser")),
    (("src/creation/",), ("test:creation", "test:creation-browser", "test:problem-solving", "test:problem-solving-browser")),
    (("src/problem-solving/",), ("test:problem-solving", "test:problem-solving-browser", "test:creation-browser")),
    (("src/games/",), ("test:quality", "test:studio", "test:play-view", "test:child-journey", "test:bubble-gum")),
    (("src/brand/", "public/jems-art/", "public/fonts/"), ("test:brand-assets", "test:studio", "test:gem-journey", "test:navigation-continuity")),
)


def documentation(path):
    return (path.startswith("docs/") or path in {
        "AGENTS.md", "README.md", "PRODUCT-DOCTRINE.md", "ARCHITECTURE-CURRENT.md",
        "DELIVERY-STATE.md", "LICENSE", ".github/PULL_REQUEST_TEMPLATE.md",
    })


def validation_only(path):
    return path.startswith(("tests/", "scripts/tests/", ".github/", "ops/", "scripts/ops/")) or path == "scripts/check-docs.mjs"


def select(paths):
    paths = list(paths)
    result = {"version": 1, "scope": "supplemental-dev-checks", "requiredCiUnchanged": True,
              "previewRequired": False, "mode": "documentation", "scripts": ["docs:check"]}
    if not paths:
        result["reason"] = "No changed paths supplied; no application preview selected."
        return result
    if any(not isinstance(path, str) or not path or len(path) > 4096 or
           path.startswith("/") or "\\" in path or ".." in PurePosixPath(path).parts or
           any(ord(char) < 32 for char in path) for path in paths):
        raise ValueError("INVALID_CHANGED_PATH")
    paths = sorted(set(paths))
    affected = [path for path in paths if not documentation(path)]
    if not affected:
        result["reason"] = "Documentation-only change; keep documentation checks without a preview."
        return result
    scripts = {"build", "test:unit", "test:navigation-continuity", "docs:check"}
    preview_required = any(not validation_only(path) for path in affected)
    for path in affected:
        matches = [checks for prefixes, checks in RULES if path.startswith(prefixes)]
        if not matches:
            result.update(previewRequired=preview_required, mode="full", scripts=["test", "docs:check"],
                          reason="Shared, security, configuration, test, or unclassified source requires the full existing suite.")
            return result
        for checks in matches:
            scripts.update(checks)
    result.update(previewRequired=True, mode="targeted", scripts=["build"] + sorted(scripts - {"build"}),
                  reason="Feature checks and their browser dependencies supplement unchanged required CI.")
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("paths", nargs="*")
    parser.add_argument("--changed-paths-file", type=Path, help="UTF-8 newline-delimited repository paths")
    args = parser.parse_args()
    paths = args.paths + (args.changed_paths_file.read_text().splitlines() if args.changed_paths_file else [])
    try:
        print(json.dumps(select(paths), sort_keys=True))
    except ValueError as error:
        parser.error(str(error))


if __name__ == "__main__":
    main()
