#!/usr/bin/env python3
"""Guarded, two-phase recovery of the original 25/28 nonproduction apply.

No cloud writes in --plan. Original evidence/state is never rewritten. Apply uses
an isolated successor state, an exact approval, fresh full-plan equality, and a
persistent one-shot marker. No automatic retry/import CLI/state rm/targeting.
"""
import argparse
from datetime import datetime, timedelta, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import uuid
from urllib.parse import urlencode

import setup_nonproduction as initial
from admin_api import Http, SetupError

ROOT = Path(__file__).resolve().parents[2]
PROJECT = 'jems-jzw-nonprod'
NUMBER = '1092405124984'
ORIGINAL_SOURCE = '446a245e624f44c36e1e3847ae7779477272d899'
ORIGINAL_APPROVAL = '821d722ee140ffdef4c8ae4ba4e1fed89307e6c997153b3a8597f726a8caaad6'
PROVIDER = 'google_iam_workload_identity_pool_provider.github'
BUDGET = 'google_billing_budget.nonproduction'
OBSOLETE = 'google_project_iam_member.iap_agent'
IAP_IDENTITY = 'google_project_service_identity.iap'
REMAINING = {PROVIDER, BUDGET}
POOL_NAME = f'projects/{NUMBER}/locations/global/workloadIdentityPools/jems-nonproduction'
PROVIDER_NAME = POOL_NAME + '/providers/github-main'
DISPLAY = 'Jems protected main controller'
BUDGET_DISPLAY = 'Jems nonproduction monthly USD 15'
PARTIAL_PLAN = 'partial-recovery-1795714051.tfplan'


class Stop(Exception):
    """Only a fixed code leaves the process."""


def need(ok, code):
    if not ok:
        raise Stop(code)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def digest(data):
    return sha(json.dumps(data, sort_keys=True, separators=(',', ':')).encode())


def read_json(path):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            need(key not in result, 'JSON_DUPLICATE_KEY')
            result[key] = value
        return result
    return json.loads(path.read_bytes(), object_pairs_hook=unique)


def private_path(path, directory=False):
    path = Path(os.path.abspath(Path(path).expanduser()))
    need(not any(p.is_symlink() for p in (path, *path.parents)), 'UNSAFE_SYMLINK')
    need(path.exists(), 'STATE_DIRECTORY_MISSING' if directory else 'EVIDENCE_FILE_MISSING')
    st = path.stat()
    need(st.st_uid == os.getuid() and not st.st_mode & 0o077, 'PRIVATE_PERMISSIONS_REQUIRED')
    need(stat.S_ISDIR(st.st_mode) if directory else stat.S_ISREG(st.st_mode) and st.st_nlink == 1,
         'UNSAFE_FILE_TYPE')
    return path


def write_new(path, data):
    data = data if isinstance(data, bytes) else (json.dumps(data, sort_keys=True, indent=2) + '\n').encode()
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as handle:
        handle.write(data); handle.flush(); os.fsync(handle.fileno())
    fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
    try: os.fsync(fd)
    finally: os.close(fd)


def failure_codes(text):
    """Classify actual errors; never return provider prose or arbitrary identifiers."""
    codes = []
    if re.search(r'display.?name', text, re.I) and re.search(r'32|too long|length|exceed', text, re.I):
        codes.append('WIF_DISPLAY_NAME_LIMIT')
    if 'roles/iap.serviceAgent' in text and re.search(r'not supported|does not exist|invalid|not found', text, re.I):
        codes.append('IAP_PROJECT_ROLE_INVALID')
    if re.search(r'quota.project|user.project|SERVICE_USAGE_DENIED|serviceusage.services.use', text, re.I):
        codes.append('ADC_QUOTA_PROJECT_REQUIRED_OR_DENIED')
    for code in ('INVALID_ARGUMENT', 'ABORTED', 'PERMISSION_DENIED', 'UNAUTHENTICATED',
                 'ALREADY_EXISTS', 'FAILED_PRECONDITION', 'SERVICE_DISABLED', 'RESOURCE_EXHAUSTED'):
        if re.search(r'\b' + code + r'\b', text): codes.append(code)
    if re.search(r'concurrent policy changes|etag|concurrent modification', text, re.I):
        codes.append('IAM_POLICY_CONTENTION')
    return sorted(set(codes))


def command(args, cwd=None, phase='COMMAND', folder=None, ok=(0,)):
    try:
        result = subprocess.run(args, cwd=cwd, capture_output=True, timeout=900,
                                stdin=subprocess.DEVNULL, check=False)
    except subprocess.TimeoutExpired:
        raise Stop(phase + '_TIMEOUT_UNCERTAIN') from None
    except OSError:
        raise Stop(phase + '_UNAVAILABLE') from None
    if result.returncode not in ok:
        codes = failure_codes(result.stderr.decode(errors='replace') + result.stdout.decode(errors='replace'))
        if folder:
            # Hash raw output for correlation, retain only fixed diagnostics.
            write_new(folder / ('failure-' + uuid.uuid4().hex + '.json'), {
                'phase': phase, 'exit_code': result.returncode, 'codes': codes,
                'stdout_sha256': sha(result.stdout), 'stderr_sha256': sha(result.stderr)})
        specific = next((c for c in ('WIF_DISPLAY_NAME_LIMIT', 'IAP_PROJECT_ROLE_INVALID',
                        'ADC_QUOTA_PROJECT_REQUIRED_OR_DENIED', 'IAM_POLICY_CONTENTION') if c in codes), None)
        raise Stop(specific or (codes[0] if codes else phase + '_FAILED'))
    return result.stdout


