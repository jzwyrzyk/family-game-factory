"""Read-only production collector boundaries and exact-scope failure cases."""
import copy
import hashlib
import json
import os
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch

import production_activation as a
from admin_api import SetupError


def fixture():
    s = {'source': 'a' * 40, 'project': {'id': a.PROJECT, 'number': a.NUMBER},
         'github': {'source': 'a' * 40, 'protected': True, 'shadow_variables': [],
                    'claims_runs': {'publish': 1, 'release': 2}},
         'registry': {'format': 'DOCKER', 'immutable_tags': True, 'cleanup_policies': {}, 'empty': True},
         'services': {name: {'baseline': name + '-00001-a', 'image': 'registry/image@sha256:' + 'b' * 64,
                            'configuration': 'c' * 64, 'configuration_matches': True,
                            'runtime_account': email, 'etag': 'service-etag'} for name, email in a.RUNTIMES.items()},
         'providers': {}, 'roles': {k: None for k in a.ROLE_IDS}, 'keys': [],
         'predefined_roles': {role: {'name': role, 'includedPermissions': ['fixture.permission']} for role in a.PREDEFINED_ROLES},
         'variables': {n: None for n in a.VARIABLES}, 'flags': {n: None for n in a.FLAGS}}
    for lane in a.ACCOUNTS:
        prefix = 'PUBLISH' if lane == 'publish' else 'RELEASE'
        s['providers'][lane] = {'name': a.VARIABLES[f'JEMS_{prefix}_WIF_PROVIDER'], 'state': 'ACTIVE',
            'disabled': True, 'description': a.admin_cloud.MARKER,
            'attributeMapping': {'google.subject': 'assertion.sub'},
            'attributeCondition': a.admin_cloud.lane_condition(lane),
            'oidc': {'issuerUri': 'https://token.actions.githubusercontent.com'}}
    s['policies'] = {target: {'etag': 'policy-etag-' + target, 'version': 3, 'bindings': []}
                     for target in a.permission_pairs(s)}
    return s


def bare_live():
    live = a.Live.__new__(a.Live)
    live.evidence, live.errors = [], []
    live.started, live.calls, live.evidence_bytes = time.monotonic(), 0, 0
    return live


