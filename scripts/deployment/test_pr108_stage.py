"""Offline release regressions for serving-template selection and traffic guards."""
import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import pr108_stage as stage


def active_revision_conditions():
    return [{'type': name, 'status': 'True'}
            for name in ('Ready', 'Active', 'ContainerReady', 'ResourcesAvailable')]


def ready_service_conditions():
    return [{'type': name, 'status': 'True'}
            for name in ('Ready', 'ConfigurationsReady', 'RoutesReady')]


def fixture(service='factory-coach-private'):
    target = copy.deepcopy(stage.TARGETS[service])
    kind = 'coach' if service.endswith('private') else 'gateway'
    old_image = stage.PREFIX + kind + '@sha256:' + target['oldDigest']
    revision = {
        'metadata': {
            'name': target['baseline'],
            'generation': 1,
            'labels': {'family-component': kind, 'serving.knative.dev/service': service},
            'annotations': {
                'autoscaling.knative.dev/minScale': '0',
                'autoscaling.knative.dev/maxScale': '1',
                'run.googleapis.com/vpc-access-connector': 'approved-connector',
                'run.googleapis.com/vpc-access-egress': 'all-traffic',
                'run.googleapis.com/secrets': 'config:projects/123/secrets/config',
                'run.googleapis.com/execution-environment': 'gen2',
                'example.test/retained-setting': 'keep-this',
                'serving.knative.dev/creator': 'fixture-operator',
                'run.googleapis.com/operation-id': 'old-operation',
            },
        },
        'spec': {
            'serviceAccountName': kind + '@example.test',
            'containerConcurrency': 4,
            'timeoutSeconds': 45,
            'containers': [{
                'image': old_image,
                'env': [
                    {'name': 'FACTORY_ACTIONS_APPROVED', 'value': 'true'},
                    {'name': 'FACTORY_ADULT_PILOT_MODE', 'value': 'true'},
                    {'name': 'MODEL_KEY', 'valueFrom': {'secretKeyRef': {
                        'name': 'fixture-key', 'key': '3'}}},
                ],
                'volumeMounts': [{'name': 'config', 'mountPath': '/var/run/factory-config'}],
                'resources': {'limits': {'cpu': '1', 'memory': '512Mi'}},
            }],
            'volumes': [{'name': 'config', 'secret': {
                'secretName': 'fixture-config', 'items': [{'key': '3', 'path': 'config.json'}]}}],
        },
        'status': {'imageDigest': old_image, 'observedGeneration': 1,
                   'conditions': active_revision_conditions()},
    }
    target['specHash'] = stage.digest(stage.spec_without_image(revision))
    latest = copy.deepcopy(revision)
    latest['metadata']['name'] = target['latestCreated']
    latest['spec']['containers'][0]['env'][0]['value'] = 'false'
    latest['spec']['volumes'][0]['secret']['items'][0]['key'] = '9'
    latest['metadata']['annotations']['run.googleapis.com/vpc-access-connector'] = 'staged-drift'
    service_doc = {
        'apiVersion': 'serving.knative.dev/v1', 'kind': 'Service',
        'metadata': {
            'name': service, 'namespace': stage.PROJECT,
            'resourceVersion': 'opaque-original-version', 'generation': 7,
            'labels': {'cloud.googleapis.com/location': stage.REGION, 'team': 'jems'},
            'annotations': {'run.googleapis.com/ingress': 'internal',
                            'run.googleapis.com/invoker-iam-disabled': 'false',
                            'example.test/retained-policy': 'preserve'},
        },
        'spec': {'template': stage.template_from_revision(latest, old_image, target['latestCreated']),
                 'traffic': [{'revisionName': target['baseline'], 'percent': 100}]},
        'status': {'observedGeneration': 7,
                   'latestCreatedRevisionName': target['latestCreated'],
                   'latestReadyRevisionName': target['latestReady'],
                   'traffic': [{'revisionName': target['baseline'], 'percent': 100}],
                   'conditions': ready_service_conditions()},
    }
    return service_doc, revision, target


def staged_fixture():
    service, baseline, target = fixture()
    request = stage.make_stage_service(service, baseline, target)
    candidate = copy.deepcopy(baseline)
    candidate['metadata']['name'] = target['candidate']
    candidate['spec']['containers'][0]['image'] = target['image']
    candidate['status']['imageDigest'] = target['image']
    current = copy.deepcopy(request)
    current['metadata']['generation'] = 8
    current['status'] = copy.deepcopy(service['status'])
    current['status']['observedGeneration'] = 8
    current['status']['latestCreatedRevisionName'] = target['candidate']
    current['status']['latestReadyRevisionName'] = target['candidate']
    journal = {'target': target, 'baselineService': service, 'request': request}
    return current, candidate, journal


