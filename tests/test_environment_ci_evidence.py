"""Read-only hosted CI bridge tests; API objects and ZIPs are synthetic."""
import base64
import copy
from datetime import datetime, timezone
import hashlib
import io
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts/environments'))
import ci_evidence as ci

HEAD, MAIN, MERGE, TREE, MAIN_TREE = [c * 40 for c in 'abcde']
NOW = 1795478400.0
REPO = {'id': ci.REPOSITORY_ID, 'full_name': ci.REPOSITORY}


def date(offset):
    return datetime.fromtimestamp(NOW + offset, timezone.utc).isoformat()


def blob(data):
    return hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()


class API:
    def __init__(self, kind='dev', event=None):
        self.kind = kind
        self.main = MAIN if kind == 'dev' else HEAD
        self.protected = True
        self.pr = {'number': 12, 'state': 'open', 'merge_commit_sha': MERGE,
                   'head': {'sha': HEAD, 'ref': 'feature', 'repo': copy.deepcopy(REPO)},
                   'base': {'sha': MAIN, 'ref': 'main', 'repo': copy.deepcopy(REPO)}}
        self.tested = MERGE if kind == 'dev' else HEAD
        self.commits = {HEAD: {'sha': HEAD, 'tree': {'sha': TREE}, 'parents': [{'sha': MAIN}]},
                        MAIN: {'sha': MAIN, 'tree': {'sha': MAIN_TREE}, 'parents': []},
                        MERGE: {'sha': MERGE, 'tree': {'sha': TREE}, 'parents': [{'sha': MAIN}, {'sha': HEAD}]}}
        self.package = {'scripts': {'test:a': 'node tests/a.cjs', 'test:b': 'node tests/b.cjs && npm run test:a'}}
        self.manifest = {'schemaVersion': 1, 'shards': {'alpha': {'commands': ['npm run test:b']}, 'beta': {'commands': ['node tests/c.cjs']}}}
        self.blobs = {}
        entries = []
        for name, value in {'package.json': json.dumps(self.package), 'package-lock.json': '{}',
                            ci.WORKFLOW: 'trusted workflow', 'scripts/ci/validation-evidence.mjs': 'trusted receipt writer',
                            'scripts/ci/suites.json': json.dumps(self.manifest)}.items():
            data = value.encode(); oid = blob(data)
            self.blobs[oid] = {'sha': oid, 'encoding': 'base64', 'content': base64.b64encode(data).decode()}
            entries.append({'path': name, 'mode': '100644', 'type': 'blob', 'sha': oid})
        self.trees = {TREE: {'truncated': False, 'tree': copy.deepcopy(entries)}, MAIN_TREE: {'truncated': False, 'tree': copy.deepcopy(entries)}}
        self.manifest_digest = 'sha256:' + hashlib.sha256(json.dumps(self.manifest).encode()).hexdigest()
        self.run = {'id': 50, 'run_attempt': 1, 'event': event or ('pull_request' if kind == 'dev' else 'push'),
                    'path': ci.WORKFLOW, 'head_sha': HEAD, 'head_branch': 'feature' if kind == 'dev' else 'main',
                    'repository': copy.deepcopy(REPO), 'head_repository': copy.deepcopy(REPO),
                    'status': 'completed', 'conclusion': 'success', 'run_started_at': date(-120), 'updated_at': date(-10),
                    'pull_requests': [{'number': 12, 'head': {'sha': HEAD}, 'base': {'sha': MAIN}}]}
        self.runs = [self.run]
        names = ['prepare', 'image-isolation', 'validation-evidence', *ci.STABLE, 'shard (alpha)', 'shard (beta)']
        self.jobs = [{'name': name, 'run_id': 50, 'run_attempt': 1, 'head_sha': HEAD, 'status': 'completed',
                     'conclusion': 'success', 'runner_group_name': 'GitHub Actions', 'labels': ['ubuntu-24.04']} for name in names]
        self.receipt = {'schemaVersion': 1, 'scope': 'ci-fixtures-full-regression', 'repository': ci.REPOSITORY,
                        'workflow': ci.WORKFLOW, 'sourceSha': self.tested, 'runId': 50, 'runAttempt': 1,
                        'identity': {'sourceSha': self.tested, 'sourceTree': TREE}, 'manifestSha256': self.manifest_digest,
                        'configurationSha256': ci.CONFIGURATION, 'buildSha256': 'sha256:' + '1' * 64,
                        'generatedAt': date(-30), 'suites': []}
        for name, value in self.manifest['shards'].items():
            self.receipt['suites'].append({'id': name, 'status': 'success', 'sourceSha': self.tested,
                'buildSha256': self.receipt['buildSha256'],
                'commands': [{'command': cmd, 'exitCode': 0} for cmd in ci.commands(value['commands'], self.package['scripts'])]})
        self.zip_bytes = b''; self.artifacts = []; self.downloads = []; self.reads = []
        self.after_download = None
        self.archive()

    def archive(self, entries=None):
        data = io.BytesIO()
        with zipfile.ZipFile(data, 'w') as out:
            for name, content in (entries or [('validation-evidence.json', json.dumps(self.receipt))]):
                out.writestr(name, content)
        self.zip_bytes = data.getvalue()
        self.artifacts = [{'id': 200, 'name': f'arcade-validation-{self.tested}-1', 'expired': False,
            'size_in_bytes': len(self.zip_bytes), 'digest': 'sha256:' + hashlib.sha256(self.zip_bytes).hexdigest(),
            'created_at': date(-20), 'expires_at': date(3600), 'workflow_run': {'id': 50, 'head_sha': HEAD,
                'repository_id': ci.REPOSITORY_ID, 'head_repository_id': ci.REPOSITORY_ID}}]

    def request(self, endpoint):
        self.reads.append(endpoint)
        if endpoint.endswith('/branches/main'):
            return {'protected': self.protected, 'commit': {'sha': self.main}}
        if endpoint.endswith('/git/ref/heads/main'):
            return {'object': {'sha': self.main}}
        if endpoint.endswith('/actions/artifacts/200'):
            return copy.deepcopy(self.artifacts[0])
        if endpoint.endswith('/pulls/12'):
            return copy.deepcopy(self.pr)
        if '/git/commits/' in endpoint:
            return copy.deepcopy(self.commits[endpoint.split('/')[-1]])
        if '/git/trees/' in endpoint:
            return copy.deepcopy(self.trees[endpoint.split('/')[-1].split('?')[0]])
        if '/git/blobs/' in endpoint:
            return copy.deepcopy(self.blobs[endpoint.split('/')[-1]])
        raise AssertionError(endpoint)

    def pages(self, endpoint, key):
        self.reads.append(endpoint)
        if '/workflows/test.yml/' in endpoint:
            return copy.deepcopy(self.runs)
        if endpoint.endswith('/attempts/1/jobs'):
            return copy.deepcopy(self.jobs)
        if endpoint.endswith('/artifacts'):
            return copy.deepcopy(self.artifacts)
        raise AssertionError(endpoint)

    def download(self, identifier, target):
        assert identifier == 200
        self.downloads.append(identifier)
        target.write_bytes(self.zip_bytes)
        if self.after_download:
            self.after_download()


