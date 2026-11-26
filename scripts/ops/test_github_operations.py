import copy
import hashlib
import io
import json
import unittest
from unittest.mock import Mock
import zipfile

from admin_api import SetupError
import github_operations as github
from test_request_evidence import SCOPE, NOW, complete, entry
import request_evidence as evidence


class GitHubTests(unittest.TestCase):
    def test_only_three_environments_no_release_or_oidc_changes(self):
        api = Mock()
        observed = {'main_sha': 'a' * 40, 'environments': dict.fromkeys(github.ENVIRONMENTS)}
        plan = github.plan_for(observed, api)
        self.assertEqual(len(plan.actions), 6)
        with self.assertRaises(SetupError): plan.execute('wrong')
        api.assert_not_called()
        self.assertTrue(all('/environments/' in item['change']['path'] for item in plan.actions))

    def test_arbitrary_or_future_inputs_fail(self):
        valid = {**SCOPE, 'revision': SCOPE['revision'] or ''}
        for delta in ({'service': 'other'}, {'revision': 'sensitive-arbitrary'},
                      {'end_utc': '2999-01-01T00:00:00Z'}, {'token': 'private'}):
            with self.assertRaises((SetupError, ValueError)): github.validate_inputs({**valid, **delta})

    def fixture(self):
        env = {'GITHUB_RUN_ID': '123', 'GITHUB_RUN_ATTEMPT': '1', 'GITHUB_SHA': 'a' * 40}
        report = evidence.initial_report(SCOPE, env, NOW)
        # An auth failure is a valid retrievable report; it must never qualify acceptance.
        report.update(query_status='UNAVAILABLE', reason='IDENTITY_UNAVAILABLE')
        stream = io.BytesIO()
        with zipfile.ZipFile(stream, 'w') as archive: archive.writestr('report.json', json.dumps(report))
        raw = stream.getvalue()
        run = {'id': 123, 'head_sha': 'a' * 40, 'head_branch': 'main', 'event': 'workflow_dispatch',
               'path': '.github/workflows/' + github.WORKFLOW, 'status': 'completed', 'conclusion': 'failure',
               'repository': {'id': 1458033181}, 'head_repository': {'id': 1458033181}, 'run_attempt': 1}
        artifact = {'total_count': 1, 'artifacts': [{'id': 42, 'name': 'jems-request-evidence-123-1',
                    'expired': False, 'size_in_bytes': len(raw), 'digest': 'sha256:' + hashlib.sha256(raw).hexdigest()}]}
        return run, artifact, raw

    def test_verified_failure_retrieved_without_false_acceptance(self):
        api = Mock(side_effect=self.fixture())
        result = github.retrieve('123', 'a' * 40, {**SCOPE, 'revision': SCOPE['revision'] or ''}, api)
        self.assertFalse(result['live_acceptance'])
        self.assertEqual(result['triage']['reason'], 'IDENTITY_UNAVAILABLE')
        self.assertTrue(all(c.args[0] == 'GET' for c in api.call_args_list))

    def test_connector_download_still_verified_without_raw_download(self):
        run, artifacts, raw = self.fixture()
        api = Mock(side_effect=[run, artifacts])
        result = github.retrieve('123', 'a' * 40, {**SCOPE, 'revision': SCOPE['revision'] or ''},
                                 api, downloaded_zip=raw)
        self.assertFalse(result['live_acceptance'])
        self.assertEqual(api.call_count, 2)

    def test_artifact_path_and_report_source_rejected_even_with_valid_archive_digest(self):
        for bad_name in ('../report.json', 'report.json'):
            run, artifacts, raw = self.fixture()
            with zipfile.ZipFile(io.BytesIO(raw)) as archive:
                report = json.loads(archive.read('report.json'))
            report['workflow']['workflow_source_sha'] = 'b' * 40
            output = io.BytesIO()
            with zipfile.ZipFile(output, 'w') as archive: archive.writestr(bad_name, json.dumps(report))
            raw = output.getvalue()
            artifacts['artifacts'][0]['digest'] = 'sha256:' + hashlib.sha256(raw).hexdigest()
            with self.assertRaises(SetupError):
                github.retrieve('123', 'a' * 40, {**SCOPE, 'revision': SCOPE['revision'] or ''},
                                Mock(side_effect=[run, artifacts]), downloaded_zip=raw)

    def test_wrong_run_source_fork_digest_and_path_fail(self):
        for field, value in (('head_sha', 'b' * 40), ('event', 'pull_request'),
                             ('head_repository', {'id': 1}), ('path', '.github/workflows/release.yml')):
            run, artifacts, raw = self.fixture(); run[field] = value
            with self.assertRaises(SetupError):
                github.retrieve('123', 'a' * 40, {**SCOPE, 'revision': SCOPE['revision'] or ''},
                                Mock(side_effect=[run, artifacts, raw]))
        run, artifacts, raw = self.fixture()
        artifacts['artifacts'][0]['digest'] = 'sha256:' + '0' * 64
        with self.assertRaises(SetupError):
            github.retrieve('123', 'a' * 40, {**SCOPE, 'revision': SCOPE['revision'] or ''},
                            Mock(side_effect=[run, artifacts, raw]))


if __name__ == '__main__': unittest.main()