def source_identity(expected):
    need(re.fullmatch(r'[a-f0-9]{40}', expected or ''), 'SOURCE_SHA_REQUIRED')
    need(command(['git', 'rev-parse', 'HEAD'], ROOT).decode().strip() == expected, 'SOURCE_MISMATCH')
    need(not command(['git', 'status', '--porcelain', '--untracked-files=all'], ROOT), 'SOURCE_DIRTY')
    files = ['infra/nonproduction/main.tf', 'infra/nonproduction/.terraform.lock.hcl',
             'scripts/ops/recover_nonproduction.py', 'scripts/ops/setup_nonproduction.py',
             'scripts/ops/admin_api.py', 'scripts/environments/cloud.py', 'ops/environments.json']
    need(read_json(ROOT / 'ops/environments.json')['enabled'] is False, 'FEDERATION_ACTIVATION_FORBIDDEN')
    return {name: sha((ROOT / name).read_bytes()) for name in files}


def evidence_hashes(folder):
    """All prior root/nested receipts are retained; provider cache is not evidence."""
    result = {}
    for root, dirs, files in os.walk(folder, followlinks=False):
        if Path(root) == folder:
            dirs[:] = [x for x in dirs if x not in ('.terraform', 'partial-recovery')]
        for name in dirs:
            need(not (Path(root) / name).is_symlink(), 'UNSAFE_SYMLINK')
        for name in files:
            path = private_path(Path(root) / name)
            need(path.stat().st_size <= 64 * 1024 * 1024, 'EVIDENCE_TOO_LARGE')
            result[str(path.relative_to(folder))] = sha(path.read_bytes())
    return result


def state_addresses(state):
    need(state.get('version') == 4 and state.get('lineage') and type(state.get('serial')) is int,
         'STATE_FORMAT_UNVERIFIED')
    addresses = set()
    for resource in state.get('resources', []):
        if resource.get('mode') == 'data': continue
        need(not resource.get('module'), 'UNEXPECTED_STATE_MODULE')
        for instance in resource.get('instances', []):
            need(not instance.get('deposed') and instance.get('status') != 'tainted', 'STATE_TAINTED_OR_DEPOSED')
            address = resource['type'] + '.' + resource['name']
            if 'index_key' in instance:
                address += '[' + json.dumps(instance['index_key'], separators=(',', ':')) + ']'
            need(address not in addresses, 'STATE_ADDRESS_DUPLICATE')
            addresses.add(address)
    return addresses


def recorded_iap_identity(state):
    """Read the singleton Google Beta service identity from preserved Terraform state."""
    records = [r for r in state['resources'] if r.get('type') == 'google_project_service_identity'
               and r.get('name') == 'iap' and not r.get('module') and r.get('mode') == 'managed']
    need(len(records) == 1, 'IAP_STATE_RECORD_MISSING_OR_AMBIGUOUS')
    record = records[0]
    instances = record.get('instances')
    need(record.get('provider') == 'provider["registry.terraform.io/hashicorp/google-beta"]'
         and isinstance(instances, list) and len(instances) == 1, 'IAP_STATE_RECORD_INVALID')
    instance = instances[0]
    need(isinstance(instance, dict) and 'index_key' not in instance and not instance.get('deposed')
         and instance.get('status') in (None, 'ready'), 'IAP_STATE_RECORD_INVALID')
    email = f'service-{NUMBER}@gcp-sa-iap.iam.gserviceaccount.com'
    attributes = {'id': f'projects/{PROJECT}/services/iap.googleapis.com', 'project': PROJECT,
                  'service': 'iap.googleapis.com', 'email': email, 'member': 'serviceAccount:' + email}
    stored = instance.get('attributes')
    need(isinstance(stored, dict) and all(stored.get(k) == v for k, v in attributes.items()),
         'IAP_STATE_IDENTITY_MISMATCH')
    return {'address': IAP_IDENTITY, 'evidence': 'original_terraform_state', **attributes}


def original_evidence(folder):
    hashes = evidence_hashes(folder)
    for name in ('binding.json', 'reviewed.json', 'reviewed.tfplan', 'recheck.tfplan',
                 'apply-started', 'terraform.tfstate', PARTIAL_PLAN, 'main.tf',
                 '.terraform.lock.hcl', 'terraform.tfvars.json'):
        need(name in hashes, 'ORIGINAL_EVIDENCE_MISSING')
    binding, receipt = read_json(folder / 'binding.json'), read_json(folder / 'reviewed.json')
    need(binding == receipt.get('binding') and binding.get('source_sha') == ORIGINAL_SOURCE
         and initial.digest(receipt) == ORIGINAL_APPROVAL, 'ORIGINAL_APPROVAL_CHANGED')
    need(receipt['plan_sha256'] == hashes['reviewed.tfplan']
         and (folder / 'apply-started').read_text().strip() == receipt['plan_sha256'], 'ORIGINAL_PLAN_OR_MARKER_CHANGED')
    for name in initial.FILES:
        need(hashes[name] == binding['files'][name], 'ORIGINAL_SOURCE_CHANGED')
    need(hashes['.terraform.lock.hcl'] == sha((ROOT / 'infra/nonproduction/.terraform.lock.hcl').read_bytes()),
         'PROVIDER_LOCK_CHANGED')
    variables = read_json(folder / 'terraform.tfvars.json')
    need(variables == binding['variables'] and variables['project_id'] == PROJECT
         and variables['region'] == 'us-east5' and variables['enable_federation'] is False
         and variables['enable_registry_cleanup'] is False, 'ORIGINAL_VARIABLES_UNSAFE')
    need(binding['inventory']['project_number'] == NUMBER, 'PROJECT_IDENTITY_MISMATCH')
    expected = {c['address'] for c in receipt['changes']}
    state = read_json(folder / 'terraform.tfstate')
    recorded = state_addresses(state)
    need(len(expected) == 28 and len(recorded) == 25
         and expected - recorded == REMAINING | {OBSOLETE} and recorded <= expected,
         'PARTIAL_STATE_SCOPE_MISMATCH')
    return hashes, variables, state, recorded


