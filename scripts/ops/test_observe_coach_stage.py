"""Offline regressions for the pinned owner observation; no cloud calls."""
import copy
from datetime import datetime, timedelta, timezone
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tempfile
import types
import unittest
from unittest.mock import patch

import observe_coach_stage as o
import release
from test_operations import CloudRunFixture

spec = importlib.util.spec_from_file_location(
    'continuity_fixtures', Path(__file__).parents[1] / 'deployment/test_continuity.py')
cf = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cf)


class CoachFixture(CloudRunFixture):
    service = o.SERVICE
    resource = o.RESOURCE
    baseline = 'factory-coach-private-old'

    def __init__(self):
        super().__init__()
        self.transition('stage')
        self.state['name'] = self.resource
        self.state['latestReadyRevision'] = self.state['latestCreatedRevision']

    def observe(self):
        return o.staged_state(release, self.intent, self.state,
                              self.revisions[self.baseline], self.revisions[self.candidate])


class StageTests(unittest.TestCase):
    def test_stage_accepts_zero_candidate_traffic_and_checks_both_revisions(self):
        f = CoachFixture()
        result = f.observe()
        self.assertEqual((result['baseline_percent'], result['candidate_percent']), (100, 0))
        self.assertTrue(result['both_revisions_ready'])

    def test_canary_or_promoted_traffic_cannot_pass_stage(self):
        for operation in ('canary', 'promote'):
            with self.subTest(operation=operation):
                f = CoachFixture()
                f.transition('canary')
                if operation == 'promote':
                    f.transition('promote')
                with self.assertRaises(o.ObservationError):
                    f.observe()

    def test_pending_target_configuration_and_revision_drift_fail(self):
        mutations = [
            lambda f: f.state.update(reconciling=True),
            lambda f: f.state['traffic'][0].update(revision=f.candidate),
            lambda f: f.state['traffic'][0].update(type='TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST'),
            lambda f: f.state.update(latestReadyRevision=f.resource + '/revisions/other'),
            lambda f: f.state['template']['containers'][0].update(image='wrong-image'),
            lambda f: f.state['template']['containers'][0]['env'][0].update(value='true'),
            lambda f: f.revisions[f.baseline]['containers'][0].update(image='wrong-image'),
            lambda f: f.revisions[f.candidate].update(conditions=[]),
        ]
        for index, mutate in enumerate(mutations):
            with self.subTest(mutation=index):
                f = CoachFixture()
                mutate(f)
                with self.assertRaises((o.ObservationError, ValueError)):
                    f.observe()

    def test_continuity_keeps_all_nontraffic_checks(self):
        h = types.SimpleNamespace(PRIVATE_WORKER=cf.P)
        pins = [cf.P, cf.P, cf.P, 'true']
        gateway = cf.service('factory-gateway', 'true')
        result = o.continuity(h, cf.c, gateway, cf.wif(), pins, cf.config(True))
        self.assertEqual(result['live_provider_reply'], 'NOT_TESTED')
        self.assertNotIn('sessionKey', json.dumps(result))
        cases = [
            (gateway, cf.wif(), pins, cf.config(False)),
            (gateway, cf.wif(cf.OLD), pins, cf.config(True)),
            (gateway, cf.wif(), [cf.P, cf.OLD, cf.P, 'true'], cf.config(True)),
            (cf.service('factory-gateway', 'false'), cf.wif(), pins, cf.config(True)),
            (cf.service('factory-gateway', 'true', adult=False), cf.wif(), pins, cf.config(True)),
        ]
        for args in cases:
            with self.assertRaises((o.ObservationError, cf.c.ContinuityError)):
                o.continuity(h, cf.c, *args)


