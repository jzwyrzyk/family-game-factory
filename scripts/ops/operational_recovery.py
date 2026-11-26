#!/usr/bin/env python3
"""One read-only recovery inventory: broker audit/partial state, disk capacity, saved DEV/TEST plan.

No create, apply, delete, upload, secret payload, request replay or credential copy.
Provider error details and exact local manifests remain in a private receipt folder.
"""
import argparse
import contextlib
from datetime import datetime, timedelta, timezone
import hashlib
import io
import json
import os
from pathlib import Path
import re
import sys

import bootstrap_request_diagnostics as broker
import cleanup_historical_checkouts as cleanup
import recover_checkout_space as capacity
import setup_nonproduction as nonprod
from admin_api import Http, SetupError, command

BUILD = '7fcac19a-8444-4c17-955a-1a381006069e'
BUILD_SOURCE = '446a245e624f44c36e1e3847ae7779477272d899'
IMAGE = broker.publication.IMAGE + '@sha256:4373d65ae39fdf0ea10f2f3a4afe5ce57ab9962d97779a56cdde67a919659c3e'
NONPROD_APPROVAL = '821d722ee140ffdef4c8ae4ba4e1fed89307e6c997153b3a8597f726a8caaad6'
BUCKET = broker.VIEW.rsplit('/views/', 1)[0]
METHOD = 'google.logging.v2.ConfigServiceV2.CreateView'
# Historical audit correlation only: never accepted by the corrected runtime.
FAILED_BUILD_VIEW_FILTER = (
    'source("projects/family-game-factory-jzw") AND resource.type="cloud_run_revision" '
    'AND log_id("run.googleapis.com/requests") AND resource.labels.location="us-east5" '
    'AND (resource.labels.service_name="factory-gateway" OR resource.labels.service_name="factory-preview" '
    'OR resource.labels.service_name="factory-coach-private")'
)


def hints(message):
    """Fixed semantic hints, never arbitrary provider text."""
    tests = {
        'MENTIONS_OR': r'\bOR\b', 'MENTIONS_RESOURCE_LABELS': r'resource\.labels|resource labels',
        'MENTIONS_FLEXIBLE_FILTER': r'flexible', 'MENTIONS_UNSUPPORTED_FILTER': r'not supported|unsupported|only.*supported',
        'MENTIONS_PARSER_ERROR': r'parse|syntax|unexpected token',
        'MENTIONS_LOCATION': r'location|region', 'MENTIONS_FILTER_LENGTH': r'length|too long',
        'VIEW_FILTER_NESTING_DEPTH_EXCEEDED': r'Filter exceeds the view filter nesting depth limit',
        'MENTIONS_INVALID_ARGUMENT': r'invalid.argument'}
    return [name for name, pattern in tests.items() if re.search(pattern, message, re.I if name != 'MENTIONS_OR' else 0)]


def redacted_message(message):
    # Preserve diagnostic vocabulary; redact arbitrary identifiers and values.
    allowed = set(('a an the this that is are was were only must can cannot may not no supported unsupported '
                   'support use uses using allowed invalid argument filter view log logging filters basic flexible '
                   'and or not source log_id resource.type resource.labels resource.labels.location '
                   'resource.labels.service_name resource labels label location type clauses clause logical '
                   'conjunction conjunctions disjunction disjunctions operator operators comparison comparisons '
                   'field fields expression expressions syntax parse parser parseable unparseable failed error '
                   'unexpected token tokens expected missing function functions restriction restrictions '
                   'with without in on for of to at value values exceeds exceeded nesting depth limit limits '
                   'maximum minimum total size length byte bytes character characters count counts number term terms complexity').split())
    return ' '.join(t if t.lower() in allowed or t in '():,.=<>![]' else '[redacted]'
                    for t in re.findall(r'[A-Za-z0-9_.-]+|[^\w\s]', message)[:120])


def failure_details(message):
    # An integer is safe only in this exact provider diagnostic, never arbitrary IDs.
    matched = re.fullmatch(r'Filter exceeds the view filter nesting depth limit of ([0-9]{1,3})\.?', message)
    return {'provider_code': 'VIEW_FILTER_NESTING_DEPTH_EXCEEDED', 'nesting_depth_limit': int(matched[1])} if matched else {}


