import importlib.util
import json
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("release_regressions", Path(__file__).with_name("regressions.py"))
r = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(r)


class PagesReleaseRegressionGates(unittest.TestCase):
    def setUp(self):
        self.workflow = (ROOT / ".github/workflows/pages.yml").read_text()
        self.build, remainder = self.workflow.split("  regressions:\n", 1)
        self.regressions, self.deploy = remainder.split("  deploy:\n", 1)

    def test_retired_public_site_cannot_republish_a_historical_application(self):
        spec = importlib.util.spec_from_file_location("pages_policy", ROOT / "scripts/beta/pages-policy.py")
        policy = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(policy)
        record = {"version": 1, "mode": "welcome-only", "hubOrigin": "https://invited.example", "operatorContact": "adult@example.invalid"}
        self.assertEqual(policy.delivery_policy(record)["mode"], "welcome-only")
        for changed in ({"mode": "public"}, {"hubOrigin": "http://app.example"}, {"operatorContact": "bad\noutput=x"}):
            with self.assertRaises(ValueError):
                policy.delivery_policy({**record, **changed})
        self.assertLess(self.build.index("python3 scripts/beta/pages-policy.py"), self.build.index('git checkout --detach'))
        self.assertIn("PUBLIC_ASSET_INVENTORY_REJECTED", self.build)
        self.assertIn("if: steps.delivery.outputs.mode == 'household'", self.build)

    def test_every_covered_shard_is_mandatory(self):
        matrix = json.loads(re.search(r"shard: (\[.*\])", self.regressions).group(1))
        self.assertEqual(matrix, list(r.SHARDS))
        self.assertIn("fail-fast: false", self.regressions)
        self.assertNotIn("continue-on-error", self.workflow)
        self.assertIn("needs: [build, regressions]", self.deploy)
        self.assertIn("needs.build.result == 'success'", self.deploy)
        self.assertIn("needs.regressions.result == 'success'", self.deploy)

    def test_build_and_regressions_are_bound_to_same_reviewed_merged_source(self):
        for job in (self.build, self.regressions):
            self.assertIn("REVIEWED_SOURCE_SHA: ${{ inputs.source_sha }}", job)
            self.assertIn('git merge-base --is-ancestor "$REVIEWED_SOURCE_SHA" "$GITHUB_SHA"', job)
            self.assertIn('git checkout --detach "$REVIEWED_SOURCE_SHA"', job)
            self.assertIn('test "$(git rev-parse HEAD)" = "$REVIEWED_SOURCE_SHA"', job)
            self.assertIn("persist-credentials: false", job)
            self.assertIn("npm run build", job)
        self.assertIn('git show "$GITHUB_SHA:scripts/deployment/regressions.py"', self.regressions)
        self.assertIn("--source . --check", self.regressions)
        self.assertIn('--source . --shard "$REGRESSION_SHARD"', self.regressions)

    def test_only_deploy_has_pages_write_and_no_generation_authority(self):
        self.assertIn("workflow_dispatch:", self.build)
        self.assertNotIn("push:", self.build)
        self.assertIn("contents: read", self.build)
        for job in (self.build, self.regressions):
            for authority in ("secrets.", "id-token: write", "pages: write", "environment:", "gcloud "):
                self.assertNotIn(authority, job)
        self.assertIn("pages: write", self.deploy)
        self.assertIn("name: github-pages", self.deploy)

    def test_published_artifact_checks_clean_build_and_exact_source_stamp(self):
        self.assertIn("info.get('sha') != source", self.build)
        self.assertIn("info.get('dirty') is not False", self.build)
        self.assertIn("json.dumps({'sourceSha': source})", self.build)
        self.assertIn("path: dist", self.build)
        self.assertIn("scripts/deployment/site-config.ts", self.build)
        self.assertNotIn("download-artifact", self.build)


if __name__ == "__main__":
    unittest.main()
