from pathlib import Path
import unittest
import urllib.error
from unittest.mock import Mock

import oidc_claims
import verify_release_access as access

SHA = "a" * 40


def fixture(lane):
    claims = oidc_claims.expected_claims(lane)
    claims.update(sha=SHA, workflow_sha=SHA, run_id="123", run_attempt="1")
    env = {
        "GITHUB_SHA": SHA, "GITHUB_WORKFLOW_SHA": SHA,
        "GITHUB_WORKFLOW_REF": claims["workflow_ref"], "GITHUB_REPOSITORY": oidc_claims.REPO,
        "GITHUB_REF": "refs/heads/main", "GITHUB_REF_PROTECTED": "true",
        "GITHUB_EVENT_NAME": "workflow_dispatch", "RUNNER_ENVIRONMENT": "github-hosted",
        "GITHUB_JOB": "verify-access", "GITHUB_RUN_ID": "123", "GITHUB_RUN_ATTEMPT": "1",
        "JEMS_VERIFY_ACCESS": "true", "JEMS_VERIFY_IDENTITY": "false",
        "JEMS_ACCESS_SERVICE_ACCOUNT": access.ACCOUNTS[lane],
        "JEMS_ACCESS_PROVIDER": claims["aud"].removeprefix("https://iam.googleapis.com/"),
    }
    return env, claims


class FakeGoogle:
    def __init__(self, lane):
        self.lane = lane
        self.calls = []
        self.info = {"email": access.ACCOUNTS[lane], "verified_email": True, "id": "123456789012345678901"}
        self.extra = None
        self.omit = None
        self.runtime = None

    def identity(self):
        self.calls.append(("userinfo",))
        return self.info

    def get(self, url):
        self.calls.append(("get", url))
        if "artifactregistry.googleapis.com" in url:
            return {"name": access.REGISTRY, "format": "DOCKER", "dockerConfig": {"immutableTags": True}}
        name = url.split("/v2/", 1)[1]
        service = name.split("/services/", 1)[1].split("/")[0]
        runtime = self.runtime or access.RUNTIMES[service]
        if "/revisions/" in name:
            return {"name": name, "serviceAccount": runtime}
        return {"name": name, "template": {"serviceAccount": runtime},
                "trafficStatuses": [{"revision": service + "-00001-test", "percent": 100}]}

    def permissions(self, url, requested):
        self.calls.append(("permissions", url, requested))
        result = set()
        if "artifactregistry.googleapis.com" in url:
            result = access.REGISTRY_READ | ({access.REGISTRY_WRITE} if self.lane == "publish" else set())
        elif "run.googleapis.com" in url and self.lane == "release":
            result = access.SERVICE_REQUIRED.copy()
        elif "iam.googleapis.com" in url and self.lane == "release":
            if any(account in url for account in access.RUNTIMES.values()):
                result = {"iam.serviceAccounts.actAs"}
        elif "cloudresourcemanager.googleapis.com" in url and self.lane == "release":
            result = {"run.operations.get"}
        if self.extra in requested:
            result.add(self.extra)
        if self.omit:
            result.discard(self.omit)
        return {"permissions": sorted(result)}


