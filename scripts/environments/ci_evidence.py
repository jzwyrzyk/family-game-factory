"""Read-only bridge from trusted Arcade receipts to DEV/TEST source eligibility.

Receipt contents are data. No candidate code, imports, shell or artifact payload
executes here. A prospective merge can validate a PR-head preview only when the
current GitHub merge commit has the exact head tree. Otherwise rebase and rerun.
The disconnected site bundle retains its separate derivation and smoke gates.
"""
import base64
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import shlex
import tempfile
import zipfile

REPOSITORY = 'jzwyrzyk/family-game-factory'
REPOSITORY_ID = 1458033181
PREFIX = f'repos/{REPOSITORY}'
WORKFLOW = '.github/workflows/test.yml'
MAX_RECEIPT = 4 * 1024 * 1024
MAX_AGE_SECONDS = 7 * 24 * 60 * 60
SHA = re.compile(r'[0-9a-f]{40}\Z')
DIGEST = re.compile(r'sha256:[0-9a-f]{64}\Z')
STABLE = ('browser', 'learning', 'creative', 'notifications', 'private-coach-image')
CONFIGURATION = 'sha256:' + hashlib.sha256(b'jems-ci-fixtures-v1:no-cloud:no-paid-provider:ubuntu-24.04:node22').hexdigest()


class EvidenceError(ValueError):
    pass


def require(value, reason):
    if not value:
        raise EvidenceError(reason)


def sha(value):
    require(isinstance(value, str) and SHA.fullmatch(value), 'INVALID_CI_SOURCE')
    return value


def positive(value):
    return type(value) is int and value > 0


def same_repo(value):
    return isinstance(value, dict) and value.get('id') == REPOSITORY_ID and value.get('full_name') == REPOSITORY


def timestamp(value):
    require(isinstance(value, str), 'INVALID_CI_TIMESTAMP')
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
        require(parsed.tzinfo is not None, 'INVALID_CI_TIMESTAMP')
        return parsed.timestamp()
    except ValueError:
        raise EvidenceError('INVALID_CI_TIMESTAMP') from None


def parse_json(data):
    def unique(pairs):
        out = {}
        for key, value in pairs:
            require(key not in out, 'DUPLICATE_CI_FIELD')
            out[key] = value
        return out
    try:
        return json.loads(data, object_pairs_hook=unique,
                          parse_constant=lambda _: (_ for _ in ()).throw(EvidenceError('INVALID_CI_JSON')))
    except (ValueError, UnicodeError):
        raise EvidenceError('INVALID_CI_JSON') from None


def commit(api, source):
    result = api.request(f'{PREFIX}/git/commits/{sha(source)}')
    require(result.get('sha') == source, 'CI_COMMIT_IDENTITY_MISMATCH')
    sha(result.get('tree', {}).get('sha'))
    return result


def tree(api, source_commit):
    result = api.request(f"{PREFIX}/git/trees/{source_commit['tree']['sha']}?recursive=1")
    require(result.get('truncated') is False and isinstance(result.get('tree'), list), 'INCOMPLETE_CI_TREE')
    entries = {}
    for row in result['tree']:
        name = row.get('path')
        require(isinstance(name, str) and name and name not in entries, 'INVALID_CI_TREE')
        entries[name] = (row.get('mode'), row.get('type'), sha(row.get('sha')))
    return entries


def policy_path(name):
    return name in (WORKFLOW, 'package.json', 'package-lock.json') or name.startswith('scripts/ci/')


def policy_json(api, entries, name):
    entry = entries.get(name)
    require(entry is not None and entry[:2] == ('100644', 'blob'), 'CI_POLICY_NOT_INSTALLED')
    blob = api.request(f'{PREFIX}/git/blobs/{entry[2]}')
    require(blob.get('sha') == entry[2] and blob.get('encoding') == 'base64', 'CI_POLICY_BLOB_MISMATCH')
    try:
        data = base64.b64decode(blob.get('content', ''), validate=False)
    except (ValueError, TypeError):
        raise EvidenceError('INVALID_CI_POLICY_BLOB') from None
    require(len(data) <= MAX_RECEIPT and hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest() == entry[2], 'CI_POLICY_BLOB_MISMATCH')
    return parse_json(data), 'sha256:' + hashlib.sha256(data).hexdigest()


