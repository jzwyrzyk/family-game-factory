#!/usr/bin/env python3
"""Owner-run inactive Cloud Run deployment. Default plan is completely offline."""
import argparse
import json
from pathlib import Path
import re
import secrets
import subprocess
import sys
import urllib.request
from urllib.parse import urlsplit

PROJECT = 'family-game-factory-jzw'
WORKER = 'dcb887e6a51ba000fda1ccc42b9d198f8b9895f9'
PEM = 'factory-github-app-private-key'
CONFIGS = {'gateway': 'factory-gateway-private-config', 'preview': 'factory-preview-private-config'}
REQUIRED_APIS = {'run.googleapis.com', 'firestore.googleapis.com', 'secretmanager.googleapis.com', 'artifactregistry.googleapis.com'}

class SafeError(Exception):
    pass

class Cloud:
    def run(self, *args, data=None, parse=True):
        # Capture all output: gcloud may include config/secret content in diagnostics.
        command = ['gcloud', *args, '--project', PROJECT, '--quiet']
        if parse:
            command += ['--format=json']
        result = subprocess.run(command, input=data, text=True, capture_output=True)
        if result.returncode:
            raise SafeError('gcloud operation failed: ' + ' '.join(args[:3]) + '. Inspect IAM/resource metadata in the owner console; raw output suppressed to protect secrets.')
        return json.loads(result.stdout or 'null') if parse else result.stdout


def origin(value):
    parsed = urlsplit(value)
    if parsed.scheme != 'https' or parsed.username or parsed.password or parsed.port or parsed.path or parsed.query or parsed.fragment or not re.fullmatch(r'[a-z0-9-]+(?:\.[a-z0-9-]+)?\.run\.app', parsed.hostname or ''):
        raise SafeError('Expected a canonical HTTPS Cloud Run status.url, without path, credentials or query.')
    return value


def configuration(gateway, preview, old=None):
    gateway, preview = origin(gateway), origin(preview)
    if gateway == preview:
        raise SafeError('Gateway and preview must have separate hosts.')
    # Repeated deployment retains signing keys. Never rotate sessions implicitly.
    session = old['sessionKey'] if old else secrets.token_urlsafe(48)
    preview_key = old['previewKey'] if old else secrets.token_urlsafe(48)
    if min(len(session), len(preview_key)) < 32 or session == preview_key:
        raise SafeError('Invalid existing signing keys; explicit owner rotation required.')
    workspace = old.get('workspace', 'family-001') if old else 'family-001'
    family = old.get('familyId', 'family-001') if old else 'family-001'
    if any(not re.fullmatch(r'[A-Za-z0-9_-]{1,100}', value) or value in ('__proto__','constructor','prototype') for value in (workspace, family)):
        raise SafeError('Existing workspace/family identifier requires review.')
    if old and (old.get('projectId') != PROJECT or old.get('approvedSha') != WORKER or old.get('repository') != 'jzwyrzyk/family-game-factory' or old.get('localFile')):
        raise SafeError('Existing gateway deployment contract differs; refuse implicit workspace/project/worker/storage migration.')
    shared = dict(projectId=PROJECT, workspace=workspace, previewOrigin=preview, previewKey=preview_key)
    if old and old.get('artifactBucket'):
        shared['artifactBucket'] = old['artifactBucket']
    preview_config = dict(shared)
    gateway_config = dict(shared, active=False, appOrigin='https://jzwyrzyk.github.io', gatewayOrigin=gateway,
        sessionKey=session, familyId=family, repository='jzwyrzyk/family-game-factory', repositoryId='1458033181',
        workflow='factory-agent.yml', approvedSha=WORKER, githubAppId='5765875', githubInstallationId='182105358',
        githubPrivateKeyFile='/var/run/factory-github/key.pem', maxJobMicroUsd=120000,
        approval=dict(enabled=False, approvalId='', model='', inputUsdPerMillion=0, outputUsdPerMillion=0,
                      maxInputTokens=24000, maxOutputTokens=4000, priceReviewedOn=''))
    if old:
        # Redeploy the existing family, App installation, worker pins and storage.
        # Only activation is reset; never silently revert to personal-account defaults.
        gateway_config = dict(old, **shared, gatewayOrigin=gateway, active=False,
                              approval=dict(old['approval'], enabled=False))
    return {'gateway': gateway_config, 'preview': preview_config}