class ExactScope(unittest.TestCase):
    def test_proposal_has_exact_scopes_and_no_enable_flag_actions(self):
        plan = a.make_plan(fixture())
        self.assertFalse(plan['activation_ready'])
        bindings = [x for x in plan['actions'] if x['kind'] == 'policy']
        self.assertEqual(len(bindings), 10)  # Registry combines publisher/release into one policy.
        self.assertEqual(sum(len(v) for v in a.permission_pairs(fixture()).values()), 11)
        self.assertEqual([x['target'] for x in plan['actions'] if x['kind'] == 'variable'], list(a.VARIABLES))
        self.assertFalse(any(x['target'] in a.FLAGS for x in plan['actions']))
        self.assertEqual(plan['review_code'], a.digest({k: v for k, v in plan.items() if k != 'review_code'}))
        for lane in a.ACCOUNTS:
            self.assertTrue(a.own_subject(lane).startswith('principal://'))
            self.assertNotIn('principalSet', a.own_subject(lane))

    def test_unrelated_conditions_audit_configs_and_etag_are_preserved(self):
        state = fixture()
        original = {'role': 'roles/viewer', 'members': ['user:existing@example.test'],
                    'condition': {'title': 'existing', 'expression': 'request.time < timestamp("2030-01-01T00:00:00Z")'}}
        policy = state['policies']['project']
        policy['bindings'].append(original)
        policy['auditConfigs'] = [{'service': 'allServices', 'auditLogConfigs': [{'logType': 'ADMIN_READ'}]}]
        before = copy.deepcopy(policy)
        proposal = next(x for x in a.make_plan(state)['actions'] if x['kind'] == 'policy' and x['target'] == 'project')
        self.assertEqual(policy, before)
        self.assertIn(original, proposal['after']['bindings'])
        self.assertEqual(proposal['after']['auditConfigs'], before['auditConfigs'])
        self.assertEqual(proposal['after']['etag'], before['etag'])

    def test_existing_exact_tuple_is_not_duplicated(self):
        state = fixture()
        state['policies']['registry'] = a.add_members(state['policies']['registry'], a.permission_pairs(state)['registry'])
        self.assertFalse(any(x['kind'] == 'policy' and x['target'] == 'registry' for x in a.make_plan(state)['actions']))

    def test_unknown_or_broadened_state_stops_exact_diff(self):
        mutations = [
            lambda s: s['project'].update(number='999999'),
            lambda s: s['registry'].update(immutable_tags=False),
            lambda s: s['registry'].update(cleanup_policies={'prune': {}}),
            lambda s: s['flags'].update({a.FLAGS[0]: {'name': a.FLAGS[0], 'value': 'false'}}),
            lambda s: s['variables'].update({next(iter(a.VARIABLES)): 'unexpected'}),
            lambda s: s['keys'].append({'name': 'key'}),
            lambda s: s['predefined_roles'].update({a.PREDEFINED_ROLES[0]: None}),
            lambda s: s['github'].update(shadow_variables=['JEMS_RELEASE_SERVICE_ACCOUNT']),
            lambda s: s['providers']['publish'].update(disabled=False),
            lambda s: s['providers']['release'].update(attributeCondition='true'),
            lambda s: s['providers']['release']['oidc'].update(allowedAudiences=['unexpected']),
            lambda s: s['services']['factory-gateway'].update(runtime_account='other@' + a.PROJECT + '.iam.gserviceaccount.com'),
            lambda s: s['services']['factory-preview'].update(configuration_matches=False),
            lambda s: s['roles'].update(services={**a.expected_role('services'), 'includedPermissions': ['run.services.delete']}),
            lambda s: s['roles'].update(services={**a.expected_role('services'), 'deleted': True}),
            lambda s: s['policies']['project'].pop('etag'),
            lambda s: s['policies']['project']['bindings'].append({'role': 'roles/owner', 'members': ['serviceAccount:' + a.ACCOUNTS['release']]}),
        ]
        for change in mutations:
            with self.subTest(change=change):
                state = fixture(); change(state)
                with self.assertRaises(SetupError): a.make_plan(state)

    def test_actual_runtime_account_is_not_inferred_from_service_label(self):
        state = fixture()
        self.assertEqual(state['services']['factory-coach-private']['runtime_account'], a.RUNTIMES['factory-coach-private'])
        state['services']['factory-coach-private']['runtime_account'] = 'factory-coach-private@' + a.PROJECT + '.iam.gserviceaccount.com'
        with self.assertRaises(SetupError): a.make_plan(state)


