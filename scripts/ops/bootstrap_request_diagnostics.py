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
import subprocess
import urllib.error
import urllib.request

import build_request_broker as publication

from admin_api import Http, Plan, SetupError, command
from bootstrap_diagnostics import BootstrapError

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
         'scripts/ops/admin_api.py', 'scripts/ops/bootstrap_diagnostics.py',
         'scripts/ops/build_request_broker.py', 'scripts/deployment/build.py',
         'ops/request-broker/Dockerfile', 'ops/request-broker/requirements.lock']
SPEC = importlib.util.spec_from_file_location('diagnostic_broker', ROOT / FILES[0])
broker = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(broker)


class ProviderReadError(BootstrapError):
    def __init__(self, message, *, code='GCLOUD_COMMAND_FAILED', provider_codes=(), cli_category=None):
        super().__init__(message)
        self.code = code
        self.provider_codes = tuple(provider_codes)
        self.cli_category = cli_category


def run(*args, missing_ok=False):
    """Broker-local adapter; preserve frozen activation dependencies and strict absence."""
    command = ['gcloud', *args, f'--project={PROJECT}', '--quiet', '--format=json']
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=60,
                                check=False, stdin=subprocess.DEVNULL)
    except (OSError, subprocess.TimeoutExpired) as error:
        raise ProviderReadError('CLI unavailable', code='GCLOUD_TIMEOUT' if isinstance(
            error, subprocess.TimeoutExpired) else 'GCLOUD_UNAVAILABLE') from None
    if result.returncode:
        codes = sorted(set(re.findall(
            r'\b(?:NOT_FOUND|PERMISSION_DENIED|UNAUTHENTICATED|SERVICE_DISABLED|INVALID_ARGUMENT|'
            r'FAILED_PRECONDITION|RESOURCE_EXHAUSTED|UNAVAILABLE|DEADLINE_EXCEEDED)\b', result.stderr)))
        if missing_ok and codes == ['NOT_FOUND']:
            return None
        # These hints aid diagnosis only. Never turn an English CLI message into absence.
        category = next((name for text, name in [
            ('unrecognized arguments:', 'UNRECOGNIZED_ARGUMENTS'),
            ('Invalid choice:', 'INVALID_COMMAND_CHOICE'),
            ('Cannot find service [', 'CANNOT_FIND_SERVICE_MESSAGE')]
            if text in result.stderr), None)
        raise ProviderReadError('CLI read failed', provider_codes=codes, cli_category=category)
    try:
        value = json.loads(result.stdout) if result.stdout.strip() else {}
    except ValueError:
        raise ProviderReadError('Invalid JSON', code='GCLOUD_JSON_INVALID') from None
    if value is None:
        raise ProviderReadError('Null without NOT_FOUND', code='GCLOUD_RESPONSE_INVALID')
    return value


class ServiceAbsenceError(SetupError):
    def __init__(self, code, http_status=None):
        self.code = code
        self.http_status = http_status
        super().__init__(code)


class ServiceAbsenceProbe(Http):
    """Confirm only the exact broker's absence; never parse or expose a response body."""
    path = f'v2/projects/{PROJECT}/locations/{REGION}/services/{SERVICE}'

    def __init__(self, token):
        super().__init__('https://run.googleapis.com', token)

    def confirm(self):
        request = urllib.request.Request(self.origin + '/' + self.path,
                                         headers=self.headers, method='GET')
        try:
            # Inherit TLS verification and NoRedirect from the shared HTTP client.
            with self.opener.open(request, timeout=25) as response:
                # Even a 200 null/malformed body is not evidence of absence.
                raise ServiceAbsenceError('BROKER_SERVICE_REST_NOT_ABSENT', response.status)
        except urllib.error.HTTPError as error:
            error.close()
            if error.code == 404:
                return None
            raise ServiceAbsenceError('BROKER_SERVICE_ABSENCE_HTTP_FAILED', error.code) from None
        except (urllib.error.URLError, TimeoutError, OSError):
            raise ServiceAbsenceError('BROKER_SERVICE_ABSENCE_TRANSPORT_FAILED') from None


class BrokerValidationError(SetupError):
    def __init__(self, code):
        self.code = code
        super().__init__(code)