class ServingTemplateTests(unittest.TestCase):
    def test_stage_clones_serving_settings_and_only_replaces_image(self):
        service, revision, target = fixture()
        original_service = copy.deepcopy(service)
        original_revision = copy.deepcopy(revision)
        stage.validate_baseline(service, revision, target)
        request = stage.make_stage_service(service, revision, target)
        self.assertEqual(stage.spec_without_image(request['spec']['template']),
                         stage.spec_without_image(revision))
        self.assertEqual(request['spec']['template']['spec']['containers'][0]['image'], target['image'])
        annotations = request['spec']['template']['metadata']['annotations']
        self.assertEqual(annotations['run.googleapis.com/vpc-access-connector'], 'approved-connector')
        self.assertEqual(annotations['run.googleapis.com/secrets'], 'config:projects/123/secrets/config')
        self.assertEqual(annotations['example.test/retained-setting'], 'keep-this')
        self.assertNotIn('serving.knative.dev/creator', annotations)
        self.assertEqual(stage.service_envelope(request), stage.service_envelope(service))
        self.assertEqual(request['metadata']['resourceVersion'], 'opaque-original-version')
        self.assertEqual(service, original_service)
        self.assertEqual(revision, original_revision)

    def test_does_not_route_to_latest_revision(self):
        service, revision, target = fixture()
        service['spec']['traffic'] = [{'latestRevision': True, 'percent': 100}]
        request = stage.make_stage_service(service, revision, target)
        self.assertEqual(request['spec']['traffic'], [
            {'revisionName': target['baseline'], 'percent': 100}])

    def test_preserves_tagged_zero_route_and_ignores_untagged_history(self):
        service, _, target = fixture()
        tagged = {'revisionName': target['latestCreated'], 'percent': 0, 'tag': 'existing-preview'}
        service['spec']['traffic'].append(copy.deepcopy(tagged))
        service['status']['traffic'].extend([
            {**tagged, 'url': 'https://existing-preview.example.test'},
            {'revisionName': 'factory-coach-private-old', 'percent': None},
        ])
        self.assertEqual(stage.pinned_traffic(service), [
            {'revisionName': target['baseline'], 'percent': 100}, tagged])

    def test_baseline_refuses_changed_image_config_traffic_or_latest(self):
        for mutation in ('image', 'config', 'traffic', 'latest', 'cas'):
            with self.subTest(mutation=mutation):
                service, revision, target = fixture()
                if mutation == 'image':
                    revision['status']['imageDigest'] = stage.PREFIX + 'coach@sha256:' + '0' * 64
                elif mutation == 'config':
                    revision['spec']['volumes'][0]['secret']['items'][0]['key'] = '10'
                elif mutation == 'traffic':
                    service['status']['traffic'][0]['percent'] = 95
                    service['status']['traffic'].append({'revisionName': target['latestCreated'], 'percent': 5})
                elif mutation == 'latest':
                    service['status']['latestCreatedRevisionName'] = 'factory-coach-private-concurrent'
                else:
                    service['metadata'].pop('resourceVersion')
                with self.assertRaises(stage.StageError):
                    stage.validate_baseline(service, revision, target)

    def test_verifies_only_matching_candidate_and_service_policy(self):
        current, candidate, journal = staged_fixture()
        self.assertTrue(stage.verify_candidate(current, candidate, journal))
        for mutation in ('image', 'secret', 'vpc', 'policy', 'observed-traffic', 'desired-traffic'):
            with self.subTest(mutation=mutation):
                changed_service, changed_candidate = copy.deepcopy(current), copy.deepcopy(candidate)
                if mutation == 'image':
                    changed_candidate['status']['imageDigest'] = stage.PREFIX + 'coach@sha256:' + '0' * 64
                elif mutation == 'secret':
                    changed_candidate['spec']['volumes'][0]['secret']['items'][0]['key'] = '10'
                elif mutation == 'vpc':
                    changed_candidate['metadata']['annotations']['run.googleapis.com/vpc-access-connector'] = 'unreviewed'
                elif mutation == 'policy':
                    changed_service['metadata']['annotations']['run.googleapis.com/ingress'] = 'all'
                elif mutation == 'observed-traffic':
                    changed_service['status']['traffic'] = [{'revisionName': journal['target']['candidate'], 'percent': 100}]
                else:
                    changed_service['spec']['traffic'] = [{'revisionName': journal['target']['candidate'], 'percent': 100}]
                with self.assertRaises(stage.StageError):
                    stage.verify_candidate(changed_service, changed_candidate, journal)

    def test_preserves_numeric_secret_references_without_reading_payloads(self):
        service, revision, target = fixture()
        request = stage.make_stage_service(service, revision, target)
        self.assertEqual(request['spec']['template']['spec']['volumes'], revision['spec']['volumes'])
        self.assertEqual(request['spec']['template']['spec']['containers'][0]['env'],
                         revision['spec']['containers'][0]['env'])

    def test_pending_candidate_can_wait_without_an_image_digest(self):
        current, candidate, journal = staged_fixture()
        candidate['status'] = {'conditions': [{'type': 'Ready', 'status': 'Unknown'}]}
        self.assertFalse(stage.verify_candidate(current, candidate, journal))

    def test_baseline_refuses_reconciliation_in_progress(self):
        service, revision, target = fixture()
        service['status']['observedGeneration'] = 6
        with self.assertRaises(stage.StageError):
            stage.validate_baseline(service, revision, target)

    def test_active_secret_aliases_are_rejected_but_unused_volumes_are_preserved(self):
        for location in ('environment', 'mounted-volume'):
            with self.subTest(location=location):
                service, revision, target = fixture()
                if location == 'environment':
                    revision['spec']['containers'][0]['env'][2]['valueFrom']['secretKeyRef']['key'] = 'latest'
                else:
                    revision['spec']['volumes'][0]['secret']['items'][0]['key'] = 'latest'
                target['specHash'] = stage.digest(stage.spec_without_image(revision))
                with self.assertRaisesRegex(stage.StageError, 'ACTIVE_SECRET_VERSION_NOT_PINNED'):
                    stage.validate_baseline(service, revision, target)
        service, revision, target = fixture()
        revision['spec']['volumes'].append({'name': 'old-unused', 'secret': {
            'secretName': 'old-unused', 'items': [{'key': 'latest', 'path': 'unused'}]}})
        target['specHash'] = stage.digest(stage.spec_without_image(revision))
        stage.validate_baseline(service, revision, target)

    def test_server_normalized_empty_metadata_does_not_invalidate_candidate(self):
        current, candidate, journal = staged_fixture()
        for value in (current['spec']['template'], candidate, journal['request']['spec']['template']):
            value['metadata']['labels'] = {}
        current['spec']['template']['metadata'].pop('labels')
        self.assertTrue(stage.verify_candidate(current, candidate, journal))


