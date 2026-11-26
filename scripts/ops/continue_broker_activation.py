#!/usr/bin/env python3
"""One approved build, bounded read-only qualification, then recovery plans; never apply.

An exclusive durable intent prevents a second submission after interruption.
--build-id resumes reads only, including when submission returned an uncertain result.
"""
import argparse
import fcntl
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time

import bootstrap_request_diagnostics as broker
import cleanup_historical_checkouts as cleanup
import recover_checkout_space as capacity

ROOT = Path(__file__).resolve().parents[2]
LAUNCHER = ROOT / 'scripts/ops/handoffs/operations-bootstrap.sh'
UUID = r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}'
# Only codes defined by the reviewed publisher may cross the child-process boundary.
PUBLIC_BUILD_CODES = frozenset(broker.publication.predicates({}, '0' * 40, '0' * 64)) | frozenset({
    'SOURCE_SHA_INVALID', 'SOURCE_HEAD_MISMATCH', 'SOURCE_CHECKOUT_DIRTY',
    'BUILD_RESPONSE_SHAPE_INVALID', 'BUILD_ID_INVALID', 'BUILD_METADATA_READ_FAILED',
    'BUILD_RESOURCE_IDENTITY_MISMATCH', 'REGISTRY_METADATA_READ_FAILED', 'REGISTRY_DIGEST_MISMATCH',
    'BUILD_SOURCE_REQUIRES_EXISTING_BUILD', 'DIAGNOSTIC_REQUIRES_EXISTING_BUILD',
    'BUILD_PLAN_APPROVAL_MISMATCH', 'BUILD_SUBMISSION_UNCERTAIN_NO_RETRY',
    'BUILD_TOOL_UNAVAILABLE_OR_UNCERTAIN', 'SOURCE_INSPECTION_REQUIRES_DIAGNOSTIC',
    'SOURCE_INSPECTION_PREREQUISITES_FAILED'})


class Stop(RuntimeError):
    pass


def require(ok, code):
    if not ok: raise Stop(code)


def invoke(source, lane, args, home):
    try:
        result = subprocess.run(['bash', str(LAUNCHER), source, lane, *args], cwd=home,
            capture_output=True, text=True, timeout=1200)
        require(len(result.stdout) <= 4_000_000 and len(result.stderr) <= 4_000_000,
                'CHILD_OPERATION_FAILED_OR_UNCERTAIN')
        if result.returncode:
            for line in (result.stdout + '\n' + result.stderr).splitlines()[-64:]:
                try: failure = json.loads(line)
                except ValueError: continue
                if (lane == 'broker-build' and isinstance(failure, dict) and
                    set(failure) == {'status', 'code', 'resubmit'} and failure['status'] == 'STOPPED' and
                    failure['resubmit'] is False and isinstance(failure['code'], str) and
                    failure['code'] in PUBLIC_BUILD_CODES):
                    raise Stop(failure['code'])
            raise Stop('CHILD_OPERATION_FAILED_OR_UNCERTAIN')
        value = json.loads(result.stdout)
        require(isinstance(value, dict), 'CHILD_RESPONSE_INVALID')
        return value
    except (OSError, subprocess.TimeoutExpired, ValueError):
        raise Stop('CHILD_OPERATION_FAILED_OR_UNCERTAIN') from None


def build_status(build_id):
    try:
        result = subprocess.run(['gcloud', 'builds', 'describe', build_id, '--project=' + broker.PROJECT,
            '--region=' + broker.REGION, '--format=value(status)', '--quiet'], capture_output=True, text=True, timeout=30)
        value = result.stdout.strip()
        require(result.returncode == 0 and value in {'QUEUED', 'PENDING', 'WORKING', 'SUCCESS',
            'FAILURE', 'INTERNAL_ERROR', 'TIMEOUT', 'CANCELLED', 'EXPIRED'}, 'BUILD_STATUS_UNAVAILABLE')
        return value
    except (OSError, subprocess.TimeoutExpired):
        raise Stop('BUILD_STATUS_UNAVAILABLE') from None


def append(path, record, mode='a'):
    path = cleanup.safe_path(path)
    with path.open(mode) as handle:
        require(os.fstat(handle.fileno()).st_nlink == 1, 'RECOVERY_RECORD_LINKED')
        cleanup.durable(handle, record)
    capacity.sync_dir(path.parent)


