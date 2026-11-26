import copy
import json
import unittest
from unittest.mock import Mock, patch

from admin_api import SetupError
import bootstrap_request_diagnostics as setup
import audit_request_diagnostics as audit
import verify_diagnostic_access as access
import request_evidence as evidence
import triage_request_evidence as triage
from test_request_evidence import SCOPE, NOW, complete, entry

IMAGE = f'us-east5-docker.pkg.dev/{setup.PROJECT}/factory-services/request-broker@sha256:' + 'a' * 64


class BootstrapTests(unittest.TestCase):
    def test_existing_image_source_cannot_hide_changed_broker_bytes(self):
        import contextlib
        import io
        with patch.object(setup, 'source', return_value={}), \
             patch.object(setup.publication, 'source_archive', return_value=b'archive'), \
             patch.object(setup.publication.publication, 'run', return_value=b'private-unexpected-source'), \
             patch.object(setup.publication, 'qualify') as qualify, contextlib.redirect_stdout(io.StringIO()) as output:
            code = setup.main(['--source-sha', 'a' * 40, '--image', IMAGE, '--check',
                               '--build-source-sha', 'b' * 40,
                               '--build-id', '7fcac19a-8444-4c17-955a-1a381006069e'])
            self.assertEqual(code, 2)
            qualify.assert_not_called()
            self.assertIn('BUILD_SOURCE_BROKER_FILES_DIFFER', output.getvalue())
            self.assertNotIn('private-unexpected-source', output.getvalue())

    def cloud(self, *args, **kwargs):
        if args[:2] == ('projects', 'describe'):
            return dict(projectId=setup.PROJECT, projectNumber=setup.NUMBER, lifecycleState='ACTIVE')
        if args[:2] == ('services', 'list'):
            return [{'config': {'name': name}} for name in setup.APIS]
        if args[:2] == ('projects', 'get-iam-policy'): return {}
        if args[:4] == ('artifacts', 'docker', 'images', 'describe'): return {}
        if args[:3] == ('logging', 'buckets', 'describe'): return {'lifecycleState': 'ACTIVE'}
        if kwargs.get('missing_ok'): return None
        raise AssertionError(args)

    def spec(self):
        return setup.proposed(IMAGE, 'b' * 40, {'fixture': 'c' * 64})

    def test_offline_plan_preserves_exact_pr153_trust_and_no_broad_grants(self):
        spec = self.spec()
        self.assertEqual(len(spec['bindings']), 3)
        self.assertIn("assertion.workflow_sha == assertion.sha", spec['resources']['provider_condition'])
        self.assertFalse(spec['configuration']['recurring_execution'])
        self.assertNotIn('roles/logging.viewer', json.dumps(spec))
        for image in (IMAGE.replace('@sha256:', ':tag-'), 'gcr.io/elsewhere/test@sha256:' + 'a' * 64):
            with self.assertRaises(SetupError): setup.config(image)

    def test_read_only_inventory_and_wrong_approval_never_execute(self):
        cloud = Mock(side_effect=self.cloud)
        plan = setup.preflight(self.spec(), cloud=cloud)
        before = cloud.call_count
        with self.assertRaises(SetupError): plan.execute('wrong')
        self.assertEqual(cloud.call_count, before)
        self.assertEqual(len(plan.actions), 10)
        self.assertTrue(all('delete' not in a['change'].get('gcloud', []) for a in plan.actions))
        self.assertEqual(plan.actions[-1]['change']['gcloud'][2], 'add-iam-policy-binding')

    def test_partial_account_is_reused_and_keys_fail_closed(self):
        def cloud(*args, **kwargs):
            if args[:3] == ('iam', 'service-accounts', 'describe'):
                return {'email': args[3], 'description': setup.MARKER}
            if args[:3] == ('iam', 'service-accounts', 'keys'): return []
            if args[:3] == ('iam', 'service-accounts', 'get-iam-policy'): return {}
            return self.cloud(*args, **kwargs)
        plan = setup.preflight(self.spec(), cloud=cloud)
        self.assertFalse(any(a['change'].get('gcloud', [])[:3] == ['iam', 'service-accounts', 'create'] for a in plan.actions))
        def keys(*args, **kwargs):
            return [{'name': 'key'}] if args[:3] == ('iam', 'service-accounts', 'keys') else cloud(*args, **kwargs)
        with self.assertRaises(SetupError): setup.preflight(self.spec(), cloud=keys)

    def test_project_grants_and_provider_drift_stop_before_writes(self):
        def broad(*args, **kwargs):
            if args[:2] == ('projects', 'get-iam-policy'):
                return {'bindings': [{'role': 'roles/logging.viewer', 'members': ['serviceAccount:' + setup.CALLER]}]}
            return self.cloud(*args, **kwargs)
        with self.assertRaises(SetupError): setup.preflight(self.spec(), cloud=broad)
        def conflicting(*args, **kwargs):
            if args[:3] == ('iam', 'workload-identity-pools', 'describe'):
                return {'name': setup.POOL_NAME, 'state': 'ACTIVE', 'description': setup.MARKER, 'disabled': True}
            return self.cloud(*args, **kwargs)
        with self.assertRaises(SetupError): setup.preflight(self.spec(), cloud=conflicting)

    def test_inventory_change_invalidates_approval(self):
        first = setup.preflight(self.spec(), cloud=self.cloud)
        def changed(*args, **kwargs):
            value = self.cloud(*args, **kwargs)
            if args[:2] == ('projects', 'get-iam-policy'): value['etag'] = 'changed'
            return value
        second = setup.preflight(self.spec(), cloud=changed)
        self.assertNotEqual(first.review_code(), second.review_code())

    def test_complete_setup_is_idempotent_and_runtime_override_stops(self):
        spec = self.spec()
        service = {'metadata': {'name': setup.SERVICE, 'labels': {'jems-diagnostics': 'pr153'},
                               'annotations': {'run.googleapis.com/ingress': 'all', 'run.googleapis.com/maxScale': '1'}},
                   'spec': {'template': {'spec': {'serviceAccountName': setup.BROKER,
                            'containerConcurrency': 1, 'timeoutSeconds': 60,
                            'containers': [{'image': IMAGE, 'env': [{'name': 'JEMS_LOG_BUCKET_LOCATION', 'value': 'global'}],
                                            'resources': {'limits': {'cpu': '1', 'memory': '256Mi'}}}]}}},
                   'status': {'conditions': [{'type': 'Ready', 'status': 'True'}],
                              'latestReadyRevisionName': 'broker-00001-abc', 'latestCreatedRevisionName': 'broker-00001-abc',
                              'traffic': [{'revisionName': 'broker-00001-abc', 'percent': 100}]}}
        def policy(role, member): return {'bindings': [{'role': role, 'members': [member]}]}
        def cloud(*args, **kwargs):
            if args[:3] == ('iam', 'service-accounts', 'describe'):
                return {'email': args[3], 'description': setup.MARKER}
            if args[:3] == ('iam', 'service-accounts', 'keys'): return []
            if args[:3] == ('iam', 'service-accounts', 'get-iam-policy'):
                return policy('roles/iam.workloadIdentityUser', setup.PRINCIPAL) if args[3] == setup.CALLER else {}
            if args[:3] == ('iam', 'roles', 'describe'):
                return {'name': setup.ROLE, 'description': setup.MARKER, 'stage': 'GA', 'includedPermissions': setup.PERMISSIONS}
            if args[:3] == ('iam', 'workload-identity-pools', 'describe'):
                return {'name': setup.POOL_NAME, 'state': 'ACTIVE', 'description': setup.MARKER}
            if args[:4] == ('iam', 'workload-identity-pools', 'providers', 'list'):
                return [{'name': setup.PROVIDER_NAME}]
            if args[:4] == ('iam', 'workload-identity-pools', 'providers', 'describe'):
                return {'name': setup.PROVIDER_NAME, 'state': 'ACTIVE', 'description': setup.MARKER,
                        'attributeMapping': {'google.subject': 'assertion.sub'},
                        'attributeCondition': spec['resources']['provider_condition'],
                        'oidc': {'issuerUri': 'https://token.actions.githubusercontent.com',
                                 'allowedAudiences': ['https://iam.googleapis.com/' + setup.PROVIDER_NAME]}}
            if args[:3] == ('logging', 'views', 'describe'):
                return {'name': setup.VIEW, 'description': setup.MARKER, 'filter': setup.broker.VIEW_FILTER}
            if args[:3] == ('run', 'services', 'describe'): return service
            if args[:3] == ('run', 'services', 'get-iam-policy'):
                return policy('roles/run.invoker', 'serviceAccount:' + setup.CALLER)
            return self.cloud(*args, **kwargs)
        logging = Mock()
        logging.call.return_value = policy(setup.ROLE, 'serviceAccount:' + setup.BROKER)
        self.assertEqual(setup.preflight(spec, cloud=cloud, logging=logging).actions, [])
        service['spec']['template']['spec']['containers'][0]['command'] = ['unreviewed']
        with self.assertRaises(SetupError): setup.preflight(spec, cloud=cloud, logging=logging)

    def test_absent_resource_cannot_pass_negative_policy_check(self):
        api = Mock()
        api.call.return_value = {'overallAccessState': 'CANNOT_ACCESS'}
        result = audit.audit(api, lambda _: False)
        self.assertEqual(result['status'], 'NOT_ACCEPTED')
        api.call.assert_not_called()

    def test_unknown_policy_never_passes(self):
        api = Mock()
        api.call.return_value = {'overallAccessState': 'UNKNOWN_INFO_DENIED'}
        result = audit.audit(api, lambda _: True)
        self.assertEqual(result['status'], 'NOT_ACCEPTED')
        self.assertTrue(all(r['observed'] == 'UNKNOWN' for r in result['checks']))

    def test_same_token_and_no_secret_payload_reads(self):
        calls = []
        class Client:
            def __init__(self, origin, token):
                self.origin = origin
                self.assert_token = token
            def call(self, method, path, body=None):
                calls.append((self.origin, self.assert_token, method, path))
                if path == 'oauth2/v2/userinfo':
                    return {'email': access.ACCOUNT, 'verified_email': True}
                if method == 'GET':
                    return {'_inventory_http_status': 404} if 'jems-request-broker@' in path else {'name': path}
                return {'permissions': ['run.services.get', 'run.services.getIamPolicy', 'run.revisions.get', 'run.revisions.list']
                        if self.origin == 'https://run.googleapis.com' else []}
        result = access.verify('opaque-token', Client)
        self.assertEqual(result['status'], 'FINITE_CHECKS_PASSED')
        self.assertTrue(all(c[1] == 'opaque-token' for c in calls))
        self.assertTrue(all(c[2] == 'GET' or c[3].endswith(':testIamPermissions') for c in calls[1:]))
        self.assertFalse(any(c[2] == 'POST' and 'jems-request-broker@' in c[3] for c in calls))
        self.assertNotIn('opaque-token', json.dumps(result))