class Reader:
    """Use the same user ADC source as Terraform, never managed-identity fallback."""
    def __init__(self):
        forbidden = ('OIC_MANIFEST_PATH', 'GOOGLE_APPLICATION_CREDENTIALS', 'GOOGLE_CREDENTIALS',
                     'GOOGLE_CLOUD_KEYFILE_JSON', 'GCLOUD_KEYFILE_JSON',
                     'GOOGLE_OAUTH_ACCESS_TOKEN', 'GOOGLE_IMPERSONATE_SERVICE_ACCOUNT',
                     'GOOGLE_IMPERSONATE_SERVICE_ACCOUNT_DELEGATES',
                     'GOOGLE_BACKEND_CREDENTIALS', 'GOOGLE_BACKEND_ACCESS_TOKEN',
                     'CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT', 'CLOUDSDK_AUTH_ACCESS_TOKEN',
                     'CLOUDSDK_AUTH_ACCESS_TOKEN_FILE', 'CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE',
                     'TF_REATTACH_PROVIDERS')
        need(not any(os.environ.get(k) for k in forbidden), 'USER_ADC_CONTEXT_REQUIRED')
        need(not any(k.startswith(('TF_CLI_ARGS', 'TF_VAR_', 'TF_LOG', 'GOOGLE_ENDPOINT',
                                  'CLOUDSDK_API_ENDPOINT_OVERRIDES_')) and v for k, v in os.environ.items()),
             'EXECUTION_OVERRIDE_FORBIDDEN')
        need(not os.environ.get('TF_CLI_CONFIG_FILE') and not os.environ.get('TF_DATA_DIR'), 'EXECUTION_OVERRIDE_FORBIDDEN')
        self.token = command(['gcloud', 'auth', 'application-default', 'print-access-token', '--quiet'],
                             phase='ADC_AUTH').decode().strip()
        need(bool(self.token), 'ADC_AUTH_FAILED')

    def call(self, host, method, path, body=None, missing=False):
        try:
            return Http('https://' + host + '.googleapis.com', self.token,
                        {'x-goog-user-project': PROJECT}).call(method, path, body, missing=missing)
        except SetupError as error:
            match = re.search(r'HTTP (\d{3})$', str(error))
            code = {'400': 'INVALID_ARGUMENT', '401': 'UNAUTHENTICATED', '403': 'PERMISSION_DENIED',
                    '409': 'ABORTED', '429': 'RESOURCE_EXHAUSTED'}.get(match[1], 'HTTP_FAILED') if match else 'TRANSPORT_OR_RESPONSE_FAILED'
            raise Stop('READ_' + code) from None


def page_list(api, host, path, key):
    rows, seen = [], set()
    for _ in range(50):
        data = api.call(host, 'GET', path + ('&' if '?' in path else '?') + urlencode(
            {'pageSize': 100, **({'pageToken': token} if seen else {})}))
        need(isinstance(data, dict) and isinstance(data.get(key, []), list), 'INVENTORY_RESPONSE_INVALID')
        rows.extend(data.get(key, []))
        token = data.get('nextPageToken')
        if not token: return rows
        need(token not in seen, 'INVENTORY_PAGINATION_LOOP')
        seen.add(token)
    raise Stop('INVENTORY_INCOMPLETE')


