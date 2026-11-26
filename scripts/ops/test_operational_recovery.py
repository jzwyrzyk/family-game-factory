import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

import operational_recovery as recovery
import bootstrap_request_diagnostics as setup


class RecoveryTests(unittest.TestCase):
    def test_projected_admin_audit_captures_exact_failure_privately_only(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp)
            api = Mock()
            api.call.return_value = {'entries': [{'timestamp': '2026-11-26T16:00:00Z', 'protoPayload': {
                'methodName': recovery.METHOD, 'resourceName': setup.VIEW,
                'request': {'view': {'filter': setup.broker.VIEW_FILTER}},
                'status': {'code': 3, 'message': 'OR clauses not supported PRIVATE-SENTINEL'}}}]}
            result = recovery.audit_evidence(api, folder)
            self.assertEqual(result['status'], 'MATCHED_FAILURES')
            self.assertIn('MENTIONS_OR', result['failures'][0]['hints'])
            self.assertTrue(result['failures'][0]['filter_matches_image_contract'])
            self.assertNotIn('PRIVATE-SENTINEL', json.dumps(result))
            private = next(folder.glob('provider-audit-*.json'))
            self.assertIn('PRIVATE-SENTINEL', private.read_text())
            method, path, body = api.call.call_args.args
            self.assertEqual(method, 'POST')
            self.assertIn('entries:list?fields=', path)
            self.assertNotIn('authenticationInfo', path)
            self.assertIn('entries(timestamp,protoPayload)', path)
            self.assertNotIn('protoPayload(', path)  # AuditLog is protobuf Any, not a LogEntry submessage schema.
            self.assertIn('cloudaudit.googleapis.com/activity', body['filter'])
            self.assertIn(setup.VIEW, body['filter'])

    def test_foreign_audit_entry_and_success_do_not_identify_failure(self):
        with tempfile.TemporaryDirectory() as temp:
            api = Mock()
            api.call.return_value = {'entries': [{'protoPayload': {'methodName': recovery.METHOD,
                'resourceName': 'some-other-private-resource', 'status': {'code': 3, 'message': 'PRIVATE'}}}]}
            result = recovery.audit_evidence(api, Path(temp))
            self.assertEqual(result['failures'], [])
            self.assertEqual(result['status'], 'NO_MATCHING_FAILURE_OBSERVED')

    def test_local_cli_extract_does_not_copy_tokens_or_whole_log(self):
        with tempfile.TemporaryDirectory() as temp:
            home = Path(temp); logs = home / '.config/gcloud/logs'; logs.mkdir(parents=True)
            (logs / 'fixture.log').write_text('Authorization: Bearer PRIVATE-TOKEN\nlogging.views.create jems-production-requests\nERROR: (gcloud.logging.views.create) INVALID_ARGUMENT: OR clauses unsupported\n')
            result = recovery.local_cli_evidence(home, home)
            self.assertNotIn('PRIVATE-TOKEN', json.dumps(result))
            self.assertNotIn('PRIVATE-TOKEN', next(home.glob('provider-cli-*.json')).read_text())
            self.assertIn('MENTIONS_OR', result['failures'][0]['hints'])

    def test_existing_six_resources_leave_only_four_downstream_actions(self):
        from test_permanent_diagnostics import BootstrapTests, IMAGE
        fixture = BootstrapTests()
        spec = fixture.spec()
        def cloud(*args, **kwargs):
            if args[:3] == ('iam', 'service-accounts', 'describe'): return {'email': args[3], 'description': setup.MARKER}
            if args[:3] == ('iam', 'service-accounts', 'keys'): return []
            if args[:3] == ('iam', 'service-accounts', 'get-iam-policy'):
                return {'bindings': [{'role': 'roles/iam.workloadIdentityUser', 'members': [setup.PRINCIPAL]}]} if args[3] == setup.CALLER else {}
            if args[:3] == ('iam', 'roles', 'describe'): return {'name': setup.ROLE, 'description': setup.MARKER, 'stage': 'GA', 'includedPermissions': setup.PERMISSIONS}
            if args[:3] == ('iam', 'workload-identity-pools', 'describe'): return {'name': setup.POOL_NAME, 'state': 'ACTIVE', 'description': setup.MARKER}
            if args[:4] == ('iam', 'workload-identity-pools', 'providers', 'list'): return [{'name': setup.PROVIDER_NAME}]
            if args[:4] == ('iam', 'workload-identity-pools', 'providers', 'describe'):
                return {'name': setup.PROVIDER_NAME, 'state': 'ACTIVE', 'description': setup.MARKER,
                        'attributeMapping': {'google.subject': 'assertion.sub'}, 'attributeCondition': spec['resources']['provider_condition'],
                        'oidc': {'issuerUri': 'https://token.actions.githubusercontent.com', 'allowedAudiences': ['https://iam.googleapis.com/' + setup.PROVIDER_NAME]}}
            return fixture.cloud(*args, **kwargs)
        reader = Mock(side_effect=cloud)
        plan = setup.preflight(spec, cloud=reader)
        self.assertEqual(len(plan.actions), 4)
        self.assertEqual(plan.actions[0]['change']['gcloud'][:3], ['logging', 'views', 'create'])
        for c in reader.call_args_list: self.assertFalse(set(c.args) & {'create', 'create-oidc', 'deploy'})

    def test_audit_unavailable_reports_only_trusted_http_status(self):
        result = recovery.audit_failure(recovery.SetupError('POST https://logging.googleapis.com/v2/entries:list returned HTTP 403'))
        self.assertEqual(result['http_status'], 403)
        self.assertEqual(result['code'], 'AUDIT_HTTP_FAILED')
        for error in (ValueError('PRIVATE returned HTTP 401'), recovery.SetupError('PRIVATE failed in transport or decoding')):
            result = recovery.audit_failure(error)
            self.assertIsNone(result['http_status'])
            self.assertNotIn('PRIVATE', json.dumps(result))

    def test_sdk_json_error_without_terminal_prefix_is_found_and_redacted(self):
        with tempfile.TemporaryDirectory() as temp:
            home = Path(temp); logs = home / '.config/gcloud/logs'; logs.mkdir(parents=True)
            (logs / 'fixture.log').write_text('logging.views.create jems-production-requests\n' + json.dumps({
                'error': {'status': 'INVALID_ARGUMENT', 'message': 'resource.labels OR unsupported PRIVATE-SENTINEL'},
                'other': {'message': 'Bearer PRIVATE-TOKEN'}}))
            result = recovery.local_cli_evidence(home, home)
            self.assertEqual(len(result['failures']), 1)
            self.assertIn('MENTIONS_RESOURCE_LABELS', result['failures'][0]['hints'])
            self.assertNotIn('PRIVATE-SENTINEL', json.dumps(result))
            self.assertNotIn('PRIVATE-TOKEN', json.dumps(result))
            private = next(home.glob('provider-cli-*.json')).read_text()
            self.assertIn('PRIVATE-SENTINEL', private)
            self.assertNotIn('PRIVATE-TOKEN', private)

    def test_view_iam_uses_post_options_etag_and_rejects_concurrent_grants(self):
        from test_permanent_diagnostics import BootstrapTests
        fixture = BootstrapTests(); api = Mock()
        api.call.return_value = {'etag': 'fixture-etag'}
        plan = setup.preflight(fixture.spec(), cloud=fixture.cloud, logging=api)
        index = next(i for i, a in enumerate(plan.actions) if a['description'] == 'Bind broker only on exact log view')
        plan.work[index]()
        self.assertEqual(api.call.call_args_list[0].args, ('POST', 'v2/' + setup.VIEW + ':getIamPolicy', {'options': {'requestedPolicyVersion': 3}}))
        method, path, body = api.call.call_args_list[1].args
        self.assertEqual((method, path), ('POST', 'v2/' + setup.VIEW + ':setIamPolicy'))
        self.assertEqual(body['policy']['etag'], 'fixture-etag')
        self.assertEqual(body['policy']['bindings'], [{'role': setup.ROLE, 'members': ['serviceAccount:' + setup.BROKER]}])
        api.reset_mock(); api.call.return_value = {'etag': 'changed', 'bindings': [{'role': 'roles/logging.viewer', 'members': ['allUsers']}]}
        with self.assertRaises(setup.BrokerValidationError): plan.work[index]()
        self.assertEqual(api.call.call_count, 1)

    def test_saved_plan_probe_validates_without_terraform_or_private_output(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp); plan = b'private-plan'; (folder / 'reviewed.tfplan').write_bytes(plan)
            binding = {'source_sha': recovery.BUILD_SOURCE, 'billing': 'PRIVATE-BILLING'}
            receipt = {'binding': binding, 'plan_sha256': recovery.hashlib.sha256(plan).hexdigest()}
            (folder / 'binding.json').write_text(json.dumps(binding)); (folder / 'reviewed.json').write_text(json.dumps(receipt))
            with patch.object(recovery, 'NONPROD_APPROVAL', recovery.nonprod.digest(receipt)):
                result = recovery.saved_nonprod(folder)
                self.assertEqual(result['status'], 'SAVED_PLAN_INTEGRITY_VERIFIED')
                self.assertNotIn('PRIVATE', json.dumps(result))
                (folder / 'reviewed.tfplan').write_bytes(b'changed')
                with self.assertRaises(setup.BrokerValidationError): recovery.saved_nonprod(folder)


if __name__ == '__main__': unittest.main()
