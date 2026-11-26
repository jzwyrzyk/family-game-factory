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
SECRETS = ('factory-gateway-private-config', 'factory-preview-private-config',
           'factory-github-app-private-key', 'factory-coach-openai-key')
PROJECT_NEGATIVE = ('run.services.create', 'run.services.update', 'run.services.delete',
    'run.services.setIamPolicy', 'run.jobs.create', 'run.jobs.run', 'run.jobs.update', 'run.jobs.delete',
    'secretmanager.versions.access', 'secretmanager.versions.destroy', 'secretmanager.versions.add',
    'secretmanager.secrets.delete', 'secretmanager.secrets.update', 'secretmanager.secrets.setIamPolicy',
    'resourcemanager.projects.setIamPolicy', 'resourcemanager.projects.delete',
    'iam.serviceAccounts.actAs', 'iam.serviceAccounts.getAccessToken', 'iam.serviceAccounts.signBlob',
    'iam.serviceAccounts.setIamPolicy', 'iam.serviceAccounts.create', 'iam.serviceAccounts.delete',
    'iam.serviceAccountKeys.create', 'iam.roles.create', 'iam.roles.update', 'iam.roles.delete',
    'cloudbuild.builds.create', 'artifactregistry.repositories.uploadArtifacts',
    'artifactregistry.repositories.delete', 'storage.objects.delete', 'storage.buckets.delete',
    'serviceusage.services.enable', 'logging.logEntries.list', 'datastore.entities.get', 'datastore.entities.delete')


def verify(token, factory=Http, *, verified_identity=None):
    if verified_identity is None:
        userinfo = factory('https://www.googleapis.com', token).call('GET', 'oauth2/v2/userinfo')
        require(userinfo.get('email') == ACCOUNT and userinfo.get('verified_email') is True,
                'Effective diagnostic identity unverified')
    else:
        require(verified_identity.get('effective_account') == ACCOUNT and
                verified_identity.get('verification') == 'google_tokeninfo_and_iam' and
                str(verified_identity.get('effective_account_unique_id', '')).isdigit(),
                'Effective diagnostic identity unverified')
    checks = []
    def probe(host, path, positive=(), negative=(), expected_absent=False):
        client = factory('https://' + host, token)
        resource = path.removesuffix(':testIamPermissions')
        row = {'resource': resource, 'status': 'UNAVAILABLE', 'allowed': [], 'denied': []}
        checks.append(row)
        try:
            inventory = client.call('GET', resource)
            status = inventory.get('_inventory_http_status')
            if status == 404:
                row['status'] = 'NOT_FOUND_EXPECTED_UNPROVISIONED' if expected_absent else 'NOT_FOUND'
                row['limit'] = 'No permission denial inferred; API may conceal inaccessible resources.'
                return
            if status or not inventory.get('name'):
                return
            row['existence'] = 'verified_by_resource_get'
            if expected_absent:
                row['status'] = 'UNEXPECTED_RESOURCE_PRESENT'
                return
            wanted = set(positive) | set(negative)
            result = client.call('POST', path, {'permissions': sorted(wanted)})
            require(isinstance(result, dict) and set(result) <= {'permissions'} and
                    isinstance(result.get('permissions', []), list), 'Permission response invalid')
            received = result.get('permissions', [])
            require(all(isinstance(x, str) for x in received) and len(received) == len(set(received)) and
                    set(received) <= wanted, 'Permission response invalid')
            row.update(status='VERIFIED' if set(received) == set(positive) else 'UNEXPECTED_PERMISSIONS',
                       allowed=sorted(received), denied=sorted(wanted-set(received)))
        except (SetupError, diagnose.DiagnosticError):
            row['status'] = 'UNAVAILABLE'
    for service in SERVICES:
        probe('run.googleapis.com', f'v2/projects/{P}/locations/us-east5/services/{service}:testIamPermissions',
              ('run.services.get', 'run.services.getIamPolicy', 'run.revisions.get', 'run.revisions.list'),
              ('run.services.update', 'run.services.delete', 'run.services.setIamPolicy'))
    probe('cloudresourcemanager.googleapis.com', f'v3/projects/{P}:testIamPermissions', (), PROJECT_NEGATIVE)
    for secret in SECRETS:
        probe('secretmanager.googleapis.com', f'v1/projects/{P}/secrets/{secret}:testIamPermissions', (),
              ('secretmanager.versions.access', 'secretmanager.versions.add', 'secretmanager.versions.destroy',
               'secretmanager.versions.disable', 'secretmanager.secrets.update', 'secretmanager.secrets.delete',
               'secretmanager.secrets.setIamPolicy'))
    for name in ('jems-cloud-run-release', 'jems-request-broker', 'jems-codex-diagnostics',
                 'factory-gateway', 'factory-preview', 'factory-coach'):
        email = f'{name}@{P}.iam.gserviceaccount.com'
        probe('iam.googleapis.com', f'v1/projects/{P}/serviceAccounts/{email}:testIamPermissions', (),
              ('iam.serviceAccounts.actAs', 'iam.serviceAccounts.getAccessToken', 'iam.serviceAccounts.getOpenIdToken',
               'iam.serviceAccounts.signBlob', 'iam.serviceAccounts.signJwt', 'iam.serviceAccounts.implicitDelegation',
               'iam.serviceAccounts.setIamPolicy', 'iam.serviceAccounts.update', 'iam.serviceAccounts.delete',
               'iam.serviceAccountKeys.create', 'iam.serviceAccountKeys.delete'), expected_absent=name=='jems-request-broker')
    passed = all(c['status'] in ('VERIFIED', 'NOT_FOUND_EXPECTED_UNPROVISIONED') for c in checks)
    return {'status': 'FINITE_CHECKS_PASSED' if passed else 'FINITE_CHECKS_INCOMPLETE',
            'effective_account': ACCOUNT, 'checks': checks,
            'observed_at_utc': datetime.now(timezone.utc).isoformat(), 'mutations': 0,
            'limit': 'Finite inventory-qualified probes only. Expected absent resources are excluded from denial claims; 404 is not universal proof of absence.'}


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