def reconcile(api, variables):
    project = api.call('cloudresourcemanager', 'GET', 'v1/projects/' + PROJECT)
    need(project.get('projectId') == PROJECT and str(project.get('projectNumber')) == NUMBER
         and project.get('lifecycleState') == 'ACTIVE', 'PROJECT_IDENTITY_MISMATCH')
    account = 'billingAccounts/' + variables['billing_account']
    billing = api.call('cloudbilling', 'GET', 'v1/projects/' + PROJECT + '/billingInfo')
    need(billing.get('billingEnabled') is True and billing.get('billingAccountName') == account, 'BILLING_LINK_CHANGED')
    need(api.call('cloudbilling', 'GET', 'v1/' + account).get('open') is True, 'BILLING_ACCOUNT_CLOSED')
    for host, path, permissions in [
        ('cloudresourcemanager', 'v1/projects/' + PROJECT + ':testIamPermissions',
         ['serviceusage.services.use', 'iam.workloadIdentityPoolProviders.create']),
        ('cloudbilling', 'v1/' + account + ':testIamPermissions',
         ['billing.budgets.get', 'billing.budgets.list', 'billing.budgets.create'])]:
        granted = api.call(host, 'POST', path, {'permissions': permissions}).get('permissions', [])
        need(set(permissions) <= set(granted), 'REQUIRED_PERMISSION_MISSING')
    for service in ('billingbudgets.googleapis.com', 'iam.googleapis.com', 'iap.googleapis.com'):
        result = api.call('serviceusage', 'GET', f'v1/projects/{NUMBER}/services/{service}')
        need(result.get('state') == 'ENABLED', 'REQUIRED_API_DISABLED')
    pool = api.call('iam', 'GET', 'v1/' + POOL_NAME)
    need(pool.get('name') == POOL_NAME and pool.get('disabled') is True and pool.get('state') == 'ACTIVE',
         'FEDERATION_NOT_DISABLED_OR_POOL_UNVERIFIED')
    providers = page_list(api, 'iam', 'v1/' + POOL_NAME + '/providers?showDeleted=true', 'workloadIdentityPoolProviders')
    need(all(x.get('name') == PROVIDER_NAME for x in providers) and len(providers) <= 1, 'UNEXPECTED_PROVIDER')
    imports = {}
    if providers:
        provider = providers[0]
        need(provider.get('state') == 'ACTIVE' and provider.get('disabled') is True, 'PROVIDER_CONFLICT_OR_SOFT_DELETED')
        imports[PROVIDER] = PROVIDER_NAME
    policy = api.call('cloudresourcemanager', 'POST', 'v1/projects/' + PROJECT + ':getIamPolicy', {'options': {'requestedPolicyVersion': 3}})
    need(not any(b.get('role') == 'roles/iap.serviceAgent' for b in policy.get('bindings', [])), 'OBSOLETE_IAP_BINDING_EXISTS')
    budgets = page_list(api, 'billingbudgets', 'v1/' + account + '/budgets', 'budgets')
    matches = [b for b in budgets if b.get('displayName') == BUDGET_DISPLAY or
               'projects/' + NUMBER in b.get('budgetFilter', {}).get('projects', [])]
    need(len(matches) <= 1, 'BUDGET_INVENTORY_AMBIGUOUS')
    if matches:
        name = matches[0].get('name', '')
        need(re.fullmatch(re.escape(account) + r'/budgets/[A-Za-z0-9-]+', name), 'BUDGET_ID_UNVERIFIED')
        imports[BUDGET] = name
    # No API mutation or import here. Terraform import blocks must yield no-op.
    return {'project_number': NUMBER, 'billing_account': variables['billing_account'], 'imports': imports,
            'provider_absent': not providers, 'budget_absent': not matches,
            'iap_api_enabled': True, 'iap_project_binding_absent': True, 'pool_disabled': True, 'permissions_verified': True}


def audit(api, original, destination):
    start = datetime.fromtimestamp((original / 'apply-started').stat().st_mtime, timezone.utc) - timedelta(minutes=5)
    query = ('log_id("cloudaudit.googleapis.com/activity") AND timestamp>="' + start.isoformat() +
             '" AND (protoPayload.methodName:"CreateWorkloadIdentityPoolProvider" OR protoPayload.methodName:"SetIamPolicy")'
             ' AND (protoPayload.status.code=3 OR protoPayload.status.code=10)')
    rows, seen = [], set()
    for _ in range(20):
        body = {'resourceNames': ['projects/' + PROJECT], 'filter': query, 'pageSize': 100, 'orderBy': 'timestamp desc'}
        if seen: body['pageToken'] = token
        response = api.call('logging', 'POST', 'v2/entries:list', body)
        for entry in response.get('entries', []):
            payload = entry.get('protoPayload', {})
            method = payload.get('methodName', '')
            request = payload.get('request', {})
            name = payload.get('resourceName', '')
            status = payload.get('status', {})
            provider_match = ('CreateWorkloadIdentityPoolProvider' in method and
                (name == PROVIDER_NAME or request.get('parent') == POOL_NAME and
                 request.get('workloadIdentityPoolProviderId') == 'github-main'))
            iam_match = ('SetIamPolicy' in method and any(x in (PROJECT, 'projects/' + PROJECT, 'projects/' + NUMBER)
                for x in (name, request.get('resource'))))
            if not (provider_match or iam_match): continue
            message = str(status.get('message', ''))
            codes = failure_codes(message)
            if status.get('code') == 10:
                codes = sorted(set(codes) | {'IAM_POLICY_CONTENTION' if iam_match else 'ABORTED'})
            # Retain actual error message privately for review; no principal/request payload.
            rows.append({'time': entry.get('timestamp'), 'resource': PROVIDER if provider_match else 'project_iam',
                         'status_code': status.get('code'), 'message': message, 'codes': codes})
        token = response.get('nextPageToken')
        if not token: break
        need(token not in seen, 'AUDIT_PAGINATION_LOOP'); seen.add(token)
    need(not token, 'AUDIT_INCOMPLETE')
    write_new(destination / 'provider-errors.private.json', rows)
    public = [{k: v for k, v in row.items() if k != 'message'} | {'message_sha256': sha(row['message'].encode())} for row in rows]
    return {'failures': public, 'name_error_confirmed': any(r['resource'] == PROVIDER and r['status_code'] == 3
            and 'WIF_DISPLAY_NAME_LIMIT' in r['codes'] for r in rows),
            'iap_role_error_confirmed': any(r['resource'] == 'project_iam' and r['status_code'] == 3
            and 'IAP_PROJECT_ROLE_INVALID' in r['codes'] for r in rows),
            'budget_error': 'NOT_OBSERVED_CONFIGURATION_REQUIREMENT_CONFIRMED_FROM_PROVIDER_DOCUMENTATION'}