def commands(entries, scripts, ancestry=()):
    require(isinstance(entries, list) and entries, 'INVALID_CI_COMMAND_POLICY')
    result = []
    for entry in entries:
        require(isinstance(entry, str), 'INVALID_CI_COMMAND_POLICY')
        for part in entry.split('&&'):
            require(not re.search(r'[|;&<>`$\n\r\\]', part), 'INVALID_CI_COMMAND_POLICY')
            try:
                argv = shlex.split(part)
            except ValueError:
                raise EvidenceError('INVALID_CI_COMMAND_POLICY') from None
            require(argv, 'INVALID_CI_COMMAND_POLICY')
            if argv[0] == 'npm':
                require(len(argv) == 3 and argv[1] == 'run' and argv[2].startswith('test:')
                        and argv[2] not in ancestry and argv[2] in scripts
                        and 'pre' + argv[2] not in scripts and 'post' + argv[2] not in scripts, 'INVALID_CI_COMMAND_POLICY')
                result += commands([scripts[argv[2]]], scripts, ancestry + (argv[2],))
            else:
                result.append(argv)
    return result


def required_suites(api, trusted_tree, candidate_tree):
    trusted = {p: value for p, value in trusted_tree.items() if policy_path(p)}
    candidate = {p: value for p, value in candidate_tree.items() if policy_path(p)}
    require(trusted == candidate, 'CI_POLICY_CHANGED_REQUIRES_INTEGRATION')
    require(WORKFLOW in trusted and 'scripts/ci/validation-evidence.mjs' in trusted, 'CI_POLICY_NOT_INSTALLED')
    manifest, manifest_digest = policy_json(api, trusted_tree, 'scripts/ci/suites.json')
    package, _ = policy_json(api, trusted_tree, 'package.json')
    require(manifest.get('schemaVersion') == 1 and isinstance(manifest.get('shards'), dict)
            and manifest['shards'] and isinstance(package.get('scripts'), dict), 'INVALID_CI_MANIFEST')
    suites = {}
    for name, shard in manifest['shards'].items():
        require(re.fullmatch(r'[a-z][a-z0-9-]*', name), 'INVALID_CI_SHARD')
        suites[name] = commands(shard.get('commands'), package['scripts'])
    return suites, manifest_digest


def read_receipt(api, run, source, tested_sha, now):
    rows = api.pages(f"{PREFIX}/actions/runs/{run['id']}/artifacts", 'artifacts')
    found = [a for a in rows if a.get('name') == f'arcade-validation-{tested_sha}-1']
    require(len(found) == 1, 'NO_UNIQUE_FULL_CI_RECEIPT')
    artifact = found[0]
    binding = artifact.get('workflow_run', {})
    require(positive(artifact.get('id')) and artifact.get('expired') is False
            and positive(artifact.get('size_in_bytes')) and artifact['size_in_bytes'] <= MAX_RECEIPT
            and isinstance(artifact.get('digest'), str) and DIGEST.fullmatch(artifact['digest'])
            and binding.get('id') == run['id'] and binding.get('head_sha') == source
            and binding.get('repository_id') == REPOSITORY_ID and binding.get('head_repository_id') == REPOSITORY_ID
            and timestamp(artifact.get('expires_at')) > now
            and timestamp(run.get('run_started_at')) <= timestamp(artifact.get('created_at')) <= timestamp(run.get('updated_at')), 'CI_ARTIFACT_PROVENANCE_MISMATCH')
    with tempfile.TemporaryDirectory(prefix='jems-ci-receipt-') as temp:
        archive = Path(temp) / 'receipt.zip'
        api.download(artifact['id'], archive)
        data = archive.read_bytes()
        require(len(data) <= MAX_RECEIPT and 'sha256:' + hashlib.sha256(data).hexdigest() == artifact['digest'], 'CI_RECEIPT_ARCHIVE_MISMATCH')
        try:
            with zipfile.ZipFile(archive) as payload:
                files = payload.infolist()
                require(len(files) == 1 and files[0].filename == 'validation-evidence.json'
                        and 0 < files[0].file_size <= MAX_RECEIPT and not files[0].is_dir()
                        and ((files[0].external_attr >> 16) & 0o170000) in (0, 0o100000), 'INVALID_CI_RECEIPT_ARCHIVE')
                receipt = parse_json(payload.read(files[0]))
        except (zipfile.BadZipFile, RuntimeError, OSError):
            raise EvidenceError('INVALID_CI_RECEIPT_ARCHIVE') from None
    fresh = api.request(f"{PREFIX}/actions/artifacts/{artifact['id']}")
    require(all(fresh.get(key) == artifact.get(key) for key in ('id', 'name', 'digest', 'expired', 'size_in_bytes', 'created_at', 'expires_at', 'workflow_run')), 'CI_RECEIPT_ARTIFACT_CHANGED')
    return receipt, artifact


