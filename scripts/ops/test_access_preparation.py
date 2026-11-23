import copy
import unittest
from unittest.mock import patch

import access_preflight
import activation_review
import admin_cloud
import admin_drill
from admin_api import Plan, SetupError
import release


HEAD = "a" * 40


class LocalPreflightTests(unittest.TestCase):
    def test_local_success_does_not_claim_remote_readiness_or_invoke_auth(self):
        with patch("access_preflight.shutil.which", return_value="available"), \
                patch("access_preflight.command", side_effect=[HEAD, ""]) as command:
            result = access_preflight.inspect(HEAD)
        self.assertTrue(result["ready_for_account_plan"])
        self.assertFalse(result["activation_ready"])
        self.assertEqual(result["source"]["current_pr107_head"], "not_checked_locally")
        self.assertTrue(all(call.args[0][0] == "git" for call in command.call_args_list))
        self.assertEqual(len(command.call_args_list), 2)

    def test_all_missing_tools_reported_without_auth_or_cloud_attempt(self):
        with patch("access_preflight.shutil.which", return_value=None), \
                patch("access_preflight.command") as command:
            result = access_preflight.inspect(HEAD, with_drill=True)
        self.assertFalse(result["ready_for_account_plan"])
        self.assertEqual(len(result["blockers"]), 5)
        self.assertIsNone(result["next_read_only_command"])
        command.assert_not_called()

    def test_wrong_or_dirty_source_blocks_handoff(self):
        for head, status in (("b" * 40, ""), (HEAD, " M ops/release.json"), (HEAD, "?? private-state.json")):
            with self.subTest(head=head, status=status), \
                    patch("access_preflight.shutil.which", return_value="available"), \
                    patch("access_preflight.command", side_effect=[head, status]):
                result = access_preflight.inspect(HEAD)
                self.assertFalse(result["ready_for_account_plan"])
                self.assertIsNone(result["next_read_only_command"])

    def test_invalid_sha_cannot_be_used_as_a_command_argument(self):
        with patch("access_preflight.shutil.which", return_value="available"), \
                patch("access_preflight.command") as command:
            result = access_preflight.inspect("--help")
        self.assertFalse(result["ready_for_account_plan"])
        command.assert_not_called()

    def test_docker_only_required_when_drill_requested(self):
        available = lambda name: None if name == "docker" else "available"
        for with_drill in (False, True):
            with self.subTest(with_drill=with_drill), \
                    patch("access_preflight.shutil.which", side_effect=available), \
                    patch("access_preflight.command", side_effect=[HEAD, ""]):
                result = access_preflight.inspect(HEAD, with_drill=with_drill)
                self.assertEqual(result["ready_for_account_plan"], not with_drill)


class ProductionReviewTests(unittest.TestCase):
    def services(self):
        return {name: {"baseline": "reviewed-baseline", "image": "sha256:" + "b" * 64,
                       "configuration_matches": True, "etag": "observed"}
                for name in release.SERVICES}

    def test_metadata_success_never_becomes_activation_or_effective_iam_proof(self):
        services = self.services()
        original = copy.deepcopy(services)
        plan = activation_review.review_plan(HEAD, services)
        self.assertEqual(plan.actions, [])
        self.assertEqual(plan.work, [])
        self.assertFalse(plan.evidence["activation_ready"])
        self.assertEqual(services, original)
        statuses = {entry["gate"]: entry["status"] for entry in plan.evidence["gates"]}
        self.assertEqual(statuses["production_resource_metadata"], "observed")
        self.assertEqual(statuses["effective_iam_including_inherited_grants_and_deny_policies"], "not_verified_by_this_report")
        self.assertEqual(statuses["explicit_owner_approval_of_exact_activation_scope"], "required_not_inferred")
        self.assertTrue(all(value == "keep_unset" for value in plan.evidence["enable_flags"].values()))

    def test_operations_polling_is_separate_from_service_updates(self):
        plan = activation_review.review_plan(HEAD, self.services())
        rows = plan.evidence["proposed_permission_scope"]
        project_rows = [row for row in rows if row["resource"] == f"projects/{release.PROJECT}"]
        self.assertEqual(len(project_rows), 1)
        self.assertEqual(project_rows[0]["custom_role_permissions"], ["run.operations.get"])
        service_rows = [row for row in rows if "/services/" in row["resource"]]
        self.assertEqual({row["resource"] for row in service_rows},
                         {f"{release.LOCATION}/services/{name}" for name in release.SERVICES})
        for row in service_rows:
            self.assertEqual(set(row["custom_role_permissions"]),
                             {"run.services.get", "run.services.update", "run.revisions.get"})

    def test_runtime_grants_are_exact_and_drift_does_not_enroll_a_service(self):
        services = self.services()
        services["factory-coach-private"]["configuration_matches"] = False
        plan = activation_review.review_plan(HEAD, services)
        rows = [row for row in plan.evidence["proposed_permission_scope"]
                if row.get("role") == "roles/iam.serviceAccountUser"]
        self.assertEqual(len(rows), 3)
        self.assertTrue(all("/serviceAccounts/" in row["resource"] for row in rows))
        self.assertTrue(any("/serviceAccounts/factory-coach@" in row["resource"] for row in rows))
        enrollment = {row["service"]: row for row in plan.evidence["service_enrollment"]}
        self.assertTrue(all(row["status"] == "not_enrolled" for row in enrollment.values()))
        self.assertEqual(enrollment["factory-coach-private"]["serving_configuration"], "blocked_or_unverified")

    def test_cloud_entrypoint_only_reads_before_building_inert_review(self):
        with patch("admin_cloud.project_check") as project_check, \
                patch.object(admin_cloud.Cloud, "serving", return_value=self.services()) as serving, \
                patch("admin_cloud.add_gcloud") as mutation:
            plan = admin_cloud.Cloud("unused", HEAD).production_plan()
        project_check.assert_called_once_with(admin_cloud.PROJECT, admin_cloud.NUMBER)
        serving.assert_called_once_with()
        mutation.assert_not_called()
        self.assertEqual(plan.actions, [])


