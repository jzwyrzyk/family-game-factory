#!/usr/bin/env python3
"""Canonical managed GCP SDK diagnostics. No gcloud, credential copy or cache writes.

Explicitly selects a documented managed connection; never discovers ambient ADC.
Only the exact diagnostic account is accepted by authenticated Google userinfo.
The existing sanitized metadata reader is reused. Transport/auth failures emit
fixed codes, never credential files, tokens, raw configuration or SDK exceptions.
"""
import argparse
import json
from pathlib import Path
import sys

import diagnose
import managed_diagnostic_identity as managed
from admin_api import SetupError
import verify_diagnostic_access as access

SCOPES = ['https://www.googleapis.com/auth/cloud-platform', 'https://www.googleapis.com/auth/userinfo.email']
USERINFO = 'https://www.googleapis.com/oauth2/v2/userinfo'
RUN_BASE = f'https://{diagnose.REGION}-run.googleapis.com/apis/serving.knative.dev/v1/namespaces/{diagnose.PROJECT}'
MAX_BYTES = 256 * 1024


def credential_info(path):
    try:
        value = json.loads(Path(path).read_text())
        if not isinstance(value, dict) or value.get('type') != 'external_account':
            raise ValueError()
        # Supported managed WIF only. Never run an executable credential source,
        # consume a service-account key, or silently fall back to owner ADC.
        source = value.get('credential_source')
        if not isinstance(source, dict) or source.get('executable'):
            raise ValueError()
        expected = ('https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/' +
                    diagnose.DIAGNOSTICS_ACCOUNT + ':generateAccessToken')
        if value.get('service_account_impersonation_url') != expected:
            raise ValueError()
        if value.get('token_url') != 'https://sts.googleapis.com/v1/token':
            raise ValueError()
        return value
    except (OSError, ValueError, TypeError):
        raise diagnose.DiagnosticError('SDK_CREDENTIAL_CONFIGURATION_UNSUPPORTED: Expected the existing managed diagnostic WIF connection.') from None


def managed_session(env):
    info = credential_info(env['GOOGLE_APPLICATION_CREDENTIALS'])
    try:
        from google.auth import identity_pool
        from google.auth.transport.requests import AuthorizedSession
        # No project discovery or ADC fallback. Google SDK reads its configured
        # subject-token source and refreshes only in memory; no CLI token database.
        credentials = identity_pool.Credentials.from_info(info, scopes=SCOPES)
        return AuthorizedSession(credentials)
    except ImportError:
        raise diagnose.DiagnosticError('SDK_NOT_INSTALLED: Install scripts/ops/diagnostic-requirements.txt into a task virtual environment.') from None
    except Exception:
        raise diagnose.DiagnosticError('SDK_CONNECTION_UNAVAILABLE: Managed authentication could not be initialized.') from None


