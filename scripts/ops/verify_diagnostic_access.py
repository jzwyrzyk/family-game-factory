#!/usr/bin/env python3
"""Same-token identity and finite nonmutating privilege checks for managed Codex.

No secret payload, data, log entry or mutation is attempted. A failed/unsupported
probe is UNKNOWN, never proof of denied access. Resource probes are finite and
supplement, rather than replace, an operator's inherited/resource IAM audit.
"""
import argparse
from datetime import datetime, timezone
import json
import os
import sys

import diagnose
from admin_api import Http, SetupError, command, require

P = diagnose.PROJECT
ACCOUNT = diagnose.DIAGNOSTICS_ACCOUNT
SERVICES = diagnose.SERVICES
SECRETS = ('factory-gateway-private-config', 'factory-coach-private-config')


def verify(token, factory=Http):
    userinfo = factory('https://www.googleapis.com', token).call('GET', 'oauth2/v2/userinfo')
    require(userinfo.get('email') == ACCOUNT and userinfo.get('verified_email') is True,
            'Effective diagnostic identity unverified')
    checks = []
    def probe(host, path, positive=(), negative=()):
        wanted = set(positive) | set(negative)
        result = factory('https://' + host, token).call('POST', path, {'permissions': sorted(wanted)})
        require(isinstance(result, dict) and set(result) <= {'permissions'} and
                isinstance(result.get('permissions', []), list), 'Permission response invalid')
        received = result.get('permissions', [])
        require(all(isinstance(x, str) for x in received) and len(received) == len(set(received)) and
                set(received) <= wanted, 'Permission response invalid')
        require(set(received) == set(positive), 'Effective permission boundary mismatch')
        checks.append({'resource': path.removesuffix(':testIamPermissions'),
                       'allowed': sorted(positive), 'denied': sorted(negative)})
    for service in SERVICES:
        probe('run.googleapis.com', f'v2/projects/{P}/locations/us-east5/services/{service}:testIamPermissions',
              ('run.services.get', 'run.services.getIamPolicy'),
              ('run.services.update', 'run.services.delete', 'run.services.setIamPolicy'))
    probe('cloudresourcemanager.googleapis.com', f'v3/projects/{P}:testIamPermissions', (),
          ('resourcemanager.projects.setIamPolicy', 'resourcemanager.projects.delete',
           'run.services.create', 'iam.roles.create', 'iam.roles.update', 'iam.serviceAccounts.create',
           'logging.logEntries.list', 'datastore.entities.get', 'datastore.entities.delete'))
    for secret in SECRETS:
        probe('secretmanager.googleapis.com', f'v1/projects/{P}/secrets/{secret}:testIamPermissions', (),
              ('secretmanager.versions.access', 'secretmanager.secrets.delete', 'secretmanager.secrets.setIamPolicy'))
    for name in ('jems-cloud-run-release', 'jems-request-broker', 'jems-codex-diagnostics'):
        email = f'{name}@{P}.iam.gserviceaccount.com'
        probe('iam.googleapis.com', f'v1/projects/{P}/serviceAccounts/{email}:testIamPermissions', (),
              ('iam.serviceAccounts.getAccessToken', 'iam.serviceAccounts.setIamPolicy',
               'iam.serviceAccountKeys.create', 'iam.serviceAccounts.delete'))
    return {'status': 'FINITE_CHECKS_PASSED', 'effective_account': ACCOUNT, 'checks': checks,
            'observed_at_utc': datetime.now(timezone.utc).isoformat(), 'mutations': 0,
            'limit': 'Finite existing-resource probes; unknown/nonexistent resources cannot prove denial. '
                     'Review inherited and other resource grants separately; run diagnose.py for actual revision reads.'}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--identity-alias', default='GCP')
    args = p.parse_args()
    try:
        env = diagnose.identity_environment(alias=args.identity_alias, environ=os.environ)
        token = command(['gcloud', 'auth', 'print-access-token', '--quiet'], env=env)
        print(json.dumps(verify(token), indent=2))
        return 0
    except (SetupError, diagnose.DiagnosticError, OSError, ValueError, KeyError, TypeError):
        print(json.dumps({'status': 'UNKNOWN', 'mutations': 0,
                          'reason': 'Managed identity, effective account, resource or permission probe failed; no denial inferred'}))
        return 2


if __name__ == '__main__':
    sys.exit(main())