def policy_digest(values):
    encoded = json.dumps(values, sort_keys=True, separators=(',', ':')).encode()
    return hashlib.sha256(encoded).hexdigest()


def reviewed_dev_policy(api, trusted_tree, candidate_tree, pr, source_commit):
    """An exact release profile installed on protected main can qualify the held PR."""
    path = 'scripts/environments/reviewed-dev-policy.json'
    if path not in trusted_tree:
        return None
    profile, _ = policy_json(api, trusted_tree, path)
    if (profile.get('pr'), profile.get('source')) != (pr['number'], source_commit['sha']):
        return None
    require(profile.get('schemaVersion') == 1 and profile.get('repository') == REPOSITORY
            and profile.get('tree') == source_commit['tree']['sha'], 'CI_REVIEW_PROFILE_MISMATCH')
    installed = {p: row for p, row in trusted_tree.items() if policy_path(p)}
    reviewed = {p: row for p, row in candidate_tree.items() if policy_path(p)}
    require(policy_digest(installed) == profile.get('installedPolicySha256')
            and policy_digest(reviewed) == profile.get('reviewedPolicySha256'), 'CI_REVIEW_PROFILE_POLICY_DRIFT')
    expected = installed.copy()
    for name, entry in profile['reviewedBlobs'].items():
        require(name in installed and len(entry) == 3 and entry[:2] == ['100644', 'blob'], 'CI_REVIEW_PROFILE_MISMATCH')
        expected[name] = ('100644', 'blob', sha(entry[2]))
    require(expected == reviewed, 'CI_REVIEW_PROFILE_POLICY_DRIFT')
    return expected, profile['reviewedCommandsSha256']


def latest_run(api, source, allowed):
    rows = api.pages(f'{PREFIX}/actions/workflows/test.yml/runs?head_sha={source}', 'workflow_runs')
    eligible = [r for r in rows if r.get('event') in allowed]
    require(eligible and all(positive(r.get('id')) for r in eligible), 'CI_FULL_RUN_MISSING')
    return max(eligible, key=lambda r: (r['id'], r.get('run_attempt', 0)))


