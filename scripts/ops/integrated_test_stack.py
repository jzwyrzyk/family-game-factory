#!/usr/bin/env python3
"""Plan and apply the integrated TEST root in its own private, durable directory."""
import argparse
import fcntl
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import secrets
import sys
import time
import uuid

from recover_nonproduction import Stop, command, digest, need, private_path, read_json, sha, write_new

SOURCE = Path(__file__).resolve().parents[2]
TF_ROOT = 'infra/nonproduction/family-beta/terraform'
PROJECT = 'jems-jzw-nonprod'
STAGES = ('off', 'foundation', 'services', 'edge')
SAFE_TF_ENV = {'TF_VAR_iap_oauth_secret', 'TF_IN_AUTOMATION', 'TF_INPUT', 'TF_PLUGIN_CACHE_DIR'}


def tracked(revision):
    need(re.fullmatch('[0-9a-f]{40}', revision or ''), 'REVIEWED_SOURCE_REQUIRED')
    need(command(['git', 'rev-parse', 'HEAD'], SOURCE).decode().strip() == revision, 'SOURCE_MISMATCH')
    for path in ('scripts/ops/integrated_test_stack.py', 'scripts/ops/recover_nonproduction.py',
                 'scripts/ops/setup_nonproduction.py', 'scripts/ops/admin_api.py'):
        need((SOURCE / path).read_bytes() == command(['git', 'show', revision + ':' + path], SOURCE),
             'OPERATOR_SOURCE_CHANGED')
    names = command(['git', 'ls-tree', '--name-only', revision + ':' + TF_ROOT], SOURCE).decode().splitlines()
    selected = [name for name in names if name.endswith('.tf') or name == '.terraform.lock.hcl']
    need('.terraform.lock.hcl' in selected and any(n.endswith('.tf') for n in selected), 'LOCKED_TEST_ROOT_REQUIRED')
    return {name: command(['git', 'show', revision + ':' + TF_ROOT + '/' + name], SOURCE) for name in selected}


def environment():
    need(not any((k.startswith('TF_') and k not in SAFE_TF_ENV) or
                 k.startswith(('GOOGLE_ENDPOINT', 'CLOUDSDK_API_ENDPOINT_OVERRIDES_', 'GOOGLE_IMPERSONATE_')) or
                 k in {'GOOGLE_OAUTH_ACCESS_TOKEN', 'GOOGLE_CREDENTIALS', 'GOOGLE_APPLICATION_CREDENTIALS'}
                 for k in os.environ), 'UNREVIEWED_ENVIRONMENT_OVERRIDE')
    version = json.loads(command(['terraform', 'version', '-json']))
    need(version['terraform_version'] == '1.13.5', 'TERRAFORM_VERSION_MISMATCH')
    need(command(['gcloud', 'auth', 'list', '--filter=status:ACTIVE', '--format=value(account)']).strip(),
         'ADMIN_ACCOUNT_REQUIRED')
    command(['gcloud', 'auth', 'application-default', 'print-access-token', '--quiet'], phase='ADC_AUTH')
    return os.environ.get('TF_VAR_iap_oauth_secret', '')


def initialize(home, source, files):
    # Require creation of a new directory so another root's state can never be adopted.
    need(not any(p.is_symlink() for p in (home, *home.parents)), 'UNSAFE_SYMLINK')
    need(not any((p / 'terraform.tfstate').exists() or (p / 'apply-started').exists()
                 or p.name == 'jems-nonprod-state' for p in home.parents), 'EXISTING_STATE_BOUNDARY')
    if not home.exists():
        home.mkdir(mode=0o700)
        (home / 'root').mkdir(mode=0o700)
        (home / 'attempts').mkdir(mode=0o700)
        write_new(home / 'key', secrets.token_bytes(32))
        write_new(home / 'lock', b'')
        write_new(home / 'owner.json', {'root': TF_ROOT, 'source': source, 'project': PROJECT})
        for name, content in files.items():
            write_new(home / 'root' / name, content)
    private_path(home, directory=True)
    with private_path(home / 'lock').open('r+') as lock:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        tf = validate_root(home, source, files)
        if not (home / 'initialized.json').exists():
            need(state_hash(tf) is None and not any((home / 'attempts').iterdir()),
                 'EXISTING_STATE_BOUNDARY')
            command(['terraform', 'init', '-input=false', '-lockfile=readonly'], tf, 'TERRAFORM_INIT', home)
            write_new(home / 'initialized.json', {'source': source})
        need(read_json(private_path(home / 'initialized.json')) == {'source': source}, 'STACK_IDENTITY_CHANGED')
    return {'status': 'INITIALIZED', 'privateState': str(tf / 'terraform.tfstate')}


