#!/usr/bin/env python3
"""Discovered DEV isolation/controller tests; all cloud responses are fixtures."""
from __future__ import annotations

from copy import deepcopy
from datetime import date
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

import dev_bootstrap as bootstrap
import dev_config as config
import dev_contract as contract
import dev_release as release
import dev_secrets as secret_inputs


def fixture_manifest() -> dict:
    # Deliberately fictional values, used only by the fake Cloud below.
    m = {"version": 1, "environment": "development", "projectId": "fixture-jems-dev", "projectNumber": "1234567890123",
        "region": "us-east4", "sourceSha": "a" * 40,
        "allowedAdults": [{"subject": "accounts.google.com:123456789012345678901", "email": "adult@example.invalid", "operatorConfirmedAdult": True}],
        "worker": {"repository": "fixture-owner/fixture-worker-dev", "repositoryId": "20001", "ownerId": "20002",
            "workflow": "factory-private-dev.yml", "sha": "b" * 40, "runnerGroupId": "20003", "githubAppId": "20004", "githubInstallationId": "20005"},
        "budget": {"expiresAt": 1893456000000, "totalMicroUsd": 5_000_000, "maxJobMicroUsd": 1_000_000, "maxCoachTurnMicroUsd": 100_000},
        "images": {}, "secretVersions": {s: "1" for s in contract.SECRETS},
        "iap": {"oauthConfigured": True}, "coachEnvironment": {"FACTORY_COACH_APPROVED": "false"}, "generationEnabled": False}
    for c in (*contract.COMPONENTS, "sandbox"):
        registry = "jems-dev-sandbox" if c == "sandbox" else "jems-dev-images"
        m["images"][c] = f"us-east4-docker.pkg.dev/fixture-jems-dev/{registry}/{c}@sha256:" + "c" * 64
    for c in ("app", "preview"):
        m["iap"][c + "Audience"] = f"/projects/{m['projectNumber']}/locations/{m['region']}/services/jems-dev-{c}"
    return contract.validate(m, release=True)


def apply_mounts(spec: dict, values: dict[str, str]) -> None:
    container = spec["containers"][0]
    container["env"] = [x for x in container.get("env", []) if "value" in x]
    container["volumeMounts"] = []
    spec["volumes"] = []
    for index, (path, ref) in enumerate(sorted(values.items())):
        secret, version = ref.rsplit(":", 1)
        if path.startswith("/"):
            directory, filename = path.rsplit("/", 1)
            volume = "secret-" + str(index)
            spec["volumes"].append({"name": volume, "secret": {"secretName": secret, "items": [{"key": version, "path": filename}]}})
            container["volumeMounts"].append({"name": volume, "mountPath": directory})
        else:
            container["env"].append({"name": path, "valueFrom": {"secretKeyRef": {"name": secret, "key": version}}})


def service_fixture(m: dict, component: str, suffix: str = "old") -> dict:
    name = contract.service(component)
    spec = {"serviceAccountName": contract.account(m, component), "containerConcurrency": 1 if component == "coach" else 8,
        "timeoutSeconds": 60, "containers": [{"image": m["images"][component],
            "ports": [{"name": "http1", "containerPort": 8080}], "resources": {"limits": {"cpu": "1000m", "memory": "512Mi"}},
            "env": [{"name": k, "value": v} for k, v in release.environment(m, component).items()]}]}
    apply_mounts(spec, release.mounts(m, component))
    return {"metadata": {"name": name, "namespace": m["projectNumber"], "generation": 1,
        "labels": {"environment": "development", "application": "jems", "component": component},
        "annotations": {"run.googleapis.com/ingress": "all", "run.googleapis.com/maxScale": "1", "run.googleapis.com/iap-enabled": "true" if component in ("app", "preview") else "false",
            "run.googleapis.com/urls": json.dumps([contract.native_origin(m, component)])}},
        "spec": {"template": {"metadata": {"annotations": {"autoscaling.knative.dev/maxScale": "1",
            "run.googleapis.com/execution-environment": "gen2", "run.googleapis.com/startup-cpu-boost": "false"}}, "spec": spec}},
        "status": {"observedGeneration": 1, "conditions": [{"type": "Ready", "status": "True"}],
            "url": "https://" + name + "-fixture-hash.a.run.app", "latestReadyRevisionName": name + "-" + suffix,
            "traffic": [{"revisionName": name + "-" + suffix, "percent": 100}]}}


