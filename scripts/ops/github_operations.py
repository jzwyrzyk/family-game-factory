#!/usr/bin/env python3
"""Bounded GitHub operations setup, single diagnostic dispatch and artifact triage.

Uses the existing gh connection. Never creates credentials or changes repository
OIDC, release environments, schedules or main. Actions:write is repository-wide:
this client allowlist is a guard, not a GitHub per-workflow permission boundary.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import io
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import zipfile

from admin_api import Plan, SetupError, require
import request_evidence as evidence
from triage_request_evidence import triage

REPO = 'jzwyrzyk/family-game-factory'
PREFIX = 'repos/' + REPO + '/'
WORKFLOW = 'jems-production-diagnostics.yml'
ENVIRONMENTS = ('jems-production-diagnostics', 'jems-nonproduction', 'jems-nonproduction-uat')
POLICY = {'protected_branches': False, 'custom_branch_policies': True}
ACCEPTANCE_STEPS = (
    'Validate diagnostic scope',
    'Verify current main before requesting a Google credential',
    'Obtain an ID token for the private diagnostics broker',
    'Read sanitized request evidence',
    'Retain the sanitized report',
)


def api(method, path, data=None, binary=False):
    require(path == PREFIX[:-1] or path.startswith(PREFIX), 'Repository-scoped API required')
    args = ['gh', 'api', '--method', method, path]
    payload = None
    if data is not None:
        args += ['--input', '-']
        payload = json.dumps(data).encode()
    with tempfile.TemporaryFile() as out:
        result = subprocess.run(args, input=payload, stdout=out, stderr=subprocess.DEVNULL, timeout=90)
        require(result.returncode == 0, 'GitHub operation failed or uncertain; do not retry a dispatch automatically')
        require(out.tell() <= 2 * 1024 * 1024, 'GitHub response too large')
        out.seek(0); content = out.read()
    return content if binary else json.loads(content or b'null')


def inventory(reader=api):
    repo = reader('GET', PREFIX[:-1])
    require(str(repo.get('id')) == '1458033181' and str(repo.get('owner', {}).get('id')) == '356692244', 'Repository identity differs')
    main = reader('GET', PREFIX + 'branches/main')
    require(main.get('protected') is True and re.fullmatch('[a-f0-9]{40}', main.get('commit', {}).get('sha', '')), 'Protected main required')
    listed = reader('GET', PREFIX + 'environments?per_page=100')
    require(listed.get('total_count', 101) <= 100, 'Environment inventory pagination required')
    found = {v['name']: v for v in listed['environments']}
    entries = {}
    for name in ENVIRONMENTS:
        item = found.get(name)
        if item is None:
            entries[name] = None; continue
        rules = item.get('protection_rules', [])
        require(all(r.get('type') == 'branch_policy' for r in rules), 'Unexpected environment protection; preserve and review')
        policy = item.get('deployment_branch_policy')
        require(policy is None or policy == POLICY, 'Conflicting environment branch policy')
        branches = []
        if policy:
            response = reader('GET', PREFIX + 'environments/' + name + '/deployment-branch-policies?per_page=100')
            require(response.get('total_count', 101) <= 1, 'Unexpected deployment branches')
            branches = [{'name': b['name'], 'type': b['type']} for b in response['branch_policies']]
            require(branches in ([], [{'name': 'main', 'type': 'branch'}]), 'Only exact main allowed')
        entries[name] = {'policy': policy, 'branches': branches}
    return {'main_sha': main['commit']['sha'], 'environments': entries}


def plan_for(observed, writer=api):
    plan = Plan('github-operations', observed)
    for name, item in observed['environments'].items():
        path = PREFIX + 'environments/' + name
        if item is None or item['policy'] is None:
            change = {'deployment_branch_policy': POLICY}
            plan.add('Restrict ' + name, {'method': 'PUT', 'path': path, 'body': change},
                     lambda path=path, change=change: writer('PUT', path, change))
        if item is None or not item['branches']:
            path += '/deployment-branch-policies'
            change = {'name': 'main', 'type': 'branch'}
            plan.add('Allow main only in ' + name, {'method': 'POST', 'path': path, 'body': change},
                     lambda path=path, change=change: writer('POST', path, change))
    return plan


def validate_inputs(inputs):
    require(isinstance(inputs, dict) and set(inputs) == set(evidence.INPUT_KEYS), 'Exact diagnostic input schema required')
    service, revision = inputs['service'], inputs['revision']
    require(service in evidence.ROUTES and (revision == '' or evidence.allowed_selector(service, revision)), 'Invalid service/revision')
    start, end = evidence.utc(inputs['start_utc']), evidence.utc(inputs['end_utc'])
    require(0 < (end - start).total_seconds() <= 3600 and end <= datetime.now(timezone.utc), 'Invalid settled interval')
    return {**inputs, 'revision': revision or None}


def retrieve(run_id, expected_sha, inputs, reader=api, downloaded_zip=None):
    require(re.fullmatch('[1-9][0-9]{0,19}', run_id), 'Run ID required')
    scope = validate_inputs(inputs)
    run = reader('GET', PREFIX + 'actions/runs/' + run_id)
    require(str(run.get('id')) == run_id and run.get('head_sha') == expected_sha and
            run.get('head_branch') == 'main' and run.get('event') == 'workflow_dispatch' and
            run.get('path') == '.github/workflows/' + WORKFLOW and run.get('status') == 'completed' and
            str(run.get('repository', {}).get('id')) == '1458033181' and
            str(run.get('head_repository', {}).get('id')) == '1458033181', 'Run provenance differs or incomplete')
    attempt = str(run['run_attempt'])
    name = f'jems-request-evidence-{run_id}-{attempt}'
    listed = reader('GET', PREFIX + 'actions/runs/' + run_id + '/artifacts?per_page=100')
    require(listed.get('total_count', 101) <= 100, 'Artifact inventory incomplete')
    artifacts = [a for a in listed['artifacts'] if a.get('name') == name]
    require(len(artifacts) == 1, 'Unique attempt-bound evidence required')
    artifact = artifacts[0]
    require(not artifact.get('expired') and 0 < artifact.get('size_in_bytes', 0) <= 2 * 1024 * 1024 and
            re.fullmatch('sha256:[a-f0-9]{64}', artifact.get('digest', '')), 'Artifact expired, oversized or without digest')
    raw = downloaded_zip if downloaded_zip is not None else reader(
        'GET', PREFIX + 'actions/artifacts/' + str(int(artifact['id'])) + '/zip', binary=True)
    require(len(raw) <= 2 * 1024 * 1024, 'Artifact too large')
    require('sha256:' + hashlib.sha256(raw).hexdigest() == artifact['digest'], 'Artifact digest differs')
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        files = archive.infolist()
        require(len(files) == 1 and files[0].filename == 'report.json' and not files[0].is_dir() and
                files[0].file_size <= evidence.MAX_BYTES and (files[0].external_attr >> 16) & 0o170000 != 0o120000,
                'Artifact archive layout unsafe')
        report = json.loads(archive.read(files[0]), object_pairs_hook=evidence.unique_keys)
    require(report.get('workflow') == {'run_id': run_id, 'attempt': attempt, 'workflow_source_sha': expected_sha}
            and report.get('scope') == scope, 'Report source/run/scope differs')
    classified = triage(report)
    # Inspect this exact attempt, never the mutable latest-attempt jobs endpoint.
    jobs = reader('GET', PREFIX + 'actions/runs/' + run_id + '/attempts/' + attempt + '/jobs?per_page=100')
    require(isinstance(jobs, dict) and jobs.get('total_count') == 1 and
            isinstance(jobs.get('jobs'), list) and len(jobs['jobs']) == 1,
            'Unique diagnostic job required')
    job = jobs['jobs'][0]
    require(job.get('name') == 'evidence' and job.get('status') == 'completed' and
            str(job.get('run_id')) == run_id and job.get('head_sha') == expected_sha,
            'Diagnostic job provenance differs or incomplete')
    steps = job.get('steps', [])
    required = {name: [s for s in steps if s.get('name') == name] for name in ACCEPTANCE_STEPS}
    successful_steps = all(len(matches) == 1 and matches[0].get('status') == 'completed' and
                           matches[0].get('conclusion') == 'success' for matches in required.values())
    job_verified = job.get('conclusion') == 'success' and successful_steps
    return {'run_id': run_id, 'source_sha': expected_sha, 'artifact_sha256': artifact['digest'],
            'workflow_conclusion': run.get('conclusion'), 'triage': classified,
            'job_verified': job_verified,
            'live_acceptance': run.get('conclusion') == 'success' and job_verified and classified['status'] == 'COMPLETE'}


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    modes = p.add_mutually_exclusive_group(required=True)
    modes.add_argument('--check', action='store_true')
    modes.add_argument('--apply', action='store_true')
    modes.add_argument('--dispatch', action='store_true')
    modes.add_argument('--run-id')
    p.add_argument('--approve-plan-sha256')
    p.add_argument('--expected-main')
    p.add_argument('--inputs', type=Path)
    p.add_argument('--dispatch-receipt', type=Path)
    p.add_argument('--artifact-zip', type=Path, help='Supported connector download fallback; digest and provenance still mandatory')
    a = p.parse_args(argv)
    if a.check or a.apply:
        plan = plan_for(inventory())
        if a.apply:
            plan.execute(a.approve_plan_sha256)
            require(not plan_for(inventory()).actions, 'Partial GitHub configuration; inspect before retry')
            print('GitHub environments restricted; OIDC and schedules unchanged.')
        else: print(json.dumps({'plan': plan.describe(), 'approve_plan_sha256': plan.review_code()}, indent=2))
        return
    require(re.fullmatch('[a-f0-9]{40}', a.expected_main or ''), 'Expected full source SHA required')
    inputs = json.loads(a.inputs.read_bytes(), object_pairs_hook=evidence.unique_keys)
    validate_inputs(inputs)
    if a.run_id:
        downloaded = None
        if a.artifact_zip:
            require(a.artifact_zip.stat().st_size <= 2 * 1024 * 1024, 'Artifact too large')
            downloaded = a.artifact_zip.read_bytes()
        print(json.dumps(retrieve(a.run_id, a.expected_main, inputs, downloaded_zip=downloaded), indent=2)); return
    observed = inventory()
    require(observed['main_sha'] == a.expected_main, 'Main advanced; review source before dispatch')
    require(observed['environments']['jems-production-diagnostics'] ==
            {'policy': POLICY, 'branches': [{'name': 'main', 'type': 'branch'}]}, 'Diagnostic environment must restrict exact main')
    workflow = api('GET', PREFIX + 'actions/workflows/' + WORKFLOW)
    require(workflow.get('path') == '.github/workflows/' + WORKFLOW and workflow.get('state') == 'active', 'Workflow unavailable')
    require(a.dispatch_receipt, 'Durable --dispatch-receipt required')
    # Create before submitting. A timeout/lost response cannot trigger an implicit repeat.
    with a.dispatch_receipt.open('x') as handle:
        json.dump({'source_sha': a.expected_main, 'inputs': inputs,
                   'requested_at_utc': datetime.now(timezone.utc).isoformat(), 'status': 'SUBMISSION_STARTED'}, handle)
    api('POST', PREFIX + 'actions/workflows/' + WORKFLOW + '/dispatches', {'ref': 'main', 'inputs': inputs})
    print('Dispatch accepted; retrieve the matching run ID and verify its artifact. This is not live acceptance.')


if __name__ == '__main__':
    try: main()
    except Exception:
        print('GitHub operations stopped; raw response suppressed. Never retry an uncertain dispatch automatically.', file=sys.stderr)
        sys.exit(2)
