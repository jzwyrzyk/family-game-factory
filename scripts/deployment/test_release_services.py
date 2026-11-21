import contextlib
import copy
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import release_services as release


SOURCE, TESTED, TOOL = 'a' * 40, 'b' * 40, 'c' * 40
NONCE = '123456' * 5 + 'ab'
OLD = {key: registry + '@sha256:' + ('1' if key == 'coach' else '2') * 64
       for key, registry in release.REGISTRIES.items()}
NEW = {key: registry + '@sha256:' + ('3' if key == 'coach' else '4') * 64
       for key, registry in release.REGISTRIES.items()}


def mark(revision, active=True):
    revision['status']['conditions'] = [
        {'type': 'Ready', 'status': 'True', **({} if active else {'reason': 'Retired'})},
        {'type': 'Active', 'status': 'True' if active else 'False', **({} if active else {'reason': 'Retired'})},
        {'type': 'ResourcesAvailable', 'status': 'True' if active else 'Unknown', **({} if active else {'reason': 'Retired'})},
        {'type': 'ContainerReady', 'status': 'True'},
    ]


class FakeCloud:
    def __init__(self, path=None):
        self.services, self.revisions, self.policies = {}, {}, {}
        self.writes, self.validations = [], []
        self.path = path
        self.fail_after = self.fail_before = self.drift = None
        self.health_value = {'ready': True, 'paidExecution': True}
        for key, name in release.SERVICES.items():
            baseline = name + '-baseline'
            spec = {'serviceAccountName': 'factory-' + key + '@' + release.PROJECT + '.iam.gserviceaccount.com',
                    'containerConcurrency': 7, 'timeoutSeconds': 333,
                    'containers': [{'image': OLD[key],
                        'env': [{'name': 'PRESERVE_APPROVAL', 'value': 'true'},
                                {'name': 'API_KEY' if key == 'coach' else 'SESSION_KEY',
                                 'valueFrom': {'secretKeyRef': {'name': 'key-alias', 'key': '9'}}}],
                        'resources': {'limits': {'memory': '768Mi', 'cpu': '1'}},
                        'volumeMounts': [{'name': 'private', 'mountPath': '/var/run/factory-config'}]}],
                    'volumes': [{'name': 'private', 'secret': {'secretName': 'private-alias',
                                 'items': [{'key': '8', 'path': 'config.json'}]}}]}
            revision = {'metadata': {'name': baseline, 'generation': 1,
                        'annotations': {'run.googleapis.com/cpu-throttling': 'true',
                                        'run.googleapis.com/secrets': 'key-alias:projects/test/secrets/private-key',
                                        'custom-preserved': 'yes'},
                        'labels': {'trusted': 'preserve'}}, 'spec': spec,
                        'status': {'observedGeneration': 1, 'imageDigest': OLD[key]}}
            mark(revision)
            traffic = [{'revisionName': baseline, 'percent': 100},
                       {'revisionName': baseline, 'percent': 0, 'tag': 'keep-tag'}]
            self.services[key] = {'metadata': {'name': name, 'namespace': release.PROJECT,
                    'resourceVersion': '10', 'generation': 1,
                    'annotations': {'run.googleapis.com/ingress': 'internal' if key == 'coach' else 'all'},
                    'labels': {'keep': 'yes'}},
                'spec': {'template': copy.deepcopy(revision), 'traffic': traffic},
                'status': {'url': 'https://' + name + '-example.run.app', 'observedGeneration': 1,
                    'latestCreatedRevisionName': baseline, 'latestReadyRevisionName': baseline,
                    'traffic': copy.deepcopy(traffic), 'conditions': [{'type': 'Ready', 'status': 'True'}]}}
            self.services[key]['spec']['template'].pop('status')
            self.revisions[baseline] = revision
            self.policies[key] = {'etag': 'keep-' + key, 'bindings': [{'role': 'roles/run.invoker',
                'members': ['serviceAccount:gateway@example.test'] if key == 'coach' else ['allUsers']}]}

    def iam(self, key):
        return copy.deepcopy(self.policies[key])

    def health(self):
        return copy.deepcopy(self.health_value)

    def resource(self, kind, name, body=None, validate=False, missing=False):
        if kind == 'revisions':
            if name not in self.revisions and not missing:
                raise release.Stop('MISSING_REVISION')
            return copy.deepcopy(self.revisions.get(name))
        key = next(key for key, value in release.SERVICES.items() if value == name)
        service = self.services[key]
        if body is None:
            return copy.deepcopy(service)
        if validate:
            self.validations.append((key, copy.deepcopy(body)))
            proposed = copy.deepcopy(body)
            proposed['status'] = copy.deepcopy(service['status'])
            proposed['spec']['template']['metadata'].setdefault('annotations', {})['serving.knative.dev/creator'] = 'system'
            if self.drift:
                self.drift(self)
                self.drift = None
            return proposed
        candidate = body['spec']['template']['metadata']['name']
        serving = next(row['revisionName'] for row in body['spec']['traffic'] if row['percent'] == 100)
        phase = 'stage' if candidate not in self.revisions else 'promotion' if serving == candidate else 'rollback'
        if self.path:
            saved = json.loads(self.path.read_text())
            assert saved['services'][key][phase]['phase'] == 'attempted', 'journal must precede remote write'
        self.writes.append((key, phase, copy.deepcopy(body)))
        if self.fail_before == (key, phase):
            self.fail_before = None
            raise release.Stop('LOST_BEFORE_APPLY')
        if body['metadata']['resourceVersion'] != service['metadata']['resourceVersion']:
            raise release.Stop('CAS_CONFLICT')
        service['metadata']['resourceVersion'] = str(int(service['metadata']['resourceVersion']) + 1)
        service['metadata']['generation'] += 1
        service['spec'] = copy.deepcopy(body['spec'])
        service['status']['observedGeneration'] = service['metadata']['generation']
        if phase == 'stage':
            revision = copy.deepcopy(body['spec']['template'])
            revision['metadata']['generation'] = 1
            revision['status'] = {'imageDigest': NEW[key], 'observedGeneration': 1}
            self.revisions[candidate] = revision
        for revision_name, revision in self.revisions.items():
            if revision_name.startswith(name + '-'):
                mark(revision, revision_name == serving)
        service['status']['latestCreatedRevisionName'] = candidate
        service['status']['traffic'] = copy.deepcopy(body['spec']['traffic'])
        if serving == candidate:
            service['status']['latestReadyRevisionName'] = candidate
        if self.fail_after == (key, phase):
            self.fail_after = None
            raise release.Stop('LOST_AFTER_APPLY')
        return copy.deepcopy(service)


class CoordinatedReleaseTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / 'release.json'
        self.cloud = FakeCloud(self.path)
        self.state = {'source': SOURCE, 'tested': TESTED, 'tool': TOOL, 'nonce': NONCE,
            'bucket': f'{release.PROJECT}-service-builds-{release.REGION}', 'binding': {'safe': True}, 'health': self.cloud.health(),
            'services': {key: {'baseline': release.snapshot(self.cloud, key),
                         'candidate': name + '-pr115-' + SOURCE[:12] + '-123456'}
                         for key, name in release.SERVICES.items()},
            'build': {'phase': 'verified', 'archive': 'a' * 64, 'images': copy.deepcopy(NEW),
                      'id': '12345678-1234-1234-1234-123456789abc',
                      'resolvedSource': {'bucket': f'{release.PROJECT}-service-builds-{release.REGION}',
                                         'object': 'source/' + NONCE + '/archive.tgz', 'generation': '123'},
                      'config': release.build_config(SOURCE, 'a' * 64, NONCE)}}
        for target, value in [('assert_source_current', SOURCE), ('verify_binding', None)]:
            mock = patch.object(release, target, return_value=value)
            mock.start()
            self.addCleanup(mock.stop)
        sleep = patch.object(release.time, 'sleep')
        sleep.start()
        self.addCleanup(sleep.stop)

    def stage(self):
        for key in release.ORDER:
            release.transition(Path('.'), self.cloud, self.state, self.path, key)

    def promote(self):
        self.stage()
        for key in release.ORDER:
            release.transition(Path('.'), self.cloud, self.state, self.path, key, True)

    def test_full_stage_promote_preserves_exact_settings_iam_tags_and_order(self):
        self.promote()
        self.assertEqual([(key, phase) for key, phase, _ in self.cloud.writes],
                         [('coach', 'stage'), ('gateway', 'stage'), ('coach', 'promotion'), ('gateway', 'promotion')])
        for key in release.ORDER:
            current = self.cloud.services[key]
            baseline = self.state['services'][key]['baseline']
            expected = copy.deepcopy(baseline['revision']['spec'])
            expected['containers'][0]['image'] = NEW[key]
            self.assertEqual(current['spec']['template']['spec'], expected)
            self.assertEqual(release.annotations(current['spec']['template']['metadata']),
                             release.annotations(baseline['revision']['metadata']))
            self.assertEqual(self.cloud.iam(key), baseline['iam'])
            self.assertIn({'revisionName': baseline['revision']['metadata']['name'], 'percent': 0, 'tag': 'keep-tag'},
                          current['spec']['traffic'])
            self.assertTrue(release.observe(self.cloud, self.state, key, True))

    def test_both_stages_required_and_gateway_cannot_promote_before_coach(self):
        release.transition(Path('.'), self.cloud, self.state, self.path, 'coach')
        with self.assertRaisesRegex(release.Stop, 'BOTH_STAGES_REQUIRED'):
            release.transition(Path('.'), self.cloud, self.state, self.path, 'coach', True)
        release.transition(Path('.'), self.cloud, self.state, self.path, 'gateway')
        with self.assertRaisesRegex(release.Stop, 'COACH_MUST_PROMOTE_FIRST'):
            release.transition(Path('.'), self.cloud, self.state, self.path, 'gateway', True)
        self.assertEqual(len(self.cloud.writes), 2)

    def test_baseline_rejects_unpinned_secrets_split_traffic_or_unrelated_template(self):
        for key in release.ORDER:
            for change in ('secret', 'split', 'template', 'unobserved', 'staged'):
                cloud = FakeCloud()
                baseline = cloud.revisions[release.SERVICES[key] + '-baseline']
                if change == 'secret':
                    baseline['spec']['containers'][0]['env'][1]['valueFrom']['secretKeyRef']['key'] = 'latest'
                if change == 'split':
                    cloud.services[key]['spec']['traffic'][0]['percent'] = 90
                if change == 'template':
                    cloud.services[key]['spec']['template']['spec']['timeoutSeconds'] = 10
                if change == 'unobserved':
                    baseline['status']['observedGeneration'] = 0
                if change == 'staged':
                    cloud.services[key]['status']['latestCreatedRevisionName'] += '-unrelated'
                with self.subTest(key=key, change=change), self.assertRaises(release.Stop):
                    release.snapshot(cloud, key)
                self.assertEqual(cloud.writes, [])

    def test_stage_lost_response_recovers_without_repeating_write(self):
        self.cloud.fail_after = ('coach', 'stage')
        with self.assertRaisesRegex(release.Stop, 'LOST_AFTER'):
            release.transition(Path('.'), self.cloud, self.state, self.path, 'coach')
        self.assertEqual(json.loads(self.path.read_text())['services']['coach']['stage']['phase'], 'attempted')
        release.transition(Path('.'), self.cloud, self.state, self.path, 'coach')
        self.assertEqual(len(self.cloud.writes), 1)
        self.assertEqual(self.state['services']['coach']['stage']['phase'], 'verified')

    def test_unapplied_stage_is_never_replayed_and_can_be_abandoned_by_rollback(self):
        self.cloud.fail_before = ('coach', 'stage')
        with self.assertRaises(release.Stop):
            release.transition(Path('.'), self.cloud, self.state, self.path, 'coach')
        with self.assertRaisesRegex(release.Stop, 'CANDIDATE_CONFIGURATION_CHANGED'):
            release.transition(Path('.'), self.cloud, self.state, self.path, 'coach')
        self.assertEqual(len(self.cloud.writes), 1)
        with contextlib.redirect_stdout(io.StringIO()):
            release.rollback(self.cloud, self.state, self.path)
        self.assertTrue(self.state['rollbackRequested'])
        self.assertEqual(len(self.cloud.writes), 1)

    def test_promotion_lost_response_recovers_by_reads(self):
        self.stage()
        self.cloud.fail_after = ('coach', 'promotion')
        with self.assertRaisesRegex(release.Stop, 'LOST_AFTER'):
            release.transition(Path('.'), self.cloud, self.state, self.path, 'coach', True)
        release.transition(Path('.'), self.cloud, self.state, self.path, 'coach', True)
        self.assertEqual(len(self.cloud.writes), 3)
        release.transition(Path('.'), self.cloud, self.state, self.path, 'gateway', True)
        self.assertEqual(len(self.cloud.writes), 4)

    def test_unapplied_promotion_remains_pending_without_repeated_write(self):
        self.stage()
        self.cloud.fail_before = ('coach', 'promotion')
        with self.assertRaises(release.Stop):
            release.transition(Path('.'), self.cloud, self.state, self.path, 'coach', True)
        with contextlib.redirect_stdout(io.StringIO()), self.assertRaisesRegex(release.Stop, 'TRANSITION_PENDING'):
            release.transition(Path('.'), self.cloud, self.state, self.path, 'coach', True)
        self.assertEqual(len(self.cloud.writes), 3)

    def test_peer_iam_drift_blocks_gateway_staging(self):
        release.transition(Path('.'), self.cloud, self.state, self.path, 'coach')
        self.cloud.policies['coach']['bindings'] = []
        with self.assertRaisesRegex(release.Stop, 'IAM_CHANGED_coach'):
            release.transition(Path('.'), self.cloud, self.state, self.path, 'gateway')
        self.assertEqual(len(self.cloud.writes), 1)

    def test_race_after_dry_run_blocks_real_put(self):
        self.cloud.drift = lambda cloud: cloud.services['coach']['metadata'].update(resourceVersion='99')
        with self.assertRaisesRegex(release.Stop, 'CONCURRENT_SERVICE_CHANGE'):
            release.transition(Path('.'), self.cloud, self.state, self.path, 'coach')
        self.assertEqual(self.cloud.writes, [])

    def test_peer_config_drift_after_validation_blocks_cross_service_write(self):
        release.transition(Path('.'), self.cloud, self.state, self.path, 'coach')
        self.cloud.drift = lambda cloud: cloud.services['coach']['spec']['template']['spec'].update(timeoutSeconds=999)
        with self.assertRaisesRegex(release.Stop, 'CANDIDATE_CONFIGURATION_CHANGED_coach'):
            release.transition(Path('.'), self.cloud, self.state, self.path, 'gateway')
        self.assertEqual(len(self.cloud.writes), 1)

    def test_new_service_source_blocks_next_write(self):
        with patch.object(release, 'assert_source_current', side_effect=release.Stop('NEWER_SERVICE_SOURCE')):
            with self.assertRaisesRegex(release.Stop, 'NEWER_SERVICE_SOURCE'):
                release.transition(Path('.'), self.cloud, self.state, self.path, 'coach')
        self.assertEqual(self.cloud.writes, [])

    def test_retired_stage_is_not_active_acceptance(self):
        self.stage()
        self.assertTrue(release.observe(self.cloud, self.state, 'coach'))
        self.assertFalse(release.observe(self.cloud, self.state, 'coach', True))
        candidate = self.cloud.revisions[self.state['services']['coach']['candidate']]
        candidate['status']['observedGeneration'] = 0
        self.assertFalse(release.observe(self.cloud, self.state, 'coach'))

    def test_wrong_candidate_image_or_configuration_cannot_pass(self):
        self.stage()
        candidate = self.cloud.revisions[self.state['services']['coach']['candidate']]
        candidate['spec']['containers'][0]['env'][0]['value'] = 'false'
        with self.assertRaisesRegex(release.Stop, 'CANDIDATE_REVISION_CHANGED'):
            release.observe(self.cloud, self.state, 'coach')

    def test_rollback_is_gateway_then_coach_traffic_only_and_needs_no_ci(self):
        self.promote()
        templates = {key: copy.deepcopy(self.cloud.services[key]['spec']['template']) for key in release.ORDER}
        with (patch.object(release, 'assert_source_current', side_effect=AssertionError('no CI in rollback')),
              contextlib.redirect_stdout(io.StringIO())):
            release.rollback(self.cloud, self.state, self.path)
        self.assertEqual([(key, phase) for key, phase, _ in self.cloud.writes[-2:]],
                         [('gateway', 'rollback'), ('coach', 'rollback')])
        for key in release.ORDER:
            self.assertEqual(self.cloud.services[key]['spec']['template'], templates[key])
            self.assertEqual(release.routes(self.cloud.services[key], service_name=release.SERVICES[key]),
                             self.state['services'][key]['baseline']['traffic'])
        self.assertTrue(self.state['rollbackRequested'])

    def test_lost_gateway_rollback_response_does_not_restore_coach_early_or_repeat_put(self):
        self.promote()
        self.cloud.fail_after = ('gateway', 'rollback')
        with self.assertRaisesRegex(release.Stop, 'LOST_AFTER'):
            release.rollback(self.cloud, self.state, self.path)
        self.assertNotIn('rollback', self.state['services']['coach'])
        with contextlib.redirect_stdout(io.StringIO()):
            release.rollback(self.cloud, self.state, self.path)
        self.assertEqual([(key, phase) for key, phase, _ in self.cloud.writes[-2:]],
                         [('gateway', 'rollback'), ('coach', 'rollback')])

    def test_newer_gateway_release_prevents_both_rollbacks(self):
        self.promote()
        self.cloud.services['gateway']['status']['latestCreatedRevisionName'] += '-newer'
        with self.assertRaisesRegex(release.Stop, 'LATEST_CANDIDATE_CHANGED_gateway'):
            release.rollback(self.cloud, self.state, self.path)
        self.assertEqual(len(self.cloud.writes), 4)

    def test_build_contains_only_two_selected_images_and_correct_packaged_entrypoints(self):
        config = self.state['build']['config']
        self.assertEqual(config['images'], [release.REGISTRIES[key] + ':' + SOURCE for key in release.ORDER])
        self.assertEqual(len(config['steps']), 4)
        coach_load, gateway_load = config['steps'][1]['args'], config['steps'][3]['args']
        self.assertIn('--network', coach_load)
        self.assertIn('none', coach_load)
        self.assertIn('private-executor.mjs', coach_load[-1])
        self.assertNotIn('tsx', coach_load)
        self.assertIn('tsx', gateway_load)
        self.assertIn('server/gateway.ts', gateway_load[-1])
        self.assertIn('NON_ROOT_REQUIRED', gateway_load[-1])
        self.assertNotIn('preview', json.dumps(config))
        actual = copy.deepcopy(config)
        actual['steps'][0]['env'] = ['UNEXPECTED=1']
        with self.assertRaisesRegex(release.Stop, 'BUILD_STEPS_DIFFER'):
            release.verify_build_shape(actual, config)

    def build_result(self):
        result = copy.deepcopy(self.state['build']['config'])
        result.update({'id': '12345678-1234-1234-1234-123456789abc', 'status': 'SUCCESS',
            'source': {'storageSource': {'bucket': self.state['bucket'], 'object': 'source/' + NONCE + '/archive.tgz'}},
            'sourceProvenance': {'resolvedStorageSource': {'bucket': self.state['bucket'],
                                 'object': 'source/' + NONCE + '/archive.tgz', 'generation': '123'}},
            'results': {'images': [{'name': release.REGISTRIES[key] + ':' + SOURCE,
                                   'digest': NEW[key].split('@')[1]} for key in release.ORDER]}})
        return result

    def test_unknown_build_response_recovers_unique_exact_nonce_without_submit(self):
        self.state['build']['phase'] = 'attempted'
        result = self.build_result()
        calls = []
        def cloud(*args):
            calls.append(args)
            if args[:2] == ('builds', 'list'):
                return [result]
            if args[:2] == ('builds', 'describe'):
                return result
            if args[:4] == ('artifacts', 'docker', 'images', 'describe'):
                return {'image_summary': {'digest': args[4].split('@')[1]}}
            raise AssertionError(args)
        with patch.object(release.publisher, 'cloud', side_effect=cloud):
            release.publish(Path('.'), Path('.'), self.cloud, self.state, self.path)
        self.assertFalse(any(call[:2] == ('builds', 'submit') for call in calls))
        self.assertEqual(self.state['build']['images'], NEW)
        self.assertEqual(self.state['build']['resolvedSource']['generation'], '123')

    def test_missing_or_ambiguous_build_is_not_resubmitted(self):
        self.state['build']['phase'] = 'attempted'
        self.state['build'].pop('id')
        for matches in ([], [self.build_result(), self.build_result()]):
            with patch.object(release.publisher, 'cloud', return_value=matches) as call:
                with self.assertRaisesRegex(release.Stop, 'UNCERTAIN_NO_RESUBMISSION'):
                    release.publish(Path('.'), Path('.'), self.cloud, self.state, self.path)
                self.assertEqual(call.call_count, 1)

    def test_source_provenance_must_match_nonce_bucket_and_pinned_generation(self):
        for mutation in ('bucket', 'object', 'generation'):
            result = self.build_result()
            if mutation == 'bucket':
                result['source']['storageSource']['bucket'] = 'other'
            elif mutation == 'object':
                result['source']['storageSource']['object'] = 'source/old-release/source.tgz'
            else:
                result['source']['storageSource']['generation'] = '999'
            with self.subTest(mutation=mutation), self.assertRaises(release.Stop):
                release.verify_build_source(result, self.state)

    def test_budget_failure_prints_only_sanitized_proof_and_cannot_build(self):
        proof = {'sourceSha': SOURCE, 'revision': release.COACH + '-baseline', 'arithmeticPass': False,
                 'stopReasons': ['FIXED_RESERVATION_EXCEEDS_UNCHANGED_TURN_CAP'], 'limits': {'maxTurnMicroUsd': 1}}
        result = subprocess.CompletedProcess([], 2, json.dumps(proof), 'DO_NOT_PRINT_RAW_STDERR')
        output = io.StringIO()
        with (patch.object(release, 'application_checkout'), patch.object(release.subprocess, 'run', return_value=result),
              patch.object(release.publisher, 'cloud') as cloud, contextlib.redirect_stdout(output)):
            with self.assertRaisesRegex(release.Stop, 'UNCHANGED_CONFIGURATION_CANNOT_SERVE'):
                release.budget_preflight(Path('.'), Path('.'), SOURCE, self.state['services']['coach']['baseline']['revision'])
        cloud.assert_not_called()
        self.assertNotIn('DO_NOT_PRINT_RAW_STDERR', output.getvalue())
        self.assertIn('maxTurnMicroUsd', output.getvalue())

    def test_private_journal_written_with_owner_only_permissions(self):
        release.save(self.path, self.state)
        self.assertEqual(self.path.stat().st_mode & 0o077, 0)

    def run_existing(self, restore=False):
        release.save(self.path, self.state)
        calls = []
        def cloud(*args):
            calls.append(args)
            if args[:2] == ('projects', 'describe'):
                return {'projectNumber': release.NUMBER}
            if args[:2] == ('builds', 'describe'):
                return self.build_result()
            if args[:4] == ('artifacts', 'docker', 'images', 'describe'):
                return {'image_summary': {'digest': args[4].split('@')[1]}}
            raise AssertionError(args)
        output = io.StringIO()
        proof = {'source': SOURCE, 'tested': TESTED, 'tool': TOOL}
        with (patch.object(release, 'verify_source', return_value=proof),
              patch.object(release, 'local_source', return_value=proof),
              patch.object(release, 'Cloud', return_value=self.cloud),
              patch.object(release, 'application_checkout'),
              patch.object(release, 'budget_preflight', return_value={'arithmeticPass': True}),
              patch.object(release.publisher, 'source_archive', return_value=(Path(self.tmp.name) / 'archive', 'a' * 64)),
              patch.object(release.publisher, 'cloud', side_effect=cloud),
              contextlib.redirect_stdout(output)):
            release.run(Path('.'), Path('.'), Path(self.tmp.name), SOURCE, TESTED, execute=not restore, restore=restore)
        self.state = json.loads(self.path.read_text())
        return calls, output.getvalue()

    def test_full_run_resumes_unknown_gateway_promotion_without_replaying_either_service(self):
        self.stage()
        release.transition(Path('.'), self.cloud, self.state, self.path, 'coach', True)
        self.cloud.fail_after = ('gateway', 'promotion')
        with self.assertRaisesRegex(release.Stop, 'LOST_AFTER'):
            release.transition(Path('.'), self.cloud, self.state, self.path, 'gateway', True)
        self.assertEqual(len(self.cloud.writes), 4)
        calls, output = self.run_existing()
        self.assertEqual(len(self.cloud.writes), 4)
        self.assertTrue(any(call[:2] == ('builds', 'describe') for call in calls))
        receipt = json.loads(output.strip().splitlines()[-1])
        self.assertEqual(receipt['status'], 'PR115_BACKENDS_SERVING_CONTEXT_CHECK_REQUIRED')
        self.assertFalse(receipt['pagesDispatched'])
        self.assertFalse(receipt['conversationVerified'])
        self.assertEqual(self.state['services']['gateway']['promotion']['phase'], 'verified')

    def test_completed_release_rechecks_build_and_services_without_mutations(self):
        self.promote()
        calls, _ = self.run_existing()
        self.assertEqual(len(self.cloud.writes), 4)
        self.assertTrue(any(call[:2] == ('builds', 'describe') for call in calls))
        self.assertFalse(any(call[:2] == ('builds', 'submit') for call in calls))

    def test_edited_verified_image_cannot_stage_a_different_build(self):
        self.state['build']['images']['coach'] = release.REGISTRIES['coach'] + '@sha256:' + '9' * 64
        with self.assertRaisesRegex(release.Stop, 'RECORDED_BUILD_DIGEST_CHANGED'):
            self.run_existing()
        self.assertEqual(self.cloud.writes, [])

    def test_changed_journal_config_candidate_and_recorded_request_are_rejected(self):
        for field in ('config', 'candidate'):
            state = copy.deepcopy(self.state)
            if field == 'config':
                state['build']['config']['steps'][0]['args'][0] = 'unreviewed'
            else:
                state['services']['coach']['candidate'] += '-other'
            with self.subTest(field=field), self.assertRaisesRegex(release.Stop, 'JOURNAL_'):
                release.validate_journal(state)
        self.stage()
        self.state['services']['coach']['stage']['request']['spec']['template']['spec']['timeoutSeconds'] = 12
        with self.assertRaisesRegex(release.Stop, 'JOURNAL_RECORDED_REQUEST_DIFFERS'):
            release.validate_journal(self.state)

    def test_prior_build_receipt_cannot_be_relabelled_prepared_or_attempted(self):
        for phase in ('prepared', 'attempted'):
            state = copy.deepcopy(self.state)
            state['build']['phase'] = phase
            with self.subTest(phase=phase), self.assertRaisesRegex(release.Stop, 'JOURNAL_'):
                release.validate_journal(state)

    def test_rolled_back_release_cannot_automatically_promote(self):
        self.promote()
        with contextlib.redirect_stdout(io.StringIO()):
            release.rollback(self.cloud, self.state, self.path)
        with self.assertRaisesRegex(release.Stop, 'NO_AUTOMATIC_REPROMOTION'):
            self.run_existing()
        self.assertEqual(len(self.cloud.writes), 6)

    def test_top_level_build_pool_environment_substitutions_and_extra_artifacts_are_rejected(self):
        for field in ('pool', 'env', 'substitutions', 'artifacts', 'timeout', 'unknown'):
            actual = self.build_result()
            if field in ('pool', 'env'):
                actual['options'][field] = {'name': 'unreviewed'} if field == 'pool' else ['NEW=1']
            elif field == 'timeout':
                actual[field] = '7200s'
            elif field == 'unknown':
                actual['automapSubstitutions'] = True
            else:
                actual[field] = {'extra': 'unreviewed'}
            with self.subTest(field=field), self.assertRaises(release.Stop):
                release.verify_build_shape(actual, self.state['build']['config'])

    def test_only_documented_output_worker_release_and_empty_pool_are_normalized(self):
        actual = self.build_result()
        actual['options']['resolvedWorkerRelease'] = 'output-only'
        actual['options']['pool'] = {'workerRelease': 'output-only', 'resolvedWorkerRelease': 'output-only'}
        actual['approval'] = {'state': 'APPROVED', 'config': {'approvalRequired': True}}
        release.verify_build_shape(actual, self.state['build']['config'])
        actual['options']['workerRelease'] = 'chosen-unreviewed-release'
        with self.assertRaisesRegex(release.Stop, 'BUILD_EXECUTION_OPTIONS_DIFFER'):
            release.verify_build_shape(actual, self.state['build']['config'])