def invokers(m: dict, component: str) -> dict:
    member = "allUsers" if component == "gateway" else "serviceAccount:" + contract.account(m, "gateway") if component == "coach" else (
        "serviceAccount:service-" + m["projectNumber"] + "@gcp-sa-iap.iam.gserviceaccount.com")
    return {"bindings": [{"role": "roles/run.invoker", "members": [member]}]}


class FakeCloud(bootstrap.Cloud):
    def __init__(self, m: dict, *, empty: bool = False):
        super().__init__(m)
        self.calls: list[tuple[str, ...]] = []
        self.services = {} if empty else {contract.service(c): service_fixture(m, c) for c in contract.COMPONENTS}
        self.revisions = {}
        self.access = {} if empty else {c: invokers(m, c) for c in contract.COMPONENTS}
        self.iap = {c: {"bindings": [] if empty else [{"role": "roles/iap.httpsResourceAccessor",
            "members": ["user:" + a["email"] for a in m["allowedAdults"]]}]} for c in ("app", "preview")}
        self.registry_policies = {name: {"bindings": [
            {"role": "roles/artifactregistry.writer", "members": ["serviceAccount:" + contract.account(m, "build")]},
            {"role": "roles/artifactregistry.reader", "members": ["serviceAccount:" + contract.account(m, "release")]}]}
            for name in ("jems-dev-images", "jems-dev-sandbox")}
        self.project_policy = {"bindings": [{"role": role, "members": ["serviceAccount:" + email]}
            for email, roles in bootstrap.wanted_project_roles(m).items() for role in roles]}
        for raw in self.services.values():
            self.remember_revision(raw)

    def remember_revision(self, raw: dict) -> None:
        name = raw["status"]["latestReadyRevisionName"]
        revision = deepcopy(raw["spec"]["template"])
        revision["metadata"].update({"name": name, "namespace": self.manifest["projectNumber"],
            "labels": {"serving.knative.dev/service": raw["metadata"]["name"]}})
        revision["status"] = {"conditions": [{"type": "Ready", "status": "True"}]}
        self.revisions[name] = revision

    def run(self, *args: str) -> object:
        self.calls.append(args)
        m = self.manifest
        if args[:2] == ("projects", "describe"):
            return {"projectId": m["projectId"], "projectNumber": m["projectNumber"], "lifecycleState": "ACTIVE",
                    "labels": {"environment": "development", "application": "jems"}}
        if args[:3] == ("iam", "service-accounts", "describe"):
            return {"email": self.identity, "projectId": m["projectId"]}
        if args[:4] == ("iam", "service-accounts", "keys", "list"):
            return []
        if args[:3] == ("iam", "service-accounts", "list"):
            return [{"email": contract.account(m, x), "projectId": m["projectId"]} for x in contract.IDENTITIES]
        if args[:3] in (("iam", "roles", "list"), ("iam", "roles", "describe")):
            role = {"name": bootstrap.release_role(m), "stage": "GA", "includedPermissions": sorted(bootstrap.RELEASE_PERMISSIONS)}
            return [role] if args[2] == "list" else role
        if args[:2] == ("services", "list"):
            return [{"config": {"name": api}} for api in contract.APIS]
        if args[:2] == ("projects", "get-iam-policy"):
            return deepcopy(self.project_policy)
        if args[:3] == ("firestore", "databases", "list"):
            return [{"name": "projects/" + m["projectId"] + "/databases/(default)", "type": "FIRESTORE_NATIVE",
                "locationId": m["region"], "deleteProtectionState": "DELETE_PROTECTION_ENABLED"}]
        if args[:3] == ("storage", "buckets", "list"):
            return [{"name": m["projectId"] + suffix, "project_number": m["projectNumber"], "location": m["region"].upper(),
                "uniform_bucket_level_access": True, "public_access_prevention": "enforced"} for suffix in ("-artifacts", "-build-source")]
        if args[:3] == ("storage", "buckets", "get-iam-policy"):
            expected = [("build", "roles/storage.objectViewer")] if args[3].endswith("-build-source") else [
                ("gateway", "roles/storage.objectCreator"), ("gateway", "roles/storage.objectViewer"), ("preview", "roles/storage.objectViewer")]
            return {"bindings": [{"role": role, "members": ["serviceAccount:" + contract.account(m, identity)]} for identity, role in expected]}
        if args[:3] == ("artifacts", "repositories", "list"):
            return [{"name": f"projects/{m['projectId']}/locations/{m['region']}/repositories/{name}", "format": "DOCKER",
                "dockerConfig": {"immutableTags": True}} for name in self.registry_policies]
        if args[:3] == ("artifacts", "repositories", "get-iam-policy"):
            return deepcopy(self.registry_policies[args[3]])
        if args[:3] == ("artifacts", "repositories", "add-iam-policy-binding"):
            self.registry_policies[args[3]]["bindings"].append({"role": args[args.index("--role") + 1], "members": [args[args.index("--member") + 1]]})
            return {}
        if args[:2] == ("secrets", "list"):
            return [{"name": "projects/" + m["projectNumber"] + "/secrets/jems-dev-" + name,
                "labels": {"environment": "development", "application": "jems"}} for name in contract.SECRETS]
        if args[:2] == ("secrets", "get-iam-policy"):
            suffix = args[2].removeprefix("jems-dev-")
            reader = {"app-config": "app", "gateway-config": "gateway", "preview-config": "preview", "github-app-key": "gateway", "coach-key": "coach"}[suffix]
            return {"bindings": [{"role": "roles/secretmanager.secretAccessor", "members": ["serviceAccount:" + contract.account(m, reader)]},
                {"role": "roles/secretmanager.viewer", "members": ["serviceAccount:" + contract.account(m, "release")]}]}
        if args[:3] == ("iam", "workload-identity-pools", "list"):
            return []
        if args[:3] == ("secrets", "versions", "describe"):
            return {"name": f"projects/{m['projectNumber']}/secrets/{args[5]}/versions/{args[3]}", "state": "ENABLED"}
        if args[:3] == ("secrets", "versions", "add"):
            return {"name": f"projects/{m['projectNumber']}/secrets/{args[3]}/versions/2", "state": "ENABLED"}
        if args[:4] == ("artifacts", "docker", "images", "describe"):
            return {"image_summary": {"digest": args[4].split("@", 1)[1], "fully_qualified_digest": args[4]}}
        if args[:3] == ("run", "services", "list"):
            return deepcopy(list(self.services.values()))
        if args[:3] == ("run", "services", "describe"):
            return deepcopy(self.services[args[3]])
        if args[:3] == ("run", "revisions", "describe"):
            return deepcopy(self.revisions[args[3]])
        if args[:3] == ("run", "services", "get-iam-policy"):
            return deepcopy(self.access[args[3].removeprefix("jems-dev-")])
        if args[:3] == ("iap", "web", "get-iam-policy"):
            return deepcopy(self.iap[args[args.index("--service") + 1].removeprefix("jems-dev-")])
        if args[:2] == ("run", "deploy"):
            c = args[2].removeprefix("jems-dev-")
            self.services[args[2]] = service_fixture(m, c, "initial")
            self.remember_revision(self.services[args[2]])
            self.access[c] = {"bindings": []}
            return {}
        if args[:3] == ("run", "services", "add-iam-policy-binding"):
            c = args[3].removeprefix("jems-dev-")
            self.access[c] = invokers(m, c)
            return {}
        if args[:3] == ("iap", "web", "add-iam-policy-binding"):
            c = args[args.index("--service") + 1].removeprefix("jems-dev-")
            self.iap[c]["bindings"].append({"role": "roles/iap.httpsResourceAccessor", "members": [args[args.index("--member") + 1]]})
            return {}
        if args[:3] == ("run", "services", "update"):
            raw = self.services[args[3]]
            spec = raw["spec"]["template"]["spec"]
            spec["containers"][0]["image"] = args[args.index("--image") + 1]
            if "--set-env-vars" in args:
                values = dict(x.split("=", 1) for x in args[args.index("--set-env-vars") + 1].split(","))
                spec["containers"][0]["env"] = [{"name": k, "value": v} for k, v in values.items()]
                values = dict(x.split("=", 1) for x in args[args.index("--set-secrets") + 1].split(",")) if "--set-secrets" in args else {}
                apply_mounts(spec, values)
            raw["metadata"]["generation"] += 1
            raw["status"]["observedGeneration"] = raw["metadata"]["generation"]
            raw["status"]["latestReadyRevisionName"] = args[3] + "-" + args[args.index("--revision-suffix") + 1]
            self.remember_revision(raw)
            return {}
        if args[:3] == ("run", "services", "update-traffic"):
            raw = self.services[args[3]]
            values = dict(x.split("=", 1) for x in args[args.index("--to-revisions") + 1].split(","))
            raw["status"]["traffic"] = [{"revisionName": k, "percent": int(v)} for k, v in values.items()]
            raw["metadata"]["generation"] += 1
            raw["status"]["observedGeneration"] = raw["metadata"]["generation"]
            return {}
        raise AssertionError("Unexpected fake cloud operation: " + " ".join(args[:3]))

    def writes(self) -> list[tuple[str, ...]]:
        return [c for c in self.calls if any(x in c[:4] for x in ("deploy", "update", "update-traffic", "add", "add-iam-policy-binding", "create", "enable"))]


