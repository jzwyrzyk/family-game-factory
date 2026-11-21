"""Stored retired candidates and strict active promotion boundaries, offline."""
import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import pr108_stage as stage
import pr108_promote as promote
from test_pr108_stage import fixture


def retired():
    original, baseline, target = fixture()
    request = stage.make_stage_service(original, baseline, target)
    current = copy.deepcopy(request)
    current['metadata'].update(generation=8, resourceVersion='staged-version')
    current['status'] = {
        'observedGeneration': 8,
        'latestCreatedRevisionName': target['candidate'],
        'latestReadyRevisionName': target['baseline'],
        'traffic': copy.deepcopy(request['spec']['traffic']),
        'conditions': [
            {'type': 'Ready', 'status': 'True'},
            {'type': 'ConfigurationsReady', 'status': 'True', 'reason': 'Retired'},
            {'type': 'RoutesReady', 'status': 'True'},
        ],
    }
    candidate = copy.deepcopy(request['spec']['template'])
    candidate['metadata']['generation'] = 1
    candidate['status'] = {
        'observedGeneration': 1, 'imageDigest': target['image'],
        'conditions': [
            {'type': 'Ready', 'status': 'True', 'reason': 'Retired'},
            {'type': 'Active', 'status': 'False', 'reason': 'Retired'},
            {'type': 'ContainerReady', 'status': 'True'},
            {'type': 'ResourcesAvailable', 'status': 'Unknown', 'reason': 'Retired'},
        ],
    }
    journal = {
        'sourceSha': stage.SOURCE_SHA, 'service': original['metadata']['name'],
        'target': target, 'phase': 'attempted', 'baselineService': original,
        'baselineRevision': baseline, 'request': request,
        'iamHash': stage.digest({'version': 1, 'etag': 'fixture-policy', 'bindings': []}),
    }
    return current, candidate, journal


def activate(current, candidate, journal):
    current['status']['latestReadyRevisionName'] = journal['target']['candidate']
    current['status']['observedGeneration'] = current['metadata']['generation']
    current['status']['conditions'] = [
        {'type': name, 'status': 'True'} for name in ('Ready', 'ConfigurationsReady', 'RoutesReady')]
    candidate['status']['conditions'] = [
        {'type': name, 'status': 'True'} for name in ('Ready', 'Active', 'ContainerReady', 'ResourcesAvailable')]


class ReadCloud:
    def __init__(self, current, candidate, journal):
        self.current, self.candidate, self.journal = current, candidate, journal
        self.writes = []
    def iam(self, service):
        return {'version': 1, 'etag': 'fixture-policy', 'bindings': []}
    def request(self, kind, name, body=None, dry_run=False, missing=False):
        if body is not None:
            if dry_run:
                return copy.deepcopy(body)
            self.writes.append(body)
            raise AssertionError('Unexpected cloud write')
        if kind == 'services':
            return copy.deepcopy(self.current)
        if name == self.journal['target']['baseline']:
            return copy.deepcopy(self.journal['baselineRevision'])
        if name == self.journal['target']['candidate']:
            return copy.deepcopy(self.candidate)
        raise AssertionError('Unexpected resource')


