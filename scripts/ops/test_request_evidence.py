from contextlib import redirect_stderr, redirect_stdout
from datetime import datetime, timezone
import io
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import Mock, patch

import request_evidence as evidence


SECRET = "do-not-report-this-child-content"
SERVICE = "factory-gateway"
REVISION = SERVICE + "-r-eaf5effa06d031818f52"
BASELINE = SERVICE + "-00002-def"
NOW = datetime(2026, 11, 24, 4, 0, tzinfo=timezone.utc)
SCOPE = {"service": SERVICE, "revision": REVISION, "start_utc": "2026-11-24T02:19:00Z", "end_utc": "2026-11-24T03:19:00Z"}
ENV = {"INPUT_" + k.upper(): v for k, v in SCOPE.items()}
COVERAGE = {"start_utc": "2026-11-24T02:18:00Z", "end_utc": "2026-11-24T03:20:00Z"}


def entry(status=200, **overrides):
    return {"timestamp_utc": "2026-11-24T02:19:00.123456789Z", "service": SERVICE, "revision": REVISION,
            "method": "POST", "route": "/v1/coach", "status": status, **overrides}


def complete(rows, scope=SCOPE):
    return {"scope": dict(scope), "coverage": dict(COVERAGE), "query_status": "COMPLETE", "reason": "OK",
            "rows": rows, "completeness": {k: k != "truncated" for k in evidence.FLAGS}}


