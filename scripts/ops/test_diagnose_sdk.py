"""SDK auth regression: no CLI/cache writes, fixed identity, scope and redaction."""
import json
import contextlib
import io
import sys
from pathlib import Path
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

import diagnose
import diagnostic_preflight as preflight
import diagnose_sdk as sdk
import managed_diagnostic_identity as managed
from test_diagnose import service, revision, LEAK


class Response:
    def __init__(self, value, status=200):
        self.value, self.status_code = value, status
    def iter_content(self, size):
        yield json.dumps(self.value).encode()
    def close(self): pass


class Session:
    def __init__(self, account=diagnose.DIAGNOSTICS_ACCOUNT, status=200):
        self.account, self.status = account, status
        self.calls, self.closed = [], False
        self.credentials = SimpleNamespace(token='synthetic-token-in-memory')
    def get(self, url, **kwargs):
        return self.request('GET', url, **kwargs)
    def request(self, method, url, **kwargs):
        self.calls.append((method, url, kwargs))
        if url == sdk.TOKENINFO:
            return Response({'sub': '123456789012345678901', 'email': self.account, 'email_verified': True, 'expires_in': '3600'})
        if method == 'GET' and 'iam.googleapis.com/' in url:
            if 'jems-request-broker@' in url: return Response({}, 404)
            return Response({'name': url, 'email': self.account, 'uniqueId': '123456789012345678901'})
        if method == 'GET' and not url.startswith(sdk.RUN_BASE): return Response({'name': url})
        if method == 'POST':
            return Response({'permissions': ['run.services.get', 'run.services.getIamPolicy', 'run.revisions.get', 'run.revisions.list']
                             if url.startswith('https://run.googleapis.com/') else []})
        kind, name = url.rsplit('/', 2)[1:]
        return Response(service(name) if kind == 'services' else revision(name), self.status)
    def close(self): self.closed = True


class SDKTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.folder = Path(tmp.name)
        self.manifest, self.credentials = self.folder / 'manifest.json', self.folder / 'credentials.json'
        self.credentials.write_text(json.dumps({
            'type': 'external_account', 'audience': sdk.AUDIENCE, 'subject_token_type': 'urn:ietf:params:oauth:token-type:jwt',
            'token_url': 'https://proxy:8446/identity/gcp/token',
            'service_account_impersonation_url': 'https://proxy:8446/identity/gcp/v1/projects/-/serviceAccounts/' +
                                                diagnose.DIAGNOSTICS_ACCOUNT + ':generateAccessToken',
            'credential_source': {'url': 'https://proxy:8446/identity/gcp/subject?alias=GCP',
                                  'headers': {'X-Identity-Header': 'synthetic-guard'},
                                  'format': {'type': 'json', 'subject_token_field_name': 'subject_token'}}}))
        self.connections([{'provider_kind': 'gcp', 'alias': 'GCP', 'credentials_file': str(self.credentials)}])
        self.env = {'OIC_MANIFEST_PATH': str(self.manifest), 'PATH': '',
                    'HTTPS_PROXY': 'https://approved.invalid', 'GUARD_BINDING': LEAK}

    def connections(self, rows):
        self.manifest.write_text(json.dumps({'version': 1, 'connections': rows}))

    def test_sdk_only_selector_actual_alias_and_no_gcloud(self):
        session = Session()
        before = self.credentials.read_bytes()
        self.credentials.chmod(0o444)
        with patch('subprocess.run', side_effect=AssertionError('No CLI allowed')):
            report = sdk.report('GCP', verify_permissions=True, environ=self.env, session_factory=lambda env: session)
        self.assertEqual(report['exit_code'], 0)
        self.assertEqual(report['identity_alias'], 'GCP')
        self.assertEqual(report['identity_account_verification'], 'verified')
        self.assertEqual(len(report['services']), 3)
        self.assertTrue(session.closed)
        self.assertEqual(self.credentials.read_bytes(), before)
        self.assertEqual(set(p.name for p in self.folder.iterdir()), {'manifest.json', 'credentials.json'})
        self.assertNotIn(LEAK, json.dumps(report))
        self.assertTrue(all(call[2]['allow_redirects'] is False for call in session.calls))

    def test_token_refresh_invalidates_permission_comparison_without_leaking(self):
        session = Session()
        reader = sdk.Reader({}, lambda _: session)
        reader.identity()
        session.credentials.token = LEAK
        with self.assertRaisesRegex(diagnose.DiagnosticError, 'SDK_TOKEN_CHANGED') as caught:
            reader.describe('services', 'factory-gateway')
        self.assertNotIn(LEAK, str(caught.exception))

    def test_wrong_effective_identity_stops_before_cloud_run(self):
        session = Session('owner@example.invalid')
        with self.assertRaisesRegex(diagnose.DiagnosticError, 'EFFECTIVE_IDENTITY_MISMATCH'):
            sdk.report('GCP', environ=self.env, session_factory=lambda _: session)
        self.assertEqual(len(session.calls), 1)
        self.assertTrue(session.closed)

    def test_missing_connection_wrong_alias_and_ambiguity_never_fall_back(self):
        for env, alias in (({}, 'GCP'), (self.env, 'jems-diagnostics')):
            factory = Mock()
            with self.assertRaises(diagnose.DiagnosticError): sdk.report(alias, environ=env, session_factory=factory)
            factory.assert_not_called()
        self.connections([{'provider_kind': 'gcp', 'alias': name, 'credentials_file': str(self.credentials)}
                          for name in ('GCP', 'other')])
        with self.assertRaisesRegex(diagnose.DiagnosticError, 'IDENTITY_SELECTION_REQUIRED'):
            sdk.report(environ=self.env)

    def test_permission_denied_is_unavailable_and_redacted(self):
        result = sdk.report('GCP', environ=self.env, session_factory=lambda _: Session(status=403))
        self.assertEqual(result['exit_code'], 2)
        self.assertNotIn(LEAK, json.dumps(result))
        self.assertTrue(all('ACCESS_DENIED' in row['error'] for row in result['services']))

    def test_credential_keys_owner_credentials_executables_and_wrong_target_rejected(self):
        base = json.loads(self.credentials.read_text())
        for change in ({'type': 'service_account', 'private_key': LEAK}, {'type': 'authorized_user'},
                       {'credential_source': {'executable': {'command': LEAK}}},
                       {'service_account_impersonation_url': LEAK}, {'token_url': 'https://evil.invalid'}):
            self.credentials.write_text(json.dumps({**base, **change}))
            with self.assertRaises(diagnose.DiagnosticError) as error: sdk.credential_info(self.credentials)
            self.assertNotIn(LEAK, str(error.exception))

    def test_transport_exception_and_redirect_never_expose_raw_data(self):
        for mode in ('exception', 'redirect'):
            session = Session()
            session.request = Mock(side_effect=RuntimeError(LEAK)) if mode == 'exception' else Mock(return_value=Response({'secret': LEAK}, 302))
            with self.assertRaises(diagnose.DiagnosticError) as error:
                sdk.report('GCP', environ=self.env, session_factory=lambda _: session)
            self.assertNotIn(LEAK, str(error.exception))

    def test_metadata_reader_rejects_arbitrary_and_cross_family_names(self):
        session = Session()
        reader = sdk.Reader({}, lambda _: session)
        with self.assertRaisesRegex(diagnose.DiagnosticError, 'EFFECTIVE_IDENTITY_UNVERIFIED'):
            reader.describe('services', 'factory-gateway')
        reader.identity()
        for kind, name in (('services', 'other'), ('secrets', 'factory-gateway'), ('revisions', '../secrets')):
            with self.assertRaisesRegex(diagnose.DiagnosticError, 'RESOURCE_OUTSIDE_SCOPE'):
                reader.describe(kind, name)
        self.assertEqual(len(session.calls), 2)

    def test_sdk_selector_preserves_proxy_and_managed_guard(self):
        env = managed.identity_environment('GCP', self.env, require_cli=False)
        self.assertEqual(env['HTTPS_PROXY'], self.env['HTTPS_PROXY'])
        self.assertEqual(env['GUARD_BINDING'], LEAK)
        self.assertNotIn('CLOUDSDK_CONFIG', env)
        with self.assertRaisesRegex(diagnose.DiagnosticError, 'IDENTITY_OVERRIDE_UNVERIFIED'):
            managed.identity_environment('GCP', {**self.env, 'CLOUDSDK_AUTH_ACCESS_TOKEN': LEAK}, require_cli=False)

    def test_exact_proxy_fixture_and_rejected_endpoint_variations(self):
        base = json.loads(self.credentials.read_text())
        self.assertEqual(sdk.credential_info(self.credentials), base)
        for key, bad in [('audience', sdk.AUDIENCE + '-other'),
                         ('token_url', 'http://proxy:8086/identity/gcp/token'),
                         ('token_url', 'https://proxy:8446/identity/gcp/token?redirect=evil'),
                         ('universe_domain', 'evil.invalid')]:
            self.credentials.write_text(json.dumps({**base, key: bad}))
            with self.assertRaises(diagnose.DiagnosticError): sdk.credential_info(self.credentials)
        for url in ['https://evil.invalid/token', 'file:///tmp/token',
                    'https://proxy:8446/identity/gcp/subject?alias=owner']:
            self.credentials.write_text(json.dumps({**base, 'credential_source': {**base['credential_source'], 'url': url}}))
            with self.assertRaises(diagnose.DiagnosticError): sdk.credential_info(self.credentials)

    def test_tokeninfo_denial_fails_closed_before_metadata(self):
        session = Session()
        session.get = Mock(return_value=Response({}, 403))
        with self.assertRaisesRegex(diagnose.DiagnosticError, 'TOKENINFO_UNAVAILABLE'):
            sdk.report('GCP', environ=self.env, session_factory=lambda _: session)
        self.assertEqual(session.calls, [])

    def test_wrong_unique_account_id_rejected(self):
        session = Session()
        original = session.request
        def changed(method, url, **kwargs):
            if 'iam.googleapis.com/' in url:
                return Response({'email': session.account, 'uniqueId': '999'})
            return original(method, url, **kwargs)
        session.request = changed
        with self.assertRaisesRegex(diagnose.DiagnosticError, 'EFFECTIVE_IDENTITY_MISMATCH'):
            sdk.report('GCP', environ=self.env, session_factory=lambda _: session)

    def test_token_change_during_introspection_rejected(self):
        session = Session()
        original = session.get
        def changed(*args, **kwargs):
            response = original(*args, **kwargs)
            session.credentials.token = LEAK
            return response
        session.get = changed
        with self.assertRaisesRegex(diagnose.DiagnosticError, 'SDK_TOKEN_CHANGED'):
            sdk.report('GCP', environ=self.env, session_factory=lambda _: session)