class FakeCloud:
    """Represents eventual metadata and uncertain mutation responses, with no I/O."""
    def __init__(self, service, baseline, target):
        self.current = copy.deepcopy(service)
        self.baseline = copy.deepcopy(baseline)
        self.target = target
        self.candidate = None
        self.writes = []
        self.conflict_after_dry_run = False
        self.lose_write_response = False
        self.apply_write = True
        self.dry_run_changes_settings = False

    def iam(self, service):
        return {'version': 1, 'etag': 'fixture-policy-version', 'bindings': []}

    def cli(self, *args):
        if args[:4] == ('artifacts', 'docker', 'images', 'describe'):
            return {'image_summary': {'digest': self.target['image'].split('@')[1]}}
        raise AssertionError('Unexpected metadata CLI call')

    def request(self, kind, name, body=None, dry_run=False, missing=False):
        if kind == 'revisions':
            if name == self.target['baseline']:
                return copy.deepcopy(self.baseline)
            if name == self.target['candidate']:
                return copy.deepcopy(self.candidate)
            raise AssertionError('Unexpected revision read')
        if body is None:
            return copy.deepcopy(self.current)
        if dry_run:
            if self.conflict_after_dry_run:
                self.current['metadata']['resourceVersion'] = 'concurrent-version'
            result = copy.deepcopy(body)
            if self.dry_run_changes_settings:
                result['spec']['template']['spec']['containers'][0]['env'][0]['value'] = 'false'
            return result
        self.writes.append(copy.deepcopy(body))
        if self.lose_write_response and not self.apply_write:
            raise stage.CloudError('CLOUD_RESPONSE_UNKNOWN', uncertain=True)
        self.current = copy.deepcopy(body)
        self.current['metadata']['generation'] = 8
        self.current['metadata']['resourceVersion'] = 'after-write-version'
        self.current['status'] = {
            'observedGeneration': 8,
            'latestCreatedRevisionName': self.target['candidate'],
            'latestReadyRevisionName': self.target['candidate'],
            'traffic': copy.deepcopy(body['spec']['traffic']),
            'conditions': ready_service_conditions(),
        }
        self.candidate = copy.deepcopy(body['spec']['template'])
        self.candidate['metadata']['generation'] = 1
        self.candidate['status'] = {
            'imageDigest': self.target['image'],
            'observedGeneration': 1,
            'conditions': active_revision_conditions(),
        }
        if self.lose_write_response:
            raise stage.CloudError('CLOUD_RESPONSE_UNKNOWN', uncertain=True)
        return copy.deepcopy(self.current)


class StagingRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.service, self.baseline, self.target = fixture()
        self.name = self.service['metadata']['name']
        self.cloud = FakeCloud(self.service, self.baseline, self.target)
        self.temporary = tempfile.TemporaryDirectory()
        self.directory = Path(self.temporary.name)
        self.targets = patch.dict(stage.TARGETS, {self.name: self.target}, clear=True)
        self.targets.start()

    def tearDown(self):
        self.targets.stop()
        self.temporary.cleanup()

    def test_default_prepares_private_journal_without_put(self):
        outcome = stage.stage(self.cloud, self.directory, self.name)
        self.assertEqual(outcome['status'], 'PREPARED_NO_MUTATION')
        self.assertEqual(self.cloud.writes, [])
        path = self.directory / (self.name + '.json')
        self.assertEqual(path.stat().st_mode & 0o077, 0)

    def test_explicit_stage_preserves_original_conditional_version(self):
        outcome = stage.stage(self.cloud, self.directory, self.name, execute=True, wait_seconds=0)
        self.assertEqual(outcome['status'], 'STAGED_READY_VERIFIED')
        self.assertFalse(outcome['promoted'])
        self.assertEqual(len(self.cloud.writes), 1)
        self.assertEqual(self.cloud.writes[0]['metadata']['resourceVersion'], 'opaque-original-version')
        self.assertEqual(self.cloud.writes[0]['spec']['traffic'], [
            {'revisionName': self.target['baseline'], 'percent': 100}])

    def test_concurrent_change_stops_before_actual_put(self):
        self.cloud.conflict_after_dry_run = True
        with self.assertRaisesRegex(stage.StageError, 'CONCURRENT_SERVICE_CHANGE'):
            stage.stage(self.cloud, self.directory, self.name, execute=True, wait_seconds=0)
        self.assertEqual(self.cloud.writes, [])

    def test_lost_response_recovers_by_reads_even_with_execute_set_again(self):
        self.cloud.lose_write_response = True
        with self.assertRaisesRegex(stage.StageError, 'STAGE_UNCERTAIN'):
            stage.stage(self.cloud, self.directory, self.name, execute=True, wait_seconds=0)
        self.assertEqual(len(self.cloud.writes), 1)
        outcome = stage.stage(self.cloud, self.directory, self.name, execute=True, wait_seconds=0)
        self.assertEqual(outcome['status'], 'STAGED_READY_VERIFIED')
        self.assertEqual(len(self.cloud.writes), 1)

    def test_prepared_request_tampering_stops_before_actual_put(self):
        stage.stage(self.cloud, self.directory, self.name)
        path = self.directory / (self.name + '.json')
        journal = json.loads(path.read_text())
        journal['request']['spec']['traffic'] = [{'revisionName': self.target['candidate'], 'percent': 100}]
        stage.save_journal(path, journal)
        with self.assertRaises(stage.StageError):
            stage.stage(self.cloud, self.directory, self.name, execute=True, wait_seconds=0)
        self.assertEqual(self.cloud.writes, [])

    def test_api_dry_run_configuration_change_stops_before_actual_put(self):
        self.cloud.dry_run_changes_settings = True
        with self.assertRaises(stage.StageError):
            stage.stage(self.cloud, self.directory, self.name, execute=True, wait_seconds=0)
        self.assertEqual(self.cloud.writes, [])

    def test_uncertain_unaccepted_write_is_not_repeated(self):
        self.cloud.lose_write_response = True
        self.cloud.apply_write = False
        with self.assertRaisesRegex(stage.StageError, 'STAGE_UNCERTAIN'):
            stage.stage(self.cloud, self.directory, self.name, execute=True, wait_seconds=0)
        outcome = stage.stage(self.cloud, self.directory, self.name, execute=True, wait_seconds=0)
        self.assertEqual(outcome['status'], 'PENDING_OR_UNCERTAIN_READ_ONLY_RECOVERY')
        self.assertEqual(len(self.cloud.writes), 1)


if __name__ == '__main__':
    unittest.main()
