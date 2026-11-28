"""Promote exact TEST OCI manifests inside the existing protected publisher."""

import hashlib
import os
from pathlib import Path
import subprocess

from production_gate import (
    ROOT,
    RECORD,
    ORDER,
    TEST_REGISTRY,
    digest,
    gh,
    json_bytes,
    manifest,
    require,
    validate,
)


def copy_images(record, read, execute, directory, current):
    validate(record)
    m = record["manifest"]
    chain = record["supplyChain"]
    report = json_bytes(
        read(
            [
                "node",
                "scripts/beta/test-service-images.mjs",
                "verify",
                m["sourceSha"],
                chain["testTrigger"],
                chain["testBuild"],
            ]
        )
    )
    require(
        report["source"] == m["sourceSha"]
        and report["trigger"] == chain["testTrigger"]
        and report["build"] == chain["testBuild"],
        "Wrong TEST source or builder",
    )
    images = {role: f"{TEST_REGISTRY}/{role}@" + m["backends"][role].split("@")[1] for role in ORDER}
    require(report["images"] == images, "TEST images differ from approved package")
    subjects = []
    for role, origin in images.items():
        target, checksum = m["backends"][role].split("@")
        current()
        tag = target + ":approved-" + digest(record)
        execute(
            ["skopeo", "copy", "--all", "--preserve-digests", "docker://" + origin, "docker://" + tag],
            check=True,
            timeout=240,
        )
        actual = read(["skopeo", "inspect", "--raw", "docker://" + tag])
        require("sha256:" + hashlib.sha256(actual).hexdigest() == checksum, "Registry changed image digest")
        subjects.append(checksum.removeprefix("sha256:") + "  " + target)
    current()
    (directory / "subject-checksums.txt").write_text("\n".join(subjects) + "\n")
    (directory / "receipt.json").write_bytes(
        manifest.canonical(
            {
                "source": m["sourceSha"],
                "packageSha256": digest(record),
                "images": m["backends"],
                "testBuild": chain["testBuild"],
                "testTrigger": chain["testTrigger"],
            }
        )
    )


if __name__ == "__main__":

    def current():
        require(
            gh.GitHub().request(gh.PREFIX + "/git/ref/heads/main")["object"]["sha"]
            == os.environ["GITHUB_SHA"],
            "Protected source changed",
        )

    copy_images(
        json_bytes((ROOT / RECORD).read_bytes()),
        subprocess.check_output,
        subprocess.run,
        Path(os.environ["RUNNER_TEMP"]),
        current,
    )