def verify_run(api, run, source, tested_commit, current_pr, suites, manifest_digest, now):
    tested = tested_commit['sha']
    require(run.get('head_sha') == source and run.get('path') == WORKFLOW and same_repo(run.get('repository'))
            and same_repo(run.get('head_repository')) and run.get('run_attempt') == 1
            and run.get('status') == 'completed' and run.get('conclusion') == 'success', 'CI_FULL_RUN_NOT_SUCCESSFUL')
    if current_pr is None:
        require(run.get('head_branch') == 'main', 'CI_FULL_RUN_NOT_MAIN')
    elif run['event'] == 'workflow_dispatch':
        require(run.get('head_branch') == current_pr['head'].get('ref'), 'CI_RUN_PR_MISMATCH')
    else:
        matches = [p for p in run.get('pull_requests', []) if p.get('number') == current_pr['number']
                   and p.get('head', {}).get('sha') == source and p.get('base', {}).get('sha') == current_pr['base']['sha']]
        require(len(matches) == 1 and run.get('head_branch') == current_pr['head'].get('ref'), 'CI_RUN_PR_MISMATCH')
    started, completed = timestamp(run.get('run_started_at')), timestamp(run.get('updated_at'))
    require(started <= completed <= now and now - started <= MAX_AGE_SECONDS, 'CI_RUN_EXPIRED')
    jobs = api.pages(f"{PREFIX}/actions/runs/{run['id']}/attempts/1/jobs", 'jobs')
    names = ['prepare', 'image-isolation', 'validation-evidence', *STABLE, *[f'shard ({name})' for name in suites]]
    for name in names:
        selected = [j for j in jobs if j.get('name') == name]
        require(len(selected) == 1, 'CI_JOB_MISSING_OR_DUPLICATED')
        job = selected[0]
        require(job.get('run_id') == run['id'] and job.get('run_attempt') == 1 and job.get('head_sha') == source
                and job.get('status') == 'completed' and job.get('conclusion') == 'success'
                and job.get('runner_group_name') == 'GitHub Actions' and 'ubuntu-24.04' in job.get('labels', [])
                and 'self-hosted' not in job.get('labels', []), 'CI_JOB_NOT_SUCCESSFUL')
    receipt, artifact = read_receipt(api, run, source, tested, now)
    require(isinstance(receipt, dict) and type(receipt.get('schemaVersion')) is int and receipt['schemaVersion'] == 1 and receipt.get('scope') == 'ci-fixtures-full-regression'
            and receipt.get('repository') == REPOSITORY and receipt.get('workflow') == WORKFLOW
            and receipt.get('sourceSha') == tested and receipt.get('runId') == run['id'] and receipt.get('runAttempt') == 1
            and isinstance(receipt.get('identity'), dict) and receipt['identity'].get('sourceSha') == tested
            and receipt['identity'].get('sourceTree') == tested_commit['tree']['sha']
            and receipt.get('manifestSha256') == manifest_digest and receipt.get('configurationSha256') == CONFIGURATION
            and isinstance(receipt.get('buildSha256'), str) and DIGEST.fullmatch(receipt['buildSha256'])
            and started <= timestamp(receipt.get('generatedAt')) <= completed, 'CI_RECEIPT_IDENTITY_MISMATCH')
    actual = receipt.get('suites')
    require(isinstance(actual, list) and len(actual) == len(suites)
            and all(isinstance(r, dict) for r in actual) and {r.get('id') for r in actual} == set(suites), 'CI_RECEIPT_COVERAGE_MISMATCH')
    for row in actual:
        require(row.get('status') == 'success' and row.get('sourceSha') == tested and row.get('buildSha256') == receipt['buildSha256']
                and isinstance(row.get('commands'), list) and all(isinstance(c, dict) for c in row['commands']) and [c.get('command') for c in row['commands']] == suites[row['id']]
                and all(type(c.get('exitCode')) is int and c['exitCode'] == 0 for c in row['commands']), 'CI_RECEIPT_COMMAND_FAILURE')
    return {'scope': 'ci-fixtures-full-regression', 'sourceHeadSha': source, 'testedSha': tested,
            'sourceTree': tested_commit['tree']['sha'], 'runId': run['id'], 'runAttempt': 1,
            'receiptArtifactId': artifact['id'], 'receiptArchiveSha256': artifact['digest'],
            'buildSha256': receipt['buildSha256'], 'manifestSha256': manifest_digest,
            'derivedBundleValidated': False, 'productionAuthorized': False}


def registry_policy(document):
    # Both sources must agree on every governance field. Only the new review
    # dates, explanations and recalculated source digests of the two affected
    # areas are outside this comparison. The required documentation job verifies
    # those digests against the resolved checkout.
    for area in document['areas']:
        if area['id'] in ('delivery', 'validation'):
            for field in ('reviewedAt', 'sourceDigest', 'reviewOutcome', 'reviewReason'):
                del area[field]
    return document