class SourceGateTests(unittest.TestCase):
    def test_tree_equality_is_required_independently_of_ci(self):
        def command(args, root=None):
            if args[:2] == ['git', 'status']:
                return ''
            if args[-1] == SOURCE + '^{tree}':
                return '1' * 40
            if args[-1] == TESTED + '^{tree}':
                return '2' * 40
            return TOOL
        with patch.object(release, 'command', side_effect=command), self.assertRaisesRegex(release.Stop, 'TESTED_TREE_DIFFERS'):
            release.local_source(Path('.'), SOURCE, TESTED)

    def test_only_exact_source_real_successful_checks_allow_release(self):
        checks = [{'id': index, 'name': name, 'head_sha': TESTED, 'app': {'id': 15368},
                   'status': 'completed', 'conclusion': 'success'} for index, name in enumerate(release.CHECKS)]
        def gh(path):
            return {'total_count': len(checks), 'check_runs': checks}
        with (patch.object(release, 'local_source', return_value={'source': SOURCE, 'tested': TESTED, 'tool': TOOL}),
              patch.object(release, 'command', return_value=json.dumps({'id': 1458033181, 'owner': {'id': 356692244}})),
              patch.object(release, 'assert_source_current', return_value=SOURCE), patch.object(release, 'gh', side_effect=gh)):
            self.assertEqual(release.verify_source(Path('.'), SOURCE, TESTED)['main'], SOURCE)
            checks[0]['conclusion'] = 'failure'
            with self.assertRaisesRegex(release.Stop, 'CI_NOT_SUCCESSFUL'):
                release.verify_source(Path('.'), SOURCE, TESTED)
            checks[0]['conclusion'] = 'success'
            checks[0]['head_sha'] = 'd' * 40
            with self.assertRaisesRegex(release.Stop, 'CHECK_SOURCE_DIFFERS'):
                release.verify_source(Path('.'), SOURCE, TESTED)

    def test_out_of_scope_resource_rejected_before_credentials(self):
        with patch.object(release, 'command', side_effect=AssertionError('must not authenticate')):
            with self.assertRaisesRegex(release.Stop, 'RESOURCE_OUT_OF_SCOPE'):
                release.Cloud().resource('services', 'factory-preview', {})


if __name__ == '__main__':
    unittest.main()