class EvidenceTests(unittest.TestCase):
    def setUp(self):
        temporary = TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.folder = Path(temporary.name)
        self.report = self.folder / "diagnostics-output/report.json"
        self.summary = self.folder / "summary"
        self.summary.touch()
        self.env = {**ENV, "GITHUB_STEP_SUMMARY": str(self.summary), "GITHUB_RUN_ID": "221",
                    "GITHUB_RUN_ATTEMPT": "2", "GITHUB_SHA": "b" * 40, "DIAGNOSTICS_ID_TOKEN": "masked.id.token"}
        self.stream = io.StringIO()
        out = patch.object(evidence, "OUTPUT", self.report)
        out.start()
        self.addCleanup(out.stop)

    def cli(self, payload=None, *, env=None, fetch=None, command="query", now=NOW):
        transport = fetch or Mock(return_value=payload)
        with redirect_stdout(self.stream), redirect_stderr(self.stream):
            result = evidence.main([command], env=self.env if env is None else env, now=now, fetch=transport)
        data = json.loads(self.report.read_text())
        self.assertEqual(sorted(p.name for p in self.report.parent.iterdir()), ["report.json"])
        self.assertNotIn(SECRET, self.stream.getvalue() + self.summary.read_text() + self.report.read_text())
        self.assertNotIn("masked.id.token", self.stream.getvalue() + self.summary.read_text() + self.report.read_text())
        return result, data

    def test_complete_status_counts_coach_only_on_completion_post(self):
        rows = [entry(code) for code in (101, 200, 302, 400, 404, 500, 503)]
        rows.extend((entry(200, method="GET", route="/v1/coach/status"), entry(200, method="GET", route="/health")))
        result, data = self.cli(complete(rows))
        self.assertEqual(result, 0)
        self.assertEqual(data["query_status"], "COMPLETE")
        self.assertEqual(data["counts"]["total"], 9)
        self.assertEqual([data["counts"]["http_" + str(i) + "xx"] for i in range(1, 6)], [1, 3, 1, 2, 2])
        self.assertEqual([data["counts"]["coach_" + str(i) + "xx"] for i in (2, 4, 5)], [1, 2, 2])
        self.assertEqual(data["requests"][0]["timestamp_utc"], "2026-11-24T02:19:00.123456789Z")
        self.assertEqual(data["workflow"]["attempt"], "2")
        self.assertIn("503 (1)", self.summary.read_text())

    def test_private_coach_post_and_preview_error(self):
        for service, route, count in (("factory-coach-private", "/v1/private-coach/complete", 1),
                                     ("factory-preview", "[other]", 0)):
            scope = {**SCOPE, "service": service, "revision": service + "-abc"}
            row = entry(503, service=service, revision=scope["revision"], route=route)
            result = evidence.verified_result(complete([row], scope), scope, NOW)
            self.assertEqual(result["counts"]["coach_5xx"], count)
            self.assertEqual(result["counts"]["by_route_and_status"][0]["service"], service)

    def test_service_and_revision_attribution_and_equivalent_rows(self):
        rows = [entry(), entry(503, revision=BASELINE), entry(503, revision=BASELINE)]
        code, report = self.cli(complete(rows))
        self.assertNotEqual(code, 0)
        self.assertIsNone(report["counts"])
        service_wide = {**SCOPE, "revision": None}
        code, report = self.cli(complete(rows, service_wide), env={**self.env, "INPUT_REVISION": ""})
        self.assertEqual(code, 0)
        self.assertIsNone(report["scope"]["revision"])
        self.assertEqual({r["revision"]: r["count"] for r in report["counts"]["by_route_and_status"]},
                         {BASELINE: 2, REVISION: 1})

    def test_empty_complete_source_and_unavailable_source_differ(self):
        code, data = self.cli(complete([]))
        self.assertEqual(code, 0)
        self.assertEqual(data["counts"]["total"], 0)
        self.assertIn("Traffic health is unknown", self.summary.read_text())
        payload = {**complete([]), "coverage": None, "query_status": "UNAVAILABLE", "reason": "SOURCE_UNAVAILABLE",
                   "completeness": dict.fromkeys(evidence.FLAGS, False)}
        code, data = self.cli(payload)
        self.assertNotEqual(code, 0)
        self.assertIsNone(data["counts"])
        self.assertEqual(data["reason"], "SOURCE_UNAVAILABLE")

    def test_unsealed_coverage_preserves_only_verified_individual_rows(self):
        flags = {**complete([])["completeness"], "coverage_verified": False}
        payload = {**complete([entry(), entry(503)]), "completeness": flags, "coverage": None,
                   "query_status": "INCOMPLETE", "reason": "COVERAGE_UNVERIFIED"}
        code, data = self.cli(payload)
        self.assertNotEqual(code, 0)
        self.assertEqual(data["reason"], "COVERAGE_UNVERIFIED")
        self.assertEqual([r["status"] for r in data["requests"]], [200, 503])
        self.assertIsNone(data["counts"])
        rendered = self.summary.read_text()
        self.assertIn("totals are unknown", rendered)
        self.assertIn("503 (at least 1)", rendered)
        for malformed in [
            {**payload, "completeness": {**flags, "pagination_exhausted": False}},
            {**payload, "completeness": {**flags, "permissions_verified": False}},
            {**payload, "completeness": {**flags, "ingestion_delay_assessed": False}},
            {**payload, "completeness": {**flags, "truncated": True}},
            {**payload, "rows": [entry(), entry(revision=BASELINE)]},
            {**payload, "rows": [entry(), entry(route="/v1/coach?" + SECRET)]},
            {**payload, "reason": "TIMEOUT"},
            {**payload, "query_status": "UNAVAILABLE"}
        ]:
            code, data = self.cli(malformed)
            self.assertNotEqual(code, 0)
            self.assertEqual(data["reason"], "INVALID_BROKER_RESPONSE")
            self.assertEqual(data["requests"], [])
            self.assertIsNone(data["counts"])
        self.summary.write_text("")
        code, data = self.cli({**payload, "rows": []})
        self.assertNotEqual(code, 0)
        self.assertEqual(data["reason"], "COVERAGE_UNVERIFIED")
        self.assertIsNone(data["counts"])
        self.assertNotIn("No matching", self.summary.read_text())
        self.assertNotIn("lower bounds", self.summary.read_text())

    def test_recent_interval_refuses_complete_even_when_claimed(self):
        code, data = self.cli(complete([]), now=datetime(2026, 11, 24, 3, 29, tzinfo=timezone.utc))
        self.assertNotEqual(code, 0)
        self.assertEqual(data["reason"], "INVALID_BROKER_RESPONSE")
        self.assertIsNone(data["counts"])

    def test_fail_closed_invalid_metadata_paths_bounds_pagination_and_injection(self):
        cases = [complete([entry(**values)]) for values in [
            {"body": SECRET}, {"route": "/v1/coach?" + SECRET}, {"status": True}, {"method": SECRET},
            {"route": "/v1/private-coach/complete"}, {"revision": BASELINE}, {"timestamp_utc": SCOPE["end_utc"]},
            {"timestamp_utc": "2026-11-24T02:18:59.999999999Z"}, {"revision": REVISION + "\n" + SECRET},
            {"service": "factory-preview"}, {"timestamp_utc": "2026-11-24T02:19:00Z\n" + SECRET}
        ]]
        missing = entry()
        del missing["method"]
        cases.extend([complete([missing]), complete([entry()] * 1001), {**complete([]), "reason": SECRET},
                      {**complete([]), "extra": SECRET}, {**complete([]), "scope": dict(SCOPE, revision=None)},
                      {**complete([]), "coverage": dict(COVERAGE, start_utc="2026-11-24T02:20:00Z")},
                      {**complete([]), "completeness": dict(complete([])["completeness"], truncated=True)}])
        for payload in cases:
            result, data = self.cli(payload)
            self.assertNotEqual(result, 0)
            self.assertEqual(data["query_status"], "INCOMPLETE")
            self.assertEqual(data["requests"], [])
            self.assertIsNone(data["counts"])

    def test_invalid_dispatch_input_never_printed_or_queried(self):
        for k, value in [("revision", "factory-preview-abc"), ("revision", SECRET + "?"),
                         ("revision", REVISION + "\n" + SECRET), ("revision", "factory-gateway-abc-"),
                         ("revision", "factory-gateway-" + "a" * 64), ("service", SECRET), ("route", SECRET),
                         ("start_utc", "2026-12-41T02:19:00Z"), ("end_utc", SCOPE["start_utc"]),
                         ("end_utc", "2026-11-24T03:19:01Z"), ("end_utc", "2027-01-01T00:00:00Z")]:
            inputs = {**SCOPE, k: value}
            path = self.folder / "event"
            path.write_text(json.dumps({"inputs": inputs}))
            fetch = Mock()
            code, report = self.cli(fetch=fetch, command="validate", env={
                **self.env, "GITHUB_EVENT_NAME": "workflow_dispatch", "GITHUB_EVENT_PATH": str(path)})
            fetch.assert_not_called()
            self.assertNotEqual(code, 0)
            self.assertEqual(report["query_status"], "NOT_CHECKED")
            self.assertIsNone(report["scope"])

    def test_validate_seeds_not_checked(self):
        fetch = Mock()
        code, data = self.cli(command="validate", fetch=fetch)
        fetch.assert_not_called()
        self.assertEqual(code, 0)
        self.assertEqual(data["reason"], "NOT_STARTED")
        self.assertEqual(self.summary.read_text(), "")
        self.assertEqual(self.stream.getvalue(), "")
        self.assertIsNone(data["counts"])

    def test_transport_no_redirect_or_error_body_even_with_expired_auth(self):
        for status, expected in [(401, "IDENTITY_UNAVAILABLE"), (403, "PERMISSION_DENIED"),
                                 (302, "BROKER_UNAVAILABLE"), (404, "BROKER_UNAVAILABLE"), (500, "BROKER_UNAVAILABLE")]:
            with patch.object(evidence.http.client, "HTTPSConnection") as connect:
                conn = connect.return_value
                response = conn.getresponse.return_value
                response.status = status
                response.read.return_value = SECRET.encode()
                code, report = self.cli(fetch=evidence.broker_query)
                connect.assert_called_once_with(evidence.BROKER_HOST, timeout=100)
                self.assertEqual(conn.request.call_args.args, ("POST", "/"))
                self.assertEqual(json.loads(conn.request.call_args.kwargs["body"]), SCOPE)
                response.read.assert_not_called()
                conn.close.assert_called_once()
                self.assertNotEqual(code, 0)
                self.assertEqual(report["reason"], expected)
        with patch.object(evidence.http.client, "HTTPSConnection") as connect:
            code, report = self.cli(fetch=evidence.broker_query, env={**self.env, "DIAGNOSTICS_ID_TOKEN": ""})
            connect.assert_not_called()
            self.assertNotEqual(code, 0)
            self.assertEqual(report["query_status"], "UNAVAILABLE")

    def test_bounded_transport_duplicate_keys_and_timeout(self):
        for body in [b"{bad " + SECRET.encode(), b"{}", b" " * (evidence.MAX_BYTES + 1),
                     b'{"reason":"OK","reason":"duplicate"}']:
            with patch.object(evidence.http.client, "HTTPSConnection") as connect:
                response = connect.return_value.getresponse.return_value
                response.status = 200
                response.getheader.return_value = "application/json; charset=utf-8"
                response.read.return_value = body
                code, report = self.cli(fetch=evidence.broker_query)
                response.read.assert_called_once_with(evidence.MAX_BYTES + 1)
                self.assertNotEqual(code, 0)
                self.assertEqual(report["reason"], "INVALID_BROKER_RESPONSE")
        code, report = self.cli(fetch=Mock(side_effect=TimeoutError(SECRET)))
        self.assertNotEqual(code, 0)
        self.assertEqual(report["reason"], "TIMEOUT")

    def test_schema_route_method_and_reason_enums_match_consumer(self):
        schema = json.loads((Path(__file__).resolve().parents[2] / "ops/request-evidence.schema.json").read_text())
        defs = schema["$defs"]
        self.assertEqual(set(defs["service"]["enum"]), set(evidence.ROUTES))
        self.assertEqual(set(defs["method"]["enum"]), evidence.METHODS)
        self.assertEqual(set(defs["gatewayRoute"]["enum"]) | {"[other]"}, evidence.ROUTES["factory-gateway"])
        self.assertEqual(set(defs["privateRoute"]["enum"]) | {"[other]"}, evidence.ROUTES["factory-coach-private"])
        self.assertEqual(schema["properties"]["requests"]["maxItems"], evidence.MAX_ROWS)
        self.assertEqual(schema["properties"]["requests"]["items"]["additionalProperties"], False)
        self.assertEqual(set(schema["properties"]["requests"]["items"]["properties"]), evidence.ROW_KEYS)
        for branch in schema["allOf"]:
            if "enum" not in branch["then"]["properties"].get("reason", {}):
                continue
            status = branch["if"]["properties"]["query_status"]["const"]
            self.assertTrue(evidence.BROKER_REASONS[status] <= set(branch["then"]["properties"]["reason"]["enum"]))


if __name__ == "__main__":
    unittest.main()
