import copy
import io
import json
from pathlib import Path
import unittest
from unittest.mock import Mock, patch

import observe_release as reader
import release
import verify_release_access as access
from test_verify_release_access import fixture as environment


class Fixture:
    def __init__(self):
        self.intent = {"operation": "stage", "source": "a" * 40, "service": "factory-gateway",
                       "baseline": "factory-gateway-old", "image": release.REGISTRY + "/gateway@sha256:" + "2" * 64,
                       "baselineImage": release.LEGACY_REGISTRY + "/gateway@sha256:" + "1" * 64}
        self.data = {}
        for service, component in release.SERVICES.items():
            base = release.API + release.LOCATION + "/services/" + service
            baseline = service + "-old"
            candidate = release.revision_name(self.intent) if service == self.intent["service"] else service + "-new"
            template = {"serviceAccount": access.RUNTIMES[service], "containers": [{
                "image": release.REGISTRY + "/" + component + "@sha256:" + "2" * 64,
                "env": [{"name": "PRIVATE", "value": "NEVER_PRINT_CONFIGURATION"}],
            }]}
            if service == self.intent["service"]:
                self.intent["configuration"] = release.fingerprint(template)
            active = candidate if service == "factory-coach-private" else baseline
            self.data[base] = {"name": base.removeprefix(release.API), "etag": "etag1", "generation": "3",
                "observedGeneration": "3", "terminalCondition": {"type": "Ready", "state": "CONDITION_SUCCEEDED"},
                "template": template, "latestCreatedRevision": base.removeprefix(release.API) + "/revisions/" + candidate,
                "latestReadyRevision": base.removeprefix(release.API) + "/revisions/" + active,
                "traffic": [release.traffic_target(active, 100)], "trafficStatuses": [release.traffic_target(active, 100)]}
            for name in (baseline, candidate):
                revision = copy.deepcopy(template)
                if name == baseline:
                    revision["containers"][0]["image"] = release.LEGACY_REGISTRY + "/" + component + "@sha256:" + "1" * 64
                revision.update(name=base.removeprefix(release.API) + "/revisions/" + name,
                    conditions=[{"type": "Ready", "state": "CONDITION_SUCCEEDED", "message": "NEVER_PRINT_PROVIDER_ERROR"}])
                if name == candidate and active == baseline:
                    revision["conditions"].append({"type": "Active", "state": "CONDITION_FAILED", "revisionReason": "RETIRED", "severity": "INFO"})
                self.data[base + "/revisions/" + name] = revision
        self.calls = []

    def identity(self):
        return {"email": access.ACCOUNTS["release"], "verified_email": True, "id": "123456789"}

    def get(self, url):
        self.calls.append(url)
        return copy.deepcopy(self.data[url])

    @property
    def gateway(self):
        return self.data[release.API + release.LOCATION + "/services/factory-gateway"]


