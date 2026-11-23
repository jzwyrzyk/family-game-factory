bash <<'JEMS_STAGE'
set -euo pipefail
umask 077
jems_workspace=/home/jzwyrzyk/jems-production-activation.lekdl0n2
jems_helper=$(mktemp "$jems_workspace/release-stage-helper.XXXXXX")
cat > "$jems_helper" <<'JEMS_HELPER'
#!/usr/bin/env python3
"""Default read-only release gate; explicit apply and optional single stage dispatch."""
import argparse, base64, hashlib, importlib, importlib.util, json, os
from pathlib import Path
import re, stat, subprocess, sys, time, urllib.request
sys.dont_write_bytecode = True

WORKSPACE = Path('/home/jzwyrzyk/jems-production-activation.lekdl0n2')
SOURCE = 'aa56b60abe152e750f9f0b5e8949bdb44be53196'
REVIEW_HEAD = '9dbadd86903b15fee0dbccc476396b5033befa56'
RELEASE_COMMIT = '7932580f1af890a5e0d879fe6a8390e86134068e'
RELEASE_TREE = '58c7651973c54b0028a08bd42f388f8d6461e14c'
PLAN_RUN = 45277471765
PUBLISH_RUN = 45256616279
SOURCE_CI = 45250456124
BASE_HELPER_HASH = 'ce50a6d35a45f960cfc3724f5418976397cf24ac23138d946eb34c24ade8ce01'
PUBLICATION_COMPLETION = '9b166d3e39bfe4e9cce94fd0e7158bdc0510db9be8c64b78819dde957e6c7c7f'
VERIFICATION_FOLDER = 'publication-verify-aa56b60abe15-oq2kr6x_'
VERIFICATION_HASH = '35ece7c20fd1d2177b5e4864d2b7475b035c525b247a885c6e9de6d41a14cbb0'
CONTINUITY_HASH = '94582cfa6acd6be26e76544d2d99fd79b25371aeb1e610400654bf474e1a8ca1'
PRIVATE_WORKER = 'dddf53dbc76796be19782c1bb5bbb99b86e99909'
PREFIX = 'repos/jzwyrzyk/family-game-factory/'
FLAG = 'JEMS_CLOUD_RUN_RELEASE_ENABLED'
PUBLISH_FLAG = 'JEMS_IMAGE_PUBLISH_ENABLED'
INTENT_HASH = '37e22d4711e8f63c02807aa79fb06c54feb0cf9e722bb8711735c772dbebea40'
COMPATIBILITY_HASH = '8674dffa96298dc2de7434f05067559c1d56db3feb1a12aa6f71616d1c0413da'
DIGESTS = {
    'coach': 'sha256:67cf3b3b92f83ecf5f107b68c00606cf5bbc946561d13104d37ad929c80575e3',
    'gateway': 'sha256:18c62e421f5a8c4f6fbf4223b2121f979e64cdf7a9d3821ddf03379dad082436',
    'preview': 'sha256:87b6ab7d03dbd9fbd2765b25333b50cb82b838f0cc0c740a529ad9f853b52474',
}

def need(ok, code):
    if not ok: raise ValueError(code)

def sha(raw): return hashlib.sha256(raw).hexdigest()

def load_support():
    info = WORKSPACE.stat()
    need(WORKSPACE.is_dir() and WORKSPACE.resolve() == WORKSPACE.absolute()
         and info.st_uid == os.getuid() and info.st_mode & 0o077 == 0, 'PRIVATE_WORKSPACE_REQUIRED')
    for path in sorted(WORKSPACE.glob('publication-helper.*')):
        info = path.lstat()
        if not (stat.S_ISREG(info.st_mode) and info.st_uid == os.getuid()
                and info.st_mode & 0o077 == 0 and info.st_size <= 100000): continue
        raw = path.read_bytes()
        if sha(raw) != BASE_HELPER_HASH: continue
        spec = importlib.util.spec_from_loader('pinned_publication_support', loader=None)
        module = importlib.util.module_from_spec(spec); module.__file__ = str(path)
        exec(compile(raw, str(path), 'exec'), module.__dict__)
        return module
    raise ValueError('PINNED_PUBLICATION_SUPPORT_NOT_FOUND')

