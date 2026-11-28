import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts/environments'))
import automation


class AutomationTests(unittest.TestCase):
    def test_disabled_template_never_reads_github_or_invokes_cloud(self):
        config = json.loads((ROOT / 'tests/fixtures/environments/disabled.json').read_text())
        automation.cloud.validate_config(config, require_enabled=False, public_record=True)
        self.assertFalse(config['enabled'])
        api = Mock()
        with tempfile.TemporaryDirectory() as directory, patch.object(automation, 'read_config', return_value=config), \
                patch.object(automation, 'run') as command, patch.object(automation, 'output') as outputs:
            automation.prepare(Path(directory), api)
            api.request.assert_not_called()
            command.assert_not_called()
            outputs.assert_called_once_with(enabled=False, eligible=False)

    def test_checked_in_site_config_is_valid_for_protected_use(self):
        config = json.loads((ROOT / 'ops/environments.json').read_text())
        automation.cloud.validate_config(config, require_enabled=False, public_record=True)
        self.assertEqual(config['ownerIapMembers'], [])
        if config['enabled']:
            self.assertEqual(len(config['ownerIapBindingSha256']), 64)

    def test_changed_controller_stops_before_mutation(self):
        api = Mock()
        api.request.return_value = {'object': {'sha': 'b' * 40}}
        with patch.dict(os.environ, {'GITHUB_SHA': 'a' * 40}):
            with self.assertRaisesRegex(automation.AutomationError, 'MAIN_CHANGED'):
                automation.current_controller(api)

    def test_malformed_current_main_does_not_match_missing_workflow_identity(self):
        api = Mock()
        api.request.return_value = {'object': {'sha': None}}
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesRegex(automation.AutomationError, 'MAIN_CHANGED'):
                automation.current_controller(api)

    def test_artifact_or_source_replacement_invalidates_pending_deployment(self):
        candidate = {'eligible': True, 'environment': 'dev', 'prNumber': 22,
                     'sourceSha': 'a' * 40, 'runId': 10, 'artifactId': 20, 'artifactDigest': 'sha256:' + 'b' * 64}
        for key, value in [('sourceSha', 'c' * 40), ('artifactId', 21), ('artifactDigest', 'sha256:' + 'd' * 64), ('eligible', False)]:
            with self.subTest(key=key), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                (root / 'jems-candidate.json').write_text(json.dumps(candidate))
                fresh = {**candidate, key: value}
                with patch.object(automation, 'read_config', return_value={}), \
                        patch.object(automation.cloud, 'validate_config'), \
                        patch.object(automation.gh, 'choose_candidate', return_value=fresh), \
                        patch.object(automation, 'current_controller') as current:
                    with self.assertRaisesRegex(automation.AutomationError, 'NO_LONGER_ELIGIBLE'):
                        automation.recheck(root, Mock())
                    current.assert_not_called()

    def test_github_outputs_reject_multiline_data(self):
        with self.assertRaisesRegex(automation.AutomationError, 'NEWLINE'):
            automation.output(url='https://example.test\nprivileged=true')


if __name__ == '__main__':
    unittest.main()