def audit_evidence(api, folder):
    start = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
    query = (f'log_id("cloudaudit.googleapis.com/activity") AND protoPayload.serviceName="logging.googleapis.com" '
             f'AND protoPayload.methodName="{METHOD}" AND timestamp>="{start}" AND '
             f'(protoPayload.resourceName="{broker.VIEW}" OR '
             f'(protoPayload.request.parent="{BUCKET}" AND protoPayload.request.viewId="jems-production-requests"))')
    rows, token = [], None
    for _ in range(5):
        body = {'resourceNames': ['projects/' + broker.PROJECT], 'filter': query,
                'orderBy': 'timestamp desc', 'pageSize': 20}
        if token: body['pageToken'] = token
        result = api.call('POST', 'v2/entries:list?fields=nextPageToken,entries(timestamp,protoPayload)', body)
        broker.require(isinstance(result, dict) and isinstance(result.get('entries', []), list), 'AUDIT_RESPONSE_INVALID')
        for entry in result.get('entries', []):
            payload = entry.get('protoPayload', {})
            request = payload.get('request', {})
            if payload.get('methodName') != METHOD: continue
            if not (payload.get('resourceName') == broker.VIEW or
                    (request.get('parent') == BUCKET and request.get('viewId') == 'jems-production-requests')): continue
            status = payload.get('status', {})
            # Only this exact view's administrative failure, no principal or application log fields.
            if status.get('code') != 3: continue
            message = str(status.get('message', ''))[:4096]
            rows.append({'time': entry.get('timestamp'), 'status_code': 3,
                         'message': message, 'filter_matches_failed_build_contract': request.get('view', {}).get('filter') == FAILED_BUILD_VIEW_FILTER})
        token = result.get('nextPageToken')
        if not token: break
    receipt = {'kind': 'PRIVATE_CREATE_VIEW_FAILURE', 'rows': rows, 'complete': not bool(token)}
    capacity.write_json(folder / ('provider-audit-' + cleanup.digest(receipt) + '.json'), receipt)
    return {'status': 'MATCHED_FAILURES' if rows else 'NO_MATCHING_FAILURE_OBSERVED',
        'complete': not bool(token), 'failures': [{k: r[k] for k in ('time', 'status_code', 'filter_matches_failed_build_contract')} |
            failure_details(r['message']) |
            {'message_sha256': hashlib.sha256(r['message'].encode()).hexdigest(), 'hints': hints(r['message']), 'provider_message_redacted': redacted_message(r['message'])} for r in rows],
        'exact_provider_message': 'RETAINED_PRIVATELY_NOT_PRINTED'}


def local_cli_evidence(home, folder):
    base = cleanup.safe_path(home / '.config/gcloud/logs')
    if not base.is_dir(): return {'status': 'NO_LOCAL_CLI_LOGS'}
    candidates = sorted((p for p in base.rglob('*.log') if not p.is_symlink()), key=lambda p: p.stat().st_mtime, reverse=True)
    messages, inspected, skipped, total = [], 0, 0, 0
    for path in candidates[:200]:
        cleanup.safe_path(path)
        size = path.stat().st_size
        if size > 4_000_000 or total + size > 32_000_000:
            skipped += 1; continue
        inspected += 1; total += size
        text = path.read_text(errors='replace')
        if 'jems-production-requests' not in text or 'logging.views.create' not in text: continue
        # SDK debug logs often retain the JSON provider error without the terminal prefix.
        if 'INVALID_ARGUMENT' in text:
            for match in re.finditer(r'"message"\s*:\s*("(?:[^"\\]|\\.)*")', text):
                messages.append(json.loads(match.group(1))[:4096])
        for line in text.splitlines():
            if '(gcloud.logging.views.create)' in line and ('INVALID_ARGUMENT' in line or 'Invalid argument' in line):
                messages.append(line.split('(gcloud.logging.views.create)', 1)[1].strip()[:4096])
    messages = list(dict.fromkeys(m for m in messages if not re.search(
        r'Bearer|access_token|refresh_token|private_key|ya29\.', m, re.I)))[:20]
    receipt = {'kind': 'PRIVATE_LOCAL_CREATE_VIEW_FAILURE', 'messages': messages}
    capacity.write_json(folder / ('provider-cli-' + cleanup.digest(receipt) + '.json'), receipt)
    return {'status': 'MATCHED_FAILURES' if messages else 'NO_MATCHING_FAILURE_OBSERVED',
            'inspected_log_files': inspected, 'skipped_or_outside_limit': skipped + max(0, len(candidates) - 200),
            'failures': [{'message_sha256': hashlib.sha256(m.encode()).hexdigest(), 'hints': hints(m), 'provider_message_redacted': redacted_message(m)} for m in messages],
            'exact_provider_message': 'RETAINED_PRIVATELY_NOT_PRINTED'}


def audit_failure(error):
    matched = re.search(r'returned HTTP ([0-9]{3})$', str(error)) if isinstance(error, SetupError) else None
    return {'status': 'AUDIT_READ_UNAVAILABLE', 'absence_not_inferred': True,
            'code': 'AUDIT_HTTP_FAILED' if matched else 'AUDIT_TRANSPORT_AUTH_OR_RESPONSE_FAILED',
            'http_status': int(matched.group(1)) if matched else None}


def saved_nonprod(folder):
    folder = cleanup.safe_path(folder)
    receipt = json.loads((folder / 'reviewed.json').read_bytes())
    binding = json.loads((folder / 'binding.json').read_bytes())
    broker.require(receipt.get('binding') == binding and binding.get('source_sha') == BUILD_SOURCE, 'NONPROD_BINDING_CHANGED')
    broker.require(nonprod.digest(receipt) == NONPROD_APPROVAL, 'NONPROD_APPROVAL_CHANGED')
    with (folder / 'reviewed.tfplan').open('rb') as f: sha = hashlib.file_digest(f, 'sha256').hexdigest()
    broker.require(sha == receipt['plan_sha256'], 'NONPROD_SAVED_PLAN_CHANGED')
    return {'status': 'SAVED_PLAN_INTEGRITY_VERIFIED', 'source_sha': BUILD_SOURCE,
            'approval_sha256': NONPROD_APPROVAL, 'apply_started_record_found': (folder / 'apply-started').exists(),
            'terraform_invoked': False, 'state_modified': False}


