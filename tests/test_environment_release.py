import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("environment_release", ROOT / "scripts/environments/release.py")
release = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(release)


def manifest():
    value = {
        "schemaVersion": 1, "sourceSha": "a" * 40,
        "frontend": {"sha256": "b" * 64, "artifactId": "12345"},
        "backends": {name: f"us-east5-docker.pkg.dev/jems-test/images/{name}@sha256:" + str(i) * 64
                     for i, name in enumerate(("gateway", "preview", "coach"), 1)},
        "worker": {
            environment: {"repository": "family-game-factory-lab/family-game-factory-worker",
                          "sourceSha": "c" * 40, "executionTag": prefix + "c" * 40,
                          "serviceAccount": f"jems-worker@{project}.iam.gserviceaccount.com",
                          "sandboxImage": "ghcr.io/example/sandbox@sha256:" + "d" * 64,
                          "runtimeVersion": "quality-runtime-v2.1.0"}
            for environment, prefix, project in (
                ("test", "jems-test-execution-", "jems-nonproduction"),
                ("production", "factory-execution-", "family-game-factory-jzw"))},
        "configuration": {"testSha256": "e" * 64,
                          "productionSha256": release.digest({name: "f" * 64 for name in ("gateway", "preview", "coach")})},
        "evidence": {"ci": {"sourceSha": "a" * 40, "receiptSha256": "1" * 64,
                            "checks": dict.fromkeys(release.REQUIRED_CI_CHECKS, "success")},
                     "uat": None, "live": None},
    }
    identity = release.release_identity_sha256(value)
    common = {"sourceSha": value["sourceSha"], "releaseIdentitySha256": identity,
              "receiptSha256": "2" * 64, "target": "deployed-test"}
    value["evidence"]["uat"] = {**common, "providerMode": "fixture",
                                "journeys": dict.fromkeys(release.REQUIRED_JOURNEYS, "success")}
    value["evidence"]["live"] = {**common, "receiptSha256": "3" * 64, "providerMode": "live",
                                 "journeys": dict.fromkeys(release.LIVE_JOURNEYS, "success"),
                                 "authorizationSha256": "4" * 64, "limitMicrousd": 1000000,
                                 "spendMicrousd": 300000}
    return value


def acceptance(sealed):
    return {"schemaVersion": 1, "manifestSha256": sealed["manifestSha256"],
            "decision": "approve-production", "actor": "owner", "runId": "42", "runAttempt": 1}


def approve(sealed, **kwargs):
    return release.check_approval(sealed, kwargs.pop("approval", acceptance(sealed)),
                                  **{"authenticated_actor": "owner", "allowed_actors": ["owner"],
                                     "expected_source_sha": "a" * 40, **kwargs})