class ReadOnlyClient(unittest.TestCase):
    def test_all_mutating_methods_and_posts_rejected_before_call(self):
        live = bare_live(); calls = []
        for origin in ('iam', 'crm', 'registry', 'run', 'troubleshooter', 'github'):
            read = live.readonly(lambda *args, **kwargs: calls.append(args), origin)
            for method, path in [('PATCH', 'v1/provider'), ('PUT', 'resource'), ('DELETE', 'resource'),
                                 ('POST', 'v1/resource:setIamPolicy'), ('POST', 'actions/workflows/w/dispatches'),
                                 ('POST', 'v1/resource:generateAccessToken'), ('POST', 'v1/projects/other:getAncestry')]:
                with self.subTest(origin=origin, method=method, path=path):
                    with self.assertRaises(SetupError): read(method, path, {})
        self.assertEqual(calls, [])
        self.assertFalse(hasattr(a.Live, 'write_target'))
        self.assertFalse(hasattr(a, 'apply_plan'))

    def test_only_nonmutating_post_endpoints_are_allowed(self):
        live = bare_live(); calls = []
        for origin, path in [('iam', 'v1/projects/p/serviceAccounts/a:getIamPolicy?options.requestedPolicyVersion=3'),
                             ('crm', f'v1/projects/{a.PROJECT}:getAncestry'),
                             ('crm', 'v3/folders/123:getIamPolicy'), ('troubleshooter', 'v3/iam:troubleshoot')]:
            live.readonly(lambda *args, **kwargs: calls.append(args) or {}, origin)('POST', path)
        self.assertEqual(len(calls), 4)
        self.assertEqual(len(live.evidence), 4)
        self.assertIn('observed_at_utc', live.evidence[0])

    def test_service_account_and_project_policy_protocols_differ(self):
        live = bare_live(); calls = []
        live.http = {name: lambda *args, name=name, **kwargs: calls.append((name, args)) or {'etag': 'x'}
                     for name in ('iam', 'crm', 'run', 'registry')}
        live.read_target('policy', 'account:' + a.ACCOUNTS['publish'])
        live.read_target('policy', 'project')
        live.read_target('policy', 'service:factory-gateway')
        self.assertEqual(calls[0][1][0], 'POST')
        self.assertTrue(calls[0][1][1].endswith(':getIamPolicy?options.requestedPolicyVersion=3'))
        self.assertEqual(len(calls[0][1]), 2)  # Empty IAM request body is required by discovery.
        self.assertEqual(calls[1][1][2], {'options': {'requestedPolicyVersion': 3}})
        self.assertEqual(calls[2][1][0], 'GET')

    def test_budget_failure_makes_no_network_call(self):
        live = bare_live(); live.calls = 400
        calls = []
        with self.assertRaises(SetupError): live.readonly(lambda *x: calls.append(x), 'iam')('GET', 'v1/x')
        self.assertEqual(calls, [])

    def test_effective_unknown_and_api_failure_are_not_denials(self):
        live = bare_live()
        live.http = {'troubleshooter': lambda *args: {'overallAccessState': 'UNKNOWN_CONDITIONAL'}}
        result = live.effective_audit()
        self.assertEqual(result['unknown_count'], len(result['probes']) + len(result['untested']))
        self.assertEqual({p['observed_access'] for p in result['probes']}, {'UNKNOWN'})
        def denied(*args): raise SetupError('POST troubleshooting returned HTTP 403')
        live.http['troubleshooter'] = denied
        result = live.effective_audit()
        self.assertEqual(result['unknown_count'], len(result['probes']) + len(result['untested']))
        self.assertTrue(live.errors)

    def test_serving_revision_probes_and_predefined_role_reads_are_exact(self):
        live = bare_live(); calls = []
        live.http = {'troubleshooter': lambda method, path, data: calls.append(data['accessTuple']) or {'overallAccessState': 'CANNOT_ACCESS'},
                     'iam': lambda method, path: {'name': path[3:], 'includedPermissions': ['fixture.permission']}}
        result = live.effective_audit(fixture())
        self.assertEqual(result['unknown_count'], 0)
        revisions = [p for p in calls if p['permission'] == 'run.revisions.get']
        self.assertEqual(len(revisions), 6)
        self.assertEqual({p['fullResourceName'] for p in revisions}, {
            '//run.googleapis.com/' + a.release.LOCATION + '/revisions/' + row['baseline']
            for row in fixture()['services'].values()})
        roles = live.predefined_roles()
        self.assertEqual(set(roles), set(a.PREDEFINED_ROLES))
        live.http['iam'] = lambda *args: {'name': 'roles/unexpected', 'includedPermissions': ['anything']}
        self.assertEqual(set(live.predefined_roles().values()), {None})
        self.assertEqual(len(live.errors), 4)

    def test_deny_policy_metadata_requires_individual_get(self):
        live = bare_live(); calls = []
        attachment = 'cloudresourcemanager.googleapis.com%2Fprojects%2F' + a.NUMBER
        name = 'policies/' + attachment + '/denypolicies/example'
        live.http = {
            'crm': lambda *args: {'ancestor': [{'resourceId': {'type': 'project', 'id': a.NUMBER}}]},
            'iam': lambda method, path: calls.append(path) or ({'policies': [{'name': name}]} if '?' in path else {'name': name, 'rules': [{'description': 'private rule'}]})}
        result = live.ancestry_audit()
        self.assertEqual(calls, ['v2/policies/' + attachment + '/denypolicies?pageSize=100', 'v2/' + name])
        self.assertEqual(result['deny_policies'][0]['policy']['rules'][0]['description'], 'private rule')


