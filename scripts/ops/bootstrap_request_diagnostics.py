#!/usr/bin/env python3
"""Consolidated PR153 bootstrap. Offline by default; never edits Codex or release IAM.

An owner-reviewed immutable broker image is a prerequisite, not built implicitly.
--check reads cloud state. --apply requires the exact freshly computed plan hash.
Errors and conflicting partial resources stop; rerun --check before recovery.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import sys

from admin_api import Http, Plan, SetupError, command, require
from bootstrap_diagnostics import BootstrapError, gcloud as run

ROOT = Path(__file__).resolve().parents[2]
PROJECT = 'family-game-factory-jzw'
NUMBER = '1054529152893'
REGION = 'us-east5'
POOL = 'jems-github-diagnostics'
PROVIDER = 'github-main'
SERVICE = 'jems-request-evidence'
CALLER = f'jems-github-log-reader@{PROJECT}.iam.gserviceaccount.com'
BROKER = f'jems-request-broker@{PROJECT}.iam.gserviceaccount.com'
ROLE = f'projects/{PROJECT}/roles/jemsRequestViewReader'
POOL_NAME = f'projects/{NUMBER}/locations/global/workloadIdentityPools/{POOL}'
PROVIDER_NAME = f'{POOL_NAME}/providers/{PROVIDER}'
SUBJECT = 'repo:jzwyrzyk@356692244/family-game-factory@1458033181:environment:jems-production-diagnostics'
PRINCIPAL = f'principal://iam.googleapis.com/{POOL_NAME}/subject/{SUBJECT}'
VIEW = f'projects/{PROJECT}/locations/global/buckets/_Default/views/jems-production-requests'
BROKER_URL = f'https://{SERVICE}-{NUMBER}.{REGION}.run.app'
MARKER = 'Jems PR153 request diagnostics v1'
PERMISSIONS = ['logging.views.access', 'logging.views.get']
APIS = {'iam.googleapis.com', 'iamcredentials.googleapis.com', 'sts.googleapis.com',
        'run.googleapis.com', 'logging.googleapis.com', 'artifactregistry.googleapis.com'}
FILES = ['ops/request-broker/main.py', 'ops/request-broker/requirements.txt',
         'ops/request-diagnostics-provider.cel', '.github/workflows/jems-production-diagnostics.yml',
         'ops/request-evidence.schema.json', 'scripts/ops/bootstrap_request_diagnostics.py',
         'scripts/ops/admin_api.py', 'scripts/ops/bootstrap_diagnostics.py']
SPEC = importlib.util.spec_from_file_location('diagnostic_broker', ROOT / FILES[0])
broker = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(broker)


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def source(sha):
    require(re.fullmatch('[0-9a-f]{40}', sha or ''), 'Use a full immutable source SHA')
    require(command(['git', '-C', str(ROOT), 'rev-parse', 'HEAD']) == sha, 'Source HEAD differs')
    require(not command(['git', '-C', str(ROOT), 'status', '--porcelain', '--untracked-files=all']),
            'Source must be a clean checkout; keep evidence outside it')
    return {p: hashlib.sha256((ROOT / p).read_bytes()).hexdigest() for p in FILES}


def config(image):
    require(re.fullmatch(re.escape(f'{REGION}-docker.pkg.dev/{PROJECT}/jems-release-images/') +
                         r'[a-z0-9][a-z0-9/_-]*@sha256:[0-9a-f]{64}', image or ''),
            'An approved digest in the existing release registry is required')
    return {'image': image, 'service': SERVICE, 'runtime': BROKER, 'bucket_location': 'global',
            'min_instances': 0, 'max_instances': 1, 'concurrency': 1, 'timeout_seconds': 60,
            'memory': '256Mi', 'cpu': '1', 'authentication': 'required',
            'recurring_execution': False, 'coverage_attestation': 'not installed'}


def proposed(image, sha, hashes):
    return {'schema': 1, 'status': 'OFFLINE_PLAN', 'source_sha': sha, 'source_files': hashes,
            'project': PROJECT, 'project_number': NUMBER, 'configuration': config(image),
            'resources': {'pool': POOL_NAME, 'provider': PROVIDER_NAME,
                          'accounts': [CALLER, BROKER], 'role': ROLE, 'permissions': PERMISSIONS,
                          'view': VIEW, 'view_filter': broker.VIEW_FILTER,
                          'provider_condition': (ROOT / FILES[2]).read_text().strip()},
            'bindings': [dict(resource=CALLER, role='roles/iam.workloadIdentityUser', member=PRINCIPAL),
                         dict(resource=VIEW, role=ROLE, member='serviceAccount:' + BROKER),
                         dict(resource=SERVICE, role='roles/run.invoker', member='serviceAccount:' + CALLER)],
            'prerequisites': ['Review image build/source provenance against source_files; digest alone is not source proof',
                              'Existing enabled APIs and image publication authority; no automatic build or API activation',
                              'GitHub environment main-only and protected-main/OIDC settings reviewed',
                              'Effective positive/negative IAM audit and private coverage review before request evidence'],
            'cost': {'idle_minimum_instances': 0, 'additional_raw_log_sink': False,
                     'planning_allowance_usd_month': 5, 'is_quote_or_cap': False,
                     'assumption': 'At most 100 manual reads/month, each <=60s, one vCPU and 256MiB; build/storage/egress/Actions extra'}}


def exact(value, expected, label):
    require(isinstance(value, dict) and all(value.get(k) == v for k, v in expected.items()),
            'Conflicting ' + label + '; no automatic repair')


def grants(policy, allowed, label):
    found = set()
    for binding in policy.get('bindings', []):
        require(not binding.get('condition'), 'Conditional policy needs review: ' + label)
        found.update((binding['role'], member) for member in binding['members'])
    require(found <= allowed, 'Unexpected grants: ' + label)
    return found


def preflight(spec, cloud=run, logging=None):
    """Complete read-only inventory before constructing any executable mutation."""
    reader, inventory = cloud, []
    def cloud(*args, **kwargs):
        value = reader(*args, **kwargs)
        inventory.append({"read": list(args), "sha256": digest(value)})
        return value
    exact(cloud('projects', 'describe', PROJECT),
          {'projectId': PROJECT, 'projectNumber': NUMBER, 'lifecycleState': 'ACTIVE'}, 'project')
    enabled = {s.get('config', {}).get('name') for s in cloud('services', 'list', '--enabled')}
    require(APIS <= enabled, 'Required APIs missing; bootstrap will not enable them')
    policy = cloud('projects', 'get-iam-policy', PROJECT)
    require(not any(set(b.get('members', [])) & {'serviceAccount:' + CALLER, 'serviceAccount:' + BROKER}
                    for b in policy.get('bindings', [])), 'Diagnostic identity has project grants')
    require(not any(set(b.get('members', [])) & {'allUsers', 'allAuthenticatedUsers'}
                    for b in policy.get('bindings', [])),
            'Public project grants require effective broker ingress review')
    # Owner must review build provenance; this confirms the referenced immutable artifact exists.
    image = spec['configuration']['image']
    cloud('artifacts', 'docker', 'images', 'describe', image)
    plan = Plan('request-diagnostics', spec)
    def add(label, *args):
        plan.add(label, {'gcloud': list(args), 'project': PROJECT}, lambda: cloud(*args))
    for email in (BROKER, CALLER):
        existing = cloud('iam', 'service-accounts', 'describe', email, missing_ok=True)
        if existing is None:
            add('Create keyless ' + email, 'iam', 'service-accounts', 'create', email.split('@')[0],
                '--description=' + MARKER)
            account_policy = {}
        else:
            exact(existing, {'email': email, 'description': MARKER}, 'service account')
            require(not existing.get('disabled'), 'Account disabled; inspect before reuse')
            require(not cloud('iam', 'service-accounts', 'keys', 'list', '--iam-account=' + email,
                              '--managed-by=user'), 'User-managed keys found')
            account_policy = cloud('iam', 'service-accounts', 'get-iam-policy', email)
        allowed = {('roles/iam.workloadIdentityUser', PRINCIPAL)} if email == CALLER else set()
        present = grants(account_policy, allowed, email)
        if email == CALLER and not present:
            # Append after provider creation below.
            caller_binding_missing = True
        elif email == CALLER:
            caller_binding_missing = False
    role = cloud('iam', 'roles', 'describe', 'jemsRequestViewReader', missing_ok=True)
    if role is None:
        add('Create exact view role', 'iam', 'roles', 'create', 'jemsRequestViewReader',
            '--title=Jems request view reader', '--description=' + MARKER, '--stage=GA',
            '--permissions=' + ','.join(PERMISSIONS))
    else:
        exact(role, {'name': ROLE, 'description': MARKER, 'stage': 'GA'}, 'view role')
        require(not role.get('deleted') and sorted(role.get('includedPermissions', [])) == PERMISSIONS,
                'Unexpected view permissions')
    pool = cloud('iam', 'workload-identity-pools', 'describe', POOL, '--location=global', missing_ok=True)
    pool_args = ['--workload-identity-pool=' + POOL, '--location=global']
    if pool is None:
        add('Create dedicated GitHub pool', 'iam', 'workload-identity-pools', 'create', POOL,
            '--location=global', '--description=' + MARKER)
        provider = None
    else:
        exact(pool, {'name': POOL_NAME, 'state': 'ACTIVE', 'description': MARKER}, 'pool')
        require(not pool.get('disabled') and not pool.get('inlineTrustConfig') and
                not pool.get('inlineCertificateIssuanceConfig'), 'Unexpected pool configuration')
        providers = cloud('iam', 'workload-identity-pools', 'providers', 'list', *pool_args)
        require(all(p.get('name') == PROVIDER_NAME for p in providers), 'Dedicated pool has other providers')
        provider = cloud('iam', 'workload-identity-pools', 'providers', 'describe', PROVIDER,
                         *pool_args, missing_ok=True)
    condition = spec['resources']['provider_condition']
    if provider is None:
        add('Create exact protected-main provider', 'iam', 'workload-identity-pools', 'providers',
            'create-oidc', PROVIDER, *pool_args, '--description=' + MARKER,
            '--issuer-uri=https://token.actions.githubusercontent.com',
            '--allowed-audiences=https://iam.googleapis.com/' + PROVIDER_NAME,
            '--attribute-mapping=google.subject=assertion.sub', '--attribute-condition=' + condition)
    else:
        exact(provider, {'name': PROVIDER_NAME, 'state': 'ACTIVE', 'description': MARKER,
                         'attributeMapping': {'google.subject': 'assertion.sub'}, 'attributeCondition': condition,
                         'oidc': {'issuerUri': 'https://token.actions.githubusercontent.com',
                                  'allowedAudiences': ['https://iam.googleapis.com/' + PROVIDER_NAME]}}, 'provider')
        require(not any(provider.get(k) for k in ('disabled', 'saml', 'aws', 'x509', 'actorProviders')),
                'Unexpected provider configuration')
    if caller_binding_missing:
        add('Bind exact GitHub subject', 'iam', 'service-accounts', 'add-iam-policy-binding', CALLER,
            '--role=roles/iam.workloadIdentityUser', '--member=' + PRINCIPAL, '--condition=None')
    bucket = cloud('logging', 'buckets', 'describe', '_Default', '--location=global')
    require(bucket.get('lifecycleState') == 'ACTIVE' and not bucket.get('restrictedFields'),
            'Bucket unavailable or restricted; do not change shared restrictions')
    view = cloud('logging', 'views', 'describe', 'jems-production-requests', '--bucket=_Default',
                 '--location=global', missing_ok=True)
    if view is None:
        add('Create request-only view in retained bucket', 'logging', 'views', 'create',
            'jems-production-requests', '--bucket=_Default', '--location=global',
            '--log-filter=' + broker.VIEW_FILTER, '--description=' + MARKER)
        view_policy = {}
    else:
        exact(view, {'name': VIEW, 'filter': broker.VIEW_FILTER, 'description': MARKER}, 'view')
        view_policy = logging.call('GET', 'v2/' + VIEW + ':getIamPolicy?options.requestedPolicyVersion=3')
    expected = {(ROLE, 'serviceAccount:' + BROKER)}
    if not grants(view_policy, expected, 'log view'):
        def bind_view():
            # Fresh etag read: never overwrite concurrent changes or existing unexpected grants.
            current = logging.call('GET', 'v2/' + VIEW + ':getIamPolicy?options.requestedPolicyVersion=3')
            if not grants(current, expected, 'log view'):
                current['bindings'] = [{'role': ROLE, 'members': ['serviceAccount:' + BROKER]}]
                current['version'] = 3
                logging.call('POST', 'v2/' + VIEW + ':setIamPolicy', {'policy': current})
        plan.add('Bind broker only on exact log view', {'resource': VIEW, 'role': ROLE,
                 'member': 'serviceAccount:' + BROKER}, bind_view)
    service = cloud('run', 'services', 'describe', SERVICE, '--region=' + REGION, missing_ok=True)
    if service is None:
        add('Deploy reviewed immutable broker; no coverage assertion', 'run', 'deploy', SERVICE,
            '--region=' + REGION, '--image=' + image, '--service-account=' + BROKER,
            '--no-allow-unauthenticated', '--invoker-iam-check', '--ingress=all', '--min=0', '--max=1',
            '--concurrency=1', '--timeout=60', '--memory=256Mi', '--cpu=1', '--cpu-throttling',
            '--set-env-vars=JEMS_LOG_BUCKET_LOCATION=global', '--labels=jems-diagnostics=pr153')
        service_policy = {}
    else:
        validate_service(service, image)
        service_policy = cloud('run', 'services', 'get-iam-policy', SERVICE, '--region=' + REGION)
    invoker = {('roles/run.invoker', 'serviceAccount:' + CALLER)}
    if not grants(service_policy, invoker, 'broker service'):
        add('Allow exact GitHub caller on broker only', 'run', 'services', 'add-iam-policy-binding', SERVICE,
            '--region=' + REGION, '--role=roles/run.invoker', '--member=serviceAccount:' + CALLER,
            '--condition=None')
    plan.evidence = {**spec, "inventory_sha256": digest(inventory),
                     "view_policy_sha256": digest(view_policy)}
    plan.notes.extend(['No Codex identity changes; no project log grants; no build/API activation.',
                       'No coverage receipt, effective-IAM acceptance, GitHub settings or schedule changes.',
                       'Review ancestor and resource IAM and image build provenance separately before apply.'])
    return plan


def validate_service(value, image):
    meta, spec = value.get('metadata', {}), value.get('spec', {})
    require(meta.get('name') == SERVICE and meta.get('labels', {}).get('jems-diagnostics') == 'pr153',
            'Unrecognized broker service')
    annotations = meta.get('annotations', {})
    require(annotations.get('run.googleapis.com/invoker-iam-disabled', 'false') == 'false' and
            annotations.get('run.googleapis.com/ingress') == 'all', 'Broker authentication/ingress differs')
    template = spec.get('template', {})
    runtime = template.get('spec', {})
    containers = runtime.get('containers', [])
    require(runtime.get('serviceAccountName') == BROKER and len(containers) == 1 and
            containers[0].get('image') == image and not runtime.get('volumes') and
            not any(containers[0].get(k) for k in ('command', 'args', 'volumeMounts')), 'Broker runtime differs')
    require(runtime.get('containerConcurrency') == 1 and runtime.get('timeoutSeconds') == 60,
            'Broker concurrency/timeout differs')
    limits = containers[0].get('resources', {}).get('limits', {})
    require(limits.get('memory') == '256Mi' and limits.get('cpu') in ('1', '1000m'), 'Broker limits differ')
    env = containers[0].get('env', [])
    require(env == [{'name': 'JEMS_LOG_BUCKET_LOCATION', 'value': 'global'}],
            'Broker environment differs; preserve separately reviewed coverage settings and stop')
    require(annotations.get('run.googleapis.com/maxScale') == '1' and
            annotations.get('run.googleapis.com/minScale', '0') == '0', 'Broker service scaling differs')
    status = value.get('status', {})
    require(any(c.get('type') == 'Ready' and c.get('status') == 'True' for c in status.get('conditions', [])),
            'Broker not ready; inspect partial deployment before retry')
    require(status.get('latestReadyRevisionName') == status.get('latestCreatedRevisionName') and
            sum(t.get('percent', 0) for t in status.get('traffic', [])
                if t.get('revisionName') == status.get('latestReadyRevisionName')) == 100,
            'Broker traffic not on reviewed revision')


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source-sha', required=True)
    p.add_argument('--image', required=True)
    modes = p.add_mutually_exclusive_group()
    modes.add_argument('--check', action='store_true')
    modes.add_argument('--apply', action='store_true')
    p.add_argument('--approve-plan-sha256')
    args = p.parse_args(argv)
    try:
        spec = proposed(args.image, args.source_sha, source(args.source_sha))
        if not args.check and not args.apply:
            print(json.dumps(spec, indent=2)); return 0
        token = command(['gcloud', 'auth', 'print-access-token', '--quiet'])
        logging = Http('https://logging.googleapis.com', token)
        plan = preflight(spec, logging=logging)
        if args.apply:
            plan.execute(args.approve_plan_sha256)
            remaining = preflight(spec, logging=logging)
            require(not remaining.actions, 'Partial setup remains; run a fresh check')
            print(json.dumps({'status': 'CONFIGURED_NOT_ACCEPTED', 'effective_iam': 'unverified',
                              'request_evidence': 'unverified', 'recurring_execution': False}))
        else:
            print(json.dumps({'plan': plan.describe(), 'approve_plan_sha256': plan.review_code()}, indent=2))
        return 0
    except (SetupError, BootstrapError, OSError, ValueError, TypeError, KeyError) as error:
        # Never print upstream bodies, arbitrary metadata or local file contents.
        print(json.dumps({'status': 'STOPPED', 'reason': str(error) if isinstance(error, SetupError)
                          else 'Source or response validation failed', 'recovery': 'Preserve partial state; rerun --check'}))
        return 2


if __name__ == '__main__':
    sys.exit(main())