def provider_name_evidence(diagnosis, original_creates, remaining_creates):
    """Separate a documented input violation from an observed Google rejection."""
    if diagnosis['name_error_confirmed']:
        return {'basis': 'CORRELATED_PROVIDER_AUDIT_ERROR'}
    need(not any(row['resource'] == PROVIDER for row in diagnosis['failures']),
         'UNRESOLVED_PROVIDER_AUDIT_ERROR')
    original_name = 'Protected main environment controller'
    for creates in (original_creates, remaining_creates):
        matches = [c for c in creates if c['address'] == PROVIDER]
        need(len(matches) == 1 and matches[0]['type'] == 'google_iam_workload_identity_pool_provider',
             'PROVIDER_PLAN_EVIDENCE_MISMATCH')
        after = matches[0]['after']
        need(isinstance(after, dict) and after.get('workload_identity_pool_provider_id') == 'github-main'
             and after.get('disabled') is True and after.get('display_name') == original_name
             and len(original_name) > 32, 'PROVIDER_PLAN_EVIDENCE_MISMATCH')
    return {'basis': 'BOUND_PLANS_EXCEED_IAM_DISPLAY_NAME_LIMIT', 'original_display_name': original_name,
            'length': len(original_name), 'maximum': 32, 'provider_error_observed': False}


def guard_plan(plan, recorded, variables, imports):
    need(plan.get('errored', False) is False and not plan.get('deferred_changes')
         and plan.get('complete', True) is True, 'PLAN_INCOMPLETE')
    need(not plan.get('resource_drift'), 'EXISTING_RESOURCE_DRIFT')
    need(all(c.get('status') == 'pass' for c in plan.get('checks', [])), 'TERRAFORM_CHECK_FAILED_OR_UNKNOWN')
    entries = {c['address']: c for c in plan.get('resource_changes', []) if c.get('mode') == 'managed'}
    need(len(entries) == len([c for c in plan.get('resource_changes', []) if c.get('mode') == 'managed'])
         and set(entries) == recorded | REMAINING and OBSOLETE not in entries, 'PLAN_ADDRESS_SCOPE_MISMATCH')
    for address, item in entries.items():
        change = item['change']; actions = change['actions']
        expected = ['no-op'] if address in recorded or address in imports else ['create']
        need(actions == expected and not change.get('replace_paths') and not item.get('previous_address'),
             'EXISTING_CHANGE_OR_UNEXPECTED_ACTION')
        need(change.get('importing', {}).get('id') == imports.get(address), 'IMPORT_ID_MISMATCH')
        after = change.get('after', {})
        need(not after.get('project') or after['project'] in (PROJECT, NUMBER), 'CROSS_PROJECT_RESOURCE')
    provider = entries[PROVIDER]['change']['after']
    need(provider.get('disabled') is True and provider.get('display_name') == DISPLAY
         and provider.get('workload_identity_pool_id') == 'jems-nonproduction'
         and provider.get('workload_identity_pool_provider_id') == 'github-main', 'PROVIDER_CONFIGURATION_UNSAFE')
    mapping = {'google.subject': 'assertion.sub', 'attribute.environment': 'assertion.environment'}
    need(provider.get('attribute_mapping') == mapping and len(provider.get('attribute_condition', '')) <= 4096,
         'PROVIDER_MAPPING_UNSAFE')
    # Exact original trust, never weaken it to resolve a provider rejection.
    expected_condition = " && ".join([
        "assertion.repository == 'jzwyrzyk/family-game-factory'", "assertion.repository_id == '1458033181'",
        "assertion.repository_owner_id == '356692244'", "assertion.ref == 'refs/heads/main'",
        "assertion.workflow_ref == 'jzwyrzyk/family-game-factory/.github/workflows/jems-environments.yml@refs/heads/main'",
        "assertion.runner_environment == 'github-hosted'",
        "assertion.event_name in ['workflow_run', 'workflow_dispatch', 'schedule']",
        "assertion.environment in ['jems-nonproduction', 'jems-nonproduction-uat']"])
    need(provider.get('attribute_condition') == expected_condition, 'FEDERATION_TRUST_CHANGED')
    oidc = provider.get('oidc', [])
    need(len(oidc) == 1 and oidc[0].get('issuer_uri') == 'https://token.actions.githubusercontent.com'
         and oidc[0].get('allowed_audiences') == ['https://iam.googleapis.com/' + PROVIDER_NAME]
         and not oidc[0].get('jwks_json'), 'OIDC_CONFIGURATION_CHANGED')
    budget = entries[BUDGET]['change']['after']
    need(budget.get('billing_account') == variables['billing_account'] and budget.get('display_name') == BUDGET_DISPLAY,
         'BUDGET_ACCOUNT_CHANGED')
    filters = budget.get('budget_filter', [])
    need(len(filters) == 1 and filters[0].get('projects') == ['projects/' + NUMBER]
         and filters[0].get('calendar_period') == 'MONTH'
         and filters[0].get('credit_types_treatment') == 'INCLUDE_ALL_CREDITS', 'BUDGET_FILTER_CHANGED')
    need(not any(filters[0].get(k) for k in ('credit_types', 'custom_period', 'labels', 'resource_ancestors',
                                           'services', 'subaccounts')), 'BUDGET_FILTER_CHANGED')
    amount = budget.get('amount', [])
    need(len(amount) == 1 and not amount[0].get('last_period_amount') and
         len(amount[0].get('specified_amount', [])) == 1, 'BUDGET_AMOUNT_CHANGED')
    money = amount[0]['specified_amount'][0]
    need(money.get('currency_code') == 'USD' and str(money.get('units')) == '15'
         and money.get('nanos', 0) in (0, None), 'BUDGET_AMOUNT_CHANGED')
    need(sorted((r['threshold_percent'], r['spend_basis']) for r in budget.get('threshold_rules', [])) ==
         [(0.5, 'CURRENT_SPEND'), (0.8, 'CURRENT_SPEND'), (1, 'FORECASTED_SPEND')]
         and not budget.get('all_updates_rule'), 'BUDGET_ALERTS_CHANGED')
    configs = plan.get('configuration', {}).get('provider_config', {})
    cfg = configs.get('google.nonproduction_budget', {}).get('expressions', {})
    need({k: cfg.get(k, {}).get('constant_value') for k in ('project', 'billing_project', 'user_project_override')} ==
         {'project': PROJECT, 'billing_project': PROJECT, 'user_project_override': True}, 'BUDGET_QUOTA_PROJECT_UNVERIFIED')
    resources = plan.get('configuration', {}).get('root_module', {}).get('resources', [])
    need(any(r.get('address') == BUDGET and r.get('provider_config_key') == 'google.nonproduction_budget' for r in resources),
         'BUDGET_PROVIDER_ALIAS_UNVERIFIED')
    pool = entries['google_iam_workload_identity_pool.github']['change']['after']
    registry = entries['google_artifact_registry_repository.static']['change']['after']
    need(pool.get('disabled') is True and registry.get('cleanup_policy_dry_run') is True, 'ACTIVATION_FORBIDDEN')
    for item in plan.get('resource_changes', []):
        if item.get('mode') == 'data':
            need(item['change']['actions'] == ['no-op'], 'DEFERRED_DATA_READ_FORBIDDEN')
    return [{'address': a, 'actions': entries[a]['change']['actions'],
             'import_id': imports.get(a), 'after': entries[a]['change']['after']} for a in sorted(REMAINING)]