def verify(api):
    return ci.verify_full_ci(api, HEAD, api.kind, 12 if api.kind == 'dev' else None, now=NOW)


class FullCITests(unittest.TestCase):
    def test_current_pr_exact_merge_tree_authenticates_full_receipt_without_executing_source(self):
        api = API()
        proof = verify(api)
        self.assertEqual(proof['testedSha'], MERGE)
        self.assertEqual(proof['sourceHeadSha'], HEAD)
        self.assertEqual(proof['sourceTree'], TREE)
        self.assertFalse(proof['derivedBundleValidated'])
        self.assertFalse(proof['productionAuthorized'])
        self.assertEqual(api.downloads, [200])
        self.assertTrue(all(endpoint.startswith(ci.PREFIX + '/') for endpoint in api.reads))

    def test_current_main_push_and_explicit_full_manual_are_supported(self):
        for event in ('push', 'workflow_dispatch'):
            with self.subTest(event=event):
                proof = verify(API('test', event))
                self.assertEqual(proof['testedSha'], HEAD)

    def test_source_head_api_metadata_cannot_be_relabeled_as_checkout_merge_sha(self):
        api = API(); api.receipt['sourceSha'] = HEAD; api.archive()
        with self.assertRaisesRegex(ci.EvidenceError, 'RECEIPT_IDENTITY'):
            verify(api)
        api = API(); api.artifacts[0]['name'] = f'arcade-validation-{HEAD}-1'
        with self.assertRaisesRegex(ci.EvidenceError, 'NO_UNIQUE_FULL_CI_RECEIPT'):
            verify(api)

    def test_changed_merge_tree_requires_rebase_instead_of_equivalence_claim(self):
        api = API(); api.commits[MERGE]['tree']['sha'] = MAIN_TREE
        with self.assertRaisesRegex(ci.EvidenceError, 'REBASE_REQUIRED'):
            verify(api)
        self.assertEqual(api.downloads, [])

    def test_missing_or_stale_pr_base_head_merge_and_foreign_fork_are_rejected(self):
        mutations = [lambda a: a.pr.update(state='closed'), lambda a: a.pr.update(merge_commit_sha=None),
            lambda a: a.pr['head'].update(sha=MAIN), lambda a: a.pr['base'].update(sha=HEAD),
            lambda a: a.pr['head']['repo'].update(id=9), lambda a: a.pr['base']['repo'].update(full_name='fork/repo'),
            lambda a: a.commits[MERGE].update(parents=[{'sha': HEAD}, {'sha': MAIN}]),
            lambda a: a.run['pull_requests'][0]['base'].update(sha=HEAD),
            lambda a: a.run['pull_requests'][0].update(number=13), lambda a: a.run.update(head_branch='other')]
        for mutate in mutations:
            api = API(); mutate(api)
            with self.subTest(mutation=mutate), self.assertRaises(ci.EvidenceError):
                verify(api)

    def test_policy_not_installed_modified_writer_or_new_ci_path_are_rejected(self):
        for path in (ci.WORKFLOW, 'scripts/ci/validation-evidence.mjs', 'scripts/ci/suites.json', 'package.json', 'package-lock.json'):
            api = API()
            next(e for e in api.trees[TREE]['tree'] if e['path'] == path)['sha'] = '9' * 40
            with self.subTest(path=path), self.assertRaisesRegex(ci.EvidenceError, 'CI_POLICY_CHANGED'):
                verify(api)
        api = API(); api.trees[TREE]['tree'].append({'path': 'scripts/ci/new.mjs', 'mode': '100644', 'type': 'blob', 'sha': '9' * 40})
        with self.assertRaisesRegex(ci.EvidenceError, 'CI_POLICY_CHANGED'):
            verify(api)
        api = API()
        for value in api.trees.values():
            value['tree'] = [e for e in value['tree'] if not e['path'].startswith('scripts/ci/')]
        with self.assertRaisesRegex(ci.EvidenceError, 'NOT_INSTALLED'):
            verify(api)

    def test_truncated_tree_and_corrupted_trusted_json_blob_fail_closed(self):
        api = API(); api.trees[MAIN_TREE]['truncated'] = True
        with self.assertRaisesRegex(ci.EvidenceError, 'INCOMPLETE_CI_TREE'):
            verify(api)
        api = API(); next(iter(api.blobs.values()))['content'] = base64.b64encode(b'{}').decode()
        with self.assertRaisesRegex(ci.EvidenceError, 'BLOB_MISMATCH'):
            verify(api)

    def test_new_failed_or_partial_attempt_never_borrows_an_old_success(self):
        for field, value in [('conclusion', 'failure'), ('status', 'in_progress'), ('run_attempt', 2)]:
            api = API(); api.runs.append({**api.run, 'id': 51, field: value})
            with self.subTest(field=field), self.assertRaisesRegex(ci.EvidenceError, 'NOT_SUCCESSFUL'):
                verify(api)

    def test_fork_wrong_workflow_stale_and_nonmain_manual_runs_rejected(self):
        for mutate in [lambda a: a.run['head_repository'].update(id=3), lambda a: a.run.update(path='other.yml'),
                       lambda a: a.run.update(head_sha=MAIN), lambda a: a.run.update(run_started_at=date(-8 * 86400)),
                       lambda a: a.run.update(event='workflow_dispatch'), lambda a: a.run.update(event='push')]:
            api = API(); mutate(api)
            with self.assertRaises(ci.EvidenceError): verify(api)
        api = API('test', 'workflow_dispatch'); api.run['head_branch'] = 'feature'
        with self.assertRaisesRegex(ci.EvidenceError, 'NOT_MAIN'): verify(api)

    def test_every_missing_cancelled_skipped_duplicate_or_self_hosted_job_rejects(self):
        for mutate in [lambda a: a.jobs.pop(), lambda a: a.jobs.append(a.jobs[0]),
            lambda a: a.jobs[0].update(conclusion='cancelled'), lambda a: a.jobs[0].update(conclusion='skipped'),
            lambda a: a.jobs[0].update(head_sha=MAIN), lambda a: a.jobs[0].update(run_id=999),
            lambda a: a.jobs[0].update(labels=['ubuntu-24.04', 'self-hosted'])]:
            api = API(); mutate(api)
            with self.assertRaises(ci.EvidenceError): verify(api)

    def test_narrowed_main_success_cannot_substitute_fresh_full_validation(self):
        api = API('test'); api.jobs = [j for j in api.jobs if j['name'] != 'validation-evidence']; api.artifacts = []
        with self.assertRaisesRegex(ci.EvidenceError, 'CI_JOB_MISSING'): verify(api)
        api = API('test'); api.artifacts = []
        with self.assertRaisesRegex(ci.EvidenceError, 'NO_UNIQUE_FULL_CI_RECEIPT'): verify(api)

    def test_missing_duplicate_foreign_expired_and_tampered_archives_reject(self):
        for mutate in [lambda a: a.artifacts.clear(), lambda a: a.artifacts.append(a.artifacts[0]),
            lambda a: a.artifacts[0].update(expired=True), lambda a: a.artifacts[0].update(expires_at=date(-1)),
            lambda a: a.artifacts[0].update(created_at=date(1)),
            lambda a: a.artifacts[0]['workflow_run'].update(head_sha=MAIN),
            lambda a: a.artifacts[0]['workflow_run'].update(head_repository_id=4),
            lambda a: a.artifacts[0].update(digest='sha256:' + '0' * 64)]:
            api = API(); mutate(api)
            with self.assertRaises(ci.EvidenceError): verify(api)

    def test_zip_extra_members_traversal_and_duplicate_json_fields_are_rejected(self):
        variants = [[('../validation-evidence.json', '{}')], [('validation-evidence.json', '{}'), ('run.py', 'arbitrary')],
                    [('validation-evidence.json', '{"schemaVersion":1,"schemaVersion":1}')]]
        for entries in variants:
            api = API(); api.archive(entries)
            with self.assertRaises(ci.EvidenceError): verify(api)

    def test_receipt_exact_identity_commands_and_all_shards_are_mandatory(self):
        for mutate in [lambda a: a.receipt.update(runId=9), lambda a: a.receipt.update(manifestSha256='sha256:' + '0' * 64),
            lambda a: a.receipt['identity'].update(sourceTree=MAIN_TREE), lambda a: a.receipt['suites'].pop(),
            lambda a: a.receipt['suites'].append(a.receipt['suites'][0]),
            lambda a: a.receipt['suites'][0].update(status='skipped'),
            lambda a: a.receipt['suites'][0]['commands'][0].update(exitCode=1),
            lambda a: a.receipt['suites'][0]['commands'].pop(),
            lambda a: a.receipt['suites'][0]['commands'][0].update(command=['true']),
            lambda a: a.receipt.update(configurationSha256='sha256:' + '0' * 64)]:
            api = API(); mutate(api); api.archive()
            with self.assertRaises(ci.EvidenceError): verify(api)

    def test_concurrent_main_or_pr_changes_abort_after_download(self):
        for mutate in [lambda a: setattr(a, 'main', HEAD), lambda a: a.pr['head'].update(sha=MAIN),
                       lambda a: a.pr.update(merge_commit_sha=MAIN), lambda a: a.run.update(conclusion='failure'),
                       lambda a: a.artifacts[0].update(expired=True)]:
            api = API(); api.after_download = lambda: mutate(api)
            with self.assertRaises(ci.EvidenceError): verify(api)

    def test_shell_dependencies_cycles_and_hooks_cannot_alter_expected_commands(self):
        for commands, scripts in [(['node a; true'], {}), (['npm run test:a'], {'test:a': 'npm run test:a'}),
                                  (['npm run test:a'], {'test:a': 'node a', 'pretest:a': 'node prep'})]:
            with self.assertRaises(ci.EvidenceError): ci.commands(commands, scripts)

