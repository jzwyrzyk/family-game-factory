"""GitHub provenance and stale-source negative controls; no network access."""
import copy
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("environment_github", ROOT / "scripts/environments/github.py")
github = importlib.util.module_from_spec(spec)
spec.loader.exec_module(github)

SOURCE = "a" * 40
OLD = "b" * 40
REPO = {"id": github.REPOSITORY_ID, "full_name": github.REPOSITORY}
POLICY = [{"context": "browser", "integration_id": 15368}]


def run(identifier=100, workflow=github.BUNDLE_WORKFLOW, event="pull_request"):
    return {"id": identifier, "run_attempt": 1, "repository": copy.deepcopy(REPO),
            "head_repository": copy.deepcopy(REPO), "head_sha": SOURCE, "head_branch": "feature/example",
            "path": workflow, "event": event, "status": "completed", "conclusion": "success",
            "pull_requests": [{"number": 12, "head": {"sha": SOURCE}}]}


class FakeGitHub:
    def __init__(self):
        self.trigger = run(99)
        self.bundle_run = run()
        self.ci = run(50, ".github/workflows/test.yml", "push")
        self.checks = [{"id": 1, "name": "browser", "head_sha": SOURCE, "app": {"id": 15368},
                        "status": "completed", "conclusion": "success",
                        "details_url": f"https://github.com/{github.REPOSITORY}/actions/runs/50/job/80"}]
        self.job = {"id": 80, "run_id": 50, "name": "browser", "head_sha": SOURCE,
                    "status": "completed", "conclusion": "success",
                    "check_run_url": f"https://api.github.com/{github.PREFIX}/check-runs/1"}
        self.main = OLD
        self.pr = {"number": 12, "state": "open", "head": {"sha": SOURCE, "repo": copy.deepcopy(REPO)},
                   "base": {"ref": "main", "repo": copy.deepcopy(REPO)}}
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as payload:
            payload.writestr("bundle.tgz", b"untrusted data, never execute")
        self.zip_bytes = buffer.getvalue()
        self.artifact = {"id": 200, "name": "jems-site-bundle", "expired": False,
                         "size_in_bytes": len(self.zip_bytes), "digest": "sha256:" + hashlib.sha256(self.zip_bytes).hexdigest(),
                         "workflow_run": {"id": 100, "head_sha": SOURCE, "repository_id": github.REPOSITORY_ID,
                                          "head_repository_id": github.REPOSITORY_ID}}
        self.comments = []
        self.mutations = []
        self.downloads = []
        self.artifact_reads = 0
        self.after_download = None
        self.deployments = []
        self.statuses = []

    def request(self, endpoint, method="GET", data=None):
        github.GitHub._endpoint(endpoint)
        if method != "GET":
            self.mutations.append((endpoint, method, data))
            return {"id": 700}
        if endpoint.endswith("/actions/runs/99"):
            return copy.deepcopy(self.trigger)
        if endpoint.endswith("/actions/runs/50"):
            return copy.deepcopy(self.ci)
        if endpoint.endswith("/actions/jobs/80"):
            return copy.deepcopy(self.job)
        if endpoint.endswith("/git/ref/heads/main"):
            return {"object": {"sha": self.main}}
        if endpoint.endswith("/issues/8"):
            return {"body": github.DIRECTORY_MARKER + "\nDirectory"}
        raise AssertionError(endpoint)

    def pages(self, endpoint, key=None):
        github.GitHub._endpoint(endpoint)
        if "/check-runs?" in endpoint:
            return copy.deepcopy(self.checks)
        if "/workflows/test.yml/" in endpoint:
            return [copy.deepcopy(self.ci)]
        if "/workflows/jems-preview-build.yml/" in endpoint:
            return [copy.deepcopy(self.bundle_run)] if self.bundle_run else []
        if endpoint.endswith("/pulls"):
            return [copy.deepcopy(self.pr)]
        if endpoint.endswith("/artifacts"):
            self.artifact_reads += 1
            return [copy.deepcopy(self.artifact)] if self.artifact else []
        if endpoint.endswith("/comments"):
            return copy.deepcopy(self.comments)
        if endpoint.endswith("/deployments"):
            return copy.deepcopy(self.deployments)
        if endpoint.endswith("/statuses"):
            return copy.deepcopy(self.statuses)
        raise AssertionError(endpoint)

    def download(self, artifact_id, destination):
        self.downloads.append(artifact_id)
        destination.write_bytes(self.zip_bytes)
        if self.after_download:
            self.after_download()


