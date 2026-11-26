"""Credential-free deployment/cleanup trust-boundary tests."""
from copy import deepcopy
import importlib.util
import json
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("environment_cloud", ROOT / "scripts/environments/cloud.py")
cloud = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cloud)
SOURCE = "a" * 40
BUNDLE = "b" * 64
NOW = 1800000000


def config():
    project = "jems-nonprod-test"
    return dict(version=1, enabled=True, projectId=project, projectNumber="123456789012",
                region="us-east5", runtimeServiceAccount=f"jems-static-runtime@{project}.iam.gserviceaccount.com",
                testRuntimeServiceAccount=f"jems-test-runtime@{project}.iam.gserviceaccount.com",
                deployServiceAccount=f"jems-nonprod-deploy@{project}.iam.gserviceaccount.com",
                uatServiceAccount=f"jems-nonprod-uat@{project}.iam.gserviceaccount.com",
                iapAudience="123456789012-example.apps.googleusercontent.com",
                wifProvider="projects/123456789012/locations/global/workloadIdentityPools/jems-nonproduction/providers/github-main",
                registry=f"us-east5-docker.pkg.dev/{project}/jems-environments",
                ownerIapMembers=["user:owner@example.com"], previewTtlHours=72, maxPreviews=10,
                minInstances=0, maxInstances=1)


def image(c=None):
    return (c or config())["registry"] + "/site@sha256:" + "c" * 64


def service(pr=3, *, kind="dev", expiry=NOW + 3600):
    name = cloud.service_name(kind, pr)
    labels = {"jems-managed": cloud.MARKER, "jems-environment": kind, "jems-pr": str(pr or "none"),
              "jems-source": SOURCE, "jems-expires": str(expiry)}
    return {"metadata": {"name": name, "uid": name + "-uid", "resourceVersion": "1", "labels": labels,
                         "annotations": {"run.googleapis.com/iap-enabled": "true"}},
            "spec": {"template": {"metadata": {"annotations": {"autoscaling.knative.dev/minScale": "0",
                                                                "autoscaling.knative.dev/maxScale": "1"}},
                                  "spec": {"serviceAccountName": cloud.runtime_account(config(), kind),
                                           "containers": [{"image": image(), "env": [
                                               {"name": "JEMS_ENVIRONMENT", "value": kind},
                                               {"name": "JEMS_SOURCE_SHA", "value": SOURCE},
                                               {"name": "JEMS_BUNDLE_SHA256", "value": BUNDLE},
                                               {"name": "JEMS_PR_NUMBER", "value": str(pr or "")}]}]}}},
            "status": {"url": f"https://{name}-123456789012.us-east5.run.app",
                       "latestReadyRevisionName": name + "-00001", "latestCreatedRevisionName": name + "-00001",
                       "conditions": [{"type": "Ready", "status": "True"}],
                       "traffic": [{"revisionName": name + "-00001", "percent": 100}]}}


class FakeCloud:
    def __init__(self, initial=None):
        self.calls = []
        self.state = {s["metadata"]["name"]: deepcopy(s) for s in initial or []}
        self.policy = {"bindings": []}
        self.ancestor_policy = {"bindings": []}
        self.iap_policy = {"bindings": [{"role": "roles/iap.httpsResourceAccessor", "members": cloud.iap_members(config())}]}
        self.run_policy = {"bindings": [{"role": "roles/run.invoker", "members": [
            "serviceAccount:service-123456789012@gcp-sa-iap.iam.gserviceaccount.com"]}]}
        self.mutate = lambda s: s

    def run(self, *args):
        self.calls.append(args)
        if args[:2] == ("projects", "describe"):
            return {"projectId": config()["projectId"], "projectNumber": config()["projectNumber"], "lifecycleState": "ACTIVE"}
        if args[:2] == ("projects", "get-iam-policy"):
            return self.policy
        if args[:2] == ("projects", "get-ancestors"):
            return [{"type": "organization", "id": "987654321"}]
        if args[:2] == ("organizations", "get-iam-policy"):
            return self.ancestor_policy
        if args[:3] == ("iam", "service-accounts", "describe"):
            return {"email": args[3]}
        if args[:4] == ("iam", "service-accounts", "keys", "list"):
            return []
        if args[:3] == ("artifacts", "repositories", "describe"):
            return {"format": "DOCKER"}
        if args[:3] == ("run", "services", "list"):
            return deepcopy(list(self.state.values()))
        if args[:2] == ("run", "deploy"):
            name = args[2]
            pr = int(name.rsplit("-", 1)[1]) if name.startswith("jems-dev-pr-") else None
            s = service(pr, kind="dev" if pr else "test")
            labels = next(x for x in args if x.startswith("--labels=")).split("=", 1)[1]
            s["metadata"]["labels"] = dict(x.split("=", 1) for x in labels.split(","))
            self.state[name] = self.mutate(s)
            return self.state[name]
        if args[:3] == ("run", "services", "describe"):
            return deepcopy(self.state[args[3]])
        if args[:3] == ("run", "services", "delete"):
            del self.state[args[3]]
            return None
        if args[:3] == ("run", "services", "get-iam-policy"):
            return self.run_policy
        if args[:3] == ("iap", "web", "get-iam-policy"):
            return self.iap_policy
        if args[:3] in (("run", "services", "add-iam-policy-binding"), ("iap", "web", "add-iam-policy-binding")):
            return {}
        raise AssertionError(args)


