#!/usr/bin/env python3
"""Protected GitHub transport for the existing integrated TEST saved-plan operator.

Native GCS Terraform state survives runner loss. A separate private CAS snapshot
preserves approval/history/uncertainty receipts. No automatic retry or unlock.
"""
import base64
import json
import os
from pathlib import Path, PurePosixPath
import re
import sys
from types import SimpleNamespace
import urllib.error
import urllib.parse
import urllib.request
import uuid

import integrated_test_stack as stack
from admin_api import NoRedirect
from recover_nonproduction import Stop, command, need, private_path, write_new

PROJECT = stack.PROJECT
NUMBER = '1092405124984'
BUCKET = PROJECT + '-integrated-test-state'
PROVIDER = 'projects/' + NUMBER + '/locations/global/workloadIdentityPools/jems-nonproduction/providers/github-test-infrastructure'
STATE = 'terraform/default.tfstate'
SNAPSHOT = 'operator/state.json'
LOCK = 'operator/lock.json'
LIMIT = 128 * 1024 * 1024
BACKEND = b'terraform {\n  backend "gcs" {}\n}\n'
INIT = ('-backend-config=bucket=' + BUCKET, '-backend-config=prefix=terraform')


def workflow_identity(env):
    mode = env.get('TEST_STACK_OPERATION')
    need(mode in {'plan', 'apply', 'observe'}, 'TEST_STACK_OPERATION_REQUIRED')
    lane = 'apply' if mode == 'apply' else 'plan'
    need(env.get('GITHUB_ACTIONS') == 'true' and env.get('GITHUB_REPOSITORY') == 'jzwyrzyk/family-game-factory'
         and env.get('GITHUB_EVENT_NAME') == 'workflow_dispatch' and env.get('GITHUB_REF') == 'refs/heads/main'
         and env.get('GITHUB_REF_PROTECTED') == 'true' and env.get('GITHUB_RUN_ATTEMPT') == '1'
         and env.get('TEST_STACK_ENVIRONMENT') == 'jems-test-infrastructure-' + lane,
         'PROTECTED_FIRST_ATTEMPT_REQUIRED')
    source = env.get('GITHUB_SHA', '')
    need(re.fullmatch('[a-f0-9]{40}', source) and env.get('TEST_STACK_SOURCE') == source,
         'CURRENT_PROTECTED_SOURCE_REQUIRED')
    need(env.get('GITHUB_WORKFLOW_REF') ==
         'jzwyrzyk/family-game-factory/.github/workflows/jems-test-infrastructure.yml@refs/heads/main',
         'INFRASTRUCTURE_WORKFLOW_REQUIRED')
    need(re.fullmatch('[1-9][0-9]*', env.get('GITHUB_RUN_ID', '')), 'WORKFLOW_RUN_REQUIRED')
    return mode, source, 'jems-test-infra-' + lane + '@' + PROJECT + '.iam.gserviceaccount.com'


def credentials(env, account):
    path = Path(env.get('GOOGLE_APPLICATION_CREDENTIALS', '')).absolute()
    workspace = Path(env.get('GITHUB_WORKSPACE', '')).absolute()
    need(path.parent == workspace and re.fullmatch('gha-creds-[a-f0-9]+\\.json', path.name)
         and not path.is_symlink(), 'ACTION_WIF_CREDENTIALS_REQUIRED')
    value = json.loads(path.read_bytes())
    need(value.get('type') == 'external_account' and value.get('audience') == '//iam.googleapis.com/' + PROVIDER
         and value.get('service_account_impersonation_url') ==
         'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/' + account + ':generateAccessToken'
         and value.get('token_url') == 'https://sts.googleapis.com/v1/token'
         and value.get('subject_token_type') == 'urn:ietf:params:oauth:token-type:jwt',
         'SCOPED_ACTION_WIF_REQUIRED')
    for key in env:
        need(not (key.startswith('TF_') and key not in stack.SAFE_TF_ENV) and
             not key.startswith(('GOOGLE_ENDPOINT', 'CLOUDSDK_API_ENDPOINT_OVERRIDES_', 'GOOGLE_IMPERSONATE_')) and
             key not in {'GOOGLE_OAUTH_ACCESS_TOKEN', 'GOOGLE_CREDENTIALS'}, 'UNREVIEWED_ENVIRONMENT_OVERRIDE')
    need(env.get('CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE') == str(path), 'SCOPED_ACTION_WIF_REQUIRED')
    version = json.loads(command(['terraform', 'version', '-json']))
    need(version.get('terraform_version') == '1.13.5', 'TERRAFORM_VERSION_MISMATCH')
    active = command(['gcloud', 'auth', 'list', '--filter=status:ACTIVE', '--format=value(account)']).decode().strip()
    need(active == account, 'INFRASTRUCTURE_IDENTITY_MISMATCH')
    return command(['gcloud', 'auth', 'print-access-token', '--quiet']).decode().strip()