class ObservationTests(unittest.TestCase):
    def test_all_services_read_with_retired_stage_and_no_private_values(self):
        f = Fixture()
        rows = reader.observe(f, f.intent)
        self.assertEqual({r["service"] for r in rows}, set(release.SERVICES))
        gateway = next(r for r in rows if r["service"] == "factory-gateway")
        self.assertEqual(gateway["intent_state_verified"], "stage")
        self.assertIn("RETIRED", json.dumps(gateway))
        self.assertNotIn("NEVER_PRINT", json.dumps(rows))
        self.assertEqual(sum(url.count("/revisions/") == 0 for url in f.calls), 6)

    def test_expected_canary_promotion_and_rollback_allocations(self):
        for operation in ("canary", "promote", "rollback"):
            with self.subTest(operation=operation):
                f = Fixture()
                f.intent["operation"] = operation
                candidate = release.revision_name(f.intent)
                allocation = {"canary": [(f.intent["baseline"], 95), (candidate, 5)],
                              "promote": [(candidate, 100)], "rollback": [(f.intent["baseline"], 100)]}[operation]
                f.gateway["traffic"] = f.gateway["trafficStatuses"] = [release.traffic_target(n, p) for n, p in allocation]
                self.assertEqual(next(r for r in reader.observe(f, f.intent) if r["service"] == "factory-gateway")["intent_state_verified"], operation)

    def test_acceptance_route_requires_exact_tag_and_preserved_allocation(self):
        f = Fixture(); candidate = release.revision_name(f.intent)
        active = [release.traffic_target(f.intent['baseline'], 95), release.traffic_target(candidate, 5)]
        tag = dict(release.traffic_target(candidate, 0), tag='jems-test-'+candidate.rsplit('-r-',1)[1])
        f.intent['operation'] = 'acceptance-route-add'
        f.gateway['traffic'] = f.gateway['trafficStatuses'] = active + [tag]
        reader.observe(f, f.intent)
        f.gateway['traffic'] = f.gateway['trafficStatuses'] = active
        with self.assertRaisesRegex(access.AccessError, 'TAG_MISMATCH'): reader.observe(f, f.intent)
        f.intent['operation'] = 'acceptance-route-remove'
        reader.observe(f, f.intent)
        f.gateway['traffic'] = f.gateway['trafficStatuses'] = active + [tag]
        with self.assertRaisesRegex(access.AccessError, 'TAG_MISMATCH'): reader.observe(f, f.intent)
        f.intent['operation'] = 'promote'
        f.gateway['traffic'] = f.gateway['trafficStatuses'] = [release.traffic_target(candidate,100),tag]
        with self.assertRaisesRegex(access.AccessError, 'TAG_MISMATCH'): reader.observe(f, f.intent)
        f.gateway['traffic'] = f.gateway['trafficStatuses'] = [release.traffic_target(candidate,100)]
        reader.observe(f,f.intent)

    def test_changed_generation_traffic_configuration_or_revision_blocks(self):
        changes = [lambda f: f.gateway.update(observedGeneration="2"),
                   lambda f: f.gateway.update(reconciling=True),
                   lambda f: f.gateway["trafficStatuses"][0].update(percent=99),
                   lambda f: f.gateway["traffic"][0].update(type="TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"),
                   lambda f: f.gateway["template"]["containers"][0]["env"][0].update(value="changed"),
                   lambda f: f.gateway.update(latestCreatedRevision="projects/other/locations/us-east5/services/factory-gateway/revisions/factory-gateway-new"),
                   lambda f: f.gateway["template"].update(serviceAccount="wrong@example.com")]
        for change in changes:
            f = Fixture()
            change(f)
            with self.subTest(change=changes.index(change)), self.assertRaises(access.AccessError):
                reader.observe(f, f.intent)

    def test_changed_state_during_read_blocks(self):
        f = Fixture()
        original = f.get
        def get(url):
            result = original(url)
            if len(f.calls) > 9:
                result["etag"] = "changed"
            return result
        f.get = get
        with self.assertRaisesRegex(access.AccessError, "SERVICE_CHANGED_DURING_READ"):
            reader.observe(f, f.intent)

    def test_wrong_effective_identity_blocks_before_service_reads(self):
        f = Fixture()
        f.identity = lambda: {"email": "other@example.com", "verified_email": True, "id": "123456789"}
        with self.assertRaisesRegex(access.AccessError, "IDENTITY_UNVERIFIED"):
            reader.observe(f, f.intent)
        self.assertEqual(f.calls, [])

    def test_get_only_exact_resources_no_redirects_or_permission_posts(self):
        api = reader.MetadataGoogle("x" * 30, Mock())
        base = release.API + release.LOCATION + "/services/factory-gateway"
        for url, body in [(base, {"traffic": []}), (base + ":testIamPermissions", {}),
                          (base + "?fields=name", None), (base.replace("family-game-factory-jzw", "other"), None),
                          ("https://logging.googleapis.com/v2/entries:list", None),
                          ("https://secretmanager.googleapis.com/v1/projects/x/secrets/y/versions/1:access", None),
                          ("https://factory-gateway.run.app/v1/coach", None)]:
            with self.subTest(url=url), self.assertRaisesRegex(access.AccessError, "READ_ONLY_BOUNDARY"):
                api._request(url, body)
        api.opener.open.assert_not_called()
        with self.assertRaisesRegex(access.AccessError, "REDIRECT_REJECTED"):
            access.NoRedirect().redirect_request(None)

    def test_unexpected_exception_does_not_publish_private_error(self):
        with patch.object(reader.oidc_claims, "read_claims", side_effect=ValueError("NEVER_PRINT_TOKEN")), patch("sys.stdout", new_callable=io.StringIO) as output:
            self.assertEqual(reader.main(), 1)
        self.assertNotIn("NEVER_PRINT", output.getvalue())
        self.assertEqual(json.loads(output.getvalue())["error_code"], "METADATA_OBSERVATION_FAILED")


