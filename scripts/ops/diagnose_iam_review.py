#!/usr/bin/env python3
"""Diagnose the recorded Policy Troubleshooter failure with two read-only requests."""
from __future__ import annotations

import argparse
from collections import Counter
import datetime
import hashlib
import json
import os
from pathlib import Path
import stat
import urllib.error
import urllib.request

from admin_api import NoRedirect, SetupError, require
import admin_cloud
import production_activation as review

ORIGINAL_HELPER = '62ef419613e7bcdc18d4028115f4620c062c0044'
RELEASE_SOURCE = 'f60f3b8f8cab67c0b97b7b136e6ce94de3b51844'
ORIGINAL_MANIFEST = '65c1beb3a0b3a715e884c15ecf6b9fe6d5355ab0ba7f28aca0f19686f7c1581b'
ORIGINAL_REVIEW = '4b70ce88b0310fcb18a5c9f7bb8d353c767aaa095f6f90fe7f6ea67a3a2c1bfa'
FILES = {'raw-responses.json', 'audit.json', 'prior-file-comparison.json',
         'proposed-activation-plan.json', 'summary.json'}
SERVICE = 'policytroubleshooter.googleapis.com'
SERVICE_NAME = f'projects/{review.NUMBER}/services/{SERVICE}'
TUPLE = {'principal': review.ACCOUNTS['publish'],
         'fullResourceName': '//artifactregistry.googleapis.com/' + review.REGISTRY,
         'permission': 'artifactregistry.repositories.downloadArtifacts'}
ROUTES = {'service_usage': ('GET', 'https://serviceusage.googleapis.com/v1/' + SERVICE_NAME),
          'troubleshooter': ('POST', 'https://' + SERVICE + '/v3/iam:troubleshoot')}
STATUSES = {'PERMISSION_DENIED', 'UNAUTHENTICATED', 'NOT_FOUND', 'INVALID_ARGUMENT',
            'RESOURCE_EXHAUSTED', 'FAILED_PRECONDITION', 'UNAVAILABLE', 'INTERNAL', 'UNKNOWN'}
REASONS = {'SERVICE_DISABLED', 'USER_PROJECT_DENIED', 'IAM_PERMISSION_DENIED', 'ACCESS_DENIED',
           'ACCESS_TOKEN_SCOPE_INSUFFICIENT', 'CONSUMER_INVALID', 'BILLING_DISABLED', 'SECURITY_POLICY_VIOLATED'}
PERMISSIONS = {'serviceusage.services.use', 'serviceusage.services.get', 'iam.roles.get',
               'resourcemanager.projects.getIamPolicy', 'resourcemanager.folders.getIamPolicy',
               'resourcemanager.organizations.getIamPolicy', 'iam.serviceAccounts.getIamPolicy',
               'run.services.getIamPolicy', 'artifactregistry.repositories.getIamPolicy',
               'iam.denypolicies.get', 'iam.denypolicies.list'}


def read_file(path):
    require(not path.is_symlink(), 'Evidence must not contain symlinks')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, 'rb') as stream:
        info = os.fstat(stream.fileno())
        require(info.st_uid == os.getuid() and info.st_mode & 0o077 == 0
                and stat.S_ISREG(info.st_mode) and info.st_size <= review.MAX_BYTES, 'Evidence must be bounded, owner-only regular files')
        return stream.read(review.MAX_BYTES + 1)


def original_evidence(directory, manifest_hash):
    directory = Path(directory)
    require(directory.is_dir() and directory.resolve() == directory.absolute()
            and directory.stat().st_uid == os.getuid() and directory.stat().st_mode & 0o077 == 0,
            'Original evidence directory must be private and direct')
    require(manifest_hash == ORIGINAL_MANIFEST, 'Manifest pin differs from the owner-reported collection')
    manifest_bytes = read_file(directory / 'SHA256SUMS.json')
    require(hashlib.sha256(manifest_bytes).hexdigest() == manifest_hash, 'Original manifest hash mismatch')
    manifest = json.loads(manifest_bytes)
    require(set(manifest) == FILES, 'Original manifest file set changed')
    records = {}
    for name in sorted(FILES):
        data = read_file(directory / name)
        require(hashlib.sha256(data).hexdigest() == manifest[name], 'Original evidence file hash mismatch')
        records[name] = json.loads(data)
    summary, audit, plan = (records[n] for n in ('summary.json', 'audit.json', 'proposed-activation-plan.json'))
    require(summary['helper_sha'] == ORIGINAL_HELPER and summary['release_source'] == RELEASE_SOURCE
            and summary['mutations'] == 0 and summary['activation_ready'] is False
            and summary['review_code'] == ORIGINAL_REVIEW, 'Original source or review identity changed')
    require(plan == audit['plan'] == review.make_plan(audit['state'])
            and plan['review_code'] == ORIGINAL_REVIEW and plan['source'] == RELEASE_SOURCE,
            'Recorded exact proposal is inconsistent')
    first = audit['effective_audit']['probes'][0]
    require({k: first[v] for k, v in (('principal', 'principal'), ('fullResourceName', 'resource'),
                                    ('permission', 'permission'))} == TUPLE
            and first['lane'] == 'publish' and first['observed_access'] == 'UNKNOWN'
            and audit['effective_audit']['unknown_count'] == 66, 'Recorded first unknown tuple changed')
    return records