class Store:
    def __init__(self, token):
        self.token = token
        self.http = urllib.request.build_opener(NoRedirect())

    def request(self, method, path, data=None, missing=False):
        request = urllib.request.Request('https://storage.googleapis.com/' + path, method=method, data=data,
            headers={'Authorization': 'Bearer ' + self.token, 'Content-Type': 'application/json'})
        try:
            with self.http.open(request, timeout=60) as response:
                raw = response.read(LIMIT + 1)
                need(len(raw) <= LIMIT, 'PRIVATE_STATE_TOO_LARGE')
                return raw
        except urllib.error.HTTPError as error:
            if missing and error.code == 404 and method == 'GET':
                return None
            raise Stop('PRIVATE_STATE_HTTP_' + str(error.code)) from None
        except (urllib.error.URLError, TimeoutError):
            raise Stop('PRIVATE_STATE_TRANSPORT_UNCERTAIN') from None

    def verify(self):
        value = json.loads(self.request('GET', 'storage/v1/b/' + BUCKET))
        iam = value.get('iamConfiguration', {})
        need(value.get('name') == BUCKET and value.get('projectNumber') == NUMBER and
             value.get('location') == 'US-EAST5' and
             value.get('versioning', {}).get('enabled') is True and
             iam.get('uniformBucketLevelAccess', {}).get('enabled') is True and
             iam.get('publicAccessPrevention') == 'enforced', 'PRIVATE_VERSIONED_TEST_BUCKET_REQUIRED')

    def read(self, name):
        path = 'storage/v1/b/' + BUCKET + '/o/' + urllib.parse.quote(name, safe='')
        metadata = self.request('GET', path, missing=True)
        if metadata is None:
            return None, '0'
        generation = json.loads(metadata)['generation']
        need(re.fullmatch('[1-9][0-9]*', generation), 'PRIVATE_STATE_GENERATION_REQUIRED')
        return self.request('GET', path + '?alt=media&ifGenerationMatch=' + generation), generation

    def put(self, name, raw, generation):
        need(len(raw) <= LIMIT and re.fullmatch('[0-9]+', generation), 'PRIVATE_STATE_INPUT_INVALID')
        query = urllib.parse.urlencode({'uploadType': 'media', 'name': name, 'ifGenerationMatch': generation})
        result = json.loads(self.request('POST', 'upload/storage/v1/b/' + BUCKET + '/o?' + query, raw))
        successor = result.get('generation', '')
        need(re.fullmatch('[1-9][0-9]*', successor), 'PRIVATE_STATE_COMMIT_UNCERTAIN')
        return successor

    def delete(self, name, generation):
        path = 'storage/v1/b/' + BUCKET + '/o/' + urllib.parse.quote(name, safe='')
        self.request('DELETE', path + '?ifGenerationMatch=' + generation)


