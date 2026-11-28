#!/usr/bin/env python3
"""Read-only DEV foundation planning through protected GitHub; never apply.

Reuse the qualified foundation inventory and additive command generator. Runtime
adult/worker/model settings are deliberately not needed to inventory a project.
Raw inventory/commands stay in a separate private DEV planning bucket.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta, timezone
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'deployment'))
import dev_bootstrap as foundation
from dev_contract import DevError, require

REPOSITORY = 'jzwyrzyk/family-game-factory'
WORKFLOW = REPOSITORY + '/.github/workflows/jems-dev-foundation-plan.yml@refs/heads/main'
PROJECT = 'jems-jzw-dev'
PROJECT_NUMBER = '300049441641'
BUCKET = PROJECT + '-infrastructure-plans'
ACCOUNT = 'jems-dev-infra-plan@' + PROJECT + '.iam.gserviceaccount.com'
READ_PREFIXES = (
 ('projects','describe'), ('projects','get-iam-policy'), ('services','list'),
 ('iam','service-accounts','describe'), ('iam','service-accounts','list'),
 ('iam','service-accounts','keys','list'), ('iam','roles','list'), ('iam','roles','describe'),
 ('iam','workload-identity-pools','list'), ('firestore','databases','list'),
 ('storage','buckets','list'), ('storage','buckets','get-iam-policy'),
 ('artifacts','repositories','list'), ('artifacts','repositories','get-iam-policy'),
 ('secrets','list'), ('secrets','get-iam-policy'),
)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True).encode()


def digest(value):
    return hashlib.sha256(canonical(value)).hexdigest()


def target(number):
    require(number == PROJECT_NUMBER, 'ACTUAL_SEPARATE_DEV_PROJECT_NUMBER_REQUIRED')
    return {'projectId': PROJECT, 'projectNumber': number, 'region': 'us-east5'}


def context(env):
    require(env.get('GITHUB_ACTIONS') == 'true' and env.get('GITHUB_REPOSITORY') == REPOSITORY
            and env.get('GITHUB_REPOSITORY_ID') == '1458033181'
            and env.get('GITHUB_REPOSITORY_OWNER_ID') == '356692244'
            and env.get('GITHUB_REF') == 'refs/heads/main' and env.get('GITHUB_REF_PROTECTED') == 'true'
            and env.get('GITHUB_EVENT_NAME') == 'workflow_dispatch'
            and env.get('GITHUB_RUN_ATTEMPT') == '1'
            and env.get('GITHUB_WORKFLOW_REF') == WORKFLOW
            and env.get('DEV_PLAN_ENVIRONMENT') == 'jems-dev-foundation-plan', 'PROTECTED_DEV_PLAN_WORKFLOW_REQUIRED')
    # Installation-token dispatch and human environment approval are distinct.
    # Missing/unallocated identity pins never fall back to the owner or GITHUB_TOKEN.
    actor = env.get('DEV_PLAN_DISPATCHER_LOGIN', '')
    actor_id = env.get('DEV_PLAN_DISPATCHER_ID', '')
    require(isinstance(actor, str) and re.fullmatch(r'[a-z0-9][a-z0-9-]*\[bot\]', actor)
            and isinstance(actor_id, str) and re.fullmatch(r'[1-9][0-9]*', actor_id)
            and actor_id not in {'356692244', '41898282'}
            and actor != 'github-actions[bot]'
            and env.get('GITHUB_ACTOR') == actor
            and env.get('GITHUB_ACTOR_ID') == actor_id
            and env.get('GITHUB_TRIGGERING_ACTOR') == actor,
            'PINNED_DEV_DISPATCHER_REQUIRED')
    sha = env.get('GITHUB_SHA', '')
    require(re.fullmatch('[a-f0-9]{40}', sha) and env.get('DEV_PLAN_SOURCE') == sha
            and env.get('GITHUB_WORKFLOW_SHA') == sha, 'EXACT_PROTECTED_OPERATOR_SOURCE_REQUIRED')
    require(re.fullmatch('[1-9][0-9]*', env.get('GITHUB_RUN_ID', '')), 'RUN_ID_REQUIRED')
    return target(env.get('DEV_PROJECT_NUMBER')), sha


def command(args):
    result = subprocess.run(args, stdin=subprocess.DEVNULL, capture_output=True, timeout=90)
    require(result.returncode == 0 and len(result.stdout) <= 4_000_000,
            'DEV_PLANNING_OPERATION_FAILED: inspect private administrator evidence; do not retry uncertain writes')
    return result.stdout


def credentials(env, m):
    path = Path(env.get('GOOGLE_APPLICATION_CREDENTIALS', '')).absolute()
    workspace = Path(env.get('GITHUB_WORKSPACE', '')).absolute()
    require(path.parent == workspace and re.fullmatch(r'gha-creds-[a-f0-9]+\.json', path.name)
            and not path.is_symlink() and path.stat().st_size < 100_000, 'ACTION_WIF_CREDENTIALS_REQUIRED')
    value = json.loads(path.read_bytes())
    provider = 'projects/' + m['projectNumber'] + '/locations/global/workloadIdentityPools/jems-dev-operations/providers/github-dev-foundation-plan'
    require(value.get('type') == 'external_account' and value.get('audience') == '//iam.googleapis.com/' + provider
            and value.get('service_account_impersonation_url') ==
            'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/' + ACCOUNT + ':generateAccessToken'
            and value.get('token_url') == 'https://sts.googleapis.com/v1/token'
            and value.get('subject_token_type') == 'urn:ietf:params:oauth:token-type:jwt'
            and env.get('CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE') == str(path), 'DEV_PLANNER_WIF_REQUIRED')
    require(not any(k.startswith(('CLOUDSDK_API_ENDPOINT_OVERRIDES_', 'GOOGLE_ENDPOINT', 'GOOGLE_IMPERSONATE_'))
                    or k in {'GOOGLE_OAUTH_ACCESS_TOKEN', 'GOOGLE_CREDENTIALS', 'CLOUDSDK_AUTH_ACCESS_TOKEN',
                             'CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT'} for k in env), 'AUTH_OVERRIDE_FORBIDDEN')
    require(command(['gcloud','auth','list','--filter=status:ACTIVE','--format=value(account)']).decode().strip() == ACCOUNT,
            'DEV_PLANNER_ACCOUNT_REQUIRED')


class ReadOnlyCloud(foundation.Cloud):
    def __init__(self, m):
        self.manifest, self.identity = m, ACCOUNT

    def command(self, args):
        require(any(tuple(args[:len(p)]) == p for p in READ_PREFIXES), 'DEV_PLANNER_MUTATION_FORBIDDEN')
        # Pinned action WIF already impersonates this exact reader. Never use user ADC.
        return ['gcloud', *args, '--project', PROJECT, '--billing-project', PROJECT, '--format=json', '--quiet']


def build_plan(m, source, run, cloud, now=None):
    observed = foundation.inventory(m, cloud)
    if not observed.get('missingApis'):
        foundation.validate_resource_policies(m, cloud, observed)
    commands = foundation.mutations(m, observed)
    now = now or datetime.now(timezone.utc)
    # Future executor is the existing scoped bootstrap identity, never this reader.
    execution = foundation.Cloud(m)
    return {'version': 1, 'kind': 'dev-foundation-proposal', 'target': m, 'operatorSource': source,
            'runId': run, 'createdAt': now.isoformat(), 'reviewBy': (now+timedelta(hours=1)).isoformat(),
            'inventorySha256': digest(observed), 'inventory': observed,
            'pendingCommands': [execution.command(c) for c in commands],
            'stage': 'api-enablement' if observed.get('missingApis') else 'foundation',
            'infrastructureMutations': 0, 'applySupported': False, 'paidAIActivated': False,
            'requires': 'Explicit exact-plan approval, fresh observation and qualified protected executor; no shell replay'}


def store_plan(m, plan, env):
    metadata = json.loads(command(['gcloud','storage','buckets','describe','gs://'+BUCKET,'--format=json']))
    iam = metadata.get('iamConfiguration', {})
    require(str(metadata.get('project_number', metadata.get('projectNumber'))) == m['projectNumber']
            and str(metadata.get('location', '')).lower() == m['region']
            and metadata.get('uniform_bucket_level_access', iam.get('uniformBucketLevelAccess', {}).get('enabled')) is True
            and metadata.get('public_access_prevention', iam.get('publicAccessPrevention')) == 'enforced',
            'PRIVATE_DEV_PLAN_BUCKET_REQUIRED')
    uri = 'gs://' + BUCKET + '/foundation/' + plan['runId'] + '/plan.json'
    raw = canonical(plan)
    with tempfile.TemporaryDirectory(dir=env.get('RUNNER_TEMP')) as tmp:
        local = Path(tmp)/'plan.json'
        local.write_bytes(raw)
        local.chmod(0o600)
        command(['gcloud','storage','cp',str(local),uri,'--if-generation-match=0','--quiet'])
        require(command(['gcloud','storage','cat',uri]) == raw, 'PRIVATE_PLAN_READBACK_FAILED')
    return {'kind': plan['kind'], 'operatorSource': plan['operatorSource'], 'runId': plan['runId'],
            'stage': plan['stage'], 'planSha256': hashlib.sha256(raw).hexdigest(),
            'pendingCommandCount': len(plan['pendingCommands']), 'privatePlan': uri,
            'reviewBy': plan['reviewBy'], 'infrastructureMutations': 0, 'applySupported': False,
            'paidAIActivated': False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--preflight', action='store_true')
    args = parser.parse_args()
    m, source = context(os.environ)
    main = json.loads(command(['gh','api','repos/'+REPOSITORY+'/branches/main']))
    require(main.get('protected') is True and main.get('commit', {}).get('sha') == source,
            'CURRENT_PROTECTED_MAIN_REQUIRED')
    if args.preflight:
        return 0  # Before authentication; no cloud request.
    credentials(os.environ, m)
    plan = build_plan(m, source, os.environ['GITHUB_RUN_ID'], ReadOnlyCloud(m))
    receipt = store_plan(m, plan, os.environ)
    print(json.dumps(receipt, sort_keys=True))  # No raw metadata, principals or commands.
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (DevError, OSError, ValueError, KeyError, TypeError, subprocess.TimeoutExpired):
        print('DEV_PLAN_FAILED: review protected setup and private evidence; no apply attempted', file=sys.stderr)
        sys.exit(2)
