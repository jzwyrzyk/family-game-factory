#!/usr/bin/env python3
"""Operator-side finite effective IAM audit. Read-only Policy Troubleshooter calls.

The operator credential stays in Cloud Shell. CAN_ACCESS/CANNOT_ACCESS are the
only accepted outcomes; API failure, missing resources or unknown state never
pass. This is a finite tuple audit, not proof of a universal privilege ceiling.
"""
import json
import sys
from admin_api import Http, SetupError, command
import bootstrap_request_diagnostics as setup


def tuples():
    p = setup.PROJECT
    view = '//logging.googleapis.com/' + setup.VIEW
    rows = []
    def add(principal, resource, permissions, allowed):
        rows.extend({'principal': principal, 'fullResourceName': resource,
                     'permission': permission, 'expected': 'CAN_ACCESS' if allowed else 'CANNOT_ACCESS'}
                    for permission in permissions)
    add(setup.BROKER, view, setup.PERMISSIONS, True)
    add(setup.CALLER, f'//run.googleapis.com/projects/{p}/locations/us-east5/services/{setup.SERVICE}',
        ['run.routes.invoke'], True)
    add(setup.CALLER, view, setup.PERMISSIONS, False)
    for account in (setup.CALLER, setup.BROKER):
        for name in ('_Default', '_AllLogs'):
            add(account, f'//logging.googleapis.com/projects/{p}/locations/global/buckets/_Default/views/{name}',
                ['logging.views.access'], False)
        add(account, f'//cloudresourcemanager.googleapis.com/projects/{setup.NUMBER}',
            ['logging.logEntries.list', 'logging.logEntries.create', 'logging.fields.access',
             'resourcemanager.projects.setIamPolicy', 'resourcemanager.projects.delete',
             'iam.roles.create', 'run.services.create', 'datastore.entities.get', 'datastore.entities.delete'], False)
        for service in ('factory-gateway', 'factory-preview', 'factory-coach-private', setup.SERVICE):
            add(account, f'//run.googleapis.com/projects/{p}/locations/us-east5/services/{service}',
                ['run.services.update', 'run.services.delete', 'run.services.setIamPolicy'], False)
        for name in ('jems-cloud-run-release', 'jems-request-broker', 'jems-codex-diagnostics'):
            add(account, f'//iam.googleapis.com/projects/{p}/serviceAccounts/{name}@{p}.iam.gserviceaccount.com',
                ['iam.serviceAccounts.getAccessToken', 'iam.serviceAccountKeys.create',
                 'iam.serviceAccounts.setIamPolicy'], False)
        for name in ('factory-gateway-private-config', 'factory-coach-private-config'):
            add(account, f'//secretmanager.googleapis.com/projects/{p}/secrets/{name}',
                ['secretmanager.versions.access', 'secretmanager.secrets.delete'], False)
    return rows


def audit(api, exists=lambda resource: False):
    results, existence = [], {}
    for row in tuples():
        try:
            resource = row['fullResourceName']
            if resource not in existence:
                existence[resource] = exists(resource)
            if not existence[resource]:
                raise SetupError('Resource existence unverified')
            result = api.call('POST', 'v3/iam:troubleshoot',
                              {'accessTuple': {k: v for k, v in row.items() if k != 'expected'}})
            state = result.get('overallAccessState')
            if state not in ('CAN_ACCESS', 'CANNOT_ACCESS'):
                state = 'UNKNOWN'
        except (SetupError, TypeError, ValueError):
            state = 'UNKNOWN'
        results.append({**row, 'observed': state, 'passed': state == row['expected']})
    return {'status': 'FINITE_POLICY_CHECKS_PASSED' if all(r['passed'] for r in results) else 'NOT_ACCEPTED',
            'checks': results, 'limit': 'Operator must verify resource existence and ancestor visibility; '
            'unsupported resources, groups, deny policies or conditional inputs require separate review. '
            'Successful private invocation and actual view reads still required.', 'mutations': 0}


def main():
    try:
        token = command(['gcloud', 'auth', 'print-access-token', '--quiet'])
        def exists(resource):
            host, path = resource[2:].split('/', 1)
            versions = {'logging.googleapis.com': 'v2', 'run.googleapis.com': 'v2',
                        'cloudresourcemanager.googleapis.com': 'v3', 'iam.googleapis.com': 'v1',
                        'secretmanager.googleapis.com': 'v1'}
            data = Http('https://' + host, token).call('GET', versions[host] + '/' + path)
            return isinstance(data, dict) and bool(data.get('name'))
        result = audit(Http('https://policytroubleshooter.googleapis.com', token), exists)
        print(json.dumps(result, indent=2))
        return 0 if result['status'] == 'FINITE_POLICY_CHECKS_PASSED' else 2
    except SetupError:
        print(json.dumps({'status': 'NOT_ACCEPTED', 'mutations': 0, 'reason': 'Operator authentication unavailable'}))
        return 2


if __name__ == '__main__':
    sys.exit(main())
