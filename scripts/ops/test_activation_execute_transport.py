"""Offline activation wire contracts: exact resources and no replay of writes."""
import copy
import io
import json
import unittest
import urllib.error
from unittest.mock import patch

from admin_api import Http, SetupError
import activation_execute as execute
from test_production_activation import fixture


class Response:
    def __init__(self, body=None, code=200):
        self.code = code
        self.body = json.dumps(body if body is not None else {}).encode()

    def __enter__(self): return self
    def __exit__(self, *args): return None
    def read(self, size): return self.body[:size]


class Wire:
    """Records requests; it has no network-capable delegate."""
    def __init__(self):
        self.requests = []
        self.responses = []

    def open(self, request, timeout):
        self.requests.append(request)
        result = self.responses.pop(0) if self.responses else Response()
        if isinstance(result, Exception): raise result
        return result


class ActivationTransport(unittest.TestCase):
    def setUp(self):
        # Any accidental use of the real opener fails, including newly added paths.
        self.enterContext(patch('urllib.request.OpenerDirector.open',
                                side_effect=AssertionError('Network is forbidden in transport tests')))
        self.state = fixture()
        self.kept = {'role': 'roles/viewer', 'members': ['user:existing@example.test'],
                     'condition': {'title': 'existing', 'expression': 'true'}}
        self.audit = [{'service': 'allServices', 'auditLogConfigs': [{'logType': 'ADMIN_READ'}]}]
        for policy in self.state['policies'].values():
            policy['bindings'].append(copy.deepcopy(self.kept))
            policy['auditConfigs'] = copy.deepcopy(self.audit)
        self.client = execute.Client.__new__(execute.Client)
        self.client.actions = execute.review.make_plan(self.state)['actions']
        self.client.reader = execute.review.Live.__new__(execute.review.Live)
        self.wire = Wire()
        origins = {'iam': 'https://iam.googleapis.com', 'crm': 'https://cloudresourcemanager.googleapis.com',
                   'run': 'https://run.googleapis.com', 'registry': 'https://artifactregistry.googleapis.com'}
        self.client.write_apis = {}
        for key, origin in origins.items():
            api = Http(origin, 'fixture-token')
            api.opener = self.wire
            self.client.write_apis[key] = api.call
        self.client.reader.http = self.client.write_apis
        self.client.github = Http('https://api.github.com', 'fixture-token')
        self.client.github.opener = self.wire
        self.sleep = self.enterContext(patch.object(execute.time, 'sleep'))

    def actions(self, kind): return [a for a in self.client.actions if a['kind'] == kind]
    def operation(self, action, **fields):
        return {'name': action['after']['name'] + '/operations/op.1:done', **fields}

    def test_custom_roles_are_created_under_project_without_output_only_name(self):
        roles = self.actions('role')
        self.assertEqual(len(roles), 2)
        for action in roles:
            self.client.write(action, None)
            request = self.wire.requests[-1]
            body = json.loads(request.data)
            self.assertEqual(request.method, 'POST')
            self.assertEqual(request.full_url, 'https://iam.googleapis.com/v1/projects/family-game-factory-jzw/roles')
            self.assertEqual(set(body), {'roleId', 'role'})
            self.assertEqual(body['roleId'], action['after']['name'].rsplit('/', 1)[1])
            self.assertEqual(set(body['role']), {'title', 'description', 'includedPermissions', 'stage'})
            self.assertEqual(body['role']['includedPermissions'], action['after']['includedPermissions'])
        before_count = len(self.wire.requests)
        with self.assertRaises(SetupError): self.client.write(roles[0], roles[0]['after'])
        broadened = copy.deepcopy(roles[0])
        broadened['after']['includedPermissions'].append('run.services.delete')
        with self.assertRaises(SetupError): self.client.write(broadened, None)
        self.assertEqual(len(self.wire.requests), before_count)

    def test_ten_policy_routes_preserve_etags_conditions_and_nonbinding_fields(self):
        expected = {
            'registry': 'https://artifactregistry.googleapis.com/v1/projects/family-game-factory-jzw/locations/us-east5/repositories/jems-release-images:setIamPolicy',
            'project': 'https://cloudresourcemanager.googleapis.com/v1/projects/family-game-factory-jzw:setIamPolicy',
        }
        for service in ('factory-gateway', 'factory-preview', 'factory-coach-private'):
            expected['service:' + service] = 'https://run.googleapis.com/v2/projects/family-game-factory-jzw/locations/us-east5/services/' + service + ':setIamPolicy'
        for account in ('factory-gateway', 'factory-preview', 'factory-coach', 'jems-image-publisher', 'jems-cloud-run-release'):
            email = account + '@family-game-factory-jzw.iam.gserviceaccount.com'
            expected['account:' + email] = 'https://iam.googleapis.com/v1/projects/family-game-factory-jzw/serviceAccounts/' + email + ':setIamPolicy'
        policies = self.actions('policy')
        self.assertEqual({a['target'] for a in policies}, set(expected))
        self.assertEqual(len(policies), 10)
        unchanged = copy.deepcopy(policies)
        for action in policies:
            self.client.write(action, action['before'])
            request = self.wire.requests[-1]
            self.assertEqual((request.method, request.full_url), ('POST', expected[action['target']]))
            body = json.loads(request.data)
            self.assertEqual(set(body), {'policy'})
            self.assertEqual(body['policy'], action['after'])
            self.assertEqual(body['policy']['etag'], action['before']['etag'])
            self.assertEqual(body['policy']['version'], 3)
            self.assertEqual(body['policy']['auditConfigs'], self.audit)
            self.assertIn(self.kept, body['policy']['bindings'])
        self.assertEqual(policies, unchanged)

    def test_missing_or_stale_policy_etag_never_sends_a_write(self):
        for action in self.actions('policy'):
            for etag in (None, '', 'changed-since-review'):
                before = {**action['before'], 'etag': etag}
                with self.subTest(target=action['target'], etag=etag), self.assertRaises(SetupError):
                    self.client.write(action, before)
        self.assertEqual(self.wire.requests, [])

    def test_both_provider_patches_change_only_disabled(self):
        providers = self.actions('provider')
        self.assertEqual(len(providers), 2)
        for action in providers:
            self.client.write(action, action['before'])
            request = self.wire.requests[-1]
            self.assertEqual((request.method, request.full_url), ('PATCH',
                'https://iam.googleapis.com/v1/' + action['after']['name'] + '?updateMask=disabled'))
            self.assertEqual(json.loads(request.data), {'name': action['after']['name'], 'disabled': False})

    def test_google_write_failures_are_not_retried(self):
        for kind in ('role', 'policy', 'provider'):
            action = self.actions(kind)[0]
            for error in (TimeoutError('private detail'), urllib.error.URLError('private detail'),
                          urllib.error.HTTPError('https://example.invalid', 503, 'private detail', {}, io.BytesIO())):
                self.wire.requests.clear()
                self.wire.responses = [error]
                with self.subTest(kind=kind, error=type(error).__name__), self.assertRaises(SetupError) as raised:
                    self.client.write(action, action['before'])
                self.assertNotIn('private detail', str(raised.exception))
                self.assertEqual(len(self.wire.requests), 1)

    def test_all_four_identity_variables_use_create_and_require_201(self):
        variables = self.actions('variable')
        self.assertEqual({a['target'] for a in variables}, {
            'JEMS_PUBLISH_WIF_PROVIDER', 'JEMS_PUBLISH_SERVICE_ACCOUNT',
            'JEMS_RELEASE_WIF_PROVIDER', 'JEMS_RELEASE_SERVICE_ACCOUNT'})
        for action in variables:
            self.wire.responses = [Response(code=201)]
            self.assertEqual(self.client.write(action, None), {'http_status': 201})
            request = self.wire.requests[-1]
            self.assertEqual((request.method, request.full_url), ('POST',
                'https://api.github.com/repos/jzwyrzyk/family-game-factory/actions/variables'))
            self.assertEqual(json.loads(request.data), {'name': action['target'], 'value': action['after']['value']})
            before_count = len(self.wire.requests)
            with self.assertRaises(SetupError): self.client.write(action, action['after']['value'])
            self.assertEqual(len(self.wire.requests), before_count)

    def test_variable_conflict_timeout_and_unexpected_status_never_patch_or_retry(self):
        action = self.actions('variable')[0]
        outcomes = [Response(code=code) for code in (200, 202, 204, 409)] + [
            urllib.error.HTTPError('https://example.invalid', 409, 'private detail', {}, io.BytesIO()),
            urllib.error.HTTPError('https://example.invalid', 503, 'private detail', {}, io.BytesIO()),
            urllib.error.URLError('private detail'), TimeoutError('private detail'), OSError('private detail')]
        for result in outcomes:
            self.wire.requests.clear()
            self.wire.responses = [result]
            with self.subTest(outcome=getattr(result, 'code', type(result).__name__)), self.assertRaises(SetupError) as raised:
                self.client.write(action, None)
            self.assertNotIn('private detail', str(raised.exception))
            self.assertEqual([r.method for r in self.wire.requests], ['POST'])

    def test_done_requires_literal_true_and_error_free_result(self):
        action = self.actions('provider')[0]
        self.client.finish_operation(action, self.operation(action, done=True))
        self.assertEqual(self.wire.requests, [])
        with self.assertRaises(SetupError):
            self.client.finish_operation(action, self.operation(action, done=True, error={}))
        for done in (False, 1, 'true', None):
            self.wire.requests.clear()
            self.wire.responses = [Response(self.operation(action, done=True))]
            self.client.finish_operation(action, self.operation(action, done=done))
            self.assertEqual([r.method for r in self.wire.requests], ['GET'])

    def test_operation_cannot_escape_exact_provider_or_single_safe_segment(self):
        action, other = self.actions('provider')
        name = action['after']['name']
        invalid = [other['after']['name'] + '/operations/id', name + '/operations/',
                   name + '/operations/.', name + '/operations/..', name + '/operations/a/b',
                   name + '/operations/%2e%2e', name + '/operations/id?x=y', name + '/operations/id#x',
                   name + '/operations/id\n', name + '/operations/id\\escape',
                   'https://iam.googleapis.com/v1/' + name + '/operations/id']
        for operation in invalid:
            with self.subTest(operation=operation), self.assertRaises(SetupError):
                self.client.finish_operation(action, {'name': operation, 'done': True})
        self.assertEqual(self.wire.requests, [])

    def test_poll_readback_identity_and_errors_fail_closed_without_writes(self):
        action = self.actions('provider')[0]
        initial = self.operation(action, done=False)
        for result in (Response({**initial, 'name': initial['name'] + '-changed', 'done': True}),
                       Response({**initial, 'done': True, 'error': {'code': 7}}),
                       TimeoutError('private detail')):
            self.wire.requests.clear()
            self.wire.responses = [result]
            with self.assertRaises(SetupError): self.client.finish_operation(action, initial)
            self.assertEqual([r.method for r in self.wire.requests], ['GET'])

    def test_resumed_provider_polling_does_not_require_a_prior_snapshot(self):
        # On process restart there is an operation receipt but no reader yet.
        del self.client.reader
        action = self.actions('provider')[0]
        initial = self.operation(action, done=False)
        self.wire.responses = [Response({**initial, 'done': True})]
        self.client.finish_operation(action, initial)
        self.assertEqual([(r.method, r.full_url) for r in self.wire.requests], [
            ('GET', 'https://iam.googleapis.com/v1/' + initial['name'])])

    def test_pending_operations_have_bounded_get_only_polling_including_last_response(self):
        action = self.actions('provider')[0]
        initial = self.operation(action, done=False)
        for completes in (False, True):
            self.wire.requests.clear()
            self.sleep.reset_mock()
            self.wire.responses = [Response(initial) for _ in range(19)] + [
                Response({**initial, 'done': completes})]
            if completes:
                self.client.finish_operation(action, initial)
            else:
                with self.assertRaisesRegex(SetupError, 'never by repeating PATCH'):
                    self.client.finish_operation(action, initial)
            self.assertEqual(len(self.wire.requests), 20)
            self.assertEqual({(r.method, r.full_url, r.data) for r in self.wire.requests}, {
                ('GET', 'https://iam.googleapis.com/v1/' + initial['name'], None)})
            self.assertEqual(self.sleep.call_count, 19)


if __name__ == '__main__': unittest.main()