class CandidateTests(unittest.TestCase):
    def test_candidate_binds_run_repo_sha_and_current_pr(self):
        api = FakeGitHub()
        candidate = github.choose_candidate(api, 99, POLICY)
        self.assertTrue(candidate["eligible"])
        self.assertEqual(candidate["sourceSha"], SOURCE)
        self.assertEqual(candidate["prNumber"], 12)
        self.assertEqual(candidate["artifactId"], 200)
        self.assertEqual(api.mutations, [])

    def test_exact_current_main_only_for_test(self):
        api = FakeGitHub()
        api.main = SOURCE
        api.bundle_run.update(event="push", head_branch="main", pull_requests=[])
        candidate = github.choose_candidate(api, 99, POLICY)
        self.assertEqual(candidate["environment"], "test")
        self.assertIsNone(candidate["prNumber"])
        api.main = OLD
        api.pr["state"] = "closed"
        self.assertFalse(github.choose_candidate(api, 99, POLICY)["eligible"])

    def test_failed_or_foreign_trigger_does_not_download(self):
        for mutation in (lambda a: a.trigger.update(conclusion="failure"),
                         lambda a: a.trigger.update(path=".github/workflows/fake.yml"),
                         lambda a: a.trigger["head_repository"].update(id=5),
                         lambda a: a.trigger["repository"].update(full_name="attacker/repo")):
            api = FakeGitHub()
            mutation(api)
            self.assertFalse(github.choose_candidate(api, 99, POLICY)["eligible"])
            self.assertEqual(api.downloads, [])

    def test_stale_closed_fork_and_nonmain_pr_fail_closed(self):
        for mutation in (lambda a: a.pr["head"].update(sha=OLD),
                         lambda a: a.pr.update(state="closed"),
                         lambda a: a.pr["head"]["repo"].update(id=999),
                         lambda a: a.pr["base"].update(ref="release")):
            api = FakeGitHub()
            mutation(api)
            self.assertFalse(github.choose_candidate(api, 99, POLICY)["eligible"])

    def test_latest_failed_rerun_does_not_reuse_old_check_success(self):
        api = FakeGitHub()
        api.checks.append({**api.checks[0], "id": 2, "conclusion": "failure"})
        self.assertFalse(github.choose_candidate(api, 99, POLICY)["eligible"])

    def test_wrong_app_wrong_sha_skipped_or_missing_check_rejected(self):
        for mutation in (lambda a: a.checks[0].update(app={"id": 6}),
                         lambda a: a.checks[0].update(head_sha=OLD),
                         lambda a: a.checks[0].update(conclusion="skipped"),
                         lambda a: a.checks.clear()):
            api = FakeGitHub()
            mutation(api)
            self.assertFalse(github.choose_candidate(api, 99, POLICY)["eligible"])

    def test_successful_exact_source_push_ci_required(self):
        for key, value in (("head_sha", OLD), ("event", "pull_request"), ("conclusion", "cancelled"), ("path", "other.yml")):
            api = FakeGitHub()
            api.ci[key] = value
            self.assertFalse(github.choose_candidate(api, 99, POLICY)["eligible"])

    def test_spoofed_check_name_cannot_substitute_a_different_job_or_workflow(self):
        for mutation in (lambda a: a.job.update(run_id=999),
                         lambda a: a.job.update(name="pretend-browser"),
                         lambda a: a.job.update(check_run_url="https://api.github.com/repos/attacker/repo/check-runs/1"),
                         lambda a: a.ci.update(path=".github/workflows/pretend-tests.yml"),
                         lambda a: a.checks[0].update(details_url="https://attacker.example/run/50")):
            api = FakeGitHub()
            mutation(api)
            self.assertFalse(github.choose_candidate(api, 99, POLICY)["eligible"])

    def test_bundle_workflow_and_pr_are_bound(self):
        api = FakeGitHub()
        api.bundle_run["path"] = ".github/workflows/attack.yml"
        self.assertFalse(github.choose_candidate(api, 99, POLICY)["eligible"])
        api = FakeGitHub()
        api.bundle_run["pull_requests"][0]["number"] = 13
        with self.assertRaisesRegex(github.GitHubError, "BUNDLE_PR_MISMATCH"):
            github.choose_candidate(api, 99, POLICY)

    def test_successful_docs_only_bundle_run_without_artifact_is_a_clean_skip(self):
        api = FakeGitHub()
        api.artifact = None
        self.assertEqual(github.choose_candidate(api, 99, POLICY),
                         {"eligible": False, "reason": "NO_DEPLOYABLE_BUNDLE"})
        self.assertEqual(api.downloads, [])

    def test_artifact_envelope_source_run_and_digest_are_required(self):
        for mutation in (lambda a: a.artifact.update(expired=True),
                         lambda a: a.artifact.update(digest=None),
                         lambda a: a.artifact["workflow_run"].update(id=999),
                         lambda a: a.artifact["workflow_run"].update(head_sha=OLD),
                         lambda a: a.artifact["workflow_run"].update(head_repository_id=999)):
            api = FakeGitHub()
            mutation(api)
            with self.assertRaises(github.GitHubError):
                github.choose_candidate(api, 99, POLICY)

    def test_download_is_digest_checked_and_data_only(self):
        api = FakeGitHub()
        with tempfile.TemporaryDirectory() as temp:
            candidate = github.choose_candidate(api, 99, POLICY, Path(temp))
            self.assertEqual(Path(candidate["bundlePath"]).read_bytes(), b"untrusted data, never execute")
            self.assertEqual(candidate["bundleSha256"], hashlib.sha256(b"untrusted data, never execute").hexdigest())
            self.assertEqual(api.artifact_reads, 2)

    def test_artifact_replacement_or_concurrent_source_change_rejected(self):
        api = FakeGitHub()
        api.after_download = lambda: api.artifact.update(id=201)
        with tempfile.TemporaryDirectory() as temp, self.assertRaisesRegex(github.GitHubError, "ARTIFACT_CHANGED"):
            github.choose_candidate(api, 99, POLICY, Path(temp))
        api = FakeGitHub()
        api.after_download = lambda: api.pr["head"].update(sha=OLD)
        with tempfile.TemporaryDirectory() as temp:
            self.assertFalse(github.choose_candidate(api, 99, POLICY, Path(temp))["eligible"])

    def test_zip_traversal_extra_entries_and_symlinks_rejected(self):
        for name, link, extra in (("../bundle.tgz", False, False), ("bundle.tgz", False, True), ("bundle.tgz", True, False)):
            with tempfile.TemporaryDirectory() as temp:
                archive = Path(temp) / "artifact.zip"
                with zipfile.ZipFile(archive, "w") as payload:
                    info = zipfile.ZipInfo(name)
                    if link:
                        info.external_attr = 0o120777 << 16
                    payload.writestr(info, b"data")
                    if extra:
                        payload.writestr("server.py", b"arbitrary code")
                digest = "sha256:" + hashlib.sha256(archive.read_bytes()).hexdigest()
                with self.assertRaises(github.GitHubError):
                    github.extract_artifact(archive, Path(temp) / "bundle.tgz", digest)

    def test_policy_cannot_be_empty_or_non_github_app(self):
        for ruleset in ({}, {"rules": [{"type": "required_status_checks", "parameters": {"required_status_checks": [{"context": "browser", "integration_id": 1}]}}]}):
            with self.assertRaises(github.GitHubError):
                github.required_checks(ruleset)