class AccessProofTests(unittest.TestCase):
    def run_proof(self, lane, api=None):
        env, claims = fixture(lane)
        return access.verify(lane, env, claims, SHA, api or FakeGoogle(lane))

    def test_both_lanes_prove_identity_and_exact_resource_boundaries_without_writes(self):
        for lane in access.ACCOUNTS:
            with self.subTest(lane=lane):
                api = FakeGoogle(lane)
                receipt = self.run_proof(lane, api)
                self.assertEqual(receipt["status"], "VERIFIED")
                self.assertEqual(receipt["effective_service_account"], access.ACCOUNTS[lane])
                self.assertEqual(receipt["source_sha"], SHA)
                self.assertEqual(receipt["job"], "verify-access")
                self.assertFalse(receipt["production_mutations"])
                self.assertEqual(len(receipt["checks"]), 10)
                self.assertEqual(len(receipt["runtimes"]), 3 if lane == "release" else 0)
                self.assertTrue(all(c[0] in ("userinfo", "get", "permissions") for c in api.calls))
                self.assertIn("unprobed inherited/group/deny", receipt["scope"])

    def test_nonempty_flags_wrong_modes_refs_runner_or_source_fail_before_google_access(self):
        env, claims = fixture("release")
        changes = {"JEMS_IMAGE_PUBLISH_ENABLED": ["true", "false", "FALSE", "0"],
                   "JEMS_CLOUD_RUN_RELEASE_ENABLED": ["true", "false"],
                   "JEMS_VERIFY_IDENTITY": ["true"], "JEMS_VERIFY_ACCESS": ["false"],
                   "RUNNER_ENVIRONMENT": ["self-hosted"], "GITHUB_REF_PROTECTED": ["false"],
                   "GITHUB_REF": ["refs/heads/topic"], "GITHUB_EVENT_NAME": ["push"],
                   "GITHUB_JOB": ["transition"], "GITHUB_WORKFLOW_SHA": ["b" * 40],
                   "GITHUB_REPOSITORY": ["attacker/fork"], "JEMS_ACCESS_PROVIDER": ["other"],
                   "JEMS_ACCESS_SERVICE_ACCOUNT": [access.ACCOUNTS["publish"]]}
        for key, values in changes.items():
            for value in values:
                with self.subTest(key=key, value=value):
                    api = FakeGoogle("release")
                    with self.assertRaises(access.AccessError):
                        access.verify("release", {**env, key: value}, claims, SHA, api)
                    self.assertEqual(api.calls, [])
        with self.assertRaisesRegex(access.AccessError, "SOURCE_MISMATCH"):
            access.verify("release", env, claims, "b" * 40, FakeGoogle("release"))

    def test_run_attempt_workflow_and_claim_identity_must_match(self):
        env, claims = fixture("release")
        for key, value in (("run_attempt", "2"), ("run_id", "456"), ("sha", "b" * 40),
                           ("workflow_sha", "b" * 40), ("environment", "other"),
                           ("sub", "other"), ("runner_environment", "self-hosted")):
            with self.subTest(key=key), self.assertRaisesRegex(access.AccessError, "CLAIMS_MISMATCH"):
                access.verify("release", env, {**claims, key: value}, SHA, FakeGoogle("release"))

    def test_positive_google_identity_is_required_not_expected_auth_input(self):
        for info in ({}, {"email": access.ACCOUNTS["release"]},
                     {"email": access.ACCOUNTS["publish"], "verified_email": True, "id": "123456"},
                     {"email": access.ACCOUNTS["release"], "verified_email": False, "id": "123456"}):
            api = FakeGoogle("release")
            api.info = info
            with self.subTest(info=info), self.assertRaisesRegex(access.AccessError, "IDENTITY_UNVERIFIED"):
                self.run_proof("release", api)
            self.assertEqual(api.calls, [("userinfo",)])

    def test_missing_required_permission_or_excessive_permission_fails(self):
        for lane, missing in (("release", "run.operations.get"), ("release", "run.services.update"),
                              ("release", "iam.serviceAccounts.actAs"), ("publish", access.REGISTRY_WRITE)):
            api = FakeGoogle(lane)
            api.omit = missing
            with self.subTest(lane=lane, missing=missing), self.assertRaisesRegex(access.AccessError, "BOUNDARY_MISMATCH"):
                self.run_proof(lane, api)
        for extra in ("run.services.delete", "run.routes.invoke", "iam.serviceAccounts.getAccessToken",
                      "secretmanager.versions.access", "storage.objects.get", access.REGISTRY_WRITE):
            api = FakeGoogle("release")
            api.extra = extra
            with self.subTest(extra=extra), self.assertRaisesRegex(access.AccessError, "BOUNDARY_MISMATCH"):
                self.run_proof("release", api)

    def test_runtime_positive_act_as_requires_actual_service_and_revision_identity(self):
        api = FakeGoogle("release")
        api.runtime = "unexpected@family-game-factory-jzw.iam.gserviceaccount.com"
        with self.assertRaisesRegex(access.AccessError, "RUNTIME_SERVICE_IDENTITY"):
            self.run_proof("release", api)
        self.assertFalse(any(c[0] == "permissions" and "iam.googleapis.com" in c[1] for c in api.calls))
        api = FakeGoogle("release")
        original = api.get
        def changed_revision(url):
            value = original(url)
            if "/revisions/" in url:
                value["serviceAccount"] = "unexpected"
            return value
        api.get = changed_revision
        with self.assertRaisesRegex(access.AccessError, "RUNTIME_REVISION_IDENTITY"):
            self.run_proof("release", api)

    def test_zero_serving_historical_rows_allow_null_but_not_ambiguous_allocation(self):
        for percent in (None, "missing", -1, "100", True, 1):
            api = FakeGoogle("release")
            original = api.get
            def historical(url):
                value = original(url)
                if "trafficStatuses" in value:
                    row = {"revision": "old-unused-revision"}
                    if percent != "missing":
                        row["percent"] = percent
                    value["trafficStatuses"].append(row)
                return value
            api.get = historical
            with self.subTest(percent=percent):
                if percent in (None, "missing"):
                    self.assertEqual(self.run_proof("release", api)["status"], "VERIFIED")
                else:
                    with self.assertRaisesRegex(access.AccessError, "SERVING_REVISIONS_UNVERIFIED"):
                        self.run_proof("release", api)

    def test_public_invoker_compatibility_does_not_skip_private_invoker_denial(self):
        api = FakeGoogle("release")
        self.run_proof("release", api)
        for call in api.calls:
            if call[0] == "permissions" and "run.googleapis.com" in call[1]:
                self.assertEqual("run.routes.invoke" in call[2], "factory-coach-private" in call[1])

    def test_service_probes_do_not_stand_in_for_revision_access(self):
        for lane in access.ACCOUNTS:
            api = FakeGoogle(lane)
            result = self.run_proof(lane, api)
            service_calls = [call for call in api.calls if call[0] == "permissions" and
                             "run.googleapis.com" in call[1]]
            self.assertEqual(len(service_calls), 3)
            for call in service_calls:
                self.assertNotIn("run.revisions.get", call[2])
                self.assertEqual(call[2] - {"run.routes.invoke"},
                                 {"run.services.get", "run.services.update",
                                  "run.services.delete", "run.services.setIamPolicy"})
            reads = [call[1] for call in api.calls if call[0] == "get" and "/revisions/" in call[1]]
            proof = result["revision_access"]
            if lane == "release":
                self.assertEqual(proof["status"], "VERIFIED")
                self.assertEqual(proof["method"], "GET")
                self.assertEqual(sorted(reads), sorted("https://run.googleapis.com/v2/" +
                                                      name for name in proof["resources"]))
                self.assertEqual(len(reads), 3)
            else:
                self.assertEqual(reads, [])
                self.assertEqual(proof["status"], "NOT_VERIFIED")
                self.assertIn("absence of revision-read access remains unverified", proof["scope"])

    def test_actual_revision_read_failures_do_not_yield_a_success_receipt(self):
        for failure in (401, 403, 404, 429, 503, "wrong_name"):
            api = FakeGoogle("release")
            original = api.get
            def read(url):
                result = original(url)
                if "/revisions/" in url:
                    if failure == "wrong_name":
                        result["name"] = result["name"] + "-other"
                    else:
                        # Every HTTP failure remains a failed read. In particular,
                        # 401/404/429 cannot be converted to permission evidence.
                        opener = Mock()
                        opener.open.side_effect = urllib.error.HTTPError(url, failure, "private detail", {}, None)
                        return access.Google("test-token-not-for-output" * 2, opener).get(url)
                return result
            api.get = read
            with self.subTest(failure=failure), self.assertRaises(access.AccessError):
                self.run_proof("release", api)

    def test_malformed_unsupported_permission_checks_do_not_become_denial_evidence(self):
        for response in ({"error": "unsupported"}, {"permissions": "run.services.get"},
                         {"permissions": ["unknown"]}, {"permissions": ["p", "p"]}):
            api = Mock()
            api.permissions.return_value = response
            with self.subTest(response=response), self.assertRaisesRegex(access.AccessError, "RESPONSE_INVALID"):
                access.permission_check(api, "test", "ignored", {"p"}, {"q"})

    def test_token_never_enters_url_and_error_output_is_sanitized(self):
        token = "secret-access-token-do-not-print"
        opener = Mock()
        response = Mock()
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        response.read.return_value = b'{"id":"123456","email":"test","verified_email":true}'
        opener.open.return_value = response
        client = access.Google(token, opener)
        client.identity()
        request = opener.open.call_args.args[0]
        self.assertEqual(request.full_url, "https://www.googleapis.com/oauth2/v2/userinfo")
        self.assertEqual(request.get_header("Authorization"), "Bearer " + token)
        self.assertNotIn(token, request.full_url)
        opener.open.side_effect = OSError(token)
        with self.assertRaises(access.AccessError) as caught:
            client.identity()
        self.assertNotIn(token, str(caught.exception))
        self.assertEqual(str(caught.exception), "GOOGLE_READ_OR_PERMISSION_CHECK_FAILED")

    def test_client_rejects_mutation_redirects_non_google_and_token_query(self):
        client = access.Google("x" * 30, Mock())
        for url, body in (("https://run.googleapis.com/v2/services/x", {"image": "new"}),
                          ("https://evil.example/v2/testIamPermissions", None),
                          ("https://www.googleapis.com/oauth2/v2/userinfo?access_token=x", None)):
            with self.subTest(url=url), self.assertRaises(access.AccessError):
                client._request(url, body)
        with self.assertRaisesRegex(access.AccessError, "REDIRECT_REJECTED"):
            access.NoRedirect().redirect_request(None)