class ContractTests(unittest.TestCase):
    def test_incomplete_example_cannot_authorize_any_cloud_operation(self):
        with self.assertRaises(contract.DevError):
            contract.read_manifest(str(Path(__file__).with_name("dev-manifest.example.json")))

    def test_production_targets_rejected_at_any_depth(self):
        for target in (contract.PRODUCTION_PROJECT, contract.PRODUCTION_NUMBER, contract.PRODUCTION_WORKER_ID,
                       contract.PRODUCTION_WORKER, *contract.PRODUCTION_HOSTS):
            with self.subTest(target=target), self.assertRaisesRegex(contract.DevError, "PRODUCTION_TARGET_REJECTED"):
                contract.reject_production({"nested": [{"value": "https://" + target + "/"}]})
        contract.reject_production("family-game-factory-lab/family-game-factory-worker-dev")

    def test_wrong_refs_and_unbounded_values_rejected(self):
        edits = [("projectId", contract.PRODUCTION_PROJECT), ("projectNumber", "9007199254740993"),
                 ("sourceSha", "main"), ("generationEnabled", "true")]
        for key, value in edits:
            m = fixture_manifest(); m[key] = value
            with self.subTest(key=key), self.assertRaises(contract.DevError): contract.validate(m)
        m = fixture_manifest(); m["images"]["gateway"] = m["images"]["gateway"].split("@")[0] + ":latest"
        with self.assertRaises(contract.DevError): contract.validate(m, release=True)
        m = fixture_manifest(); m["secretVersions"]["app-config"] = "latest"
        with self.assertRaises(contract.DevError): contract.validate(m)
        m = fixture_manifest(); m["budget"]["maxCoachTurnMicroUsd"] = 100001
        with self.assertRaises(contract.DevError): contract.validate(m)

    def test_no_identity_or_credential_override_in_coach_environment(self):
        for key in ("FACTORY_COACH_PRIVATE_OPENAI_API_KEY", "FACTORY_COACH_GATEWAY_SERVICE_ACCOUNT", "FACTORY_COACH_PRIVATE_AUDIENCE", "FACTORY_COACH_UNKNOWN"):
            m = fixture_manifest(); m["coachEnvironment"][key] = "forbidden"
            with self.subTest(key=key), self.assertRaises(contract.DevError): contract.validate(m)

    def test_duplicate_and_unconfirmed_adults_rejected(self):
        m = fixture_manifest(); m["allowedAdults"][0]["operatorConfirmedAdult"] = False
        with self.assertRaises(contract.DevError): contract.validate(m)
        m = fixture_manifest(); second = deepcopy(m["allowedAdults"][0]); second["subject"] += "1"; m["allowedAdults"].append(second)
        with self.assertRaises(contract.DevError): contract.validate(m)

    def test_cloud_commands_always_scope_project_and_impersonation(self):
        m = fixture_manifest(); cloud = bootstrap.Cloud(m, "release")
        command = cloud.command(["run", "services", "list"])
        self.assertEqual(command[command.index("--project") + 1], m["projectId"])
        self.assertEqual(command[command.index("--impersonate-service-account") + 1], contract.account(m, "release"))
        self.assertNotIn("--allow-unauthenticated", " ".join(command))

    def test_cloud_errors_are_sanitized_and_not_retried(self):
        cloud = bootstrap.Cloud(fixture_manifest())
        response = subprocess.CompletedProcess([], 1, "PRIVATE_SECRET_MARKER", "PRIVATE_SECRET_MARKER")
        with patch("dev_bootstrap.subprocess.run", return_value=response) as run:
            with self.assertRaises(contract.DevError) as caught: cloud.run("projects", "describe", "fixture-jems-dev")
            self.assertNotIn("PRIVATE_SECRET_MARKER", str(caught.exception)); self.assertEqual(run.call_count, 1)

    def test_release_source_receipts_are_required_and_all_images_must_match(self):
        m = fixture_manifest(); cloud = FakeCloud(m)
        with self.assertRaises(contract.DevError): release.verify_build_receipts(m, cloud, None)
        with patch.dict(sys.modules, {"dev_images": types.SimpleNamespace(verify_release_images=lambda *_: {"app": m["images"]["app"]})}):
            with self.assertRaises(contract.DevError): release.verify_build_receipts(m, cloud, [{"fixture": True}])
        observed = []
        def verify(manifest, identity, receipts):
            observed.append((manifest["sourceSha"], identity.identity, receipts)); return {"images": manifest["images"], "selectedSourceSha": manifest["sourceSha"], "builds": []}
        with patch.dict(sys.modules, {"dev_images": types.SimpleNamespace(verify_release_images=verify)}):
            release.verify_build_receipts(m, cloud, [{"fixture": True}])
        self.assertEqual(observed[0][0], m["sourceSha"])