class RetiredEdges(unittest.TestCase):
    def test_exact_retired_shape_is_configuration_only(self):
        current, candidate, journal = retired()
        self.assertEqual(stage.staged_candidate_status(current, candidate, journal), 'STAGED_CONFIGURATION_VERIFIED')
        self.assertFalse(stage.verify_candidate(current, candidate, journal))

    def test_rejects_unsettled_generation_or_wrong_retired_reasons(self):
        for mutation in ('service-generation', 'candidate-generation', 'resources-reason', 'active-reason', 'latest-ready', 'extra-unknown'):
            with self.subTest(mutation=mutation):
                current, candidate, journal = retired()
                if mutation == 'service-generation': current['status']['observedGeneration'] = 7
                elif mutation == 'candidate-generation': candidate['status']['observedGeneration'] = 0
                elif mutation == 'resources-reason': candidate['status']['conditions'][3]['reason'] = 'HealthCheckFailed'
                elif mutation == 'active-reason': candidate['status']['conditions'][1]['reason'] = 'Pending'
                elif mutation == 'latest-ready': current['status']['latestReadyRevisionName'] = 'factory-coach-private-other'
                else: candidate['status']['conditions'].append({'type': 'HealthCheck', 'status': 'Unknown'})
                self.assertIsNone(stage.staged_candidate_status(current, candidate, journal))

    def test_configuration_checks_still_reject_drift(self):
        for mutation in ('image', 'env', 'desired-route', 'observed-route'):
            with self.subTest(mutation=mutation):
                current, candidate, journal = retired()
                if mutation == 'image': candidate['status']['imageDigest'] = stage.PREFIX + 'coach@sha256:' + '0' * 64
                elif mutation == 'env': candidate['spec']['containers'][0]['env'][0]['value'] = 'false'
                elif mutation == 'desired-route': current['spec']['traffic'][0]['revisionName'] = journal['target']['candidate']
                else: current['status']['traffic'][0]['revisionName'] = journal['target']['candidate']
                with self.assertRaises(stage.StageError): stage.staged_candidate_status(current, candidate, journal)

    def test_retired_branch_cannot_leak_into_promoted_verification(self):
        current, candidate, journal = retired()
        current['spec']['traffic'] = promote.promotion_traffic(journal)
        current['status']['traffic'] = promote.promotion_traffic(journal)
        current['status']['latestReadyRevisionName'] = journal['target']['candidate']
        self.assertFalse(promote.verify_promoted(current, candidate, journal))
        activate(current, candidate, journal)
        self.assertTrue(promote.verify_promoted(current, candidate, journal))
        candidate['status']['conditions'][1]['status'] = 'False'
        self.assertFalse(promote.verify_promoted(current, candidate, journal))

    def test_attempted_journal_resumes_by_reads_then_allows_promotion_preparation(self):
        current, candidate, journal = retired()
        cloud = ReadCloud(current, candidate, journal)
        with tempfile.TemporaryDirectory() as directory, patch.dict(stage.TARGETS, {journal['service']: journal['target']}, clear=True):
            directory = Path(directory)
            path = directory / (journal['service'] + '.json')
            stage.save_journal(path, journal)
            result = stage.stage(cloud, directory, journal['service'], execute=True, wait_seconds=0)
            self.assertEqual(result['status'], 'STAGED_CONFIGURATION_VERIFIED')
            self.assertEqual(json.loads(path.read_text())['phase'], 'configuration_verified')
            context = promote.prepare(cloud, directory, journal['service'])
            self.assertEqual(promote.check_prepared(cloud, context)['status'], 'PREPARED_NO_TRAFFIC_CHANGE')
            self.assertEqual(cloud.writes, [])

    def test_activation_unknown_polls_without_weakening_final_acceptance(self):
        current, candidate, journal = retired()
        cloud = ReadCloud(current, candidate, journal)
        context = {'stage': journal, 'promotion': {'phase': 'attempted', 'beforeService': copy.deepcopy(current)}}
        current['spec']['traffic'] = promote.promotion_traffic(journal)
        current['metadata'].update(generation=9, resourceVersion='promoting-version')
        current['status']['conditions'][0]['status'] = 'Unknown'
        candidate['status']['conditions'][0] = {'type': 'Ready', 'status': 'Unknown', 'reason': 'Activating'}
        self.assertFalse(promote.observe(cloud, context))
        current['status']['traffic'] = promote.promotion_traffic(journal)
        self.assertFalse(promote.observe(cloud, context))
        activate(current, candidate, journal)
        self.assertTrue(promote.observe(cloud, context))
        self.assertEqual(cloud.writes, [])

    def test_unknown_activation_still_rejects_changed_image_or_terminal_failure(self):
        for mutation in ('image', 'failure'):
            with self.subTest(mutation=mutation):
                current, candidate, journal = retired()
                cloud = ReadCloud(current, candidate, journal)
                context = {'stage': journal, 'promotion': {'phase': 'attempted', 'beforeService': copy.deepcopy(current)}}
                current['spec']['traffic'] = promote.promotion_traffic(journal)
                current['metadata']['resourceVersion'] = 'promoting-version'
                candidate['status']['conditions'][0] = {'type': 'Ready', 'status': 'Unknown'}
                if mutation == 'image': candidate['status']['imageDigest'] = stage.PREFIX + 'coach@sha256:' + '0' * 64
                else: candidate['status']['conditions'][0]['status'] = 'False'
                with self.assertRaises(stage.StageError): promote.observe(cloud, context)


if __name__ == '__main__':
    unittest.main(verbosity=2)