class ReviewedPolicyTests(unittest.TestCase):
    """The two receipts describe distinct checkouts after protected policy integration."""
    def setUp(self):
        self.api = API()
        api = self.api
        self.head = API(event='workflow_dispatch')
        head = self.head
        head.run.update(id=51, run_started_at=date(-100), pull_requests=[])
        for job in head.jobs:
            job['run_id'] = 51
        head.tested = HEAD
        head.receipt.update(runId=51, sourceSha=HEAD)
        head.receipt['identity']['sourceSha'] = HEAD
        for row in head.receipt['suites']:
            row['sourceSha'] = HEAD
        head.archive()
        head.artifacts[0].update(id=201)
        head.artifacts[0]['workflow_run']['id'] = 51
        api.runs.append(head.run)
        # The merged tree contains the protected operational change.
        new_tree = 'f' * 40
        api.commits[MERGE]['tree']['sha'] = new_tree
        api.trees[new_tree] = copy.deepcopy(api.trees[TREE])
        api.receipt['identity']['sourceTree'] = new_tree
        api.archive()
        self.merged_tree = new_tree
        # Main uses a different, still runnable package. Anchor the held package
        # and complete command expansion in protected policy data.
        base_package = b'{"scripts":{"test:baseline":"node old.js"}}'
        next(row for row in api.trees[MAIN_TREE]['tree'] if row['path'] == 'package.json')['sha'] = blob(base_package)
        def projection(key):
            return {r['path']:[r['mode'],r['type'],r['sha']] for r in api.trees[key]['tree'] if ci.policy_path(r['path'])}
        self.profile = {'schemaVersion':1,'repository':ci.REPOSITORY,'pr':12,'source':HEAD,'tree':TREE,
                        'installedPolicySha256':ci.policy_digest(projection(MAIN_TREE)),
                        'reviewedPolicySha256':ci.policy_digest(projection(TREE)),
                        'reviewedBlobs':{'package.json':projection(TREE)['package.json']},
                        'reviewedCommandsSha256':ci.policy_digest({r['id']:[c['command'] for c in r['commands']] for r in api.receipt['suites']})}
        self.install()
        request = api.request
        pages = api.pages
        download = api.download
        api.request = lambda endpoint: copy.deepcopy(head.artifacts[0]) if endpoint.endswith('artifacts/201') else request(endpoint)
        api.pages = lambda endpoint,key: copy.deepcopy(head.jobs if key=='jobs' else head.artifacts) if '/actions/runs/51/' in endpoint else pages(endpoint,key)
        api.download = lambda identifier,target: target.write_bytes(head.zip_bytes) if identifier==201 else download(identifier,target)

    def install(self):
        data=json.dumps(self.profile).encode()
        entry={'path':'scripts/environments/reviewed-dev-policy.json','mode':'100644','type':'blob','sha':blob(data)}
        rows=self.api.trees[MAIN_TREE]['tree']
        rows[:]=[r for r in rows if r['path'] != entry['path']]+[entry]
        self.api.blobs[entry['sha']]={'sha':entry['sha'],'encoding':'base64','content':base64.b64encode(data).decode()}

    def test_distinct_current_merge_and_exact_head_both_pass(self):
        proof=verify(self.api)
        self.assertEqual((proof['runId'],proof['testedSha'],proof['sourceTree']),(51,HEAD,TREE))
        self.assertEqual((proof['prospectiveMerge']['runId'],proof['prospectiveMerge']['testedSha']),(50,MERGE))

    def test_source_or_candidate_supplied_profile_cannot_install_trust(self):
        profile=self.api.trees[MAIN_TREE]['tree'].pop()
        self.api.trees[TREE]['tree'].append(profile)
        with self.assertRaisesRegex(ci.EvidenceError,'REBASE_REQUIRED'):
            verify(self.api)

    def test_changed_or_stale_policy_is_rejected(self):
        for field,value in [('pr',21),('source','1'*40),('tree',MAIN_TREE),('installedPolicySha256','2'*64),
                            ('reviewedPolicySha256','2'*64),('reviewedCommandsSha256','2'*64),('reviewedBlobs',{})]:
            original=self.profile[field];self.profile[field]=value;self.install()
            with self.subTest(field=field), self.assertRaises(ci.EvidenceError): verify(self.api)
            self.profile[field]=original;self.install()

    def test_changed_writer_on_either_checkout_is_rejected(self):
        for tree in [TREE,self.merged_tree,MAIN_TREE]:
            row=next(r for r in self.api.trees[tree]['tree'] if r['path']==ci.WORKFLOW)
            original=row['sha'];row['sha']='1'*40
            with self.subTest(tree=tree), self.assertRaises(ci.EvidenceError): verify(self.api)
            row['sha']=original

    def test_missing_failed_wrong_branch_or_older_exact_head_rejected(self):
        self.api.runs.remove(self.head.run)
        with self.assertRaisesRegex(ci.EvidenceError,'RUN_MISSING'): verify(self.api)
        self.api.runs.append(self.head.run)
        for k,v in [('run_started_at',date(-140)),('head_branch','other'),('conclusion','failure'),('run_attempt',2)]:
            previous=self.head.run[k];self.head.run[k]=v
            with self.subTest(field=k), self.assertRaises(ci.EvidenceError): verify(self.api)
            self.head.run[k]=previous

    def test_head_success_cannot_replace_failed_pr_run(self):
        self.api.run['conclusion']='failure'
        with self.assertRaisesRegex(ci.EvidenceError,'NOT_SUCCESSFUL'): verify(self.api)

    def conflicted(self):
        api = self.api
        base, resolved, landed, base_tree = ('1'*40,'2'*40,'3'*40,'4'*40)
        api.pr.update(mergeable=False, mergeable_state='dirty', merge_commit_sha=None)
        self.profile.update(baseline=base, resolutionBranch='ops/dev-resolution-223',resolvedBlobs={})
        self.install()
        api.commits[base] = {'sha':base,'tree':{'sha':base_tree}}
        api.trees[base_tree] = copy.deepcopy(api.trees[MAIN_TREE])
        api.trees[base_tree]['tree'].pop()
        # Only the protected policy record is new on main.
        addition = copy.deepcopy(api.trees[MAIN_TREE]['tree'][-1])
        api.trees[self.merged_tree]['tree'].append(addition)
        api.commits[resolved] = {'sha':resolved,'parents':[{'sha':HEAD},{'sha':MAIN}],'tree':{'sha':self.merged_tree}}
        api.commits[landed] = {'sha':landed,'parents':[{'sha':MAIN},{'sha':resolved}],'tree':{'sha':self.merged_tree}}
        companion=copy.deepcopy(api.pr)
        companion.update(number=23,merge_commit_sha=landed,mergeable=True,mergeable_state='clean')
        companion['head'].update(sha=resolved,ref=self.profile['resolutionBranch'])
        api.run.update(head_branch=companion['head']['ref'],head_sha=resolved,
                       pull_requests=[{'number':23,'head':{'sha':resolved},'base':{'sha':MAIN}}])
        for job in api.jobs: job['head_sha']=resolved
        api.tested=landed
        api.receipt['sourceSha']=landed;api.receipt['identity']['sourceSha']=landed
        for row in api.receipt['suites']: row['sourceSha']=landed
        api.archive()
        api.artifacts[0]['workflow_run']['head_sha']=resolved
        request=api.request;pages=api.pages
        api.request=lambda endpoint: copy.deepcopy(companion) if endpoint.endswith('/pulls/23') else request(endpoint)
        api.pages=lambda endpoint,key=None: [companion] if '/pulls?' in endpoint else pages(endpoint,key)
        return resolved,companion

    def test_conflicted_source_requires_verified_resolution_and_two_complete_runs(self):
        resolved,companion=self.conflicted()
        proof=verify(self.api)
        self.assertEqual(proof['sourceHeadSha'],HEAD)
        self.assertEqual(proof['resolutionHeadSha'],resolved)
        self.assertEqual(proof['resolutionPr'],23)
        self.assertEqual(proof['prospectiveMerge']['testedSha'],companion['merge_commit_sha'])

    def test_conflicted_source_denies_unreviewed_resolutions_and_stale_parents(self):
        resolved,companion=self.conflicted()
        api=self.api
        rows=api.trees[self.merged_tree]['tree']
        rows.append({'path':'src/new.ts','mode':'100644','type':'blob','sha':HEAD})
        with self.assertRaisesRegex(ci.EvidenceError,'RESOLUTION_TREE_MISMATCH'):verify(api)
        rows.pop()
        api.commits[resolved]['parents'].reverse()
        with self.assertRaisesRegex(ci.EvidenceError,'RESOLUTION_PARENTS'):verify(api)
        api.commits[resolved]['parents'].reverse()
        companion['base']['sha']=HEAD
        with self.assertRaisesRegex(ci.EvidenceError,'RESOLUTION_PR_CHANGED'):verify(api)
