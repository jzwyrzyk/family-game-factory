#!/usr/bin/env python3
"""Offline triage of PR153 reports; no authentication changes or application calls.

Validate the original artifact digest/provenance before invoking this classifier.
A 401 is an authentication observation, not a root cause or application crash.
"""
import argparse
from collections import Counter
import json
from pathlib import Path
import sys

import request_evidence as evidence


def triage(report):
    evidence.require(isinstance(report, dict) and set(report) == {
        'schema_version', 'project', 'region', 'query_status', 'reason', 'scope',
        'observed_at_utc', 'workflow', 'coverage', 'completeness', 'requests', 'counts'})
    evidence.require(report['schema_version'] == 1 and report['project'] == evidence.PROJECT
                     and report['region'] == evidence.REGION)
    scope = report['scope']
    evidence.require(isinstance(scope, dict) and set(scope) == set(evidence.INPUT_KEYS))
    evidence.require(scope['service'] in evidence.ROUTES and
                     (scope['revision'] is None or evidence.allowed_selector(scope['service'], scope['revision'])))
    now = evidence.utc(report['observed_at_utc'])
    start, end = evidence.utc(scope['start_utc']), evidence.utc(scope['end_utc'])
    evidence.require(start < end <= now and (end - start).total_seconds() <= 3600)
    client_failure = ((report['query_status'], report['reason']) in {
        ('UNAVAILABLE', 'IDENTITY_UNAVAILABLE'), ('UNAVAILABLE', 'BROKER_UNAVAILABLE'),
        ('UNAVAILABLE', 'PERMISSION_DENIED'), ('INCOMPLETE', 'INVALID_BROKER_RESPONSE'),
        ('INCOMPLETE', 'TIMEOUT'), ('NOT_CHECKED', 'NOT_STARTED')})
    if client_failure and report['completeness'] == dict.fromkeys(sorted(evidence.FLAGS)):
        evidence.require(report['requests'] == [] and report['counts'] is None and report['coverage'] is None)
        return {'status': report['query_status'], 'reason': report['reason'], 'scope': scope,
                'totals_known': False, 'observed_groups': [], 'automatic_rollback': False}
    verified = evidence.verified_result({
        'scope': scope, 'query_status': report['query_status'], 'reason': report['reason'],
        'coverage': report['coverage'], 'completeness': report['completeness'], 'rows': report['requests']}, scope, now)
    evidence.require(report['counts'] == verified['counts'])
    workflow = report['workflow']
    evidence.require(workflow is None or (isinstance(workflow, dict) and
                     set(workflow) == {'run_id', 'attempt', 'workflow_source_sha'} and
                     evidence.provenance({'GITHUB_RUN_ID': workflow['run_id'],
                                          'GITHUB_RUN_ATTEMPT': workflow['attempt'],
                                          'GITHUB_SHA': workflow['workflow_source_sha']}) == workflow))
    groups = Counter()
    for row in verified['requests']:
        status = row['status']
        category = ('AUTHENTICATION_UNRESOLVED' if status == 401 else
                    'AUTHORIZATION_DENIAL' if status == 403 else
                    'PREFLIGHT_COMPLETED' if status == 204 and row['method'] == 'OPTIONS' else
                    'SERVER_FAILURE_REQUIRES_ATTRIBUTION' if status >= 500 else
                    'HTTP_SUCCESS_NOT_USER_ACCEPTANCE' if 200 <= status < 300 else 'OTHER_HTTP')
        groups[(row['revision'], row['route'], row['method'], status, category)] += 1
    return {'status': report['query_status'], 'reason': report['reason'], 'scope': scope,
            'workflow': workflow, 'totals_known': report['query_status'] == 'COMPLETE',
            'observed_groups': [dict(zip(('revision', 'route', 'method', 'http_status', 'classification'), key),
                                     observed_count=count) for key, count in sorted(groups.items())],
            'source_mapping': 'Join serving revision to immutable deployment receipt/image/source; never infer SHA from revision suffix',
            'auth_next_step': 'Use a synthetic session to distinguish missing/expired/revoked credentials, renewal, '
                              'enrollment, profile authorization and cookie/origin configuration. Do not replay paid requests.',
            'trace_correlation': 'not established', 'automatic_rollback': False}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('report', type=Path)
    args = p.parse_args()
    try:
        raw = args.report.read_bytes()
        evidence.require(len(raw) <= evidence.MAX_BYTES)
        print(json.dumps(triage(json.loads(raw, object_pairs_hook=evidence.unique_keys)), indent=2))
        return 0
    except (OSError, ValueError, TypeError, KeyError):
        print(json.dumps({'status': 'NOT_CHECKED', 'reason': 'INVALID_OR_UNAVAILABLE_REPORT',
                          'totals_known': False, 'automatic_rollback': False}))
        return 2


if __name__ == '__main__':
    sys.exit(main())