class FoundationTests(unittest.TestCase):
    def test_complete_foundation_check_is_read_only(self):
        m = fixture_manifest(); cloud = FakeCloud(m)
        result = bootstrap.run_bootstrap(m, cloud, False)
        self.assertFalse(cloud.writes()); self.assertFalse(result["paidAIActivated"])

    def test_read_failure_never_means_resource_absent(self):
        m = fixture_manifest(); cloud = FakeCloud(m)
        original = cloud.run
        def run(*args):
            if args[:3] == ("firestore", "databases", "list"): raise contract.DevError("unavailable")
            return original(*args)
        cloud.run = run
        with self.assertRaises(contract.DevError): bootstrap.run_bootstrap(m, cloud, True)
        self.assertFalse(cloud.writes())

    def test_database_and_registry_conflicts_fail_before_mutation(self):
        m = fixture_manifest(); cloud = FakeCloud(m); state = bootstrap.inventory(m, cloud)
        state["databases"][0]["locationId"] = "us-west1"
        with self.assertRaises(contract.DevError): bootstrap.mutations(m, state)
        state = bootstrap.inventory(m, cloud); state["registries"][0]["dockerConfig"]["immutableTags"] = False
        with self.assertRaises(contract.DevError): bootstrap.mutations(m, state)

    def test_missing_api_is_enabled_before_any_inventory_assumption(self):
        result = bootstrap.mutations(fixture_manifest(), {"missingApis": ["firestore.googleapis.com"]})
        self.assertEqual(result, [["services", "enable", "firestore.googleapis.com"]])

    def test_privileged_runtime_role_or_public_data_is_rejected(self):
        m = fixture_manifest(); cloud = FakeCloud(m)
        cloud.project_policy["bindings"].append({"role": "roles/owner", "members": ["serviceAccount:" + contract.account(m, "gateway")]})
        with self.assertRaises(contract.DevError): bootstrap.inventory(m, cloud)
        with self.assertRaises(contract.DevError): bootstrap.check_resource_grants({"bindings": [{"role": "roles/storage.objectViewer", "members": ["allUsers"]}]}, {}, complete=False)

    def test_no_public_images_or_worker_compute_grants_in_foundation_plan(self):
        commands = bootstrap.mutations(fixture_manifest())
        text = json.dumps(commands)
        self.assertNotIn("allUsers", text); self.assertNotIn("compute.instances.create", text)
        self.assertIn("jems-dev-sandbox", text); self.assertIn("iap.webServices.getIamPolicy", text)
        self.assertNotIn("secretmanager.versions.access", text)

    def test_worker_oidc_condition_pins_every_identity_boundary(self):
        m = fixture_manifest(); condition = bootstrap.worker_condition(m)
        for item in (m["worker"]["repositoryId"], m["worker"]["ownerId"], m["worker"]["sha"], "private", "refs/heads/main", "workflow_sha", "factory-private-dev.yml", "jems-dev-infrastructure", "workflow_dispatch"):
            self.assertIn(item, condition)

    def test_public_sandbox_requires_live_source_verification_first(self):
        m = fixture_manifest(); cloud = FakeCloud(m); called = []
        def verified(*_): called.append(len(cloud.writes()))
        with patch.dict(sys.modules, {"dev_images": types.SimpleNamespace(verify_existing_build=verified)}):
            result = bootstrap.publish_sandbox(m, cloud, {"images": {"sandbox": m["images"]["sandbox"]}})
        self.assertEqual(called, [0]); self.assertTrue(result["publicSandboxReadVerified"])
        self.assertEqual([c[3] for c in cloud.writes()], ["jems-dev-sandbox"])
        self.assertNotIn("allUsers", json.dumps(cloud.registry_policies["jems-dev-images"]))


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        # Build provenance has its own integration helper tests; these cases
        # isolate the release state machine using a verified local fixture.
        self.source_proof = patch("dev_release.verify_build_receipts", return_value=None)
        self.source_proof.start(); self.addCleanup(self.source_proof.stop)

    def test_service_metadata_requires_iap_identity_limits_and_exact_secrets(self):
        m = fixture_manifest(); raw = service_fixture(m, "app")
        release.verify_service(m, "app", raw)
        edits = [lambda x: x["metadata"]["annotations"].update({"run.googleapis.com/iap-enabled": "false"}),
            lambda x: x["metadata"]["annotations"].pop("run.googleapis.com/maxScale"),
            lambda x: x["metadata"]["annotations"].update({"run.googleapis.com/maxScale": "2"}),
            lambda x: x["metadata"]["annotations"].update({"run.googleapis.com/minScale": "1"}),
            lambda x: x["metadata"].update({"namespace": contract.PRODUCTION_NUMBER}),
            lambda x: x["spec"]["template"]["spec"].update({"serviceAccountName": contract.account(m, "gateway")}),
            lambda x: x["spec"]["template"]["metadata"]["annotations"].update({"autoscaling.knative.dev/maxScale": "10"}),
            lambda x: x["spec"]["template"]["spec"]["volumes"][0]["secret"]["items"][0].update({"key": "latest"}),
            lambda x: x["metadata"]["annotations"].pop("run.googleapis.com/urls"),
            lambda x: x["spec"]["template"]["spec"]["containers"][0]["resources"]["limits"].update({"cpu": "8"})]
        for edit in edits:
            changed = deepcopy(raw); edit(changed)
            with self.subTest(edit=edit), self.assertRaises(contract.DevError): release.verify_service(m, "app", changed)

    def test_first_create_has_iap_and_private_coach_and_no_paid_claim(self):
        m = fixture_manifest(); cloud = FakeCloud(m, empty=True)
        result = release.create(m, cloud)
        self.assertEqual(len([c for c in cloud.writes() if c[:2] == ("run", "deploy")]), 4)
        self.assertFalse(result["adultLoginVerified"]); self.assertFalse(result["paidAIVerified"])
        for component in contract.COMPONENTS: release.verify_access(m, cloud, component)
        self.assertEqual(release.environment(m, "coach")["FACTORY_DEV_REGION"], m["region"])
        for component in contract.COMPONENTS:
            command = release.first_deploy_commands(m, component)[0]
            self.assertEqual(command[command.index("--max") + 1], "1")

    def test_inactive_and_audio_only_coach_start_without_model_key(self):
        for audio in (False, True):
            m = fixture_manifest(); m["secretVersions"]["coach-key"] = None
            m["coachEnvironment"]["FACTORY_COACH_AUDIO_APPROVED"] = str(audio).lower()
            contract.validate(m, release=True)
            self.assertEqual(release.mounts(m, "coach"), {})
            self.assertIn("--clear-secrets", release.first_deploy_commands(m, "coach")[0])
            cloud = FakeCloud(m, empty=True); release.create(m, cloud)
            self.assertFalse(any(c[:3] == ("secrets", "versions", "describe") and "jems-dev-coach-key" in c for c in cloud.calls))

    def test_disabling_model_coaching_explicitly_removes_model_key_mount(self):
        old = fixture_manifest(); old["coachEnvironment"]["FACTORY_COACH_APPROVED"] = "true"
        target = deepcopy(old); target["coachEnvironment"]["FACTORY_COACH_APPROVED"] = "false"; target["secretVersions"]["coach-key"] = None
        cloud = FakeCloud(old); receipt = release.stage(target, cloud, old)
        self.assertTrue(receipt["configChange"])
        coach_update = [c for c in cloud.writes() if c[:4] == ("run", "services", "update", "jems-dev-coach")][0]
        self.assertIn("--clear-secrets", coach_update)
        self.assertNotIn("FACTORY_COACH_PRIVATE_OPENAI_API_KEY", json.dumps(cloud.services["jems-dev-coach"]))

    def test_first_create_refuses_drift_before_any_write(self):
        m = fixture_manifest(); cloud = FakeCloud(m)
        cloud.services["jems-dev-app"]["spec"]["template"]["spec"]["containers"][0]["env"].append({"name": "UNKNOWN", "value": "true"})
        with self.assertRaises(contract.DevError): release.create(m, cloud)
        self.assertFalse(cloud.writes())

    def changed_images(self):
        old = fixture_manifest(); target = deepcopy(old); target["sourceSha"] = "d" * 40
        target["images"] = {c: value.split("@", 1)[0] + "@sha256:" + "e" * 64 for c, value in old["images"].items()}
        return old, target

    def test_image_stage_preserves_config_and_traffic_then_can_rollback(self):
        old, target = self.changed_images(); cloud = FakeCloud(old)
        receipt = release.stage(target, cloud)
        self.assertTrue(receipt["rollbackSupported"])
        for args in cloud.writes():
            self.assertIn("--no-traffic", args); self.assertNotIn("--set-env-vars", args); self.assertNotIn("--set-secrets", args)
        for c in contract.COMPONENTS: self.assertEqual(receipt["before"][c]["traffic"], receipt["candidate"][c]["traffic"])
        promoted = release.traffic(target, cloud, receipt, False)
        self.assertEqual(promoted["status"], "candidate-serving-awaiting-acceptance")
        restored = release.traffic(target, cloud, receipt, True)
        self.assertEqual(restored["status"], "prior-traffic-restored")
        for c in contract.COMPONENTS: self.assertEqual(restored["traffic"][c], {"jems-dev-" + c + "-old": 100})

    def test_stage_captures_serving_revision_not_just_last_template(self):
        old, target = self.changed_images(); cloud = FakeCloud(old)
        app = cloud.services["jems-dev-app"]
        app["status"]["latestReadyRevisionName"] = "jems-dev-app-unserved"
        app["spec"]["template"]["spec"]["containers"][0]["image"] = old["images"]["app"].split("@")[0] + "@sha256:" + "f" * 64
        cloud.remember_revision(app)
        receipt = release.stage(target, cloud)
        evidence = receipt["before"]["app"]
        self.assertNotEqual(evidence["image"], evidence["servingRevisions"]["jems-dev-app-old"]["image"])
        self.assertEqual(evidence["servingRevisions"]["jems-dev-app-old"]["image"], old["images"]["app"])

    def test_config_stage_requires_exact_old_manifest_and_refuses_auto_rollback(self):
        old, target = self.changed_images(); target["generationEnabled"] = True
        target["secretVersions"]["gateway-config"] = "2"
        cloud = FakeCloud(old)
        with self.assertRaises(contract.DevError): release.stage(target, cloud)
        self.assertFalse(cloud.writes())
        receipt = release.stage(target, cloud, old)
        self.assertTrue(receipt["configChange"]); self.assertFalse(receipt["rollbackSupported"])
        self.assertTrue(any("--set-env-vars" in c for c in cloud.writes()))
        with self.assertRaisesRegex(contract.DevError, "previous DEV manifest"): release.traffic(target, cloud, receipt, False)
        release.traffic(target, cloud, receipt, False, old)
        with self.assertRaisesRegex(contract.DevError, "DEV_CONFIG_ROLLBACK_REJECTED"): release.traffic(target, cloud, receipt, True)

    def test_config_stage_cannot_add_adults_change_identity_or_top_up_cap(self):
        old = fixture_manifest()
        for section, key, value in (("budget", "totalMicroUsd", 6_000_000), ("worker", "repositoryId", "987654")):
            target = deepcopy(old); target[section][key] = value
            with self.subTest(key=key), self.assertRaises(contract.DevError): release.transition(target, old)
        target = deepcopy(old); target["allowedAdults"][0]["email"] = "another@example.invalid"
        with self.assertRaises(contract.DevError): release.transition(target, old)

    def test_worker_sha_change_requires_new_gateway_config_version(self):
        old = fixture_manifest(); target = deepcopy(old); target["worker"]["sha"] = "f" * 40
        with self.assertRaises(contract.DevError): release.transition(target, old)

    def test_superseded_candidate_and_tampered_old_revision_block_traffic(self):
        old, target = self.changed_images(); cloud = FakeCloud(old); receipt = release.stage(target, cloud)
        cloud.calls.clear()
        cloud.services["jems-dev-app"]["status"]["latestReadyRevisionName"] = "jems-dev-app-other"
        with self.assertRaises(contract.DevError): release.traffic(target, cloud, receipt, False)
        self.assertFalse(cloud.writes())
        cloud = FakeCloud(old); receipt = release.stage(target, cloud); cloud.calls.clear()
        cloud.revisions["jems-dev-coach-old"]["spec"]["serviceAccountName"] = contract.account(old, "gateway")
        with self.assertRaises(contract.DevError): release.traffic(target, cloud, receipt, True)
        self.assertFalse(cloud.writes())