def service_args(kind, image, region, bootstrap, versions=None):
    args = ['run', 'deploy', 'factory-' + kind, '--region', region, '--image', image,
        '--service-account', f'factory-{kind}@{PROJECT}.iam.gserviceaccount.com', '--execution-environment', 'gen2',
        '--min-instances', '0', '--max-instances', '1', '--concurrency', '8', '--cpu', '1', '--memory', '512Mi',
        '--timeout', '60', '--cpu-throttling', '--no-cpu-boost', '--ingress', 'all', '--no-allow-unauthenticated',
        '--port', '8080', '--startup-probe', 'tcpSocket.port=8080,initialDelaySeconds=0,periodSeconds=5,timeoutSeconds=3,failureThreshold=24']
    # Replace rather than merge environment/mounts: stale activation flags cannot survive redeployment.
    if bootstrap:
        args += ['--set-env-vars', 'FACTORY_BOOTSTRAP=true,FACTORY_ACTIONS_APPROVED=false', '--clear-secrets']
    else:
        mounts = f'/var/run/factory-config/config.json={CONFIGS[kind]}:{versions[kind]}'
        if kind == 'gateway':
            mounts += f',/var/run/factory-github/key.pem={PEM}:{versions["pem"]}'
        args += ['--set-env-vars', 'FACTORY_PRIVATE_CONFIG=/var/run/factory-config/config.json,FACTORY_ACTIONS_APPROVED=false', '--set-secrets', mounts]
    return args


def bindings_for(policy, member):
    return [b for b in policy.get('bindings', []) if member in b.get('members', [])]


def check_bindings(policy, member, allowed):
    for binding in bindings_for(policy, member):
        if binding['role'] not in allowed or binding.get('condition'):
            raise SafeError('Unexpected or conditional IAM grant for ' + member + ': ' + binding['role'])


def check_secret_policy(policy, allowed):
    for binding in policy.get('bindings', []):
        if binding.get('role') in ('roles/secretmanager.secretAccessor', 'roles/owner', 'roles/editor', 'roles/secretmanager.admin'):
            if binding.get('condition') or any(m not in allowed for m in binding.get('members', [])):
                raise SafeError('Secret has unexpected accessor/admin grants. Review its IAM before deployment.')


def preflight(cloud, region, require_grants=False):
    apis = cloud.run('services', 'list', '--enabled')
    names = {x.get('config', {}).get('name') for x in apis}
    if not REQUIRED_APIS <= names:
        raise SafeError('Required APIs missing: ' + ', '.join(sorted(REQUIRED_APIS - names)))
    cloud.run('firestore', 'databases', 'describe', '--database', '(default)')
    policy = cloud.run('projects', 'get-iam-policy', PROJECT)
    # Ancestor grants to these identities also apply and must be visible for a safe audit.
    ancestors = cloud.run('projects', 'get-ancestors', PROJECT)
    ancestor_policies = []
    for ancestor in ancestors:
        if ancestor['type'] in ('folder', 'organization'):
            ancestor_policies.append(cloud.run(ancestor['type'] + 's', 'get-iam-policy', ancestor['id']))
    for kind in CONFIGS:
        email = f'factory-{kind}@{PROJECT}.iam.gserviceaccount.com'
        account = cloud.run('iam', 'service-accounts', 'describe', email)
        if account.get('disabled'):
            raise SafeError('Service identity is disabled: ' + email)
        roles = {'roles/datastore.user'} if kind == 'gateway' else {'roles/datastore.viewer'}
        check_bindings(policy, 'serviceAccount:' + email, roles)
        if require_grants and {b['role'] for b in bindings_for(policy, 'serviceAccount:' + email)} != roles:
            raise SafeError('Required Firestore role missing: ' + email)
        for parent in ancestor_policies:
            check_bindings(parent, 'serviceAccount:' + email, set())
        # Refuse downloadable user-managed runtime identity keys.
        keys = cloud.run('iam', 'service-accounts', 'keys', 'list', '--iam-account', email, '--managed-by', 'user')
        if keys:
            raise SafeError('User-managed service-account keys found: ' + email)
    # Accessor grants are per secret, never project-wide.
    cloud.run('secrets', 'describe', PEM)
    available = {s['name'].split('/')[-1] for s in cloud.run('secrets', 'list')}
    for name in available:
        p = cloud.run('secrets', 'get-iam-policy', name)
        for kind in CONFIGS:
            member = f'serviceAccount:factory-{kind}@{PROJECT}.iam.gserviceaccount.com'
            permitted = name == CONFIGS[kind] or kind == 'gateway' and name == PEM
            check_bindings(p, member, {'roles/secretmanager.secretAccessor'} if permitted else set())
            if require_grants and permitted and not bindings_for(p, member):
                raise SafeError('Required secret accessor missing: ' + name)
        if name in {PEM, *CONFIGS.values()}:
            allowed = {'serviceAccount:factory-gateway@' + PROJECT + '.iam.gserviceaccount.com'}
            if name == CONFIGS['preview']:
                allowed = {'serviceAccount:factory-preview@' + PROJECT + '.iam.gserviceaccount.com'}
            check_secret_policy(p, allowed)
    print('Metadata IAM preflight passed. Group membership, impersonation and Firestore client rules still require owner security review.')
    return policy, available


