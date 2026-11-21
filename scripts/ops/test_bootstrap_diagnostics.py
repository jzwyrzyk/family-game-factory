"""Security and lifecycle tests for the one-time diagnostic bootstrap; no cloud calls."""

import contextlib
import copy
import io
import unittest
from unittest.mock import patch

import bootstrap_diagnostics as boot


class FakeCloud:
    """In-memory gcloud boundary that rejects any unrecognized operation."""

    def __init__(self, trust):
        self.trust = trust
        self.project = {"projectId": boot.PROJECT, "projectNumber": boot.PROJECT_NUMBER,
                        "lifecycleState": "ACTIVE"}
        self.apis = [{"config": {"name": name}} for name in boot.REQUIRED_APIS]
        self.project_policy = {}
        self.sa = self.role = self.pool = self.provider = None
        self.sa_policy = {"bindings": []}
        self.keys = []
        self.other_providers = []
        self.services = {name: {"bindings": []} for name in boot.SERVICES}
        self.mutations = []

    def __call__(self, *args, missing_ok=False):
        args = list(args)
        flags = dict(item[2:].split("=", 1) for item in args if item.startswith("--") and "=" in item)
        prefix = args[:3]
        if args[:2] == ["projects", "describe"]:
            return copy.deepcopy(self.project)
        if args[:2] == ["projects", "get-iam-policy"]:
            return copy.deepcopy(self.project_policy)
        if prefix == ["services", "list", "--enabled"]:
            return copy.deepcopy(self.apis)
        if prefix == ["iam", "service-accounts", "keys"]:
            return copy.deepcopy(self.keys)
        entities = {("iam", "service-accounts"): "sa", ("iam", "roles"): "role",
                    ("iam", "workload-identity-pools"): "pool"}
        if args[:3] == ["iam", "workload-identity-pools", "providers"]:
            op, entity = args[3], "provider"
            if op == "list":
                return ([copy.deepcopy(self.provider)] if self.provider else []) + copy.deepcopy(self.other_providers)
        elif tuple(args[:2]) in entities:
            op, entity = args[2], entities[tuple(args[:2])]
        else:
            op = entity = None
        if op == "describe":
            result = getattr(self, entity)
            if result is None and not missing_ok:
                raise AssertionError("Unexpected missing resource")
            return copy.deepcopy(result)
        if op in ("create", "create-oidc"):
            self.mutations.append(args)
            metadata = {"displayName": boot.TITLE, "description": boot.MARKER}
            if entity == "sa":
                self.sa = {**metadata, "email": boot.EMAIL}
            elif entity == "role":
                self.role = {"name": boot.ROLE, "title": boot.TITLE, "description": boot.MARKER,
                             "stage": "GA", "includedPermissions": flags["permissions"].split(",")}
            elif entity == "pool":
                self.pool = {**metadata, "state": "ACTIVE", "name": self.trust.provider_name.rsplit("/providers/", 1)[0]}
            else:
                assert self.pool, "Provider creation must follow pool creation"
                self.provider = {**metadata, "state": "ACTIVE", "name": self.trust.provider_name,
                                 "attributeMapping": {"google.subject": "assertion.sub"},
                                 "attributeCondition": flags["attribute-condition"],
                                 "oidc": {"issuerUri": flags["issuer-uri"],
                                          "allowedAudiences": [flags["allowed-audiences"]]}}
            return {}
        if entity == "sa" and op in ("get-iam-policy", "add-iam-policy-binding"):
            policy = self.sa_policy
        elif args[:2] == ["run", "services"]:
            op, service = args[2:4]
            if op == "describe":
                if service not in self.services:
                    raise boot.BootstrapError("Named Cloud Run service is missing")
                return {"metadata": {"name": service}}
            policy = self.services[service]
        else:
            raise AssertionError(f"Unexpected operation {args}")
        if op == "get-iam-policy":
            return copy.deepcopy(policy)
        if op == "add-iam-policy-binding":
            assert self.sa, "Service account must exist before grants"
            if flags["role"] == "roles/iam.workloadIdentityUser":
                assert self.provider, "Provider must exist before impersonation grant"
            self.mutations.append(args)
            policy.setdefault("bindings", []).append({"role": flags["role"], "members": [flags["member"]]})
            return copy.deepcopy(policy)
        raise AssertionError(f"Unexpected operation {args}")


