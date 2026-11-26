#!/usr/bin/env python3
"""Standard source/connection preflight; --live performs SDK self-check and full read.

Run from the reviewed current-source checkout. Fetch/pin main through the normal
Git client first; this preflight never silently changes branches or dependencies.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys

import diagnose
import diagnose_sdk
import managed_diagnostic_identity as managed

ROOT = Path(__file__).resolve().parents[2]
REQUIRED = ('scripts/ops/diagnose.py', 'scripts/ops/diagnose_sdk.py',
            'scripts/ops/diagnostic_preflight.py', 'scripts/ops/diagnostic-requirements.txt',
            'scripts/ops/managed_diagnostic_identity.py', 'scripts/ops/verify_diagnostic_access.py',
            'scripts/ops/admin_api.py')


def git(*args):
    result = subprocess.run(['git', '-C', str(ROOT), *args], capture_output=True, text=True, timeout=15)
    if result.returncode:
        raise diagnose.DiagnosticError('SOURCE_UNAVAILABLE: Inspect the checkout and refresh current source.')
    return result.stdout.strip()


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--identity-alias', default='GCP')
    p.add_argument('--expected-source', required=True)
    modes = p.add_mutually_exclusive_group()
    modes.add_argument('--live', action='store_true')
    modes.add_argument('--source-only', action='store_true',
                       help='Verify checkout/tool availability without selecting any identity or credential')
    p.add_argument('--verify-permissions', action='store_true')
    args = p.parse_args()
    if args.source_only and args.verify_permissions:
        p.error('--source-only cannot verify cloud permissions')
    result = {'status': 'NOT_READY', 'mutations': 0, 'live_checked': False}
    try:
        sha = git('rev-parse', 'HEAD')
        if sha != args.expected_source or not diagnose.re.fullmatch('[0-9a-f]{40}', args.expected_source):
            raise diagnose.DiagnosticError('SOURCE_MISMATCH: Checkout does not match the reviewed full source SHA.')
        if git('status', '--porcelain', '--untracked-files=all'):
            raise diagnose.DiagnosticError('SOURCE_DIRTY: Use a clean isolated checkout for acceptance.')
        hashes = {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in REQUIRED}
        result.update(source_sha=sha, source_files=hashes)
        if args.source_only:
            result.update(status='SOURCE_VERIFIED_IDENTITY_UNCHECKED', identity_verified=False)
            print(json.dumps(result, indent=2))
            return 0
        env = managed.identity_environment(args.identity_alias)
        diagnose_sdk.credential_info(env['GOOGLE_APPLICATION_CREDENTIALS'])
        result.update(identity_alias=env['JEMS_DIAGNOSTIC_IDENTITY_ALIAS'], status='CONFIGURED_NOT_VERIFIED')
        if args.live:
            result['live_attempted'] = True
            result['self_check'] = diagnose_sdk.report(args.identity_alias, True)
            result['diagnostics'] = diagnose_sdk.report(args.identity_alias, verify_permissions=args.verify_permissions)
            result['live_checked'] = True
            result['status'] = 'READY_METADATA' if result['self_check']['exit_code'] == result['diagnostics']['exit_code'] == 0 else 'NOT_READY'
        code = 0 if result['status'] in ('CONFIGURED_NOT_VERIFIED', 'READY_METADATA') else 2
    except diagnose.DiagnosticError as error:
        result['status'] = 'NOT_READY'
        result['error'] = str(error); code = 2
    except Exception:
        result['status'] = 'NOT_READY'
        result['error'] = 'PREFLIGHT_UNAVAILABLE: Source, SDK or connection could not be verified.'; code = 2
    print(json.dumps(result, indent=2))
    return code


if __name__ == '__main__': sys.exit(main())