def historical_receipts(base, a):
    activated = base.activation_receipt(a)
    publication = WORKSPACE / ('publication-enable-' + SOURCE[:12]) / 'completion.json'
    base.private_directory(publication.parent)
    need(sha(a.diagnostic.read_file(publication)) == PUBLICATION_COMPLETION, 'PUBLICATION_COMPLETION_CHANGED')
    directory = WORKSPACE / VERIFICATION_FOLDER; base.private_directory(directory)
    raw = a.diagnostic.read_file(directory / 'completion.json')
    need(sha(raw) == VERIFICATION_HASH, 'VERIFICATION_COMPLETION_CHANGED')
    verified = json.loads(raw)
    need(verified['status'] == 'READ_ONLY_VERIFICATION_COMPLETE' and verified['source'] == SOURCE
         and verified['publicationRun'] == PUBLISH_RUN and len(verified['checks']) == 18
         and all(value == 'VERIFIED' for value in verified['checks'].values())
         and verified['mutations'] == 0, 'PUBLICATION_VERIFICATION_INCOMPLETE')
    need(set(verified['images']) == set(DIGESTS), 'IMAGE_SCOPE_CHANGED')
    for kind, digest in DIGESTS.items():
        row = verified['images'][kind]
        need(row['manifestDigest'] == digest and row['sourceLabel'] == SOURCE
             and row['signedProvenanceVerified'] is True and row['tagAndSourceLabelVerified'] is True,
             'IMAGE_VERIFICATION_CHANGED')
    need(set(verified['serviceBaselinesMatched']) == set(a.review.release.SERVICES)
         and all(value is True for value in verified['serviceBaselinesMatched'].values()), 'BASELINE_VERIFICATION_CHANGED')
    return activated

def controls(a, api, enabled=False):
    repo = api.get(PREFIX.rstrip('/'))
    need(repo['id'] == 1458033181 and repo['owner']['id'] == 356692244 and repo['owner']['type'] == 'User'
         and repo['default_branch'] == 'main' and repo.get('permissions', {}).get('admin'), 'REPOSITORY_IDENTITY_CHANGED')
    branch = api.get(PREFIX + 'branches/main')
    need(branch['protected'] and branch['commit']['sha'] == RELEASE_COMMIT, 'PROTECTED_MAIN_CHANGED')
    rules = json.loads((a.review.ROOT / 'ops/github-main-ruleset.json').read_text())
    named = [r for r in api.pages(PREFIX + 'rulesets?includes_parents=true') if r['name'] == rules['name']]
    need(len(named) == 1, 'MAIN_RULESET_CHANGED')
    actual = api.get(PREFIX + f"rulesets/{named[0]['id']}?includes_parents=false")
    need(a.admin_setup.exact_rules(actual, rules), 'MAIN_RULESET_CHANGED')
    effective = api.pages(PREFIX + 'rules/branches/main')
    need({r['type'] for r in effective} == {r['type'] for r in rules['rules']}
         and all(r.get('ruleset_id') == named[0]['id'] for r in effective), 'MAIN_PROTECTION_CHANGED')
    values = {v['name']: v['value'] for v in api.pages(PREFIX + 'actions/variables', 'variables')}
    need(all(values.get(key) == value for key, value in a.review.VARIABLES.items()), 'LANE_VARIABLES_CHANGED')
    expected = {PUBLISH_FLAG: 'true', **({FLAG: 'true'} if enabled else {})}
    need({key: values[key] for key in a.review.FLAGS if key in values} == expected, 'ENABLE_FLAG_STATE_CHANGED')
    for environment in a.admin_setup.ENVIRONMENTS:
        path = PREFIX + 'environments/' + environment; value = api.get(path)
        need(value.get('deployment_branch_policy') == a.admin_setup.SELECTED_BRANCH
             and all(p['type'] == 'branch_policy' for p in value.get('protection_rules', [])), 'ENVIRONMENT_CHANGED')
        branches = api.pages(path + '/deployment-branch-policies', 'branch_policies')
        need(len(branches) == 1 and branches[0]['name'] == 'main' and branches[0]['type'] == 'branch', 'ENVIRONMENT_REF_CHANGED')
        need(not any(v['name'] in set(a.review.FLAGS) | set(a.review.VARIABLES)
                     for v in api.pages(path + '/variables', 'variables')), 'ENVIRONMENT_VARIABLE_SHADOW')
    return rules

def github_file(api, path, ref):
    value = api.get(PREFIX + 'contents/' + path + '?ref=' + ref)
    need(value.get('encoding') == 'base64' and value['size'] <= 256000, 'REVIEWED_FILE_UNAVAILABLE')
    return base64.b64decode(''.join(value['content'].split()), validate=True)

