"""Bounded public readback after Pages promotion or restoration."""

import json
import os
from pathlib import Path
import time
import urllib.error
import urllib.request

from production_gate import ROOT, manifest, matches, require

MARKER = "https://jzwyrzyk.github.io/family-game-factory/jems-release.json"


def read_marker(url):
    with urllib.request.urlopen(url, timeout=10) as response:
        require(response.geturl() == url and response.status == 200, "Unexpected website response")
        data = response.read(2049)
        require(len(data) <= 2048, "Release marker exceeds boundary")
        return json.loads(data)


def verify(source, mode, run, *, reader=read_marker, pause=time.sleep):
    require(matches(source, manifest.SHA) and matches(run, r"[1-9][0-9]*"), "Invalid release identity")
    require(mode in ("household", "welcome-only"), "Unknown delivery policy")
    expected = {"sourceSha": source}
    if mode == "welcome-only":
        expected["delivery"] = mode
    for attempt in range(12):
        try:
            if reader(f"{MARKER}?release={run}-{attempt}") == expected:
                return
        except (OSError, ValueError):
            pass
        if attempt < 11:
            pause(10)
    raise ValueError("WEBSITE_MARKER_MISMATCH: use the approved recovery procedure")


if __name__ == "__main__":
    mode = json.loads((ROOT / "ops/pages-delivery.json").read_bytes())["mode"]
    verify(os.environ["RELEASE_SOURCE"], mode, os.environ["GITHUB_RUN_ID"])
