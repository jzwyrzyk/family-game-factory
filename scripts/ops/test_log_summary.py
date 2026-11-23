import copy
from contextlib import redirect_stderr, redirect_stdout
from datetime import datetime, timezone
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from diagnose import DiagnosticError
import log_summary as logs


LEAK = "private-token-or-child-content-must-not-appear"


class ScopedLogClientTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.manifest = Path(self.tmp.name) / "manifest.json"
        self.manifest.write_text(json.dumps({"version": 1, "connections": [{
            "provider_kind": "gcp", "alias": "jems-read", "config_dir": "/managed/gcp",
            "configuration_name": "jems", "credentials_file": "/managed/credential.json",
            "setup": {"status": "ready"},
        }]}))
        self.env = {"OIC_MANIFEST_PATH": str(self.manifest), "PATH": "/managed/bin",
                    "HTTPS_PROXY": "https://managed-proxy.invalid", "GUARD_BINDING": LEAK,
                    "CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE": "/managed/credential.json",
                    "CLOUDSDK_CORE_CUSTOM_CA_CERTS_FILE": "/managed/ca.pem"}
        self.now = datetime(2026, 11, 21, 18, 30, tzinfo=timezone.utc)

    def entry(self):
        return {"resource": {"type": "cloud_run_revision", "labels": {
            "project_id": logs.PROJECT, "location": logs.REGION, "service_name": "factory-gateway"}},
            "logName": f"projects/{logs.PROJECT}/logs/run.googleapis.com%2Frequests", "severity": "ERROR"}

    def read(self, data, **kwargs):
        with patch("log_summary.shutil.which", return_value="gcloud"), \
                patch("log_summary.subprocess.run", return_value=subprocess.CompletedProcess(
                    [], 0, stdout=json.dumps(data), stderr="")):
            return logs.read_summary(environ=self.env, now=self.now, **kwargs)

    def test_normal_cli_preserves_managed_guards_and_reads_only_fixed_projected_view(self):
        entry = {**self.entry(), "textPayload": LEAK, "httpRequest": {"requestUrl": LEAK}}
        original = copy.deepcopy(self.env)
        with patch("log_summary.shutil.which", return_value="gcloud"), \
                patch("log_summary.subprocess.run", return_value=subprocess.CompletedProcess(
                    [], 0, stdout=json.dumps([entry]), stderr=LEAK)) as run:
            result = logs.read_summary(2, alias="jems-read", environ=self.env, now=self.now)
        self.assertEqual(self.env, original)
        self.assertEqual(run.call_count, 1)
        command = run.call_args.args[0]
        self.assertEqual(command[:3], ["gcloud", "logging", "read"])
        self.assertIn(f"--resource-names={logs.VIEW}", command)
        self.assertIn(f"--project={logs.PROJECT}", command)
        self.assertIn('timestamp >= "2026-11-21T16:30:00+00:00"', command[3])
        self.assertIn('resource.type = "cloud_run_revision"', command[3])
        self.assertIn('severity >= ERROR', command[3])
        self.assertIn('resource.labels.service_name = "factory-gateway"', command[3])
        self.assertIn('logName = "projects/family-game-factory-jzw/logs/run.googleapis.com%2Frequests"', command[3])
        projection = next(item for item in command if item.startswith("--format="))
        self.assertTrue(projection.startswith("--format=json[private]("))
        self.assertNotIn("Payload", projection)
        self.assertNotIn("httpRequest", projection)
        selected = run.call_args.kwargs["env"]
        for key in ("HTTPS_PROXY", "GUARD_BINDING", "CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE", "CLOUDSDK_CORE_CUSTOM_CA_CERTS_FILE"):
            self.assertEqual(selected[key], original[key])
        self.assertEqual(selected["CLOUDSDK_CONFIG"], "/managed/gcp")
        self.assertEqual(selected["CLOUDSDK_ACTIVE_CONFIG_NAME"], "jems")
        self.assertEqual(selected["GOOGLE_APPLICATION_CREDENTIALS"], "/managed/credential.json")
        self.assertEqual(result["counts"], [{"service": "factory-gateway", "category": "request", "severity": "ERROR", "count": 1}])
        self.assertEqual(result["identity_account_verification"], "not_verified")
        self.assertEqual(result["identity_privilege_ceiling"], "not_verified")
        self.assertNotIn(LEAK, json.dumps(result))

    def test_missing_or_ambiguous_identity_does_not_fall_back_or_reset_guards(self):
        for env, alias, error in (({}, None, "IDENTITY_NOT_CONFIGURED"),
                                  (self.env, "other", "IDENTITY_SELECTION_REQUIRED"),
                                  ({**self.env, "CLOUDSDK_CORE_ACCOUNT": LEAK}, None, "IDENTITY_OVERRIDE_UNVERIFIED")):
            with self.subTest(error=error), patch("log_summary.shutil.which", return_value="gcloud"), \
                    patch("log_summary.subprocess.run") as run:
                with self.assertRaisesRegex(DiagnosticError, error):
                    logs.read_summary(environ=env, alias=alias)
                run.assert_not_called()

    def test_cli_missing_and_invalid_windows_stop_before_subprocess(self):
        with patch("log_summary.shutil.which", return_value=None), patch("log_summary.subprocess.run") as run:
            with self.assertRaisesRegex(DiagnosticError, "GCLOUD_NOT_INSTALLED"):
                logs.read_summary(environ=self.env)
            run.assert_not_called()
        for hours in (0, 25, True, "2"):
            with self.subTest(hours=hours), patch("log_summary.subprocess.run") as run:
                with self.assertRaisesRegex(DiagnosticError, "INVALID_TIME_WINDOW"):
                    logs.read_summary(hours, environ=self.env)
                run.assert_not_called()

    def test_full_sample_and_sentinel_are_distinguished_and_counts_stay_bounded(self):
        for count in (0, 500, 501):
            with self.subTest(count=count):
                result = self.read([self.entry()] * count)
                self.assertEqual(result["truncated"], count == 501)
                self.assertEqual(sum(row["count"] for row in result["counts"]), min(count, 500))
        with self.assertRaisesRegex(DiagnosticError, "entry bound"):
            self.read([self.entry()] * 502)

    def test_other_projects_regions_services_and_log_types_do_not_become_counts(self):
        rows = [self.entry()]
        for key, value in (("project_id", "another-project"), ("location", "us-west1"), ("service_name", LEAK)):
            row = self.entry()
            row["resource"]["labels"][key] = value
            rows.append(row)
        rows.append({**self.entry(), "logName": "projects/another-project/logs/run.googleapis.com%2Frequests"})
        rows.append({**self.entry(), "logName": f"projects/{logs.PROJECT}/logs/run.googleapis.com%2Fstdout"})
        result = self.read(rows)
        self.assertEqual(sum(row["count"] for row in result["counts"]), 1)
        self.assertNotIn(LEAK, json.dumps(result))

    def test_invalid_projected_metadata_has_no_raw_payload_in_its_error(self):
        for value in ({"entries": LEAK}, [LEAK], [{"resource": LEAK}],
                      [{**self.entry(), "severity": {"private": LEAK}}]):
            with self.subTest(value=value):
                with self.assertRaises(DiagnosticError) as failure:
                    self.read(value)
                self.assertNotIn(LEAK, str(failure.exception))

    def test_oversized_or_invalid_json_output_is_sanitized(self):
        for output, error in ((LEAK, "INVALID_LOG_METADATA"),
                              (LEAK + " " * logs.MAX_RESPONSE_BYTES, "LOG_RESPONSE_TOO_LARGE")):
            with self.subTest(error=error), patch("log_summary.shutil.which", return_value="gcloud"), \
                    patch("log_summary.subprocess.run", return_value=subprocess.CompletedProcess(
                        [], 0, stdout=output, stderr="")):
                with self.assertRaisesRegex(DiagnosticError, error) as failure:
                    logs.read_summary(environ=self.env)
                self.assertNotIn(LEAK, str(failure.exception))

    def test_cli_errors_and_timeouts_are_public_categories_without_raw_output(self):
        for raw, category in (("UNAUTHENTICATED", "AUTHENTICATION_FAILED"),
                              ("PERMISSION_DENIED", "ACCESS_DENIED"), ("NOT_FOUND", "LOG_VIEW_UNAVAILABLE"),
                              ("transport failed", "READ_FAILED")):
            with self.subTest(category=category), patch("log_summary.shutil.which", return_value="gcloud"), \
                    patch("log_summary.subprocess.run", return_value=subprocess.CompletedProcess(
                        [], 1, stdout=LEAK, stderr=raw + " " + LEAK)):
                with self.assertRaisesRegex(DiagnosticError, category) as failure:
                    logs.read_summary(environ=self.env)
                self.assertNotIn(LEAK, str(failure.exception))
        with patch("log_summary.shutil.which", return_value="gcloud"), \
                patch("log_summary.subprocess.run", side_effect=subprocess.TimeoutExpired(
                    [LEAK], 40, output=LEAK, stderr=LEAK)):
            with self.assertRaisesRegex(DiagnosticError, "READ_TIMEOUT") as failure:
                logs.read_summary(environ=self.env)
            self.assertNotIn(LEAK, str(failure.exception))

    def test_main_keeps_alias_selection_and_suppresses_unexpected_raw_values(self):
        output = io.StringIO()
        errors = io.StringIO()
        with patch("log_summary.read_summary", side_effect=ValueError(LEAK)) as read, \
                redirect_stdout(output), redirect_stderr(errors):
            code = logs.main(["--identity-alias", "jems-read", "--hours", "3"])
        read.assert_called_once_with(3, alias="jems-read")
        self.assertEqual(code, 2)
        self.assertNotIn(LEAK, output.getvalue() + errors.getvalue())
        self.assertEqual(json.loads(output.getvalue())["mutations"], 0)


if __name__ == "__main__":
    unittest.main()
