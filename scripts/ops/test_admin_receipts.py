"""Local storage failures must not silently replay or misreport account work."""

import contextlib
import errno
import io
import json
import os
from pathlib import Path
import stat
import tempfile
import unittest
from unittest import mock

from admin_api import Plan, SetupError
import admin_receipts as receipts
import admin_setup as setup


HEAD = "a" * 40


class ReceiptTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / "receipt.json"
        self.pending = self.path.with_name(self.path.name + ".pending")
        self.events = []
        self.plan = Plan("gcp", {"production_serving": {"service": "unchanged"}})
        self.plan.add("Create inactive fixture resource", {"disabled": True},
                      lambda: self.events.append("apply"))
        self.api = mock.Mock(name="github_api_client")
        self.github = mock.Mock(return_value=Plan("github", {"main": HEAD}))
        self.cloud = mock.Mock()
        self.cloud.plan.return_value = self.plan
        self.cloud.verify.side_effect = self.verified
        self.cloud_factory = mock.Mock(return_value=self.cloud)
        self.api_factory = mock.Mock(return_value=self.api)

    def verified(self, *_args):
        self.events.append("verify")
        return {"verified": "inactive_fixture", "production_serving": "unchanged"}

    def run_cli(self, phase="apply-gcp", *, code=None, path=None):
        argv = ["admin_setup.py", phase, "--receipt", str(path or self.path)]
        if phase.startswith(("apply-", "dispatch-")):
            argv += ["--review-code", code or self.plan.review_code()]
        output = io.StringIO()
        with (mock.patch.object(setup.sys, "argv", argv),
              mock.patch.object(setup, "read_head", return_value=HEAD),
              mock.patch.object(setup, "github_api", self.api_factory),
              mock.patch.object(setup, "github_plan", self.github),
              mock.patch.object(setup.admin_cloud, "Cloud", self.cloud_factory),
              mock.patch.object(setup.admin_cloud, "egress_status", return_value="fixture"),
              contextlib.redirect_stdout(output)):
            try:
                setup.main()
            except (SetupError, SystemExit) as error:
                return output.getvalue(), error
        return output.getvalue(), None

    def summary(self, output):
        # Plans span several lines; the final status and receipt marker do not.
        records = [json.loads(line) for line in output.splitlines()
                   if line.startswith("{") and line.endswith("}")]
        return next(record for record in records if "blockers" in record)

    def assert_no_account_work(self):
        self.assertEqual(self.events, [])
        self.api_factory.assert_not_called()
        self.cloud_factory.assert_not_called()
        self.assertFalse(self.path.exists())

    def test_enospc_during_actual_reservation_write_stops_all_mutating_modes(self):
        open_file = os.fdopen

        def full_disk(fd, mode):
            stream = open_file(fd, mode)
            wrapped = mock.Mock(wraps=stream)

            def write(data):
                if len(data) > 512:
                    stream.write(data[:512])
                    raise OSError(errno.ENOSPC, "fixture disk full")
                return stream.write(data)

            wrapped.write.side_effect = write
            return wrapped

        for phase in ("apply-github", "apply-gcp", "dispatch-claims"):
            with self.subTest(phase=phase), mock.patch.object(receipts.os, "fdopen", side_effect=full_disk):
                _output, error = self.run_cli(phase)
                self.assertIsInstance(error, SetupError)
                self.assertIn("before account actions (ENOSPC)", str(error))
                self.assert_no_account_work()
                self.assertFalse(self.pending.exists())

    def test_reservation_flush_or_fsync_failure_prevents_account_work(self):
        open_file = os.fdopen
        sync = os.fsync

        def failed_flush(fd, mode):
            wrapped = mock.Mock(wraps=open_file(fd, mode))
            wrapped.flush.side_effect = OSError(errno.ENOSPC, "fixture delayed disk full")
            return wrapped

        for method in ("flush", "file sync", "directory sync"):
            def failed_sync(fd):
                if method == "file sync" or stat.S_ISDIR(os.fstat(fd).st_mode):
                    raise OSError(errno.EIO, "fixture sync failure")
                return sync(fd)

            patch = (mock.patch.object(receipts.os, "fdopen", side_effect=failed_flush) if method == "flush"
                     else mock.patch.object(receipts.os, "fsync", side_effect=failed_sync))
            with self.subTest(method=method), patch:
                _output, error = self.run_cli()
                self.assertIsInstance(error, SetupError)
                self.assertIn("before account actions", str(error))
                self.assert_no_account_work()
                self.assertFalse(self.pending.exists())

    def test_success_reserves_private_storage_before_reads_then_publishes_receipt(self):
        def observe_storage(*_args):
            self.assertFalse(self.path.exists())
            self.assertEqual(self.pending.stat().st_size, receipts.RECEIPT_BYTES)
            self.assertEqual(stat.S_IMODE(self.pending.stat().st_mode), 0o600)
            self.assertEqual(json.loads(self.pending.read_text())["receipt_status"], "reserved")
            return self.cloud

        self.cloud_factory.side_effect = observe_storage
        output, error = self.run_cli()
        self.assertIsNone(error)
        self.assertEqual(self.events, ["apply", "verify"])
        self.assertEqual(self.summary(output)["blockers"], {})
        saved = json.loads(self.path.read_text())
        self.assertEqual((saved["head"], saved["phase"]), (HEAD, "apply-gcp"))
        self.assertEqual(saved["details"]["gcp"]["verified_state"]["verified"], "inactive_fixture")
        self.assertEqual(stat.S_IMODE(self.path.stat().st_mode), 0o600)
        self.assertLess(self.path.stat().st_size, receipts.RECEIPT_BYTES)
        self.assertFalse(self.pending.exists())
        self.assertIn(json.dumps({"receipt": str(self.path)}), output)

    def test_intent_sync_failure_prevents_first_account_write(self):
        sync = os.fsync

        def fail_intent(fd):
            if (stat.S_ISREG(os.fstat(fd).st_mode) and
                    json.loads(self.pending.read_text()).get("receipt_status") == "incomplete"):
                raise OSError(errno.ENOSPC, "fixture intent sync failure")
            return sync(fd)

        with mock.patch.object(receipts.os, "fsync", side_effect=fail_intent):
            output, error = self.run_cli()
        self.assertIsInstance(error, SystemExit)
        self.assertEqual(error.code, 1)
        self.assertEqual(self.events, [])
        self.assertIn("before any account action (ENOSPC)", self.summary(output)["blockers"]["gcp"])
        self.cloud.verify.assert_not_called()
        self.assertFalse(self.path.exists())
        self.assertFalse(self.pending.exists())

    def test_review_code_still_gates_actions_and_releases_unstarted_reservation(self):
        output, error = self.run_cli(code="0" * 64)
        self.assertIsInstance(error, SystemExit)
        self.assertIn("Review code does not match", self.summary(output)["blockers"]["gcp"])
        self.assertEqual(self.events, [])
        self.assertFalse(self.path.exists())
        self.assertFalse(self.pending.exists())

    def test_partial_account_failure_keeps_incomplete_intent_and_blocks_replay(self):
        def partial_apply():
            self.events.append("apply")
            raise SetupError("Fixture account request returned an unknown outcome")

        self.plan.work[0] = partial_apply
        output, error = self.run_cli()
        self.assertIsInstance(error, SystemExit)
        self.assertEqual(self.events, ["apply"])
        self.assertEqual(self.summary(output)["incomplete_receipt"], str(self.pending))
        self.assertFalse(self.path.exists())
        intent = json.loads(self.pending.read_text())
        self.assertEqual(intent["receipt_status"], "incomplete")
        self.assertEqual(intent["review_code"], self.plan.review_code())
        self.assertEqual(intent["plan"], self.plan.describe())
        self.assertEqual(stat.S_IMODE(self.pending.stat().st_mode), 0o600)
        original = self.pending.read_bytes()
        _output, repeated_error = self.run_cli()
        self.assertIsInstance(repeated_error, SetupError)
        self.assertIn("instead of replaying", str(repeated_error))
        self.assertEqual(self.events, ["apply"])
        self.assertEqual(self.pending.read_bytes(), original)

    def test_verified_account_work_then_receipt_fsync_failure_reports_receipt_blocker(self):
        sync = os.fsync

        def fail_after_verified(fd):
            if self.events == ["apply", "verify"]:
                raise OSError(errno.ENOSPC, "fixture final sync failure")
            return sync(fd)

        with mock.patch.object(receipts.os, "fsync", side_effect=fail_after_verified):
            output, error = self.run_cli()
        self.assertIsInstance(error, SystemExit)
        self.assertEqual(error.code, 1)
        result = self.summary(output)
        self.assertEqual(set(result["blockers"]), {"receipt"})
        self.assertIn("Account checks completed", result["blockers"]["receipt"])
        self.assertIn("ENOSPC", result["blockers"]["receipt"])
        self.assertIn("Do not repeat an apply or dispatch", result["blockers"]["receipt"])
        self.assertEqual(result["incomplete_receipt"], str(self.pending))
        self.assertEqual(self.events, ["apply", "verify"])
        self.assertTrue(self.pending.exists())
        self.assertFalse(self.path.exists())
        self.assertNotIn('"blockers": {}', output)
        self.assertFalse(any(line.startswith('{"receipt":') for line in output.splitlines()))

        # Recovery observes current state using a different receipt; it never
        # re-executes the action or rewrites the failed historical evidence.
        original = self.pending.read_bytes()
        recovered = self.path.with_name("recovered.json")
        recovery_output, recovery_error = self.run_cli("verify", path=recovered)
        self.assertIsNone(recovery_error)
        self.assertEqual(self.events, ["apply", "verify", "verify"])
        self.assertEqual(self.pending.read_bytes(), original)
        self.assertEqual(json.loads(recovered.read_text())["phase"], "verify")
        self.assertEqual(self.summary(recovery_output)["blockers"], {})
        self.api.assert_not_called()

    def test_directory_sync_failure_after_publication_preserves_both_paths(self):
        sync = os.fsync

        def fail_publication_sync(fd):
            if self.events == ["apply", "verify"] and stat.S_ISDIR(os.fstat(fd).st_mode):
                raise OSError(errno.EIO, "fixture directory sync failure")
            return sync(fd)

        with mock.patch.object(receipts.os, "fsync", side_effect=fail_publication_sync):
            output, error = self.run_cli()
        self.assertIsInstance(error, SystemExit)
        self.assertIn("receipt", self.summary(output)["blockers"])
        self.assertTrue(self.path.exists())
        self.assertTrue(self.pending.exists())
        self.assertEqual(self.path.read_bytes(), self.pending.read_bytes())
        self.assertFalse(any(line.startswith('{"receipt":') for line in output.splitlines()))

    def test_existing_final_pending_or_symlink_is_never_overwritten(self):
        for target in (self.path, self.pending):
            for symlink in (False, True):
                with self.subTest(target=target.name, symlink=symlink):
                    sentinel = self.path.with_name("sentinel")
                    sentinel.write_text("retain earlier evidence")
                    if symlink:
                        target.symlink_to(sentinel)
                    else:
                        target.write_text("retain earlier evidence")
                    _output, error = self.run_cli()
                    self.assertIsInstance(error, SetupError)
                    self.assertEqual(self.events, [])
                    self.api_factory.assert_not_called()
                    self.cloud_factory.assert_not_called()
                    self.assertEqual(target.read_text(), "retain earlier evidence")
                    self.assertEqual(sentinel.read_text(), "retain earlier evidence")
                    target.unlink()

    def test_final_publication_refuses_destination_created_during_account_work(self):
        def verified_and_raced(*args):
            self.path.write_text("retain concurrent evidence")
            return self.verified(*args)

        self.cloud.verify.side_effect = verified_and_raced
        output, error = self.run_cli()
        self.assertIsInstance(error, SystemExit)
        self.assertIn("EEXIST", self.summary(output)["blockers"]["receipt"])
        self.assertEqual(self.path.read_text(), "retain concurrent evidence")
        self.assertTrue(self.pending.exists())
        self.assertEqual(self.events, ["apply", "verify"])

    def test_oversized_intent_fails_before_action_and_oversized_result_is_not_success(self):
        self.plan.notes = ["x" * receipts.RECEIPT_BYTES]
        output, error = self.run_cli()
        self.assertIsInstance(error, SystemExit)
        self.assertIn("one-MiB limit", self.summary(output)["blockers"]["gcp"])
        self.assertEqual(self.events, [])
        self.assertFalse(self.path.exists())
        self.assertFalse(self.pending.exists())

        self.plan.notes = []
        self.cloud.verify.side_effect = lambda *_args: {"verified": "x" * receipts.RECEIPT_BYTES}
        output, error = self.run_cli()
        self.assertIsInstance(error, SystemExit)
        self.assertEqual(set(self.summary(output)["blockers"]), {"receipt"})
        self.assertIn("one-MiB limit", self.summary(output)["blockers"]["receipt"])
        self.assertEqual(self.events, ["apply"])
        self.assertTrue(self.pending.exists())
        self.assertFalse(self.path.exists())


if __name__ == "__main__":
    unittest.main()
