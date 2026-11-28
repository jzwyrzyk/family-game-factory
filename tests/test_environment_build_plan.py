"""Real-Git regressions for docs pushes racing with application CI/deployment."""
import importlib.util
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts/environments"))
spec = importlib.util.spec_from_file_location("environment_build_plan", ROOT / "scripts/environments/build_plan.py")
build_plan = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build_plan)


class BuildPlanTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.repo = Path(self.temp.name)
        self.git("init", "-b", "main")
        self.git("config", "user.email", "fixture@example.invalid")
        self.git("config", "user.name", "Fixture")
        self.initial = self.commit("README.md", "initial")

    def git(self, *args):
        return subprocess.run(["git", "-C", str(self.repo), *args], capture_output=True,
                              text=True, check=True).stdout.strip()

    def commit(self, path, value):
        target = self.repo / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(value)
        self.git("add", "--", path)
        self.git("commit", "-m", value)
        return self.git("rev-parse", "HEAD")

    def test_dev_docs_only_skips_but_app_pr_docs_followup_still_builds(self):
        docs = self.commit("docs/example.md", "docs first")
        result = build_plan.plan(source=docs, base=self.initial, kind="dev", repo=self.repo)
        self.assertFalse(result["previewRequired"])
        self.commit("src/pals/example.ts", "application change")
        latest = self.commit("docs/example.md", "docs after app")
        result = build_plan.plan(source=latest, base=self.initial, kind="dev", repo=self.repo)
        self.assertTrue(result["previewRequired"])
        self.assertEqual(result["sourceSha"], latest)
        self.assertEqual(result["changedPathCount"], 2)

    def test_dev_unrelated_new_main_application_change_does_not_create_preview(self):
        self.git("checkout", "-b", "docs-branch")
        docs = self.commit("docs/example.md", "branch docs")
        self.git("checkout", "main")
        main = self.commit("src/pals/main.ts", "unrelated main app")
        result = build_plan.plan(source=docs, base=main, kind="dev", repo=self.repo)
        self.assertFalse(result["previewRequired"])
        self.assertEqual(result["baselineSha"], self.initial)

    def inventory(self, source=None, state="success"):
        return {"environments": [] if source is None else [{"environment": "test", "sourceSha": source, "state": state}]}

    def dev_inventory(self, source=None, state="success"):
        return {"environments": [] if source is None else [{"environment": "dev-pr-12", "sourceSha": source, "state": state}]}

    def test_dev_previously_deployed_application_is_replaced_after_complete_revert(self):
        deployed = self.commit("src/pals/example.ts", "deployed app A")
        self.git("rm", "src/pals/example.ts")
        current = self.commit("docs/example.md", "revert A and retain documentation")
        with patch.object(build_plan.github, "inventory", return_value=self.dev_inventory(deployed)):
            result = build_plan.plan(source=current, base=self.initial, kind="dev", repo=self.repo,
                                     api=object(), pr_number=12)
        self.assertTrue(result["previewRequired"])
        self.assertEqual(result["sourceSha"], current)
        self.assertEqual(result["baselineSha"], deployed)
        self.assertEqual(result["reason"], "DEV_PREVIEW_REVERSION_REQUIRES_CURRENT_SOURCE")

    def test_dev_genuine_docs_only_without_previous_preview_skips(self):
        docs = self.commit("docs/example.md", "genuine docs-only PR")
        with patch.object(build_plan.github, "inventory", return_value=self.dev_inventory()):
            result = build_plan.plan(source=docs, base=self.initial, kind="dev", repo=self.repo,
                                     api=object(), pr_number=12)
        self.assertFalse(result["previewRequired"])

    def test_dev_docs_only_with_unchanged_previously_deployed_app_skips(self):
        prior = self.commit("docs/example.md", "previously deployed docs source")
        current = self.commit("docs/example.md", "new docs with same app")
        with patch.object(build_plan.github, "inventory", return_value=self.dev_inventory(prior)):
            result = build_plan.plan(source=current, base=self.initial, kind="dev", repo=self.repo,
                                     api=object(), pr_number=12)
        self.assertFalse(result["previewRequired"])

    def test_dev_unknown_or_failed_prior_preview_does_not_leave_potentially_stale_app(self):
        docs = self.commit("docs/example.md", "docs-only with unknown serving state")
        for inventory in (self.dev_inventory(self.initial, "failure"), self.dev_inventory("f" * 40)):
            with patch.object(build_plan.github, "inventory", return_value=inventory):
                result = build_plan.plan(source=docs, base=self.initial, kind="dev", repo=self.repo,
                                         api=object(), pr_number=12)
                self.assertTrue(result["previewRequired"])
        with patch.object(build_plan.github, "inventory", side_effect=build_plan.github.GitHubError("GITHUB_API_FAILED")):
            self.assertTrue(build_plan.plan(source=docs, base=self.initial, kind="dev", repo=self.repo,
                                            api=object(), pr_number=12)["previewRequired"])

    def test_dev_invalid_pr_rejected_before_inventory(self):
        with patch.object(build_plan.github, "inventory") as inventory:
            for pr in (0, -1, True, "12"):
                with self.assertRaisesRegex(build_plan.BuildPlanError, "INVALID_PR_NUMBER"):
                    build_plan.plan(source=self.initial, base=self.initial, kind="dev", repo=self.repo,
                                    api=object(), pr_number=pr)
            inventory.assert_not_called()

    def test_test_app_a_then_docs_b_builds_b_when_a_never_deployed(self):
        application = self.commit("src/pals/example.ts", "app A")
        docs = self.commit("docs/example.md", "docs B cancels earlier A workflow")
        with patch.object(build_plan.github, "inventory", return_value=self.inventory(self.initial)):
            result = build_plan.plan(source=docs, base=application, kind="test", repo=self.repo, api=object())
        self.assertTrue(result["previewRequired"])
        self.assertEqual(result["baselineSha"], self.initial)
        self.assertEqual(result["sourceSha"], docs)

    def test_test_docs_only_after_actual_app_deployment_skips(self):
        application = self.commit("src/pals/example.ts", "deployed app A")
        docs = self.commit("docs/example.md", "docs B after deployment")
        with patch.object(build_plan.github, "inventory", return_value=self.inventory(application)):
            result = build_plan.plan(source=docs, base=application, kind="test", repo=self.repo, api=object())
        self.assertFalse(result["previewRequired"])
        self.assertEqual(result["baselineSha"], application)

    def test_live_browser_verifier_change_requalifies_static_test(self):
        fixture = self.commit("tests/environments/deployed-smoke.test.cjs", "fixture only")
        verifier = self.commit("tests/environments/deployed-smoke.cjs", "live verifier")
        with patch.object(build_plan.github, "inventory", return_value=self.inventory(self.initial)):
            self.assertFalse(build_plan.plan(source=fixture, base=self.initial, kind="test",
                                             repo=self.repo, api=object())["previewRequired"])
            result = build_plan.plan(source=verifier, base=fixture, kind="test", repo=self.repo, api=object())
        self.assertTrue(result["previewRequired"])
        self.assertEqual(result["reason"], "TEST_BROWSER_VERIFIER_CHANGED")
        self.assertFalse(build_plan.plan(source=verifier, base=fixture, kind="dev", repo=self.repo)["previewRequired"])

    def test_missing_failed_or_unavailable_baseline_always_builds_current_source(self):
        docs = self.commit("docs/example.md", "docs on unknown state")
        for inventory in (self.inventory(), self.inventory(self.initial, "failure"),
                          self.inventory(self.initial, "pending"), self.inventory("f" * 40)):
            with patch.object(build_plan.github, "inventory", return_value=inventory):
                result = build_plan.plan(source=docs, base=self.initial, kind="test", repo=self.repo, api=object())
                self.assertTrue(result["previewRequired"])
                self.assertIsNone(result["baselineSha"])
        with patch.object(build_plan.github, "inventory", side_effect=build_plan.github.GitHubError("GITHUB_API_FAILED")):
            self.assertTrue(build_plan.plan(source=docs, base=self.initial, kind="test", repo=self.repo, api=object())["previewRequired"])

    def test_divergent_deployed_source_cannot_be_a_skip_baseline(self):
        self.git("checkout", "-b", "other")
        divergent = self.commit("docs/other.md", "other history")
        self.git("checkout", "main")
        current = self.commit("docs/current.md", "current docs")
        with patch.object(build_plan.github, "inventory", return_value=self.inventory(divergent)):
            result = build_plan.plan(source=current, base=self.initial, kind="test", repo=self.repo, api=object())
        self.assertTrue(result["previewRequired"])
        self.assertIsNone(result["baselineSha"])

    def test_test_before_sha_is_not_assumed_deployed(self):
        docs = self.commit("docs/example.md", "first successful source could be docs")
        with patch.object(build_plan.github, "inventory", return_value=self.inventory()):
            result = build_plan.plan(source=docs, base="0" * 40, kind="test", repo=self.repo, api=object())
        self.assertTrue(result["previewRequired"])

    def test_invalid_source_fails_before_network_or_git_options_can_be_injected(self):
        with patch.object(build_plan.github, "inventory") as inventory:
            for source in ("main", "--help", "a" * 39):
                with self.assertRaises(build_plan.BuildPlanError):
                    build_plan.plan(source=source, base=self.initial, kind="test", repo=self.repo, api=object())
            inventory.assert_not_called()


if __name__ == "__main__":
    unittest.main()
