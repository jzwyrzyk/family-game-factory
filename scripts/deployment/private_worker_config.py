#!/usr/bin/env python3
"""Offline, no-cloud private worker config migration. Never activates generation."""
import argparse
import json
import os
from pathlib import Path

SOURCE_SHA = 'dcb887e6a51ba000fda1ccc42b9d198f8b9895f9'
PRIVATE_REPO = 'family-game-factory-lab/family-game-factory-worker'
PRIVATE_ID = '1458899834'
WORKFLOW = 'factory-private.yml'

def make_config(old, approved):
    if old.get('active') is not False or old.get('approval', {}).get('enabled') is not False:
        raise ValueError('Refuse active/paid gateway config; first use owner-controlled emergency stop')
    if old.get('approvedSha') != SOURCE_SHA or old.get('repository') != 'jzwyrzyk/family-game-factory':
        raise ValueError('Source worker SHA or repository drift')
    if len(approved) != 40 or any(c not in '0123456789abcdef' for c in approved):
        raise ValueError('A reviewed 40-hex private commit SHA is mandatory')
    output = dict(old)
    output.update(workerRepository=PRIVATE_REPO, workerRepositoryId=PRIVATE_ID,
                  workerWorkflow=WORKFLOW, workerApprovedSha=approved)
    output['active'] = False
    output['approval'] = dict(old['approval'], enabled=False)
    return output

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--input', required=True, help='existing PRIVATE JSON config; never commit')
    p.add_argument('--output', required=True, help='new PRIVATE JSON config; never commit')
    p.add_argument('--reviewed-private-sha', required=True)
    args = p.parse_args()
    src, dst = Path(args.input).resolve(), Path(args.output).resolve()
    if src == dst or dst.exists():
        p.error('Refusing overwrite or in-place mutation')
    if not src.is_file():
        p.error('Private input not found')
    data = make_config(json.loads(src.read_text('utf-8')),args.reviewed_private_sha)
    fd = os.open(dst,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    try:
        with os.fdopen(fd,'w',encoding='utf-8') as out:
            json.dump(data,out,indent=2)
            out.write('\n')
    except Exception:
        dst.unlink(missing_ok=True)
        raise
    print('Wrote inactive private config with pinned worker SHA; no cloud or GitHub operation performed.')

if __name__ == '__main__':
    main()