class LogTests(unittest.TestCase):
    def setUp(self):
        self.end = datetime(2026, 11, 23, 23, 0, tzinfo=timezone.utc)
        self.start = self.end - timedelta(minutes=15)
        self.revisions = ['coach-old', 'coach-candidate']
        self.row = {'timestamp': self.end.isoformat(), 'logName': o.REQUEST_LOG, 'severity': 'INFO',
                    'httpRequest': {'status': 200}, 'resource': {'type': 'cloud_run_revision',
                    'labels': {'project_id': o.PROJECT, 'location': o.REGION, 'service_name': o.SERVICE,
                               'revision_name': self.revisions[0]}}}

    def summary(self, rows, errors=False):
        return o.log_summary(rows, self.revisions, self.start, self.end, errors)

    def test_empty_window_is_only_read_success(self):
        self.assertEqual(self.summary([]), {'read_succeeded': True, 'sample_limit': 500,
                                           'truncated': False, 'counts': []})

    def test_candidate_status_is_separate_and_sentinel_is_not_counted(self):
        candidate = copy.deepcopy(self.row)
        candidate['resource']['labels']['revision_name'] = self.revisions[1]
        candidate.update(severity='ERROR', httpRequest={'status': 503})
        result = self.summary([self.row, candidate])
        self.assertEqual([(r['revision'], r['http_status']) for r in result['counts']],
                         [('baseline', 200), ('candidate', 503)])
        result = self.summary([self.row] * 501)
        self.assertTrue(result['truncated'])
        self.assertEqual(result['counts'][0]['count'], 500)
        with self.assertRaises(o.ObservationError):
            self.summary([self.row] * 502)

    def test_payload_url_wrong_scope_and_out_of_window_rejected(self):
        mutations = [
            lambda r: r.update(jsonPayload={'private': 'must-never-be-reported'}),
            lambda r: r['httpRequest'].update(requestUrl='private-path'),
            lambda r: r['resource']['labels'].update(project_id='other-project'),
            lambda r: r['resource']['labels'].update(revision_name='unexpected'),
            lambda r: r.update(timestamp=(self.start - timedelta(seconds=1)).isoformat()),
            lambda r: r['httpRequest'].update(status='200'),
            lambda r: r.update(logName='projects/other/logs/stdout'),
        ]
        for index, mutate in enumerate(mutations):
            with self.subTest(mutation=index):
                row = copy.deepcopy(self.row)
                mutate(row)
                with self.assertRaises(o.ObservationError):
                    self.summary([row])

    def test_error_read_rejects_info_including_sentinel(self):
        with self.assertRaises(o.ObservationError):
            self.summary([self.row], errors=True)
        bad = copy.deepcopy(self.row)
        bad['textPayload'] = 'sensitive'
        with self.assertRaises(o.ObservationError):
            self.summary([self.row] * 500 + [bad])

    def test_filter_and_projection_exclude_payloads(self):
        query = o.log_filter(self.revisions, self.start, self.end)
        self.assertIn('httpRequest.requestMethod="POST"', query)
        self.assertIn('/v1/private-coach/complete', query)
        self.assertNotIn('requestUrl', o.FORMAT)
        errors = o.log_filter(self.revisions, self.start, self.end, True)
        self.assertNotIn('stderr', errors)
        self.assertNotIn('stdout', errors)
        with self.assertRaises(o.ObservationError):
            o.log_filter(['old', 'x" OR true'], self.start, self.end)


class PrivacyTests(unittest.TestCase):
    def test_command_captures_private_output_disables_debug_and_never_prompts(self):
        result = subprocess.CompletedProcess([], 0, b'{}', b'')
        with patch.dict(o.os.environ, GH_DEBUG='api', CLOUDSDK_CORE_LOG_HTTP='true'), \
                patch.object(o.subprocess, 'run', return_value=result) as run:
            self.assertEqual(o.command(['gcloud', 'logging', 'read']), '{}')
        kwargs = run.call_args.kwargs
        self.assertNotIn('GH_DEBUG', kwargs['env'])
        self.assertEqual(kwargs['env']['CLOUDSDK_CORE_LOG_HTTP'], 'false')
        self.assertEqual(kwargs['stdin'], subprocess.DEVNULL)
        self.assertTrue(kwargs['capture_output'])

    def test_unknown_failure_never_echoes_raw_error(self):
        output = io.StringIO()
        with patch.object(o, 'observe', side_effect=ValueError('private-token-or-config')), \
                patch.object(o.os, 'umask'), patch('sys.stdout', output):
            self.assertEqual(o.main(), 2)
        self.assertNotIn('private-token-or-config', output.getvalue())
        self.assertEqual(json.loads(output.getvalue())['mutations'], 0)

    def test_helper_digest_checked_before_execution(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'helper.py'
            path.write_text('raise RuntimeError("must not execute")')
            path.chmod(0o600)
            with self.assertRaisesRegex(o.ObservationError, 'PINNED_HELPER_CHANGED'):
                o.load_pinned(path, '0' * 64)

    def test_late_evidence_failure_cannot_leave_success_status(self):
        def fail(report):
            report['status'] = 'READ_ONLY_STAGE_OBSERVATION_COMPLETE'
            raise OSError('private storage detail')
        output = io.StringIO()
        with patch.object(o, 'observe', side_effect=fail), patch.object(o.os, 'umask'), \
                patch('sys.stdout', output):
            self.assertEqual(o.main(), 2)
        self.assertEqual(json.loads(output.getvalue())['status'], 'READ_ONLY_STAGE_OBSERVATION_BLOCKED')


if __name__ == '__main__':
    unittest.main()