def continuation(tool_source, build_source, approval, home, folder, build_id=None,
                 call=invoke, status=build_status, now=time.monotonic, sleep=time.sleep):
    report = {'status': 'NOT_ACTIVATED', 'build_source_sha': build_source,
              'build_submission_attempted': False, 'deployment': False, 'iam_changes': False,
              'deletions': 0, 'archive_uploads': 0, 'resubmit': False}
    qualified = None
    journal = folder / ('build-intent-' + build_source + '.jsonl')
    try:
        if build_id:
            require(bool(re.fullmatch(UUID, build_id)), 'BUILD_ID_INVALID')
        else:
            require(bool(approval and re.fullmatch('[a-f0-9]{64}', approval)), 'EXACT_BUILD_APPROVAL_REQUIRED')
            if journal.exists():
                cleanup.safe_path(journal)
                require(journal.stat().st_size <= 4096, 'EXISTING_INTENT_INVALID_NO_RESUBMISSION')
                rows = [json.loads(line) for line in journal.read_text().splitlines()]
                require(len(rows) == 2 and rows[0] == {'event': 'SUBMISSION_INTENT',
                    'source_sha': build_source, 'plan_sha256': approval} and
                    rows[1].get('event') == 'BUILD_SUBMITTED' and rows[1].get('source_sha') == build_source and
                    bool(re.fullmatch(UUID, rows[1].get('build_id', ''))),
                    'SUBMISSION_ALREADY_ATTEMPTED_RESUME_BY_BUILD_ID_ONLY')
                build_id = rows[1]['build_id']
                report['resumed_recorded_build'] = True
        if not build_id:
            report['stage'] = 'BUILD_PREREQUISITES'
            plan = call(build_source, 'broker-build', ['--check'], home)
            require(plan.get('inventory') == 'CHECKED' and plan.get('approve_plan_sha256') == approval and
                    plan.get('plan', {}).get('source_sha') == build_source, 'BUILD_PLAN_APPROVAL_MISMATCH')
            append(journal, {'event': 'SUBMISSION_INTENT', 'source_sha': build_source, 'plan_sha256': approval}, 'x')
            report['build_submission_attempted'] = True
            report['stage'] = 'BUILD_SUBMISSION'
            result = call(build_source, 'broker-build', ['--submit', '--approve-plan-sha256', approval], home)
            require(result.get('status') == 'SUBMITTED_NOT_VERIFIED' and result.get('source_sha') == build_source and
                    bool(re.fullmatch(UUID, result.get('build_id', ''))), 'SUBMISSION_UNCERTAIN_NO_RETRY')
            build_id = result['build_id']
            append(journal, {'event': 'BUILD_SUBMITTED', 'source_sha': build_source, 'build_id': build_id})
        report['build_id'] = build_id
        deadline = now() + 900
        report['stage'] = 'BUILD_STATUS'
        while True:
            value = status(build_id)
            report['build_status'] = value
            if value == 'SUCCESS': break
            if value not in ('QUEUED', 'PENDING', 'WORKING'):
                report.update(status='BUILD_NOT_SUCCESS', build_status=value); break
            if now() >= deadline:
                report.update(status='BUILD_PENDING_RESUME_BY_BUILD_ID', build_status=value); break
            sleep(20)
        if value == 'SUCCESS':
            report['stage'] = 'BUILD_QUALIFICATION'
            receipt = call(tool_source, 'broker-build', ['--build-id', build_id,
                           '--build-source-sha', build_source], home)
            require(receipt.get('status') == 'BUILD_VERIFIED_NOT_DEPLOYED' and
                    receipt.get('source_sha') == build_source and receipt.get('build_id') == build_id,
                    'QUALIFICATION_RECEIPT_MISMATCH')
            broker.config(receipt.get('image'))  # Exact repository and immutable digest only.
            qualified = receipt
            report.update(status='BUILD_VERIFIED_NOT_ACTIVATED', qualification=receipt)
            append(folder / ('build-qualified-' + build_id + '.jsonl'), {'event': 'BUILD_VERIFIED', **receipt})
    except Exception as error:
        report.update(status='STOPPED_NO_RESUBMISSION', code=str(error) if isinstance(error, Stop) else 'CONTINUATION_UNAVAILABLE')
    # Independent source/capacity dry runs and saved-plan integrity proceed even
    # when build qualification stops. This child cannot apply or delete anything.
    args = ['--home-dir', str(home), '--receipt-dir', str(folder)]
    if qualified:
        args += ['--broker-image', qualified['image'], '--broker-build-id', build_id,
                 '--broker-build-source-sha', build_source]
    else: args += ['--skip-broker-inventory']
    try: report['recovery'] = call(tool_source, 'recovery', args, home)
    except Exception: report['recovery'] = {'status': 'READ_ONLY_RECOVERY_UNAVAILABLE'}
    return report


def main(argv=None):
    os.umask(0o077)
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source-sha', required=True); p.add_argument('--build-source-sha', required=True)
    p.add_argument('--home-dir', type=Path, required=True); p.add_argument('--receipt-dir', type=Path, required=True)
    modes = p.add_mutually_exclusive_group(required=True)
    modes.add_argument('--approve-plan-sha256'); modes.add_argument('--build-id')
    a = p.parse_args(argv)
    broker.source(a.source_sha)
    require(bool(re.fullmatch('[a-f0-9]{40}', a.build_source_sha)), 'BUILD_SOURCE_INVALID')
    home = cleanup.safe_path(a.home_dir); folder = cleanup.private_dir(a.receipt_dir, home)
    with (folder / 'broker-continuation.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        print(json.dumps(continuation(a.source_sha, a.build_source_sha, a.approve_plan_sha256,
                                    home, folder, a.build_id), indent=2))


if __name__ == '__main__':
    try: main()
    except Exception: print(json.dumps({'status': 'CONTINUATION_PREFLIGHT_STOPPED', 'resubmit': False})); sys.exit(2)