def require(condition, code):
    if not condition:
        raise BrokerValidationError(code)


class Progress:
    """Fixed stage names only; never stores provider bodies, tokens or command output."""
    def __init__(self):
        self.stage = 'ARGUMENT_VALIDATION'
        self.reads = []

    def call(self, stage, operation, *args, **kwargs):
        self.stage = stage
        return operation(*args, **kwargs)


def read_stage(args):
    # Keys are executable source constants, not returned provider strings.
    operations = {
        ('projects', 'describe'): ('PROJECT_METADATA', dict),
        ('services', 'list'): ('ENABLED_APIS', list),
        ('projects', 'get-iam-policy'): ('PROJECT_IAM', dict),
        ('artifacts', 'docker', 'images', 'describe'): ('IMAGE_METADATA', dict),
        ('iam', 'service-accounts', 'describe'): ('ACCOUNT_METADATA', dict),
        ('iam', 'service-accounts', 'keys', 'list'): ('ACCOUNT_KEYS', list),
        ('iam', 'service-accounts', 'get-iam-policy'): ('ACCOUNT_IAM', dict),
        ('iam', 'roles', 'describe'): ('VIEW_ROLE', dict),
        ('iam', 'workload-identity-pools', 'describe'): ('POOL_METADATA', dict),
        ('iam', 'workload-identity-pools', 'providers', 'list'): ('PROVIDER_LIST', list),
        ('iam', 'workload-identity-pools', 'providers', 'describe'): ('PROVIDER_METADATA', dict),
        ('logging', 'buckets', 'describe'): ('LOG_BUCKET', dict),
        ('logging', 'views', 'describe'): ('LOG_VIEW', dict),
        ('run', 'services', 'describe'): ('BROKER_SERVICE', dict),
        ('run', 'services', 'get-iam-policy'): ('BROKER_SERVICE_IAM', dict),
    }
    for prefix, (stage, shape) in operations.items():
        if args[:len(prefix)] == prefix:
            if stage.startswith('ACCOUNT_'):
                stage = ('BROKER_' if BROKER in args or '--iam-account=' + BROKER in args else 'CALLER_') + stage
            return stage, shape
    raise BrokerValidationError('UNEXPECTED_INVENTORY_OPERATION')


def failure(error, progress):
    # Do not infer status by parsing arbitrary exception text or emit that text.
    code = 'UNEXPECTED_SETUP_ERROR'
    provider_codes = []
    if isinstance(error, (BrokerValidationError, publication.BuildVerificationError)):
        code = error.code
    elif isinstance(error, ServiceAbsenceError):
        code = error.code
    elif isinstance(error, ProviderReadError):
        allowed = {'GCLOUD_TIMEOUT', 'GCLOUD_UNAVAILABLE', 'GCLOUD_COMMAND_FAILED',
                   'GCLOUD_RESPONSE_INVALID', 'GCLOUD_JSON_INVALID', 'BOOTSTRAP_FAILED'}
        code = error.code if error.code in allowed else 'BOOTSTRAP_FAILED'
        provider_codes = sorted(set(error.provider_codes) & {
            'NOT_FOUND', 'PERMISSION_DENIED', 'UNAUTHENTICATED', 'SERVICE_DISABLED',
            'INVALID_ARGUMENT', 'FAILED_PRECONDITION', 'RESOURCE_EXHAUSTED',
            'UNAVAILABLE', 'DEADLINE_EXCEEDED'})
    elif isinstance(error, BootstrapError):
        code = 'BOOTSTRAP_FAILED'
    elif isinstance(error, SetupError):
        code = 'ADMIN_COMMAND_OR_POLICY_FAILED'
    elif isinstance(error, FileNotFoundError):
        code = 'LOCAL_FILE_MISSING'
    elif isinstance(error, OSError):
        code = 'LOCAL_IO_FAILED'
    elif isinstance(error, (ValueError, TypeError, KeyError, AttributeError, IndexError)):
        code = 'RESPONSE_OR_SOURCE_SHAPE_INVALID'
    elif isinstance(error, RuntimeError):
        code = 'SOURCE_COMMAND_FAILED'
    return {'status': 'STOPPED', 'stage': progress.stage, 'code': code,
            'provider_codes': provider_codes,
            'cli_category': error.cli_category if isinstance(error, ProviderReadError) and
                error.cli_category in {'UNRECOGNIZED_ARGUMENTS', 'INVALID_COMMAND_CHOICE',
                                       'CANNOT_FIND_SERVICE_MESSAGE'} else None,
            'http_status': error.http_status if isinstance(error, ServiceAbsenceError) and
                type(error.http_status) is int and 100 <= error.http_status <= 599 else None,
            'completed_reads': progress.reads,
            'resubmit': False, 'recovery': 'Preserve partial state; rerun --check'}


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def source(sha):
    require(re.fullmatch('[0-9a-f]{40}', sha or ''), 'SOURCE_SHA_INVALID')
    require(command(['git', '-C', str(ROOT), 'rev-parse', 'HEAD']) == sha, 'SOURCE_HEAD_MISMATCH')
    require(not command(['git', '-C', str(ROOT), 'status', '--porcelain', '--untracked-files=all']),
            'SOURCE_CHECKOUT_DIRTY')
    return {p: hashlib.sha256((ROOT / p).read_bytes()).hexdigest() for p in FILES}