def validate_root(home, source, files):
    need(read_json(private_path(home / 'owner.json')) ==
         {'root': TF_ROOT, 'source': source, 'project': PROJECT}, 'STACK_IDENTITY_CHANGED')
    tf = private_path(home / 'root', directory=True)
    for name, content in files.items():
        need(private_path(tf / name).read_bytes() == content, 'TERRAFORM_SOURCE_CHANGED')
    for f in tf.iterdir():
        need(f.name in {*files, '.terraform', 'terraform.tfstate', 'terraform.tfstate.backup'},
             'UNEXPECTED_TERRAFORM_INPUT')
    return tf


def state_hash(tf):
    state = tf / 'terraform.tfstate'
    return sha(private_path(state).read_bytes()) if state.exists() else None


TRIAL_GRANTS = {
    'google_secret_manager_secret_iam_member.funded_coach_key[0]':
        ('roles/secretmanager.secretAccessor', 'coach'),
    'google_cloud_run_v2_service_iam_member.funded_household_coach[0]':
        ('roles/run.invoker', 'household')
}


def review(plan, closing=False):
    need(plan.get('errored') is not True and plan.get('complete', True) is True
         and not plan.get('resource_drift') and not plan.get('deferred_changes'), 'DRIFT_OR_INCOMPLETE_PLAN')
    need(all(c.get('status') in {'pass', 'unknown'} for c in plan.get('checks', [])), 'FAILED_PLAN_CHECK')
    rows = []
    for resource in plan.get('resource_changes', []):
        actions = resource['change']['actions']
        mode = resource['mode']
        need(not resource.get('previous_address') and not resource['change'].get('importing'),
             'UNEXPECTED_STATE_TRANSFER')
        revoke = False
        if closing and mode == 'managed' and actions == ['delete'] and resource['address'] in TRIAL_GRANTS:
            role, service = TRIAL_GRANTS[resource['address']]
            old = resource['change']['before']
            revoke = (old.get('role') == role and old.get('member') ==
                      'serviceAccount:jems-test-' + service + '@' + PROJECT + '.iam.gserviceaccount.com'
                      and old.get('project') == PROJECT and
                      (old.get('name') == 'jems-test-coach' if service == 'household'
                       else old.get('secret_id') == 'jems-test-coach-key'))
        need(revoke or (mode == 'managed' and actions in (['no-op'], ['create'], ['update']))
             or (mode == 'data' and actions in (['no-op'], ['read'])), 'DESTRUCTIVE_OR_UNKNOWN_ACTION')
        for value in ('before', 'after'):
            obj = resource['change'].get(value) or {}
            if obj.get('project'):
                need(obj['project'] == PROJECT, 'CROSS_PROJECT_RESOURCE')
        if actions != ['no-op']:
            rows.append({'address': resource['address'], 'actions': actions})
    return rows


def tf_plan(tf, attempt, variables, name, closing=False):
    binary = attempt / (name + '.tfplan')
    command(['terraform', 'plan', '-input=false', '-lock-timeout=30s', '-parallelism=1',
             '-var-file=' + str(variables), '-out=' + str(binary)], tf, 'TERRAFORM_PLAN', attempt)
    data = command(['terraform', 'show', '-json', str(binary)], tf, 'TERRAFORM_SHOW', attempt)
    write_new(attempt / (name + '.json'), data)
    return review(json.loads(data), closing), binary


def unresolved(home):
    return sorted(x.parent.name for x in (home / 'attempts').glob('*/started.json')
                  if not (x.parent / 'completed.json').exists() and not (x.parent / 'reconciled.json').exists())


def history_hash(home):
    events = {str(f.relative_to(home)): sha(private_path(f).read_bytes())
              for f in (home / 'attempts').glob('*/*.json')
              if f.name in {'started.json', 'completed.json', 'reconciled.json'}}
    return digest(events)


