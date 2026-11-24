"""Offline checks at the private function's source/egress boundary."""
from contextlib import redirect_stderr, redirect_stdout
from datetime import datetime, timezone
import importlib.util
from io import BytesIO, StringIO
import json
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch
from urllib.parse import parse_qs, urlsplit


SPEC = importlib.util.spec_from_file_location("broker", Path(__file__).resolve().parents[2] / "ops/request-broker/main.py")
broker = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(broker)
NOW = datetime(2026, 11, 24, 3, tzinfo=timezone.utc)
SERVICE = "factory-gateway"
CANDIDATE = SERVICE + "-r-eaf5effa06d031818f52"
BASELINE = SERVICE + "-pr115-19f5e46ae114-fb5fa6"
SCOPE = {"service": SERVICE, "revision": CANDIDATE, "start_utc": "2026-11-24T02:19:00Z",
         "end_utc": "2026-11-24T02:35:00Z"}
ENV = {"JEMS_LOG_BUCKET_LOCATION": "global", "JEMS_COVERAGE_START_UTC": "2026-11-24T00:00:00Z",
       "JEMS_COVERAGE_END_UTC": "2026-11-24T02:40:00Z", "JEMS_VERIFIED_AT_UTC": "2026-11-24T02:56:00Z",
       "JEMS_VERIFIED_UNTIL_UTC": "2026-11-24T12:00:00Z"}
SECRET = "private-synthetic-marker"


def entry(key="id", status=200, url=None, revision=CANDIDATE):
    return {"timestamp": "2026-11-24T02:20:00.123456789Z", "insertId": key, "logName": broker.LOG,
            "resource": {"type": "cloud_run_revision", "labels": {"project_id": broker.PROJECT,
                         "location": broker.REGION, "service_name": SERVICE, "revision_name": revision}},
            "httpRequest": {"status": status, "requestMethod": "POST",
                            "requestUrl": url or "https://example.test/v1/coach?token=" + SECRET}}