def run_gate(api, ident, source, workflow, event, active_jobs):
    run = api.get(PREFIX + f'actions/runs/{ident}')
    need(run['id'] == ident and run['head_sha'] == source and run['head_branch'] == 'main'
         and run['path'] == '.github/workflows/' + workflow and run['event'] == event
         and run['run_attempt'] == 1 and run['status'] == 'completed' and run['conclusion'] == 'success'
         and run['head_repository']['full_name'] == 'jzwyrzyk/family-game-factory', 'PINNED_RUN_CHANGED')
    jobs = {j['name']: j for j in api.pages(PREFIX + f'actions/runs/{ident}/jobs?filter=latest', 'jobs')}
    need(set(jobs) == {'verify-identity', 'verify-access'} | active_jobs | ({'transition'} if workflow == 'jems-cloud-run-release.yml' else set()), 'PINNED_JOB_INVENTORY_CHANGED')
    need(all(row['conclusion'] == ('success' if name in active_jobs else 'skipped') for name, row in jobs.items()), 'PINNED_JOB_NOT_SUCCESSFUL')
    if 'plan' in active_jobs:
        need(any(step['name'] == 'Validate reviewed intent and source' and step['conclusion'] == 'success'
                 for step in jobs['plan']['steps']), 'RELEASE_PLAN_NOT_VERIFIED')
    return {'run_id': ident, 'attempt': 1, 'jobs': {name: row['id'] for name, row in jobs.items()}}

def reviewed_release(base, a, api, activated):
    rules = controls(a, api)
    commit = api.get(PREFIX + 'git/commits/' + RELEASE_COMMIT)
    need(commit['sha'] == RELEASE_COMMIT and commit['tree']['sha'] == RELEASE_TREE
         and [parent['sha'] for parent in commit['parents']] == [SOURCE, REVIEW_HEAD], 'REVIEWED_MERGE_CHANGED')
    reviewed = api.get(PREFIX + 'git/commits/' + REVIEW_HEAD)
    need(reviewed['tree']['sha'] == RELEASE_TREE, 'REVIEWED_TREE_CHANGED')
    pull = api.get(PREFIX + 'pulls/142')
    need(pull['merged'] is True and pull['merge_commit_sha'] == RELEASE_COMMIT
         and pull['head']['sha'] == REVIEW_HEAD and pull['base']['sha'] == SOURCE, 'REVIEWED_PR_CHANGED')
    source = api.get(PREFIX + 'git/commits/' + SOURCE)
    need(source['tree']['sha'] == base.TREE and source['parents'][0]['sha'] == base.ACTIVATED_SOURCE, 'APPLICATION_SOURCE_CHANGED')
    comparison = api.get(PREFIX + f'compare/{SOURCE}...{RELEASE_COMMIT}')
    need(comparison['status'] == 'ahead' and comparison['merge_base_commit']['sha'] == SOURCE
         and {row['filename'] for row in comparison['files']} == {
             'ops/release.json', 'ops/compatibility.json', 'scripts/ops/test_activation_execute.py',
             'DELIVERY-STATE.md', 'docs/context/registry.json'}
         and all(row['status'] == 'modified' for row in comparison['files']), 'RELEASE_DIFF_CHANGED')
    for path in ('.github/workflows/jems-service-images.yml', '.github/workflows/jems-cloud-run-release.yml',
                 '.github/workflows/test.yml', 'scripts/ops/release.py', 'scripts/ops/verify_release_access.py',
                 'scripts/ops/oidc_claims.py', 'ops/github-main-ruleset.json'):
        need(sha(github_file(api, path, RELEASE_COMMIT)) == a.SOURCE_HASHES[path], 'RELEASE_EXECUTABLE_CHANGED')
    raw_intent = github_file(api, 'ops/release.json', RELEASE_COMMIT)
    raw_compatibility = github_file(api, 'ops/compatibility.json', RELEASE_COMMIT)
    need(sha(raw_intent) == INTENT_HASH and sha(raw_compatibility) == COMPATIBILITY_HASH, 'RELEASE_INTENT_CHANGED')
    intent, compatibility = json.loads(raw_intent), json.loads(raw_compatibility)
    need(intent['operation'] == 'stage' and intent['source'] == SOURCE and intent['service'] == 'factory-coach-private'
         and intent['image'].endswith('/coach@' + DIGESTS['coach']) and intent['compatibility'] == COMPATIBILITY_HASH
         and compatibility['evidence'] == f'https://github.com/jzwyrzyk/family-game-factory/actions/runs/{SOURCE_CI}', 'RELEASE_SCOPE_CHANGED')
    # The protected PR head has exactly R's tree. App S also has its own green
    # main CI; the separate R push plan below validates the actual merged intent.
    checks = api.pages(PREFIX + f'commits/{REVIEW_HEAD}/check-runs?filter=latest', 'check_runs')
    required = next(rule['parameters']['required_status_checks'] for rule in rules['rules'] if rule['type'] == 'required_status_checks')
    need(len(required) == 6, 'REQUIRED_CHECK_SCOPE_CHANGED')
    for entry in required:
        matching = [r for r in checks if r['name'] == entry['context'] and r['app']['id'] == entry['integration_id'] and r['app']['slug'] == 'github-actions']
        need(max(matching, key=lambda r: r['id'], default={}).get('conclusion') == 'success', 'RELEASE_CHECK_NOT_GREEN')
    ci = api.get(PREFIX + f'actions/runs/{SOURCE_CI}')
    need(ci['head_sha'] == SOURCE and ci['head_branch'] == 'main' and ci['event'] == 'push'
         and ci['path'] == '.github/workflows/test.yml' and ci['conclusion'] == 'success', 'SOURCE_CI_CHANGED')
    proofs = [base.proof_jobs(a, api, lane, mode, run, activated['verified_at'])
              for lane, modes in base.RUNS.items() for mode, run in modes.items()]
    publication = run_gate(api, PUBLISH_RUN, SOURCE, 'jems-service-images.yml', 'workflow_dispatch', {'build', 'publish'})
    planned = run_gate(api, PLAN_RUN, RELEASE_COMMIT, 'jems-cloud-run-release.yml', 'push', {'plan'})
    release_runs = api.pages(PREFIX + 'actions/workflows/jems-cloud-run-release.yml/runs?per_page=100', 'workflow_runs')
    need(all(run['status'] == 'completed' for run in release_runs)
         and {run['id'] for run in release_runs if run['head_sha'] == RELEASE_COMMIT} == {PLAN_RUN},
         'OTHER_RELEASE_ATTEMPT_REQUIRES_REVIEW')
    return {'source': SOURCE, 'release_commit': RELEASE_COMMIT, 'release_tree': RELEASE_TREE,
            'intent': intent, 'compatibility': compatibility, 'publication': publication,
            'plan_run': planned, 'proofs': proofs, 'verification_receipt_sha256': VERIFICATION_HASH}

