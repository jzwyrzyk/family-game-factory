"""Offline proofs for the bounded production chat metadata inspector."""

import contextlib
import io
import json
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import inspect_coach_runtime as inspector


class InspectCoachRuntimeTests(unittest.TestCase):
    def test_uses_positive_serving_traffic_and_projects_request_metadata(self):
        calls = []

        def cloud(*args):
            calls.append(args)
            if args[:3] == ("run", "services", "describe"):
                service = args[3]
                return {"status": {"latestCreatedRevisionName": service + "-unserved",
                    "traffic": [{"revisionName": service + "-serving", "percent": 100},
                                {"revisionName": service + "-unserved", "percent": 0}]}}
            if args[:3] == ("run", "revisions", "describe"):
                self.assertTrue(args[3].endswith("-serving"))
                return {"spec": {"containers": [{"env": []}]}}
            if args[:2] == ("logging", "read"):
                self.assertIn('resource.labels.location="us-east5"', args[2])
                return [{"timestamp": "2026-11-21T20:00:00Z", "resource": {"labels": {
                    "service_name": "factory-gateway", "revision_name": "factory-gateway-serving", "location": "us-east5"}},
                    "httpRequest": {"requestUrl": "https://CANARY_HOST/v1/coach?token=CANARY_QUERY",
                        "requestMethod": "POST", "status": 503, "latency": "4.12s", "remoteIp": "CANARY_IP"},
                    "textPayload": "CANARY_PRIVATE_LOG"},
                    {"timestamp": "2026-11-21T19:59:00Z", "resource": {"labels": {
                    "service_name": "factory-coach-private", "revision_name": "factory-coach-private-serving", "location": "us-east5"}},
                    "httpRequest": {"requestUrl": "https://CANARY_HOST/v1/private-coach/status",
                        "requestMethod": "GET", "status": 200, "latency": "0.05s"}},
                    {"timestamp": "2026-11-21T19:58:00Z", "resource": {"labels": {
                    "service_name": "factory-gateway", "revision_name": "factory-gateway-elsewhere", "location": "us-central1"}},
                    "httpRequest": {"requestUrl": "https://CANARY_HOST/v1/coach",
                        "requestMethod": "POST", "status": 599, "latency": "0.05s"}}]
            self.fail("Unexpected operation")

        with patch.object(inspector, "cloud", side_effect=cloud):
            report = inspector.inspect()
        self.assertNotIn("CANARY", json.dumps(report))
        self.assertEqual([item["trafficTotalPercent"] for item in report["services"]], [100, 100])
        self.assertEqual(report["requests"]["lastChatPosts"][0]["status"], 503)
        self.assertEqual(report["requests"]["latestStatusGets"][0]["status"], 200)
        self.assertEqual(len(report["requests"]["lastChatPosts"]), 1, "other regions must not mix into this incident")
        self.assertEqual(len(calls), 5)

    def test_never_outputs_secret_literals_references_or_unlisted_settings(self):
        entries = [
            {"name": "FACTORY_COACH_PRIVATE_OPENAI_API_KEY", "valueFrom": {
                "secretKeyRef": {"name": "CANARY_SECRET_NAME", "key": "2"}}},
            {"name": "UNRELATED_PRIVATE_ENV", "value": "CANARY_PRIVATE_VALUE"},
            {"name": "FACTORY_COACH_MODEL", "value": "example-model"},
            {"name": "FACTORY_COACH_OUTPUT_TOKENS", "value": "800"},
        ]
        result = inspector.settings(entries)
        self.assertNotIn("CANARY", json.dumps(result))
        self.assertTrue(result["coachKeyMount"]["numericVersionPinned"])
        self.assertEqual(result["FACTORY_COACH_OUTPUT_TOKENS"], 800)
        literal = inspector.settings([{"name": "FACTORY_COACH_PRIVATE_OPENAI_API_KEY", "value": "CANARY_KEY"}])
        self.assertNotIn("CANARY", json.dumps(literal))
        self.assertTrue(literal["coachKeyMount"]["literalValuePresent"])
        self.assertFalse(literal["coachKeyMount"]["numericVersionPinned"])

    def test_missing_or_referenced_settings_are_not_claimed_false(self):
        result = inspector.settings([])
        self.assertEqual(result["FACTORY_ADULT_PILOT_MODE"], inspector.UNREPORTED)
        self.assertEqual(result["FACTORY_COACH_OUTPUT_TOKENS"], inspector.UNREPORTED)
        referenced = inspector.settings([{"name": "FACTORY_ADULT_PILOT_MODE", "valueFrom": {
            "secretKeyRef": {"name": "CANARY_REFERENCE", "key": "1"}}}])
        self.assertEqual(referenced["FACTORY_ADULT_PILOT_MODE"], "referenced_value_not_read")
        self.assertNotIn("CANARY", json.dumps(referenced))

    def test_gcloud_failure_cannot_leak_stdout_stderr_or_credentials(self):
        stdout, stderr = io.StringIO(), io.StringIO()
        failure = SimpleNamespace(returncode=1, stdout="CANARY_RAW_CONFIG", stderr="CANARY_CREDENTIAL")
        with patch.object(inspector.subprocess, "run", return_value=failure) as run:
            with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
                code = inspector.main()
        self.assertEqual(code, 2)
        self.assertNotIn("CANARY", stdout.getvalue() + stderr.getvalue())
        report = json.loads(stdout.getvalue())
        self.assertTrue(all(item["error"] == "SERVICE_METADATA_READ_FAILED" for item in report["services"]))
        self.assertEqual(report["requests"]["error"], "REQUEST_METADATA_READ_FAILED")
        for call in run.call_args_list:
            self.assertTrue(call.kwargs["capture_output"])
            self.assertIn("--project=" + inspector.PROJECT, call.args[0])
            self.assertIn(call.args[0][1:3], [["run", "services"], ["logging", "read"]])


if __name__ == "__main__":
    unittest.main()
