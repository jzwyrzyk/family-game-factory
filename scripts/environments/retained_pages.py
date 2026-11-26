"""Verify each byte of the original household archive against its known Pages deployment."""

from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
from pathlib import Path
import subprocess
from urllib.parse import quote
from urllib.request import Request, urlopen

REPO = "jzwyrzyk/family-game-factory"
SITE = "https://jzwyrzyk.github.io/family-game-factory/"
SOURCE = "aa56b60abe152e750f9f0b5e8949bdb44be53196"
SIGNER = "cc3da7ef0cdd371f628f9bc51d32d6296f575f8e"
DEPLOYMENT = 8030840457
RUN = 45410210444
HELPER_SHA256 = "b1f6f36385b08195318c264427e5e51038b020284ba5cb1c477a90c14474c231"


def need(condition):
    if not condition:
        raise ValueError("RETAINED_HOUSEHOLD_BYTE_OR_DEPLOYMENT_MISMATCH")


def gh(path):
    return json.loads(
        subprocess.check_output(
            ["gh", "api", "repos/" + REPO + "/" + path], timeout=30, stderr=subprocess.DEVNULL
        )
    )


def deployment(api):
    latest = api("deployments?environment=github-pages&per_page=1")[0]
    need(latest["id"] == DEPLOYMENT and latest["sha"] == SIGNER and latest["environment"] == "github-pages")
    status = api(f"deployments/{DEPLOYMENT}/statuses?per_page=1")[0]
    need(
        status["state"] == "success"
        and status["environment_url"] == SITE
        and status["log_url"] == f"https://github.com/{REPO}/actions/runs/{RUN}/job/138518380833"
    )
    run = api(f"actions/runs/{RUN}")
    need(
        run["head_sha"] == SIGNER
        and run["path"] == ".github/workflows/pages.yml"
        and run["run_attempt"] == 2
        and run["conclusion"] == "success"
        and run["head_branch"] == "main"
        and run["head_repository"]["id"] == 1458033181
        and run["repository"]["id"] == 1458033181
        and run["event"] == "workflow_dispatch"
    )


def read(name, size):
    url = SITE + quote(name, safe="/")
    with urlopen(
        Request(url, headers={"Accept-Encoding": "identity", "Cache-Control": "no-cache"}), timeout=25
    ) as r:
        need(r.geturl() == url and r.status == 200)
        return r.read(size + 1)


def inventory(root, api=gh, fetch=read):
    deployment(api)
    need(json.loads((root / "jems-release.json").read_bytes()) == {"sourceSha": SOURCE})
    paths = list(root.rglob("*"))
    need(
        not any(
            p.is_symlink() or any(part.startswith(".") for part in p.relative_to(root).parts) for p in paths
        )
    )
    files = sorted(p for p in paths if p.is_file())
    need(files and len(files) <= 3000 and sum(p.stat().st_size for p in files) <= 512 * 1024 * 1024)

    def verify(p):
        name = p.relative_to(root).as_posix()
        local = p.read_bytes()
        need(fetch(name, len(local)) == local)
        return [name, len(local), hashlib.sha256(local).hexdigest()]

    with ThreadPoolExecutor(max_workers=6) as pool:
        rows = list(pool.map(verify, files))
    deployment(api)
    return hashlib.sha256(json.dumps(rows, separators=(",", ":")).encode()).hexdigest()


if __name__ == "__main__":
    need(os.environ.get("REVIEWED_SOURCE_SHA") == SOURCE and os.environ.get("DELIVERY_MODE") == "household")
    result = inventory(Path("dist"))
    with open(os.environ["GITHUB_OUTPUT"], "a") as out:
        print("retained=" + result, file=out)