def current_cloud(a, activated):
    observer_module = importlib.import_module('verify_release_access')
    env = {**os.environ, 'CLOUDSDK_CORE_LOG_HTTP': 'false', 'CLOUDSDK_CORE_DISABLE_PROMPTS': '1', 'PYTHONDONTWRITEBYTECODE': '1'}
    def command(args):
        result = subprocess.run(args, env=env, capture_output=True, stdin=subprocess.DEVNULL, timeout=600)
        need(result.returncode == 0, 'CURRENT_CLOUD_READ_FAILED')
        return result.stdout.decode().strip()
    observer = observer_module.Google(command(['gcloud', 'auth', 'print-access-token', '--quiet']))
    identity = observer.identity()
    need(identity.get('verified_email') is True and identity.get('email') == command(['gcloud', 'config', 'get-value', 'account']), 'OPERATOR_IDENTITY_UNVERIFIED')
    actual = []
    for expected in activated['service_baselines']:
        def get(method, resource):
            need(method == 'GET', 'CLOUD_MUTATION_REJECTED')
            return observer.get('https://run.googleapis.com/v2/' + resource)
        value = a.review.release.inspect_service(expected['service'], get)
        need(all(value[key] == expected[key] for key in value) and value['matchesServingConfiguration'] is True, 'SERVING_BASELINE_CHANGED')
        actual.append(value)
    recovery = observer_module.permission_check(observer, 'operator_coach_recovery',
        'https://run.googleapis.com/v2/projects/family-game-factory-jzw/locations/us-east5/services/factory-coach-private:testIamPermissions',
        {'run.services.get', 'run.services.update'}, set())
    observer_module.permission_check(observer, 'operator_operation_read',
        'https://cloudresourcemanager.googleapis.com/v3/projects/1054529152893:testIamPermissions', {'run.operations.get'}, set())
    helper = WORKSPACE / VERIFICATION_FOLDER / 'continuity.py'
    need(sha(a.diagnostic.read_file(helper)) == CONTINUITY_HASH, 'CONTINUITY_HELPER_CHANGED')
    continuity = json.loads(command([sys.executable, str(helper), '--private-worker-sha', PRIVATE_WORKER,
                                    '--expect-generation', 'active', '--inspect-private-config']))
    need(continuity['result'] == 'CURRENT_STATE_VERIFIED' and continuity['mutations'] == 0, 'CONTINUITY_CHANGED')
    return {'baselines': actual, 'continuity': continuity, 'operator_identity_verified': True, 'recovery_permissions': recovery}