def prepare(home, tf, source, args, secret):
    variables = read_json(private_path(args.variables))
    need(isinstance(variables, dict) and variables.get('stage') in STAGES[1:] and
         'iap_oauth_secret' not in variables and len(secret) >= 12, 'PRIVATE_STAGE_INPUTS_REQUIRED')
    need(not unresolved(home), 'UNCERTAIN_PRIOR_ATTEMPT')
    attempt = home / 'attempts' / uuid.uuid4().hex
    attempt.mkdir(mode=0o700)
    write_new(attempt / 'inputs.tfvars.json', variables)
    state = state_hash(tf)
    previous = None
    if state:
        for path in (home / 'attempts').glob('*/completed.json'):
            if read_json(private_path(path)).get('successorStateSha256') == state:
                previous = read_json(private_path(path.parent / 'inputs.tfvars.json'))
                break
    uncertain = any((home / 'attempts').glob('*/reconciled.json'))
    if previous is None and not uncertain:
        need(variables['stage'] == 'foundation' and not variables.get('enable_worker_federation')
             and not variables.get('funded_trial'), 'CLOSED_FOUNDATION_FIRST')
    if previous:
        need(STAGES.index(variables['stage']) <= STAGES.index(previous['stage']) + 1, 'STAGE_SKIPPED')
    closing = getattr(args, 'close_funded_trial', False)
    need(not closing or previous and previous.get('funded_trial') and not variables.get('funded_trial'),
         'NO_MATCHING_FUNDED_TRIAL')
    if state:
        write_new(attempt / 'before.tfstate', (tf / 'terraform.tfstate').read_bytes())
    rows, binary = tf_plan(tf, attempt, attempt / 'inputs.tfvars.json', 'review', closing)
    need(state_hash(tf) == state, 'STATE_CHANGED_DURING_PLAN')
    record = {'source': source, 'attempt': attempt.name, 'root': TF_ROOT, 'project': PROJECT,
              'reviewedAt': int(time.time()), 'stage': variables['stage'], 'closeFundedTrial': closing, 'workerFederation': variables.get('enable_worker_federation', False),
              'changes': rows, 'historySha256': history_hash(home), 'beforeStateSha256': state, 'planSha256': sha(binary.read_bytes()),
              'inputsSha256': sha((attempt / 'inputs.tfvars.json').read_bytes()),
              'reviewSha256': sha((attempt / 'review.json').read_bytes()),
              'ephemeralBinding': hmac.new(private_path(home / 'key').read_bytes(), secret.encode(), hashlib.sha256).hexdigest()}
    write_new(attempt / 'receipt.json', record)
    return {'status': 'PLANNED', 'attempt': attempt.name, 'approveSha256': digest(record),
            'changedResources': rows, 'privatePlan': str(attempt / 'review.json')}