def grant(cloud, kind, role):
    cloud.run('projects', 'add-iam-policy-binding', PROJECT, '--member', f'serviceAccount:factory-{kind}@{PROJECT}.iam.gserviceaccount.com', '--role', role, '--condition=None')


def publish_config(cloud, name, config, available):
    # Secret material travels only on stdin, never CLI arguments, files or logs.
    if name not in available:
        cloud.run('secrets', 'create', name, '--replication-policy', 'automatic')
    version = cloud.run('secrets', 'versions', 'add', name, '--data-file=-', data=json.dumps(config))
    number = version['name'].split('/')[-1]
    if not number.isdigit():
        raise SafeError('Invalid secret version response.')
    return number


def health(url, bootstrap):
    # Never follow redirects from a health endpoint to a foreign host.
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs):
            return None
    with urllib.request.build_opener(NoRedirect).open(url + '/health', timeout=60) as response:
        body = json.loads(response.read(4096))
    if body.get('paidExecution') is not False or body.get('ready') is not (not bootstrap) or bool(body.get('bootstrap')) != bootstrap:
        raise SafeError('Unexpected health status at reviewed service origin.')


def verify_service(service, kind, image, bootstrap, versions):
    if not any(c.get('type') == 'Ready' and c.get('status') == 'True' for c in service.get('status', {}).get('conditions', [])):
        raise SafeError('Cloud Run revision is not ready.')
    spec = service['spec']['template']['spec']
    if spec['serviceAccountName'] != f'factory-{kind}@{PROJECT}.iam.gserviceaccount.com':
        raise SafeError('Unexpected deployed service identity.')
    annotations = service['spec']['template']['metadata']['annotations']
    if annotations.get('autoscaling.knative.dev/minScale', '0') != '0' or annotations.get('autoscaling.knative.dev/maxScale') != '1':
        raise SafeError('Unexpected scaling limits.')
    container = spec['containers'][0]
    if container['image'] != image:
        raise SafeError('Deployed image differs from approved digest.')
    env = {x['name']: x.get('value') for x in container.get('env', [])}
    expected = {'FACTORY_ACTIONS_APPROVED': 'false', **({'FACTORY_BOOTSTRAP': 'true'} if bootstrap else {'FACTORY_PRIVATE_CONFIG': '/var/run/factory-config/config.json'})}
    if env != expected:
        raise SafeError('Unexpected runtime environment; possible stale activation settings.')
    secrets_mounted = {v['secret']['secretName']:v['secret']['items'][0]['key'] for v in spec.get('volumes', []) if 'secret' in v}
    expected_secrets = {} if bootstrap else {CONFIGS[kind]:versions[kind], **({PEM:versions['pem']} if kind == 'gateway' else {})}
    if secrets_mounted != expected_secrets:
        raise SafeError('Unexpected secret mounts or unpinned secret versions.')