def deploy(fake, **kwargs):
    return cloud.deploy(config(), kind="dev", pr=3, source_sha=SOURCE, bundle_sha256=BUNDLE,
                        image=image(), cloud=fake, now=NOW, **kwargs)


class CloudTrustTests(unittest.TestCase):
    def test_dev_and_test_cannot_share_runtime_or_use_other_lane_identity(self):
        c = config()
        c['testRuntimeServiceAccount'] = c['runtimeServiceAccount']
        with self.assertRaisesRegex(cloud.EnvironmentError, 'SEPARATE_RUNTIME_REQUIRED'):
            cloud.validate_config(c)
        fake = FakeCloud([service(None, kind='test')])
        fake.state['jems-test']['spec']['template']['spec']['serviceAccountName'] = config()['runtimeServiceAccount']
        with self.assertRaisesRegex(cloud.EnvironmentError, 'RUNTIME_IDENTITY_DRIFT'):
            cloud.inspect(config(), fake, kind='test', pr=None, source_sha=SOURCE, bundle_sha256=BUNDLE, image=image())

    def test_disabled_template_can_plan_but_cannot_access_cloud(self):
        c = config()
        c.update(enabled=False, ownerIapMembers=[])
        for key in ("projectId", "projectNumber", "runtimeServiceAccount", "testRuntimeServiceAccount", "deployServiceAccount", "uatServiceAccount",
                    "iapAudience", "wifProvider", "registry"):
            c[key] = None
        self.assertEqual(cloud.validate_config(c, require_enabled=False), c)
        with self.assertRaisesRegex(cloud.EnvironmentError, "NOT_ENABLED"):
            cloud.deploy(c, kind="dev", pr=3, source_sha=SOURCE, bundle_sha256=BUNDLE, image=image())

    def test_production_project_number_accounts_registry_and_unbound_iap_fail(self):
        for key, value in [("projectId", cloud.PRODUCTION_PROJECT), ("projectNumber", cloud.PRODUCTION_NUMBER),
                           ("runtimeServiceAccount", "factory-gateway@family-game-factory-jzw.iam.gserviceaccount.com"),
                           ("deployServiceAccount", config()["runtimeServiceAccount"]),
                           ("ownerIapMembers", ["allUsers"]), ("ownerIapMembers", ["group:all@example.com"]),
                           ("wifProvider", "projects/123/locations/global/workloadIdentityPools/production/providers/main"),
                           ("registry", "us-east5-docker.pkg.dev/family-game-factory-jzw/jems-release-images"),
                           ("maxInstances", 2), ("minInstances", 1), ("iapAudience", "https://evil.example")]:
            with self.subTest(key=key, value=value):
                c = config(); c[key] = value
                with self.assertRaises(cloud.EnvironmentError):
                    cloud.validate_config(c)

    def test_mutable_or_other_image_fails_before_cloud(self):
        fake = FakeCloud()
        for bad in (image().split("@")[0] + ":latest", image().replace("/site@", "/gateway@"),
                    "us-east5-docker.pkg.dev/family-game-factory-jzw/jems-release-images/site@sha256:" + "c" * 64):
            with self.assertRaisesRegex(cloud.EnvironmentError, "IMMUTABLE_NONPRODUCTION"):
                cloud.deploy(config(), kind="dev", pr=3, source_sha=SOURCE, bundle_sha256=BUNDLE, image=bad, cloud=fake)
        self.assertEqual(fake.calls, [])

    def test_runtime_role_in_project_or_ancestor_stops_before_deployment(self):
        for location in ("policy", "ancestor_policy"):
            fake = FakeCloud()
            setattr(fake, location, {"bindings": [{"role": "roles/editor", "members": [cloud.account_member(config())]}]})
            with self.assertRaisesRegex(cloud.EnvironmentError, "RUNTIME_MUST_HAVE_NO_ROLES"):
                deploy(fake)
            self.assertFalse(any(c[:2] == ("run", "deploy") for c in fake.calls))

    def test_existing_unknown_service_and_preview_limit_fail_closed(self):
        s = service(); s["metadata"]["labels"]["jems-managed"] = "another-controller"
        fake = FakeCloud([s])
        with self.assertRaisesRegex(cloud.EnvironmentError, "OWNERSHIP"):
            deploy(fake)
        fake = FakeCloud([service(n) for n in range(10, 20)])
        with self.assertRaisesRegex(cloud.EnvironmentError, "LIMIT_REACHED"):
            deploy(fake)
        self.assertFalse(any(c[:2] == ("run", "deploy") for c in fake.calls))

    def test_broad_group_and_inherited_browser_grants_stop_before_deployment(self):
        cases = [("roles/viewer", "allAuthenticatedUsers"), ("roles/viewer", "allUsers"),
                 ("roles/viewer", "group:unknown@example.com"), ("roles/viewer", "domain:example.com"),
                 ("roles/viewer", "principalSet://iam.googleapis.com/locations/global/workforcePools/pool/*"),
                 ("roles/run.invoker", "user:extra@example.com"),
                 ("roles/iap.httpsResourceAccessor", "user:extra@example.com")]
        for location in ("policy", "ancestor_policy"):
            for role, member in cases:
                with self.subTest(location=location, role=role, member=member):
                    fake = FakeCloud()
                    setattr(fake, location, {"bindings": [{"role": role, "members": [member]}]})
                    with self.assertRaises(cloud.EnvironmentError):
                        deploy(fake)
                    self.assertFalse(any(c[:2] == ("run", "deploy") for c in fake.calls))

    def test_ready_deployment_has_exact_identity_private_iap_and_limits(self):
        fake = FakeCloud()
        result = deploy(fake)
        self.assertEqual(result["sourceSha"], SOURCE)
        self.assertEqual(result["bundleSha256"], BUNDLE)
        self.assertEqual(result["image"], image())
        self.assertEqual(result["status"], "deployed")
        command = next(c for c in fake.calls if c[:2] == ("run", "deploy"))
        for expected in ("--iap", "--no-allow-unauthenticated", "--min-instances=0", "--max-instances=1",
                         "--clear-secrets", "--clear-volumes"):
            self.assertIn(expected, command)
        self.assertFalse(any("allUsers" in value for c in fake.calls for value in c))

    def test_not_ready_wrong_image_secret_mount_or_iap_disabled_never_reports_success(self):
        def unready(s): s["status"]["conditions"][0]["status"] = "False"
        def wrong_image(s): s["spec"]["template"]["spec"]["containers"][0]["image"] = image().replace("c" * 64, "d" * 64)
        def secret(s): s["spec"]["template"]["spec"]["volumes"] = [{"secret": {"secretName": "oops"}}]
        def no_iap(s): s["metadata"]["annotations"]["run.googleapis.com/iap-enabled"] = "false"
        for mutation in (unready, wrong_image, secret, no_iap):
            fake = FakeCloud()
            def mutate(s): mutation(s); return s
            fake.mutate = mutate
            with self.assertRaises(cloud.EnvironmentError):
                deploy(fake)

    def test_public_or_extra_invoker_and_iap_access_fail_verification(self):
        for field, member in (("run_policy", "allUsers"), ("run_policy", "user:extra@example.com"),
                              ("iap_policy", "allAuthenticatedUsers"), ("iap_policy", "user:extra@example.com")):
            fake = FakeCloud()
            getattr(fake, field)["bindings"][0]["members"].append(member)
            with self.assertRaises(cloud.EnvironmentError):
                deploy(fake)

    def test_cleanup_only_expired_or_closed_owned_dev_and_keeps_test(self):
        unknown = service(9); unknown["metadata"]["labels"]["jems-managed"] = "other"
        fake = FakeCloud([service(1, expiry=NOW - 1), service(2), service(3),
                          service(None, kind="test", expiry=NOW - 1), unknown])
        receipt = cloud.cleanup(config(), closed_prs=[2], cloud=fake, now=NOW)
        self.assertEqual([x["pr"] for x in receipt["deleted"]], [1, 2])
        self.assertEqual(set(fake.state), {"jems-dev-pr-3", "jems-test", "jems-dev-pr-9"})

    def test_cleanup_refuses_labels_changed_since_inventory(self):
        fake = FakeCloud([service(1, expiry=NOW - 1)])
        original = fake.run
        def run(*args):
            result = original(*args)
            if args[:3] == ("run", "services", "describe"):
                result["metadata"]["labels"]["jems-expires"] = str(NOW + 3600)
            return result
        fake.run = run
        with self.assertRaisesRegex(cloud.EnvironmentError, "REFRESHED"):
            cloud.cleanup(config(), cloud=fake, now=NOW)
        self.assertIn("jems-dev-pr-1", fake.state)

    def test_cli_never_shells_and_does_not_echo_error_credentials(self):
        with patch.object(cloud.subprocess, "run", return_value=subprocess.CompletedProcess([], 1, "token-secret", "private-secret")) as run:
            with self.assertRaisesRegex(cloud.EnvironmentError, "CLOUD_COMMAND_FAILED") as raised:
                cloud.Cloud(config()).run("projects", "describe", config()["projectId"])
            self.assertNotIn("secret", str(raised.exception))
            self.assertIsInstance(run.call_args.args[0], list)
            self.assertNotIn("shell", run.call_args.kwargs)


if __name__ == "__main__":
    unittest.main()
