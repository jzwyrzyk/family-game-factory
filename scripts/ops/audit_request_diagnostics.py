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
import re
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


COACH_CONFIG = 'factory-coach-private-config'
SECRET_HOST = 'secretmanager.googleapis.com'


def metadata(host, path, token):
    try:
        return Http('https://' + host, token, {'x-goog-user-project': setup.PROJECT}).call('GET', path)
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


def unresolved(code):
    raise review.TroubleshootError({'error_status': code})


def serving_coach_secret(token):
    service = 'factory-coach-private'
    path = f'projects/{setup.PROJECT}/locations/us-east5/services/{service}'
    numeric = path.replace(setup.PROJECT, setup.NUMBER)
    mask = '?fields=name,reconciling,trafficStatuses(revision,percent)'

    def serving():
        state = metadata('run.googleapis.com', 'v2/' + path + mask, token)
        if state.get('name') not in (path, numeric) or state.get('reconciling'):
            unresolved('COACH_TRAFFIC_UNVERIFIED')
        traffic = state.get('trafficStatuses', [])
        if len(traffic) != 1 or traffic[0].get('percent') != 100:
            unresolved('COACH_TRAFFIC_UNVERIFIED')
        revision = traffic[0].get('revision', '')
        for prefix in (path, numeric):
            if revision.startswith(prefix + '/revisions/'):
                revision = revision.removeprefix(prefix + '/revisions/')
                break
        if not re.fullmatch(service + '-[a-z0-9-]+', revision):
            unresolved('COACH_REVISION_UNVERIFIED')
        return revision

    revision = serving()
    rev = path + '/revisions/' + revision
    fields = '?fields=name,containers(env(valueSource(secretKeyRef(secret)))),volumes(secret(secret))'
    data = metadata('run.googleapis.com', 'v2/' + rev + fields, token)
    if data.get('name') not in (rev, numeric + '/revisions/' + revision):
        unresolved('COACH_REVISION_UNVERIFIED')
    refs = [v['secret'].get('secret') for v in data.get('volumes', []) if 'secret' in v]
    refs.extend(e['valueSource']['secretKeyRef'].get('secret') for c in data.get('containers', [])
                for e in c.get('env', []) if 'secretKeyRef' in e.get('valueSource', {}))
    names = set()
    for ref in refs:
        match = re.fullmatch(r'(?:projects/([^/]+)/secrets/)?([A-Za-z0-9_-]{1,255})', ref or '')
        if not match or match[1] not in (None, setup.PROJECT, setup.NUMBER):
            unresolved('COACH_SECRET_SCOPE_UNVERIFIED')
        names.add(match[2])
    if not names:
        unresolved('COACH_NO_SERVING_SECRET_REFERENCE')
    if len(names) != 1:
        unresolved('COACH_MULTIPLE_SERVING_SECRETS')
    if serving() != revision:
        unresolved('COACH_TRAFFIC_CHANGED')
    return names.pop(), revision


def read_target(resource, token):
    host, path = resource[2:].split('/', 1)
    versions = {'logging.googleapis.com': 'v2', 'run.googleapis.com': 'v2',
                'cloudresourcemanager.googleapis.com': 'v3', 'iam.googleapis.com': 'v1',
                SECRET_HOST: 'v1'}
    if host == 'cloudresourcemanager.googleapis.com':
        path = 'projects/' + setup.NUMBER
    if host == SECRET_HOST:
        name = path.rsplit('/', 1)[1]
        base = 'projects/' + setup.NUMBER + '/secrets/'
        revision = None
        try:
            data = metadata(host, 'v1/' + base + name + '?fields=name', token)
        except review.TroubleshootError as exc:
            if name != COACH_CONFIG or exc.safe.get('http_status') != 404:
                raise
            name, revision = serving_coach_secret(token)
            if name in (COACH_CONFIG, 'factory-gateway-private-config'):
                unresolved('DISTINCT_COACH_SECRET_UNVERIFIED')
            data = metadata(host, 'v1/' + base + name + '?fields=name', token)
        if data.get('name') != base + name:
            unresolved('CANONICAL_SECRET_NAME_UNVERIFIED')
        return {'target': '//' + host + '/' + data['name'],
                **({'serving_coach_revision': revision} if revision else {})}
    data = metadata(host, versions[host] + '/' + path + '?fields=name', token)
    return isinstance(data, dict) and data.get('name') in (path, path.replace(
        'projects/' + setup.PROJECT + '/', 'projects/' + setup.NUMBER + '/'))


