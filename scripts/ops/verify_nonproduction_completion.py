#!/usr/bin/env python3
"""Finish evidence recording after the reviewed budget-filter refresh. No apply path."""
import argparse
import fcntl
import json
import os
import re
import subprocess
import sys
import uuid
from pathlib import Path
from zipfile import BadZipFile, ZipFile

import recover_nonproduction as r

APPLIED_SOURCE = '14188d773e7792d3ece5bcf46cc775d99537f8d8'
FILTERS = ('credit_types', 'resource_ancestors', 'subaccounts')


def verify_budget_refresh(drift):
    r.need(len(drift) == 1 and drift[0]['address'] == r.BUDGET and drift[0].get('mode') == 'managed'
           and drift[0]['change']['actions'] == ['update'], 'UNEXPECTED_REFRESH')
    change = drift[0]['change']
    before, after = change['before'], change['after']
    r.need(len(before['budget_filter']) == 1 and len(after['budget_filter']) == 1, 'BUDGET_FILTER_CHANGED')
    original = before['budget_filter'][0]
    r.need(all(k in original and original[k] is None for k in FILTERS), 'BUDGET_FILTER_CHANGED')
    normalized = {**original, **{k: [] for k in FILTERS}}
    r.need(r.digest({**before, 'budget_filter': [normalized]}) == r.digest(after)
           and normalized.get('projects') == ['projects/' + r.NUMBER]
           and normalized.get('credit_types_treatment') == 'INCLUDE_ALL_CREDITS', 'BUDGET_FILTER_CHANGED')


def verify_plan(plan, expected):
    rows = plan.get('resource_changes', [])
    managed = [row['address'] for row in rows if row.get('mode') == 'managed']
    r.need(plan.get('terraform_version') == '1.13.5' and plan.get('complete') is True
           and plan.get('errored') is False and not plan.get('deferred_changes')
           and plan.get('checks') and all(c.get('status') == 'pass' for c in plan['checks'])
           and len(managed) == len(expected) and set(managed) == expected
           and all(row['change']['actions'] == ['no-op'] and not row['change'].get('importing')
                   and not row.get('previous_address') for row in rows)
           and all(o['actions'] == ['no-op'] for o in plan.get('output_changes', {}).values()), 'POST_APPLY_DRIFT')
    verify_budget_refresh(plan.get('resource_drift', []))
    provider = next(row['change']['after'] for row in rows if row['address'] == r.PROVIDER)
    pool = next(row['change']['after'] for row in rows if row['address'] == 'google_iam_workload_identity_pool.github')
    r.need(provider['disabled'] is True and pool['disabled'] is True, 'FEDERATION_NOT_DISABLED')