def resolve_conflicted_pr(api, current_pr, main, trusted_tree, source_commit, source_tree, now):
    path = 'scripts/environments/reviewed-dev-policy.json'
    require(path in trusted_tree and current_pr.get('mergeable') is False
            and current_pr.get('mergeable_state') == 'dirty', 'CI_PR_MERGE_UNAVAILABLE')
    profile, _ = policy_json(api, trusted_tree, path)
    expected = reviewed_dev_policy(api, trusted_tree, source_tree, current_pr, source_commit)
    require(expected is not None, 'CI_REVIEW_PROFILE_MISMATCH')
    source = source_commit['sha']
    branch = profile['resolutionBranch']
    require(re.fullmatch(r'ops/[a-z0-9-]+', branch), 'CI_REVIEW_PROFILE_MISMATCH')
    endpoint = f'{PREFIX}/pulls?state=open&base=main&head=jzwyrzyk:{branch}'
    rows = api.pages(endpoint)
    require(len(rows) == 1 and positive(rows[0].get('number')), 'CI_RESOLUTION_PR_MISSING')
    number = rows[0]['number']
    companion = api.request(f'{PREFIX}/pulls/{number}')
    require(companion.get('number') == number and companion.get('state') == 'open'
            and same_repo(companion['head'].get('repo')) and same_repo(companion['base'].get('repo'))
            and companion['head']['ref'] == branch and companion['base']['ref'] == 'main'
            and companion['base']['sha'] == main, 'CI_RESOLUTION_PR_CHANGED')
    resolution = commit(api, companion['head']['sha'])
    require([p['sha'] for p in resolution['parents']] == [source, main], 'CI_RESOLUTION_PARENTS_MISMATCH')
    merged = commit(api, companion['merge_commit_sha'])
    require([p['sha'] for p in merged['parents']] == [main, resolution['sha']]
            and merged['tree'] == resolution['tree'], 'CI_RESOLUTION_MERGE_CHANGED')
    # A new file, omission, mode change or third set of runtime bytes is fatal.
    # The protected baseline is the merge base used to review the policy patch.
    old = tree(api, commit(api, profile['baseline']))
    resolved = tree(api, resolution)
    for key in set(old) | set(trusted_tree) | set(source_tree) | set(resolved):
        before, installed, application, actual = [t.get(key) for t in (old, trusted_tree, source_tree, resolved)]
        if all(row is None or row[1] == 'tree' for row in (before, installed, application, actual)):
            continue
        if application == before or application == installed:
            require(actual == installed, 'CI_RESOLUTION_TREE_MISMATCH')
        elif installed == before:
            require(actual == application, 'CI_RESOLUTION_TREE_MISMATCH')
        elif key == 'docs/context/registry.json':
            require(registry_policy(policy_json(api, resolved, key)[0])
                    == registry_policy(policy_json(api, source_tree, key)[0]), 'CI_RESOLUTION_REGISTRY_CHANGED')
        else:
            require(key in profile['resolvedBlobs'] and actual == ('100644','blob',profile['resolvedBlobs'][key]),
                    'CI_RESOLUTION_TREE_MISMATCH')
    suites, manifest_digest = required_suites(api, expected[0], resolved)
    require(policy_digest(suites) == expected[1], 'CI_REVIEW_PROFILE_COMMAND_DRIFT')
    pr_run = latest_run(api, resolution['sha'], ('pull_request',))
    proof = verify_run(api, pr_run, resolution['sha'], merged, companion, suites, manifest_digest, now)
    head_run = latest_run(api, source, ('workflow_dispatch',))
    require(timestamp(head_run.get('run_started_at')) >= timestamp(pr_run.get('run_started_at')),
            'CI_HEAD_RUN_PREDATES_CURRENT_PR')
    head_proof = verify_run(api, head_run, source, source_commit, current_pr, suites, manifest_digest, now)
    require(latest_run(api, source, ('workflow_dispatch',)) == head_run
            and latest_run(api, resolution['sha'], ('pull_request',)) == pr_run, 'CI_RUN_CHANGED_DURING_VERIFICATION')
    fresh = api.request(f'{PREFIX}/pulls/{number}')
    require(fresh['state'] == 'open' and fresh['head']['sha'] == resolution['sha']
            and fresh['base']['sha'] == main and fresh['merge_commit_sha'] == merged['sha'], 'CI_RESOLUTION_PR_CHANGED')
    head_proof.update(resolutionHeadSha=resolution['sha'], resolutionPr=number, prospectiveMerge=proof)
    return head_proof