class ReportingTests(unittest.TestCase):
    def receipt(self):
        return {"environment": "dev", "pr": 12, "sourceSha": SOURCE,
                "service": "jems-dev-pr-12", "url": "https://jems-dev-pr-12-example-ue.a.run.app",
                "bundleSha256": "c" * 64, "status": "deployed"}

    def test_report_creates_only_nonproduction_deployment_and_scoped_comment(self):
        api = FakeGitHub()
        result = github.report(api, self.receipt())
        self.assertEqual(result["production"], "not_deployed")
        self.assertFalse(api.mutations[0][2]["production_environment"])
        self.assertEqual(api.mutations[1][2]["state"], "success")
        self.assertIn("not production deployment", api.mutations[2][2]["body"])

    def test_own_bot_comment_updated_but_owner_comment_never_overwritten(self):
        api = FakeGitHub()
        api.comments = [{"id": 5, "user": {"login": "jzwyrzyk"}, "body": github.COMMENT_MARKER + " Owner note"},
                        {"id": 6, "user": {"login": "github-actions[bot]"}, "body": github.COMMENT_MARKER + " Old"}]
        github.report(api, self.receipt())
        self.assertTrue(api.mutations[-1][0].endswith("/comments/6"))
        self.assertEqual(api.mutations[-1][1], "PATCH")

    def test_stale_receipt_never_published(self):
        api = FakeGitHub()
        api.pr["state"] = "closed"
        with self.assertRaisesRegex(github.GitHubError, "SOURCE_CHANGED"):
            github.report(api, self.receipt())
        self.assertEqual(api.mutations, [])

    def test_arbitrary_url_prod_url_wrong_pr_and_unverified_receipt_rejected(self):
        for key, value in (("url", "https://attacker.example"),
                           ("url", "https://factory-gateway-ola734esta-ul.a.run.app"),
                           ("pr", 13), ("status", "planned")):
            api = FakeGitHub()
            receipt = self.receipt()
            receipt[key] = value
            with self.assertRaises(github.GitHubError):
                github.report(api, receipt)
            self.assertEqual(api.mutations, [])

    def test_inventory_uses_latest_status_and_never_labels_prod(self):
        api = FakeGitHub()
        api.deployments = [{"id": 3, "environment": "dev-pr-12", "sha": SOURCE, "production_environment": False,
                            "payload": {"jemsEnvironmentVersion": 1, "service": "jems-dev-pr-12"}},
                           {"id": 2, "environment": "production", "sha": SOURCE}]
        api.statuses = [{"id": 10, "state": "success", "environment_url": self.receipt()["url"]},
                        {"id": 11, "state": "inactive"}]
        data = github.inventory(api)
        self.assertEqual(len(data["environments"]), 1)
        self.assertEqual(data["environments"][0]["state"], "inactive")
        self.assertNotIn("url", data["environments"][0])
        self.assertEqual(data["production"]["status"], "not_observed")

    def test_directory_is_metadata_only_and_setup_unknown(self):
        api = FakeGitHub()
        github.directory(api, 8)
        text = api.mutations[0][2]["body"]
        self.assertIn("Not deployed", text)
        self.assertIn("not inferred from merges", text)

    def test_retire_only_verified_owned_dev_deployments(self):
        api = FakeGitHub()
        api.deployments = [{"id": 3, "environment": "dev-pr-12", "production_environment": False,
                            "payload": {"jemsEnvironmentVersion": 1, "service": "jems-dev-pr-12"}},
                           {"id": 4, "environment": "test", "production_environment": False,
                            "payload": {"jemsEnvironmentVersion": 1, "service": "jems-test"}},
                           {"id": 5, "environment": "production", "production_environment": True}]
        result = github.retire(api, {"status": "cleanup_verified", "deleted": [{"pr": 12, "service": "jems-dev-pr-12", "reason": "expired"}]})
        self.assertEqual(result["deploymentIds"], [3])
        self.assertEqual(len(api.mutations), 1)
        self.assertEqual(api.mutations[0][2]["state"], "inactive")

    def test_retire_refuses_test_and_unverified_receipts_before_mutation(self):
        for receipt in ({"status": "planned", "deleted": []},
                        {"status": "cleanup_verified", "deleted": [{"pr": 12, "service": "jems-test", "reason": "expired"}]}):
            api = FakeGitHub()
            with self.assertRaises(github.GitHubError):
                github.retire(api, receipt)
            self.assertEqual(api.mutations, [])

    def test_transport_rejects_foreign_api(self):
        for endpoint in ("https://example.com", "repos/attacker/repo/actions", github.PREFIX + "/../secrets"):
            with self.assertRaises(github.GitHubError):
                github.GitHub._endpoint(endpoint)


if __name__ == "__main__":
    unittest.main()
