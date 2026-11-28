"""No credentials/cloud access: durable state, approval and runner-loss contracts."""
import base64
import json
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import github_test_stack as transport
import integrated_test_stack as op


class Store:
    def __init__(self):
        self.objects = {}
        self.next = 1
        self.fail_checkpoint = False

    def read(self, key):
        return self.objects.get(key, (None, '0'))

    def put(self, key, value, generation):
        if key == transport.SNAPSHOT and self.fail_checkpoint:
            raise op.Stop('PRIVATE_STATE_TRANSPORT_UNCERTAIN')
        if self.read(key)[1] != generation:
            raise op.Stop('PRIVATE_STATE_HTTP_412')
        current = str(self.next)
        self.next += 1
        self.objects[key] = value, current
        return current

    def delete(self, key, generation):
        if self.read(key)[1] != generation:
            raise op.Stop('PRIVATE_STATE_HTTP_412')
        del self.objects[key]


class TransportTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        self.store = Store()
        self.source = 'a' * 40
        self.variables = self.root / 'variables.json'
        op.write_new(self.variables, {'stage': 'foundation'})
        self.args = SimpleNamespace(variables=self.variables, close_funded_trial=False)
        self.secret = 'fixture-only-private-oauth-value'
        self.applies = 0
        self.uncertain = False
        self.home_count = 0
        self.fail_before_apply = False

    def terraform(self, args, *_args, **_kwargs):
        if args[1] == 'plan':
            target = Path(next(x[5:] for x in args if x.startswith('-out=')))
            op.write_new(target, target.name.encode())
        if args[1] == 'show':
            actions = ['no-op'] if args[-1].endswith('readback.tfplan') else ['create']
            return json.dumps({'complete': True, 'resource_changes': [{'address': 'google_storage_bucket.test[0]',
                'mode': 'managed', 'change': {'actions': actions, 'after': {'project': op.PROJECT}}}]}).encode()
        if args[1] == 'apply':
            self.applies += 1
            # Real Terraform commits native remote state independently of the
            # operator's snapshot and GitHub runner filesystem.
            self.store.put(transport.STATE, b'{"serial":1,"lineage":"fixture"}', self.store.read(transport.STATE)[1])
            if self.uncertain:
                raise op.Stop('TERRAFORM_APPLY_TIMEOUT_UNCERTAIN')
        return b'{}'

    def execute(self, mode, args=None):
        self.home_count += 1
        home = self.root / ('run-' + str(self.home_count))
        with patch.object(op, 'tracked', return_value={'main.tf': b'fixture', '.terraform.lock.hcl': b'locked'}), \
             patch.object(op, 'command', self.terraform), patch.object(transport, 'command', self.terraform):
            return transport.execute(self.store, home, self.source, mode, args or self.args, self.secret,
                                     {'source': self.source, 'run': str(self.home_count)})

    def plan(self):
        result = self.execute('plan')
        return SimpleNamespace(attempt=result['attempt'], approve_sha256=result['approveSha256'])

    def test_plan_then_apply_uses_separate_runners_and_retains_remote_state(self):
        args = self.plan()
        self.assertIsNone(self.store.read(transport.LOCK)[0])
        result = self.execute('apply', args)
        self.assertEqual(result, {'status': 'APPLIED_READBACK_CLEAN'})
        self.assertEqual(self.applies, 1)
        raw = self.store.read(transport.SNAPSHOT)[0]
        files = json.loads(raw)['files']
        self.assertIn('attempts/' + args.attempt + '/completed.json', files)
        self.assertNotIn('root/terraform.tfstate', files)
        self.assertIsNotNone(self.store.read(transport.STATE)[0])
        self.assertIsNone(self.store.read(transport.LOCK)[0])
        with self.assertRaises(op.Stop):
            self.execute('apply', args)
        self.assertEqual(self.applies, 1)

    def test_failed_write_ahead_snapshot_prevents_all_infrastructure_mutation(self):
        args = self.plan()
        self.store.fail_checkpoint = True
        with self.assertRaisesRegex(op.Stop, 'PRIVATE_STATE_TRANSPORT_UNCERTAIN'):
            self.execute('apply', args)
        self.assertEqual(self.applies, 0)
        self.assertIsNotNone(self.store.read(transport.LOCK)[0])

    def test_runner_loss_retains_native_state_started_receipt_and_lock(self):
        args = self.plan()
        self.uncertain = True
        with self.assertRaisesRegex(op.Stop, 'TERRAFORM_APPLY_TIMEOUT_UNCERTAIN'):
            self.execute('apply', args)
        files = json.loads(self.store.read(transport.SNAPSHOT)[0])['files']
        self.assertIn('attempts/' + args.attempt + '/started.json', files)
        self.assertNotIn('attempts/' + args.attempt + '/completed.json', files)
        self.assertIsNotNone(self.store.read(transport.STATE)[0])
        with self.assertRaisesRegex(op.Stop, '412'):
            self.execute('apply', args)
        self.assertEqual(self.applies, 1)
        observed = self.execute('observe')
        self.assertTrue(observed['lockPresent'])
        self.assertEqual(observed['terraformStateSha256'], op.sha(self.store.read(transport.STATE)[0]))

    def test_existing_state_without_operator_history_cannot_be_adopted(self):
        self.store.put(transport.STATE, b'{"lineage":"somebody-else"}', '0')
        with self.assertRaisesRegex(op.Stop, 'EXISTING_REMOTE_STATE_WITHOUT_HISTORY'):
            self.plan()
        self.assertEqual(self.applies, 0)

    def test_wrong_approval_and_remote_state_drift_stop_before_apply(self):
        for drift in (False, True):
            with self.subTest(drift=drift):
                self.store = Store()
                args = self.plan()
                if drift:
                    self.store.put(transport.STATE, b'{"serial":9}', '0')
                else:
                    args.approve_sha256 = '0' * 64
                with self.assertRaises(op.Stop):
                    self.execute('apply', args)
                self.assertEqual(self.applies, 0)

    def test_snapshot_rejects_traversal_symlinks_hardlinks_and_local_state(self):
        for name in ('../outside', '/etc/passwd', 'root/../outside', 'root/.terraform/cache', 'root/terraform.tfstate'):
            raw = json.dumps({'version': 1, 'files': {name: base64.b64encode(b'fixture').decode()}}).encode()
            with self.assertRaises(op.Stop):
                transport.restore(self.root / 'invalid', raw)
        home = self.root / 'symlink'
        home.mkdir(mode=0o700)
        (home / 'key').symlink_to(self.variables)
        with self.assertRaises(op.Stop):
            transport.snapshot(home)
        (home / 'key').unlink()
        os.link(self.variables, home / 'key')
        with self.assertRaises(op.Stop):
            transport.snapshot(home)

    def test_equivalent_main_advance_invalidates_saved_plan_without_changing_native_state(self):
        args = self.plan()
        self.source = 'b' * 40
        # Mock git blob reads return equal bytes; infrastructure commands remain fixtures.
        with self.assertRaisesRegex(op.Stop, 'APPROVAL_MISMATCH'):
            self.execute('apply', args)
        self.assertEqual(self.applies, 0)
        self.assertIsNone(self.store.read(transport.STATE)[0])
        files = json.loads(self.store.read(transport.SNAPSHOT)[0])['files']
        self.assertTrue(any(name.endswith('/source-transition.json') for name in files))
        self.assertEqual(json.loads(base64.b64decode(files['owner.json']))['source'], self.source)
        # A new plan against the new protected source succeeds; old history remains.
        fresh = self.plan()
        self.execute('apply', fresh)
        self.assertEqual(self.applies, 1)

    def test_infrastructure_policy_change_cannot_implicitly_rebind_state(self):
        self.plan()
        raw = self.store.read(transport.SNAPSHOT)[0]
        home = self.root / 'policy-change'
        transport.restore(home, raw)
        files = {'main.tf': b'fixture', '.terraform.lock.hcl': b'locked', 'backend.tf': transport.BACKEND}
        with patch.object(transport, 'command', side_effect=[b'old code', b'new code']):
            with self.assertRaisesRegex(op.Stop, 'OPERATOR_POLICY_MIGRATION_REQUIRES_REVIEW'):
                transport.rebind_equivalent_source(home, 'b' * 40, files)
        self.assertEqual(op.read_json(home / 'owner.json')['source'], self.source)
        self.assertEqual(self.applies, 0)

    def test_identity_requires_current_protected_first_attempt_and_distinct_accounts(self):
        env = {'TEST_STACK_OPERATION': 'plan', 'TEST_STACK_ENVIRONMENT': 'jems-test-infrastructure-plan',
            'GITHUB_ACTIONS': 'true', 'GITHUB_REPOSITORY': 'jzwyrzyk/family-game-factory',
            'GITHUB_EVENT_NAME': 'workflow_dispatch', 'GITHUB_REF': 'refs/heads/main', 'GITHUB_REF_PROTECTED': 'true',
            'GITHUB_RUN_ATTEMPT': '1', 'GITHUB_SHA': self.source, 'TEST_STACK_SOURCE': self.source, 'GITHUB_RUN_ID': '12',
            'GITHUB_WORKFLOW_REF': 'jzwyrzyk/family-game-factory/.github/workflows/jems-test-infrastructure.yml@refs/heads/main'}
        self.assertIn('jems-test-infra-plan@', transport.workflow_identity(env)[2])
        for key, value in {'GITHUB_RUN_ATTEMPT': '2', 'GITHUB_REF': 'refs/pull/226/merge',
                           'GITHUB_REF_PROTECTED': 'false', 'TEST_STACK_SOURCE': 'b' * 40,
                           'TEST_STACK_OPERATION': 'apply', 'GITHUB_EVENT_NAME': 'pull_request'}.items():
            with self.assertRaises(op.Stop):
                transport.workflow_identity({**env, key: value})
        self.assertIn('jems-test-infra-apply@', transport.workflow_identity({**env, 'TEST_STACK_OPERATION': 'apply',
                        'TEST_STACK_ENVIRONMENT': 'jems-test-infrastructure-apply'})[2])


if __name__ == '__main__':
    unittest.main()