class TriageTests(unittest.TestCase):
    def report(self, rows):
        value = evidence.initial_report(SCOPE, {}, NOW)
        value.update(evidence.verified_result(complete(rows), SCOPE, NOW))
        return value

    def test_auth_preflight_and_success_are_distinct(self):
        result = triage.triage(self.report([entry(401), entry(204, method='OPTIONS'), entry(200)]))
        categories = {r['classification'] for r in result['observed_groups']}
        self.assertEqual(categories, {'AUTHENTICATION_UNRESOLVED', 'PREFLIGHT_COMPLETED', 'HTTP_SUCCESS_NOT_USER_ACCEPTANCE'})
        self.assertFalse(result['automatic_rollback'])

    def test_incomplete_empty_is_not_zero_traffic(self):
        report = self.report([])
        report.update(query_status='INCOMPLETE', reason='COVERAGE_UNVERIFIED', counts=None, coverage=None)
        report['completeness']['coverage_verified'] = False
        self.assertFalse(triage.triage(report)['totals_known'])

    def test_unavailable_client_report_retains_gap_instead_of_zero(self):
        report = evidence.initial_report(SCOPE, {}, NOW)
        report.update(query_status='UNAVAILABLE', reason='IDENTITY_UNAVAILABLE')
        result = triage.triage(report)
        self.assertEqual(result['status'], 'UNAVAILABLE')
        self.assertFalse(result['totals_known'])

    def test_raw_fields_forged_counts_and_unknown_routes_rejected(self):
        for mutate in (lambda r: r.update(rawUrl='private'),
                       lambda r: r['requests'][0].update(route='/private/id'),
                       lambda r: r['counts'].update(total=0)):
            report = self.report([entry(401)])
            mutate(report)
            with self.assertRaises(evidence.InvalidEvidence): triage.triage(report)


if __name__ == '__main__': unittest.main()
