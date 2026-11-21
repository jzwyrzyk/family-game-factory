"""Traffic-only promotion acceptance, entirely offline with synthetic metadata."""
import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import pr108_stage as stage
import pr108_promote as promote
from test_pr108_stage import active_revision_conditions, fixture, ready_service_conditions


def staged(service='factory-coach-private'):
    original, baseline, target = fixture(service)
    request = stage.make_stage_service(original, baseline, target)
    current = copy.deepcopy(request)
    current['metadata'].update(generation=8, resourceVersion='staged-version')
    current['status'] = {
        'observedGeneration': 8,
        'latestCreatedRevisionName': target['candidate'],
        'latestReadyRevisionName': target['candidate'],
        'traffic': copy.deepcopy(request['spec']['traffic']),
        'conditions': ready_service_conditions(),
    }
    candidate = copy.deepcopy(request['spec']['template'])
    candidate['metadata']['generation'] = 1
    candidate['status'] = {'imageDigest': target['image'], 'observedGeneration': 1,
                           'conditions': active_revision_conditions()}
    journal = {
        'sourceSha': stage.SOURCE_SHA, 'service': original['metadata']['name'],
        'target': target, 'phase': 'verified', 'baselineService': original,
        'baselineRevision': baseline, 'request': request,
        'iamHash': stage.digest({'version': 1, 'etag': 'fixture-policy', 'bindings': []}),
    }
    return current, candidate, journal


class TrafficOnlyPromotionTests(unittest.TestCase):
    def test_changes_only_traffic_and_uses_original_conditional_version(self):
        current, _, journal = staged()
        request = promote.make_promotion_service(current, journal)
        self.assertEqual(request['metadata']['resourceVersion'], 'staged-version')
        self.assertEqual(request['spec']['template'], current['spec']['template'])
        self.assertEqual(stage.service_envelope(request), stage.service_envelope(current))
        self.assertEqual(request['spec']['traffic'], [
            {'revisionName': journal['target']['candidate'], 'percent': 100}])

    def test_preserves_tag_targets_even_when_tag_was_on_serving_route(self):
        _, _, journal = staged()
        original = journal['target']['baseline']
        journal['request']['spec']['traffic'] = [
            {'revisionName': original, 'percent': 100, 'tag': 'stable-bookmark'},
            {'revisionName': 'factory-coach-private-older', 'percent': 0, 'tag': 'older-preview'},
        ]
        routes = promote.promotion_traffic(journal)
        self.assertEqual({r['tag']: r['revisionName'] for r in routes if r.get('tag')}, {
            'stable-bookmark': original, 'older-preview': 'factory-coach-private-older'})
        self.assertTrue(all(r['percent'] == 0 for r in routes if r.get('tag')))
        self.assertEqual([r for r in routes if r['percent'] > 0], [
            {'revisionName': journal['target']['candidate'], 'percent': 100}])

    def test_candidate_must_be_serving_in_both_desired_and_observed_routes(self):
        current, candidate, journal = staged()
        promoted = promote.promotion_traffic(journal)
        current['spec']['traffic'] = copy.deepcopy(promoted)
        with self.assertRaises(stage.StageError):
            promote.verify_promoted(current, candidate, journal)
        current['status']['traffic'] = copy.deepcopy(promoted)
        self.assertTrue(promote.verify_promoted(current, candidate, journal))

    def test_correct_traffic_cannot_hide_changed_candidate_settings_or_service_policy(self):
        current, candidate, journal = staged()
        routes = promote.promotion_traffic(journal)
        current['spec']['traffic'] = copy.deepcopy(routes)
        current['status']['traffic'] = copy.deepcopy(routes)
        for mutation in ('candidate-image', 'candidate-secret', 'template', 'service-policy'):
            with self.subTest(mutation=mutation):
                changed, changed_candidate = copy.deepcopy(current), copy.deepcopy(candidate)
                if mutation == 'candidate-image':
                    changed_candidate['status']['imageDigest'] = stage.PREFIX + 'coach@sha256:' + '0' * 64
                elif mutation == 'candidate-secret':
                    changed_candidate['spec']['volumes'][0]['secret']['items'][0]['key'] = '10'
                elif mutation == 'template':
                    changed['spec']['template']['spec']['containers'][0]['env'][0]['value'] = 'false'
                else:
                    changed['metadata']['annotations']['run.googleapis.com/ingress'] = 'all'
                with self.assertRaises(stage.StageError):
                    promote.verify_promoted(changed, changed_candidate, journal)

    def test_nonsettled_service_is_not_promoted_acceptance(self):
        current, candidate, journal = staged()
        routes = promote.promotion_traffic(journal)
        current['spec']['traffic'] = copy.deepcopy(routes)
        current['status']['traffic'] = copy.deepcopy(routes)
        current['status']['observedGeneration'] = 7
        self.assertFalse(promote.verify_promoted(current, candidate, journal))

    def test_dry_run_must_preserve_staged_configuration(self):
        current, _, journal = staged()
        proposed = promote.make_promotion_service(current, journal)
        promote.verify_promotion_shape(proposed, journal)
        proposed['spec']['template']['spec']['containers'][0]['env'][0]['value'] = 'false'
        with self.assertRaises(stage.StageError):
            promote.verify_promotion_shape(proposed, journal)