def apply(home, tf, source, args, secret):
    need(re.fullmatch('[a-f0-9]{32}', args.attempt), 'INVALID_ATTEMPT')
    attempt = private_path(home / 'attempts' / args.attempt, directory=True)
    r = read_json(private_path(attempt / 'receipt.json'))
    need(not unresolved(home) and not (attempt / 'started.json').exists(), 'ATTEMPT_ALREADY_USED_OR_UNCERTAIN')
    need(r['source'] == source and r['attempt'] == args.attempt and digest(r) == args.approve_sha256,
         'APPROVAL_MISMATCH')
    for name, field in [('inputs.tfvars.json','inputsSha256'), ('review.tfplan','planSha256'), ('review.json','reviewSha256')]:
        need(sha(private_path(attempt / name).read_bytes()) == r[field], 'REVIEWED_FILE_CHANGED')
    need(r['ephemeralBinding'] == hmac.new(private_path(home / 'key').read_bytes(), secret.encode(), hashlib.sha256).hexdigest(),
         'EPHEMERAL_INPUT_CHANGED')
    need(state_hash(tf) == r['beforeStateSha256'] and history_hash(home) == r['historySha256'], 'STATE_ADVANCED')
    need(0 <= time.time() - r['reviewedAt'] <= 3600, 'PLAN_APPROVAL_EXPIRED')
    # A saved plan alone does not detect out-of-band changes to IAM or traffic.
    # Compare a fresh read with the complete effects and starting state approved.
    fresh_dir = attempt / ('preapply-' + uuid.uuid4().hex)
    fresh_dir.mkdir(mode=0o700)
    tf_plan(tf, fresh_dir, attempt / 'inputs.tfvars.json', 'fresh', r['closeFundedTrial'])
    old_plan = read_json(private_path(attempt / 'review.json'))
    fresh_plan = read_json(private_path(fresh_dir / 'fresh.json'))
    fields = ('resource_changes', 'resource_drift', 'output_changes', 'checks', 'prior_state',
              'deferred_changes', 'planned_values', 'proposed_unknown', 'applyable', 'complete')
    need(all(old_plan.get(k) == fresh_plan.get(k) for k in fields) and
         r['beforeStateSha256'] == state_hash(tf), 'LIVE_PLAN_NO_LONGER_MATCHES')
    write_new(attempt / 'started.json', {'approval': digest(r)})
    command(['terraform', 'apply', '-input=false', '-lock-timeout=30s', '-parallelism=1',
             str(attempt / 'review.tfplan')], tf, 'TERRAFORM_APPLY', attempt)
    rows, _ = tf_plan(tf, attempt, attempt / 'inputs.tfvars.json', 'readback')
    readback = read_json(attempt / 'readback.json')
    need(not rows and all(c.get('actions') == ['no-op'] for c in readback.get('output_changes', {}).values())
         and all(c.get('status') == 'pass' for c in readback.get('checks', [])), 'POST_APPLY_DRIFT')
    need(state_hash(tf), 'POST_APPLY_STATE_MISSING')
    outputs = command(['terraform', 'output', '-json'], tf, 'TERRAFORM_OUTPUT', attempt)
    write_new(attempt / 'outputs.json', outputs)
    write_new(attempt / 'completed.json', {'approval': digest(r), 'successorStateSha256': state_hash(tf)})
    return {'status': 'APPLIED_READBACK_CLEAN', 'outputs': str(attempt / 'outputs.json')}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True)
    parser.add_argument('--state-dir', type=Path, required=True)
    modes = parser.add_subparsers(dest='mode', required=True)
    modes.add_parser('initialize')
    plan = modes.add_parser('plan')
    plan.add_argument('--variables', type=Path, required=True)
    plan.add_argument('--close-funded-trial', action='store_true', help='Allow removal of the two temporary trial IAM grants only')
    approved = modes.add_parser('apply')
    approved.add_argument('--attempt', required=True)
    approved.add_argument('--approve-sha256', required=True)
    reconcile = modes.add_parser('record-reconciliation')
    reconcile.add_argument('--attempt', required=True)
    reconcile.add_argument('--private-inventory', type=Path, required=True,
                           help='Administrator-signed-off resource inventory after an uncertain attempt')
    args = parser.parse_args()
    os.umask(0o077)
    home = args.state_dir.expanduser().absolute()
    try:
        files = tracked(args.source)
        secret = environment()
        if args.mode == 'initialize':
            result = initialize(home, args.source, files)
        else:
            private_path(home, directory=True)
            with private_path(home / 'lock').open('r+') as lock:
                fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                need(read_json(private_path(home / 'initialized.json')) == {'source': args.source}, 'INITIALIZATION_REQUIRED')
                tf = validate_root(home, args.source, files)
                if args.mode == 'plan':
                    result = prepare(home, tf, args.source, args, secret)
                elif args.mode == 'apply':
                    result = apply(home, tf, args.source, args, secret)
                else:
                    need(re.fullmatch('[a-f0-9]{32}', args.attempt) and args.attempt in unresolved(home),
                         'NO_UNCERTAIN_ATTEMPT')
                    inventory = read_json(private_path(args.private_inventory))
                    receipt = read_json(home / 'attempts' / args.attempt / 'receipt.json')
                    need(inventory.get('approval') == digest(receipt) and inventory.get('stateSha256') == state_hash(tf)
                         and inventory.get('unresolved') == [] and inventory.get('verifiedResources') ==
                         sorted(c['address'] for c in receipt['changes']) and inventory.get('reviewedByAdministrator') is True,
                         'PRIVATE_INVENTORY_INCOMPLETE')
                    write_new(home / 'attempts' / args.attempt / 'reconciled.json', inventory)
                    result = {'status': 'RECONCILED_NEW_PLAN_REQUIRED'}
        print(json.dumps(result, indent=2))
    except (Stop, OSError, ValueError, KeyError, TypeError) as exc:
        sys.exit(str(exc) if isinstance(exc, Stop) else 'INVALID_OR_UNAVAILABLE_PRIVATE_STACK_INPUT')


if __name__ == '__main__':
    main()
