"""Offline checks for identity selection, redaction and Cloud Run read boundaries."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("jems_ops_diagnose", Path(__file__).with_name("diagnose.py"))
diag = importlib.util.module_from_spec(spec)
spec.loader.exec_module(diag)

DIGEST = "sha256:" + "a" * 64
LEAK = "synthetic-private-prompt-credential-do-not-print"


def container():
    return {"image": f"us-east5-docker.pkg.dev/{diag.PROJECT}/factory-services/gateway@{DIGEST}",
            "env": [{"name": "FACTORY_ACTIONS_APPROVED", "value": "false"},
                    {"name": "FACTORY_PRIVATE_CONFIG", "value": "/var/run/factory-config/config.json"},
                    {"name": "ARBITRARY_SECRET", "value": LEAK},
                    {"name": "FACTORY_OPENAI_API_KEY", "valueFrom": {"secretKeyRef": {"name": LEAK, "key": "1"}}}],
            "volumeMounts": [{"name": "config", "mountPath": "/var/run/factory-config"}]}


def revision(name):
    return {"metadata": {"name": name}, "spec": {"containers": [container()],
            "volumes": [{"name": "config", "secret": {"secretName": "factory-gateway-private-config", "items": [{"key": "12", "path": "config.json"}]}},
                        {"name": "unused", "secret": {"secretName": LEAK}}]},
            "status": {"imageDigest": "host/path@" + DIGEST,
                       "conditions": [{"type": "Ready", "status": "True", "message": LEAK}]}}


def service(name="factory-gateway"):
    current = name + "-00002-abc"
    return {"metadata": {"name": name, "generation": 2},
            "spec": {"template": {"spec": revision(current)["spec"]}},
            "status": {"observedGeneration": 2, "latestCreatedRevisionName": current,
                       "latestReadyRevisionName": current,
                       "conditions": [{"type": "Ready", "status": "True", "message": LEAK}],
                       "traffic": [{"revisionName": current, "percent": 100},
                                   {"revisionName": name + "-00001-abc", "percent": None, "tag": LEAK}]}}


class DiagnosticsTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.manifest = Path(self.tmp.name) / "identity.json"
        self.env = {"OIC_MANIFEST_PATH": str(self.manifest), "PATH": "/synthetic/bin",
                    "HTTPS_PROXY": "https://approved-proxy.invalid", "GUARD_BINDING": LEAK}
        self.write_manifest([self.connection()])

    def connection(self, alias="jems-read", **extra):
        return {"alias": alias, "provider_kind": "gcp", "config_dir": "/managed/gcp",
                "service_account_email": diag.DIAGNOSTICS_ACCOUNT,
                "setup": {"status": "ready"}, **extra}

    def write_manifest(self, connections, version=1):
        self.manifest.write_text(json.dumps({"version": version, "connections": connections}), encoding="utf-8")

    def test_identity_selects_documented_bindings_and_preserves_proxy(self):
        self.write_manifest([self.connection(configuration_name="jems", credentials_file="/managed/credentials.json")])
        env = diag.identity_environment(environ=self.env)
        self.assertEqual(env["CLOUDSDK_CONFIG"], "/managed/gcp")
        self.assertEqual(env["CLOUDSDK_ACTIVE_CONFIG_NAME"], "jems")
        self.assertEqual(env["GOOGLE_APPLICATION_CREDENTIALS"], "/managed/credentials.json")
        self.assertEqual(env["HTTPS_PROXY"], self.env["HTTPS_PROXY"])
        self.assertEqual(env["GUARD_BINDING"], LEAK)
        self.assertEqual(env["CLOUDSDK_CORE_DISABLE_PROMPTS"], "1")
        self.assertEqual(env["CLOUDSDK_RUN_PLATFORM"], "managed")

    def test_missing_manifest_never_falls_back_to_owner_cli(self):
        with self.assertRaisesRegex(diag.DiagnosticError, "IDENTITY_NOT_CONFIGURED"):
            diag.identity_environment(environ={"CLOUDSDK_CONFIG": "/owner"})

    def test_alias_or_default_cannot_select_an_unapproved_service_account(self):
        for account in (None, "", LEAK, "other@family-game-factory-jzw.iam.gserviceaccount.com"):
            for alias in (None, "jems-read"):
                with self.subTest(account=account, alias=alias):
                    self.write_manifest([self.connection(service_account_email=account, is_default=True)])
                    with patch.object(diag.shutil, "which", return_value="/managed/bin/gcloud"), \
                            patch.object(diag.subprocess, "run") as run:
                        with self.assertRaisesRegex(diag.DiagnosticError, "IDENTITY_OUTSIDE_SCOPE") as caught:
                            diag.report(self.env, alias=alias, self_check=True)
                    run.assert_not_called()
                    self.assertNotIn(LEAK, str(caught.exception))

    def test_ambient_auth_and_endpoint_overrides_fail_closed_without_disclosure(self):
        for key in ("CLOUDSDK_CORE_ACCOUNT", "CLOUDSDK_AUTH_ACCESS_TOKEN",
                    "CLOUDSDK_AUTH_ACCESS_TOKEN_FILE", "CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT",
                    "CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE", "CLOUDSDK_API_ENDPOINT_OVERRIDES_RUN"):
            with self.subTest(key=key), self.assertRaisesRegex(diag.DiagnosticError, "IDENTITY_OVERRIDE_UNVERIFIED") as caught:
                diag.identity_environment(environ={**self.env, key: LEAK})
            self.assertNotIn(LEAK, str(caught.exception))
        for key in ("CLOUDSDK_ACTIVE_CONFIG_NAME", "GOOGLE_APPLICATION_CREDENTIALS"):
            with self.subTest(key=key), self.assertRaisesRegex(diag.DiagnosticError, "IDENTITY_SELECTOR_AMBIGUOUS") as caught:
                diag.identity_environment(environ={**self.env, key: LEAK})
            self.assertNotIn(LEAK, str(caught.exception))

    def test_matching_managed_credential_override_is_preserved(self):
        self.write_manifest([self.connection(credentials_file="/managed/credentials.json")])
        env = diag.identity_environment(environ={**self.env, "CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE": "/managed/credentials.json"})
        self.assertEqual(env["CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE"], "/managed/credentials.json")

    def test_ambiguous_identity_requires_selection_and_default_is_respected(self):
        self.write_manifest([self.connection("first"), self.connection("second", config_dir="/second")])
        with self.assertRaisesRegex(diag.DiagnosticError, "IDENTITY_SELECTION_REQUIRED"):
            diag.identity_environment(environ=self.env)
        self.assertEqual(diag.identity_environment("second", self.env)["CLOUDSDK_CONFIG"], "/second")
        self.write_manifest([self.connection("first"), self.connection("second", config_dir="/second", is_default=True)])
        self.assertEqual(diag.identity_environment(environ=self.env)["CLOUDSDK_CONFIG"], "/second")

    def test_unsupported_manifest_and_failed_setup_are_closed(self):
        for version in (2, True, "1"):
            with self.subTest(version=version):
                self.write_manifest([self.connection()], version)
                with self.assertRaisesRegex(diag.DiagnosticError, "IDENTITY_MANIFEST_UNSUPPORTED"):
                    diag.identity_environment(environ=self.env)
        self.write_manifest([self.connection(setup={"status": "failed", "error": LEAK})])
        with self.assertRaisesRegex(diag.DiagnosticError, "IDENTITY_SETUP_FAILED") as caught:
            diag.identity_environment(environ=self.env)
        self.assertNotIn(LEAK, str(caught.exception))

    def test_adc_file_alone_cannot_select_unrelated_gcloud_identity(self):
        self.write_manifest([{"alias": "adc-only", "provider_kind": "gcp", "credentials_file": "/managed/adc.json",
                              "service_account_email": diag.DIAGNOSTICS_ACCOUNT}])
        with self.assertRaisesRegex(diag.DiagnosticError, "IDENTITY_CLI_SELECTOR_MISSING"):
            diag.identity_environment(environ=self.env)

    def test_command_is_read_only_fixed_scope_and_never_shell(self):
        with patch.object(diag.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, json.dumps(service()), "")) as run:
            diag.describe("services", "factory-gateway", self.env)
        args, options = run.call_args
        self.assertEqual(args[0], ["gcloud", "run", "services", "describe", "factory-gateway", "--project", diag.PROJECT,
                                  "--region", diag.REGION, "--quiet", "--format=json"])
        self.assertNotIn("shell", options)
        self.assertTrue(options["capture_output"])
        self.assertEqual(options["stdin"], subprocess.DEVNULL)
        for kind, name in (("services", "other-project"), ("services", "factory-gateway; echo leak"),
                           ("secrets", "factory-gateway"), ("revisions", "--help")):
            with self.subTest(kind=kind, name=name), patch.object(diag.subprocess, "run") as run:
                with self.assertRaises(diag.DiagnosticError):
                    diag.describe(kind, name, self.env)
                run.assert_not_called()

    def test_failed_reads_and_timeout_do_not_print_raw_error_or_output(self):
        for stderr, expected in (("PERMISSION_DENIED " + LEAK, "ACCESS_DENIED"),
                                 ("UNAUTHENTICATED " + LEAK, "AUTHENTICATION_FAILED"),
                                 ("NOT_FOUND " + LEAK, "RESOURCE_UNAVAILABLE"),
                                 (LEAK, "READ_FAILED")):
            with self.subTest(expected=expected), patch.object(diag.subprocess, "run", return_value=subprocess.CompletedProcess([], 1, LEAK, stderr)):
                with self.assertRaisesRegex(diag.DiagnosticError, expected) as caught:
                    diag.describe("services", "factory-gateway", self.env)
                self.assertNotIn(LEAK, str(caught.exception))
        with patch.object(diag.subprocess, "run", side_effect=subprocess.TimeoutExpired([LEAK], 35, output=LEAK)):
            with self.assertRaisesRegex(diag.DiagnosticError, "READ_TIMEOUT") as caught:
                diag.describe("services", "factory-gateway", self.env)
            self.assertNotIn(LEAK, str(caught.exception))

    def test_response_must_belong_to_requested_resource(self):
        with patch.object(diag.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, json.dumps(service("factory-preview")), "")):
            with self.assertRaisesRegex(diag.DiagnosticError, "INVALID_METADATA"):
                diag.describe("services", "factory-gateway", self.env)

    def test_report_keeps_only_safe_boolean_and_digest_metadata(self):
        data = service()
        data["spec"]["template"]["spec"]["containers"][0]["env"].append({"name": "FACTORY_BOOTSTRAP", "value": LEAK})
        result = diag.service_summary("factory-gateway", data, self.env, lambda kind, name, env: revision(name))
        text = json.dumps(result) + diag.human_report({"mode": "diagnose", "services": [result]})
        self.assertNotIn(LEAK, text)
        self.assertNotIn("ARBITRARY_SECRET", text)
        self.assertIsNone(result["template"]["flags"]["FACTORY_BOOTSTRAP"])
        self.assertFalse(result["template"]["flags"]["FACTORY_ACTIONS_APPROVED"])
        self.assertEqual(result["template"]["mounted_secret_references"], 1)
        self.assertEqual(result["revisions"][0]["resolved_image_digest"], DIGEST)
        self.assertTrue(result["metadata_checks_passed"])

    def test_staged_revision_and_real_serving_split_are_reported_separately(self):
        data = service()
        staged = "factory-gateway-00003-abc"
        old = "factory-gateway-00001-abc"
        data["status"]["latestCreatedRevisionName"] = staged
        data["status"]["latestReadyRevisionName"] = staged
        data["status"]["traffic"] = [{"revisionName": old, "percent": 95},
                                      {"revisionName": staged, "percent": 5},
                                      {"revisionName": "factory-gateway-00000-abc", "percent": 0}]
        calls = []
        def read(kind, name, env):
            calls.append((kind, name))
            data = revision(name)
            data["spec"]["containers"][0]["env"][0]["value"] = "true" if name == staged else "false"
            return data
        result = diag.service_summary("factory-gateway", data, self.env, read)
        self.assertTrue(result["metadata_checks_passed"])
        self.assertEqual(len(calls), 2)
        self.assertEqual(result["traffic"][0]["percent"], 95)
        self.assertFalse(result["revisions"][0]["flags"]["FACTORY_ACTIONS_APPROVED"])
        self.assertTrue(result["revisions"][1]["flags"]["FACTORY_ACTIONS_APPROVED"])

    def test_generation_drift_unready_serving_and_unknown_state_are_not_passes(self):
        for mutate in (lambda d: d["status"].update(observedGeneration=1),
                       lambda d: d["status"].update(conditions=[]),
                       lambda d: d["status"].update(traffic=[]),
                       lambda d: d["metadata"].pop("generation")):
            data = service()
            mutate(data)
            self.assertFalse(diag.service_summary("factory-gateway", data, self.env, lambda k, n, e: revision(n))["metadata_checks_passed"])
        bad = revision("factory-gateway-00002-abc")
        bad["status"]["conditions"][0]["status"] = "False"
        self.assertFalse(diag.service_summary("factory-gateway", service(), self.env, lambda k, n, e: bad)["metadata_checks_passed"])

    def test_unready_or_unknown_staged_revision_fails_while_serving_health_stays_visible(self):
        for staged_status in ("False", "Unknown"):
            with self.subTest(staged_status=staged_status):
                data = service()
                staged = "factory-gateway-00003-abc"
                data["status"]["latestCreatedRevisionName"] = staged
                def read(kind, name, env):
                    value = revision(name)
                    if name == staged:
                        value["status"]["conditions"][0]["status"] = staged_status
                    return value
                result = diag.service_summary("factory-gateway", data, self.env, read)
                self.assertTrue(result["serving_revisions_ready"])
                self.assertFalse(result["metadata_checks_passed"])
                self.assertEqual(result["latest_created_revision_health"], "not_ready" if staged_status == "False" else "unknown")

    def test_cross_service_revision_is_rejected_before_any_read(self):
        data = service()
        data["status"]["traffic"][0]["revisionName"] = "factory-preview-00002-abc"
        with patch.object(diag, "describe") as read:
            with self.assertRaisesRegex(diag.DiagnosticError, "INVALID_REVISION_REFERENCE"):
                diag.service_summary("factory-gateway", data, self.env, read)
            read.assert_not_called()

    def test_self_check_proves_real_metadata_read_not_only_manifest_presence(self):
        calls = []
        def read(kind, name, env):
            calls.append((kind, name))
            return service(name)
        with patch.object(diag.shutil, "which", return_value="/managed/bin/gcloud"):
            result = diag.report(self.env, self_check=True, read=read)
        self.assertEqual(result["exit_code"], 0)
        self.assertEqual(calls, [("services", "factory-gateway")])
        with patch.object(diag.shutil, "which", return_value="/managed/bin/gcloud"):
            result = diag.report(self.env, self_check=True, read=lambda *a: (_ for _ in ()).throw(diag.DiagnosticError("ACCESS_DENIED: Verify read grants.")))
        self.assertEqual(result["exit_code"], 2)

    def test_full_report_and_main_return_nonzero_without_leaks(self):
        def read(kind, name, env):
            if kind == "services":
                data = service(name)
                if name == "factory-preview":
                    data["status"]["conditions"] = []
                return data
            return revision(name)
        with patch.object(diag.shutil, "which", return_value="/managed/bin/gcloud"):
            result = diag.report(self.env, read=read)
        self.assertEqual(result["exit_code"], 1)
        self.assertEqual(len(result["services"]), 3)
        output = io.StringIO()
        with patch.object(diag, "report", return_value=result), contextlib.redirect_stdout(output):
            self.assertEqual(diag.main(["--json"]), 1)
        self.assertNotIn(LEAK, output.getvalue())
        self.assertEqual(json.loads(output.getvalue())["mutations"], 0)
        with patch.object(diag, "report", side_effect=ValueError(LEAK)), contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(diag.main([]), 2)
        self.assertNotIn(LEAK, output.getvalue())


if __name__ == "__main__":
    unittest.main()