def policy_detail(result):
    # Export only documented enums, never role bindings, members or conditions.
    states = set()
    allow = result.get('allowPolicyExplanation', {})
    deny = result.get('denyPolicyExplanation', {})
    permitted = {'ALLOW_ACCESS_STATE_GRANTED', 'ALLOW_ACCESS_STATE_NOT_GRANTED',
                 'ALLOW_ACCESS_STATE_UNKNOWN_INFO', 'ALLOW_ACCESS_STATE_UNKNOWN_CONDITIONAL',
                 'DENY_ACCESS_STATE_DENIED', 'DENY_ACCESS_STATE_NOT_DENIED',
                 'DENY_ACCESS_STATE_UNKNOWN_INFO', 'DENY_ACCESS_STATE_UNKNOWN_CONDITIONAL',
                 'ROLE_PERMISSION_UNKNOWN_INFO', 'MEMBERSHIP_UNKNOWN_INFO', 'MEMBERSHIP_UNKNOWN_UNSUPPORTED'}
    for state in (allow.get('allowAccessState'), deny.get('denyAccessState')):
        if state in permitted:
            states.add(state)
    for policy in allow.get('explainedPolicies', []):
        if policy.get('allowAccessState') == 'ALLOW_ACCESS_STATE_UNKNOWN_INFO' and 'policy' not in policy:
            states.add('ALLOW_POLICY_NOT_VISIBLE')
        for binding in policy.get('bindingExplanations', []):
            if binding.get('rolePermission') == 'ROLE_PERMISSION_NOT_INCLUDED':
                continue
            for member, info in binding.get('memberships', {}).items():
                if info.get('membership') not in ('MEMBERSHIP_UNKNOWN_INFO', 'MEMBERSHIP_UNKNOWN_UNSUPPORTED'):
                    continue
                family = next((label for prefix, label in (
                    ('principalSet://', 'PRINCIPAL_SET'), ('principal://', 'PRINCIPAL'),
                    ('group:', 'GROUP'), ('domain:', 'DOMAIN')) if member.startswith(prefix)), 'OTHER')
                states.add('UNRESOLVED_MEMBER_' + family)
            for state in (binding.get('rolePermission'), binding.get('combinedMembership', {}).get('membership')):
                if state in permitted:
                    states.add(state)
    return sorted(states)


def boundary(row):
    if row['fullResourceName'].startswith('//' + SECRET_HOST + '/'):
        return True
    return (row['permission'] == 'iam.serviceAccounts.getAccessToken' and
            row['fullResourceName'].split('/')[-1] != setup.BROKER)


def audit(api, exists=lambda resource: False, *, unresolved_first=False):
    rows, cache = [], {}
    stopped = None
    roster = list(enumerate(tuples(), 1))
    priority_size = sum(boundary(row) for _, row in roster)
    if unresolved_first:
        roster.sort(key=lambda item: not boundary(item[1]))
    for index, row in roster:
        if unresolved_first and len(rows) == priority_size and any(not r['passed'] for r in rows):
            break
        provenance = {}
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
            if isinstance(present, dict):
                provenance = {'requested_resource': resource, **{k: v for k, v in present.items() if k != 'target'}}
                row = {**row, 'fullResourceName': present['target']}
            stage = 'troubleshooter'
            result = api.call('POST', 'v3/iam:troubleshoot',
                              {'accessTuple': {k: v for k, v in row.items() if k != 'expected'}})
            access = result.get('overallAccessState') if isinstance(result, dict) else None
            if access in ('CAN_ACCESS', 'CANNOT_ACCESS'):
                state = access
                stage = 'evaluated'
            else:
                if isinstance(result, dict) and (detail := policy_detail(result)):
                    evidence['policy_states'] = detail
                evidence['error_status'] = access if access in ('UNKNOWN_INFO', 'UNKNOWN_CONDITIONAL') else 'UNKNOWN_RESPONSE'
        except review.TroubleshootError as exc:
            evidence = exc.safe
            if stage == 'troubleshooter' and (evidence.get('http_status') == 401 or
                    set(evidence.get('reasons', [])) & {'SERVICE_DISABLED', 'USER_PROJECT_DENIED', 'CONSUMER_INVALID'}):
                stopped = evidence
        except (SetupError, TypeError, ValueError, AttributeError, KeyError):
            evidence = {'error_status': 'READ_UNAVAILABLE'}
        rows.append({**row, **provenance, 'row': index, 'observed': state,
                     'passed': state == row['expected'], 'stage': stage, **evidence})
    rows.sort(key=lambda r: r['row'])
    complete = len(rows) == len(roster) and all(r['passed'] for r in rows)
    return {'status': 'FINITE_POLICY_CHECKS_PASSED' if complete else 'NOT_ACCEPTED',
            'checks': rows, 'limit': 'Finite permission checks. Private invocation and broker coverage need separate evidence.',
            'mutations': 0}


def summary(report):
    rows = report.get('checks', [])
    groups = {}
    for index, row in enumerate(rows, 1):
        if row['passed']:
            continue
        detail = {k: row[k] for k in ('stage', 'expected', 'observed', 'http_status', 'error_status',
                                      'policy_states', 'reasons', 'invalid_fields', 'quota_limit_value') if k in row}
        group = groups.setdefault(json.dumps(detail, sort_keys=True), {**detail, 'rows': []})
        group['rows'].append(row.get('row', index))
    return {'broker_iam': report['status'], 'checks': len(rows), 'passed': sum(r['passed'] for r in rows),
            'observed': dict(Counter(r['observed'] for r in rows)), 'failures': list(groups.values()),
            **({'reason': report['reason']} if 'reason' in report else {})}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source-sha')
    p.add_argument('--unresolved-first', action='store_true',
                   help='Check the 12 outstanding boundaries first. Continue to all 77 only if they pass.')
    args = p.parse_args()
    try:
        token = command(['gcloud', 'auth', 'print-access-token', '--quiet'])
        api = review.Troubleshooter(token, lambda _: None, time.monotonic() + 780)
        report = audit(api, lambda resource: read_target(resource, token), unresolved_first=args.unresolved_first)
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