def tf(folder, *args, ok=(0,)):
    return command(['terraform', *args], folder, 'TERRAFORM_' + args[0].upper(), folder, ok)


def plan_identity(plan):
    # Exclude only generation time. Includes all configuration, variables, prior
    # state, output changes, unknowns, checks and the complete refreshed diff.
    return digest({k: v for k, v in plan.items() if k != 'timestamp'})


def make_plan(folder, filename, recorded, variables, imports):
    tf(folder, 'plan', '-input=false', '-lock-timeout=30s', '-parallelism=1', '-out=' + filename)
    result = json.loads(tf(folder, 'show', '-json', filename))
    actions = guard_plan(result, recorded, variables, imports)
    return result, actions


def prepare(original, destination, expected, hashes, variables, state, recorded, api):
    iap_record = recorded_iap_identity(state)
    version = json.loads(command(['terraform', 'version', '-json'], phase='TERRAFORM_VERSION'))
    need(version.get('terraform_version') == '1.13.5', 'TERRAFORM_VERSION_MISMATCH')
    # Review prior actual diagnostics before any execution approval is produced.
    audit_result = audit(api, original, destination)
    write_new(destination / 'diagnosis.json', audit_result)
    observed = reconcile(api, variables)
    write_new(destination / 'inventory.json', observed)
    need(audit_result['iap_role_error_confirmed'], 'IAP_ROLE_AUDIT_UNCONFIRMED')
    for name in initial.FILES:
        write_new(destination / name, (ROOT / 'infra/nonproduction' / name).read_bytes())
    write_new(destination / 'terraform.tfvars.json', variables)
    write_new(destination / 'terraform.tfstate', (original / 'terraform.tfstate').read_bytes())
    if observed['imports']:
        write_new(destination / 'imports.tf.json', {'import': [{'to': address, 'id': value}
                  for address, value in observed['imports'].items()]})
    tf(destination, 'init', '-input=false', '-lockfile=readonly')
    validation = json.loads(tf(destination, 'validate', '-json'))
    need(validation.get('valid') is True, 'TERRAFORM_VALIDATION_FAILED')
    # Confirm the preserved plans themselves agree, not just the user report.
    old = json.loads(tf(destination, 'show', '-json', str(original / 'reviewed.tfplan')))
    recheck = json.loads(tf(destination, 'show', '-json', str(original / 'recheck.tfplan')))
    original_creates = initial.validate_plan(old)
    need(original_creates == initial.validate_plan(recheck), 'ORIGINAL_RECHECK_MISMATCH')
    prior = json.loads(tf(destination, 'show', '-json', str(original / PARTIAL_PLAN)))
    remaining_creates = initial.validate_plan(prior)
    need({c['address'] for c in remaining_creates} == REMAINING | {OBSOLETE}, 'PARTIAL_PLAN_SCOPE_MISMATCH')
    name_evidence = provider_name_evidence(audit_result, original_creates, remaining_creates)
    plan, actions = make_plan(destination, 'remaining.tfplan', recorded, variables, observed['imports'])
    need(evidence_hashes(original) == hashes, 'ORIGINAL_EVIDENCE_CHANGED')
    inputs = {n: sha((destination / n).read_bytes()) for n in ('main.tf', '.terraform.lock.hcl', 'terraform.tfvars.json', 'terraform.tfstate')}
    if observed['imports']: inputs['imports.tf.json'] = sha((destination / 'imports.tf.json').read_bytes())
    receipt = {'schema': 1, 'status': 'REVIEWED_REMAINING_ACTIONS_NOT_APPLIED', 'source_sha': expected,
               'source_files': source_identity(expected), 'original_dir': str(original), 'original_files': hashes,
               'state_lineage': state['lineage'], 'state_serial': state['serial'], 'inputs': inputs,
               'plan_sha256': sha((destination / 'remaining.tfplan').read_bytes()), 'plan_identity': plan_identity(plan),
               'inventory': observed, 'recorded_iap_identity': iap_record, 'live_iap_acceptance': 'REQUIRED_BEFORE_DEV',
               'diagnosis': audit_result, 'provider_name_evidence': name_evidence, 'actions': actions,
               'existing_resources': sorted(recorded), 'destruction': 0, 'replacement': 0,
               'existing_modification': 0, 'federation_enabled': False, 'live_ai': False,
               'retired_uncreated_address': OBSOLETE}
    write_new(destination / 'reviewed-recovery.json', receipt)
    return {'status': receipt['status'], 'receipt': str(destination / 'reviewed-recovery.json'),
            'approve_plan_sha256': digest(receipt), 'actions': actions,
            'successor_state': str(destination / 'terraform.tfstate')}