class IsolatedRegistryTests(unittest.TestCase):
    PROJECT = "jems-ops-drill-test"

    def operator(self):
        return f"{admin_drill.OPERATOR}@{self.PROJECT}.iam.gserviceaccount.com"

    def policy(self):
        return {"bindings": [{"role": "roles/artifactregistry.reader",
                              "members": [f"serviceAccount:{self.operator()}"]}]}

    def test_plan_is_read_only_and_apply_binds_only_exact_isolated_repository(self):
        plan = Plan("test", {})
        with patch("admin_cloud.registry", return_value=set()) as registry, \
                patch("admin_drill.gcloud", side_effect=[{}, {}, self.policy()]) as gcloud:
            admin_drill.synthetic_registry(plan, self.PROJECT, self.operator())
            gcloud.assert_not_called()
            self.assertEqual(len(plan.actions), 1)
            registry.assert_called_once_with(plan, self.PROJECT, "jems-drill", expected_bindings={
                ("roles/artifactregistry.reader", f"serviceAccount:{self.operator()}")})
            plan.execute(plan.review_code())
        writes = [call.args for call in gcloud.call_args_list if "add-iam-policy-binding" in call.args]
        self.assertEqual(writes, [(self.PROJECT, "artifacts", "repositories", "add-iam-policy-binding", "jems-drill",
                                  "--location=us-east5", f"--member=serviceAccount:{self.operator()}",
                                  "--role=roles/artifactregistry.reader", "--condition=None")])

    def test_existing_exact_reader_is_idempotent(self):
        plan = Plan("test", {})
        with patch("admin_cloud.registry", return_value={
                ("roles/artifactregistry.reader", f"serviceAccount:{self.operator()}")}), \
                patch("admin_drill.gcloud") as gcloud:
            admin_drill.synthetic_registry(plan, self.PROJECT, self.operator())
        self.assertEqual(plan.actions, [])
        gcloud.assert_not_called()

    def test_production_or_other_reader_is_rejected_before_a_plan(self):
        for project, operator in ((admin_cloud.PROJECT, self.operator()),
                                  (self.PROJECT, "unexpected@example.com")):
            with self.subTest(project=project, operator=operator), \
                    patch("admin_cloud.registry") as registry:
                with self.assertRaises(SetupError):
                    admin_drill.synthetic_registry(Plan("test", {}), project, operator)
                registry.assert_not_called()

    def test_unexpected_binding_appearing_before_apply_is_preserved_and_refused(self):
        plan = Plan("test", {})
        unexpected = {"bindings": [{"role": "roles/artifactregistry.writer", "members": ["user:other@example.com"]}]}
        with patch("admin_cloud.registry", return_value=set()), \
                patch("admin_drill.gcloud", return_value=unexpected) as gcloud:
            admin_drill.synthetic_registry(plan, self.PROJECT, self.operator())
            with self.assertRaisesRegex(SetupError, "Unknown grants"):
                plan.execute(plan.review_code())
        self.assertEqual(len(gcloud.call_args_list), 1)
        self.assertIn("get-iam-policy", gcloud.call_args.args)

    def test_failed_readback_cannot_pass_setup(self):
        plan = Plan("test", {})
        with patch("admin_cloud.registry", return_value=set()), \
                patch("admin_drill.gcloud", return_value={}):
            admin_drill.synthetic_registry(plan, self.PROJECT, self.operator())
            with self.assertRaisesRegex(SetupError, "did not read back"):
                plan.execute(plan.review_code())

    def test_production_registry_still_rejects_any_reader_grant(self):
        existing = {"name": "projects/example/locations/us-east5/repositories/jems-release-images",
                    "format": "DOCKER", "description": admin_cloud.MARKER,
                    "dockerConfig": {"immutableTags": True}}
        with patch("admin_cloud.rows", return_value=[existing]), \
                patch("admin_cloud.gcloud", return_value=self.policy()):
            with self.assertRaisesRegex(SetupError, "Unknown grants"):
                admin_cloud.registry(Plan("test", {}), admin_cloud.PROJECT, "jems-release-images")


if __name__ == "__main__":
    unittest.main()