class BootstrapTests(unittest.TestCase):
    def setUp(self):
        self.trust = boot.Trust("https://issuer.example.test/oidc", "exact-audience", "env:exact-subject")
        self.cloud = FakeCloud(self.trust)

    def installed(self):
        boot.execute(self.trust, apply=True, run=self.cloud)
        self.cloud.mutations.clear()

    def test_unsafe_trust_values_are_rejected(self):
        invalid = ["", "*", "prod?", "prod[01]", " leading", "line\nbreak", "a,b", "--anything", "eyJabc.def.ghi"]
        for field in ("issuer", "audience", "subject"):
            for value in invalid:
                with self.subTest(field=field, value=value), self.assertRaises(boot.BootstrapError):
                    boot.Trust(**{**vars(self.trust), field: value})
        for issuer in ("http://example.test", "https://user@example.test", "https://example.test?x=1",
                       "https://example.test#fragment", "https://example.test:123", "https://example.test\\evil"):
            with self.subTest(issuer=issuer), self.assertRaises(boot.BootstrapError):
                boot.Trust(issuer, "audience", "subject")
        with self.assertRaises(boot.BootstrapError):
            boot.Trust(self.trust.issuer, "audience", "a" * 128)

    def test_claims_are_literal_and_both_restricted(self):
        trust = boot.Trust(self.trust.issuer, 'aud"quote', 'env:org/example@team')
        self.assertEqual(trust.condition, 'assertion.sub == "env:org/example@team" && assertion.aud == "aud\\"quote"')
        self.assertTrue(trust.principal.endswith('/subject/env:org/example@team'))
        self.assertNotIn("principalSet", trust.principal)
        self.assertNotIn("*", trust.principal)
        for subject in ('sub"quote', 'env%2Fprod', 'env/../other', 'env#fragment'):
            with self.subTest(subject=subject), self.assertRaises(boot.BootstrapError):
                boot.Trust(self.trust.issuer, self.trust.audience, subject)

    def test_plan_default_never_calls_cloud(self):
        with patch.object(boot.subprocess, "run", side_effect=AssertionError("Cloud call in offline plan")):
            with contextlib.redirect_stdout(io.StringIO()) as output:
                result = boot.main(["--issuer", self.trust.issuer, "--audience", self.trust.audience,
                                    "--subject", self.trust.subject])
        self.assertEqual(result, 0)
        self.assertIn("PLAN_ONLY", output.getvalue())
        self.assertIn("unverified", output.getvalue())

    def test_read_only_check_and_idempotent_apply(self):
        result = boot.execute(self.trust, run=self.cloud)
        self.assertEqual(result["status"], "NEEDS_BOOTSTRAP")
        self.assertFalse(self.cloud.mutations)
        result = boot.execute(self.trust, apply=True, run=self.cloud)
        self.assertEqual(result["status"], "BOOTSTRAP_VERIFIED")
        self.assertEqual(result["oidc_connection"], "NOT_VERIFIED")
        self.assertEqual(len(self.cloud.mutations), 8)
        self.cloud.mutations.clear()
        result = boot.execute(self.trust, apply=True, run=self.cloud)
        self.assertEqual(result["applied_changes"], 0)
        self.assertFalse(self.cloud.mutations)

    def test_mutations_only_install_narrow_grants(self):
        boot.execute(self.trust, apply=True, run=self.cloud)
        allowed = {"run.services.get", "run.services.getIamPolicy", "run.revisions.get", "run.revisions.list"}
        self.assertEqual(set(self.cloud.role["includedPermissions"]), allowed)
        for command in self.cloud.mutations:
            text = " ".join(command)
            for forbidden in ("roles/owner", "roles/editor", "roles/run.developer", "roles/secretmanager",
                              "roles/iam.serviceAccountUser", "roles/logging.viewer", "fgf-github", "private-worker"):
                self.assertNotIn(forbidden, text)
            self.assertNotIn("delete", command)
            self.assertNotIn("update", command)
            self.assertNotIn("enable", command)
            self.assertNotIn("logging", command)
            self.assertFalse(command[:2] == ["projects", "add-iam-policy-binding"])
        self.assertEqual(set(self.cloud.services), set(boot.SERVICES))

    def test_conflicts_fail_before_any_write(self):
        conflicts = [lambda c: c.role["includedPermissions"].append("run.services.update"),
                     lambda c: c.sa.update(description="Some other identity"),
                     lambda c: c.pool.update(disabled=True),
                     lambda c: c.provider["oidc"].update(allowedAudiences=["wrong"]),
                     lambda c: c.provider.update(attributeCondition="true"),
                     lambda c: c.provider.update(actorProviders=["another-provider"]),
                     lambda c: c.provider["oidc"].update(discoveryUri="https://issuer.example.test/other"),
                     lambda c: c.other_providers.append({"name": "another-provider"}),
                     lambda c: c.keys.append({"keyType": "USER_MANAGED"}),
                     lambda c: c.sa_policy["bindings"][0]["members"].append("user:other@example.test"),
                     lambda c: c.project_policy.update(bindings=[{"role": "roles/viewer", "members": [boot.SA_MEMBER]}]),
                     lambda c: c.services[boot.SERVICES[-1]]["bindings"].append({"role": "roles/run.admin", "members": [boot.SA_MEMBER]})]
        for change in conflicts:
            with self.subTest(change=change):
                self.cloud = FakeCloud(self.trust)
                self.installed()
                change(self.cloud)
                with self.assertRaises(boot.BootstrapError):
                    boot.execute(self.trust, apply=True, run=self.cloud)
                self.assertFalse(self.cloud.mutations)

    def test_missing_service_and_disabled_api_fail_before_create(self):
        del self.cloud.services[boot.SERVICES[-1]]
        with self.assertRaises(boot.BootstrapError):
            boot.execute(self.trust, apply=True, run=self.cloud)
        self.assertFalse(self.cloud.mutations)
        self.cloud = FakeCloud(self.trust)
        self.cloud.apis = []
        with self.assertRaises(boot.BootstrapError):
            boot.execute(self.trust, apply=True, run=self.cloud)
        self.assertFalse(self.cloud.mutations)

    def test_subprocess_is_an_argument_array_and_not_found_is_narrow(self):
        with patch.object(boot.subprocess, "run") as run:
            run.return_value = subprocess_result(0, "{}", "")
            boot.gcloud("iam", "roles", "describe", boot.ROLE_ID)
            args, kwargs = run.call_args
            self.assertIsInstance(args[0], list)
            self.assertFalse(kwargs.get("shell", False))
            self.assertIn(f"--project={boot.PROJECT}", args[0])
            run.return_value = subprocess_result(1, "", "PERMISSION_DENIED NOT_FOUND")
            with self.assertRaises(boot.BootstrapError):
                boot.gcloud("iam", "roles", "describe", boot.ROLE_ID, missing_ok=True)
            run.return_value = subprocess_result(1, "", "NOT_FOUND")
            self.assertIsNone(boot.gcloud("iam", "roles", "describe", boot.ROLE_ID, missing_ok=True))


def subprocess_result(code, stdout, stderr):
    from types import SimpleNamespace
    return SimpleNamespace(returncode=code, stdout=stdout, stderr=stderr)


if __name__ == "__main__":
    unittest.main()