def main(argv=None):
    os.umask(0o077)
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source-sha', required=True); p.add_argument('--home-dir', type=Path, required=True)
    p.add_argument('--receipt-dir', type=Path, required=True); p.add_argument('--nonprod-state-dir', type=Path)
    p.add_argument('--broker-image'); p.add_argument('--broker-build-id'); p.add_argument('--broker-build-source-sha')
    p.add_argument('--skip-broker-inventory', action='store_true')
    a = p.parse_args(argv)
    supplied = (a.broker_image, a.broker_build_id, a.broker_build_source_sha)
    broker.require(all(supplied) or not any(supplied), 'COMPLETE_REPLACEMENT_BUILD_REFERENCE_REQUIRED')
    broker.require(not a.skip_broker_inventory or not any(supplied), 'SKIPPED_INVENTORY_CANNOT_BIND_IMAGE')
    broker.source(a.source_sha)
    home = cleanup.safe_path(a.home_dir); folder = cleanup.private_dir(a.receipt_dir, home)
    report = {'status': 'READ_ONLY_RECOVERY_REPORT_NOT_ACTIVATION', 'source_sha': a.source_sha, 'cloud_mutations': 0, 'deletions': 0, 'archive_uploads': 0}
    try:
        token = command(['gcloud', 'auth', 'print-access-token', '--quiet'])
        report['provider_audit'] = audit_evidence(Http('https://logging.googleapis.com', token), folder)
    except Exception as error:
        report['provider_audit'] = audit_failure(error)
    try: report['local_provider_evidence'] = local_cli_evidence(home, folder)
    except Exception: report['local_provider_evidence'] = {'status': 'LOCAL_EVIDENCE_UNAVAILABLE'}
    if a.skip_broker_inventory:
        report['broker'] = {'status': 'NOT_CHECKED_BUILD_UNQUALIFIED', 'existing_resources_checked': False}
    else:
        with contextlib.redirect_stdout(io.StringIO()) as captured:
            code = broker.main(['--source-sha', a.source_sha, '--image', a.broker_image or IMAGE,
                                '--build-id', a.broker_build_id or BUILD,
                                '--build-source-sha', a.broker_build_source_sha or BUILD_SOURCE, '--check'])
        inventory = json.loads(captured.getvalue())
        if code == 0:
            plan = inventory['plan']; capacity.write_json(folder / ('broker-remaining-' + cleanup.digest(plan) + '.json'), plan)
            report['broker'] = {'status': 'REMAINING_ACTIONS_REVIEW_ONLY', 'actions': plan['actions'],
                'remaining_actions_sha256': inventory['approve_plan_sha256'],
                'existing_resources_checked': True, 'apply_blocker': 'FRESH_EXACT_PLAN_APPROVAL_AND_PROVIDER_FILTER_ACCEPTANCE_REQUIRED',
                'image': a.broker_image or IMAGE, 'build_source_sha': a.broker_build_source_sha or BUILD_SOURCE}
        else:
            report['broker'] = inventory
            if inventory.get('code') == 'BUILD_SOURCE_BROKER_FILES_DIFFER':
                report['broker']['next_action'] = 'REVIEW_NEW_FILTER_SOURCE_AND_BUILD_PLAN; DO_NOT_RESUBMIT_HISTORICAL_BUILD'
    try:
        with contextlib.redirect_stdout(io.StringIO()) as captured:
            cleanup.main(['--home-dir', str(home), '--receipt-dir', str(folder / 'source-cleanup')])
        report['source_cleanup'] = json.loads(captured.getvalue())
    except Exception: report['source_cleanup'] = {'status': 'SOURCE_RECOVERABILITY_REVIEW_BLOCKED'}
    try:
        with contextlib.redirect_stdout(io.StringIO()) as captured:
            capacity.main(['--home-dir', str(home), '--receipt-dir', str(folder / 'capacity')])
        report['disk'] = json.loads(captured.getvalue())
    except Exception: report['disk'] = {'status': 'CAPACITY_REVIEW_BLOCKED'}
    try: report['nonproduction'] = saved_nonprod(a.nonprod_state_dir or home / 'work/jems-nonprod-state')
    except Exception: report['nonproduction'] = {'status': 'SAVED_PLAN_CHECK_UNAVAILABLE_OR_MISMATCH', 'terraform_invoked': False, 'state_modified': False}
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    try: main()
    except Exception: print(json.dumps({'status': 'RECOVERY_PREFLIGHT_STOPPED', 'cloud_mutations': 0, 'deletions': 0})); sys.exit(2)