def execute(original, folder, expected, approval, api):
    receipt = read_json(private_path(folder / 'reviewed-recovery.json'))
    need(re.fullmatch(r'[a-f0-9]{64}', approval or '') and approval == digest(receipt), 'APPROVAL_HASH_MISMATCH')
    need(receipt['source_sha'] == expected and receipt['source_files'] == source_identity(expected), 'SOURCE_CHANGED')
    hashes, variables, original_state, recorded = original_evidence(original)
    need(str(original) == receipt['original_dir'] and hashes == receipt['original_files'], 'ORIGINAL_EVIDENCE_CHANGED')
    need(receipt.get('recorded_iap_identity') == recorded_iap_identity(original_state)
         and receipt.get('live_iap_acceptance') == 'REQUIRED_BEFORE_DEV', 'IAP_STATE_RECEIPT_MISMATCH')
    expected_inputs = {'main.tf', '.terraform.lock.hcl', 'terraform.tfvars.json', 'terraform.tfstate'}
    if receipt['inventory']['imports']: expected_inputs.add('imports.tf.json')
    need(set(receipt['inputs']) == expected_inputs, 'RECOVERY_INPUT_SCOPE_MISMATCH')
    for name in initial.FILES:
        need(receipt['inputs'][name] == receipt['source_files']['infra/nonproduction/' + name],
             'RECOVERY_SOURCE_BINDING_MISMATCH')
    need(read_json(folder / 'terraform.tfvars.json') == variables, 'RECOVERY_VARIABLES_CHANGED')
    if receipt['inventory']['imports']:
        need(read_json(folder / 'imports.tf.json') == {'import': [{'to': address, 'id': value}
             for address, value in receipt['inventory']['imports'].items()]}, 'RECOVERY_IMPORTS_CHANGED')
    for name, value in receipt['inputs'].items():
        need(sha(private_path(folder / name).read_bytes()) == value, 'RECOVERY_INPUT_CHANGED')
    allowed = set(receipt['inputs'])
    need(all(p.name in allowed for p in folder.iterdir() if p.name.endswith(('.tf', '.tf.json', '.tfvars', '.tfvars.json'))),
         'UNEXPECTED_TERRAFORM_INPUT')
    need(sha(private_path(folder / 'remaining.tfplan').read_bytes()) == receipt['plan_sha256'], 'RECOVERY_PLAN_CHANGED')
    need(json.loads(command(['terraform', 'version', '-json'], phase='TERRAFORM_VERSION'))['terraform_version'] == '1.13.5',
         'TERRAFORM_VERSION_MISMATCH')
    tf(folder, 'init', '-input=false', '-lockfile=readonly')
    observed = reconcile(api, variables)
    need(observed == receipt['inventory'], 'CLOUD_INVENTORY_CHANGED')
    recheck_name = 'recheck-' + uuid.uuid4().hex + '.tfplan'
    plan, _ = make_plan(folder, recheck_name, recorded, variables, observed['imports'])
    need(plan_identity(plan) == receipt['plan_identity'], 'FULL_PLAN_DRIFT')
    need(evidence_hashes(original) == hashes, 'ORIGINAL_EVIDENCE_CHANGED')
    # Network reads/replanning can take minutes. Rebind the bytes at the last
    # possible point before issuing the durable mutation intent.
    for name, value in receipt['inputs'].items():
        need(sha(private_path(folder / name).read_bytes()) == value, 'RECOVERY_INPUT_CHANGED')
    need(sha(private_path(folder / 'remaining.tfplan').read_bytes()) == receipt['plan_sha256'], 'RECOVERY_PLAN_CHANGED')
    need(receipt['source_files'] == source_identity(expected), 'SOURCE_CHANGED')
    # Durable marker before the first mutation, global across all attempts.
    write_new(original / 'partial-recovery' / 'apply-started', {'approval': approval, 'successor': str(folder), 'source': expected})
    write_new(folder / 'apply-started', {'approval': approval})
    tf(folder, 'apply', '-input=false', '-lock-timeout=30s', '-parallelism=1', 'remaining.tfplan')
    post = reconcile(api, variables)
    need(set(post['imports']) == REMAINING and post['pool_disabled'], 'POST_APPLY_INVENTORY_MISMATCH')
    final_state = read_json(private_path(folder / 'terraform.tfstate'))
    need(recorded_iap_identity(final_state) == receipt['recorded_iap_identity'], 'IAP_SUCCESSOR_STATE_CHANGED')
    need(state_addresses(final_state) == recorded | REMAINING, 'POST_APPLY_STATE_MISMATCH')
    need(final_state['lineage'] == receipt['state_lineage'] and final_state['serial'] >= receipt['state_serial'],
         'POST_APPLY_STATE_LINEAGE_MISMATCH')
    tf(folder, 'plan', '-input=false', '-lock-timeout=30s', '-detailed-exitcode', '-out=post-apply.tfplan', ok=(0, 2))
    postplan = json.loads(tf(folder, 'show', '-json', 'post-apply.tfplan'))
    need(not postplan.get('resource_drift') and not postplan.get('errored') and not postplan.get('deferred_changes')
         and postplan.get('complete', True) is True and all(c.get('status') == 'pass' for c in postplan.get('checks', []))
         and all(c['change']['actions'] == ['no-op'] for c in postplan.get('resource_changes', []))
         and all(c.get('actions') == ['no-op'] for c in postplan.get('output_changes', {}).values()),
         'POST_APPLY_DRIFT')
    need(evidence_hashes(original) == hashes, 'ORIGINAL_EVIDENCE_CHANGED')
    result = {'status': 'RECOVERED_DISABLED_NOT_ACTIVATED', 'approval': approval,
              'state_instances': 27, 'successor_state': str(folder / 'terraform.tfstate'),
              'original_state_preserved': True, 'federation_enabled': False, 'live_ai': False,
              'live_iap_acceptance': 'REQUIRED_BEFORE_DEV',
              'post_apply_plan': 'NO_CHANGES'}
    write_new(folder / 'completed.json', result)
    return result