class ConfigTests(unittest.TestCase):
    def new_manifest(self):
        m = fixture_manifest(); m["secretVersions"] = {name: None for name in contract.SECRETS}; return m

    def test_templates_and_private_keys_are_explicit_and_separate(self):
        m = self.new_manifest(); template = config.render(m)
        self.assertTrue(template["gateway-config"]["sessionKey"].startswith("REQUIRED_"))
        private = config.render(m, initialize=True)
        gateway = private["gateway-config"]
        self.assertGreaterEqual(len(gateway["sessionKey"]), 32); self.assertNotEqual(gateway["sessionKey"], gateway["previewKey"])
        self.assertEqual(private["preview-config"]["previewKey"], gateway["previewKey"])
        self.assertEqual(gateway["gatewayOrigin"], contract.native_origin(m, "gateway"))
        self.assertEqual(private["app-config"]["appOrigin"], contract.native_origin(m, "app"))
        self.assertNotIn("sessionKey", private["app-config"]); self.assertNotIn("githubPrivateKeyFile", private["preview-config"])

    def test_config_update_retains_keys_and_rejects_foreign_previous_config(self):
        m = self.new_manifest(); initial = config.render(m, initialize=True); previous = initial["gateway-config"]
        updated = config.render(m, initialize=True, previous=previous)
        self.assertEqual(updated["gateway-config"]["sessionKey"], previous["sessionKey"])
        previous["projectId"] = "another-jems-dev"
        with self.assertRaises(contract.DevError): config.render(m, initialize=True, previous=previous)

    def test_activation_requires_current_explicit_approval(self):
        m = self.new_manifest(); m["generationEnabled"] = True
        with self.assertRaises(contract.DevError): config.render(m, initialize=True)
        approval = {"enabled": True, "approvalId": "fixture-only", "model": "fixture-model", "inputUsdPerMillion": 1,
            "outputUsdPerMillion": 2, "maxInputTokens": 24000, "maxOutputTokens": 4000, "priceReviewedOn": date.today().isoformat()}
        self.assertTrue(config.render(m, initialize=True, approval=approval)["gateway-config"]["active"])
        approval["priceReviewedOn"] = "2020-01-01"
        with self.assertRaises(contract.DevError): config.render(m, initialize=True, approval=approval)

    def test_private_output_is_exclusive_and_mode_restricted(self):
        with tempfile.TemporaryDirectory() as directory:
            target = str(Path(directory) / "new-config")
            paths = config.write_new(target, config.render(self.new_manifest(), initialize=True))
            self.assertEqual(os.stat(target).st_mode & 0o777, 0o700)
            for path in paths: self.assertEqual(os.stat(path).st_mode & 0o777, 0o600)
            with self.assertRaises(contract.DevError): config.write_new(target, {})

    def test_secret_upload_checks_config_parity_and_only_returns_version_metadata(self):
        m = self.new_manifest()
        with tempfile.TemporaryDirectory() as directory:
            target = str(Path(directory) / "private")
            values = config.render(m, initialize=True); config.write_new(target, values)
            pem = Path(directory) / "app.pem"; key = Path(directory) / "coach.key"
            pem.write_text("-----BEGIN PRIVATE KEY-----\n" + "A" * 600 + "\n-----END PRIVATE KEY-----\n")
            key.write_text("FIXTURE_PRIVATE_KEY_VALUE_12345")
            pem.chmod(0o600); key.chmod(0o600)
            paths = secret_inputs.inputs(m, target, str(pem), str(key))
            cloud = FakeCloud(m, empty=True); new, receipt = secret_inputs.upload(m, cloud, paths)
            self.assertEqual(set(new["secretVersions"].values()), {"2"})
            self.assertNotIn(values["gateway-config"]["sessionKey"], json.dumps(receipt))
            self.assertNotIn(key.read_text(), json.dumps(receipt))
            changed = deepcopy(m); changed["worker"]["sha"] = "e" * 40
            with self.assertRaises(contract.DevError): secret_inputs.inputs(changed, target, str(pem), str(key))

    def test_existing_installation_cannot_generate_replacement_signing_keys(self):
        with self.assertRaisesRegex(contract.DevError, "never rotate signing keys"):
            config.render(fixture_manifest(), initialize=True)


if __name__ == "__main__":
    unittest.main()
