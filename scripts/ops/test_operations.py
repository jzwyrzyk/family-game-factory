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
    baseline_image = f"{release.LEGACY_REGISTRY}/preview@sha256:" + "1" * 64
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
            candidate = payload["template"]["revision"]
            self.state["latestCreatedRevision"] = f"{self.resource}/revisions/{candidate}"
            self.revisions[candidate] = self.revision(candidate, payload["template"])

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


class SoloActivationTests(unittest.TestCase):
    def test_protected_main_policy_has_no_bypass_or_self_approval(self):
        root = Path(__file__).resolve().parents[2]
        config = json.loads((root / "ops/github-main-ruleset.json").read_text())
        self.assertEqual(config["enforcement"], "active")
        self.assertEqual(config["bypass_actors"], [])
        self.assertEqual(config["conditions"]["ref_name"], {"include": ["refs/heads/main"], "exclude": []})
        rules = {rule["type"]: rule.get("parameters") for rule in config["rules"]}
        self.assertEqual(set(rules), {"deletion", "non_fast_forward", "pull_request", "required_status_checks"})
        approval = rules["pull_request"]
        self.assertEqual(approval["required_approving_review_count"], 0)
        self.assertFalse(approval["require_code_owner_review"])
        self.assertFalse(approval["require_last_push_approval"])
        self.assertTrue(approval["required_review_thread_resolution"])
        required = rules["required_status_checks"]
        self.assertTrue(required["strict_required_status_checks_policy"])
        self.assertEqual({item["context"] for item in required["required_status_checks"]},
                         {"Jems operations policy", "Documentation references", "browser",
                          "learning", "creative", "private-coach-image"})


class IsolatedDrillTests(unittest.TestCase):
    def setUp(self):
        import drill
        self.drill = drill
        self.project = "jems-ops-drill-test"
        self.number = "1234567890"
        self.fixture = CloudRunFixture()
        f = self.fixture
        f.service = drill.SERVICE
        f.resource = f"{drill.location_for(self.project, self.number)}/services/{drill.SERVICE}"
        f.baseline = f"{f.service}-00001-baseline"
        prefix = f"us-east5-docker.pkg.dev/{self.project}/jems-drill/synthetic@sha256:"
        f.baseline_image = prefix + "1" * 64
        f.candidate_image = prefix + "2" * 64
        template = {"serviceAccount": f"{f.service}-runtime@{self.project}.iam.gserviceaccount.com",
                    "containers": [{"image": f.baseline_image}]}
        f.state.update(name=f.resource, ingress="INGRESS_TRAFFIC_INTERNAL_ONLY",
                       labels={"jems-isolated-drill": "true"}, template=template,
                       latestCreatedRevision=f"{f.resource}/revisions/{f.baseline}",
                       trafficStatuses=[release.traffic_target(f.baseline, 100)])
        f.revisions = {f.baseline: f.revision(f.baseline, template)}
        self.iam = {}

    def api(self, method, path, payload=None):
        if method == "GET" and path == self.fixture.resource + ":getIamPolicy":
            return self.iam
        return self.fixture.call(method, path, payload)

    def run_drill(self, *, apply):
        events = []
        self.drill.run(self.project, self.number, self.fixture.candidate_image, self.api,
                       apply=apply, emit=events.append)
        return [entry["status"] for entry in events]

    def test_isolated_drill_restores_baseline(self):
        self.assertEqual(self.run_drill(apply=False), ["PLAN_ONLY"])
        self.assertEqual(self.fixture.patches, [])
        self.assertEqual(self.run_drill(apply=True), ["STAGED", "CANARY", "PROMOTED", "ROLLED_BACK"])
        self.assertEqual(release.traffic(self.fixture.state), {self.fixture.baseline: 100})

    def test_drill_refuses_production_public_access_and_runtime_overrides(self):
        for project, number in ((release.PROJECT, self.number), (self.project, release.PROJECT_NUMBER)):
            with self.assertRaises(release.ReleaseError):
                self.drill.location_for(project, number)
        self.iam = {"bindings": [{"role": "roles/run.invoker", "members": ["allUsers"]}]}
        with self.assertRaisesRegex(release.ReleaseError, "public IAM"):
            self.run_drill(apply=True)
        self.iam = {}
        self.fixture.state["template"]["vpcAccess"] = {"connector": "unexpected"}
        with self.assertRaises(release.ReleaseError):
            self.run_drill(apply=True)
        self.assertEqual(self.fixture.patches, [])


    def test_drill_rolls_back_after_an_uncertain_canary_update(self):
        original_api = self.api

        def uncertain_api(method, path, payload=None):
            result = original_api(method, path, payload)
            if method == "PATCH" and any(item["percent"] == 5 for item in payload["traffic"]):
                raise release.ReleaseError("Lost canary update response")
            return result

        self.api = uncertain_api
        with self.assertRaisesRegex(release.ReleaseError, "Lost canary"):
            self.run_drill(apply=True)
        self.assertEqual(release.traffic(self.fixture.state), {self.fixture.baseline: 100})


class OidcClaimsTests(unittest.TestCase):
    def test_probe_checks_exact_cloud_route_and_github_identity(self):
        import oidc_claims
        publish = oidc_claims.expected_claims("publish")
        rollout = oidc_claims.expected_claims("release")
        self.assertEqual(oidc_claims.mismatches(publish, publish), [])
        self.assertEqual(oidc_claims.mismatches(publish, rollout),
                         ["aud", "environment", "sub", "workflow_ref"])
        forged = {**publish, "ref": "refs/heads/other", "runner_environment": "self-hosted"}
        self.assertEqual(oidc_claims.mismatches(publish, forged), ["ref", "runner_environment"])
