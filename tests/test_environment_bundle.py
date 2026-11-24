import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

MODULE = Path(__file__).parents[1] / "scripts/environments/bundle.py"
SPEC = importlib.util.spec_from_file_location("environment_bundle", MODULE)
bundle = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(bundle)
SHA = "a" * 40


class BundleTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.dist = self.root / "dist"
        self.dist.mkdir()
        (self.dist / "index.html").write_text('<html><head></head><body><div id="app"></div></body></html>')
        (self.dist / "build-info.json").write_text(json.dumps({"sha": SHA, "dirty": False}))
        (self.dist / "factory-config.json").write_text(json.dumps({"mode": "remote", "gatewayOrigin": "https://production.invalid"}))
        (self.dist / "sw.js").write_text("// Old offline cache")
        (self.dist / "assets").mkdir()
        (self.dist / "assets/main.js").write_text("console.log('game');")
        self.archive = self.root / "site.tgz"

    def package(self, **kwargs):
        return bundle.pack(self.dist, SHA, 123, self.archive, **kwargs)

    def extract(self, archive=None, destination=None, **kwargs):
        return bundle.extract(archive or self.archive, destination or self.root / "extracted", SHA, 123, **kwargs)

    def malicious(self, entries):
        archive = self.root / "malicious.tgz"
        with tarfile.open(archive, "w:gz", format=tarfile.USTAR_FORMAT) as output:
            for name, data, kind in entries:
                metadata = tarfile.TarInfo(name)
                metadata.size = len(data)
                metadata.type = kind
                if kind in {tarfile.SYMTYPE, tarfile.LNKTYPE}:
                    metadata.linkname = "outside.txt"
                output.addfile(metadata, io.BytesIO(data))
        return archive

    def test_roundtrip_is_disconnected_and_identified(self):
        identity = self.package()
        verified = self.extract()
        self.assertEqual(identity, verified)
        site = self.root / "extracted"
        self.assertEqual(json.loads((site / "factory-config.json").read_bytes()), bundle.DISCONNECTED_CONFIG)
        self.assertEqual((site / "sw.js").read_bytes(), bundle.SW_DISABLED)
        self.assertIn("DEV · PR #123", (site / "index.html").read_text())
        self.assertEqual(verified["frontendSha256"], bundle.digest(bundle.canonical(verified["files"])))
        self.assertNotIn(bundle.IDENTITY, [entry["path"] for entry in verified["files"]])

    def test_archive_is_reproducible(self):
        first = self.package()
        first_bytes = self.archive.read_bytes()
        (self.dist / "index.html").touch()
        second = self.package()
        self.assertEqual(first, second)
        self.assertEqual(first_bytes, self.archive.read_bytes())

    def test_test_identity_requires_no_pr(self):
        identity = bundle.pack(self.dist, SHA, None, self.archive, "test")
        self.assertEqual(identity["environment"], "test")
        self.assertIsNone(identity["prNumber"])
        with self.assertRaisesRegex(bundle.BundleError, "TEST_MUST_NOT_HAVE_PR"):
            bundle.pack(self.dist, SHA, 123, self.archive, "test")

    def test_exact_expected_source_and_pr_are_required(self):
        self.package()
        for source, pr in [("b" * 40, 123), (SHA, 124)]:
            with self.subTest(source=source, pr=pr), self.assertRaisesRegex(bundle.BundleError, "IDENTITY_MISMATCH"):
                bundle.extract(self.archive, self.root / "rejected", source, pr)
            self.assertFalse((self.root / "rejected").exists())

    def test_dirty_or_wrong_build_identity_rejected(self):
        for info in [{"sha": SHA, "dirty": True}, {"sha": "b" * 40, "dirty": False}, {"sha": SHA}]:
            (self.dist / "build-info.json").write_text(json.dumps(info))
            with self.subTest(info=info), self.assertRaisesRegex(bundle.BundleError, "ARTIFACT_BUILD_SOURCE_MISMATCH"):
                self.package()

    def test_symlink_input_rejected_before_copy(self):
        (self.dist / "link.js").symlink_to(self.dist / "assets/main.js")
        with self.assertRaisesRegex(bundle.BundleError, "LINK_OR_TYPE"):
            self.package()

    def test_symlink_directory_input_rejected(self):
        (self.dist / "linked").symlink_to(self.dist / "assets", target_is_directory=True)
        with self.assertRaisesRegex(bundle.BundleError, "DIRECTORY_REJECTED"):
            self.package()

    def test_archive_traversal_absolute_and_hidden_paths_rejected(self):
        for name in ["../escape.js", "/absolute.js", "assets/../../escape.js", ".secret.json", "assets//main.js", "assets\\main.js", "assets/%2e%2e/a.js"]:
            archive = self.malicious([(name, b"x", tarfile.REGTYPE)])
            with self.subTest(name=name), self.assertRaises(bundle.BundleError):
                self.extract(archive)
            self.assertFalse((self.root / "extracted").exists())

    def test_archive_link_device_and_duplicate_entries_rejected(self):
        for kind in [tarfile.SYMTYPE, tarfile.LNKTYPE, tarfile.CHRTYPE, tarfile.FIFOTYPE]:
            archive = self.malicious([("attack.js", b"", kind)])
            with self.subTest(kind=kind), self.assertRaisesRegex(bundle.BundleError, "ARCHIVE_ENTRY_REJECTED"):
                self.extract(archive)
        archive = self.malicious([("attack.js", b"x", tarfile.REGTYPE), ("attack.js", b"y", tarfile.REGTYPE)])
        with self.assertRaisesRegex(bundle.BundleError, "ARCHIVE_ENTRY_REJECTED"):
            self.extract(archive)

    def test_sensitive_files_and_private_key_material_rejected(self):
        for name, content in [("package.json", "{}"), ("key.json", '{"type":"service_account"}'), ("key.txt", "-----BEGIN PRIVATE KEY-----")]:
            path = self.dist / name
            path.write_text(content)
            with self.subTest(name=name), self.assertRaises(bundle.BundleError):
                self.package()
            path.unlink()

    def test_resource_limits_fail_before_extraction(self):
        self.package()
        with patch.object(bundle, "MAX_FILE_BYTES", 1), self.assertRaisesRegex(bundle.BundleError, "TOO_LARGE"):
            self.extract()
        with patch.object(bundle, "MAX_FILES", 1), self.assertRaisesRegex(bundle.BundleError, "LIMIT_EXCEEDED"):
            self.extract()
        with patch.object(bundle, "MAX_BYTES", 1), self.assertRaisesRegex(bundle.BundleError, "ARCHIVE_INVALID"):
            self.extract()

    def test_changed_file_rejected_even_with_valid_source(self):
        self.package()
        self.extract()
        (self.root / "extracted/assets/main.js").write_text("changed")
        with self.assertRaisesRegex(bundle.BundleError, "ARTIFACT_DIGEST_MISMATCH"):
            bundle.verify_directory(self.root / "extracted", SHA, "dev", 123)

    def test_existing_destination_never_overwritten(self):
        self.package()
        existing = self.root / "existing"
        existing.mkdir()
        sentinel = existing / "saved.txt"
        sentinel.write_text("preserved")
        with self.assertRaisesRegex(bundle.BundleError, "DESTINATION_MUST_NOT_EXIST"):
            self.extract(destination=existing)
        self.assertEqual(sentinel.read_text(), "preserved")

    def test_index_base_url_and_missing_body_rejected(self):
        for html in ["<html>Missing body</html>", '<html><head><base href="https://production.invalid"></head><body></body></html>']:
            (self.dist / "index.html").write_text(html)
            with self.subTest(html=html), self.assertRaisesRegex(bundle.BundleError, "INDEX_INVALID"):
                self.package()

    def test_production_environment_rejected(self):
        with self.assertRaisesRegex(bundle.BundleError, "ENVIRONMENT_INVALID"):
            self.package(environment="prod")


if __name__ == "__main__":
    unittest.main()