class Reader:
    def __init__(self, env, session_factory=managed_session):
        self.session = session_factory(env)
        self.verified = False

    def close(self):
        self.session.close()

    def request(self, method, url, body=None):
        # Routes are constructed solely by identity/describe/permission methods.
        try:
            response = self.session.request(method, url, json=body, timeout=15,
                                            max_allowed_time=45, allow_redirects=False, stream=True)
            try:
                if response.status_code in (401, 403):
                    raise diagnose.DiagnosticError('ACCESS_DENIED: SDK authentication or permission check failed.')
                if response.status_code != 200:
                    raise diagnose.DiagnosticError('SDK_READ_UNAVAILABLE: Exact resource or identity could not be read.')
                chunks, size = [], 0
                for chunk in response.iter_content(8192):
                    size += len(chunk)
                    if size > MAX_BYTES:
                        raise diagnose.DiagnosticError('SDK_RESPONSE_TOO_LARGE: Response exceeds bounded metadata size.')
                    chunks.append(chunk)
                result = json.loads(b''.join(chunks))
                if not isinstance(result, dict):
                    raise ValueError()
                return result
            finally:
                response.close()
        except diagnose.DiagnosticError:
            raise
        except Exception:
            raise diagnose.DiagnosticError('SDK_READ_FAILED: Connection, authentication or response validation failed; raw details suppressed.') from None

    def identity(self):
        info = self.request('GET', USERINFO)
        if (info.get('email') != diagnose.DIAGNOSTICS_ACCOUNT or info.get('verified_email') is not True
                or not isinstance(info.get('id'), str) or not info['id'].isdigit()):
            self.verified = False
            raise diagnose.DiagnosticError('EFFECTIVE_IDENTITY_MISMATCH: Google did not verify the diagnostic account.')
        self.verified = True
        return {'effective_account': diagnose.DIAGNOSTICS_ACCOUNT, 'verification': 'google_userinfo'}

    def describe(self, kind, name, _env=None):
        if not self.verified:
            raise diagnose.DiagnosticError('EFFECTIVE_IDENTITY_UNVERIFIED: Verify Google identity before metadata reads.')
        if kind not in ('services', 'revisions') or not diagnose.valid_name(kind, name):
            raise diagnose.DiagnosticError('RESOURCE_OUTSIDE_SCOPE: Only approved service/revision metadata can be read.')
        result = self.request('GET', f'{RUN_BASE}/{kind}/{name}')
        if result.get('metadata', {}).get('name') != name:
            raise diagnose.DiagnosticError('INVALID_METADATA: Resource identity differs from the requested name.')
        return result

    def permissions(self):
        reader = self
        # Reuse the exact finite tuple list, but the transport is SDK-backed and
        # never prints/exports an access token or invokes a CLI.
        class Adapter:
            def __init__(self, origin, _token):
                self.origin = origin
            def call(self, method, path, body=None):
                if method == 'GET' and self.origin + '/' + path == USERINFO:
                    return reader.request(method, USERINFO)
                if method != 'POST' or not path.endswith(':testIamPermissions'):
                    raise SetupError('Permission transport rejected operation')
                return reader.request(method, self.origin + '/' + path, body)
        return access.verify(None, Adapter)


def report(alias=None, self_check=False, verify_permissions=False, environ=None, session_factory=managed_session):
    env = managed.identity_environment(alias, environ)
    reader = Reader(env, session_factory)
    try:
        identity = reader.identity()
        result = {'project': diagnose.PROJECT, 'region': diagnose.REGION,
                  'mode': 'self_check' if self_check else 'diagnose', 'transport': 'google-auth-sdk',
                  'identity_alias': env['JEMS_DIAGNOSTIC_IDENTITY_ALIAS'],
                  'identity_account_verification': 'verified', **identity,
                  'identity_privilege_ceiling': 'not_verified', 'mutations': 0,
                  'private_config_contents': 'not_read', 'logs': 'not_read', 'services': []}
        for name in (diagnose.SERVICES[:1] if self_check else diagnose.SERVICES):
            try:
                metadata = reader.describe('services', name)
                result['services'].append({'service': name, 'metadata_read': 'passed'} if self_check else
                                          diagnose.service_summary(name, metadata, env, reader.describe))
            except diagnose.DiagnosticError as error:
                result['services'].append({'service': name, 'error': str(error)})
        if verify_permissions:
            result['permission_checks'] = reader.permissions()
            result['identity_privilege_ceiling'] = 'finite_checks_passed_not_universal'
        reader.identity()  # Verify effective account again after any SDK refresh.
        result['exit_code'] = (2 if any('error' in s for s in result['services']) else
                               0 if self_check or all(s['metadata_checks_passed'] for s in result['services']) else 1)
        return result
    finally:
        reader.close()


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--identity-alias', help='Actual configured alias, currently GCP; otherwise unique/default GCP')
    p.add_argument('--self-check', action='store_true')
    p.add_argument('--verify-permissions', action='store_true')
    args = p.parse_args(argv)
    try:
        result = report(args.identity_alias, args.self_check, args.verify_permissions)
    except diagnose.DiagnosticError as error:
        result = {'exit_code': 2, 'status': 'UNAVAILABLE', 'error': str(error), 'mutations': 0}
    except Exception:
        result = {'exit_code': 2, 'status': 'UNAVAILABLE',
                  'error': 'SDK_DIAGNOSTIC_UNVERIFIED: Identity, metadata or permission verification failed.', 'mutations': 0}
    print(json.dumps(result, indent=2))
    return result['exit_code']


if __name__ == '__main__':
    sys.exit(main())
