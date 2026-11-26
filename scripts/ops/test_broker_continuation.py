import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock

import continue_broker_activation as follow

SOURCE = 'a' * 40
TOOL = 'b' * 40
APPROVAL = 'c' * 64
BUILD = '12345678-1234-1234-1234-123456789abc'
IMAGE = follow.broker.publication.IMAGE + '@sha256:' + 'd' * 64


class ContinuationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.home = Path(self.temp.name)
        self.folder = self.home / 'receipts'; self.folder.mkdir(mode=0o700)
        self.call = Mock(side_effect=self.child)
        self.status = Mock(return_value='SUCCESS')

    def tearDown(self): self.temp.cleanup()

    def child(self, source, lane, args, home):
        if lane == 'recovery': return {'status': 'READ_ONLY_RECOVERY_REPORT_NOT_ACTIVATION'}
        self.assertEqual(source, SOURCE)
        if args == ['--check']: return {'inventory': 'CHECKED', 'approve_plan_sha256': APPROVAL, 'plan': {'source_sha': SOURCE}}
        if '--submit' in args: return {'status': 'SUBMITTED_NOT_VERIFIED', 'source_sha': SOURCE, 'build_id': BUILD}
        if '--build-id' in args: return {'status': 'BUILD_VERIFIED_NOT_DEPLOYED', 'source_sha': SOURCE, 'build_id': BUILD, 'image': IMAGE}
        raise AssertionError('unexpected child operation')

    def run_flow(self, **kwargs):
        return follow.continuation(TOOL, SOURCE, APPROVAL, self.home, self.folder,
            call=self.call, status=self.status, sleep=Mock(), **kwargs)

    def submissions(self): return [c for c in self.call.call_args_list if '--submit' in c.args[2]]

    def test_one_submission_qualifies_and_prepares_read_only_recovery_for_exact_tuple(self):
        report = self.run_flow()
        self.assertEqual(report['status'], 'BUILD_VERIFIED_NOT_ACTIVATED')
        self.assertEqual(len(self.submissions()), 1)
        source, lane, args, _ = self.call.call_args.args
        self.assertEqual((source, lane), (TOOL, 'recovery'))
        self.assertIn(IMAGE, args); self.assertIn(BUILD, args); self.assertIn(SOURCE, args)
        rows = [json.loads(x) for x in next(self.folder.glob('build-intent-*.jsonl')).read_text().splitlines()]
        self.assertEqual([r['event'] for r in rows], ['SUBMISSION_INTENT', 'BUILD_SUBMITTED'])
        self.call.reset_mock()
        again = self.run_flow()
        self.assertEqual(again['status'], 'BUILD_VERIFIED_NOT_ACTIVATED')
        self.assertTrue(again['resumed_recorded_build'])
        self.assertEqual(self.submissions(), [])
        self.assertEqual(self.call.call_args.args[1], 'recovery')

    def test_wrong_approval_does_not_create_intent_or_submit(self):
        original = self.child
        def child(*args):
            result = original(*args)
            if args[2] == ['--check']: result['approve_plan_sha256'] = 'e' * 64
            return result
        self.call.side_effect = child
        report = self.run_flow()
        self.assertEqual(report['code'], 'BUILD_PLAN_APPROVAL_MISMATCH')
        self.assertEqual(self.submissions(), [])
        self.assertFalse(list(self.folder.glob('build-intent-*')))

    def test_uncertain_submission_preserves_intent_and_never_retries_or_leaks_error(self):
        original = self.child
        def child(*args):
            if '--submit' in args[2]: raise RuntimeError('PRIVATE-TOKEN')
            return original(*args)
        self.call.side_effect = child
        report = self.run_flow()
        self.assertEqual(len(self.submissions()), 1)
        self.assertNotIn('PRIVATE-TOKEN', json.dumps(report))
        self.assertTrue(list(self.folder.glob('build-intent-*')))
        self.run_flow()
        self.assertEqual(len(self.submissions()), 1)
        self.status.assert_not_called()

    def test_resume_by_existing_id_performs_no_submission_and_no_approval_reuse(self):
        report = self.run_flow(build_id=BUILD)
        self.assertEqual(report['status'], 'BUILD_VERIFIED_NOT_ACTIVATED')
        self.assertEqual(self.submissions(), [])
        self.assertFalse(list(self.folder.glob('build-intent-*')))
        self.assertFalse(any('--check' in c.args[2] for c in self.call.call_args_list))

    def test_pending_or_failed_builds_do_not_qualify_but_independent_recovery_continues(self):
        for value in ('QUEUED', 'FAILURE', 'TIMEOUT', 'CANCELLED'):
            self.call.reset_mock(); self.status.return_value = value
            report = self.run_flow(build_id=BUILD, now=Mock(side_effect=[0, 900]))
            self.assertNotIn('qualification', report)
            self.assertEqual(self.submissions(), [])
            self.assertEqual([c.args[1] for c in self.call.call_args_list], ['recovery'])
            self.assertNotIn('--broker-image', self.call.call_args.args[2])

    def test_success_without_matching_provenance_never_enters_recovery_as_qualified(self):
        original = self.child
        def child(*args):
            value = original(*args)
            if '--build-id' in args[2]: value['source_sha'] = 'f' * 40
            return value
        self.call.side_effect = child
        report = self.run_flow(build_id=BUILD)
        self.assertEqual(report['code'], 'QUALIFICATION_RECEIPT_MISMATCH')
        self.assertNotIn('--broker-image', self.call.call_args.args[2])

    def test_status_read_failure_is_not_retried_and_leaks_no_diagnostics(self):
        self.status.side_effect = RuntimeError('PRIVATE-GCLOUD-OUTPUT')
        report = self.run_flow(build_id=BUILD)
        self.assertNotIn('PRIVATE-GCLOUD-OUTPUT', json.dumps(report))
        self.assertEqual(self.status.call_count, 1)
        self.assertEqual(self.submissions(), [])


if __name__ == '__main__': unittest.main()