class PromotionCloud:
    def __init__(self, fixtures):
        self.fixtures = fixtures
        self.writes = []
        self.conflict = None
        self.lose_response = None
        self.pending = None
        self.iam_drift = None

    def iam(self, service):
        return {'version': 1, 'etag': 'changed' if service == self.iam_drift else 'fixture-policy',
                'bindings': []}

    def request(self, kind, name, body=None, dry_run=False, missing=False):
        if kind == 'revisions':
            for current, candidate, journal in self.fixtures.values():
                if name == journal['target']['baseline']:
                    return copy.deepcopy(journal['baselineRevision'])
                if name == journal['target']['candidate']:
                    return copy.deepcopy(candidate)
            raise AssertionError('Unexpected revision read')
        current, candidate, journal = self.fixtures[name]
        if body is None:
            return copy.deepcopy(current)
        if dry_run:
            if name == self.conflict:
                current['metadata']['resourceVersion'] = 'concurrent-version'
            return copy.deepcopy(body)
        self.writes.append((name, copy.deepcopy(body)))
        prior_traffic = copy.deepcopy(current['status']['traffic'])
        new_service = copy.deepcopy(body)
        new_service['metadata'].update(generation=9, resourceVersion='promoted-version')
        new_service['status'] = {
            'observedGeneration': 8 if name == self.pending else 9,
            'latestCreatedRevisionName': journal['target']['candidate'],
            'latestReadyRevisionName': journal['target']['candidate'],
            'traffic': prior_traffic if name == self.pending else copy.deepcopy(body['spec']['traffic']),
            'conditions': ready_service_conditions(),
        }
        if name == self.pending:
            new_service['status']['conditions'][0]['status'] = 'Unknown'
        self.fixtures[name] = (new_service, candidate, journal)
        if name == self.lose_response:
            raise stage.CloudError('CLOUD_RESPONSE_UNKNOWN', uncertain=True)
        return copy.deepcopy(new_service)

    def settle(self, service):
        current = self.fixtures[service][0]
        current['status']['traffic'] = copy.deepcopy(current['spec']['traffic'])
        current['status']['observedGeneration'] = current['metadata']['generation']
        current['status']['conditions'] = ready_service_conditions()


class PromotionRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.fixtures = {name: staged(name) for name in promote.ORDER}
        self.temporary = tempfile.TemporaryDirectory()
        self.directory = Path(self.temporary.name)
        for name, (_, _, journal) in self.fixtures.items():
            stage.save_journal(self.directory / (name + '.json'), journal)
        targets = {name: values[2]['target'] for name, values in self.fixtures.items()}
        self.target_patch = patch.dict(stage.TARGETS, targets, clear=True)
        self.target_patch.start()
        self.cloud = PromotionCloud(self.fixtures)
        self.quiet = patch.object(promote, 'progress')
        self.quiet.start()
        self.output = patch('builtins.print')
        self.output.start()

    def tearDown(self):
        self.output.stop()
        self.quiet.stop()
        self.target_patch.stop()
        self.temporary.cleanup()

    @staticmethod
    def healthy():
        return {'ready': True, 'paidExecution': True}

    def test_execute_promotes_coach_then_gateway_and_only_then_signals_success(self):
        result = promote.run(self.cloud, self.directory, execute=True, wait_seconds=0, health=self.healthy)
        self.assertEqual(result, 0)
        self.assertEqual([name for name, body in self.cloud.writes], list(promote.ORDER))
        for name, body in self.cloud.writes:
            self.assertEqual(body['metadata']['resourceVersion'], 'staged-version')
            self.assertEqual(body['spec']['traffic'], [
                {'revisionName': stage.TARGETS[name]['candidate'], 'percent': 100}])
        for name in promote.ORDER:
            original_stage = stage.load_journal(self.directory / (name + '.json'), name)
            self.assertEqual(original_stage['phase'], 'verified')
            self.assertEqual(original_stage['request']['spec']['traffic'], [
                {'revisionName': stage.TARGETS[name]['baseline'], 'percent': 100}])

    def test_read_only_preparation_does_not_return_dispatch_success(self):
        result = promote.run(self.cloud, self.directory, wait_seconds=0, health=self.healthy)
        self.assertEqual(result, 3)
        self.assertEqual(self.cloud.writes, [])

    def test_second_service_concurrent_change_stops_before_either_write(self):
        self.cloud.conflict = 'factory-gateway'
        with self.assertRaisesRegex(stage.StageError, 'CONCURRENT_SERVICE_CHANGE'):
            promote.run(self.cloud, self.directory, execute=True, wait_seconds=0, health=self.healthy)
        self.assertEqual(self.cloud.writes, [])

    def test_second_service_iam_drift_stops_before_either_write(self):
        self.cloud.iam_drift = 'factory-gateway'
        with self.assertRaisesRegex(stage.StageError, 'IAM_CHANGED'):
            promote.run(self.cloud, self.directory, execute=True, wait_seconds=0, health=self.healthy)
        self.assertEqual(self.cloud.writes, [])

    def test_lost_coach_response_recovers_without_repeating_then_finishes_gateway(self):
        self.cloud.lose_response = 'factory-coach-private'
        with self.assertRaisesRegex(stage.StageError, 'PROMOTION_UNCERTAIN'):
            promote.run(self.cloud, self.directory, execute=True, wait_seconds=0, health=self.healthy)
        self.assertEqual([name for name, _ in self.cloud.writes], ['factory-coach-private'])
        self.cloud.lose_response = None
        result = promote.run(self.cloud, self.directory, execute=True, wait_seconds=0, health=self.healthy)
        self.assertEqual(result, 0)
        self.assertEqual([name for name, _ in self.cloud.writes], list(promote.ORDER))

    def test_pending_effective_route_blocks_gateway_and_can_resume_by_reads(self):
        self.cloud.pending = 'factory-coach-private'
        result = promote.run(self.cloud, self.directory, execute=True, wait_seconds=0, health=self.healthy)
        self.assertEqual(result, 2)
        self.assertEqual([name for name, _ in self.cloud.writes], ['factory-coach-private'])
        self.cloud.settle('factory-coach-private')
        self.cloud.pending = None
        result = promote.run(self.cloud, self.directory, execute=True, wait_seconds=0, health=self.healthy)
        self.assertEqual(result, 0)
        self.assertEqual([name for name, _ in self.cloud.writes], list(promote.ORDER))

    def test_altered_promotion_journal_cannot_authorize_a_different_write(self):
        promote.prepare(self.cloud, self.directory, 'factory-coach-private')
        path = self.directory / 'factory-coach-private.promotion.json'
        record = json.loads(path.read_text())
        record['request']['spec']['template']['spec']['containers'][0]['env'][0]['value'] = 'false'
        stage.save_journal(path, record)
        with self.assertRaisesRegex(stage.StageError, 'PROMOTION_JOURNAL_REQUEST_MISMATCH'):
            promote.run(self.cloud, self.directory, execute=True, wait_seconds=0, health=self.healthy)
        self.assertEqual(self.cloud.writes, [])

    def test_failed_health_cannot_signal_pages_ready_and_recovery_does_not_repromote(self):
        def failed_health():
            raise stage.StageError('GATEWAY_HEALTH_OR_APPROVED_ACTIVE_STATE_CHANGED')
        with self.assertRaisesRegex(stage.StageError, 'GATEWAY_HEALTH'):
            promote.run(self.cloud, self.directory, execute=True, wait_seconds=0, health=failed_health)
        self.assertEqual(len(self.cloud.writes), 2)
        result = promote.run(self.cloud, self.directory, execute=True, wait_seconds=0, health=self.healthy)
        self.assertEqual(result, 0)
        self.assertEqual(len(self.cloud.writes), 2)


if __name__ == '__main__':
    unittest.main()