def verify_full_ci(api, source, kind, pr_number=None, now=None):
    """Return authenticated full fixture coverage; never production acceptance.

    No legacy success-only fallback: installation without the reviewed receipt
    producer/manifest requests a fresh integrated full run instead of guessing.
    """
    now = datetime.now(timezone.utc).timestamp() if now is None else now
    source = sha(source)
    branch = api.request(f'{PREFIX}/branches/main')
    main = sha(branch.get('commit', {}).get('sha'))
    require(branch.get('protected') is True, 'CI_MAIN_NOT_PROTECTED')
    require(api.request(f'{PREFIX}/git/ref/heads/main').get('object', {}).get('sha') == main, 'CI_MAIN_MOVED')
    current_pr = None
    if kind == 'dev':
        require(positive(pr_number), 'INVALID_CI_PR')
        current_pr = api.request(f'{PREFIX}/pulls/{pr_number}')
        require(current_pr.get('number') == pr_number and current_pr.get('state') == 'open'
                and current_pr.get('head', {}).get('sha') == source and same_repo(current_pr['head'].get('repo'))
                and current_pr.get('base', {}).get('ref') == 'main' and current_pr['base'].get('sha') == main
                and same_repo(current_pr['base'].get('repo')), 'CI_PR_SOURCE_CHANGED')
        if current_pr.get('mergeable') is False and current_pr.get('mergeable_state') == 'dirty':
            source_commit = commit(api, source)
            installed_tree = tree(api, commit(api, main))
            proof = resolve_conflicted_pr(api, current_pr, main, installed_tree, source_commit, tree(api, source_commit), now)
            latest = api.request(f'{PREFIX}/pulls/{pr_number}')
            require(latest.get('state') == 'open' and latest['head']['sha'] == source
                    and latest['base']['sha'] == main and latest.get('mergeable') is False
                    and latest.get('mergeable_state') == 'dirty', 'CI_PR_SOURCE_CHANGED')
            require(api.request(f'{PREFIX}/git/ref/heads/main').get('object', {}).get('sha') == main, 'CI_MAIN_MOVED')
            return proof
        tested = sha(current_pr.get('merge_commit_sha'))
    else:
        require(kind == 'test' and pr_number is None and source == main, 'CI_TEST_NOT_CURRENT_MAIN')
        tested = source
    tested_commit, source_commit = commit(api, tested), commit(api, source)
    if current_pr:
        require([p.get('sha') for p in tested_commit.get('parents', [])] == [main, source], 'CI_MERGE_PARENTS_MISMATCH')
    trusted_tree, candidate_tree = tree(api, commit(api, main)), tree(api, tested_commit)
    profile = reviewed_dev_policy(api, trusted_tree, candidate_tree, current_pr, source_commit) if current_pr else None
    different_tree = tested_commit['tree']['sha'] != source_commit['tree']['sha']
    require(not different_tree or profile is not None, 'CI_MERGE_TREE_DIFFERS_REBASE_REQUIRED')
    expected = profile[0] if profile is not None else trusted_tree
    suites, manifest_digest = required_suites(api, expected, candidate_tree)
    if profile is not None:
        require(policy_digest(suites) == profile[1], 'CI_REVIEW_PROFILE_COMMAND_DRIFT')
    allowed = ('pull_request',) if current_pr else ('push', 'workflow_dispatch')
    run = latest_run(api, source, allowed)
    proof = verify_run(api, run, source, tested_commit, current_pr, suites, manifest_digest, now)
    if different_tree:
        # Each subject proves its own complete build. The PR run binds the current
        # merge/base, and the manual run binds the exact bytes the site will serve.
        required_suites(api, expected, tree(api, source_commit))
        head_run = latest_run(api, source, ('workflow_dispatch',))
        require(timestamp(head_run.get('run_started_at')) >= timestamp(run.get('run_started_at')),
                'CI_HEAD_RUN_PREDATES_CURRENT_PR')
        head_proof = verify_run(api, head_run, source, source_commit, current_pr, suites, manifest_digest, now)
        require(latest_run(api, source, ('workflow_dispatch',)) == head_run, 'CI_RUN_CHANGED_DURING_VERIFICATION')
        head_proof['prospectiveMerge'] = proof
        proof = head_proof
    require(latest_run(api, source, allowed) == run, 'CI_RUN_CHANGED_DURING_VERIFICATION')
    require(api.request(f'{PREFIX}/git/ref/heads/main').get('object', {}).get('sha') == main, 'CI_MAIN_MOVED')
    if current_pr:
        latest = api.request(f'{PREFIX}/pulls/{pr_number}')
        require(latest.get('state') == 'open' and latest.get('head', {}).get('sha') == source
                and latest.get('base', {}).get('sha') == main and latest.get('merge_commit_sha') == tested, 'CI_PR_SOURCE_CHANGED')
    return proof
