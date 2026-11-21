import contextlib
import copy
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import release_gateway as release


SOURCE = 'a' * 40
TESTED = 'b' * 40
BASELINE = release.SERVICE + '-baseline'
CANDIDATE = release.SERVICE + '-repair-' + SOURCE[:12] + '-123456'
OLD_IMAGE = release.REGISTRY + '@sha256:' + '1' * 64
NEW_IMAGE = release.REGISTRY + '@sha256:' + '2' * 64
ASSERT_SOURCE_CURRENT = release.assert_source_current


def mark(revision, active=True):
    revision['status']['conditions'] = [
        {'type': 'Ready', 'status': 'True', **({} if active else {'reason': 'Retired'})},
        {'type': 'Active', 'status': 'True' if active else 'False', **({} if active else {'reason': 'Retired'})},
        {'type': 'ResourcesAvailable', 'status': 'True' if active else 'Unknown', **({} if active else {'reason': 'Retired'})},
        {'type': 'ContainerReady', 'status': 'True'},
    ]


class FakeCloud:
    def __init__(self):
        spec = {'serviceAccountName': 'factory-gateway@' + release.PROJECT + '.iam.gserviceaccount.com',
                'containerConcurrency': 80, 'timeoutSeconds': 300,
                'containers': [{'image': OLD_IMAGE, 'env': [{'name': 'FACTORY_PRIVATE_CONFIG', 'value': '/var/run/factory-config/config.json'}],
                    'resources': {'limits': {'memory': '512Mi', 'cpu': '1'}},
                    'volumeMounts': [{'name': 'private', 'mountPath': '/var/run/factory-config'}]}],
                'volumes': [{'name': 'private', 'secret': {'secretName': 'factory-gateway-private-config',
                             'items': [{'key': '9', 'path': 'config.json'}]}}]}
        revision = {'metadata': {'name': BASELINE, 'generation': 1,
                    'annotations': {'run.googleapis.com/cpu-throttling': 'true'},
                    'labels': {'trusted': 'preserve'}}, 'spec': spec,
                    'status': {'observedGeneration': 1, 'imageDigest': OLD_IMAGE}}
        mark(revision)
        traffic = [{'revisionName': BASELINE, 'percent': 100}]
        self.service = {'metadata': {'name': release.SERVICE, 'namespace': release.PROJECT,
                         'resourceVersion': '10', 'generation': 1,
                         'annotations': {'run.googleapis.com/ingress': 'all'}, 'labels': {'keep': 'yes'}},
                        'spec': {'template': copy.deepcopy(revision), 'traffic': traffic},
                        'status': {'observedGeneration': 1, 'latestCreatedRevisionName': BASELINE,
                                   'latestReadyRevisionName': BASELINE, 'traffic': copy.deepcopy(traffic),
                                   'conditions': [{'type': 'Ready', 'status': 'True'}]}}
        self.service['spec']['template'].pop('status')
        self.revisions = {BASELINE: revision}
        self.policy = {'etag': 'original', 'bindings': [{'role': 'roles/run.invoker', 'members': ['allUsers']}]}
        self.writes = []
        self.validations = []
        self.fail_after = None
        self.fail_before = None
        self.concurrent_after_validation = False
        self.peer = {'service': release.COACH, 'revision': release.COACH + '-reviewed',
                     'source': release.COACH_SOURCE, 'image': release.COACH_IMAGE,
                     'origin': 'https://factory-coach-private-example.run.app', 'gatewayConfigVersion': '9'}

    def iam(self):
        return copy.deepcopy(self.policy)

    def health(self):
        return {'ready': True, 'paidExecution': True}

    def compatible_coach(self, gateway):
        return copy.deepcopy(self.peer)

    def resource(self, kind, name, body=None, validate=False, missing=False):
        if kind == 'revisions':
            if name not in self.revisions and not missing:
                raise release.Stop('MISSING_REVISION')
            return copy.deepcopy(self.revisions.get(name))
        if body is None:
            return copy.deepcopy(self.service)
        if validate:
            self.validations.append(copy.deepcopy(body))
            proposed = copy.deepcopy(body)
            proposed['status'] = copy.deepcopy(self.service['status'])
            # Simulate harmless server-added output metadata on the template.
            proposed['spec']['template']['metadata'].setdefault('annotations', {})['serving.knative.dev/creator'] = 'system'
            if self.concurrent_after_validation:
                self.service['metadata']['resourceVersion'] = '999'
            return proposed
        phase = 'stage' if name == release.SERVICE and body['spec']['template']['metadata']['name'] not in self.revisions else 'traffic'
        self.writes.append(copy.deepcopy(body))
        if self.fail_before == phase:
            self.fail_before = None
            raise release.Stop('RESPONSE_LOST_BEFORE_APPLY')
        if body['metadata']['resourceVersion'] != self.service['metadata']['resourceVersion']:
            raise release.Stop('CAS_CONFLICT')
        self.service['metadata']['resourceVersion'] = str(int(self.service['metadata']['resourceVersion']) + 1)
        self.service['metadata']['generation'] += 1
        self.service['spec'] = copy.deepcopy(body['spec'])
        self.service['status']['observedGeneration'] = self.service['metadata']['generation']
        target = body['spec']['template']['metadata']['name']
        if phase == 'stage':
            candidate = copy.deepcopy(body['spec']['template'])
            candidate['metadata']['generation'] = 1
            candidate['status'] = {'imageDigest': NEW_IMAGE, 'observedGeneration': 1}
            mark(candidate, active=False)
            self.revisions[target] = candidate
        self.service['status']['latestCreatedRevisionName'] = target
        self.service['status']['traffic'] = copy.deepcopy(body['spec']['traffic'])
        serving = next(x['revisionName'] for x in body['spec']['traffic'] if x['percent'] == 100)
        for key, revision in self.revisions.items():
            mark(revision, active=key == serving)
        if serving == target:
            self.service['status']['latestReadyRevisionName'] = target
        if self.fail_after == phase:
            self.fail_after = None
            raise release.Stop('RESPONSE_LOST_AFTER_APPLY')
        return copy.deepcopy(self.service)


class GatewayReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.fresh_source = patch.object(release, 'assert_source_current', return_value=SOURCE)
        self.fresh_source.start()
        self.addCleanup(self.fresh_source.stop)
        self.path = Path(self.temporary.name) / 'release.json'
        self.cloud = FakeCloud()
        self.state = {'source': SOURCE, 'tested': TESTED, 'tool': 'c' * 40,
                      'candidate': CANDIDATE, 'baseline': release.snapshot(self.cloud),
                      'coach': self.cloud.compatible_coach(self.cloud.service),
                      'build': {'image': NEW_IMAGE}}

    def test_baseline_rejects_latest_template_secret_drift_without_writes(self):
        self.cloud.service['spec']['template']['spec']['volumes'][0]['secret']['items'][0]['key'] = '10'
        with self.assertRaisesRegex(release.Stop, 'TEMPLATE_DIFFERS'):
            release.snapshot(self.cloud)
        self.assertEqual(self.cloud.writes, [])

    def test_baseline_rejects_mutable_image(self):
        self.cloud.revisions[BASELINE]['spec']['containers'][0]['image'] = release.REGISTRY + ':latest'
        with self.assertRaisesRegex(release.Stop, 'IMMUTABLE'):
            release.snapshot(self.cloud)

    def test_unpinned_mounted_and_environment_secrets_are_rejected(self):
        for kind in ('volume', 'env', 'empty-volume'):
            with self.subTest(kind=kind):
                cloud = FakeCloud()
                for target in (cloud.revisions[BASELINE], cloud.service['spec']['template']):
                    if kind == 'env':
                        target['spec']['containers'][0]['env'].append({'name': 'KEY', 'valueFrom': {
                            'secretKeyRef': {'name': 'credential', 'key': 'latest'}}})
                    elif kind == 'empty-volume':
                        target['spec']['volumes'][0]['secret']['items'] = []
                    else:
                        target['spec']['volumes'][0]['secret']['items'][0]['key'] = 'latest'
                with self.assertRaisesRegex(release.Stop, 'ACTIVE_SECRET_VERSION_NOT_PINNED'):
                    release.snapshot(cloud)
                self.assertEqual(cloud.writes, [])

    def test_split_or_latest_traffic_is_rejected(self):
        for rows in ([{'latestRevision': True, 'percent': 100}],
                     [{'revisionName': BASELINE, 'percent': 50},
                      {'revisionName': release.SERVICE + '-foreign', 'percent': 50}]):
            with self.subTest(rows=rows):
                self.cloud = FakeCloud()
                self.cloud.service['spec']['traffic'] = rows
                self.cloud.service['status']['traffic'] = rows
                with self.assertRaises(release.Stop):
                    release.snapshot(self.cloud)

    def test_stage_accepts_exact_retired_candidate_but_not_final_active_acceptance(self):
        release.transition(self.cloud, self.state, self.path)
        self.assertEqual(len(self.cloud.writes), 1)
        self.assertTrue(release.stored_retired(self.cloud.revisions[CANDIDATE]))
        self.assertTrue(release.observe(self.cloud, self.state, False))
        self.assertFalse(release.observe(self.cloud, self.state, True))

    def test_missing_ready_duplicate_conditions_and_unobserved_generations_stop(self):
        for mutation in ('missing-ready', 'duplicate', 'unobserved-service'):
            with self.subTest(mutation=mutation):
                cloud = FakeCloud()
                if mutation == 'missing-ready':
                    cloud.service['status']['conditions'] = [{'type': 'RoutesReady', 'status': 'True'}]
                elif mutation == 'duplicate':
                    cloud.service['status']['conditions'] *= 2
                else:
                    cloud.service['status']['observedGeneration'] = 0
                with self.assertRaises(release.Stop):
                    release.snapshot(cloud)
        release.transition(self.cloud, self.state, self.path)
        self.cloud.revisions[CANDIDATE]['status']['observedGeneration'] = 0
        self.assertFalse(release.observe(self.cloud, self.state, False))
        self.assertFalse(release.observe(self.cloud, self.state, True))

    def test_promote_accepts_retired_baseline_and_preserves_configuration(self):
        release.transition(self.cloud, self.state, self.path)
        release.transition(self.cloud, self.state, self.path, True)
        self.assertTrue(release.stored_retired(self.cloud.revisions[BASELINE]))
        self.assertTrue(release.observe(self.cloud, self.state, True))
        initial = copy.deepcopy(self.state['baseline']['revision']['spec'])
        current = copy.deepcopy(self.cloud.service['spec']['template']['spec'])
        initial['containers'][0]['image'] = NEW_IMAGE
        self.assertEqual(initial, current)
        self.assertEqual(self.cloud.policy, self.state['baseline']['iam'])

    def test_stage_lost_response_recovers_without_repeating_put(self):
        self.cloud.fail_after = 'stage'
        with self.assertRaisesRegex(release.Stop, 'LOST_AFTER'):
            release.transition(self.cloud, self.state, self.path)
        saved = json.loads(self.path.read_text())
        self.assertEqual(saved['stage']['phase'], 'attempted')
        release.transition(self.cloud, saved, self.path)
        self.assertEqual(len(self.cloud.writes), 1)
        self.assertEqual(self.path.stat().st_mode & 0o777, 0o600)

    def test_unapplied_stage_is_never_automatically_repeated(self):
        self.cloud.fail_before = 'stage'
        with self.assertRaises(release.Stop):
            release.transition(self.cloud, self.state, self.path)
        with self.assertRaises(release.Stop):
            release.transition(self.cloud, self.state, self.path)
        self.assertEqual(len(self.cloud.writes), 1)

    def test_promotion_lost_response_recovers_without_repeating_put(self):
        release.transition(self.cloud, self.state, self.path)
        self.cloud.fail_after = 'traffic'
        with self.assertRaisesRegex(release.Stop, 'LOST_AFTER'):
            release.transition(self.cloud, self.state, self.path, True)
        release.transition(self.cloud, json.loads(self.path.read_text()), self.path, True)
        self.assertEqual(len(self.cloud.writes), 2)

    def test_race_after_api_validation_prevents_write(self):
        self.cloud.concurrent_after_validation = True
        with self.assertRaisesRegex(release.Stop, 'CONCURRENT'):
            release.transition(self.cloud, self.state, self.path)
        self.assertEqual(self.cloud.writes, [])
        self.assertFalse(self.path.exists())

    def test_new_main_source_after_build_prevents_stage_or_promotion(self):
        with patch.object(release, 'assert_source_current', side_effect=release.Stop('NEWER_SERVICE_SOURCE_ON_MAIN')):
            with self.assertRaisesRegex(release.Stop, 'NEWER_SERVICE_SOURCE'):
                release.transition(self.cloud, self.state, self.path)
        self.assertEqual(self.cloud.writes, [])
        release.transition(self.cloud, self.state, self.path)
        with patch.object(release, 'assert_source_current', side_effect=release.Stop('NEWER_SERVICE_SOURCE_ON_MAIN')):
            with self.assertRaisesRegex(release.Stop, 'NEWER_SERVICE_SOURCE'):
                release.transition(self.cloud, self.state, self.path, True)
        self.assertEqual(len(self.cloud.writes), 1)

    def test_iam_change_prevents_write(self):
        self.cloud.policy['bindings'].append({'role': 'roles/run.admin', 'members': ['user:unexpected']})
        with self.assertRaisesRegex(release.Stop, 'IAM_CHANGED'):
            release.transition(self.cloud, self.state, self.path)
        self.assertEqual(self.cloud.writes, [])

    def test_existing_zero_percent_tag_is_preserved_at_all_transitions(self):
        tag = {'revisionName': BASELINE, 'percent': 0, 'tag': 'retained'}
        self.cloud.service['spec']['traffic'].append(tag)
        self.cloud.service['status']['traffic'].append(copy.deepcopy(tag))
        self.state['baseline'] = release.snapshot(self.cloud)
        release.transition(self.cloud, self.state, self.path)
        release.transition(self.cloud, self.state, self.path, True)
        self.assertIn(tag, release.routes(self.cloud.service))

    def test_failed_candidate_cannot_satisfy_final_acceptance(self):
        release.transition(self.cloud, self.state, self.path)
        self.cloud.revisions[CANDIDATE]['status']['conditions'][0]['status'] = 'False'
        with self.assertRaisesRegex(release.Stop, 'CANDIDATE_FAILED'):
            release.observe(self.cloud, self.state, True)

    def test_rollback_changes_only_traffic_even_when_candidate_failed(self):
        release.transition(self.cloud, self.state, self.path)
        release.transition(self.cloud, self.state, self.path, True)
        original = copy.deepcopy(self.cloud.service['spec']['template'])
        self.cloud.revisions[CANDIDATE]['status']['conditions'][0]['status'] = 'False'
        with contextlib.redirect_stdout(io.StringIO()):
            release.rollback(self.cloud, self.state, self.path)
        self.assertEqual(self.cloud.service['spec']['template'], original)
        self.assertEqual(release.routes(self.cloud.service), self.state['baseline']['traffic'])
        self.assertEqual(self.state['rollback']['phase'], 'verified')

    def test_rollback_lost_response_is_not_replayed(self):
        release.transition(self.cloud, self.state, self.path)
        release.transition(self.cloud, self.state, self.path, True)
        self.cloud.fail_after = 'traffic'
        with self.assertRaisesRegex(release.Stop, 'LOST_AFTER'):
            release.rollback(self.cloud, self.state, self.path)
        with contextlib.redirect_stdout(io.StringIO()):
            release.rollback(self.cloud, json.loads(self.path.read_text()), self.path)
        self.assertEqual(len(self.cloud.writes), 3)

    def test_newer_release_blocks_rollback(self):
        release.transition(self.cloud, self.state, self.path)
        release.transition(self.cloud, self.state, self.path, True)
        self.cloud.service['status']['latestCreatedRevisionName'] = release.SERVICE + '-foreign'
        with self.assertRaisesRegex(release.Stop, 'NEWER_RELEASE'):
            release.rollback(self.cloud, self.state, self.path)
        self.assertEqual(len(self.cloud.writes), 2)

    def test_rollback_needs_no_github_or_ci_call(self):
        release.transition(self.cloud, self.state, self.path)
        release.transition(self.cloud, self.state, self.path, True)
        with patch.object(release, 'local_source', return_value={k: self.state[k] for k in ('source', 'tested', 'tool')}), \
             patch.object(release, 'verify_source', side_effect=AssertionError('No GitHub/CI dependency')), \
             patch.object(release, 'gh', side_effect=AssertionError('No GitHub dependency')), \
             patch.object(release.publisher, 'cloud', return_value={'projectNumber': release.NUMBER}), \
             patch.object(release, 'Cloud', return_value=self.cloud), \
             patch.object(self.cloud, 'compatible_coach', side_effect=AssertionError('Rollback must not depend on peer health')), \
             contextlib.redirect_stdout(io.StringIO()):
            release.run(Path(self.temporary.name), Path(self.temporary.name), SOURCE, TESTED, restore=True)
        self.assertEqual(release.routes(self.cloud.service), self.state['baseline']['traffic'])

    def test_peer_change_prevents_gateway_mutation(self):
        self.cloud.peer['revision'] = release.COACH + '-another-release'
        with self.assertRaisesRegex(release.Stop, 'COACH_CHANGED_DURING_RELEASE'):
            release.transition(self.cloud, self.state, self.path)
        self.assertEqual(self.cloud.writes, [])

    def peer_fixture(self):
        origin = 'https://factory-coach-private-example.run.app'
        revision = copy.deepcopy(self.cloud.revisions[BASELINE])
        revision['metadata']['name'] = release.COACH + '-pr108-c43a18148421'
        revision['spec']['containers'][0]['image'] = release.COACH_IMAGE
        revision['status']['imageDigest'] = release.COACH_IMAGE
        revision['spec']['containers'][0]['env'] = [
            {'name': 'FACTORY_COACH_PRIVATE_AUDIENCE', 'value': origin},
            {'name': 'FACTORY_COACH_GATEWAY_SERVICE_ACCOUNT',
             'value': 'factory-gateway@' + release.PROJECT + '.iam.gserviceaccount.com'}]
        service = copy.deepcopy(self.cloud.service)
        service['metadata']['name'] = release.COACH
        service['status']['url'] = origin
        service['spec']['traffic'] = [{'revisionName': revision['metadata']['name'], 'percent': 100}]
        service['status']['traffic'] = copy.deepcopy(service['spec']['traffic'])
        calls = []
        def read(*args):
            calls.append(args)
            if args == ('run', 'services', 'describe', release.COACH, '--region', release.REGION):
                return copy.deepcopy(service)
            if args == ('run', 'revisions', 'describe', revision['metadata']['name'], '--region', release.REGION):
                return copy.deepcopy(revision)
            raise AssertionError('Only fixed peer metadata reads are allowed')
        return service, revision, read, calls, origin

    def test_peer_guard_binds_reviewed_image_to_consumed_config_without_leaking_payload(self):
        _, revision, read, calls, origin = self.peer_fixture()
        # An orphaned historical volume must never select the wrong version.
        self.cloud.service['spec']['template']['spec']['volumes'].insert(0, {
            'name': 'orphaned', 'secret': {'secretName': 'factory-gateway-private-config',
                                        'items': [{'key': '3', 'path': 'config.json'}]}})
        secrets = []
        def secret(args):
            secrets.append(args)
            return json.dumps({'coachPrivateOrigin': origin, 'githubPrivateKey': 'DO_NOT_PERSIST',
                               'sessionKey': 'SECRET_MARKER', 'unrelated': {'data': 'PRIVATE'}})
        receipt = release.coach_compatibility(self.cloud.service, read, secret)
        self.assertEqual(receipt['image'], release.COACH_IMAGE)
        self.assertEqual(receipt['revision'], revision['metadata']['name'])
        self.assertEqual(receipt['gatewayConfigVersion'], '9')
        self.assertEqual(secrets, [['gcloud', 'secrets', 'versions', 'access', '9',
                                   '--secret=factory-gateway-private-config', '--project=' + release.PROJECT, '--quiet']])
        self.assertEqual(len(calls), 2)
        serialized = json.dumps(receipt)
        self.assertNotIn('DO_NOT_PERSIST', serialized)
        self.assertNotIn('SECRET_MARKER', serialized)
        self.assertNotIn('unrelated', serialized)

    def test_old_or_inactive_coach_is_not_accepted_from_pages_success(self):
        for case in ('old-image', 'retired', 'unobserved', 'split'):
            with self.subTest(case=case):
                service, revision, read, _, origin = self.peer_fixture()
                if case == 'old-image':
                    old = release.COACH_IMAGE.split('@')[0] + '@sha256:' + '9' * 64
                    revision['spec']['containers'][0]['image'] = old
                    revision['status']['imageDigest'] = old
                elif case == 'retired':
                    mark(revision, active=False)
                elif case == 'unobserved':
                    revision['status']['observedGeneration'] = 0
                else:
                    service['spec']['traffic'][0]['percent'] = 50
                    service['spec']['traffic'].append({'revisionName': release.COACH + '-other', 'percent': 50})
                    service['status']['traffic'] = copy.deepcopy(service['spec']['traffic'])
                with self.assertRaises(release.Stop):
                    release.coach_compatibility(self.cloud.service, read,
                        lambda args: json.dumps({'coachPrivateOrigin': origin}))

    def test_peer_guard_rejects_wrong_audience_caller_and_gateway_destination(self):
        for case in ('audience', 'caller', 'destination', 'secret-bound-audience'):
            with self.subTest(case=case):
                _, revision, read, _, origin = self.peer_fixture()
                if case == 'audience':
                    revision['spec']['containers'][0]['env'][0]['value'] = 'https://another.run.app'
                elif case == 'caller':
                    revision['spec']['containers'][0]['env'][1]['value'] = 'unrelated@example.com'
                elif case == 'secret-bound-audience':
                    revision['spec']['containers'][0]['env'][0]['valueFrom'] = {'secretKeyRef': {'name': 'unexpected'}}
                secret_origin = 'https://factory-coach-private-unrelated.run.app' if case == 'destination' else origin
                with self.assertRaises(release.Stop):
                    release.coach_compatibility(self.cloud.service, read,
                        lambda args: json.dumps({'coachPrivateOrigin': secret_origin, 'githubPrivateKey': 'NEVER_ECHO'}))

    def test_peer_guard_never_reads_unverified_or_latest_gateway_secret(self):
        _, _, read, _, origin = self.peer_fixture()
        for version in ('latest', '', '0'):
            with self.subTest(version=version):
                self.cloud.service['spec']['template']['spec']['volumes'][0]['secret']['items'][0]['key'] = version
                with self.assertRaises(release.Stop):
                    release.coach_compatibility(self.cloud.service, read,
                        lambda args: self.fail('Must not read unverified config'))

    def test_cloud_mutation_scope_still_rejects_coach_before_authentication(self):
        with patch.object(release, 'command', side_effect=AssertionError('No token should be requested')):
            with self.assertRaisesRegex(release.Stop, 'RESOURCE_OUT_OF_SCOPE'):
                release.Cloud().resource('services', release.COACH, {'spec': {}})

    def test_build_is_gateway_only_nonroot_load_without_network(self):
        config = release.build_config(SOURCE, 'f' * 64, '12345')
        self.assertEqual(config['images'], [release.REGISTRY + ':' + SOURCE])
        self.assertIn('org.opencontainers.image.revision=' + SOURCE, config['steps'][0]['args'])
        self.assertIn('org.jems.source.archive.sha256=' + 'f' * 64, config['steps'][0]['args'])
        self.assertIn('--network', config['steps'][1]['args'])
        self.assertIn('none', config['steps'][1]['args'])
        self.assertIn('process.getuid()===0', config['steps'][1]['args'][-1])
        changed = copy.deepcopy(config)
        changed['steps'][0]['args'][0] = 'push'
        with self.assertRaisesRegex(release.Stop, 'BUILD_STEPS'):
            release.verify_build_shape(changed, config)
        changed = copy.deepcopy(config)
        changed['steps'][0]['env'] = ['INJECTED=1']
        with self.assertRaisesRegex(release.Stop, 'BUILD_STEPS'):
            release.verify_build_shape(changed, config)
        changed = copy.deepcopy(config)
        changed['steps'][0]['status'] = 'SUCCESS'
        release.verify_build_shape(changed, config)

    def test_uncertain_build_is_recovered_by_tag_without_resubmission(self):
        config = release.build_config(SOURCE, 'f' * 64, '12345')
        self.state.update({'nonce': '12345', 'build': {'phase': 'attempted', 'archive': 'f' * 64, 'config': config}})
        built = {**copy.deepcopy(config), 'id': 'c' * 36, 'status': 'SUCCESS',
                 'results': {'images': [{'name': config['images'][0], 'digest': NEW_IMAGE.split('@')[1]}]}}
        calls = []
        def cloud(*args):
            calls.append(args)
            if args[:2] == ('builds', 'list'):
                return [built]
            if args[:2] == ('builds', 'describe'):
                return built
            if args[:3] == ('artifacts', 'docker', 'images'):
                return {'image_summary': {'digest': NEW_IMAGE.split('@')[1]}}
            raise AssertionError('Unexpected remote operation: ' + str(args))
        with patch.object(release.publisher, 'cloud', side_effect=cloud):
            self.assertEqual(release.publish(Path(self.temporary.name), self.state, self.path), NEW_IMAGE)
        self.assertFalse(any(c[:2] == ('builds', 'submit') for c in calls))

    def test_uncertain_build_without_unique_match_stops_without_submit(self):
        config = release.build_config(SOURCE, 'f' * 64, '12345')
        self.state.update({'nonce': '12345', 'build': {'phase': 'attempted', 'archive': 'f' * 64, 'config': config}})
        with patch.object(release.publisher, 'cloud', return_value=[]) as cloud:
            with self.assertRaisesRegex(release.Stop, 'NO_RESUBMISSION'):
                release.publish(Path(self.temporary.name), self.state, self.path)
        self.assertEqual(cloud.call_count, 1)

    def test_source_must_match_successful_real_required_checks(self):
        checks = [{'id': index, 'name': name, 'head_sha': TESTED, 'app': {'id': 15368},
                   'status': 'completed', 'conclusion': 'success'}
                  for index, name in enumerate(sorted(release.CHECKS), 1)]
        def command(args, root=None):
            if args[:2] == ['gh', 'api']:
                return json.dumps({'id': 1458033181, 'owner': {'id': 356692244}})
            if args[1:3] == ['rev-parse', 'HEAD']:
                return 'c' * 40
            if args[1] == 'rev-parse':
                return 'identical-tree'
            return ''
        def api(path):
            if path == 'branches/main':
                return {'protected': True, 'commit': {'sha': SOURCE}}
            return {'total_count': len(checks), 'check_runs': checks}
        with patch.object(release, 'command', side_effect=command), patch.object(release, 'gh', side_effect=api):
            self.assertEqual(release.verify_source(Path('.'), SOURCE, TESTED)['source'], SOURCE)
            checks[0]['app']['id'] = 7
            with self.assertRaisesRegex(release.Stop, 'REQUIRED_CI_MISSING'):
                release.verify_source(Path('.'), SOURCE, TESTED)
            checks[0]['app']['id'] = 15368
            checks[0]['head_sha'] = SOURCE
            with self.assertRaisesRegex(release.Stop, 'CHECK_SOURCE_DIFFERS'):
                release.verify_source(Path('.'), SOURCE, TESTED)
            checks[0]['head_sha'] = TESTED
            checks[0]['conclusion'] = 'failure'
            with self.assertRaisesRegex(release.Stop, 'REQUIRED_CI_NOT_SUCCESSFUL'):
                release.verify_source(Path('.'), SOURCE, TESTED)

    def test_equal_ci_sha_is_not_enough_when_source_tree_differs(self):
        def command(args, root=None):
            if args[1] == 'status':
                return ''
            return args[-1]
        with patch.object(release, 'command', side_effect=command), \
             patch.object(release, 'gh', side_effect=AssertionError('Must reject locally first')):
            with self.assertRaisesRegex(release.Stop, 'TESTED_TREE_DIFFERS'):
                release.verify_source(Path('.'), SOURCE, TESTED)

    def test_current_main_source_guard_fetches_exact_head_and_checks_service_scope(self):
        calls = []
        def command(args, root=None):
            calls.append(args)
            return 'server/agent/private-dispatch.ts' if args[1] == 'diff' else ''
        with patch.object(release, 'command', side_effect=command), \
             patch.object(release, 'gh', return_value={'protected': True, 'commit': {'sha': 'd' * 40}}):
            with self.assertRaisesRegex(release.Stop, 'NEWER_SERVICE_SOURCE'):
                ASSERT_SOURCE_CURRENT(SOURCE, Path('.'))
        self.assertIn(['git', 'fetch', '--quiet', '--no-tags', 'https://github.com/' + release.REPO + '.git', 'd' * 40], calls)
        self.assertEqual(calls[-1][-len(release.publisher.SERVICE_SCOPE):], release.publisher.SERVICE_SCOPE)


if __name__ == '__main__':
    unittest.main()
