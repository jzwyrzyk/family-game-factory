#!/usr/bin/env python3
"""Offline integration checks against the exact pinned release primitives.

Run with --primitives-dir pointing to a clean checkout of 804574895d8ab86fe270e590ecfa05fa5d4bc290.
The tests reuse that tool's synthetic Cloud Run fixture; no live cloud, GitHub
or provider request is made. This explicit dependency is not silently skipped.
"""
import argparse
import contextlib
import copy
from datetime import datetime, timezone
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import release_coach_diagnostics as operator

ROOT = Path(__file__).resolve().parents[2]
SOURCE, TESTED, TOOL = 'a' * 40, operator.APPROVED_TESTED_SOURCE, 'c' * 40
NONCE = '123456' * 5 + 'ab'
BUILD_ID = '12345678-1234-1234-1234-123456789abc'
guards = publisher = Cloud = fixtures = APPLICATION = PRIMITIVES = None


class CoachReadinessRolloutTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        directory = Path(temporary.name) / ('coach-readiness-' + SOURCE) / 'state'
        directory.mkdir(mode=0o700, parents=True)
        self.path = directory / 'release.json'
        self.cloud = fixtures.FakeCloud(self.path)
        old_name = guards.COACH + '-baseline'
        revision = self.cloud.revisions.pop(old_name)
        revision['metadata']['name'] = operator.DEPLOYED_COACH
        self.cloud.revisions[operator.DEPLOYED_COACH] = revision
        service = self.cloud.services['coach']
        service['spec']['template']['metadata']['name'] = operator.DEPLOYED_COACH
        for field in ('latestCreatedRevisionName', 'latestReadyRevisionName'):
            service['status'][field] = operator.DEPLOYED_COACH
        for section in ('spec', 'status'):
            for route in service[section]['traffic']:
                route['revisionName'] = operator.DEPLOYED_COACH
        self.state = {
            'version': 1, 'purpose': operator.RELEASE_PURPOSE,
            'source': SOURCE, 'tested': TESTED, 'tool': TOOL,
            'primitives': operator.PRIMITIVES_SHA, 'nonce': NONCE,
            'bucket': f'{guards.PROJECT}-service-builds-{guards.REGION}',
            'gatewayGuard': guards.snapshot(self.cloud, 'gateway'),
            'services': {'coach': {'baseline': guards.snapshot(self.cloud, 'coach'),
                'candidate': operator.candidate(SOURCE, NONCE)}},
            'build': {'phase': 'verified', 'archive': 'a' * 64,
                'images': {'coach': fixtures.NEW['coach']}, 'id': BUILD_ID,
                'resolvedSource': {'bucket': f'{guards.PROJECT}-service-builds-{guards.REGION}',
                    'object': 'source/' + NONCE + '/archive.tgz', 'generation': '123'},
                'config': guards.build_config(SOURCE, 'a' * 64, NONCE)},
        }
        for target, name, result in ((guards, 'assert_source_current', SOURCE), (guards.time, 'sleep', None)):
            mock = patch.object(target, name, return_value=result)
            mock.start()
            self.addCleanup(mock.stop)

    def stage(self):
        guards.transition(ROOT, self.cloud, self.state, self.path, 'coach')

    def promote(self):
        self.stage()
        guards.transition(ROOT, self.cloud, self.state, self.path, 'coach', True)

    def test_coach_only_stage_promote_and_rollback_preserve_configuration_iam_and_tags(self):
        gateway = copy.deepcopy(self.cloud.services['gateway'])
        self.promote()
        self.assertEqual([(key, phase) for key, phase, _ in self.cloud.writes], [('coach', 'stage'), ('coach', 'promotion')])
        self.assertEqual(self.cloud.services['gateway'], gateway)
        before = self.state['services']['coach']['baseline']
        expected = copy.deepcopy(before['revision']['spec'])
        expected['containers'][0]['image'] = fixtures.NEW['coach']
        self.assertEqual(self.cloud.services['coach']['spec']['template']['spec'], expected)
        self.assertEqual(self.cloud.iam('coach'), before['iam'])
        self.assertIn({'revisionName': operator.DEPLOYED_COACH, 'percent': 0, 'tag': 'keep-tag'}, self.cloud.services['coach']['spec']['traffic'])
        operator.validate(guards, self.state)
        self.state['rollbackRequested'] = True
        guards.save(self.path, self.state)
        guards.rollback_one(self.cloud, self.state, self.path, 'coach')
        operator.validate(guards, self.state)
        self.assertEqual(self.cloud.services['coach']['status']['traffic'], before['traffic'])
        self.assertEqual(self.cloud.services['gateway'], gateway)

    def test_zero_traffic_stage_is_journaled_and_lost_ack_is_observed_without_replay(self):
        self.cloud.fail_after = ('coach', 'stage')
        with self.assertRaises(guards.Stop):
            self.stage()
        self.assertEqual(self.state['services']['coach']['stage']['phase'], 'attempted')
        self.assertEqual(self.cloud.services['coach']['status']['traffic'], self.state['services']['coach']['baseline']['traffic'])
        self.stage()
        self.assertEqual(len(self.cloud.writes), 1)
        self.assertEqual(self.state['services']['coach']['stage']['phase'], 'verified')

    def test_lost_promotion_ack_is_observed_without_replay(self):
        self.stage()
        self.cloud.fail_after = ('coach', 'promotion')
        with self.assertRaises(guards.Stop):
            guards.transition(ROOT, self.cloud, self.state, self.path, 'coach', True)
        guards.transition(ROOT, self.cloud, self.state, self.path, 'coach', True)
        self.assertEqual(len(self.cloud.writes), 2)
        self.assertTrue(guards.observe(self.cloud, self.state, 'coach', True))

    def test_unapplied_stage_is_not_resubmitted_and_rollback_makes_no_write(self):
        self.cloud.fail_before = ('coach', 'stage')
        with self.assertRaises(guards.Stop):
            self.stage()
        with self.assertRaises(guards.Stop):
            self.stage()
        self.state['rollbackRequested'] = True
        guards.save(self.path, self.state)
        guards.rollback_one(self.cloud, self.state, self.path, 'coach')
        self.assertEqual(len(self.cloud.writes), 1)
        self.assertTrue(self.state['services']['coach']['rollback']['noWriteRequired'])

    def test_gateway_or_iam_drift_blocks_coach_write(self):
        for mutation in ('gateway', 'coach_iam'):
            with self.subTest(mutation=mutation):
                baseline = copy.deepcopy(self.cloud.services['gateway'])
                policy = copy.deepcopy(self.cloud.policies['coach'])
                if mutation == 'gateway':
                    self.cloud.services['gateway']['metadata']['resourceVersion'] = 'changed'
                else:
                    self.cloud.policies['coach']['bindings'].append({'role': 'roles/run.invoker', 'members': ['allUsers']})
                with self.assertRaises(guards.Stop):
                    self.stage()
                self.assertEqual(self.cloud.writes, [])
                self.cloud.services['gateway'], self.cloud.policies['coach'] = baseline, policy

    def test_gateway_iam_drift_after_validation_blocks_actual_write(self):
        def drift(cloud):
            cloud.policies['gateway']['bindings'].append({'role': 'roles/run.invoker', 'members': ['allAuthenticatedUsers']})
        self.cloud.drift = drift
        with self.assertRaises(guards.Stop):
            self.stage()
        self.assertEqual(len(self.cloud.validations), 1)
        self.assertEqual(self.cloud.writes, [])

    def test_other_tested_source_stops_before_libraries_or_cloud(self):
        with patch.object(operator, 'libraries', side_effect=AssertionError('unexpected import or network')):
            with self.assertRaisesRegex(operator.Stop, 'EXACT_PR131_TESTED_SOURCE_REQUIRED'):
                operator.run(ROOT, ROOT, ROOT, self.path.parent, SOURCE,
                             '5688bb3f6a01a766af8b78c783faccd8cce8f89c', True)

    def test_previous_diagnostic_state_directory_is_rejected_before_cloud(self):
        original = self.path.parents[2] / ('coach-diagnostics-' + operator.DEPLOYED_SOURCE) / 'state'
        original.mkdir(mode=0o700, parents=True)
        journal = original / 'release.json'
        journal.write_bytes(b'{"original":"completed diagnostic receipt"}\n')
        before = journal.read_bytes(), journal.stat().st_ino
        with patch.object(operator, 'libraries', side_effect=AssertionError('unexpected import or network')):
            with self.assertRaisesRegex(operator.Stop, 'READINESS_SOURCE_KEYED_STATE_DIRECTORY_REQUIRED'):
                operator.run(ROOT, ROOT, ROOT, original, SOURCE, TESTED, True)
        self.assertEqual((journal.read_bytes(), journal.stat().st_ino), before)

    def test_state_directory_must_match_the_full_new_source(self):
        operator.require_state_directory(self.path.parent, SOURCE)
        for source, directory in (('b' * 40, self.path.parent),
                                  (SOURCE[:12], self.path.parent),
                                  (SOURCE, self.path.parent / 'nested')):
            with self.subTest(source=source, directory=directory), self.assertRaises(operator.Stop):
                operator.require_state_directory(directory, source)

    def test_journal_source_tested_tool_and_purpose_cannot_be_reassigned(self):
        proof = {'source': SOURCE, 'tested': TESTED, 'tool': TOOL}
        for field, value in (('source', 'd' * 40), ('tested', 'd' * 40),
                             ('tool', 'd' * 40), ('purpose', 'coach-diagnostics')):
            state = copy.deepcopy(self.state)
            state[field] = value
            guards.save(self.path, state)
            before = self.path.read_bytes(), self.path.stat().st_ino
            expected = 'JOURNAL_IDENTITY_INVALID' if field == 'purpose' else 'JOURNAL_SOURCE_OR_TOOL_DIFFERS'
            with self.subTest(field=field), \
                    patch.object(operator, 'libraries', return_value=(guards, publisher, lambda: self.cloud)), \
                    patch.object(guards, 'verify_source', return_value=proof), \
                    patch.object(publisher, 'cloud', return_value={'projectNumber': guards.NUMBER}), \
                    self.assertRaisesRegex(operator.Stop, expected):
                operator.run(ROOT, ROOT, ROOT, self.path.parent, SOURCE, TESTED, True)
            self.assertEqual((self.path.read_bytes(), self.path.stat().st_ino), before)
            self.assertEqual(self.cloud.writes, [])

    def test_pr115_baseline_is_not_a_valid_start_for_readiness_repair(self):
        proof = {'source': SOURCE, 'tested': TESTED, 'tool': TOOL}
        before = copy.deepcopy(self.state['services']['coach']['baseline'])
        before['revision']['metadata']['name'] = 'factory-coach-private-pr115-19f5e46ae114-fb5fa6'
        with patch.object(operator, 'libraries', return_value=(guards, publisher, lambda: self.cloud)), \
                patch.object(guards, 'verify_source', return_value=proof), \
                patch.object(publisher, 'cloud', return_value={'projectNumber': guards.NUMBER}), \
                patch.object(operator, 'scope'), patch.object(guards, 'application_checkout'), \
                patch.object(guards, 'snapshot', side_effect=[before, self.state['gatewayGuard']]), \
                patch.object(guards, 'budget_preflight', side_effect=AssertionError('unapproved baseline reached budget')):
            with self.assertRaisesRegex(operator.Stop, 'APPROVED_SERVING_BASELINE_CHANGED'):
                operator.run(ROOT, ROOT, ROOT, self.path.parent, SOURCE, TESTED, True)
        self.assertFalse(self.path.exists())
        self.assertEqual(self.cloud.writes, [])

    def test_arbitrary_exception_text_is_never_printed(self):
        for error in (RuntimeError('PRIVATE_CANARY'), RuntimeError('private body'), StopIteration('PRIVATE_CANARY')):
            self.assertEqual(operator.safe_error(error), 'COACH_RELEASE_STOPPED_RETAIN_PRIVATE_JOURNAL')
        self.assertEqual(operator.safe_error(guards.Stop('CONCURRENT_SERVICE_CHANGE_coach')), 'CONCURRENT_SERVICE_CHANGE_coach')

    def test_adapter_refuses_gateway_write_before_any_network_call(self):
        cloud = Cloud()
        with patch.object(guards.Cloud, 'resource', side_effect=AssertionError('unexpected network')):
            with self.assertRaisesRegex(operator.Stop, 'ONLY_PRIVATE_COACH_WRITE_ALLOWED'):
                cloud.resource('services', guards.GATEWAY, {})

    def test_runtime_metadata_does_not_replace_real_scaling_settings(self):
        revision = self.cloud.revisions[operator.DEPLOYED_COACH]
        revision['scalingStatus'] = {'desiredMinInstanceCount': 0}
        revision['spec']['containerConcurrency'] = 9
        self.cloud.services['coach']['spec']['template']['spec']['containerConcurrency'] = 9
        before = guards.snapshot(self.cloud, 'coach')
        self.assertNotIn('scalingStatus', guards.template(before['revision']))
        self.assertEqual(guards.template(before['revision'])['spec']['containerConcurrency'], 9)

    def test_unpinned_secret_and_newer_unserved_revision_block_snapshot(self):
        for mutation in ('secret', 'unserved'):
            cloud = fixtures.FakeCloud()
            if mutation == 'secret':
                cloud.revisions[guards.COACH + '-baseline']['spec']['containers'][0]['env'][1]['valueFrom']['secretKeyRef']['key'] = 'latest'
            else:
                cloud.services['coach']['status']['latestCreatedRevisionName'] = guards.COACH + '-different'
            with self.subTest(mutation=mutation), self.assertRaises(guards.Stop):
                guards.snapshot(cloud, 'coach')
            self.assertEqual(cloud.writes, [])

    def test_journal_rejects_other_service_or_changed_build_and_candidate(self):
        operator.validate(guards, self.state)
        for mutation in ('gateway', 'build', 'candidate'):
            state = copy.deepcopy(self.state)
            if mutation == 'gateway':
                state['services']['gateway'] = {}
            elif mutation == 'build':
                state['build']['config']['steps'][0]['env'] = ['UNAPPROVED=1']
            else:
                state['services']['coach']['candidate'] += '-other'
            with self.subTest(mutation=mutation), self.assertRaises(operator.Stop):
                operator.validate(guards, state)

    def test_current_source_archiver_includes_required_pal_dependencies(self):
        self.assertIn('src/pals/catalog.ts', publisher.SERVICE_SCOPE)
        self.assertIn('src/pals/catalog-artwork.generated.ts', publisher.SERVICE_SCOPE)
        config = self.state['build']['config']
        self.assertEqual(len(config['images']), 1)
        self.assertIn('org.jems.source.archive.sha256=' + 'a' * 64, config['steps'][0]['args'])
        self.assertIn('--network', config['steps'][1]['args'])
        self.assertIn('none', config['steps'][1]['args'])
        self.assertIn('NON_ROOT_REQUIRED', config['steps'][1]['args'][-1])
        self.assertIn('jems-coach-readiness', config['tags'])
        self.assertTrue(operator.candidate(SOURCE, NONCE).startswith('factory-coach-private-chatready-'))
        self.assertLessEqual(len(operator.candidate(SOURCE, NONCE)), 63)

    def test_real_reviewed_source_scope_and_exact_packaging(self):
        source = operator.git(APPLICATION, 'rev-parse', 'HEAD')
        operator.scope(ROOT, source)
        real_git = operator.git
        def changed_packaging(root, *args):
            return 'f' * 40 if args == ('rev-parse', source + ':.dockerignore') else real_git(root, *args)
        with patch.object(operator, 'git', side_effect=changed_packaging), self.assertRaisesRegex(operator.Stop, 'SOURCE_EXCEEDS_PRIVATE_READINESS_SCOPE'):
            operator.scope(ROOT, source)

    def test_readiness_runtime_allowlist_rejects_executor_shared_contract_and_dependency_changes(self):
        source = operator.git(APPLICATION, 'rev-parse', 'HEAD')
        expected = {'server/coach/private-provider.ts', 'server/coach/policy.ts',
                    'server/coach/private-creation-wire.ts'}
        actual = set(operator.git(ROOT, 'diff', '--name-only', operator.DEPLOYED_SOURCE, source,
                                  '--', *operator.PRIVATE_SCOPE).splitlines())
        self.assertEqual(actual, expected)
        self.assertEqual(operator.ALLOWED_READINESS_FILES, expected)
        real_git = operator.git
        for extra in ('server/coach/private-executor.ts', 'server/coach/service.ts',
                      'src/studio/creation-readiness.ts', 'server/Dockerfile.coach', 'package-lock.json'):
            def changed_scope(root, *args):
                if args[:2] == ('diff', '--name-only'):
                    return '\n'.join(sorted(expected | {extra}))
                return real_git(root, *args)
            with self.subTest(extra=extra), patch.object(operator, 'git', side_effect=changed_scope), \
                    self.assertRaisesRegex(operator.Stop, 'SOURCE_EXCEEDS_PRIVATE_READINESS_SCOPE'):
                operator.scope(ROOT, source)

    def test_actual_budget_helper_with_current_source_and_reported_limits(self):
        source = operator.git(APPLICATION, 'rev-parse', 'HEAD')
        revision = copy.deepcopy(self.cloud.revisions[operator.DEPLOYED_COACH])
        values = {name: 'true' for name in ('FACTORY_COACH_APPROVED', 'FACTORY_COACH_PRIVACY_APPROVED',
            'FACTORY_COACH_SAFEGUARDS_APPROVED', 'FACTORY_COACH_PRIVATE_EXECUTION_APPROVED',
            'FACTORY_ADULT_PILOT_MODE', 'FACTORY_ADULT_PILOT_OWNER_APPROVED', 'FACTORY_ADULT_PILOT_PROFILE_ACCESS_VERIFIED')}
        values.update({'FACTORY_COACH_MODEL': 'gpt-5.4-mini-2026-03-17', 'FACTORY_COACH_INPUT_CHARS': '16000',
            'FACTORY_COACH_OUTPUT_TOKENS': '800', 'FACTORY_COACH_MAX_MICRO_USD': '30000',
            'FACTORY_COACH_INPUT_PRICE': '750000', 'FACTORY_COACH_OUTPUT_PRICE': '4500000',
            'FACTORY_COACH_PRICES_REVIEWED': datetime.now(timezone.utc).isoformat()})
        revision['spec']['containers'][0]['env'] = [{'name': key, 'value': value} for key, value in values.items()]
        revision['spec']['containers'][0]['env'].append({'name': 'FACTORY_COACH_PRIVATE_OPENAI_API_KEY',
            'valueFrom': {'secretKeyRef': {'name': 'synthetic-canary-secret', 'key': '9'}}})
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            proof = guards.budget_preflight(ROOT, APPLICATION, source, revision)
        self.assertTrue(proof['arithmeticPass'])
        self.assertEqual(proof['wireBudgetVersion'], 1)
        self.assertNotIn('contextByteAllowance', proof)
        self.assertNotEqual(proof['synthetic'][0]['schemaBytes'], proof['fixed']['baseSchemaBytes'])
        self.assertNotEqual(proof['synthetic'][0]['modelInputBytes'], proof['synthetic'][0]['contextBytes'])
        self.assertEqual(proof['limits'], {'maxInputChars': 16000, 'maxOutputTokens': 800, 'maxTurnMicroUsd': 30000})
        self.assertNotIn('synthetic-canary-secret', output.getvalue())

    def test_dynamic_budget_matches_actual_provider_boundary_without_network(self):
        source = operator.git(APPLICATION, 'rev-parse', 'HEAD')
        result = subprocess.run(['node', '--import', 'tsx',
            str(ROOT / 'scripts/deployment/check_coach_readiness_budget.cjs'), str(APPLICATION), source],
            cwd=APPLICATION, capture_output=True, text=True, timeout=60)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(json.loads(result.stdout), {'status': 'DYNAMIC_BUDGET_OFFLINE_CHECKS_PASSED',
                                                    'networkCalls': 0, 'syntheticTurns': 2})

    def test_full_run_replays_journal_then_rolls_back_without_secret_or_provider_read(self):
        proof = {'source': SOURCE, 'tested': TESTED, 'tool': TOOL}
        self.cloud.revisions[operator.DEPLOYED_COACH]['spec']['containers'][0]['env'].extend([
            {'name': 'FACTORY_COACH_PRIVATE_AUDIENCE', 'value': self.cloud.services['coach']['status']['url']},
            {'name': 'FACTORY_COACH_GATEWAY_SERVICE_ACCOUNT', 'value': f'factory-gateway@{guards.PROJECT}.iam.gserviceaccount.com'}])
        self.cloud.services['coach']['spec']['template']['spec'] = copy.deepcopy(self.cloud.revisions[operator.DEPLOYED_COACH]['spec'])
        calls = []

        def archive(application, directory, source):
            path = Path(directory) / 'source.tgz'
            path.write_bytes(b'synthetic archive')
            return path, 'a' * 64

        def fake_cloud(*args):
            calls.append(args[:2])
            if args[:2] == ('projects', 'describe'):
                return {'projectNumber': guards.NUMBER}
            if args[:2] == ('builds', 'submit'):
                return {'id': BUILD_ID}
            if args[:2] == ('builds', 'describe'):
                self.state = json.loads(self.path.read_text())
                actual = self.build_actual()
                actual['source']['storageSource']['object'] = actual['sourceProvenance']['resolvedStorageSource']['object'] = 'source/' + self.state['nonce'] + '/archive.tgz'
                return actual
            if args[:3] == ('artifacts', 'docker', 'images'):
                return {'image_summary': {'digest': fixtures.NEW['coach'].split('@')[1]}}
            self.fail('Unexpected publication or secret/provider command')

        output = io.StringIO()
        with contextlib.ExitStack() as stack:
            budget = stack.enter_context(patch.object(guards, 'budget_preflight'))
            for target, name, arguments in (
                (operator, 'libraries', {'return_value': (guards, publisher, lambda: self.cloud)}),
                (operator, 'scope', {}), (guards, 'verify_source', {'return_value': proof}),
                (guards, 'local_source', {'return_value': proof}), (guards, 'application_checkout', {}),
                (publisher, 'preflight', {}),
                (publisher, 'source_archive', {'side_effect': archive}), (publisher, 'cloud', {'side_effect': fake_cloud}),
                (guards, 'binding', {'side_effect': AssertionError('secret access forbidden')}),
                (guards, 'verify_binding', {'side_effect': AssertionError('secret access forbidden')})):
                stack.enter_context(patch.object(target, name, **arguments))
            stack.enter_context(contextlib.redirect_stdout(output))
            operator.run(ROOT, ROOT, ROOT, self.path.parent, SOURCE, TESTED, True)
            operator.run(ROOT, ROOT, ROOT, self.path.parent, SOURCE, TESTED, True)
            operator.run(ROOT, ROOT, ROOT, self.path.parent, SOURCE, TESTED, restore=True)
            operator.run(ROOT, ROOT, ROOT, self.path.parent, SOURCE, TESTED, restore=True)
            with self.assertRaisesRegex(operator.Stop, 'ROLLED_BACK_RELEASE_CANNOT_REPROMOTE'):
                operator.run(ROOT, ROOT, ROOT, self.path.parent, SOURCE, TESTED, True)
            budget.assert_called_once_with(ROOT, ROOT, SOURCE,
                                           self.state['services']['coach']['baseline']['revision'])
        self.assertEqual(calls.count(('builds', 'submit')), 1)
        self.assertEqual([(key, phase) for key, phase, _ in self.cloud.writes], [('coach', 'stage'), ('coach', 'promotion'), ('coach', 'rollback')])
        for line in output.getvalue().splitlines():
            result = json.loads(line)
            if result['status'] == 'COACH_READINESS_SERVING':
                self.assertFalse(result['providerCall'])
                self.assertFalse(result['conversationVerified'])
        self.assertNotIn('secretKeyRef', output.getvalue())

    def build_actual(self):
        actual = copy.deepcopy(self.state['build']['config'])
        actual.update({'id': BUILD_ID, 'status': 'SUCCESS',
            'source': {'storageSource': {'bucket': self.state['bucket'], 'object': 'source/' + NONCE + '/archive.tgz'}},
            'sourceProvenance': {'resolvedStorageSource': {'bucket': self.state['bucket'], 'object': 'source/' + NONCE + '/archive.tgz', 'generation': '123'}},
            'results': {'images': [{'name': self.state['build']['config']['images'][0], 'digest': fixtures.NEW['coach'].split('@')[1]}]}})
        # These are the exact harmless defaults observed during PR115 recovery.
        actual['options'].update({'workerRelease': 'legacy', 'resolvedWorkerRelease': 'legacy', 'pool': {}})
        actual['artifacts'] = {'images': actual['images']}
        return actual

    def test_build_lost_ack_reuses_the_same_nonce_and_existing_build_once(self):
        actual = self.build_actual()
        self.state['build'] = {key: value for key, value in self.state['build'].items() if key in ('archive', 'config')}
        self.state['build']['phase'] = 'prepared'
        calls = []

        def archive(application, directory, source):
            path = Path(directory) / 'source.tgz'
            path.write_bytes(b'synthetic archive')
            return path, 'a' * 64

        def cloud(*args):
            calls.append(args[:2])
            if args[:2] == ('builds', 'submit'):
                self.assertEqual(json.loads(self.path.read_text())['build']['phase'], 'attempted')
                raise guards.Stop('LOST_ACCEPTED_BUILD_ACK')
            if args[:2] == ('builds', 'list'):
                return [copy.deepcopy(actual)]
            if args[:2] == ('builds', 'describe'):
                return copy.deepcopy(actual)
            if args[:3] == ('artifacts', 'docker', 'images'):
                return {'image_summary': {'digest': fixtures.NEW['coach'].split('@')[1]}}
            self.fail('Unexpected publication command')

        with patch.object(publisher, 'source_archive', side_effect=archive), patch.object(publisher, 'preflight'), \
                patch.object(publisher, 'cloud', side_effect=cloud), patch.object(guards, 'application_checkout'):
            with self.assertRaisesRegex(guards.Stop, 'LOST_ACCEPTED_BUILD_ACK'):
                guards.publish(ROOT, ROOT, self.cloud, self.state, self.path)
            guards.publish(ROOT, ROOT, self.cloud, self.state, self.path)
            guards.publish(ROOT, ROOT, self.cloud, self.state, self.path)
        self.assertEqual(calls.count(('builds', 'submit')), 1)
        self.assertEqual(self.state['build']['id'], BUILD_ID)
        self.assertEqual(self.state['build']['phase'], 'verified')
        operator.validate(guards, self.state)
        self.assertEqual(self.cloud.writes, [])

    def test_uncertain_build_without_matching_receipt_never_submits_again(self):
        self.state['build'] = {key: value for key, value in self.state['build'].items() if key in ('archive', 'config')}
        self.state['build']['phase'] = 'attempted'
        with patch.object(publisher, 'cloud', return_value=[]) as cloud:
            with self.assertRaisesRegex(guards.Stop, 'BUILD_SUBMISSION_UNCERTAIN_NO_RESUBMISSION'):
                guards.publish(ROOT, ROOT, self.cloud, self.state, self.path)
        self.assertEqual(cloud.call_args.args[:2], ('builds', 'list'))
        self.assertEqual(cloud.call_count, 1)

    def test_build_verifier_rejects_mutable_execution_and_wrong_source_location(self):
        actual = self.build_actual()
        guards.verify_build_shape(actual, self.state['build']['config'])
        guards.verify_build_source(actual, self.state)
        actual['options']['machineType'] = 'UNREVIEWED'
        with self.assertRaises(guards.Stop):
            guards.verify_build_shape(actual, self.state['build']['config'])
        actual = self.build_actual()
        actual['source']['storageSource']['object'] = 'source/unrelated/archive.tgz'
        with self.assertRaises(guards.Stop):
            guards.verify_build_source(actual, self.state)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--primitives-dir', required=True)
    parser.add_argument('--application-dir', required=True, help='Clean reviewed application checkout with locked npm dependencies installed')
    args = parser.parse_args()
    primitives = Path(args.primitives_dir).resolve()
    global guards, publisher, Cloud, fixtures, APPLICATION, PRIMITIVES
    APPLICATION, PRIMITIVES = Path(args.application_dir).resolve(), primitives
    guards, publisher, Cloud = operator.libraries(ROOT, primitives)
    previous = sys.modules.get('release_services')
    try:
        sys.modules['release_services'] = guards
        fixtures = operator.module('_jems_prior_release_fixtures', primitives / 'scripts/deployment/test_release_services.py')
    finally:
        if previous is None:
            sys.modules.pop('release_services', None)
        else:
            sys.modules['release_services'] = previous
    result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(CoachReadinessRolloutTests))
    return 0 if result.wasSuccessful() else 1


if __name__ == '__main__':
    raise SystemExit(main())