def create_flag(api):
    request = urllib.request.Request(api.http.origin + '/' + PREFIX + 'actions/variables', method='POST',
        data=json.dumps({'name': FLAG, 'value': 'true'}).encode(), headers={**api.http.headers, 'Content-Type': 'application/json'})
    with api.http.opener.open(request, timeout=25) as response:
        need(response.code == 201, 'CREATE_RESULT_UNCERTAIN')
        return {'http_status': 201}

def dispatch_stage(a, api, output):
    controls(a, api, enabled=True)
    runs_path = PREFIX + 'actions/workflows/jems-cloud-run-release.yml/runs?branch=main&event=workflow_dispatch&head_sha=' + RELEASE_COMMIT
    need(not api.pages(runs_path, 'workflow_runs'), 'PRIOR_STAGE_DISPATCH_REQUIRES_REVIEW')
    payload = {'ref': 'main', 'inputs': {'verify_identity': 'false', 'verify_access': 'false'}}
    a.review.private_json(output / 'dispatch.intent.json', {'release_commit': RELEASE_COMMIT,
        'operation': 'stage', 'service': 'factory-coach-private', 'payload': payload, 'observed_at': a.utc()})
    request = urllib.request.Request(api.http.origin + '/' + PREFIX + 'actions/workflows/jems-cloud-run-release.yml/dispatches',
        method='POST', data=json.dumps(payload).encode(), headers={**api.http.headers, 'Content-Type': 'application/json'})
    with api.http.opener.open(request, timeout=25) as response:
        need(response.code == 204, 'DISPATCH_RESULT_UNCERTAIN')
    a.review.private_json(output / 'dispatch.response.json', {'http_status': 204, 'observed_at': a.utc()})
    for attempt in range(4):
        runs = api.pages(runs_path, 'workflow_runs')
        if runs: break
        if attempt < 3: time.sleep(5)
    need(len(runs) == 1, 'DISPATCH_RUN_NOT_UNIQUELY_OBSERVED')
    run = runs[0]
    need(run['head_sha'] == RELEASE_COMMIT and run['head_branch'] == 'main' and run['run_attempt'] == 1
         and run['event'] == 'workflow_dispatch' and run['path'] == '.github/workflows/jems-cloud-run-release.yml'
         and run['head_repository']['full_name'] == 'jzwyrzyk/family-game-factory', 'DISPATCH_RUN_CHANGED')
    result = {'status': 'STAGE_DISPATCH_RECORDED', 'release_commit': RELEASE_COMMIT,
              'source': SOURCE, 'run_id': run['id'], 'workflow_status': run['status'],
              'url': 'https://github.com/jzwyrzyk/family-game-factory/actions/runs/' + str(run['id']),
              'operation': 'stage', 'service': 'factory-coach-private', 'private_output': str(output),
              'limit': 'Dispatch is not deployment success. This stage intent retains baseline traffic at 100%.'}
    a.review.private_json(output / 'dispatch.completion.json', result)
    return result

