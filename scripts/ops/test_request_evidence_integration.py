"""Run the production client and HTTP function together with an offline log source."""
from contextlib import redirect_stderr, redirect_stdout
from datetime import datetime, timezone
import importlib.util
from io import BytesIO, StringIO
import json
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import request_evidence as client

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("request_evidence_broker", ROOT / "ops/request-broker/main.py")
broker = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(broker)
SERVICE = "factory-gateway"
REVISION = "factory-gateway-offline-fixture"
SCOPE = {"service": SERVICE, "revision": REVISION,
         "start_utc": "2000-01-01T00:00:00Z", "end_utc": "2000-01-01T00:30:00Z"}
OBSERVED = datetime(2000, 1, 1, 1, tzinfo=timezone.utc)
RECEIPT = {"JEMS_LOG_BUCKET_LOCATION": "global",
           "JEMS_COVERAGE_START_UTC": SCOPE["start_utc"], "JEMS_COVERAGE_END_UTC": SCOPE["end_utc"],
           "JEMS_VERIFIED_AT_UTC": "2000-01-01T00:55:00Z", "JEMS_VERIFIED_UNTIL_UTC": "2000-01-02T00:00:00Z"}
MARKER = "SYNTHETIC-PRIVATE-CANARY"


def entry(second, method, path, status):
    return {"timestamp": f"2000-01-01T00:01:{second:02}.123456789Z", "logName": broker.LOG,
            "insertId": f"{MARKER}-{second}", "jsonPayload": {"message": MARKER},
            "resource": {"type": "cloud_run_revision", "labels": {"service_name": SERVICE,
                         "revision_name": REVISION, "location": "us-east5", "project_id": "family-game-factory-jzw"}},
            "httpRequest": {"requestMethod": method, "status": status, "remoteIp": "192.0.2.42",
                            "requestUrl": f"https://fixture.invalid{path}?token={MARKER}"}}


def invoke_function(scope, _token):
    """Pass through the deployed handler's HTTP contract without opening a socket."""
    body = json.dumps(scope).encode()
    request = SimpleNamespace(method="POST", path="/", query_string=b"", mimetype="application/json",
                              content_length=len(body), stream=BytesIO(body))
    response, status, headers = broker.request_evidence(request)
    if status != 200 or headers["Content-Type"] != "application/json":
        raise AssertionError("Fixture broker returned an unexpected HTTP envelope.")
    return json.loads(response)


class EvidenceIntegration(unittest.TestCase):
    def run_fixture(self, last_entry):
        success = entry(1, "POST", "/v1/coach", 200)
        readiness = entry(2, "GET", "/v1/coach/status", 200)
        # Duplicate across an empty intermediate page with a continuation.
        pages = {None: {"entries": [success, readiness], "nextPageToken": "p2"},
                 "p2": {"nextPageToken": "p3"}, "p3": {"entries": [success, last_entry]}}

        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "artifact" / "report.json"
            summary = Path(directory) / "summary.md"
            env = {"INPUT_" + key.upper(): value for key, value in SCOPE.items()}
            env["GITHUB_STEP_SUMMARY"] = str(summary)
            out, err = StringIO(), StringIO()
            with (patch.object(client, "OUTPUT", output), patch.dict(os.environ, RECEIPT, clear=True),
                  patch.object(broker, "datetime", wraps=datetime) as clock,
                  patch.object(broker.Logging, "connect", return_value=None),
                  patch.object(broker.Logging, "read_view", autospec=True, side_effect=lambda reader: {
                      "name": reader.view, "filter": broker.VIEW_FILTER, "updateTime": SCOPE["start_utc"]}),
                  patch.object(broker.Logging, "page", autospec=True,
                               side_effect=lambda reader, scope, token: pages[token]),
                  patch("socket.socket.connect", side_effect=AssertionError("Unexpected network access.")),
                  redirect_stdout(out), redirect_stderr(err)):
                clock.now.return_value = OBSERVED
                code = client.main(["query"], env=env, now=OBSERVED, fetch=invoke_function)
            self.assertEqual([p.name for p in output.parent.iterdir()], ["report.json"])
            published = output.read_text()
            rendered = summary.read_text()
            for private in [MARKER, "192.0.2.42", "fixture.invalid", "insertId", "requestUrl", "jsonPayload"]:
                self.assertNotIn(private, published + rendered + out.getvalue() + err.getvalue())
            return code, json.loads(published), rendered, published

    def test_report_ready_for_artifact(self):
        code, report, summary, serialized = self.run_fixture(entry(3, "POST", "/" + MARKER, 503))
        self.assertEqual(code, 0)
        self.assertEqual(report["query_status"], "COMPLETE")
        self.assertEqual(report["scope"], SCOPE)
        self.assertIsNone(report["workflow"])  # This is a simulation with a fixed clock.
        self.assertEqual([row["route"] for row in report["requests"]], ["/v1/coach", "/v1/coach/status", "[other]"])
        self.assertEqual([row["status"] for row in report["requests"]], [200, 200, 503])
        for row in report["requests"]:
            self.assertEqual(set(row), {"timestamp_utc", "revision", "service", "route", "method", "status"})
        counts = report["counts"]
        self.assertEqual((counts["total"], counts["http_2xx"], counts["coach_2xx"], counts["http_5xx"]), (3, 2, 1, 1))
        self.assertIn("503", summary)
        self.assertIn("COMPLETE", summary)
        schema = json.loads((ROOT / "ops/request-evidence.schema.json").read_text())
        self.assertEqual(set(report), set(schema["required"]))
        self.assertFalse(schema["additionalProperties"])
        # An explicit CI destination exports only the bytes tested above. The
        # synthetic revision and observation year identify this fixture in the JSON.
        destination = os.environ.get("JEMS_OFFLINE_FIXTURE_DIR")
        if destination:
            path = Path(destination)
            path.mkdir(mode=0o700)
            with (path / "report.json").open("x", encoding="ascii") as stream:
                stream.write(serialized)

    def test_injected_out_of_scope_result_discards_preceding_rows(self):
        wrong = entry(3, "POST", "/v1/coach", 500)
        wrong["resource"]["labels"]["revision_name"] = "factory-gateway-offline-baseline"
        code, report, summary, _ = self.run_fixture(wrong)
        self.assertNotEqual(code, 0)
        self.assertEqual(report["query_status"], "INCOMPLETE")
        self.assertEqual(report["requests"], [])
        self.assertIsNone(report["counts"])
        self.assertIn("INCOMPLETE", summary)


if __name__ == "__main__":
    unittest.main()