class WorkflowTests(unittest.TestCase):
    def test_access_only_jobs_use_pinned_auth_and_cannot_run_mutation_jobs(self):
        root = Path(__file__).resolve().parents[2]
        for filename, lane in (("jems-service-images.yml", "publish"), ("jems-cloud-run-release.yml", "release")):
            text = (root / ".github/workflows" / filename).read_text()
            access_job = text.split("  verify-access:\n", 1)[1].split("  build:\n" if lane == "publish" else "  plan:\n", 1)[0]
            self.assertIn("inputs.verify_access && !inputs.verify_identity", access_job)
            self.assertIn("vars.JEMS_IMAGE_PUBLISH_ENABLED == ''", access_job)
            self.assertIn("vars.JEMS_CLOUD_RUN_RELEASE_ENABLED == ''", access_job)
            self.assertIn("github.ref_protected", access_job)
            self.assertIn("runs-on: ubuntu-24.04", access_job)
            self.assertIn("environment: " + oidc_claims.LANES[lane][0], access_job)
            self.assertIn("google-github-actions/auth@c200f3691d83b41bf9bbd8638997a462592937ed", access_job)
            self.assertIn("create_credentials_file: false", access_job)
            self.assertIn("Verify federated production access", access_job)
            self.assertIn("python3 scripts/ops/verify_release_access.py " + lane, access_job)
            self.assertNotIn("docker ", access_job)
            self.assertNotIn("--apply", access_job)
            self.assertNotIn("attestations: write", access_job)
            normal_job = text.split("  build:\n" if lane == "publish" else "  plan:\n", 1)[1]
            self.assertIn("!inputs.verify_identity && !inputs.verify_access", normal_job.split("runs-on:", 1)[0])


if __name__ == "__main__":
    unittest.main()
