"""Credential-free tests of private saved-plan approval and unknown-result recovery."""
import json
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import integrated_test_stack as op


def program(actions=('create',), **extra):
    return {'complete': True, 'resource_changes': [{'address': 'google_storage_bucket.test[0]',
            'mode': 'managed', 'change': {'actions': list(actions), 'after': {'project': op.PROJECT}}}], **extra}


class SavedPlanTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.home = Path(directory.name)
        self.tf = self.home / 'root'
        self.tf.mkdir(mode=0o700)
        (self.home / 'attempts').mkdir(mode=0o700)
        op.write_new(self.home / 'key', os.urandom(32))
        self.variables = self.home / 'fixture-inputs.json'
        op.write_new(self.variables, {'stage': 'foundation', 'project_number': '123456789'})
        self.secret = 'synthetic-opaque-private-value'
        self.source = 'a' * 40
        self.actions = []
        self.uncertain = False
        self.show = program()

    def terraform(self, args, *_args, **_kwargs):
        self.actions.append(args[1])
        if args[1] == 'plan':
            path = Path(next(x[5:] for x in args if x.startswith('-out=')))
            path.write_bytes(path.name.encode())
            path.chmod(0o600)
        if args[1] == 'show':
            plan = self.show if args[-1].endswith('review.tfplan') else program(['no-op'])
            return json.dumps(plan).encode()
        if args[1] == 'apply':
            if self.uncertain:
                raise op.Stop('TERRAFORM_APPLY_TIMEOUT_UNCERTAIN')
            op.write_new(self.tf / 'terraform.tfstate', {'lineage': 'synthetic', 'serial': 1})
        return b'{}'

    def plan(self):
        result = op.prepare(self.home, self.tf, self.source, SimpleNamespace(variables=self.variables), self.secret)
        return SimpleNamespace(attempt=result['attempt'], approve_sha256=result['approveSha256'])

    def test_success_seals_exact_binary_and_readback(self):
        with patch.object(op, 'command', self.terraform):
            args = self.plan()
            result = op.apply(self.home, self.tf, self.source, args, self.secret)
            self.assertEqual(result['status'], 'APPLIED_READBACK_CLEAN')
            with self.assertRaises(op.Stop): op.apply(self.home, self.tf, self.source, args, self.secret)
            self.assertEqual(self.actions.count('apply'), 1)

    def test_approval_inputs_state_secret_and_binary(self):
        with patch.object(op, 'command', self.terraform):
            a = self.plan()
            with self.assertRaises(op.Stop): op.apply(self.home, self.tf, self.source, a, 'other')
            wrong = SimpleNamespace(attempt=a.attempt, approve_sha256='0'*64)
            with self.assertRaises(op.Stop): op.apply(self.home, self.tf, self.source, wrong, self.secret)
            path = self.home / 'attempts' / a.attempt / 'review.tfplan'
            path.write_bytes(b'altered')
            with self.assertRaises(op.Stop): op.apply(self.home, self.tf, self.source, a, self.secret)
            fresh = self.plan()
            op.write_new(self.tf / 'terraform.tfstate', {'serial': 2})
            with self.assertRaises(op.Stop): op.apply(self.home, self.tf, self.source, fresh, self.secret)
            self.assertNotIn('apply', self.actions)

    def test_uncertain_apply_prevents_retry_and_invalidates_older_plans(self):
        with patch.object(op, 'command', self.terraform):
            first, older = self.plan(), self.plan()
            self.uncertain = True
            with self.assertRaises(op.Stop): op.apply(self.home, self.tf, self.source, first, self.secret)
            self.assertEqual(op.unresolved(self.home), [first.attempt])
            with self.assertRaises(op.Stop): self.plan()
            op.write_new(self.home / 'attempts' / first.attempt / 'reconciled.json', {'test':'recorded'})
            with self.assertRaisesRegex(op.Stop, 'STATE_ADVANCED'):
                op.apply(self.home, self.tf, self.source, older, self.secret)
            self.assertEqual(self.actions.count('apply'), 1)

    def test_rejects_destructive_drift_or_cross_project(self):
        for actions in (['delete'], ['create','delete'], ['delete','create'], ['forget']):
            with self.assertRaises(op.Stop): op.review(program(actions))
        for fields in ({'resource_drift':[{}]}, {'deferred_changes':[{}]}, {'complete':False},
                       {'errored':True}, {'checks':[{'status':'fail'}]}):
            with self.assertRaises(op.Stop): op.review(program(**fields))
        cross = program()
        cross['resource_changes'][0]['change']['after']['project'] = 'family-game-factory-jzw'
        with self.assertRaises(op.Stop): op.review(cross)
        with self.assertRaises(op.Stop): op.review(program(resource_changes=[{
            'address':'a', 'mode':'managed','previous_address':'z','change':{'actions':['no-op']}}]))

    def test_initialize_resumes_failed_download_without_adopting_other_state(self):
        home = self.home / 'separate-test-stack'
        files = {'variables.tf': b'fixture', '.terraform.lock.hcl': b'locked'}
        with patch.object(op, 'command', side_effect=op.Stop('TERRAFORM_INIT_FAILED')):
            with self.assertRaises(op.Stop):
                op.initialize(home, self.source, files)
        with patch.object(op, 'command', return_value=b'') as cli:
            op.initialize(home, self.source, files)
            op.initialize(home, self.source, files)
            self.assertEqual(cli.call_count, 1)
            with self.assertRaises(op.Stop):
                op.initialize(home, 'b' * 40, files)