class ReleaseGateTests(unittest.TestCase):
    def test_complete_seal_still_requires_owner_acceptance(self):
        sealed = release.seal_manifest(manifest())
        self.assertTrue(sealed["approvalEligible"])
        self.assertFalse(sealed["productionReady"])
        self.assertEqual(approve(sealed)["status"], "APPROVAL_VALIDATED")

    def test_canonical_hash_independent_of_key_order_and_input_mutation(self):
        value = manifest()
        sealed = release.seal_manifest(value)
        reversed_keys = dict(reversed(list(value.items())))
        self.assertEqual(sealed, release.seal_manifest(reversed_keys))
        value["frontend"]["sha256"] = "c" * 64
        self.assertEqual(sealed["manifest"]["frontend"]["sha256"], "b" * 64)

    def test_tampering_seal_or_readiness_is_rejected(self):
        for key, value in (("manifestSha256", "0" * 64), ("productionReady", True),
                           ("blockers", ["ignored"]), ("approvalEligible", False)):
            with self.subTest(key=key), self.assertRaises(release.ReleaseValidationError):
                sealed = release.seal_manifest(manifest())
                sealed[key] = value
                approve(sealed)

    def test_changed_identity_invalidates_uat_even_after_reseal(self):
        for path in (("sourceSha",), ("frontend", "sha256"), ("frontend", "artifactId"),
                     ("backends", "gateway"), ("worker", "test", "sandboxImage"), ("worker", "production", "runtimeVersion"),
                     ("configuration", "testSha256"), ("configuration", "productionSha256")):
            with self.subTest(path=path), self.assertRaises(release.ReleaseValidationError):
                value = manifest()
                obj = value
                for key in path[:-1]:
                    obj = obj[key]
                previous = obj[path[-1]]
                obj[path[-1]] = previous.replace("a", "b") if len(path) == 1 else (
                    "98765" if path[-1] == "artifactId" else
                    "runtime-next" if path[-1] == "runtimeVersion" else
                    previous[:-1] + ("0" if previous[-1] != "0" else "1"))
                release.seal_manifest(value)

    def test_any_evidence_change_invalidates_prior_approval(self):
        value = manifest()
        approval = acceptance(release.seal_manifest(value))
        value["evidence"]["ci"]["receiptSha256"] = "9" * 64
        with self.assertRaises(release.ReleaseValidationError):
            approve(release.seal_manifest(value), approval=approval)

    def test_null_backend_worker_and_live_cannot_be_approved(self):
        for group, field in (("backends", "gateway"), ("worker", "test"), ("worker", "production"),
                             ("evidence", "live"), ("evidence", "uat"), ("evidence", "ci")):
            with self.subTest(group=group, field=field):
                value = manifest()
                value[group][field] = None
                for name in ("uat", "live"):
                    if value["evidence"][name] is not None:
                        value["evidence"][name]["releaseIdentitySha256"] = release.release_identity_sha256(value)
                sealed = release.seal_manifest(value)
                self.assertFalse(sealed["approvalEligible"])
                with self.assertRaises(release.ReleaseValidationError):
                    approve(sealed)

    def test_skipped_failed_cancelled_checks_block_approval(self):
        for evidence, field, check in (("ci", "checks", "core"), ("uat", "journeys", "ready-to-play"),
                                       ("live", "journeys", "ai-generation-modification")):
            for result in ("skipped", "failure", "cancelled"):
                with self.subTest(evidence=evidence, result=result):
                    value = manifest()
                    value["evidence"][evidence][field][check] = result
                    with self.assertRaises(release.ReleaseValidationError):
                        approve(release.seal_manifest(value))

    def test_omitted_coverage_rejected(self):
        for evidence, field, name in (("ci", "checks", "creative"), ("uat", "journeys", "artwork")):
            value = manifest()
            del value["evidence"][evidence][field][name]
            with self.subTest(evidence=evidence), self.assertRaises(release.ReleaseValidationError):
                release.seal_manifest(value)

    def test_local_or_mocked_evidence_cannot_substitute_for_live(self):
        for field, replacement in (("providerMode", "fixture"), ("target", "localhost"),
                                   ("authorizationSha256", "approved"), ("limitMicrousd", True),
                                   ("spendMicrousd", 1000001)):
            value = manifest()
            value["evidence"]["live"][field] = replacement
            with self.subTest(field=field), self.assertRaises(release.ReleaseValidationError):
                release.seal_manifest(value)

    def test_mutable_images_and_mismatched_worker_tag_rejected(self):
        value = manifest()
        value["backends"]["preview"] = "gcr.io/example/preview:latest"
        with self.assertRaises(release.ReleaseValidationError):
            release.seal_manifest(value)
        value = manifest()
        value["worker"]["production"]["executionTag"] = "factory-execution-" + "9" * 40
        with self.assertRaises(release.ReleaseValidationError):
            release.seal_manifest(value)

    def test_test_worker_cannot_assume_production_tag_or_identity(self):
        for field in ("serviceAccount", "executionTag"):
            value = manifest()
            value["worker"]["test"][field] = value["worker"]["production"][field]
            with self.subTest(field=field), self.assertRaises(release.ReleaseValidationError):
                release.seal_manifest(value)
        value = manifest()
        value["worker"]["production"]["serviceAccount"] = value["worker"]["test"]["serviceAccount"]
        with self.assertRaises(release.ReleaseValidationError):
            release.seal_manifest(value)

    def test_approval_needs_verified_allowed_actor_and_current_source(self):
        sealed = release.seal_manifest(manifest())
        for overrides in ({"authenticated_actor": "someone"}, {"allowed_actors": ["someone"]},
                          {"allowed_actors": []}, {"expected_source_sha": "f" * 40}):
            with self.subTest(overrides=overrides), self.assertRaises(release.ReleaseValidationError):
                approve(sealed, **overrides)
        for field, replacement in (("decision", "approved-label"), ("runId", "manual comment"),
                                   ("runAttempt", True), ("schemaVersion", True)):
            record = acceptance(sealed)
            record[field] = replacement
            with self.subTest(field=field), self.assertRaises(release.ReleaseValidationError):
                approve(sealed, approval=record)

    def test_existing_controller_target_is_bound_without_deploying(self):
        value = manifest()
        gate = approve(release.seal_manifest(value))
        config = dict.fromkeys(("gateway", "preview", "coach"), "f" * 64)
        intent = {"operation": "canary", "service": "factory-gateway", "source": value["sourceSha"],
                  "image": value["backends"]["gateway"], "configuration": config["gateway"]}
        result = release.check_release_intent(gate, value, intent, production_configuration=config)
        self.assertEqual(result["status"], "EXISTING_CONTROLLER_GATE_VALIDATED")
        for field, replacement in (("source", "f" * 40), ("image", value["backends"]["coach"]),
                                   ("operation", "rollback"), ("configuration", "0" * 64)):
            with self.subTest(field=field), self.assertRaises(release.ReleaseValidationError):
                release.check_release_intent(gate, value, {**intent, field: replacement}, production_configuration=config)

    def test_cli_seal_and_approval_and_duplicate_key_rejection(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            input_file, sealed_file, approval_file = (base / name for name in ("manifest.json", "sealed.json", "approval.json"))
            input_file.write_text(json.dumps(manifest()))
            command = [sys.executable, str(ROOT / "scripts/environments/release.py")]
            seal = subprocess.run([*command, "seal", "--manifest", str(input_file), "--out", str(sealed_file)], capture_output=True, text=True)
            self.assertEqual(seal.returncode, 0, seal.stdout)
            approval_file.write_text(json.dumps(acceptance(json.loads(sealed_file.read_text()))))
            check = subprocess.run([*command, "check-approval", "--sealed", str(sealed_file), "--approval", str(approval_file),
                                    "--authenticated-actor", "owner", "--owner", "owner", "--source-sha", "a" * 40], capture_output=True, text=True)
            self.assertEqual(check.returncode, 0, check.stdout)
            self.assertTrue(json.loads(check.stdout)["productionReady"])
            input_file.write_text('{"schemaVersion":1,"schemaVersion":2}')
            invalid = subprocess.run([*command, "seal", "--manifest", str(input_file), "--out", str(sealed_file)], capture_output=True, text=True)
            self.assertNotEqual(invalid.returncode, 0)
            self.assertIn("RELEASE_GATE_REJECTED", invalid.stdout)


if __name__ == "__main__":
    unittest.main()
