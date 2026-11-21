import contextlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location("audit", Path(__file__).with_name("preactivation_audit.py"))
a = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(a)
NOW = 1795226400000  # 2026-11-21 UTC
FAMILY = "private-family-fixture"
DEVICE = "private-device-fixture"
MARKER = "PRIVATE_FIXTURE_MUST_NOT_PRINT"


def state():
    return {"version": 1, "ledgers": {FAMILY: {"month": "2026-11", "allowance": 5000000,
            "used": 20, "reserved": 30, "paidEnabled": False}},
        "devices": [{"id": DEVICE, "familyId": FAMILY, "name": MARKER, "secretHash": MARKER,
                     "lastSeenAt": NOW - a.DAY, "expiresAt": NOW + a.DAY}],
        "adultPilotPermits": [{"familyId": FAMILY, "deviceId": DEVICE,
            "approvedAt": NOW - a.DAY, "expiresAt": NOW + a.DAY, "receiptHash": "a" * 64}],
        "parentAuth": {FAMILY: {"salt": "b" * 32, "digest": "c" * 64, "lockedUntil": 0}},
        "jobs": [{"familyId": FAMILY, "status": "testing", "prompt": MARKER}],
        "revisions": [{"game": {"storage": "private-artifact-v1", "sha256": MARKER}}]}


def config():
    return {"projectId": a.PROJECT, "appOrigin": "https://jzwyrzyk.github.io",
        "gatewayOrigin": a.ORIGINS["factory-gateway"], "previewOrigin": a.ORIGINS["factory-preview"],
        "repository": "jzwyrzyk/family-game-factory", "repositoryId": "1458033181",
        "approvedSha": "dcb887e6a51ba000fda1ccc42b9d198f8b9895f9",
        "workerRepository": a.REPO, "workerRepositoryId": "1458899834", "workerWorkflow": "factory-private.yml",
        "workerApprovedSha": a.OLD_P, "familyId": FAMILY, "workspace": "private-workspace-fixture",
        "active": False, "sessionKey": MARKER, "githubPrivateKey": MARKER,
        "maxJobMicroUsd": 300000, "approval": {"enabled": False, "approvalId": MARKER,
            "model": "gpt-5.4-mini-2026-03-17", "reasoningEffort": "low", "inputUsdPerMillion": .75,
            "outputUsdPerMillion": 4.5, "maxInputTokens": 64000, "maxOutputTokens": 8000,
            "priceReviewedOn": "2026-11-16"}}


def gateway_mount():
    return {"spec": {"template": {"spec": {
        "containers": [{"env": [{"name": "FACTORY_PRIVATE_CONFIG", "value": "/var/run/factory-config/config.json"}],
                        "volumeMounts": [{"name": "active", "mountPath": "/var/run/factory-config"}]}],
        "volumes": [{"name": "old", "secret": {"secretName": "factory-gateway-private-config",
                     "items": [{"key": "2", "path": "unused.json"}]}},
                    {"name": "active", "secret": {"secretName": "factory-gateway-private-config",
                     "items": [{"key": "4", "path": "config.json"}]}}]}}}}


