import base64
import copy
import hashlib
import json
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest
from unittest.mock import patch

import dev_images as images
from dev_contract import DevError


def manifest():
    return {"projectId": "jems-test-dev", "projectNumber": "234567890123", "region": "us-east1", "sourceSha": "a" * 40}


def receipt(m=None, selected=None):
    m = m or manifest()
    return {"version": 1, "environment": "development", "projectId": m["projectId"], "projectNumber": m["projectNumber"],
        "region": m["region"], "sourceSha": m["sourceSha"], "operationId": "12345678-1234-1234-1234-123456789abc",
        "buildId": "23456789-2345-2345-2345-23456789abcd", "sourceArchiveSha256": "b" * 64,
        "components": selected or ["gateway", "preview", "coach", "sandbox"]}


def result(m=None, r=None):
    m = m or manifest()
    r = r or receipt(m)
    source = {"bucket": m["projectId"] + "-build-source", "object": "source/reviewed.tgz", "generation": "1234567890"}
    return {**images.recipe(m, r["components"], r["operationId"]), "id": r["buildId"], "projectId": m["projectId"],
        "status": "SUCCESS", "source": {"storageSource": source},
        "sourceProvenance": {"resolvedStorageSource": source, "fileHashes": {"gs://" + source["bucket"] + "/" + source["object"]:
            {"fileHash": [{"type": "SHA256", "value": base64.b64encode(bytes.fromhex(r["sourceArchiveSha256"])).decode()}]}}},
        "results": {"images": [{"name": images.image_tag(m, c, r["operationId"]), "digest": "sha256:" + "c" * 64} for c in r["components"]]}}


class ImageProvenanceTests(unittest.TestCase):
    def test_exact_build_and_separate_public_sandbox_registry(self):
        m, r = manifest(), receipt()
        actual = images.verify_build_metadata(m, r, result())
        self.assertEqual(set(actual), {"gateway", "preview", "coach", "sandbox"})
        self.assertIn("/jems-dev-sandbox/sandbox@sha256:", actual["sandbox"])
        self.assertIn("/jems-dev-images/gateway@sha256:", actual["gateway"])
        app = images.recipe(m, ["app"], r["operationId"])
        self.assertIn("server/Dockerfile.dev-site-source", app["steps"][0]["args"])
        self.assertIn("REVIEWED_SOURCE_SHA=" + m["sourceSha"], app["steps"][0]["args"])
        self.assertNotIn("secrets", app)

    def test_executable_build_substitution_is_rejected(self):
        mutations = [lambda b: b["steps"][0].update(entrypoint="bash"),
            lambda b: b["steps"][0].update(env=["MALICIOUS=yes"]),
            lambda b: b["options"].update(env=["MALICIOUS=yes"]),
            lambda b: b.update(availableSecrets={"secretManager": [{"env": "KEY"}]}),
            lambda b: b.update(serviceAccount="projects/production/serviceAccounts/owner@example.com"),
            lambda b: b["steps"][0]["args"].append("--network=host"),
            lambda b: b.update(tags=["different-source"]),
            lambda b: b.update(status="WORKING")]
        for mutate in mutations:
            with self.subTest(mutate=mutate):
                b = result();mutate(b)
                with self.assertRaises(DevError):images.verify_build_metadata(manifest(), receipt(), b)
        b = result();b["steps"][0].update(status="SUCCESS", timing={"startTime": "observed"}, exitCode=0)
        images.verify_build_metadata(manifest(), receipt(), b)

    def test_source_generation_hash_and_image_result_substitution_fail(self):
        mutations = [lambda b: b["sourceProvenance"]["resolvedStorageSource"].update(bucket="production"),
            lambda b: b["sourceProvenance"]["resolvedStorageSource"].update(generation=""),
            lambda b: b["sourceProvenance"].update(fileHashes={}),
            lambda b: next(iter(b["sourceProvenance"]["fileHashes"].values()))["fileHash"][0].update(value="bad"),
            lambda b: b["results"]["images"].pop(),
            lambda b: b["results"]["images"][0].update(digest="latest"),
            lambda b: b.update(id="different-build")]
        for mutate in mutations:
            b = result();mutate(b)
            with self.assertRaises(DevError):images.verify_build_metadata(manifest(), receipt(), b)

    def test_receipt_is_bound_to_target_before_cloud_reads(self):
        r = receipt();r["projectId"] = "family-game-factory-jzw"
        with self.assertRaises(DevError):images.verify_existing_build(manifest(), object(), r)

    def test_reuse_requires_identical_selected_backend_source_and_exact_app_source(self):
        m = manifest();old = {**m, "sourceSha": "d" * 40}
        backend, app = receipt(old), receipt(m, ["app"])
        backend["images"] = images.verify_build_metadata(old, backend, result(old, backend))
        app["images"] = images.verify_build_metadata(m, app, result(m, app))
        m["images"] = {**backend["images"], **app["images"]}
        with patch.object(images, "reviewed_archive", return_value=(Path("unused"), backend["sourceArchiveSha256"])), \
                patch.object(images, "verify_existing_build", side_effect=lambda _m, _cloud, r, _root: r):
            verified = images.verify_release_images(m, object(), [backend, app])
            self.assertEqual(verified["images"], m["images"])
            stale = copy.deepcopy(app);stale["sourceSha"] = old["sourceSha"]
            with self.assertRaises(DevError):images.verify_release_images(m, object(), [backend, stale])
        with patch.object(images, "reviewed_archive", return_value=(Path("unused"), "e" * 64)):
            with self.assertRaises(DevError):images.verify_release_images(m, object(), [backend, app])


class ExactAppSourceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="jems-dev-image-test-")
        self.root = Path(self.temp.name) / "source";self.root.mkdir()
        def git(*args):return subprocess.check_output(["git", "-C", str(self.root), *args], stderr=subprocess.DEVNULL)
        self.git = git
        git("init", "--initial-branch=test");git("config", "user.name", "Fixture");git("config", "user.email", "fixture@example.com")
        for filename in images.APP_SCOPE:
            if filename in ("src", "public"):continue
            p = self.root / filename;p.parent.mkdir(parents=True, exist_ok=True);p.write_text("reviewed " + filename)
        (self.root / "src").mkdir();(self.root / "src/main.ts").write_text("export const reviewed = true;")
        (self.root / "public").mkdir();(self.root / "public/factory-config.json").write_text(json.dumps({"version": 1, "mode": "unavailable"}))
        (self.root / "public/art.webp").write_bytes(b"RIFFfixture")
        git("add", ".");git("commit", "-m", "Reviewed fixture")
        self.sha = git("rev-parse", "HEAD").decode().strip()

    def tearDown(self):self.temp.cleanup()

    def archive(self, name):
        target = Path(self.temp.name) / name;target.mkdir()
        return images.app_source_archive(self.root, target, self.sha)

    def test_mutable_bundle_receipts_and_working_tree_cannot_change_archived_git_source(self):
        a, digest = self.archive("first")
        (self.root / "server/dev-site.ts").write_text("malicious modified server")
        (self.root / "public/art.webp").write_bytes(b"modified art")
        (self.root / "dev-site.mjs").write_text("untrusted caller bundle")
        (self.root / "jems-dev-package.json").write_text(json.dumps({"sourceSha": self.sha, "verified": True}))
        b, after = self.archive("second")
        self.assertEqual(digest, after);self.assertEqual(a.read_bytes(), b.read_bytes())
        with tarfile.open(a) as archive:
            self.assertNotIn("dev-site.mjs", archive.getnames());self.assertNotIn("jems-dev-package.json", archive.getnames())
            self.assertNotIn(".dockerignore", archive.getnames())
            self.assertEqual(archive.extractfile("server/dev-site.ts").read(), b"reviewed server/dev-site.ts")

    def test_forged_package_digest_fails_before_contacting_cloud(self):
        m = {**manifest(), "sourceSha": self.sha};r = receipt(m, ["app"])
        r["sourceArchiveSha256"] = hashlib.sha256(b"arbitrary replacement bundle").hexdigest()
        with self.assertRaisesRegex(DevError, "selected Git source"):
            images.verify_existing_build(m, object(), r, self.root)


if __name__ == "__main__":unittest.main()
