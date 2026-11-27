#!/usr/bin/env python3
"""Operator-side finite effective IAM audit. Read-only Policy Troubleshooter calls.

The operator credential stays in Cloud Shell. CAN_ACCESS/CANNOT_ACCESS are the
only accepted outcomes; API failure, missing resources or unknown state never
pass. This is a finite tuple audit, not proof of a universal privilege ceiling.
"""
import argparse
from collections import Counter
import json
import os
from pathlib import Path
import sys
import time
import urllib.error
import uuid
import production_activation as review
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
        add(account, f'//cloudresourcemanager.googleapis.com/projects/{p}',
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


def read_target(resource, token):
    host, path = resource[2:].split('/', 1)
    versions = {'logging.googleapis.com': 'v2', 'run.googleapis.com': 'v2',
                'cloudresourcemanager.googleapis.com': 'v3', 'iam.googleapis.com': 'v1',
                'secretmanager.googleapis.com': 'v1'}
    # Use the project ID in the IAM tuple and the verified number in the v3 GET.
    if host == 'cloudresourcemanager.googleapis.com':
        path = 'projects/' + setup.NUMBER
    try:
        data = Http('https://' + host, token, {'x-goog-user-project': setup.PROJECT}).call(
            'GET', versions[host] + '/' + path + '?fields=name')
    except SetupError as exc:
        error = exc.__context__
        if isinstance(error, urllib.error.HTTPError):
            with error:
                raw = error.read(65537)
            try:
                body = json.loads(raw) if len(raw) <= 65536 else {}
            except (ValueError, UnicodeError):
                body = {}
            raise review.TroubleshootError(review.troubleshoot_error(error.code, body)) from None
        raise
    return isinstance(data, dict) and data.get('name') in (path, path.replace(
        'projects/' + setup.PROJECT + '/', 'projects/' + setup.NUMBER + '/'))


def audit(api, exists=lambda resource: False):
    rows, cache = [], {}
    stopped = None
    for row in tuples():
        resource = row['fullResourceName']
        stage = 'resource_get'
        state = 'UNKNOWN'
        evidence = {}
        try:
            if stopped:
                stage = 'not_attempted'
                raise review.TroubleshootError(stopped)
            if resource not in cache:
                try:
                    cache[resource] = (exists(resource), None)
                except SetupError as exc:
                    cache[resource] = (False, getattr(exc, 'safe', {'error_status': 'READ_UNAVAILABLE'}))
            present, error = cache[resource]
            if not present:
                raise review.TroubleshootError(error or {'error_status': 'TARGET_UNVERIFIED'})
            stage = 'troubleshooter'
            result = api.call('POST', 'v3/iam:troubleshoot',
                              {'accessTuple': {k: v for k, v in row.items() if k != 'expected'}})
            access = result.get('overallAccessState') if isinstance(result, dict) else None
            if access in ('CAN_ACCESS', 'CANNOT_ACCESS'):
                state = access
                stage = 'evaluated'
            else:
                evidence['error_status'] = access if access in ('UNKNOWN_INFO', 'UNKNOWN_CONDITIONAL') else 'UNKNOWN_RESPONSE'
        except review.TroubleshootError as exc:
            evidence = exc.safe
            if stage == 'troubleshooter' and (evidence.get('http_status') == 401 or
                    set(evidence.get('reasons', [])) & {'SERVICE_DISABLED', 'USER_PROJECT_DENIED', 'CONSUMER_INVALID'}):
                stopped = evidence
        except (SetupError, TypeError, ValueError):
            evidence = {'error_status': 'READ_UNAVAILABLE'}
        rows.append({**row, 'observed': state, 'passed': state == row['expected'], 'stage': stage, **evidence})
    return {'status': 'FINITE_POLICY_CHECKS_PASSED' if all(r['passed'] for r in rows) else 'NOT_ACCEPTED',
            'checks': rows, 'limit': 'Finite permission checks. Private invocation and broker coverage need separate evidence.',
            'mutations': 0}


def summary(report):
    rows = report.get('checks', [])
    groups = {}
    for index, row in enumerate(rows, 1):
        if row['passed']:
            continue
        detail = {k: row[k] for k in ('stage', 'expected', 'observed', 'http_status', 'error_status',
                                      'reasons', 'invalid_fields', 'quota_limit_value') if k in row}
        group = groups.setdefault(json.dumps(detail, sort_keys=True), {**detail, 'rows': []})
        group['rows'].append(index)
    return {'broker_iam': report['status'], 'checks': len(rows), 'passed': sum(r['passed'] for r in rows),
            'observed': dict(Counter(r['observed'] for r in rows)), 'failures': list(groups.values()),
            **({'reason': report['reason']} if 'reason' in report else {})}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source-sha')
    args = p.parse_args()
    try:
        token = command(['gcloud', 'auth', 'print-access-token', '--quiet'])
        api = review.Troubleshooter(token, lambda _: None, time.monotonic() + 780)
        report = audit(api, lambda resource: read_target(resource, token))
    except SetupError:
        report = {'status': 'NOT_ACCEPTED', 'mutations': 0, 'reason': 'OPERATOR_AUTH_UNAVAILABLE'}
    if args.source_sha:
        # The pinned operations bootstrap sets this journal and checks the checkout.
        journal = Path(os.environ['JEMS_OPERATION_JOURNAL'])
        report.update(source_sha=args.source_sha, quota_project=setup.PROJECT)
        path = journal.parent / ('effective-iam-' + uuid.uuid4().hex + '.json')
        review.private_json(path, report)
        print(json.dumps({**summary(report), 'private_report': path.name}))
    else:
        print(json.dumps(report, indent=2))
    return 0 if report['status'] == 'FINITE_POLICY_CHECKS_PASSED' else 2


if __name__ == '__main__':
    sys.exit(main())