class AuditFixtures(unittest.TestCase):
    def test_gateway_consumes_exact_active_file_and_ignores_unmounted_history(self):
        value = gateway_mount()
        self.assertIsNone(a.require_consumed_config_mount(value))
        value["spec"]["template"]["spec"]["containers"][0]["env"].append({"name": "FACTORY_BOOTSTRAP", "value": "false"})
        self.assertIsNone(a.require_consumed_config_mount(value))

    def test_wrong_missing_or_secret_bound_config_environment_is_rejected(self):
        for entries in ([], [{"name": "FACTORY_PRIVATE_CONFIG", "value": "/other/config.json"}],
                        [{"name": "FACTORY_PRIVATE_CONFIG", "valueFrom": {"secretKeyRef": {"name": "unknown"}}}]):
            value = gateway_mount()
            value["spec"]["template"]["spec"]["containers"][0]["env"] = entries
            with self.subTest(entries=entries), self.assertRaisesRegex(a.AuditError, "CONFIG_PATH_UNVERIFIED"):
                a.require_consumed_config_mount(value)

    def test_bootstrap_bypass_or_unknown_bootstrap_value_is_rejected(self):
        for bootstrap in ({"name": "FACTORY_BOOTSTRAP", "value": "true"},
                          {"name": "FACTORY_BOOTSTRAP", "valueFrom": {"secretKeyRef": {"name": "unknown"}}}):
            value = gateway_mount()
            value["spec"]["template"]["spec"]["containers"][0]["env"].append(bootstrap)
            with self.subTest(bootstrap=bootstrap), self.assertRaisesRegex(a.AuditError, "BOOTSTRAP_BYPASSES_CONFIG"):
                a.require_consumed_config_mount(value)

    def test_secret_item_must_supply_config_json_in_the_active_mount(self):
        value = gateway_mount()
        value["spec"]["template"]["spec"]["volumes"][1]["secret"]["items"][0]["path"] = "other.json"
        with self.assertRaisesRegex(a.AuditError, "SECRET_PATH_UNVERIFIED"):
            a.require_consumed_config_mount(value)
        value = gateway_mount()
        value["spec"]["template"]["spec"]["volumes"][1]["secret"]["items"].append({"key": "5", "path": "extra.json"})
        with self.assertRaisesRegex(a.AuditError, "SECRET_PATH_UNVERIFIED"):
            a.require_consumed_config_mount(value)

    def test_sanitized_control_state_preserves_actionable_existing_values(self):
        report = a.state_summary(state(), FAMILY, 300000, NOW)
        self.assertEqual(report["ledger"]["allowance"], 5000000)
        self.assertEqual(report["ledger"]["used"], 20)
        self.assertEqual(report["ledger"]["reserved"], 30)
        self.assertFalse(report["ledger"]["paidEnabled"])
        self.assertTrue(report["ledger"]["currentMonth"])
        self.assertTrue(report["ledger"]["roomForOneJob"])
        self.assertEqual(report["eligibleAdultDevices"], 1)
        self.assertEqual(report["activeJobs"], 1)
        self.assertTrue(report["parentAuthConfigured"])
        for secret in (FAMILY, DEVICE, MARKER, "a" * 64, "b" * 32, "c" * 64):
            self.assertNotIn(secret, json.dumps(report))

    def test_absent_ledger_permit_and_auth_are_reported_without_creating_them(self):
        value = {"version": 1, "jobs": [], "ledgers": {}}
        before = json.dumps(value)
        report = a.state_summary(value, FAMILY, 300000, NOW)
        self.assertIsNone(report["ledger"])
        self.assertEqual(report["eligibleAdultDevices"], 0)
        self.assertFalse(report["parentAuthConfigured"])
        self.assertEqual(json.dumps(value), before)
        self.assertFalse(a.state_summary(None, FAMILY, 300000, NOW)["workspaceExists"])

    def test_expired_revoked_foreign_or_idle_devices_do_not_grant_eligibility(self):
        for change in ({"revokedAt": 0}, {"expiresAt": NOW}, {"lastSeenAt": NOW - 90 * a.DAY},
                       {"familyId": "other-family"}):
            value = state()
            value["devices"][0].update(change)
            with self.subTest(change=change):
                self.assertEqual(a.state_summary(value, FAMILY, 300000, NOW)["eligibleAdultDevices"], 0)
        for change in ({"revokedAt": 0}, {"expiresAt": NOW}, {"expiresAt": NOW + 15 * a.DAY},
                       {"approvedAt": NOW + 1}, {"receiptHash": "invalid"}, {"deviceId": "other"}):
            value = state()
            value["adultPilotPermits"][0].update(change)
            with self.subTest(change=change):
                self.assertEqual(a.state_summary(value, FAMILY, 300000, NOW)["eligibleAdultDevices"], 0)

    def test_old_month_and_insufficient_capacity_remain_visible(self):
        value = state()
        value["ledgers"][FAMILY].update(month="2026-10", used=4999999)
        report = a.state_summary(value, FAMILY, 300000, NOW)["ledger"]
        self.assertFalse(report["currentMonth"])
        self.assertFalse(report["roomForOneJob"])

    def test_config_allows_only_known_worker_pins_and_never_emits_secret_fields(self):
        for pin in (a.OLD_P, a.NEW_P):
            value = config()
            value["workerApprovedSha"] = pin
            report = a.config_summary(value, NOW)
            self.assertEqual(report["model"], "gpt-5.4-mini-2026-03-17")
            self.assertEqual(report["workerPinMatchesNew"], pin == a.NEW_P)
            self.assertTrue(report["priceReviewCurrent"])
            for secret in (MARKER, FAMILY, value["workspace"]):
                self.assertNotIn(secret, json.dumps(report))
        value["workerApprovedSha"] = "f" * 40
        with self.assertRaisesRegex(a.AuditError, "UNKNOWN_GATEWAY_WORKER_PIN"):
            a.config_summary(value, NOW)

    def test_expired_price_review_is_status_not_silent_refresh(self):
        value = config()
        value["approval"]["priceReviewedOn"] = "2026-01-01"
        report = a.config_summary(value, NOW)
        self.assertFalse(report["priceReviewCurrent"])
        self.assertEqual(value["approval"]["priceReviewedOn"], "2026-01-01")

    def test_firestore_reads_at_one_read_time_and_orders_chunks_without_hydrating_artifacts(self):
        value = config()
        root = f"projects/{a.PROJECT}/databases/(default)/documents/factoryWorkspaces/{value['workspace']}/state/current"
        payload = json.dumps(state())
        chunks = [payload[:len(payload)//2], payload[len(payload)//2:]]
        replies = [[{"found": {"name": root, "fields": {"version": {"integerValue": "1"},
                   "chunks": {"integerValue": "2"}}}, "readTime": "2026-11-21T02:30:00.123456Z"}],
            [{"found": {"name": f"{root}/chunks/{i}", "fields": {"json": {"stringValue": chunks[i]}}}}
             for i in (1, 0)]]
        requests = []
        def open_read(request, timeout):
            requests.append((request.full_url, json.loads(request.data)))
            return io.BytesIO(json.dumps(replies[len(requests)-1]).encode())
        commands = []
        def command(args):
            commands.append(args)
            return "private-token-fixture"
        self.assertEqual(a.read_control_state(value, command, open_read), state())
        self.assertEqual(commands, [["gcloud", "auth", "print-access-token"]])
        self.assertEqual(len(requests), 2)
        self.assertTrue(all(url.endswith("/documents:batchGet") for url, _ in requests))
        self.assertEqual(requests[1][1]["readTime"], replies[0][0]["readTime"])
        self.assertEqual(requests[1][1]["mask"], {"fieldPaths": ["json"]})

    def test_missing_duplicate_or_wrong_schema_chunks_fail_closed(self):
        names = ["root/chunks/0", "root/chunks/1"]
        valid = [{"found": {"name": names[i], "fields": {"json": {"stringValue": s}}}}
                 for i, s in enumerate(['{"version":', '1}'])]
        self.assertEqual(a.parse_chunks(valid, names), {"version": 1})
        for records in (valid[:1], [valid[0], valid[0]], [{"missing": names[0]}, valid[1]]):
            with self.assertRaises(a.AuditError):
                a.parse_chunks(records, names)
        valid[1]["found"]["fields"]["json"]["stringValue"] = 'true}'
        with self.assertRaisesRegex(a.AuditError, "SCHEMA_REJECTED"):
            a.parse_chunks(valid, names)

    def test_unexpected_command_error_cannot_print_secret_exception_text(self):
        with tempfile.TemporaryDirectory() as temporary:
            module = Path(temporary) / "continuity.py"
            module.write_text("def command_json(args):\n raise RuntimeError('" + MARKER + "')\n")
            output = io.StringIO()
            with contextlib.redirect_stderr(output):
                result = a.main(["--continuity", str(module)])
            self.assertEqual(result, 1)
            self.assertEqual(output.getvalue(), "AUDIT_FAILED=READ_ONLY_AUDIT_UNAVAILABLE\n")


if __name__ == "__main__":
    unittest.main()