def request(opener, token, operation):
    """Only the two fixed read operations exist; redirects and retries are disabled."""
    require(operation in ROUTES, 'Unrecognized read-only diagnostic operation')
    method, url = ROUTES[operation]
    data = json.dumps({'accessTuple': TUPLE}).encode() if operation == 'troubleshooter' else None
    req = urllib.request.Request(url, method=method, data=data, headers={
        'Authorization': 'Bearer ' + token, 'Accept': 'application/json', 'Content-Type': 'application/json',
        'x-goog-user-project': review.PROJECT})
    result = {'operation': operation, 'method': method, 'url': url,
              'observed_at_utc': datetime.datetime.now(datetime.timezone.utc).isoformat()}
    try:
        try:
            response = opener.open(req, timeout=25)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            result['http_status'] = response.code
            data = response.read(1_000_001)
        if len(data) > 1_000_000:
            result['failure'] = 'RESPONSE_TOO_LARGE'
        else:
            try: result['body'] = json.loads(data)
            except (ValueError, UnicodeError): result['non_json_body'] = data.decode('utf-8', errors='replace')
    except (urllib.error.URLError, TimeoutError, OSError):
        result['failure'] = 'TRANSPORT_UNVERIFIED'
    return result


def sanitize(result):
    body = result.get('body')
    error = body.get('error', {}) if isinstance(body, dict) else {}
    error = error if isinstance(error, dict) else {}
    row = {'operation': result['operation'], 'http_status': result.get('http_status'),
           'error_status': error.get('status') if error.get('status') in STATUSES else 'UNVERIFIED', 'error_info': []}
    details = error.get('details', [])
    for detail in details if isinstance(details, list) else []:
        if not isinstance(detail, dict) or detail.get('@type') != 'type.googleapis.com/google.rpc.ErrorInfo': continue
        if detail.get('domain') not in {'googleapis.com', 'iam.googleapis.com', 'serviceusage.googleapis.com'}: continue
        info = {'reason': detail.get('reason') if detail.get('reason') in REASONS else 'UNRECOGNIZED'}
        metadata = detail.get('metadata', {})
        if isinstance(metadata, dict):
            if metadata.get('service') in {SERVICE, 'serviceusage.googleapis.com'}: info['service'] = metadata['service']
            if metadata.get('permission') in PERMISSIONS: info['permission'] = metadata['permission']
            info['consumer_matches_expected'] = metadata.get('consumer') in {f'projects/{review.NUMBER}', f'projects/{review.PROJECT}'}
            info['resource_matches_expected'] = metadata.get('resource') in {f'projects/{review.NUMBER}', f'projects/{review.PROJECT}'}
        row['error_info'].append(info)
        if len(row['error_info']) == 8: break
    return row


