#!/usr/bin/env python3
"""Sanitized, read-only Jems adult AI continuity audit. Never alters cloud state."""
import argparse
import json
import re
import subprocess
import sys

PROJECT = 'family-game-factory-jzw'
REGION = 'us-east5'
PRIVATE_REPO = 'family-game-factory-lab/family-game-factory-worker'
SHA = re.compile(r'^[0-9a-f]{40}$')
ALL_SHAS = re.compile(r'(?<![0-9a-f])[0-9a-f]{40}(?![0-9a-f])')
ADULT_FLAGS = ('FACTORY_ADULT_PILOT_MODE', 'FACTORY_ADULT_PILOT_OWNER_APPROVED',
               'FACTORY_ADULT_PILOT_PROFILE_ACCESS_VERIFIED')

class ContinuityError(Exception):
    pass

def command(args):
    # Commands contain no credentials, and stdout/stderr are never echoed.
    try:
        r = subprocess.run(args, text=True, capture_output=True, timeout=40, check=False)
    except (OSError, subprocess.TimeoutExpired):
        raise ContinuityError('METADATA_UNAVAILABLE') from None
    if r.returncode:
        raise ContinuityError('METADATA_QUERY_FAILED') from None
    return r.stdout.strip()

def command_json(args):
    try:
        return json.loads(command(args))
    except (ValueError, TypeError):
        raise ContinuityError('INVALID_METADATA') from None

def env_of(service):
    containers = service.get('spec', {}).get('template', {}).get('spec', {}).get('containers', [])
    if len(containers) != 1:
        raise ContinuityError('UNEXPECTED_SERVICE_CONTAINERS')
    return {x.get('name'): x.get('value') for x in containers[0].get('env', []) if 'value' in x}

def ready(service):
    status = service.get('status', {})
    return (
        any(x.get('type') == 'Ready' and x.get('status') == 'True'
            for x in status.get('conditions', []))
        and bool(status.get('latestReadyRevisionName'))
        and len(status.get('traffic') or []) == 1
        and status['traffic'][0].get('percent') == 100
        and status['traffic'][0].get('revisionName') == status['latestReadyRevisionName']
    )

def mounted_config(service):
    template = service.get('spec', {}).get('template', {}).get('spec', {})
    for v in template.get('volumes', []):
        secret = v.get('secret') or {}
        if secret.get('secretName') == 'factory-gateway-private-config':
            keys = [x.get('key') for x in secret.get('items', [])]
            if len(keys) == 1 and str(keys[0]).isdigit():
                return (secret['secretName'], str(keys[0]))
    for c in template.get('containers', []):
        for item in c.get('env', []):
            keyref = item.get('valueFrom', {}).get('secretKeyRef', {})
            if (keyref.get('name') == 'factory-gateway-private-config'
                    and str(keyref.get('key', '')).isdigit()):
                return (keyref['name'], str(keyref['key']))
    return None

def check_wif(wif, p):
    condition = wif.get('attributeCondition', '')
    required = ('assertion.repository_owner_id', '357047835',
                'assertion.repository_id', '1458899834',
                'refs/heads/main', 'factory-private.yml', 'workflow_sha')
    if (wif.get('state') != 'ACTIVE' or not all(v in condition for v in required)
            or '||' in condition or set(ALL_SHAS.findall(condition)) != {p}):
        raise ContinuityError('WIF_TRUST_DRIFT')

def assess(services, wif, main, tag, variable, approval, p, expected, config=None):
    if any(not ready(services[x]) for x in
           ('factory-gateway', 'factory-preview', 'factory-coach-private')):
        raise ContinuityError('SERVICE_READINESS_DRIFT')
    if (main, tag, variable) != (p, p, p):
        raise ContinuityError('PRIVATE_WORKER_PIN_DRIFT')
    check_wif(wif, p)
    env = env_of(services['factory-gateway'])
    if any(env.get(flag) != 'true' for flag in ADULT_FLAGS):
        raise ContinuityError('ADULT_POLICY_DRIFT')
    enabled = expected == 'active'
    expected_approval = 'true' if enabled else 'false'
    if (env.get('FACTORY_ACTIONS_APPROVED') != expected_approval
            or approval != expected_approval):
        raise ContinuityError('PAID_SWITCH_DRIFT')
    if config is not None:
        if (config.get('active') is not enabled
                or (config.get('approval') or {}).get('enabled') is not enabled
                or config.get('workerApprovedSha') != p
                or config.get('workerRepository') != PRIVATE_REPO):
            raise ContinuityError('PRIVATE_CONFIG_DRIFT')
    elif enabled:
        raise ContinuityError('ACTIVE_PRIVATE_CONFIG_UNVERIFIED')
    return {
        'result': 'CURRENT_STATE_VERIFIED',
        'adultMode': 'enabled',
        'generation': expected,
        'worker': 'main/tag/variable matched',
        'wif': 'restricted current provider matched',
        'services': 'all ready at 100 percent',
        'privateConfig': 'verified' if config is not None else 'not inspected',
        'mutations': 0
    }

def main(argv=None, run=command, read_json=command_json):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--private-worker-sha', required=True)
    parser.add_argument('--expect-generation', choices=('active', 'inactive'), default='inactive')
    parser.add_argument('--inspect-private-config', action='store_true')
    args = parser.parse_args(argv)
    p = args.private_worker_sha
    if not SHA.fullmatch(p):
        raise ContinuityError('EXPECTED_SHA_REQUIRED')
    services = {}
    for name in ('factory-gateway', 'factory-preview', 'factory-coach-private'):
        services[name] = read_json(['gcloud', 'run', 'services', 'describe', name,
                                    '--project='+PROJECT, '--region='+REGION, '--format=json'])
    wif = read_json(['gcloud', 'iam', 'workload-identity-pools', 'providers', 'describe',
                     'private-worker', '--project='+PROJECT, '--location=global',
                     '--workload-identity-pool=fgf-github', '--format=json'])
    main_sha = run(['gh', 'api', 'repos/'+PRIVATE_REPO+'/git/ref/heads/main', '--jq', '.object.sha'])
    tag_sha = run(['gh', 'api', 'repos/'+PRIVATE_REPO+'/git/ref/tags/factory-execution-'+p,
                   '--jq', '.object.sha'])
    variable = run(['gh', 'variable', 'get', 'FACTORY_PRIVATE_WORKER_SHA', '-R', PRIVATE_REPO])
    approval = run(['gh', 'variable', 'get', 'FACTORY_ACTIONS_APPROVED', '-R', PRIVATE_REPO])
    config = None
    if args.inspect_private_config:
        mounted = mounted_config(services['factory-gateway'])
        if mounted is None:
            raise ContinuityError('PINNED_PRIVATE_CONFIG_VERSION_UNVERIFIED')
        try:
            # Access the exact mounted numeric version, never 'latest'.
            # JSON is captured in memory only and is never printed.
            config = json.loads(run(['gcloud', 'secrets', 'versions', 'access', mounted[1],
                                     '--secret='+mounted[0], '--project='+PROJECT]))
        except (ValueError, TypeError):
            raise ContinuityError('INVALID_PRIVATE_CONFIG') from None
    print(json.dumps(assess(services, wif, main_sha, tag_sha, variable,
                            approval, p, args.expect_generation, config), sort_keys=True))

if __name__ == '__main__':
    try:
        main()
    except ContinuityError as e:
        print('JEMS_CONTINUITY_BLOCKED: '+str(e), file=sys.stderr)
        sys.exit(1)
