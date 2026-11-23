"""Exact-scope activation preparation and interruption recovery, entirely offline."""
import copy
import errno
import hashlib
import io
import json
from contextlib import redirect_stdout
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from admin_api import SetupError
import activation_execute as e
from test_production_activation import fixture


class FakeClient:
    def __init__(self, state):
        self.state, self.writes, self.finished = copy.deepcopy(state), [], []
        self.fail_before = self.fail_after = self.pending_once = False
        self.on_write = None

    def snapshot(self): return copy.deepcopy(self.state)

    def write(self, action, before):
        if self.on_write: self.on_write(action, before)
        self.writes.append(copy.deepcopy(action))
        if self.fail_before: self.fail_before = False; raise SetupError('Uncertain request before visible effect')
        observed = copy.deepcopy(e.after_value(action))
        if action['kind'] in {'policy', 'role'}: observed['etag'] = 'new-etag-' + action['target']
        if action['kind'] == 'policy' and not any(b.get('condition') for b in observed.get('bindings', [])): observed['version'] = 1
        self.state = e.project_after(self.state, action, observed)
        if self.fail_after: self.fail_after = False; raise SetupError('Uncertain request after visible effect')
        return {'name': action['after']['name'] + '/operations/op.1:done', 'done': True} if action['kind'] == 'provider' else observed

    def finish_operation(self, action, response):
        self.finished.append(action['kind'])
        if action['kind'] == 'provider' and self.pending_once:
            self.pending_once = False; raise SetupError('Operation is pending')


class Execution(unittest.TestCase):
    def setUp(self):
        self.temp = self.enterContext(tempfile.TemporaryDirectory())
        self.root = Path(self.temp); self.path = self.root / 'prepared.json'
        self.state = fixture(); self.state['ancestry'] = {'parent_policies': [], 'deny_policies': []}
        self.enterContext(patch.object(e, 'ROLE_HASHES', {role: e.review.digest(value) for role, value in self.state['predefined_roles'].items()}))
        self.enterContext(patch.object(e, 'source_gate'))
        plan = e.review.make_plan({k: v for k, v in self.state.items() if k != 'ancestry'})
        self.prepared = {'schema': 1, 'scope_hash': e.review.digest(e.scope()), 'helper_sha': self.state['source'],
                         'baseline': self.state, 'audit': {'source': self.state['source'], 'claims': self.state['github']['claims_runs'],
                         'ancestry': self.state['ancestry'], 'plan': plan}}
        self.prepared['prepared_hash'] = e.review.digest(self.prepared)
        e.review.private_json(self.path, self.prepared)
        self.client = FakeClient(self.state)
        self.journal = self.root / ('activation-' + self.prepared['prepared_hash'][:16])

    def apply(self, approval=None):
        return e.apply(self.path, self.prepared['prepared_hash'], approval or self.prepared['scope_hash'], self.state['source'], self.client)

    def test_exact_eighteen_writes_preserve_flags_and_unrelated_policies(self):
        def observe(action, before):
            pending = self.journal / 'completion.json.pending'
            self.assertEqual(pending.stat().st_size, 1024 * 1024)
            index = len(self.client.writes)
            intent = e.load_json(self.journal / f'{index:02d}.intent.json')
            self.assertEqual(intent['action'], action); self.assertEqual(intent['before'], before)
            self.assertEqual((self.journal / f'{index:02d}.intent.json').stat().st_mode & 0o777, 0o600)
        self.client.on_write = observe
        result = self.apply()
        self.assertEqual(len(self.client.writes), 18)
        self.assertEqual(result['status'], 'DIRECT_ACTIVATION_VERIFIED_FLAGS_ABSENT')
        self.assertFalse(result['activation_ready'])
        self.assertTrue(all(v is None for v in self.client.state['flags'].values()))
        self.assertTrue((self.journal / 'completion.json').exists())
        again = self.apply()
        self.assertEqual(again, result); self.assertEqual(len(self.client.writes), 18)

    def test_wrong_approval_or_live_drift_never_writes(self):
        with self.assertRaises(SetupError): self.apply('0' * 64)
        self.client.state['flags'][e.review.FLAGS[0]] = {'value': 'true'}
        with self.assertRaises(SetupError): self.apply()
        self.assertEqual(self.client.writes, [])

    def test_uncertain_visible_write_is_reconciled_without_replay(self):
        self.client.fail_after = True
        with self.assertRaises(SetupError): self.apply()
        self.assertEqual(len(self.client.writes), 1)
        self.apply()
        self.assertEqual(len(self.client.writes), 18)
        self.assertTrue(e.load_json(self.journal / '00.done.json')['reconciled'])

    def test_uncertain_invisible_write_stops_without_replay(self):
        self.client.fail_before = True
        with self.assertRaises(SetupError): self.apply()
        with self.assertRaises(SetupError): self.apply()
        self.assertEqual(len(self.client.writes), 1)

    def test_provider_pending_response_is_polled_without_second_patch(self):
        self.client.pending_once = True
        with self.assertRaises(SetupError): self.apply()
        self.assertEqual(sum(a['kind'] == 'provider' for a in self.client.writes), 1)
        self.apply()
        self.assertEqual(sum(a['kind'] == 'provider' for a in self.client.writes), 2)
        self.assertEqual(len(self.client.writes), 18)

    def test_receipt_disk_failure_after_write_is_reconciled_and_no_space_before_write_stops(self):
        with patch.object(e.Receipt, '__enter__', side_effect=OSError(errno.ENOSPC, 'disk full')):
            with self.assertRaises(OSError): self.apply()
        self.assertEqual(self.client.writes, [])
        original = e.review.private_json
        def fail_done(path, value):
            if str(path).endswith('00.done.json'): raise OSError(errno.ENOSPC, 'disk full')
            return original(path, value)
        with patch.object(e.review, 'private_json', side_effect=fail_done):
            with self.assertRaises(OSError): self.apply()
        self.assertEqual(len(self.client.writes), 1)
        self.apply(); self.assertEqual(len(self.client.writes), 18)

    def test_corrupt_done_observation_cannot_bless_an_unapproved_role(self):
        self.apply()
        path = self.journal / '00.done.json'; done = e.load_json(path)
        done['observed']['includedPermissions'].append('run.services.delete')
        path.write_text(json.dumps(done)); path.chmod(0o600)
        self.client.state['roles'][self.client.writes[0]['target']] = done['observed']
        with self.assertRaises(SetupError): self.apply()
        self.assertEqual(len(self.client.writes), 18)

    def test_unconditional_policy_version_downgrade_only_and_etags_remain_required(self):
        before = {'version': 3, 'etag': 'old', 'bindings': [{'role': 'roles/viewer', 'members': ['user:keep@example.test']}]}
        self.assertEqual(e.semantic('policy', before), e.semantic('policy', {**before, 'version': 1}))
        conditional = {**before, 'bindings': [{**before['bindings'][0], 'condition': {'title': 'keep', 'expression': 'true'}}]}
        self.assertNotEqual(e.semantic('policy', conditional), e.semantic('policy', {**conditional, 'version': 1}))
        changed = copy.deepcopy(self.state); changed['policies']['project']['etag'] = 'other'
        with self.assertRaises(SetupError): e.same_state(changed, self.state)