def verify(original, approval, plan_hash, source):
    hashes, _, _, recorded = r.original_evidence(original)
    parent = r.private_path(original / 'partial-recovery', directory=True)
    marker = r.read_json(r.private_path(parent / 'apply-started'))
    folder = r.private_path(marker['successor'], directory=True)
    r.need(folder.parent == parent and re.fullmatch(r'attempt-[a-f0-9]{32}', folder.name)
           and marker == {'approval': approval, 'source': APPLIED_SOURCE, 'successor': str(folder)}
           and r.read_json(r.private_path(folder / 'apply-started')) == {'approval': approval}, 'APPLY_MARKER_MISMATCH')
    r.need(not (folder / '.terraform.tfstate.lock.info').exists(), 'SUCCESSOR_STATE_LOCKED')
    receipt = r.read_json(r.private_path(folder / 'reviewed-recovery.json'))
    r.need(r.digest(receipt) == approval and receipt['source_sha'] == APPLIED_SOURCE
           and receipt['original_dir'] == str(original) and receipt['original_files'] == hashes
           and set(receipt['existing_resources']) == recorded, 'ORIGINAL_OR_RECEIPT_CHANGED')
    for name, checksum in receipt['inputs'].items():
        if name != 'terraform.tfstate':
            r.need(r.sha(r.private_path(folder / name).read_bytes()) == checksum, 'RECOVERY_INPUT_CHANGED')
    r.need(r.sha(r.private_path(folder / 'remaining.tfplan').read_bytes()) == receipt['plan_sha256'], 'RECOVERY_PLAN_CHANGED')
    post = r.private_path(folder / 'post-apply.tfplan')
    r.need(r.sha(post.read_bytes()) == plan_hash, 'POST_PLAN_HASH_MISMATCH')
    state_path = r.private_path(folder / 'terraform.tfstate')
    state_bytes = state_path.read_bytes()
    state = json.loads(state_bytes)
    expected = recorded | r.REMAINING
    r.need(len(expected) == 27 and r.state_addresses(state) == expected
           and r.recorded_iap_identity(state) == receipt['recorded_iap_identity']
           and state['lineage'] == receipt['state_lineage'] and state['serial'] >= receipt['state_serial'],
           'SUCCESSOR_STATE_MISMATCH')
    # The saved plan's backend snapshot header binds its refreshed observations
    # to the successor generation; tfstate-prev intentionally has no lineage.
    with ZipFile(post) as archive:
        snapshot = json.loads(archive.read('tfstate'))
    r.need((snapshot['lineage'], snapshot['serial']) == (state['lineage'], state['serial']), 'SUCCESSOR_GENERATION_CHANGED')
    verify_plan(json.loads(r.command(['terraform', 'show', '-json', str(post)], folder, 'POST_PLAN_SHOW')), expected)
    r.need(r.evidence_hashes(original) == hashes and state_path.read_bytes() == state_bytes
           and r.sha(post.read_bytes()) == plan_hash, 'EVIDENCE_CHANGED_DURING_VERIFICATION')
    result = {'status': 'RECOVERED_DISABLED_NOT_ACTIVATED', 'approval': approval, 'verification_source': source,
              'applied_source': APPLIED_SOURCE, 'state_instances': 27, 'successor_state': str(state_path),
              'successor_state_sha256': r.sha(state_bytes), 'original_state_preserved': True,
              'federation_enabled': False, 'live_ai': False, 'live_iap_acceptance': 'REQUIRED_BEFORE_DEV',
              'post_apply_plan': 'NO_CHANGES', 'post_plan_sha256': plan_hash,
              'verified_budget_filter_null_to_empty': list(FILTERS)}
    output = folder / 'completed.json'
    if output.exists():
        r.need(r.read_json(r.private_path(output)) == result, 'EXISTING_COMPLETION_RECEIPT_DIFFERS')
    else:
        r.write_new(output, result)
    return result


def main():
    os.umask(0o077)
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source-sha', required=True)
    p.add_argument('receipt_sha256')
    p.add_argument('post_plan_sha256')
    p.add_argument('--audit-broker', action='store_true')
    args = p.parse_args()
    r.source_identity(args.source_sha)
    original = r.private_path(Path.home() / 'work/jems-nonprod-state', directory=True)
    lock = r.private_path(original / 'partial-recovery/operator.lock')
    with lock.open('rb') as handle:
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        result = verify(original, args.receipt_sha256, args.post_plan_sha256, args.source_sha)
    print(json.dumps({k: result[k] for k in ('status', 'state_instances', 'post_apply_plan', 'federation_enabled')}), flush=True)
    if args.audit_broker:
        # Keep the separate finite IAM report private, including negative observations.
        try:
            run = subprocess.run([sys.executable, str(r.ROOT / 'scripts/ops/audit_request_diagnostics.py')],
                                 capture_output=True, timeout=900, check=False)
            report = json.loads(run.stdout)
        except (OSError, ValueError, subprocess.SubprocessError):
            print(json.dumps({'broker_iam': 'AUDIT_UNAVAILABLE'}))
            return 2
        r.need(report.get('mutations') == 0 and report.get('status') in ('FINITE_POLICY_CHECKS_PASSED', 'NOT_ACCEPTED'),
               'AUDIT_RESPONSE_INVALID')
        folder = r.private_path(Path(os.environ['JEMS_OPERATION_JOURNAL']).parent, directory=True)
        output = folder / ('effective-iam-' + uuid.uuid4().hex + '.json')
        r.write_new(output, report)
        checks = report.get('checks', [])
        print(json.dumps({'broker_iam': report['status'], 'checks': len(checks),
                          'failed_or_unknown': sum(c.get('passed') is not True for c in checks),
                          'private_report': output.name}))
        return run.returncode
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (BadZipFile, OSError, ValueError, KeyError, TypeError, RuntimeError, subprocess.SubprocessError, r.Stop) as error:
        print(json.dumps({'verification_error': str(error) if isinstance(error, r.Stop) else 'PRIVATE_EVIDENCE_OR_AUDIT_UNAVAILABLE'}))
        sys.exit(2)
