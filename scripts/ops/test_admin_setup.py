import copy
import json
from pathlib import Path
import re
import unittest
from unittest.mock import patch

import admin_cloud as cloud
import admin_drill
import admin_setup as setup
from admin_api import Plan, SetupError

HEAD = "a" * 40
MAIN = "b" * 40


class Github:
    def __init__(self):
        self.rules = None
        self.envs = {}
        self.mutations = []
        self.flag = False
        self.draft = True
        self.foreign_rule = False

    def api(self, verb, url, body=None, *, missing=False):
        path = url.removeprefix(setup.PREFIX.rstrip("/")).split("?")[0].strip("/")
        if verb != "GET":
            self.mutations.append((verb, path, copy.deepcopy(body)))
            if path == "rulesets" and verb == "POST":
                self.rules = {**copy.deepcopy(body), "id": 4}
            elif verb == "PUT":
                env = path.split("/")[-1]
                self.envs[env] = {"name": env, **copy.deepcopy(body), "protection_rules": [], "branches": []}
            elif path.endswith("/deployment-branch-policies"):
                self.envs[path.split("/")[1]]["branches"].append(body)
            else:
                raise AssertionError(path)
            return {}
        if not path:
            return {"id": setup.REPO_ID, "owner": {"id": setup.OWNER_ID}, "default_branch": "main",
                    "private": False, "permissions": {"admin": True}}
        if path == "branches/main":
            return {"commit": {"sha": MAIN}, "protected": bool(self.rules)}
        if path == "pulls/107":
            return {"head": {"sha": HEAD, "repo": {"id": setup.REPO_ID}},
                    "base": {"ref": "main", "repo": {"id": setup.REPO_ID}},
                    "state": "open", "draft": self.draft, "merged": False}
        if path.endswith("check-runs"):
            expected = json.loads((setup.ROOT / "ops/github-main-ruleset.json").read_text())["rules"][-1]
            contexts = expected["parameters"]["required_status_checks"]
            return {"check_runs": [
                {"id": i + 1, "name": item["context"], "app": {"id": 15368, "slug": "github-actions"},
                 "conclusion": "success"} for i, item in enumerate(contexts)
            ]}
        if path == "rulesets":
            rules = [{"id": 99, "target": "tag", "name": "Existing worker tags", "enforcement": "active"}]
            if self.foreign_rule:
                rules.append({"id": 100, "target": "branch", "name": "Unknown branch", "enforcement": "active"})
            return rules + ([self.rules] if self.rules else [])
        if path == "rulesets/4":
            return self.rules
        if path == "rules/branches/main":
            return [{**rule, "ruleset_id": 4} for rule in (self.rules or {}).get("rules", [])]
        if path.endswith("variables"):
            return {"variables": [{"name": "JEMS_IMAGE_PUBLISH_ENABLED", "value": "false"}] if self.flag else []}
        if path == "environments":
            return {"environments": [{"name": name} for name in self.envs]}
        if path.endswith("deployment-branch-policies"):
            return {"branch_policies": self.envs[path.split("/")[1]]["branches"]}
        if path.startswith("environments/"):
            return self.envs.get(path.split("/")[1])
        raise AssertionError(path)


class GithubSetupTests(unittest.TestCase):
    def test_read_only_first_then_additive_and_idempotent(self):
        gh = Github()
        plan = setup.github_plan(gh.api, HEAD)
        self.assertEqual(gh.mutations, [])
        self.assertEqual(len(plan.actions), 5)
        with self.assertRaisesRegex(SetupError, "Review code"):
            plan.execute("not-reviewed")
        self.assertFalse(gh.mutations)
        plan.execute(plan.review_code())
        self.assertEqual([item[:2] for item in gh.mutations], [
            ("POST", "rulesets"),
            ("PUT", "environments/jems-image-publication"),
            ("POST", "environments/jems-image-publication/deployment-branch-policies"),
            ("PUT", "environments/jems-cloud-run-production"),
            ("POST", "environments/jems-cloud-run-production/deployment-branch-policies"),
        ])
        self.assertFalse(setup.github_plan(gh.api, HEAD).actions)
        self.assertEqual(len(gh.mutations), 5)

    def test_head_flags_and_unknown_config_block_before_any_write(self):
        gh = Github()
        with self.assertRaisesRegex(SetupError, "exact PR"):
            setup.github_plan(gh.api, "0" * 40)
        gh.flag = True
        with self.assertRaisesRegex(SetupError, "unset"):
            setup.github_plan(gh.api, HEAD)
        gh.flag = False
        gh.foreign_rule = True
        with self.assertRaisesRegex(SetupError, "Unknown active"):
            setup.github_plan(gh.api, HEAD)
        gh.foreign_rule = False
        gh.draft = False
        with self.assertRaisesRegex(SetupError, "open draft"):
            setup.github_plan(gh.api, HEAD)
        self.assertFalse(gh.mutations)

    def test_existing_environment_with_extra_branch_is_not_modified(self):
        gh = Github()
        env = setup.ENVIRONMENTS[0]
        gh.envs[env] = {"name": env, "deployment_branch_policy": setup.SELECTED_BRANCH,
                        "branches": [{"name": "*", "type": "branch"}]}
        with self.assertRaisesRegex(SetupError, "unexpected deployment ref"):
            setup.github_plan(gh.api, HEAD)
        self.assertFalse(gh.mutations)

    def test_changed_state_invalidates_review_code(self):
        gh = Github()
        previous = setup.github_plan(gh.api, HEAD)
        gh.envs[setup.ENVIRONMENTS[0]] = {"name": setup.ENVIRONMENTS[0],
                "deployment_branch_policy": setup.SELECTED_BRANCH, "branches": []}
        now = setup.github_plan(gh.api, HEAD)
        with self.assertRaisesRegex(SetupError, "Review code"):
            now.execute(previous.review_code())
        self.assertFalse(gh.mutations)