class Preparation(unittest.TestCase):
    def setUp(self):
        self.temp = self.enterContext(tempfile.TemporaryDirectory()); self.root = Path(self.temp)
        self.evidence = self.root / 'historical'; self.evidence.mkdir(mode=0o700)
        state = fixture(); state['source'] = state['github']['source'] = e.diagnostic.RELEASE_SOURCE
        self.old = state; self.ancestry = {'parent_policies': [], 'deny_policies': []}
        self.roles = {role: e.review.digest(value) for role, value in state['predefined_roles'].items()}
        plan = e.review.make_plan(state); probes, errors = [], []
        for lane, principal, resource, permission in sorted(e.probe_keys(state)):
            public = permission == 'run.routes.invoke' and resource.rsplit('/', 1)[-1] in {'factory-gateway', 'factory-preview'}
            unknown = permission == 'run.revisions.get'
            probes.append({'lane': lane, 'principal': principal, 'resource': resource, 'permission': permission,
                           'observed_access': 'UNKNOWN' if unknown else 'CAN_ACCESS' if public else 'CANNOT_ACCESS'})
            if unknown: errors.append({'scope': 'effective:' + lane + ':run.revisions.get', 'diagnostic': {
                'http_status': 400, 'error_status': 'INVALID_ARGUMENT', 'invalid_fields': ['accessTuple.fullResourceName']}})
        audit = {'plan': plan, 'state': state, 'final_state': {k: v for k, v in state.items() if k != 'predefined_roles'},
                 'predefined_roles': state['predefined_roles'], 'final_predefined_roles': state['predefined_roles'],
                 'ancestry_audit': self.ancestry, 'effective_audit': {'probes': probes, 'untested': [], 'unknown_count': 6}, 'errors': errors}
        records = {'raw-responses.json': [], 'prior-file-comparison.json': {}, 'audit.json': audit,
                   'proposed-activation-plan.json': plan, 'summary.json': {'helper_sha': e.HISTORICAL_HELPER,
                   'release_source': state['source'], 'review_code': plan['review_code'], 'mutations': 0, 'activation_ready': False}}
        for name, value in records.items(): e.review.private_json(self.evidence / name, value)
        e.review.private_json(self.evidence / 'SHA256SUMS.json', {
            name: hashlib.sha256((self.evidence / name).read_bytes()).hexdigest() for name in records})
        self.manifest = hashlib.sha256((self.evidence / 'SHA256SUMS.json').read_bytes()).hexdigest()
        self.enterContext(patch.object(e, 'ROLE_HASHES', self.roles))
        self.enterContext(patch.object(e, 'HISTORICAL_MANIFEST', self.manifest))
        self.enterContext(patch.object(e.diagnostic, 'ORIGINAL_REVIEW', plan['review_code']))
        self.gate = self.enterContext(patch.object(e, 'source_gate'))
        self.source, self.claims = 'c' * 40, {'publish': 9001, 'release': 9002}
        live = copy.deepcopy(state); live['source'] = live['github']['source'] = self.source
        live['github']['claims_runs'] = self.claims; live['ancestry'] = self.ancestry
        self.client = FakeClient(live)

    def test_historical_rebind_changes_only_source_and_fresh_claims(self):
        result = e.prepare(self.evidence, self.manifest, self.source, self.root / 'prepared', self.claims, self.client)
        self.gate.assert_called_once_with(self.source, self.source)
        self.assertEqual(result['audit']['historical_source'], self.old['source'])
        self.assertEqual(result['audit']['historical_helper'], e.HISTORICAL_HELPER)
        self.assertEqual(result['audit']['historical_claims'], self.old['github']['claims_runs'])
        self.assertEqual(result['audit']['historical_manifest'], self.manifest)
        self.assertEqual(result['audit']['plan']['state']['github']['claims_runs'], self.claims)
        self.assertNotEqual(result['audit']['plan']['review_code'], result['audit']['historical_review_code'])
        self.assertEqual(len(result['audit']['unknown_revisions']), 6)
        self.assertEqual(self.client.writes, [])

    def test_tampered_evidence_and_nonmetadata_live_drift_fail_before_preparation(self):
        with self.assertRaises(SetupError): e.audit_evidence(self.evidence, '0' * 64)
        self.client.state['services']['factory-gateway']['etag'] = 'changed'
        with self.assertRaises(SetupError): e.prepare(self.evidence, self.manifest, self.source, self.root / 'bad', self.claims, self.client)
        self.assertFalse((self.root / 'bad').exists()); self.assertEqual(self.client.writes, [])
        (self.evidence / 'audit.json').write_text('{}')
        with self.assertRaises(SetupError): e.audit_evidence(self.evidence, self.manifest)

    def test_wrong_claims_and_actor_delegation_are_not_rebased(self):
        with self.assertRaises(SetupError): e.prepare(self.evidence, self.manifest, self.source, self.root / 'wrong', {'publish': 1, 'release': 2}, self.client)
        self.client.state['providers']['publish']['actorProviders'] = ['unreviewed']
        with self.assertRaises(SetupError): e.prepare(self.evidence, self.manifest, self.source, self.root / 'actor', self.claims, self.client)

    def test_default_describe_is_offline_and_dependency_pins_match_reviewed_bytes(self):
        output = io.StringIO()
        with patch('sys.argv', ['activation_execute.py']), patch.object(e, 'Client', side_effect=AssertionError('must remain offline')), redirect_stdout(output):
            e.main()
        result = json.loads(output.getvalue())
        self.assertEqual(result['owner_approval'], 'NOT_GRANTED_BY_THIS_OUTPUT')
        self.assertEqual(len(result['scope']['roles']), 2); self.assertEqual(len(result['scope']['variables']), 4)
        for path, expected in e.SOURCE_HASHES.items():
            self.assertEqual(hashlib.sha256((e.review.ROOT / path).read_bytes()).hexdigest(), expected, path)


if __name__ == '__main__': unittest.main()