def main(argv=None):
    os.umask(0o077)
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source-sha', required=True)
    p.add_argument('--state-dir', default='~/work/jems-nonprod-state')
    modes = p.add_mutually_exclusive_group(required=True)
    modes.add_argument('--plan', action='store_true')
    modes.add_argument('--apply-receipt', type=Path)
    p.add_argument('--approve-plan-sha256')
    a = p.parse_args(argv)
    try:
        source_identity(a.source_sha)
        original = private_path(a.state_dir, directory=True)
        need(ROOT not in original.parents and original != ROOT, 'STATE_INSIDE_CHECKOUT')
        hashes, variables, state, recorded = original_evidence(original)
        parent = original / 'partial-recovery'
        parent.mkdir(exist_ok=True, mode=0o700); private_path(parent, directory=True)
        lockfd = os.open(parent / 'operator.lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        with os.fdopen(lockfd, 'w') as lock:
            try: fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError: raise Stop('RECOVERY_OPERATOR_BUSY') from None
            need(not (original / '.terraform.tfstate.lock.info').exists(), 'ORIGINAL_STATE_LOCKED')
            need(not (parent / 'apply-started').exists(), 'RECOVERY_ALREADY_STARTED_INSPECT_SUCCESSOR_STATE')
            if a.plan:
                need(not a.approve_plan_sha256, 'PLAN_CANNOT_CONSUME_APPROVAL')
                destination = parent / ('attempt-' + uuid.uuid4().hex)
                destination.mkdir(mode=0o700)
                write_new(destination / 'original-evidence-manifest.json', hashes)
                result = prepare(original, destination, a.source_sha, hashes, variables, state, recorded, Reader())
            else:
                receipt_path = private_path(a.apply_receipt)
                folder = private_path(receipt_path.parent, directory=True)
                need(folder.parent == parent and receipt_path.name == 'reviewed-recovery.json', 'RECOVERY_RECEIPT_OUTSIDE_SCOPE')
                result = execute(original, folder, a.source_sha, a.approve_plan_sha256, Reader())
        print(json.dumps(result, indent=2)); return 0
    except Stop as error:
        print(json.dumps({'status': 'BLOCKED', 'code': str(error), 'automatic_retry': False,
                          'preserve_original_and_successor_state': True})); return 2
    except Exception:
        print(json.dumps({'status': 'BLOCKED', 'code': 'RECOVERY_EVIDENCE_OR_IO_INVALID',
                          'automatic_retry': False, 'preserve_original_and_successor_state': True})); return 2


if __name__ == '__main__': sys.exit(main())