def config(image):
    require(re.fullmatch(re.escape(publication.IMAGE) + r'@sha256:[0-9a-f]{64}', image or ''),
            'IMAGE_DIGEST_INVALID')
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
            'RESOURCE_CONFIGURATION_CONFLICT')


def grants(policy, allowed, label):
    found = set()
    for binding in policy.get('bindings', []):
        require(not binding.get('condition'), 'CONDITIONAL_POLICY_UNEXPECTED')
        found.update((binding['role'], member) for member in binding['members'])
    require(found <= allowed, 'IAM_GRANTS_UNEXPECTED')
    return found


def preflight(spec, cloud=None, logging=None, progress=None, service_absence=None):
    """Complete read-only inventory before constructing any executable mutation."""
    reader, inventory = cloud or run, []
    progress = progress or Progress()
    def cloud(*args, **kwargs):
        stage, shape = read_stage(args)
        absence_proof = {}
        try:
            value = progress.call(stage, reader, *args, **kwargs)
        except ProviderReadError as error:
            if not (stage == 'BROKER_SERVICE' and kwargs.get('missing_ok') and
                    args == ('run', 'services', 'describe', SERVICE, '--region=' + REGION) and
                    error.code == 'GCLOUD_COMMAND_FAILED' and not error.provider_codes and
                    error.cli_category == 'CANNOT_FIND_SERVICE_MESSAGE'):
                raise
            require(service_absence is not None, 'BROKER_SERVICE_ABSENCE_CLIENT_REQUIRED')
            value = progress.call('BROKER_SERVICE_ABSENCE_CHECK', service_absence.confirm)
            require(value is None, 'BROKER_SERVICE_ABSENCE_RESPONSE_INVALID')
            absence_proof = {'absence_confirmation': 'CLOUD_RUN_HTTP_404'}
        require((value is None and kwargs.get('missing_ok')) or isinstance(value, shape),
                'INVENTORY_RESPONSE_SHAPE_INVALID')
        if isinstance(value, list):
            require(all(isinstance(item, dict) for item in value), 'INVENTORY_RESPONSE_SHAPE_INVALID')
        progress.reads.append({'stage': stage, 'status': 'NOT_PROVISIONED' if value is None else 'READ_OK', **absence_proof})
        inventory.append({"read": list(args), "sha256": digest(value), **absence_proof})
        return value
    exact(cloud('projects', 'describe', PROJECT),
          {'projectId': PROJECT, 'projectNumber': NUMBER, 'lifecycleState': 'ACTIVE'}, 'project')
    enabled = {s.get('config', {}).get('name') for s in cloud('services', 'list', '--enabled')}
    require(APIS <= enabled, 'REQUIRED_APIS_MISSING')
    policy = cloud('projects', 'get-iam-policy', PROJECT)
    require(not any(set(b.get('members', [])) & {'serviceAccount:' + CALLER, 'serviceAccount:' + BROKER}
                    for b in policy.get('bindings', [])), 'DIAGNOSTIC_PROJECT_GRANTS_PRESENT')
    require(not any(set(b.get('members', [])) & {'allUsers', 'allAuthenticatedUsers'}
                    for b in policy.get('bindings', [])),
            'PUBLIC_PROJECT_GRANTS_PRESENT')
    # Owner must review build provenance; this confirms the referenced immutable artifact exists.
    image = spec['configuration']['image']
    cloud('artifacts', 'docker', 'images', 'describe', image)
    plan = Plan('request-diagnostics', spec)
    def add(label, *args):
        plan.add(label, {'gcloud': list(args), 'project': PROJECT}, lambda: progress.call('APPLY_ACTION', reader, *args))
    for email in (BROKER, CALLER):
        existing = cloud('iam', 'service-accounts', 'describe', email, missing_ok=True)
        if existing is None:
            add('Create keyless ' + email, 'iam', 'service-accounts', 'create', email.split('@')[0],
                '--description=' + MARKER)
            account_policy = {}
        else:
            exact(existing, {'email': email, 'description': MARKER}, 'service account')
            require(not existing.get('disabled'), 'ACCOUNT_DISABLED')
            require(not cloud('iam', 'service-accounts', 'keys', 'list', '--iam-account=' + email,
                              '--managed-by=user'), 'USER_MANAGED_KEYS_PRESENT')
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
                'VIEW_ROLE_PERMISSIONS_UNEXPECTED')
    pool = cloud('iam', 'workload-identity-pools', 'describe', POOL, '--location=global', missing_ok=True)
    pool_args = ['--workload-identity-pool=' + POOL, '--location=global']
    if pool is None:
        add('Create dedicated GitHub pool', 'iam', 'workload-identity-pools', 'create', POOL,
            '--location=global', '--description=' + MARKER)
        provider = None
    else:
        exact(pool, {'name': POOL_NAME, 'state': 'ACTIVE', 'description': MARKER}, 'pool')
        require(not pool.get('disabled') and not pool.get('inlineTrustConfig') and
                not pool.get('inlineCertificateIssuanceConfig'), 'POOL_CONFIGURATION_UNEXPECTED')
        providers = cloud('iam', 'workload-identity-pools', 'providers', 'list', *pool_args)
        require(all(p.get('name') == PROVIDER_NAME for p in providers), 'POOL_OTHER_PROVIDERS_PRESENT')
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
                'PROVIDER_CONFIGURATION_UNEXPECTED')
    if caller_binding_missing:
        add('Bind exact GitHub subject', 'iam', 'service-accounts', 'add-iam-policy-binding', CALLER,
            '--role=roles/iam.workloadIdentityUser', '--member=' + PRINCIPAL, '--condition=None')
    bucket = cloud('logging', 'buckets', 'describe', '_Default', '--location=global')
    require(bucket.get('lifecycleState') == 'ACTIVE' and not bucket.get('restrictedFields'),
            'LOG_BUCKET_UNAVAILABLE_OR_RESTRICTED')
    view = cloud('logging', 'views', 'describe', 'jems-production-requests', '--bucket=_Default',
                 '--location=global', missing_ok=True)
    if view is None:
        add('Create request-only view in retained bucket', 'logging', 'views', 'create',
            'jems-production-requests', '--bucket=_Default', '--location=global',
            '--log-filter=' + broker.VIEW_FILTER, '--description=' + MARKER)
        view_policy = {}
    else:
        exact(view, {'name': VIEW, 'filter': broker.VIEW_FILTER, 'description': MARKER}, 'view')
        view_policy = progress.call('LOG_VIEW_IAM', logging.call, 'GET', 'v2/' + VIEW + ':getIamPolicy?options.requestedPolicyVersion=3')
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
            'BROKER_SERVICE_UNRECOGNIZED')
    annotations = meta.get('annotations', {})
    require(annotations.get('run.googleapis.com/invoker-iam-disabled', 'false') == 'false' and
            annotations.get('run.googleapis.com/ingress') == 'all', 'BROKER_AUTHENTICATION_OR_INGRESS_MISMATCH')
    template = spec.get('template', {})
    runtime = template.get('spec', {})
    containers = runtime.get('containers', [])
    require(runtime.get('serviceAccountName') == BROKER and len(containers) == 1 and
            containers[0].get('image') == image and not runtime.get('volumes') and
            not any(containers[0].get(k) for k in ('command', 'args', 'volumeMounts')), 'BROKER_RUNTIME_MISMATCH')
    require(runtime.get('containerConcurrency') == 1 and runtime.get('timeoutSeconds') == 60,
            'BROKER_CONCURRENCY_OR_TIMEOUT_MISMATCH')
    limits = containers[0].get('resources', {}).get('limits', {})
    require(limits.get('memory') == '256Mi' and limits.get('cpu') in ('1', '1000m'), 'BROKER_LIMITS_MISMATCH')
    env = containers[0].get('env', [])
    require(env == [{'name': 'JEMS_LOG_BUCKET_LOCATION', 'value': 'global'}],
            'BROKER_ENVIRONMENT_MISMATCH')
    require(annotations.get('run.googleapis.com/maxScale') == '1' and
            annotations.get('run.googleapis.com/minScale', '0') == '0', 'BROKER_SCALING_MISMATCH')
    status = value.get('status', {})
    require(any(c.get('type') == 'Ready' and c.get('status') == 'True' for c in status.get('conditions', [])),
            'BROKER_NOT_READY')
    require(status.get('latestReadyRevisionName') == status.get('latestCreatedRevisionName') and
            sum(t.get('percent', 0) for t in status.get('traffic', [])
                if t.get('revisionName') == status.get('latestReadyRevisionName')) == 100,
            'BROKER_TRAFFIC_MISMATCH')


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source-sha', required=True)
    p.add_argument('--image', required=True)
    p.add_argument('--build-source-sha', help='Original source of an already successful build; broker files must match current source')
    p.add_argument('--build-id', help='Required for live check/apply; source provenance reverified from Cloud Build')
    modes = p.add_mutually_exclusive_group()
    modes.add_argument('--check', action='store_true')
    modes.add_argument('--apply', action='store_true')
    p.add_argument('--approve-plan-sha256')
    args = p.parse_args(argv)
    progress = Progress()
    try:
        require(not args.build_source_sha or args.build_id, 'BUILD_SOURCE_REQUIRES_EXISTING_BUILD')
        spec = proposed(args.image, args.source_sha, progress.call('SOURCE_VALIDATION', source, args.source_sha))
        if not args.check and not args.apply:
            print(json.dumps(spec, indent=2)); return 0
        require(args.build_id, 'BUILD_ID_REQUIRED')
        build_source = args.build_source_sha or args.source_sha
        archive = progress.call('SOURCE_ARCHIVE', publication.source_archive, args.source_sha, build_source)
        progress.stage = 'BROKER_SOURCE_COMPARISON'
        for name in publication.FILES:
            original = publication.publication.run(['git', 'show', build_source + ':ops/request-broker/' + name], ROOT)
            require(original == (ROOT / 'ops/request-broker' / name).read_bytes(), 'BUILD_SOURCE_BROKER_FILES_DIFFER')
        receipt = progress.call('BUILD_QUALIFICATION', publication.qualify, args.build_id, build_source, hashlib.sha256(archive).hexdigest())
        require(receipt['image'] == args.image, 'BUILD_RECEIPT_IMAGE_MISMATCH')
        spec['verified_build'] = receipt
        token = progress.call('ADMIN_ACCESS_TOKEN', command, ['gcloud', 'auth', 'print-access-token', '--quiet'])
        logging = Http('https://logging.googleapis.com', token)
        service_absence = ServiceAbsenceProbe(token)
        plan = preflight(spec, logging=logging, progress=progress, service_absence=service_absence)
        if args.apply:
            progress.call('APPLY_PLAN', plan.execute, args.approve_plan_sha256)
            remaining = preflight(spec, logging=logging, progress=progress, service_absence=service_absence)
            require(not remaining.actions, 'PARTIAL_SETUP_REMAINS')
            print(json.dumps({'status': 'CONFIGURED_NOT_ACCEPTED', 'effective_iam': 'unverified',
                              'request_evidence': 'unverified', 'recurring_execution': False}))
        else:
            print(json.dumps({'plan': plan.describe(), 'approve_plan_sha256': plan.review_code()}, indent=2))
        return 0
    except Exception as error:
        # Fixed codes/stages only, including unforeseen provider response shapes.
        print(json.dumps(failure(error, progress)))
        return 2



if __name__ == '__main__':
    sys.exit(main())