class ContextTests(unittest.TestCase):
    def fixture(self):
        env, claims = environment("release")
        env.update(JEMS_OBSERVE="true", JEMS_VERIFY_ACCESS="false", JEMS_CLOUD_RUN_RELEASE_ENABLED="true", GITHUB_JOB="observe")
        return env, claims

    def test_valid_current_protected_main(self):
        env, claims = self.fixture()
        self.assertEqual(reader.context(env, claims, env["GITHUB_SHA"], env["GITHUB_SHA"])["source_sha"], env["GITHUB_SHA"])

    def test_wrong_mode_claim_workflow_account_and_stale_main_block(self):
        env, claims = self.fixture()
        for key, value in [("JEMS_OBSERVE", "false"), ("JEMS_VERIFY_ACCESS", "true"), ("JEMS_VERIFY_IDENTITY", "true"),
                           ("GITHUB_REF_PROTECTED", "false"), ("GITHUB_EVENT_NAME", "push"), ("GITHUB_JOB", "transition"),
                           ("GITHUB_WORKFLOW_SHA", "b" * 40), ("JEMS_ACCESS_SERVICE_ACCOUNT", "other@example.com"),
                           ("JEMS_CLOUD_RUN_RELEASE_ENABLED", "false")]:
            with self.subTest(key=key), self.assertRaises(access.AccessError):
                reader.context({**env, key: value}, claims, env["GITHUB_SHA"], env["GITHUB_SHA"])
        for actual in ({**claims, "environment": "other"}, {**claims, "run_attempt": "2"}):
            with self.assertRaises(access.AccessError):
                reader.context(env, actual, env["GITHUB_SHA"], env["GITHUB_SHA"])
        with self.assertRaisesRegex(access.AccessError, "SOURCE_MISMATCH"):
            reader.context(env, claims, env["GITHUB_SHA"], "b" * 40)

    def test_observe_dispatch_excludes_all_release_paths(self):
        text = (Path(__file__).resolve().parents[2] / ".github/workflows/jems-cloud-run-release.yml").read_text()
        for name in ("verify-identity", "verify-access", "plan"):
            gate = text.split("  " + name + ":\n", 1)[1].split("runs-on:", 1)[0]
            self.assertIn("!inputs.observe", gate)
        job = text.split("  observe:\n", 1)[1].split("  plan:\n", 1)[0]
        self.assertIn("inputs.observe && !inputs.verify_identity && !inputs.verify_access", job)
        self.assertIn("github.ref_protected", job)
        self.assertIn("create_credentials_file: false", job)
        self.assertNotIn("--apply", job)
        self.assertNotIn("setup-gcloud", job)
        self.assertIn("needs: plan", text.split("  transition:\n", 1)[1])


if __name__ == "__main__":
    unittest.main()
