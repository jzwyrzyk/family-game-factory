#!/usr/bin/env python3
"""One-time Cloud Shell preparation for jems-jzw-nonprod; no ambient Codex fallback.

Offline default. Inventory is read-only. Terraform plans/state remain in a private,
durable operator directory outside the checkout. Initial saved plans allow creates
only. Apply requires the exact receipt hash, unchanged plan and source, and rechecks
project/billing. This helper does not activate GitHub federation or applications.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
PROJECT = 'jems-jzw-nonprod'
PRODUCTION = 'family-game-factory-jzw'
PRODUCTION_NUMBER = '1054529152893'
REGION = 'us-east5'
FILES = ('main.tf', '.terraform.lock.hcl')


def require(ok, message):
    if not ok: raise RuntimeError(message)


def run(args, cwd=None):
    try:
        result = subprocess.run(args, cwd=cwd, capture_output=True, timeout=900, check=False)
    except (OSError, subprocess.TimeoutExpired):
        raise RuntimeError('Command unavailable or uncertain; inspect private state before retry') from None
    require(result.returncode == 0, 'Command failed; raw output suppressed; inspect private state before retry')
    return result.stdout


def cloud(*args):
    return json.loads(run(['gcloud', *args, '--quiet', '--format=json']) or b'null')


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def source(sha):
    require(re.fullmatch('[a-f0-9]{40}', sha or ''), 'Full source SHA required')
    require(run(['git', 'rev-parse', 'HEAD'], ROOT).decode().strip() == sha, 'Source HEAD differs')
    require(not run(['git', 'status', '--porcelain', '--untracked-files=all'], ROOT), 'Clean source required')
    return {name: hashlib.sha256((ROOT / 'infra/nonproduction' / name).read_bytes()).hexdigest() for name in FILES}


def inventory(reader=cloud):
    # Listing visibility cannot prove global ID availability. Never turn an empty
    # list, forbidden response or hidden project into a claimed globally free ID.
    visible = reader('projects', 'list', '--filter=projectId=' + PROJECT)
    require(isinstance(visible, list) and len(visible) <= 1, 'Project inventory ambiguous')
    existing = visible[0] if visible else None
    if existing:
        require(existing.get('projectId') == PROJECT and existing.get('lifecycleState') == 'ACTIVE'
                and str(existing.get('projectNumber', '')).isdigit()
                and str(existing['projectNumber']) != PRODUCTION_NUMBER, 'Project identity unavailable or unsafe')
    billing = reader('billing', 'projects', 'describe', PRODUCTION)
    account = billing.get('billingAccountName', '')
    require(billing.get('billingEnabled') is True and re.fullmatch(
        r'billingAccounts/[A-F0-9]{6}-[A-F0-9]{6}-[A-F0-9]{6}', account), 'Existing billing unavailable')
    account_info = reader('billing', 'accounts', 'describe', account.split('/')[1])
    require(account_info.get('name') == account and account_info.get('open') is True, 'Billing account not open')
    attached = reader('billing', 'projects', 'describe', PROJECT) if existing else None
    if existing:
        require(attached.get('billingEnabled') is True and attached.get('billingAccountName') == account,
                'Nonproduction billing differs; no automatic relink')
    return {'project': PROJECT, 'project_number': str(existing['projectNumber']) if existing else None,
            'project_id_status': 'EXISTING_VISIBLE' if existing else 'NOT_VISIBLE_GLOBAL_AVAILABILITY_UNVERIFIED',
            'billing_account': account.split('/')[1], 'region': REGION,
            'creation': [] if existing else [
                ['gcloud', 'projects', 'create', PROJECT, '--name=Jems nonproduction', '--labels=jems-purpose=nonproduction'],
                ['gcloud', 'billing', 'projects', 'link', PROJECT, '--billing-account=' + account.split('/')[1]]],
            'creation_policy': 'Review global project ID in Console before create. Creation is atomic; collision stops. Never adopt a hidden project or retry uncertain creation automatically.'}


def validate_plan(plan):
    require(plan.get('errored', False) is False, 'Terraform plan errored')
    require(not plan.get('deferred_changes'), 'Deferred changes cannot be approved')
    changes = []
    allowed = {'google_project_service', 'google_service_account', 'google_service_account_iam_member',
               'google_artifact_registry_repository', 'google_artifact_registry_repository_iam_member',
               'google_project_iam_custom_role', 'google_project_iam_member', 'google_project_service_identity',
               'google_iam_workload_identity_pool', 'google_iam_workload_identity_pool_provider', 'google_billing_budget'}
    for item in plan.get('resource_changes', []):
        actions = item.get('change', {}).get('actions')
        if item.get('mode') == 'data':
            require(actions in (['read'], ['no-op']), 'Unexpected data action'); continue
        require(item.get('type') in allowed and actions in (['create'], ['no-op']),
                'Initial setup allows creates/no-ops only; updates, replacement or deletion require separate review')
        if actions == ['create']:
            changes.append({'address': item['address'], 'type': item['type'],
                            'after': item['change'].get('after'), 'unknown': item['change'].get('after_unknown')})
    require(PRODUCTION not in json.dumps(changes) and PRODUCTION_NUMBER not in json.dumps(changes),
            'Production resource in nonproduction plan')
    return changes


def state_dir(path):
    target = Path(path).expanduser().resolve()
    require(target != ROOT and ROOT not in target.parents, 'State must be outside checkout')
    target.mkdir(parents=True, exist_ok=True, mode=0o700)
    require(target.stat().st_mode & 0o077 == 0, 'State directory must be private (chmod 700)')
    return target


def prepare(folder, sha, hashes, observed):
    require(observed['project_number'], 'Project must exist with verified billing before Terraform')
    allowed_inputs = {'main.tf', 'terraform.tfvars.json'}
    require(not any(p.name not in allowed_inputs for p in folder.iterdir()
                    if p.name.endswith(('.tf', '.tf.json', '.tfvars', '.tfvars.json'))),
            'Unexpected Terraform input in state directory')
    for name in FILES:
        target = folder / name
        data = (ROOT / 'infra/nonproduction' / name).read_bytes()
        require(not target.exists() or target.read_bytes() == data, 'State directory source differs; review migration separately')
        target.write_bytes(data)
    variables = {'project_id': PROJECT, 'region': REGION, 'enable_federation': False,
                 'enable_registry_cleanup': False, 'billing_account': observed['billing_account']}
    # A persistent binding stops accidentally reusing a state directory for another source/account.
    binding = {'source_sha': sha, 'files': hashes, 'inventory': observed, 'variables': variables}
    target = folder / 'binding.json'
    require(not target.exists() or json.loads(target.read_text()) == binding, 'State binding differs; review before reuse')
    target.write_text(json.dumps(binding, indent=2))
    (folder / 'terraform.tfvars.json').write_text(json.dumps(variables))
    return binding


def main(argv=None):
    os.umask(0o077)
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source-sha', required=True)
    modes = p.add_mutually_exclusive_group()
    modes.add_argument('--inventory', action='store_true')
    modes.add_argument('--plan', action='store_true')
    modes.add_argument('--apply', action='store_true')
    p.add_argument('--state-dir')
    p.add_argument('--approve-plan-sha256')
    a = p.parse_args(argv)
    hashes = source(a.source_sha)
    if not (a.inventory or a.plan or a.apply):
        print(json.dumps({'status': 'OFFLINE_NOT_APPROVED', 'project': PROJECT, 'region': REGION,
            'source_sha': a.source_sha, 'files': hashes, 'monthly_budget_usd': 15, 'budget_is_hard_cap': False,
            'live_ai': False, 'federation_enabled': False, 'registry_cleanup_enabled': False,
            'runtime_accounts': ['jems-static-runtime', 'jems-test-runtime'],
            'application_deployment': False, 'full_test_backend': 'SEPARATE_PLAN_REQUIRED'}, indent=2)); return
    observed = inventory()
    if a.inventory:
        print(json.dumps(observed, indent=2)); return
    require(a.state_dir, 'Private durable --state-dir required')
    folder = state_dir(a.state_dir)
    binding = prepare(folder, a.source_sha, hashes, observed)
    run(['terraform', 'init', '-input=false', '-lockfile=readonly'], folder)
    plan_path = folder / 'reviewed.tfplan'
    receipt_path = folder / 'reviewed.json'
    if a.plan:
        require(not (folder / 'apply-started').exists(), 'Prior apply started; inspect state and recover explicitly')
        run(['terraform', 'plan', '-input=false', '-out=' + str(plan_path)], folder)
        plan = json.loads(run(['terraform', 'show', '-json', str(plan_path)], folder))
        changes = validate_plan(plan)
        receipt = {'binding': binding, 'plan_sha256': hashlib.sha256(plan_path.read_bytes()).hexdigest(),
                   'changes': changes, 'status': 'PLANNED_NOT_APPLIED'}
        receipt_path.write_text(json.dumps(receipt, indent=2))
        print(json.dumps({'receipt': str(receipt_path), 'changes': [c['address'] for c in changes],
                          'approve_plan_sha256': digest(receipt)}, indent=2)); return
    receipt = json.loads(receipt_path.read_text())
    require(a.approve_plan_sha256 == digest(receipt) and receipt.get('binding') == binding,
            'Exact reviewed source/inventory/plan approval required')
    require(hashlib.sha256(plan_path.read_bytes()).hexdigest() == receipt['plan_sha256'], 'Saved plan changed')
    validate_plan(json.loads(run(['terraform', 'show', '-json', str(plan_path)], folder)))
    require(not (folder / 'apply-started').exists(), 'No automatic replay after apply; inspect state')
    fresh_path = folder / 'recheck.tfplan'
    run(['terraform', 'plan', '-input=false', '-out=' + str(fresh_path)], folder)
    fresh = json.loads(run(['terraform', 'show', '-json', str(fresh_path)], folder))
    require(validate_plan(fresh) == receipt['changes'], 'Cloud plan drifted; obtain a fresh review')
    # O_EXCL prevents accidental double submission. Terraform also locks state.
    with (folder / 'apply-started').open('x') as marker: marker.write(receipt['plan_sha256'])
    run(['terraform', 'apply', '-input=false', str(plan_path)], folder)
    outputs = json.loads(run(['terraform', 'output', '-json', 'configuration_identifiers'], folder))
    (folder / 'configuration-identifiers.json').write_text(json.dumps(outputs, indent=2))
    print(json.dumps({'status': 'BASELINE_APPLIED_NOT_ACTIVATED', 'configuration': str(folder / 'configuration-identifiers.json'),
                      'federation': False, 'live_ai': False, 'application_deployment': False}))


if __name__ == '__main__':
    try: main()
    except Exception:
        print('Nonproduction setup stopped; raw provider output suppressed. Keep state private; inspect before retry.', file=sys.stderr)
        sys.exit(2)