def safe_name(name):
    path = PurePosixPath(name)
    return bool(re.fullmatch('[A-Za-z0-9_./-]{1,240}', name)) and not path.is_absolute() and \
        all(part not in {'', '.', '..', '.terraform'} for part in name.split('/')) and \
        path.parts[0] in {'key', 'lock', 'owner.json', 'initialized.json', 'root', 'attempts'} and \
        name not in {'root/terraform.tfstate', 'root/terraform.tfstate.backup'}


def snapshot(home):
    entries = {}
    for path in sorted(home.rglob('*')):
        if '.terraform' in path.relative_to(home).parts:
            continue
        need(not path.is_symlink(), 'UNSAFE_PRIVATE_SNAPSHOT')
        if path.is_dir():
            continue
        name = path.relative_to(home).as_posix()
        need(safe_name(name), 'UNSAFE_PRIVATE_SNAPSHOT')
        entries[name] = base64.b64encode(private_path(path).read_bytes()).decode()
        need(len(entries) <= 10000, 'PRIVATE_STATE_TOO_LARGE')
    raw = json.dumps({'version': 1, 'files': entries}, sort_keys=True, separators=(',', ':')).encode()
    need(len(raw) <= LIMIT, 'PRIVATE_STATE_TOO_LARGE')
    return raw


def restore(home, raw):
    need(not home.exists() and len(raw) <= LIMIT, 'FRESH_PRIVATE_WORKSPACE_REQUIRED')
    value = json.loads(raw)
    need(set(value) == {'version', 'files'} and value['version'] == 1 and
         isinstance(value['files'], dict) and 1 <= len(value['files']) <= 10000, 'PRIVATE_SNAPSHOT_INVALID')
    decoded = []
    for name, content in value['files'].items():
        need(safe_name(name) and isinstance(content, str), 'UNSAFE_PRIVATE_SNAPSHOT')
        decoded.append((name, base64.b64decode(content, validate=True)))
    home.mkdir(mode=0o700)
    for directory in ('root', 'attempts'):
        (home / directory).mkdir(mode=0o700)
    for name, content in decoded:
        path = home / name
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        write_new(path, content)



def rebind_equivalent_source(home, source, files):
    """App/doc-only main advances may replan; changed operator policy cannot migrate implicitly."""
    owner = stack.read_json(private_path(home / 'owner.json'))
    previous = owner.get('source', '')
    need(re.fullmatch('[a-f0-9]{40}', previous), 'STACK_IDENTITY_CHANGED')
    stack.validate_root(home, previous, files)
    need(stack.read_json(private_path(home / 'initialized.json')) == {'source': previous}, 'STACK_IDENTITY_CHANGED')
    if previous == source:
        return
    need(not stack.unresolved(home), 'UNCERTAIN_PRIOR_ATTEMPT')
    policy = ['scripts/ops/' + name + '.py' for name in
              ('github_test_stack', 'integrated_test_stack', 'recover_nonproduction', 'setup_nonproduction', 'admin_api')]
    policy += ['.github/workflows/jems-test-infrastructure.yml']
    policy += [stack.TF_ROOT + '/' + name for name in files if name != 'backend.tf']
    for name in policy:
        need(command(['git', 'show', previous + ':' + name], stack.SOURCE) ==
             command(['git', 'show', source + ':' + name], stack.SOURCE), 'OPERATOR_POLICY_MIGRATION_REQUIRES_REVIEW')
    transition = home / 'attempts' / uuid.uuid4().hex
    transition.mkdir(mode=0o700)
    write_new(transition / 'source-transition.json', {'previousSource': previous, 'source': source,
              'reason': 'Exact operator/workflow/root equivalence; prior plans invalidated'})
    for name, value in [('owner.json', {**owner, 'source': source}), ('initialized.json', {'source': source})]:
        temp = home / (name + '.next')
        write_new(temp, value)
        os.replace(temp, home / name)

