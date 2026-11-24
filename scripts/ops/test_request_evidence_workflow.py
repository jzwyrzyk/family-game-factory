"""Offline policy checks for the job that can mint the diagnostics ID token."""
from pathlib import Path
import re
import unittest

import oidc_claims


ROOT = Path(__file__).resolve().parents[2]
FILE = ".github/workflows/jems-production-diagnostics.yml"
REPO = oidc_claims.REPO
ENVIRONMENT = "jems-production-diagnostics"
WORKFLOW_REF = f"{REPO}/{FILE}@refs/heads/main"
POOL = f"projects/{oidc_claims.PROJECT_NUMBER}/locations/global/workloadIdentityPools/jems-github-diagnostics"


class RequestEvidenceWorkflowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.workflow = (ROOT / FILE).read_text()
        cls.trigger, cls.jobs = cls.workflow.split("\njobs:\n")
        cls.gate, cls.steps = cls.jobs.split("    steps:\n")

    def test_protected_job_gate_and_default_off_hourly_schedule(self):
        trigger = self.trigger.split("\non:\n")[1].split("\npermissions:")[0]
        self.assertEqual(re.findall(r"^  ([a-z_]+):", trigger, re.M),
                         ["workflow_dispatch", "schedule"])
        self.assertEqual(re.findall(r"cron: (.+)", trigger), ["'37 * * * *'"])
        self.assertEqual(re.findall(r"^  ([a-z_-]+):", self.jobs, re.M), ["evidence"])
        actual = " ".join(self.gate.split("    if: >-\n")[1].split("    runs-on:")[0].split())
        self.assertEqual(actual,
                         f"github.repository == '{REPO}' && "
                         f"github.repository_id == '{oidc_claims.REPO_ID}' && "
                         f"github.repository_owner_id == '{oidc_claims.OWNER}' && "
                         "github.ref == 'refs/heads/main' && github.ref_protected && "
                         "(github.event_name == 'workflow_dispatch' || "
                         "(github.event_name == 'schedule' && vars.JEMS_DIAGNOSTICS_HOURLY_ENABLED == 'true'))")
        self.assertIn("    runs-on: ubuntu-24.04\n", self.gate)
        self.assertIn("    timeout-minutes: 6\n", self.gate)
        self.assertIn(f"    environment: {ENVIRONMENT}\n", self.gate)
        self.assertIn("  group: jems-production-request-diagnostics\n  cancel-in-progress: false", self.trigger)

    def test_identity_only_for_exact_broker_after_preflight(self):
        permissions = self.trigger.split("\npermissions:\n")[1].split("\nconcurrency:")[0]
        self.assertEqual(permissions.strip(), "contents: read")
        self.assertEqual(self.gate.split("    permissions:\n")[1].split(),
                         ["contents:", "read", "id-token:", "write"])
        ordered = [
            "persist-credentials: false",
            "request_evidence.py validate",
            f"""test "$GITHUB_WORKFLOW_REF" = '{WORKFLOW_REF}'""",
            'test "$RUNNER_ENVIRONMENT" = github-hosted',
            'test "$GITHUB_WORKFLOW_SHA" = "$GITHUB_SHA"',
            'test "$(git rev-parse HEAD)" = "$GITHUB_SHA"',
            'gh api repos/jzwyrzyk/family-game-factory/git/ref/heads/main',
            "uses: google-github-actions/auth@",
            "request_evidence.py query",
            "uses: actions/upload-artifact@",
        ]
        positions = [self.steps.index(fragment) for fragment in ordered]
        self.assertEqual(positions, sorted(positions))
        for field in [f"workload_identity_provider: {POOL}/providers/github-main",
                      "service_account: jems-github-log-reader@family-game-factory-jzw.iam.gserviceaccount.com",
                      "token_format: id_token",
                      "id_token_audience: https://jems-request-evidence-1054529152893.us-east5.run.app",
                      "create_credentials_file: false", "export_environment_variables: false"]:
            self.assertIn(field + "\n", self.steps)
        self.assertNotIn("continue-on-error:", self.steps)

    def test_wif_condition_is_a_conjunction_of_signed_github_claims(self):
        condition = (ROOT / "ops/request-diagnostics-provider.cel").read_text().strip()
        subject = (f"repo:jzwyrzyk@{oidc_claims.OWNER}/family-game-factory@{oidc_claims.REPO_ID}"
                   f":environment:{ENVIRONMENT}")
        pinned_claims = {"repository": REPO, "repository_id": oidc_claims.REPO_ID,
                         "repository_owner_id": oidc_claims.OWNER, "sub": subject,
                         "environment": ENVIRONMENT, "ref": "refs/heads/main",
                         "workflow_ref": WORKFLOW_REF, "runner_environment": "github-hosted"}
        expected = {f"assertion.{claim} == '{value}'" for claim, value in pinned_claims.items()}
        expected.update({"string(assertion.ref_protected) == 'true'",
                         "assertion.workflow_sha == assertion.sha",
                         "assertion.event_name in ['workflow_dispatch', 'schedule']"})
        self.assertEqual(set(re.split(r"\s*&&\s*", condition)), expected)

    def test_only_reviewed_actions_and_one_publication_path(self):
        actions = re.findall(r"uses: (\S+)", self.steps)
        self.assertEqual(actions, [
            "actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683",
            "google-github-actions/auth@c200f3691d83b41bf9bbd8638997a462592937ed",
            "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
        ])
        self.assertEqual(re.findall(r"^          path: (.+)$", self.steps, re.M),
                         ["diagnostics-output/report.json"])
        self.assertIn("if-no-files-found: error", self.steps)
        self.assertIn("include-hidden-files: false", self.steps)
        self.assertIn("retention-days: 7", self.steps)
        # GitHub displays run-step environments; the CLI reads dispatch data from GITHUB_EVENT_PATH.
        for risk in ("inputs.", "github.event.inputs", "secrets.", "credentials_json",
                     "JEMS_RELEASE_", "release.py", "setup-gcloud", "gcloud ", "--apply", "actions/cache"):
            self.assertNotIn(risk, self.workflow)
        release = (ROOT / ".github/workflows/jems-cloud-run-release.yml").read_text()
        self.assertNotIn("request_evidence", release)
        self.assertNotIn(ENVIRONMENT, release)