def main():
    parser = argparse.ArgumentParser(description=__doc__); parser.add_argument('--apply', action='store_true')
    parser.add_argument('--dispatch-stage', action='store_true'); args = parser.parse_args()
    phase = 'PIN_VALIDATION'; a = None; output = None; api = None
    try:
        need(re.fullmatch(r'[a-f0-9]{40}', RELEASE_COMMIT) and RELEASE_COMMIT != '0' * 40
             and type(PLAN_RUN) is int and PLAN_RUN > 0, 'RELEASE_PINS_NOT_POPULATED')
        need(not args.dispatch_stage or args.apply, 'DISPATCH_REQUIRES_APPLY')
        base = load_support(); a = base.support(); activated = historical_receipts(base, a)
        print('Saved receipts verified; checking the merged intent and release controls.', file=sys.stderr, flush=True)
        output = WORKSPACE / ('release-enable-' + RELEASE_COMMIT[:12])
        if not output.exists(): output.mkdir(mode=0o700)
        base.private_directory(output)
        need(not os.path.lexists(output / 'create.intent.json'), 'PRIOR_CREATE_ATTEMPT_REQUIRES_RECONCILIATION')
        disk = os.statvfs(output); need(disk.f_bavail * disk.f_frsize >= 32 * 1024 * 1024 and disk.f_favail >= 64, 'INSUFFICIENT_RECEIPT_SPACE')
        phase = 'READ_ONLY_GATES'; api = base.GitHub(a)
        plan = reviewed_release(base, a, api, activated)
        print('Merged intent verified; checking live baselines, continuity and recovery access.', file=sys.stderr, flush=True)
        plan['cloud'] = current_cloud(a, activated)
        recovery = {**plan['intent'], 'operation': 'rollback'}
        plan.update(observed_at=a.utc(), helper_sha256=sha(Path(__file__).read_bytes()),
                    create={'name': FLAG, 'value': 'true'}, recovery_intent=recovery)
        controls(a, api)
        a.review.private_json(output / f'checks-{time.time_ns()}.json', {'plan': plan, 'observations': api.evidence})
        if not args.apply:
            print(json.dumps({'status': 'RELEASE_FLAG_CHECKED_NOT_ENABLED', 'release_commit': RELEASE_COMMIT, 'private_output': str(output)})); return
        a.review.private_json(output / 'rollback.json', recovery)
        need(a.review.release.read_intent(output / 'rollback.json') == recovery, 'RECOVERY_INTENT_INVALID')
        print('Live checks passed; recording the single release-flag change.', file=sys.stderr, flush=True)
        phase = 'CREATE_OUTCOME_UNVERIFIED'
        a.review.private_json(output / 'create.intent.json', plan)
        a.review.private_json(output / 'create.response.json', create_flag(api))
        observed = api.get(PREFIX + 'actions/variables/' + FLAG)
        need(observed['name'] == FLAG and observed['value'] == 'true', 'FLAG_READBACK_MISMATCH')
        controls(a, api, enabled=True)
        result = {'status': 'RELEASE_FLAG_ENABLED_NO_DISPATCH', 'source': SOURCE, 'release_commit': RELEASE_COMMIT,
                  'operation': 'stage', 'service': 'factory-coach-private', 'observed_at': a.utc(),
                  'private_output': str(output), 'verification_receipt_sha256': VERIFICATION_HASH}
        a.review.private_json(output / 'completion.json', {'summary': result, 'flag_readback': observed, 'observations': api.evidence})
        result['completion_sha256'] = sha((output / 'completion.json').read_bytes())
        print(json.dumps(result, indent=2), flush=True)
        if args.dispatch_stage:
            phase = 'DISPATCH_OUTCOME_UNVERIFIED'
            print(json.dumps(dispatch_stage(a, api, output), indent=2))
    except (Exception, KeyboardInterrupt) as error:
        if a is not None and output is not None and output.is_dir():
            try: a.review.private_json(output / f'error-{time.time_ns()}.json', {'phase': phase, 'type': type(error).__name__, 'observations': api.evidence if api else []})
            except Exception: pass
        code = str(error) if isinstance(error, ValueError) and re.fullmatch(r'[A-Z][A-Z0-9_]{1,79}', str(error)) else type(error).__name__
        print(json.dumps({'status': 'STOPPED', 'phase': phase, 'code': code, 'instruction': 'Preserve this directory and every receipt. No automatic retry or dispatch.'}))
        raise SystemExit(2) from None

if __name__ == '__main__': main()
JEMS_HELPER
PYTHONDONTWRITEBYTECODE=1 python3 - "$jems_helper" <<'JEMS_VERIFY'
import hashlib, pathlib, sys
path = pathlib.Path(sys.argv[1])
raw = path.read_bytes()
if hashlib.sha256(raw).hexdigest() != '2ea4387f7a857a0ded7928ee35651f6c1ee88604c9a75c67ceca5976df7e220c':
    print('STOPPED: pasted helper checksum mismatch; nothing was executed.')
    raise SystemExit(2)
sys.argv = [str(path), '--apply', '--dispatch-stage']
exec(compile(raw, str(path), 'exec'), {'__name__': '__main__', '__file__': str(path)})
JEMS_VERIFY
JEMS_STAGE
