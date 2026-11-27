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
    def test_gcloud_structured_failures_and_strict_absence(self):
        from types import SimpleNamespace
        cases = [
            (1, '', 'private-token-marker PERMISSION_DENIED', 'GCLOUD_COMMAND_FAILED', ('PERMISSION_DENIED',)),
            (1, '', 'NOT_FOUND PERMISSION_DENIED private-token-marker', 'GCLOUD_COMMAND_FAILED', ('NOT_FOUND', 'PERMISSION_DENIED')),
            (1, '', 'unrecognized CLI argument private-token-marker', 'GCLOUD_COMMAND_FAILED', ()),
            (0, 'private-token-marker', '', 'GCLOUD_JSON_INVALID', ()),
            (0, 'null', '', 'GCLOUD_RESPONSE_INVALID', ())]
        for status, stdout, stderr, code, codes in cases:
            with self.subTest(code=code, status=status), patch.object(setup.subprocess, 'run',
                 return_value=SimpleNamespace(returncode=status, stdout=stdout, stderr=stderr)):
                with self.assertRaises(setup.ProviderReadError) as caught:
                    setup.run('iam', 'service-accounts', 'describe', setup.BROKER, missing_ok=True)
                self.assertEqual(caught.exception.code, code)
                self.assertEqual(caught.exception.provider_codes, codes)
                self.assertNotIn('private-token-marker', str(caught.exception))
        with patch.object(setup.subprocess, 'run', return_value=SimpleNamespace(
                returncode=1, stdout='', stderr='NOT_FOUND private-token-marker')):
            self.assertIsNone(setup.run('iam', 'service-accounts', 'describe', setup.BROKER, missing_ok=True))

    def missing_service_cloud(self, *args, **kwargs):
        if args[:3] == ('run', 'services', 'describe'):
            raise setup.ProviderReadError('private-token-marker', cli_category='CANNOT_FIND_SERVICE_MESSAGE')
        return self.cloud(*args, **kwargs)

    def test_service_cli_absence_requires_exact_rest_404_with_same_token(self):
        import io
        opener = Mock()
        def open_request(request, timeout):
            self.assertEqual(request.full_url, 'https://run.googleapis.com/v2/projects/' + setup.PROJECT +
                             '/locations/us-east5/services/jems-request-evidence')
            self.assertEqual(request.get_method(), 'GET')
            self.assertEqual(request.headers['Authorization'], 'Bearer private-token-marker')
            self.assertIsNone(request.data)
            raise setup.urllib.error.HTTPError(request.full_url, 404, 'private-token-marker', {}, io.BytesIO(b'private-token-marker'))
        opener.open.side_effect = open_request
        with patch.object(setup.urllib.request, 'build_opener', return_value=opener):
            code, report, _, _ = self.invoke_inventory(self.missing_service_cloud)
        self.assertEqual(code, 0)
        self.assertEqual(len(report['plan']['actions']), 10)
        opener.open.assert_called_once()
        progress = setup.Progress()
        probe = Mock()
        probe.confirm.return_value = None
        plan = setup.preflight(self.spec(), cloud=self.missing_service_cloud, service_absence=probe, progress=progress)
        record = next(r for r in progress.reads if r['stage'] == 'BROKER_SERVICE')
        self.assertEqual(record['absence_confirmation'], 'CLOUD_RUN_HTTP_404')
        self.assertEqual(record['status'], 'NOT_PROVISIONED')
        original = setup.preflight(self.spec(), cloud=self.cloud)
        self.assertNotEqual(plan.review_code(), original.review_code())

    def test_absence_http_denial_redirect_and_transient_errors_never_plan(self):
        import io
        for status in (301, 302, 307, 401, 403, 429, 500, 503):
            opener = Mock()
            opener.open.side_effect = setup.urllib.error.HTTPError(
                'https://run.googleapis.com/private-token-marker', status, 'private-token-marker', {}, io.BytesIO())
            with self.subTest(status=status), patch.object(setup.urllib.request, 'build_opener', return_value=opener):
                code, report, _, _ = self.invoke_inventory(self.missing_service_cloud)
            self.assertEqual(code, 2)
            self.assertEqual(report['stage'], 'BROKER_SERVICE_ABSENCE_CHECK')
            self.assertEqual(report['code'], 'BROKER_SERVICE_ABSENCE_HTTP_FAILED')
            self.assertEqual(report['http_status'], status)
            self.assertNotIn('plan', report)
            self.assertNotIn('approve_plan_sha256', report)

    def test_absence_success_and_transport_failure_are_not_absence(self):
        from unittest.mock import MagicMock
        opener = Mock()
        response = MagicMock()
        response.status = 200
        response.read.return_value = b'null'
        response.__enter__.return_value = response
        opener.open.return_value = response
        with patch.object(setup.urllib.request, 'build_opener', return_value=opener):
            code, report, _, _ = self.invoke_inventory(self.missing_service_cloud)
        self.assertEqual((code, report['code'], report['http_status']), (2, 'BROKER_SERVICE_REST_NOT_ABSENT', 200))
        response.read.assert_not_called()
        opener.open.side_effect = setup.urllib.error.URLError('private-token-marker')
        with patch.object(setup.urllib.request, 'build_opener', return_value=opener):
            code, report, _, _ = self.invoke_inventory(self.missing_service_cloud)
        self.assertEqual(report['code'], 'BROKER_SERVICE_ABSENCE_TRANSPORT_FAILED')
        self.assertNotIn('plan', report)

    def test_absence_confirmation_is_not_an_auth_failure_fallback(self):
        probe = Mock()
        def cloud(*args, **kwargs):
            if args[:3] == ('run', 'services', 'describe'):
                raise setup.ProviderReadError('private-token-marker', provider_codes=['PERMISSION_DENIED'],
                                              cli_category='CANNOT_FIND_SERVICE_MESSAGE')
            return self.cloud(*args, **kwargs)
        with self.assertRaises(setup.ProviderReadError):
            setup.preflight(self.spec(), cloud=cloud, service_absence=probe)
        probe.confirm.assert_not_called()
        actual = setup.ServiceAbsenceProbe('private-token-marker')
        self.assertTrue(any(type(handler).__name__ == 'NoRedirect' for handler in actual.opener.handlers))

    def test_cli_absence_hint_does_not_authorize_creation(self):
        from types import SimpleNamespace
        for text, category in [('Cannot find service [private-token-marker]', 'CANNOT_FIND_SERVICE_MESSAGE'),
                               ('unrecognized arguments: private-token-marker', 'UNRECOGNIZED_ARGUMENTS'),
                               ('Invalid choice: private-token-marker', 'INVALID_COMMAND_CHOICE')]:
            with patch.object(setup.subprocess, 'run', return_value=SimpleNamespace(
                    returncode=1, stdout='', stderr=text)):
                with self.assertRaises(setup.ProviderReadError) as caught:
                    setup.run('run', 'services', 'describe', setup.SERVICE, missing_ok=True)
                report = setup.failure(caught.exception, setup.Progress())
                self.assertEqual(report['cli_category'], category)
                self.assertEqual(report['provider_codes'], [])
                self.assertNotIn('private-token-marker', json.dumps(report))

    def test_gcloud_unavailable_and_timeout_have_safe_codes(self):
        for error, code in [(FileNotFoundError('private-token-marker'), 'GCLOUD_UNAVAILABLE'),
                            (setup.subprocess.TimeoutExpired('private-token-marker', 60), 'GCLOUD_TIMEOUT')]:
            with patch.object(setup.subprocess, 'run', side_effect=error):
                with self.assertRaises(setup.ProviderReadError) as caught:
                    setup.run('projects', 'describe', setup.PROJECT)
                self.assertEqual(caught.exception.code, code)
                self.assertNotIn('private-token-marker', str(caught.exception))

    def invoke_inventory(self, cloud=None, **overrides):
        import contextlib
        import io
        with contextlib.ExitStack() as stack:
            for target, name, value in [
                (setup, 'source', {}),
                (setup.publication, 'source_archive', b'archive'),
                (setup.publication, 'qualify', {'image': IMAGE})]:
                options = {'side_effect': value} if isinstance(value, Exception) else {'return_value': value}
                if name in overrides:
                    options = {'side_effect': overrides[name]}
                stack.enter_context(patch.object(target, name, **options))
            stack.enter_context(patch.object(setup.publication.publication, 'run',
                side_effect=lambda args, root: (root / args[2].split(':', 1)[1]).read_bytes()))
            token = stack.enter_context(patch.object(setup, 'command', return_value='private-token-marker'))
            reader = stack.enter_context(patch.object(setup, 'run', side_effect=cloud or self.cloud))
            output = stack.enter_context(contextlib.redirect_stdout(io.StringIO()))
            result = setup.main(['--source-sha', 'a' * 40, '--image', IMAGE, '--check',
                                 '--build-source-sha', 'b' * 40,
                                 '--build-id', '7fcac19a-8444-4c17-955a-1a381006069e'])
        self.assertNotIn('private-token-marker', output.getvalue())
        return result, json.loads(output.getvalue()), reader, token

    def test_inventory_cli_read_failure_identifies_stage_without_private_text(self):
        def cloud(*args, **kwargs):
            if args[:3] == ('iam', 'service-accounts', 'describe'):
                raise setup.ProviderReadError('private-token-marker', code='GCLOUD_COMMAND_FAILED',
                                           provider_codes=['PERMISSION_DENIED', 'private-token-marker'])
            return self.cloud(*args, **kwargs)
        code, report, reader, token = self.invoke_inventory(cloud)
        self.assertEqual(code, 2)
        self.assertEqual(report['stage'], 'BROKER_ACCOUNT_METADATA')
        self.assertEqual(report['code'], 'GCLOUD_COMMAND_FAILED')
        self.assertEqual(report['provider_codes'], ['PERMISSION_DENIED'])
        self.assertEqual(len(report['completed_reads']), 4)
        self.assertNotIn('plan', report)
        self.assertNotIn('approve_plan_sha256', report)
        self.assertEqual(reader.call_count, 5)

    def test_inventory_cli_missing_resources_create_plan_but_never_execute(self):
        code, report, reader, token = self.invoke_inventory()
        self.assertEqual(code, 0)
        self.assertEqual(len(report['plan']['actions']), 10)
        self.assertEqual(len(report['approve_plan_sha256']), 64)
        for call in reader.call_args_list:
            self.assertFalse(set(call.args) & {'create', 'create-oidc', 'deploy', 'add-iam-policy-binding'})

    def test_inventory_shape_errors_fail_closed_with_fixed_stage(self):
        for value in ('private-token-marker', [None], [{'config': 'private-token-marker'}]):
            def cloud(*args, **kwargs):
                return value if args[:2] == ('services', 'list') else self.cloud(*args, **kwargs)
            code, report, _, _ = self.invoke_inventory(cloud)
            self.assertEqual(code, 2)
            self.assertEqual(report['stage'], 'ENABLED_APIS')
            self.assertIn(report['code'], {'INVENTORY_RESPONSE_SHAPE_INVALID', 'RESPONSE_OR_SOURCE_SHAPE_INVALID'})
            self.assertNotIn('plan', report)

    def test_inventory_missing_status_is_not_verified_permission_denial(self):
        progress = setup.Progress()
        setup.preflight(self.spec(), cloud=self.cloud, progress=progress)
        records = {record['stage']: record['status'] for record in progress.reads}
        self.assertEqual(records['BROKER_ACCOUNT_METADATA'], 'NOT_PROVISIONED')
        self.assertEqual(records['CALLER_ACCOUNT_METADATA'], 'NOT_PROVISIONED')
        self.assertEqual(records['PROJECT_IAM'], 'READ_OK')

    def test_source_and_provenance_failures_stop_before_admin_token(self):
        cases = [('source', FileNotFoundError('private-token-marker'), 'SOURCE_VALIDATION', 'LOCAL_FILE_MISSING'),
                 ('source_archive', RuntimeError('private-token-marker'), 'SOURCE_ARCHIVE', 'SOURCE_COMMAND_FAILED'),
                 ('qualify', setup.publication.BuildVerificationError('BUILD_ARTIFACTS_UNEXPECTED'),
                  'BUILD_QUALIFICATION', 'BUILD_ARTIFACTS_UNEXPECTED')]
        for name, error, stage, expected in cases:
            code, report, reader, token = self.invoke_inventory(**{name: error})
            self.assertEqual(code, 2)
            self.assertEqual((report['stage'], report['code']), (stage, expected))
            reader.assert_not_called()
            token.assert_not_called()

    def test_policy_failure_has_specific_predicate_and_no_mutation(self):
        def cloud(*args, **kwargs):
            if args[:2] == ('projects', 'get-iam-policy'):
                return {'bindings': [{'members': ['allUsers'], 'role': 'private-token-marker'}]}
            return self.cloud(*args, **kwargs)
        code, report, reader, _ = self.invoke_inventory(cloud)
        self.assertEqual(code, 2)
        self.assertEqual((report['stage'], report['code']), ('PROJECT_IAM', 'PUBLIC_PROJECT_GRANTS_PRESENT'))
        self.assertEqual(reader.call_count, 3)

    def test_unexpected_exception_and_admin_errors_do_not_expose_text(self):
        for error in (SetupError('private-token-marker'), Exception('private-token-marker'),
                      setup.ProviderReadError('private-token-marker', code='private-token-marker')):
            code, report, _, _ = self.invoke_inventory(lambda *a, **kw: (_ for _ in ()).throw(error))
            self.assertEqual(code, 2)
            self.assertEqual(report['stage'], 'PROJECT_METADATA')
            self.assertNotIn('private-token-marker', json.dumps(report))

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
        service = {'metadata': {'generation': 1, 'name': setup.SERVICE, 'labels': {'jems-diagnostics': 'pr153'},
                               'annotations': {'run.googleapis.com/ingress': 'all', 'run.googleapis.com/maxScale': '1'}},
                   'spec': {'template': {'spec': {'serviceAccountName': setup.BROKER,
                            'containerConcurrency': 1, 'timeoutSeconds': 60,
                            'containers': [{'image': IMAGE, 'env': [{'name': 'JEMS_LOG_BUCKET_LOCATION', 'value': 'global'}],
                                            'resources': {'limits': {'cpu': '1', 'memory': '256Mi'}}}]}}},
                   'status': {'observedGeneration': 1, 'conditions': [{'type': 'Ready', 'status': 'True'}],
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
        logging.call.assert_called_once_with('POST', 'v2/' + setup.VIEW + ':getIamPolicy',
                                              {'options': {'requestedPolicyVersion': 3}})
        service['status']['traffic'] = [{'latestRevision': True, 'percent': 100}]
        self.assertEqual(setup.preflight(spec, cloud=cloud, logging=logging).actions, [])
        service['status']['observedGeneration'] = 0
        with self.assertRaisesRegex(SetupError, 'NOT_RECONCILED'):
            setup.preflight(spec, cloud=cloud, logging=logging)
        service['status']['observedGeneration'] = 1
        service['spec']['template']['spec']['containers'][0]['command'] = ['unreviewed']
        with self.assertRaises(SetupError): setup.preflight(spec, cloud=cloud, logging=logging)

    def test_absent_resource_cannot_pass_negative_policy_check(self):
        api = Mock()
        api.call.return_value = {'overallAccessState': 'CANNOT_ACCESS'}
        result = audit.audit(api, lambda _: False)
        self.assertEqual(result['status'], 'NOT_ACCEPTED')
        api.call.assert_not_called()

    def test_broker_audit_reports_evaluated_mismatches_separately(self):
        rows = audit.tuples()
        self.assertEqual(len(rows), 77)
        outcomes = {tuple(r[k] for k in ('principal', 'fullResourceName', 'permission')): r['expected'] for r in rows}
        self.assertEqual(len(outcomes), 77)
        def evaluate(method, path, body):
            self.assertEqual((method, path), ('POST', 'v3/iam:troubleshoot'))
            key = tuple(body['accessTuple'][k] for k in ('principal', 'fullResourceName', 'permission'))
            return {'overallAccessState': outcomes[key]}
        api = Mock()
        api.call.side_effect = evaluate
        self.assertEqual(audit.summary(audit.audit(api, lambda _: True))['passed'], 77)
        first = next(iter(outcomes))
        outcomes[first] = 'CANNOT_ACCESS'
        report = audit.summary(audit.audit(api, lambda _: True))
        self.assertEqual(report['passed'], 76)
        self.assertEqual(report['failures'], [{'stage':'evaluated', 'expected':'CAN_ACCESS',
                                               'observed':'CANNOT_ACCESS', 'rows':[1]}])

    def test_request_wide_error_stops_remote_calls_and_accounts_for_all_rows(self):
        api = Mock()
        api.call.side_effect = audit.review.TroubleshootError(
            {'http_status':403, 'error_status':'PERMISSION_DENIED', 'reasons':['SERVICE_DISABLED']})
        report = audit.audit(api, lambda _: True)
        self.assertEqual(len(report['checks']), 77)
        self.assertEqual(api.call.call_count, 1)
        self.assertEqual(report['checks'][0]['stage'], 'troubleshooter')
        self.assertTrue(all(r['stage']=='not_attempted' and not r['passed'] for r in report['checks'][1:]))
        self.assertEqual(audit.summary(report)['observed'], {'UNKNOWN':77})

    def test_resource_error_cached_and_redacted_and_unknown_response_preserved(self):
        view = audit.tuples()[0]['fullResourceName']
        def exists(target):
            if target == view:
                raise audit.review.TroubleshootError({'http_status':404, 'reasons':[], 'error_status':'NOT_FOUND'})
            return True
        reader = Mock(side_effect=exists)
        api = Mock()
        api.call.return_value = {'overallAccessState':'UNKNOWN_INFO', 'private-response':'private marker'}
        report = audit.audit(api, reader)
        self.assertEqual(reader.call_count, len({r['fullResourceName'] for r in audit.tuples()}))
        self.assertEqual((report['checks'][0]['stage'],report['checks'][0]['http_status']), ('resource_get',404))
        self.assertEqual(report['checks'][2]['error_status'],'UNKNOWN_INFO')
        self.assertNotIn('private marker', json.dumps(report))

    def test_metadata_reads_use_quota_project_and_verified_project_number(self):
        target = '//cloudresourcemanager.googleapis.com/projects/' + setup.PROJECT
        self.assertIn(target, {r['fullResourceName'] for r in audit.tuples()})
        with patch.object(audit, 'Http') as client:
            client.return_value.call.return_value = {'name':'projects/'+setup.NUMBER}
            self.assertTrue(audit.read_target(target, 'fixture-token'))
            client.assert_called_once_with('https://cloudresourcemanager.googleapis.com', 'fixture-token',
                                           {'x-goog-user-project':setup.PROJECT})
            client.return_value.call.assert_called_once_with('GET', 'v3/projects/'+setup.NUMBER+'?fields=name')
            client.return_value.call.return_value = {'name':'projects/other'}
            self.assertFalse(audit.read_target(target, 'fixture-token'))

    def test_unresolved_first_preserves_row_numbers_and_requires_fresh_full_pass(self):
        api = Mock()
        api.call.return_value = {'overallAccessState': 'UNKNOWN_INFO',
            'allowPolicyExplanation': {'allowAccessState': 'ALLOW_ACCESS_STATE_UNKNOWN_INFO',
                'explainedPolicies': [{'policy': 'private marker', 'bindingExplanations': [
                    {'memberships': {'principalSet://private-id': {'membership':'MEMBERSHIP_UNKNOWN_UNSUPPORTED'}},
                     'combinedMembership': {'membership': 'MEMBERSHIP_UNKNOWN_UNSUPPORTED'}}]}]}}
        report = audit.audit(api, lambda _: True, unresolved_first=True)
        failed = audit.summary(report)['failures'][0]
        self.assertEqual(failed['rows'], [29,35,38,39,40,41,65,71,74,75,76,77])
        self.assertEqual(failed['policy_states'], ['ALLOW_ACCESS_STATE_UNKNOWN_INFO', 'MEMBERSHIP_UNKNOWN_UNSUPPORTED',
                                                  'UNRESOLVED_MEMBER_PRINCIPAL_SET'])
        self.assertNotIn('private-id', json.dumps(report))
        self.assertNotIn('private marker', json.dumps(report))
        self.assertEqual(api.call.call_count, 12)
        self.assertEqual(report['status'], 'NOT_ACCEPTED')
        roster = audit.tuples()
        def evaluate(method, path, body):
            row = next(row for row in roster if all(row[k] == v for k,v in body['accessTuple'].items()))
            return {'overallAccessState': row['expected']}
        api.call.side_effect = evaluate
        report = audit.audit(api, lambda _: True, unresolved_first=True)
        self.assertEqual(report['status'], 'FINITE_POLICY_CHECKS_PASSED')
        self.assertEqual([r['row'] for r in report['checks']], list(range(1,78)))

    def test_secret_policy_tuple_matches_numeric_metadata_and_never_accesses_payload(self):
        target = next(r['fullResourceName'] for r in audit.tuples() if 'secrets/factory-gateway' in r['fullResourceName'])
        path = 'projects/' + setup.NUMBER + '/secrets/factory-gateway-private-config'
        with patch.object(audit, 'metadata') as read:
            read.return_value = {'name':path}
            resolved = audit.read_target(target, 'token')
            read.assert_called_once_with(audit.SECRET_HOST, 'v1/' + path + '?fields=name', 'token')
            api = Mock()
            api.call.return_value = {'overallAccessState':'UNKNOWN_INFO'}
            report = audit.audit(api, lambda r: resolved if r == target else False, unresolved_first=True)
            self.assertEqual(api.call.call_count, 4)
            for call in api.call.call_args_list:
                self.assertEqual(call.args[2]['accessTuple']['fullResourceName'], '//' + audit.SECRET_HOST + '/' + path)
            self.assertFalse(any(r['passed'] for r in report['checks']))
            read.return_value = {'name':path.replace(setup.NUMBER, 'other')}
            with self.assertRaises(audit.review.TroubleshootError):
                audit.read_target(target, 'token')

    def test_coach_404_requires_unique_serving_revision_and_distinct_verified_secret(self):
        target = next(r['fullResourceName'] for r in audit.tuples() if 'secrets/factory-coach' in r['fullResourceName'])
        path = 'projects/' + setup.NUMBER + '/locations/us-east5/services/factory-coach-private'
        revision = 'factory-coach-private-123'
        secret = 'projects/' + setup.NUMBER + '/secrets/factory-coach-openai-key'
        state = {'name':path, 'trafficStatuses':[{'percent':100, 'revision':revision}]}
        detail = {'name':path + '/revisions/' + revision, 'containers':[{'env':[
            {'valueSource':{'secretKeyRef':{'secret':secret}}}]}]}
        missing = audit.review.TroubleshootError({'http_status':404})
        with patch.object(audit, 'metadata', side_effect=[missing,state,detail,state,{'name':secret}]) as read:
            self.assertEqual(audit.read_target(target, 'token'), {
                'target':'//' + audit.SECRET_HOST + '/' + secret, 'serving_coach_revision':revision})
            for call in read.call_args_list:
                self.assertIn('?fields=', call.args[1])
                self.assertNotIn('/versions/', call.args[1])
            self.assertIn('containers(env(valueSource(secretKeyRef(secret))))', read.call_args_list[2].args[1])
        for responses, code in [
            ([audit.review.TroubleshootError({'http_status':403})], None),
            ([missing, {**state, 'trafficStatuses':[]}], 'COACH_TRAFFIC_UNVERIFIED'),
            ([missing,state,{'name':detail['name']}], 'COACH_NO_SERVING_SECRET_REFERENCE'),
            ([missing,state,{**detail, 'volumes':[{'secret':{'secret':'second'}}]}], 'COACH_MULTIPLE_SERVING_SECRETS'),
            ([missing,state,{**detail, 'volumes':[{'secret':{'secret':'projects/other/secrets/x'}}]}],
             'COACH_SECRET_SCOPE_UNVERIFIED'),
            ([missing,state,detail,{**state, 'trafficStatuses':[{'percent':100,'revision':revision+'x'}]}],
             'COACH_TRAFFIC_CHANGED'),
            ([missing,state,detail,state,{'name':'projects/other/secrets/wrong'}], 'CANONICAL_SECRET_NAME_UNVERIFIED')]:
            with self.subTest(code=code), patch.object(audit, 'metadata', side_effect=responses) as read:
                with self.assertRaises(audit.review.TroubleshootError) as caught:
                    audit.read_target(target, 'token')
                self.assertEqual(caught.exception.safe.get('error_status'), code)
                self.assertEqual(read.call_count, len(responses))

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