def summarize(records, responses):
    checks = [sanitize(r) for r in responses]
    body = responses[0].get('body', {})
    state = body.get('state') if isinstance(body, dict) and body.get('name') == SERVICE_NAME and responses[0].get('http_status') == 200 else None
    state = state if state in {'ENABLED', 'DISABLED'} else 'UNKNOWN'
    infos = [i for row in checks for i in row['error_info']]
    findings = set()
    if state == 'DISABLED' or any(i['reason'] == 'SERVICE_DISABLED' and i.get('service') == SERVICE
                                and i.get('consumer_matches_expected') for i in infos): findings.add('API_DISABLED')
    for info in infos:
        if info['reason'] == 'IAM_PERMISSION_DENIED' and info.get('permission') == 'serviceusage.services.use' and (info.get('consumer_matches_expected') or info.get('resource_matches_expected')): findings.add('QUOTA_PROJECT_PERMISSION_DENIED')
        elif info['reason'] == 'USER_PROJECT_DENIED': findings.add('USER_PROJECT_REJECTED')
        elif info['reason'] == 'IAM_PERMISSION_DENIED': findings.add('EXPLICIT_IAM_PERMISSION_DENIED')
        elif info['reason'] == 'ACCESS_TOKEN_SCOPE_INSUFFICIENT': findings.add('TOKEN_SCOPE_INSUFFICIENT')
        elif info['reason'] == 'SERVICE_DISABLED' and info.get('service') == 'serviceusage.googleapis.com': findings.add('SERVICE_USAGE_CHECK_UNAVAILABLE')
    answer = responses[1].get('body', {})
    access = answer.get('overallAccessState') if isinstance(answer, dict) and responses[1].get('http_status') == 200 else None
    if access in {'CAN_ACCESS', 'CANNOT_ACCESS'}: findings.add('SINGLE_TUPLE_EVALUATED')
    if not findings: findings.add('INDETERMINATE')
    audit, plan = records['audit.json'], records['proposed-activation-plan.json']
    prior = []
    for row in records['prior-file-comparison.json']['files']:
        require(row['path'] in {str(review.PRIOR_DIRECTORY / (s + '.json')) for s in review.release.SERVICES}
                | {str(review.PRIOR_DIRECTORY / 'release.py'), str(review.PRIOR_PROPOSAL)}, 'Unexpected historical file identity')
        value = {'path': row['path'], 'status': row['status'] if row['status'] in {'PRESENT', 'ABSENT', 'UNVERIFIED'} else 'UNVERIFIED'}
        value.update({key: row[key] if isinstance(row[key], bool) else None for key in (
            'matches_fresh_fields', 'complete_baseline_fields', 'matches_approved_source_bytes') if key in row})
        prior.append(value)
    return {'schema': 1, 'status': 'READ_ONLY_DIAGNOSIS_RECORDED', 'mutations': 0, 'activation_ready': False,
            'original_helper_sha': ORIGINAL_HELPER, 'original_manifest_sha256': ORIGINAL_MANIFEST,
            'original_review_code': ORIGINAL_REVIEW, 'original_evidence_is_historical': True,
            'service_state': state, 'findings': sorted(findings), 'checks': checks,
            'single_tuple_access': access if access in {'CAN_ACCESS', 'CANNOT_ACCESS'} else 'UNKNOWN',
            'original_effective_unknown_count': audit['effective_audit']['unknown_count'],
            'original_action_counts': dict(Counter(a['kind'] for a in plan['actions'])),
            'original_proposed_binding_count': len(records['summary.json']['proposed_bindings']),
            'original_providers_disabled': {lane: value['disabled'] is True for lane, value in audit['state']['providers'].items()},
            'original_flags_absent': {name: value is None for name, value in audit['state']['flags'].items()},
            'original_prior_file_comparisons': prior,
            'limit': 'Two diagnostics only. USER_PROJECT_DENIED can also mean an invalid user project. A generic 403 proves no specific missing permission. Prior IAM observations were not refreshed; all 66 original access checks remain unverified as a collection. No activation or repair is authorized by this result.'}


def diagnose(evidence, manifest_hash, output, helper_sha, token_factory=admin_cloud.admin_token, opener=None):
    require(len(helper_sha) == 40 and set(helper_sha) <= set('abcdef0123456789'), 'Expected an immutable diagnostic helper SHA')
    records = original_evidence(evidence, manifest_hash)
    output = Path(output)
    require(not os.path.lexists(output), 'Use a new private diagnostic output directory')
    output.mkdir(mode=0o700)
    require(output.stat().st_mode & 0o077 == 0, 'Diagnostic directory must be private')
    token = token_factory()
    opener = opener or urllib.request.build_opener(NoRedirect())
    responses = [request(opener, token, operation) for operation in ROUTES]
    review.private_json(output / 'raw-responses.json', responses)
    summary = summarize(records, responses)
    summary.update(diagnostic_helper_sha=helper_sha, private_output=str(output),
                   observed_at_utc=datetime.datetime.now(datetime.timezone.utc).isoformat())
    review.private_json(output / 'summary.json', summary)
    review.private_json(output / 'SHA256SUMS.json', {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(output.iterdir())})
    summary['manifest_sha256'] = hashlib.sha256((output / 'SHA256SUMS.json').read_bytes()).hexdigest()
    return summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for flag in ('helper-sha', 'evidence-dir', 'manifest-sha256', 'output-dir'): parser.add_argument('--' + flag, required=True)
    args = parser.parse_args()
    try:
        review.clean_source(RELEASE_SOURCE, args.helper_sha)
        print(json.dumps(diagnose(args.evidence_dir, args.manifest_sha256, args.output_dir, args.helper_sha), indent=2, sort_keys=True))
    except (SetupError, OSError, ValueError, KeyError, TypeError):
        print(json.dumps({'status': 'READ_ONLY_DIAGNOSIS_STOPPED', 'mutations': 0,
                          'reason': 'Pinned evidence, private storage, or response shape could not be verified. Preserve original and partial outputs.'}))
        raise SystemExit(2) from None


if __name__ == '__main__': main()