def deploy(cloud, args):
    _, available = preflight(cloud, args.region)
    # Resolve PEM metadata only. Its value is never fetched by this tool.
    enabled = cloud.run('secrets', 'versions', 'list', PEM, '--filter=state:ENABLED', '--sort-by=~createTime', '--limit=1')
    if not enabled:
        raise SafeError('Existing PEM secret has no enabled version.')
    versions = {'pem':enabled[0]['name'].split('/')[-1]}
    if not versions['pem'].isdigit():
        raise SafeError('Invalid PEM version.')
    # Bootstrap only. Existing services and configuration must never be fed
    # through this inactive deployment path: it resets the approval switches,
    # and would revoke an approved private adult session during routine releases.
    # An in-place, explicitly reviewed release must preserve those identities.
    existing_services = {s['metadata']['name'] for s in cloud.run('run', 'services', 'list', '--region', args.region)}
    if existing_services.intersection({'factory-gateway', 'factory-preview'}) or (set(CONFIGS.values()) & available):
        raise SafeError('EXISTING_RELEASE_MUST_USE_IN_PLACE_UPGRADE: inactive bootstrap cannot replace a running Jems service or private configuration.')
    old = None
    if CONFIGS['gateway'] in available:
        # Keep private JSON in memory and reuse keys. Do not print it, even on failure.
        old = cloud.run('secrets', 'versions', 'access', 'latest', '--secret', CONFIGS['gateway'], parse=False)
        old = json.loads(old)
        if old.get('active') is not False or old.get('approval', {}).get('enabled') is not False:
            raise SafeError('Existing gateway is active. Refusing an implicit reconfiguration; use reviewed emergency-stop procedure.')
        configuration('https://factory-gateway-validation.a.run.app', 'https://factory-preview-validation.a.run.app', old)
    services = {s['metadata']['name']:s for s in cloud.run('run', 'services', 'list', '--region', args.region)}
    urls = {}
    for kind in CONFIGS:
        image = getattr(args, kind + '_image')
        name = 'factory-' + kind
        # Existing services must be owned by this deployment protocol. Do not overwrite unknown workloads.
        if name in services:
            existing = services[name]
            if existing['metadata'].get('labels', {}).get('factory-deployment') != 'assignment-003':
                raise SafeError('Existing service is not labeled as managed by this script: ' + name)
            urls[kind] = origin(existing['status']['url'])
        else:
            cloud.run(*service_args(kind, image, args.region, True), '--labels', 'factory-deployment=assignment-003')
            info = cloud.run('run', 'services', 'describe', name, '--region', args.region)
            verify_service(info, kind, image, True, {})
            urls[kind] = origin(info['status']['url'])
    configs = configuration(urls['gateway'], urls['preview'], old)
    # The preview config deliberately has neither app PEM nor session signing key.
    for kind in CONFIGS:
        versions[kind] = publish_config(cloud, CONFIGS[kind], configs[kind], available)
        cloud.run('secrets', 'add-iam-policy-binding', CONFIGS[kind], '--member', f'serviceAccount:factory-{kind}@{PROJECT}.iam.gserviceaccount.com', '--role', 'roles/secretmanager.secretAccessor', '--condition=None')
    cloud.run('secrets', 'add-iam-policy-binding', PEM, '--member', f'serviceAccount:factory-gateway@{PROJECT}.iam.gserviceaccount.com', '--role', 'roles/secretmanager.secretAccessor', '--condition=None')
    grant(cloud, 'gateway', 'roles/datastore.user')
    grant(cloud, 'preview', 'roles/datastore.viewer')
    for kind in CONFIGS:
        image = getattr(args, kind + '_image')
        cloud.run(*service_args(kind, image, args.region, False, versions), '--labels', 'factory-deployment=assignment-003')
        info = cloud.run('run', 'services', 'describe', 'factory-' + kind, '--region', args.region)
        verify_service(info, kind, image, False, versions)
        if origin(info['status']['url']) != urls[kind]:
            raise SafeError('Service URL changed during bootstrap; refusing readiness.')
        cloud.run('run', 'services', 'update-traffic', 'factory-' + kind, '--region', args.region, '--to-latest')
        # Application authenticates all private operations. Public transport is required for Pages/iframe use.
        cloud.run('run', 'services', 'add-iam-policy-binding', 'factory-' + kind, '--region', args.region, '--member', 'allUsers', '--role', 'roles/run.invoker', '--condition=None')
        health(urls[kind], False)
    preflight(cloud, args.region, require_grants=True)
    print(json.dumps({'gateway': urls['gateway'], 'preview': urls['preview'], 'active': False,
        'FACTORY_ACTIONS_APPROVED': False, 'workerSha': WORKER, 'secretVersions': versions}, indent=2))


def main(argv=None, cloud=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['plan','validate','deploy'], nargs='?', default='plan')
    parser.add_argument('--region', required=True, help='Owner-selected region; existing Firestore location must be reviewed.')
    parser.add_argument('--gateway-image')
    parser.add_argument('--preview-image')
    parser.add_argument('--execute', action='store_true')
    args = parser.parse_args(argv)
    if not re.fullmatch(r'[a-z]+-[a-z]+[0-9]', args.region):
        raise SafeError('Invalid region.')
    if args.command == 'plan':
        print(json.dumps({'project': PROJECT, 'region': args.region, 'services':['factory-gateway','factory-preview'],
            'identities':['factory-gateway','factory-preview'], 'minimumInstances':0, 'maximumInstances':1,
            'active':False,'FACTORY_ACTIONS_APPROVED':False,'workerSha':WORKER,
            'pemSecret':PEM,'configSecrets':CONFIGS,'mutations':'none (offline plan)'}, indent=2))
        return
    cloud = cloud or Cloud()
    if args.command == 'validate':
        preflight(cloud, args.region)
        return
    if not args.execute:
        raise SafeError('Deployment requires explicit --execute on the owner machine. No mutation attempted.')
    for kind in CONFIGS:
        image = getattr(args, kind + '_image') or ''
        if not re.fullmatch(re.escape(args.region) + r'-docker\.pkg\.dev/' + PROJECT + r'/[a-z0-9_-]+/[a-z0-9_-]+@sha256:[a-f0-9]{64}', image):
            raise SafeError('Both reviewed images must use same-region, existing-project Artifact Registry immutable digests.')
    deploy(cloud, args)

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(str(error) if isinstance(error, SafeError) else 'Deployment failed. Sensitive diagnostics suppressed; check resource metadata and retry after review.', file=sys.stderr)
        sys.exit(1)
