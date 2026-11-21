import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

import log_summary
import release


class CloudRunFixture:
    service = "factory-preview"
    resource = f"{release.LOCATION}/services/{service}"
    baseline = f"{service}-00001-abc"
    baseline_image = f"{release.REGISTRY}/preview@sha256:" + "1" * 64
    candidate_image = f"{release.REGISTRY}/preview@sha256:" + "2" * 64

    def __init__(self):
        template = {"serviceAccount": "existing@example.iam.gserviceaccount.com",
                    "volumes": [{"name": "pinned"}], "containers": [{
                        "image": self.baseline_image, "env": [{"name": "APPROVED", "value": "false"}],
                    }]}
        self.intent = {
            "operation": "stage", "source": "a" * 40, "service": self.service,
            "image": self.candidate_image, "baseline": self.baseline,
            "baselineImage": self.baseline_image, "configuration": release.fingerprint(template),
            "compatibility": "b" * 64,
        }
        self.candidate = release.revision_name(self.intent)
        self.state = {"etag": "etag-1", "template": template,
                      "latestCreatedRevision": f"{self.resource}/revisions/{self.baseline}",
                      "trafficStatuses": [release.traffic_target(self.baseline, 100)]}
        self.revisions = {self.baseline: self.revision(self.baseline, template)}
        self.patches = []

    def revision(self, name, template):
        return {**copy.deepcopy(template), "name": f"{self.resource}/revisions/{name}",
                "conditions": [{"type": "Ready", "state": "CONDITION_SUCCEEDED"}]}

    def call(self, method, path, payload=None):
        if method == "GET":
            if path == self.resource:
                return copy.deepcopy(self.state)
            return copy.deepcopy(self.revisions[path.rsplit("/", 1)[1]])
        if method != "PATCH" or payload["etag"] != self.state["etag"]:
            raise AssertionError("An unguarded mutation was attempted")
        self.patches.append((path, copy.deepcopy(payload)))
        self.state["etag"] = f"etag-{len(self.patches) + 1}"
        self.state["trafficStatuses"] = payload["traffic"]
        self.state["traffic"] = payload["traffic"]
        if "template" in payload:
            self.state["template"] = payload["template"]
            self.state["latestCreatedRevision"] = f"{self.resource}/revisions/{self.candidate}"
            self.revisions[self.candidate] = self.revision(self.candidate, payload["template"])

    def transition(self, operation):
        return release.rollout({**self.intent, "operation": operation}, self.call)


class ReleaseTests(unittest.TestCase):
    def test_stage_canary_promote_and_rollback(self):
        f = CloudRunFixture()
        self.assertEqual(f.transition("stage"), "STAGED")
        path, payload = f.patches[0]
        self.assertTrue(path.endswith("?updateMask=template,traffic"))
        self.assertEqual(payload["traffic"], [release.traffic_target(f.baseline, 100)])
        self.assertEqual(release.fingerprint(payload["template"]), f.intent["configuration"])
        self.assertEqual(f.transition("stage"), "STAGED")
        self.assertEqual(len(f.patches), 1)
        self.assertEqual(f.transition("canary"), "CANARY")
        self.assertEqual(release.traffic(f.state), {f.baseline: 95, f.candidate: 5})
        self.assertEqual(f.transition("promote"), "PROMOTED")
        self.assertEqual(release.traffic(f.state), {f.candidate: 100})
        f.revisions[f.candidate]["conditions"] = []
        self.assertEqual(f.transition("rollback"), "ROLLED_BACK")
        self.assertEqual(release.traffic(f.state), {f.baseline: 100})
        self.assertTrue(all(path.endswith("?updateMask=traffic") for path, _ in f.patches[1:]))

    def test_existing_zero_traffic_tags_survive(self):
        f = CloudRunFixture()
        tag = dict(release.traffic_target(f.baseline, 0), tag="previous")
        f.state["traffic"] = [*f.state["trafficStatuses"], tag]
        f.state["trafficStatuses"] = [dict(f.state["trafficStatuses"][0], tag="previous")]
        f.transition("stage")
        f.transition("canary")
        f.transition("promote")
        f.transition("rollback")
        self.assertTrue(all(tag in patch["traffic"] for _, patch in f.patches))

    def test_promote_requires_canary(self):
        f = CloudRunFixture()
        f.transition("stage")
        with self.assertRaisesRegex(release.ReleaseError, "expected predecessor"):
            f.transition("promote")
        self.assertEqual(len(f.patches), 1)

    def test_foreign_traffic_and_changed_configuration_are_refused(self):
        f = CloudRunFixture()
        f.state["template"]["containers"][0]["env"][0]["value"] = "true"
        with self.assertRaisesRegex(release.ReleaseError, "configuration changed"):
            f.transition("stage")
        f.state["template"]["containers"][0]["env"][0]["value"] = "false"
        f.state["traffic"] = [dict(f.state["trafficStatuses"][0], tag="existing")]
        with self.assertRaisesRegex(release.ReleaseError, "tagged traffic"):
            f.transition("stage")
        self.assertEqual(f.patches, [])

    def test_mismatched_candidate_and_stale_candidate_are_refused(self):
        f = CloudRunFixture()
        f.transition("stage")
        f.revisions[f.candidate]["containers"][0]["image"] = f.baseline_image
        with self.assertRaisesRegex(release.ReleaseError, "reviewed digest"):
            f.transition("canary")
        f.state["latestCreatedRevision"] = f"{f.resource}/revisions/{f.baseline}"
        with self.assertRaisesRegex(release.ReleaseError, "no longer latest"):
            f.transition("rollback")
        self.assertEqual(len(f.patches), 1)

    def test_intent_binds_reviewed_compatibility_and_rejects_mutable_images(self):
        f = CloudRunFixture()
        with tempfile.TemporaryDirectory() as directory:
            intent = Path(directory) / "release.json"
            compatibility = intent.with_name("compatibility.json")
            fields = ("source", "service", "image", "baseline", "baselineImage")
            proof = {key: f.intent[key] for key in fields}
            proof["evidence"] = "https://github.com/jzwyrzyk/family-game-factory/actions/runs/42"
            compatibility.write_text(json.dumps(proof))
            f.intent["compatibility"] = hashlib.sha256(compatibility.read_bytes()).hexdigest()
            intent.write_text(json.dumps(f.intent))
            self.assertEqual(release.read_intent(intent), f.intent)
            compatibility.write_text("{}")
            with self.assertRaisesRegex(release.ReleaseError, "compatibility record"):
                release.read_intent(intent)
            intent.write_text(json.dumps({**f.intent, "image": "registry/preview:latest"}))
            with self.assertRaisesRegex(release.ReleaseError, "Invalid image"):
                release.read_intent(intent)


class LogSummaryTests(unittest.TestCase):
    def test_only_fixed_metadata_is_emitted(self):
        entry = {
            "resource": {"type": "cloud_run_revision", "labels": {"service_name": "factory-gateway"}},
            "logName": "projects/example/logs/run.googleapis.com%2Frequests",
            "severity": "ERROR", "textPayload": "private", "httpRequest": {"requestUrl": "private"},
        }
        unrelated = {**entry, "logName": "projects/example/logs/run.googleapis.com%2Fstderr"}
        self.assertEqual(log_summary.summarize([entry, unrelated, entry]), [
            {"service": "factory-gateway", "category": "request", "severity": "ERROR", "count": 2},
        ])
