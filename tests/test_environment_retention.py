import json
from pathlib import Path
import sys
import unittest
from unittest.mock import Mock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts/environments"))
import automation


class TestRetention(unittest.TestCase):
    config = json.loads((ROOT / "ops/environments.json").read_text())
    package = "projects/{projectNumber}/locations/{region}/repositories/jems-environments/packages/site".format(**config)
    old, staged, new = ("sha256:" + c * 64 for c in "123")
    current, previous = "keep-test-current", "keep-test-previous"

    def rows(self, **tags):
        return [{"name": self.package + "/tags/" + t, "version": self.package + "/versions/" + v}
                for t, v in tags.items()]

    def exercise(self, *responses):
        self.client = Mock()
        self.client.run.side_effect = responses
        prefix = self.config["registry"] + "/site@"
        automation.retain_test_images(self.config, self.client, prefix + self.new, prefix + self.staged)

    def writes(self):
        return [call.args[2:5] for call in self.client.run.call_args_list if call.args[2] != "list"]

    def test_bootstrap_creates_rollback_before_current(self):
        prior = {self.previous: self.staged}
        self.exercise([], {}, self.rows(**prior), {}, self.rows(**prior, **{self.current: self.new}))
        self.assertEqual(self.writes(), [("create", self.previous, "--version=" + self.staged),
                                         ("create", self.current, "--version=" + self.new)])

    def test_interrupted_deployment_preserves_last_published_digest(self):
        initial = {self.previous: self.staged, self.current: self.old}
        saved = {self.previous: self.old, self.current: self.old}
        final = {self.previous: self.old, self.current: self.new}
        self.exercise(self.rows(**initial), {}, self.rows(**saved), {}, self.rows(**final))
        self.assertEqual(self.writes(), [("update", self.previous, "--version=" + self.old),
                                         ("update", self.current, "--version=" + self.new)])
        self.exercise(self.rows(**saved), {}, self.rows(**final))
        self.assertEqual(self.writes(), [("update", self.current, "--version=" + self.new)])
        self.exercise(self.rows(**final))
        self.assertEqual(self.writes(), [])

    def test_failed_or_stale_previous_write_stops_rotation(self):
        for reply in (RuntimeError("denied"), None):
            with self.subTest(reply=reply), self.assertRaises((RuntimeError, automation.AutomationError)):
                self.exercise([], reply, [])
            self.assertEqual(len(self.writes()), 1)
            self.assertEqual(self.writes()[0][1], self.previous)

    def test_invalid_or_unknown_registry_state_never_writes(self):
        rows = self.rows(**{self.current: self.new})
        for reply in (None, RuntimeError("listing failed"), rows + rows,
                      [{**rows[0], "version": "projects/another/versions/" + self.old}],
                      [{**rows[0], "name": "projects/another/tags/" + self.current}]):
            with self.subTest(reply=reply), self.assertRaises((RuntimeError, automation.AutomationError)):
                self.exercise(reply)
            self.assertEqual(self.writes(), [])