class CloudSetupTests(unittest.TestCase):
    def test_preparation_never_adds_registry_or_identity_grants(self):
        plan = Plan("gcp", {})
        with patch("admin_cloud.rows", return_value=[]):
            cloud.registry(plan, cloud.PROJECT, cloud.REGISTRY)
            for name, sa in (("publish", "jems-image-publisher"), ("release", "jems-cloud-run-release")):
                cloud.inactive_lane(plan, name, sa)
        self.assertEqual(len(plan.actions), 7)
        commands = [step["change"]["gcloud"] for step in plan.actions]
        self.assertFalse(any("add-iam-policy-binding" in row or "keys" in row for row in commands))
        providers = [row for row in commands if "create-oidc" in row]
        self.assertEqual(len(providers), 2)
        for row in providers:
            self.assertIn("--disabled", row)
            condition = next(item for item in row if item.startswith("--attribute-condition="))
            self.assertIn('assertion.ref == "refs/heads/main"', condition)
            self.assertIn('assertion.runner_environment == "github-hosted"', condition)
            self.assertIn('assertion.repository_id == "1458033181"', condition)

    def test_logging_scope_and_unsupported_grants_fail_closed(self):
        with self.assertRaisesRegex(SetupError, "Unknown grants"):
            cloud.permitted({"bindings": [{"role": "roles/logging.viewer", "members": ["user:unknown@example.com"]}]},
                            [], "new view")
        with patch("admin_cloud.rows", return_value=[]):
            plan = Plan("gcp", {})
            cloud.logging_plan(plan, cloud.PROJECT, cloud.NUMBER, cloud.BUCKET, cloud.VIEW, cloud.SINK,
                               "exact filter", cloud.LOG_FILTER, cloud.DIAGNOSTICS, apply_reader=True)
        actions = plan.actions
        self.assertEqual([a["description"] for a in actions][:3], [
            "Create seven-day restricted bucket jems-diagnostics",
            "Create restricted view cloud-run-errors", "Create exact sink jems-cloud-run-errors",
        ])
        self.assertIn("--restricted-fields=httpRequest,jsonPayload,labels,protoPayload,sourceLocation,textPayload",
                      actions[0]["change"]["gcloud"])
        self.assertEqual(actions[-1]["change"]["gcloud"][-1], "--role=roles/logging.viewAccessor")

    def test_project_wide_logging_requires_verified_denial(self):
        with patch("admin_cloud.Http") as http:
            http.return_value.call.return_value = {"access": "UNKNOWN_CONDITIONAL"}
            with self.assertRaisesRegex(SetupError, "Could not establish"):
                cloud.require_no_broad_logging("test", cloud.PROJECT, cloud.NUMBER, cloud.DIAGNOSTICS)
            http.return_value.call.return_value = {"access": "NOT_GRANTED"}
            cloud.require_no_broad_logging("test", cloud.PROJECT, cloud.NUMBER, cloud.DIAGNOSTICS)


class SyntheticLogTests(unittest.TestCase):
    def check(self, *, filter_works=True, scoped=True):
        entries = []
        project = "jems-ops-drill-test"
        view = f"projects/{project}/locations/us-east5/buckets/jems-log-probe/views/synthetic"

        class Api:
            def __init__(self, _host, token):
                self.token = token

            def call(self, method, path, body):
                self.assert_valid(method, path)
                if path.endswith("write"):
                    entries.extend([{**entry, "timestamp": "2026-11-21T00:00:00Z"} for entry in body["entries"]])
                    return {}
                if self.token == "administrator":
                    return {"entries": entries}
                if body["resourceNames"] == [f"projects/{project}"] and scoped:
                    raise SetupError("POST https://logging.googleapis.com/v2/entries:list returned HTTP 403")
                return {"entries": [{key: value for key, value in item.items()
                                      if not filter_works or key not in cloud.FIELDS} for item in entries]}

            def assert_valid(self, method, path):
                if method != "POST" or not re.fullmatch(r"v2/entries:(?:write|list)", path):
                    raise AssertionError(path)

        with patch("admin_drill.Http", Api), patch("admin_cloud.admin_token", return_value="administrator"),              patch("admin_drill.impersonated_token", return_value="scoped"):
            return admin_drill.synthetic_log_check(project, view, "scoped@example.com")

    def test_probe_proves_both_entries_and_scoped_denial(self):
        self.assertEqual(self.check()["entries"], 2)

    def test_probe_detects_payload_or_project_access(self):
        with self.assertRaisesRegex(SetupError, "restricted payload"):
            self.check(filter_works=False)
        with self.assertRaisesRegex(SetupError, "project-wide"):
            self.check(scoped=False)