class BrokerTests(unittest.TestCase):
    def setUp(self):
        self.reader = Mock()

        def factory(view):
            self.reader.read_view.return_value = {"name": view, "filter": broker.VIEW_FILTER,
                                                 "updateTime": "2026-11-24T02:50:00Z"}
            return self.reader

        self.factory = Mock(side_effect=factory)

    def run_pages(self, pages, scope=SCOPE, env=ENV):
        self.reader.page.side_effect = pages
        return broker.evaluate(scope, env, NOW, self.factory)

    def test_exact_statuses_and_no_cross_revision_attribution(self):
        events = [entry(str(i), i) for i in (200, 400, 404, 500, 503)]
        report = self.run_pages([{"entries": events}])
        self.assertEqual(report["query_status"], "COMPLETE")
        self.assertEqual({r["status"] for r in report["rows"]}, {200, 400, 404, 500, 503})
        self.assertEqual(report["coverage"]["end_utc"], ENV["JEMS_COVERAGE_END_UTC"])
        events.append(entry("other", 503, revision=BASELINE))
        self.assertEqual(self.run_pages([{"entries": events}])["reason"], "INVALID_METADATA")
        report = self.run_pages([{"entries": events}], {**SCOPE, "revision": None})
        self.assertEqual([r["revision"] for r in report["rows"] if r["status"] == 503], [CANDIDATE, BASELINE])

    def test_empty_pages_follow_tokens_dedupe_by_platform_id_and_time(self):
        first = entry("a")
        second = {**first, "insertId": "b"}
        later = {**first, "timestamp": "2026-11-24T02:20:00.123456788Z"}
        pages = [{"nextPageToken": "p1"}, {"entries": [first, second], "nextPageToken": "p2"},
                 {"entries": [first, later]}]
        report = self.run_pages(pages)
        self.assertEqual(len(report["rows"]), 3)
        self.assertEqual(report["rows"][0]["timestamp_utc"], later["timestamp"])
        self.assertEqual([c.args[1] for c in self.reader.page.call_args_list], [None, "p1", "p2"])
        empty = self.run_pages([{}])
        self.assertEqual(empty["rows"], [])
        self.assertTrue(empty["completeness"]["pagination_exhausted"])

    def test_no_partial_rows_on_caps_loops_conflicts_and_deadlines(self):
        scenarios = [
            ([{"entries": [entry()], "nextPageToken": "next"}, {"nextPageToken": "next"}], "PAGINATION_INVALID"),
            ([{"nextPageToken": str(i)} for i in range(broker.MAX_PAGES)], "ROW_LIMIT"),
            ([{"entries": [entry(), entry(status=404)]}], "INVALID_METADATA"),
            ([{"nextPageToken": "p"}, broker.Failure("TIMEOUT")], "TIMEOUT"),
        ]
        with patch.object(broker, "MAX_ROWS", 2):
            scenarios.append(([{"entries": [entry(str(i)) for i in range(3)]}], "ROW_LIMIT"))
            for pages, reason in scenarios:
                with self.subTest(reason=reason):
                    result = self.run_pages(pages)
                    self.assertEqual((result["query_status"], result["reason"], result["rows"]),
                                     ("INCOMPLETE", reason, []))
                    self.assertEqual(result["completeness"]["truncated"], reason == "ROW_LIMIT")

    def test_every_field_of_platform_envelope_is_required(self):
        for container, field in (((), "insertId"), ((), "timestamp"), ((), "logName"),
                                 (("resource",), "type"), (("resource", "labels"), "project_id"),
                                 (("resource", "labels"), "service_name"), (("resource", "labels"), "location"),
                                 (("resource", "labels"), "revision_name"), (("httpRequest",), "status"),
                                 (("httpRequest",), "requestUrl"), (("httpRequest",), "requestMethod")):
            with self.subTest(field=field):
                row = entry()
                part = row
                for name in container:
                    part = part[name]
                del part[field]
                self.assertEqual(self.run_pages([{"entries": [row]}])["reason"], "INVALID_METADATA")

    def test_revalidates_scope_and_half_open_boundary_against_source(self):
        invalid = [("timestamp", SCOPE["end_utc"]), ("timestamp", "2026-11-24T02:18:59.999999999Z"),
                   ("timestamp", "2026-11-24T02:20:00Z\n"), ("timestamp", "2026-11-31T02:19:00Z"),
                   ("logName", "projects/evil/logs/run.googleapis.com%2Frequests")]
        for name, value in invalid:
            row = {**entry(), name: value}
            self.assertEqual(self.run_pages([{"entries": [row]}])["reason"], "INVALID_METADATA")
        for value in [True, 99, 600, "200", None]:
            row = entry()
            row["httpRequest"]["status"] = value
            self.assertEqual(self.run_pages([{"entries": [row]}])["reason"], "INVALID_METADATA")
        for name, value in [("location", "us-east1"), ("project_id", "other"), ("service_name", "factory-preview")]:
            row = entry()
            row["resource"]["labels"][name] = value
            self.assertEqual(self.run_pages([{"entries": [row]}])["reason"], "INVALID_METADATA")

    def test_invalid_or_unreviewed_inputs_never_query(self):
        for extra in [{"revision": CANDIDATE + '" OR true'}, {"revision": BASELINE + "-"},
                      {"revision": "factory-preview-001"}, {"service": []}, {"path": "/v1/coach"},
                      {"end_utc": "2026-11-24T04:35:00Z"}, {"start_utc": "2026-11-24T00:01:00Z"},
                      {"start_utc": SCOPE["end_utc"]}, {"start_utc": "2026-11-31T00:00:00Z"}]:
            with self.subTest(extra=extra):
                result = self.run_pages([], {**SCOPE, **extra})
                self.assertEqual((result["query_status"], result["reason"], result["scope"]),
                                 ("NOT_CHECKED", "INVALID_SCOPE", None))
        for override in [{"JEMS_VERIFIED_UNTIL_UTC": ENV["JEMS_VERIFIED_AT_UTC"]},
                         {"JEMS_VERIFIED_UNTIL_UTC": "2026-12-28T00:00:00Z"},
                         {"JEMS_COVERAGE_START_UTC": ENV["JEMS_COVERAGE_END_UTC"]},
                         {"JEMS_COVERAGE_START_UTC": "2026-11-13T00:00:00Z"},
                         {"JEMS_VERIFIED_AT_UTC": "2026-11-24T03:01:00Z"}, {"JEMS_VERIFIED_AT_UTC": SCOPE["end_utc"]},
                         {"JEMS_VERIFIED_AT_UTC": None}, {"JEMS_LOG_BUCKET_LOCATION": "europe-west1"}]:
            self.assertEqual(self.run_pages([], env={**ENV, **override})["query_status"], "UNAVAILABLE")
        self.assertEqual(self.run_pages([], {**SCOPE, "end_utc": "2026-11-24T02:46:00Z"})["reason"], "INGESTION_DELAY")
        self.factory.assert_not_called()

    def test_predating_reviewed_coverage_and_expiry_preserve_only_observed_rows(self):
        for override in [{"JEMS_VERIFIED_UNTIL_UTC": "2026-11-24T03:00:00Z"},
                         {"JEMS_COVERAGE_START_UTC": "2026-11-24T02:25:00Z"},
                         {"JEMS_COVERAGE_END_UTC": "2026-11-24T02:00:00Z"}]:
            env = {**ENV, **override}
            for events in ([], [entry()]):
                result = self.run_pages([{"nextPageToken": "p"}, {"entries": events}], env=env)
                self.assertEqual((result["query_status"], result["reason"]), ("INCOMPLETE", "COVERAGE_UNVERIFIED"))
                self.assertEqual(len(result["rows"]), len(events))
                self.assertIsNone(result["coverage"])
                self.assertEqual(result["completeness"], {"coverage_verified": False, "ingestion_delay_assessed": True,
                                 "permissions_verified": True, "pagination_exhausted": True, "truncated": False})
            for fault, reason in [(broker.Failure("TIMEOUT"), "TIMEOUT"),
                                  ({"entries": [entry(revision=BASELINE)]}, "INVALID_METADATA"),
                                  ({"nextPageToken": "p"}, "PAGINATION_INVALID")]:
                result = self.run_pages([{"entries": [entry()], "nextPageToken": "p"}, fault], env=env)
                self.assertEqual((result["reason"], result["rows"]), (reason, []))

    def test_view_readback_version_filter_and_permission_failures(self):
        metadata = {"name": "projects/" + broker.PROJECT + "/locations/global/buckets/_Default/views/jems-production-requests",
                    "filter": broker.VIEW_FILTER, "updateTime": "2026-11-24T02:54:00Z"}
        for alternate in [{"name": "other"}, {"updateTime": "2026-11-24T02:56:00.000000001Z"},
                          {"filter": "severity>=ERROR"}, {"filter": broker.VIEW_FILTER + ' OR severity>=ERROR'}]:
            self.reader.read_view.side_effect = [metadata, {**metadata, **alternate}]
            result = self.run_pages([{}])
            self.assertEqual(result["reason"], "CONFIG_UNVERIFIED")
            self.assertFalse(result["completeness"]["pagination_exhausted"])
        self.reader.read_view.side_effect = None
        for reason in ["PERMISSION_DENIED", "SOURCE_UNAVAILABLE"]:
            result = self.run_pages([broker.Failure(reason)])
            self.assertEqual((result["reason"], result["query_status"]), (reason, "UNAVAILABLE"))
            self.assertFalse(result["completeness"]["permissions_verified"])

    def test_canonical_route_projection_and_payload_exclusion(self):
        addresses = ["/v1/coach?access_token=" + SECRET, "/v1/coach/status", "/preview/" + SECRET,
                     "https://" + SECRET + "@host/v1/coach", "/v1/%63oach", "//elsewhere/v1/coach",
                     "https://bad[hostname", "/v1/coach\r\n" + SECRET, "javascript:" + SECRET,
                     "/v1/coach\\?evil", "/v1/coach/" + SECRET]
        rows = []
        for i, address in enumerate(addresses):
            row = entry(str(i), url=address)
            row.update(textPayload=SECRET, jsonPayload={"message": SECRET}, labels={"token": SECRET}, trace=SECRET)
            row["httpRequest"].update(remoteIp=SECRET, headers={"Cookie": SECRET}, referer=SECRET)
            rows.append(row)
        result = self.run_pages([{"entries": rows}])
        self.assertEqual(result["query_status"], "COMPLETE")
        self.assertEqual(sum(row["route"] == "[other]" for row in result["rows"]), len(addresses) - 2)
        self.assertNotIn(SECRET, json.dumps(result))
        for row in result["rows"]:
            self.assertEqual(set(row), {"timestamp_utc", "service", "revision", "method", "route", "status"})
        self.assertEqual(broker.safe_route("factory-preview", "/preview/" + SECRET + "?cap=" + SECRET), "/preview/{id}")
        self.assertEqual(broker.safe_route("factory-preview", "/preview/path/" + SECRET), "[other]")

    def test_refs_and_projection_sent_only_to_fixed_logging_api(self):
        view = "projects/p/locations/global/buckets/_Default/views/test"
        reader = broker.Logging(view)
        with patch.object(reader, "_request") as request:
            reader.page(SCOPE, "opaque")
            path = urlsplit(request.call_args.args[0])
            self.assertEqual(path.path, "/v2/entries:list")
            self.assertEqual(parse_qs(path.query), {"fields": [broker.FIELDS]})
            body = request.call_args.kwargs["body"]
            self.assertEqual(body["resourceNames"], [view])
            self.assertEqual(body["pageToken"], "opaque")
            for identifier in [CANDIDATE, SERVICE, broker.LOG, broker.PROJECT, broker.REGION, SCOPE["start_utc"], SCOPE["end_utc"]]:
                self.assertIn(identifier, body["filter"])
            self.assertNotIn("severity", body["filter"])
            reader.read_view()
            self.assertEqual(request.call_args.args[0], "/v2/" + view + "?fields=name,filter,createTime,updateTime")

    def test_metadata_identity_and_credentials_are_checked(self):
        reader = broker.Logging("fixed")
        with patch.object(reader, "_request", side_effect=["release@" + broker.PROJECT]) as request:
            with self.assertRaisesRegex(broker.Failure, "CONFIG_UNVERIFIED"):
                reader.connect()
            self.assertEqual(request.call_count, 1)
        with patch.object(reader, "_request", side_effect=[broker.ACCOUNT, {"token_type": "Bearer", "expires_in": 0,
                                                                          "access_token": SECRET}]):
            with self.assertRaisesRegex(broker.Failure, "PERMISSION_DENIED"):
                reader.connect()
        reader.bearer = SECRET
        for status, reason in [(401, "PERMISSION_DENIED"), (403, "PERMISSION_DENIED"), (404, "SOURCE_UNAVAILABLE"),
                               (302, "SOURCE_UNAVAILABLE"), (503, "SOURCE_UNAVAILABLE")]:
            with patch.object(broker, "HTTPSConnection") as connect:
                response = connect.return_value.getresponse.return_value
                response.status = status
                with self.assertRaisesRegex(broker.Failure, reason):
                    reader.read_view()
                response.read.assert_not_called()
                self.assertEqual(connect.call_args.args[0], "logging.googleapis.com")

    def test_http_boundary_suppresses_untrusted_exceptions_and_input(self):
        buffer = StringIO()
        self.reader.page.side_effect = RuntimeError(SECRET)
        with redirect_stdout(buffer), redirect_stderr(buffer):
            result = broker.evaluate(SCOPE, ENV, NOW, self.factory)
        self.assertEqual(result["query_status"], "UNAVAILABLE")
        self.assertNotIn(SECRET, buffer.getvalue() + json.dumps(result))
        for extra in [{"method": "GET"}, {"path": "/v1/coach"}, {"query_string": b"secret"}, {"content_length": 8192}]:
            request = SimpleNamespace(**{"method": "POST", "path": "/", "query_string": b"",
                                        "mimetype": "application/json", "content_length": 3,
                                        "stream": BytesIO(SECRET.encode()), **extra})
            data, status, headers = broker.request_evidence(request)
            self.assertEqual((json.loads(data)["query_status"], status, headers["Cache-Control"]),
                             ("NOT_CHECKED", 200, "no-store"))
            self.assertNotIn(SECRET, data)


if __name__ == "__main__":
    unittest.main()