class EvidenceFiles(unittest.TestCase):
    def test_create_only_private_fsynced_file_and_no_overwrite(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'receipt.json'
            a.private_json(path, {'value': 1})
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            self.assertEqual(a.read_private(path), {'value': 1})
            with self.assertRaises(SetupError): a.private_json(path, {'value': 2})
            self.assertEqual(a.read_private(path), {'value': 1})

    def test_existing_symlink_is_never_replaced(self):
        with tempfile.TemporaryDirectory() as directory:
            p = Path(directory); real = p / 'real'; real.write_text('preserve')
            link = p / 'link'; link.symlink_to(real)
            with self.assertRaises(SetupError): a.private_json(link, {})
            self.assertEqual(real.read_text(), 'preserve')

    def test_known_prior_files_are_optional_and_never_executed(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory); proposal = base / 'proposal.txt'; proposal.write_text('historical only')
            path = base / 'factory-gateway.json'
            state = fixture(); row = state['services']['factory-gateway']
            path.write_text(json.dumps({'service': 'factory-gateway', 'baseline': row['baseline'],
                                       'baselineImage': row['image'], 'configuration': row['configuration'],
                                       'matchesServingConfiguration': True}))
            original = path.read_bytes()
            with patch.object(a, 'PRIOR_DIRECTORY', base), patch.object(a, 'PRIOR_PROPOSAL', proposal):
                result = a.prior_files(state)
            observed = next(r for r in result['files'] if r['path'] == str(path))
            self.assertTrue(observed['matches_fresh_fields'])
            self.assertTrue(observed['complete_baseline_fields'])
            self.assertEqual(path.read_bytes(), original)
            self.assertTrue(any(r['status'] == 'ABSENT' for r in result['files']))

    def test_unknown_audit_cannot_emit_complete_review(self):
        state = fixture(); plan = a.make_plan(state)
        class Client:
            evidence = [{'private': 'full policy'}]
            def collect(self): return {'state': state, 'plan': plan, 'errors': [],
                'effective_audit': {'unknown_count': 1, 'limit': 'unknown is not denial', 'probes': []}}
        with tempfile.TemporaryDirectory() as directory:
            out = Path(directory) / 'new'
            with patch.object(a, 'prior_files', return_value={'files': []}):
                result = a.collect_to_directory(Client(), 'a'*40, 'd'*40, out)
            self.assertEqual(result['status'], 'READ_ONLY_REVIEW_INCOMPLETE')
            self.assertFalse(result['activation_ready'])
            self.assertEqual(result['mutations'], 0)
            self.assertEqual(out.stat().st_mode & 0o777, 0o700)
            for name, digest in json.loads((out / 'SHA256SUMS.json').read_text()).items():
                self.assertEqual(hashlib.sha256((out/name).read_bytes()).hexdigest(), digest)
            self.assertNotIn('full policy', json.dumps(result))

    def test_effective_grants_are_visible_and_failed_scope_emits_no_proposal(self):
        state = fixture()
        state['services']['factory-coach-private']['runtime_account'] = 'unreviewed@invalid.example'
        probe = {'lane': 'publish', 'principal': a.ACCOUNTS['publish'],
                 'resource': '//run.googleapis.com/' + a.release.LOCATION + '/services/factory-preview',
                 'permission': 'run.routes.invoke', 'observed_access': 'CAN_ACCESS'}
        class Client:
            evidence = []
            def collect(self): return {'state': state, 'plan': None,
                'errors': [{'scope': 'exact-proposed-diff', 'status': 'UNKNOWN', 'reason': 'Runtime differs'}],
                'effective_audit': {'unknown_count': 0, 'limit': 'finite checks', 'probes': [probe]}}
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(a, 'prior_files', return_value={'files': []}):
                result = a.collect_to_directory(Client(), 'a'*40, 'd'*40, Path(directory) / 'new')
        self.assertEqual(result['status'], 'READ_ONLY_REVIEW_INCOMPLETE')
        self.assertEqual(result['proposal_status'], 'BLOCKED')
        self.assertEqual(result['proposed_bindings'], [])
        self.assertEqual(result['proposed_identity_variables'], {})
        self.assertNotIn('unreviewed@invalid.example', json.dumps(result))
        self.assertEqual(result['current_effective_grants'][0]['principal'], a.ACCOUNTS['publish'])
        self.assertIn('existing public ingress', result['current_effective_grants'][0]['review_note'])

    def test_helper_pin_is_separate_from_release_source(self):
        source, helper = 'a'*40, 'd'*40
        def fake_git(*args):
            if args[:2] == ('rev-parse', 'HEAD'): return helper
            if args[0] == 'status': return ''
            if args[0] == 'diff': return 'DELIVERY-STATE.md'
            raise AssertionError(args)
        with patch.object(a, 'git', side_effect=fake_git), patch.object(a, 'command', return_value=''):
            self.assertEqual(a.clean_source(source, helper), source)
            with self.assertRaises(SetupError): a.clean_source(source, 'e'*40)


if __name__ == '__main__': unittest.main()