def execute(store, home, source, mode, args, secret, owner):
    """Every receipt mutation uses one held CAS lock. Terraform has its own GCS lock."""
    files = {**stack.tracked(source), 'backend.tf': BACKEND}
    reader = lambda: store.read(STATE)[0]
    if mode == 'observe':
        raw, generation = store.read(SNAPSHOT)
        lock, _ = store.read(LOCK)
        state = reader()
        return {'status': 'OBSERVED', 'snapshotGeneration': generation, 'snapshotPresent': raw is not None,
                'lockPresent': lock is not None, 'terraformStateSha256': stack.sha(state) if state else None}
    lock_generation = store.put(LOCK, json.dumps(owner, sort_keys=True).encode(), '0')
    generation = '0'
    def checkpoint():
        nonlocal generation
        generation = store.put(SNAPSHOT, snapshot(home), generation)
    try:
        raw, generation = store.read(SNAPSHOT)
        if raw is None:
            need(mode == 'plan' and reader() is None, 'EXISTING_REMOTE_STATE_WITHOUT_HISTORY')
            stack.initialize(home, source, files, INIT, reader)
        else:
            restore(home, raw)
            rebind_equivalent_source(home, source, files)
            tf = stack.validate_root(home, source, files)
            command(['terraform', 'init', '-input=false', '-lockfile=readonly', *INIT], tf, 'TERRAFORM_INIT', home)
        tf = stack.validate_root(home, source, files)
        if mode == 'plan':
            result = stack.prepare(home, tf, source, args, secret, reader)
        else:
            result = stack.apply(home, tf, source, args, secret, reader, checkpoint)
        checkpoint()
        store.delete(LOCK, lock_generation)
        return {k: v for k, v in result.items() if k not in {'privatePlan', 'privateState', 'outputs'}}
    except BaseException:
        # Never release an uncertain lock. Native Terraform state and the
        # write-ahead receipt survive termination even if this process cannot save.
        # A caught failure before apply can release only after saving its history.
        if home.exists():
            try:
                checkpoint()
                if (home / 'initialized.json').exists() and not stack.unresolved(home):
                    store.delete(LOCK, lock_generation)
            except BaseException:
                pass
        raise


def main():
    os.umask(0o077)
    try:
        mode, source, account = workflow_identity(os.environ)
        own = Path(__file__).resolve()
        need(own.read_bytes() == command(['git', 'show', source + ':scripts/ops/github_test_stack.py'], stack.SOURCE),
             'TRANSPORT_SOURCE_CHANGED')
        need(command(['gh', 'api', 'repos/jzwyrzyk/family-game-factory/git/ref/heads/main',
                      '--jq', '.object.sha']).decode().strip() == source, 'PROTECTED_MAIN_ADVANCED')
        store = Store(credentials(os.environ, account))
        store.verify()
        home = Path(os.environ['RUNNER_TEMP']) / ('jems-integrated-test-' + uuid.uuid4().hex)
        variables = home.with_suffix('.tfvars.json')
        if mode == 'plan':
            inputs = json.loads(os.environ.get('TEST_STACK_VARIABLES', ''))
            need(isinstance(inputs, dict), 'PRIVATE_STAGE_INPUTS_REQUIRED')
            write_new(variables, inputs)
        args = SimpleNamespace(variables=variables, close_funded_trial=os.environ.get('TEST_STACK_CLOSE_TRIAL') == 'true',
            attempt=os.environ.get('TEST_STACK_ATTEMPT', ''), approve_sha256=os.environ.get('TEST_STACK_APPROVAL', ''))
        owner = {'source': source, 'run': os.environ['GITHUB_RUN_ID'], 'nonce': uuid.uuid4().hex, 'operation': mode}
        result = execute(store, home, source, mode, args, os.environ.get('TF_VAR_iap_oauth_secret', ''), owner)
        print(json.dumps(result, sort_keys=True))
    except (Stop, OSError, ValueError, KeyError, TypeError) as error:
        # Exception text and private state never enter public Actions logs.
        code = str(error) if isinstance(error, Stop) and re.fullmatch('[A-Z][A-Z0-9_]{1,100}', str(error)) else 'INTEGRATED_TEST_STOPPED'
        print(code + ': inspect protected inputs and private state; do not replay or unlock an uncertain operation.', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