class PreflightTests(unittest.TestCase):
    def test_wrong_source_and_dirty_tree_stop_before_connection(self):
        for replies in (['b' * 40], ['a' * 40, ' M changed']):
            with patch.object(preflight, 'git', side_effect=replies), \
                 patch.object(preflight.managed, 'identity_environment') as select, \
                 patch.object(sys, 'argv', ['preflight', '--expected-source', 'a' * 40, '--live']), \
                 contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(preflight.main(), 2)
                select.assert_not_called()

    def test_live_failure_never_retains_configured_status(self):
        with patch.object(preflight, 'git', side_effect=['a' * 40, '']), \
             patch.object(preflight.managed, 'identity_environment', return_value={
                 'GOOGLE_APPLICATION_CREDENTIALS': '/managed/fixture', 'JEMS_DIAGNOSTIC_IDENTITY_ALIAS': 'GCP'}), \
             patch.object(preflight.diagnose_sdk, 'credential_info'), \
             patch.object(preflight.diagnose_sdk, 'report', side_effect=diagnose.DiagnosticError('TOKENINFO_UNAVAILABLE')), \
             patch.object(sys, 'argv', ['preflight', '--expected-source', 'a' * 40, '--live']), \
             contextlib.redirect_stdout(io.StringIO()) as out:
            self.assertEqual(preflight.main(), 2)
            result = json.loads(out.getvalue())
            self.assertEqual(result['status'], 'NOT_READY')
            self.assertTrue(result['live_attempted'])
            self.assertFalse(result['live_checked'])

    def test_offline_preflight_never_reads_cloud(self):
        with patch.object(preflight, 'git', side_effect=['a' * 40, '']), \
             patch.object(preflight.managed, 'identity_environment', return_value={
                 'GOOGLE_APPLICATION_CREDENTIALS': '/managed/fixture', 'JEMS_DIAGNOSTIC_IDENTITY_ALIAS': 'GCP'}), \
             patch.object(preflight.diagnose_sdk, 'credential_info'), \
             patch.object(preflight.diagnose_sdk, 'report') as live, \
             patch.object(sys, 'argv', ['preflight', '--expected-source', 'a' * 40]), \
             contextlib.redirect_stdout(io.StringIO()) as out:
            self.assertEqual(preflight.main(), 0)
            live.assert_not_called()
            self.assertEqual(json.loads(out.getvalue())['status'], 'CONFIGURED_NOT_VERIFIED')

    def test_source_only_preflight_never_selects_identity_or_claims_readiness(self):
        with patch.object(preflight, 'git', side_effect=['a' * 40, '']), \
             patch.object(preflight.managed, 'identity_environment') as select, \
             patch.object(preflight.diagnose_sdk, 'report') as live, \
             patch.object(sys, 'argv', ['preflight', '--expected-source', 'a' * 40, '--source-only']), \
             contextlib.redirect_stdout(io.StringIO()) as out:
            self.assertEqual(preflight.main(), 0)
            select.assert_not_called()
            live.assert_not_called()
            result = json.loads(out.getvalue())
            self.assertEqual(result['status'], 'SOURCE_VERIFIED_IDENTITY_UNCHECKED')
            self.assertFalse(result['identity_verified'])
            self.assertFalse(result['live_checked'])


if __name__ == '__main__': unittest.main()
