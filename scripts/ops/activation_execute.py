#!/usr/bin/env python3
"""Prepare or, only after separate scope approval, execute the exact Jems activation.

Default describe is offline. Check and apply require the reviewed operational
source merged as protected main, fresh claims and an integrity-pinned audit.
Neither hashes nor this executable establish owner authorization by themselves.
"""
import argparse
import copy
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import time
import urllib.error
import urllib.request

from admin_api import Http, NoRedirect, SetupError, command, require
from admin_receipts import Receipt
import admin_cloud
import admin_setup
import diagnose_iam_review as diagnostic
import production_activation as review

ROLE_HASHES = {
    'roles/artifactregistry.writer': '45482389d8b29ce2d7aade77d6b4c88199b057a4c01ba0f12f7885df7c1a37f6',
    'roles/artifactregistry.reader': '5220a2bc6cd10794a7693377d34fc2ce742c2e2ba94a39b75fbdedd297a63b67',
    'roles/iam.serviceAccountUser': '991021eadf2bc737c8e7fa389becfaac94dce35134089ac2c2122e2dbf267668',
    'roles/iam.workloadIdentityUser': 'a8aeaabdf950224c0d21af3ed869041a136178531b387d53ad731b5329d1e6ac',
}
# Reviewed dependency and workflow bytes; the executor itself is bound by scope().
SOURCE_HASHES = {
    'scripts/ops/access_preflight.py': 'fa586033fa58f5a13dec8a67645e32118df24ffa2788597d8cc7a818c834ebbe',
    'scripts/ops/activation_review.py': 'b3ecfacaedbd0974ed0cf9ecacf5e9f1a14e1d27155b0baf040e2869c8241440',
    'scripts/ops/admin_api.py': 'e5f8008fc8f65194ab6c52935c04d86f851c910b111a8696391e04d976016964',
    'scripts/ops/admin_cloud.py': '8cb95068d32caf26e0479a6423d1a48fbf469f475f7fec1ae1ce9c58bd17905e',
    'scripts/ops/admin_drill.py': '3527ba7fd5e4b11f06dd343f7ac0da0c5ac80f59cf277dc3f3ae1a64c52ee7f7',
    'scripts/ops/admin_receipts.py': '08b368ccd86d8d8b699605fa99ed5b1a7d8d36472f1366f30d757aec662e5812',
    'scripts/ops/admin_setup.py': '2e7712553356191cc15ed35cb8b0b676f9eaa4dfe1bd0561e8946b02e8d0672d',
    'scripts/ops/bootstrap_diagnostics.py': 'f2b44b86ce1165c2051081e7ca33e18f1cb9f1999985d7fc1b3d377b4c5b04cd',
    'scripts/ops/diagnose.py': '4603934a81698dcc7b814b00ff5ee2e837cae83b4de53a2e979c936bf70e7f82',
    'scripts/ops/diagnose_iam_review.py': 'c3f39921f04857a047f46d0e75f2f01be19ebd3a747e9fc06ccd7c1d0f155836',
    'scripts/ops/drill.py': 'eba601388ad1cc8a7ade4dcd0ffc74dea10422cec6116a2ebe8c7f7633650679',
    'scripts/ops/log_summary.py': 'f699db2f2a2a6f662dcc25d32d47f86f3881a724968443f140c0f793b5f2acc8',
    'scripts/ops/oidc_claims.py': '8eff94970b1e8b0e7a3d6284294aea3c6eb30ed2e4d7941d7e16e0b44ca2b9fe',
    'scripts/ops/production_activation.py': '4646a16d490e7bb7136d8b49f002ed653f31a9c78a6151c0c40d0428887c7d93',
    'scripts/ops/release.py': '81e520fae28de860e662e050f8de5a0611e006c8b5e25d3323579957e5d4da1d',
    'scripts/ops/verify_release_access.py': '046915899feb575eaf22171ab02e40e3027fe7cafa619c50a391d6eebb874e29',
    'scripts/ops/worker_status.py': 'b409936dba3a5048ec8970024fb1417a49e96bb69e27e5e55ddc0ae97582b3cb',
    '.github/workflows/jems-service-images.yml': '6d85fb8f00fcc70ce374b9c5d0f776384322973132780a0898518218b8dfa574',
    '.github/workflows/jems-cloud-run-release.yml': 'f309b4c469cf1991061b84d60483317784dd7c820515b5372cab05d716ad9104',
    '.github/workflows/test.yml': '476119ae5548e34c2b9657c163f161ee8a8509383aa1b0126799a7a6dfcda4ba',
    'ops/compatibility.json': 'ca3d163bab055381827226140568f3bef7eaac187cebd76878e0b63e9e442356',
    'ops/github-main-ruleset.json': '9106c4ac0a642c2b5c32aef70ce912d278ab278ad45390e620924eb5b4db4861',
    'ops/release.json': 'ca3d163bab055381827226140568f3bef7eaac187cebd76878e0b63e9e442356',
}
AUDIT_FILES = {'raw-responses.json', 'audit.json', 'prior-file-comparison.json', 'proposed-activation-plan.json', 'summary.json'}
HISTORICAL_MANIFEST = 'fbd91919bfcfa2a2d876e049ff853c63a78cdbedde4733e0a622d4f0efc87d68'
HISTORICAL_HELPER = 'f7fd3d4e6b21820f754cae47954cfdd22992e0ce'


def utc(): return datetime.datetime.now(datetime.timezone.utc).isoformat()


def probe_keys(state):
    registry = '//artifactregistry.googleapis.com/' + review.REGISTRY
    project = '//cloudresourcemanager.googleapis.com/projects/' + review.PROJECT
    tuples = [(registry, p) for p in ('artifactregistry.repositories.downloadArtifacts', 'artifactregistry.repositories.uploadArtifacts', 'artifactregistry.repositories.setIamPolicy')]
    tuples += [(project, p) for p in ('run.operations.get', 'run.services.create', 'resourcemanager.projects.setIamPolicy', 'iam.serviceAccounts.actAs', 'iam.serviceAccounts.getAccessToken', 'secretmanager.versions.access')]
    for service, row in state['services'].items():
        tuples += [('//run.googleapis.com/' + review.release.LOCATION + '/services/' + service, p) for p in ('run.services.get', 'run.services.update', 'run.services.delete', 'run.services.setIamPolicy', 'run.routes.invoke')]
        tuples += [('//run.googleapis.com/' + review.release.LOCATION + '/revisions/' + row['baseline'], 'run.revisions.get')]
        tuples += [(f'//iam.googleapis.com/projects/{review.PROJECT}/serviceAccounts/{row["runtime_account"]}', p) for p in ('iam.serviceAccounts.actAs', 'iam.serviceAccounts.getAccessToken')]
    return {(lane, email, resource, permission) for lane, email in review.ACCOUNTS.items() for resource, permission in tuples}


def scope():
    state = {'services': {s: {'runtime_account': account} for s, account in review.RUNTIMES.items()}}
    return {'schema': 1, 'procedure_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            'historical_manifest_sha256': HISTORICAL_MANIFEST, 'historical_helper': HISTORICAL_HELPER,
            'project': review.PROJECT, 'roles': [review.expected_role(k) for k in review.ROLE_IDS],
            'predefined_role_hashes': ROLE_HASHES, 'bindings': review.permission_pairs(state),
            'providers': {lane: {'name': review.VARIABLES[f'JEMS_{"PUBLISH" if lane == "publish" else "RELEASE"}_WIF_PROVIDER'],
                'disabled': False, 'state': 'ACTIVE', 'description': admin_cloud.MARKER,
                'attributeMapping': {'google.subject': 'assertion.sub'}, 'oidc': {'issuerUri': 'https://token.actions.githubusercontent.com'},
                'attributeCondition': admin_cloud.lane_condition(lane),
                'forbidden_overrides': ['oidc.allowedAudiences', 'oidc.jwksJson', 'actorProviders']} for lane in review.ACCOUNTS},
            'variables': review.VARIABLES, 'enable_flags': {name: 'KEEP_ABSENT' for name in review.FLAGS},
            'reviewed_source_files': SOURCE_HASHES,
            'holds': ['Exact merged main, source CI and fresh claims required.',
                      'Six historical revision checks are unknown. Release needs three actual same-token revision GET proofs; publisher revision absence remains NOT_VERIFIED.',
                      'No publishing, traffic, runtime, data, worker trust, key or other API change.',
                      'Provider and variable APIs lack conditional writes: one operator and exact pre/post checks required.']}


def load_json(path):
    return json.loads(diagnostic.read_file(Path(path)))


def source_gate(source, helper):
    require(source == helper, 'Activation requires the reviewed helper merged as the exact protected-main source')
    review.clean_source(source, helper)
    command(['git', '-C', str(review.ROOT), 'merge-base', '--is-ancestor', HISTORICAL_HELPER, source])
    require(SOURCE_HASHES, 'Reviewed source fingerprints have not been finalized')
    for path, expected in SOURCE_HASHES.items():
        require(hashlib.sha256((review.ROOT / path).read_bytes()).hexdigest() == expected, 'Reviewed workflow or access proof source changed')


def audit_evidence(directory, manifest_hash):
    directory = Path(directory)
    require(directory.is_dir() and directory.resolve() == directory.absolute() and directory.stat().st_uid == os.getuid() and directory.stat().st_mode & 0o077 == 0,
            'Use a private direct audit directory')
    data = diagnostic.read_file(directory / 'SHA256SUMS.json')
    require(hashlib.sha256(data).hexdigest() == manifest_hash == HISTORICAL_MANIFEST, 'Audit manifest differs from the reviewed pin')
    manifest = json.loads(data)
    require(set(manifest) == AUDIT_FILES, 'Unexpected audit file set')
    records = {}
    for name, expected in manifest.items():
        raw = diagnostic.read_file(directory / name)
        require(hashlib.sha256(raw).hexdigest() == expected, 'Audit file hash mismatch')
        records[name] = json.loads(raw)
    audit, plan, summary = (records[n] for n in ('audit.json', 'proposed-activation-plan.json', 'summary.json'))
    require(summary['helper_sha'] == HISTORICAL_HELPER and summary['release_source'] == diagnostic.RELEASE_SOURCE
            and summary['review_code'] == diagnostic.ORIGINAL_REVIEW, 'Historical source or reviewed direct proposal changed')
    require(audit['plan'] == plan == review.make_plan(audit['state']) and summary['review_code'] == plan['review_code']
            and summary['mutations'] == 0 and summary['activation_ready'] is False, 'Audit proposal is inconsistent')
    require(audit['final_state'] == {k: v for k, v in audit['state'].items() if k != 'predefined_roles'}
            and audit['final_predefined_roles'] == audit['predefined_roles'], 'Audit final state was not stable')
    probes = audit['effective_audit']['probes']
    require(len(probes) == 66 and not audit['effective_audit']['untested'], 'Full permission tuple denominator is required')
    require({(p['lane'], p['principal'], p['resource'], p['permission']) for p in probes} == probe_keys(audit['state']), 'Audit permission tuple set differs from the exact reviewed scope')
    unknown = []
    for probe in probes:
        public = probe['permission'] == 'run.routes.invoke' and probe['resource'].rsplit('/', 1)[-1] in {'factory-gateway', 'factory-preview'}
        if probe['observed_access'] == 'UNKNOWN': unknown.append(probe)
        else: require(probe['observed_access'] == ('CAN_ACCESS' if public else 'CANNOT_ACCESS'), 'Unexpected current effective privilege')
    require(len(unknown) in (0, 6) and all(p['permission'] == 'run.revisions.get' for p in unknown), 'Unresolved non-revision permission evidence')
    require(audit['effective_audit']['unknown_count'] == len(unknown) and len(audit['errors']) == len(unknown) and all(e.get('scope') in {'effective:publish:run.revisions.get', 'effective:release:run.revisions.get'} and e.get('diagnostic', {}).get('http_status') == 400 and e['diagnostic'].get('error_status') == 'INVALID_ARGUMENT'
            and e['diagnostic'].get('invalid_fields') == ['accessTuple.fullResourceName'] for e in audit['errors']), 'Other audit errors remain unresolved')
    require(all(review.digest(audit['state']['predefined_roles'][role]) == sha for role, sha in ROLE_HASHES.items()), 'Predefined role definition changed; review scope again')
    require(all(not provider.get('actorProviders') for provider in audit['state']['providers'].values()), 'Unreviewed provider actor delegation')
    require(len(plan['actions']) == 18, 'Expected the initial eighteen-action scope; partial activation must use its original journal')
    return {'plan': plan, 'ancestry': audit['ancestry_audit'], 'unknown_revisions': unknown, 'source': summary['release_source'],
            'audit_helper': summary['helper_sha'], 'audit_manifest': manifest_hash, 'claims': audit['state']['github']['claims_runs']}


def semantic(kind, value):
    value = review.normalized(kind, value)
    if kind == 'policy' and value is not None and not any(b.get('condition') for b in value.get('bindings', [])):
        require(value.get('version') in (1, 3), 'Unexpected IAM policy version')
        value['version'] = 1  # Documented GET behavior for unconditional version-3 SETs.
    return value


def target(state, action):
    kind, name = action['kind'], action['target']
    return state[{'policy': 'policies', 'role': 'roles', 'provider': 'providers', 'variable': 'variables'}[kind]][name]


def equal_target(kind, left, right):
    return left == right if kind == 'variable' else semantic(kind, left) == semantic(kind, right)


def after_value(action): return action['after']['value'] if action['kind'] == 'variable' else action['after']


def intent_matches(intent, action, expected, prepared_hash, approval_hash, index):
    require(intent['prepared_hash'] == prepared_hash and intent['scope_hash'] == approval_hash and intent['index'] == index
            and intent['action'] == action and equal_target(action['kind'], intent['before'], target(expected, action)), 'Action intent changed')
    if action['kind'] in {'policy', 'role'} and intent['before'] is not None:
        require(intent['before'].get('etag') == target(expected, action).get('etag'), 'Intent before-state etag changed')


def project_after(state, action, observed):
    state = copy.deepcopy(state)
    key = {'policy': 'policies', 'role': 'roles', 'provider': 'providers', 'variable': 'variables'}[action['kind']]
    state[key][action['target']] = observed
    return state


def same_state(actual, expected, changing=None):
    actual, expected = copy.deepcopy(actual), copy.deepcopy(expected)
    for key, kind in (('policies', 'policy'), ('roles', 'role'), ('providers', 'provider')):
        require(set(actual[key]) == set(expected[key]), 'Resource scope changed')
        for name in actual[key]:
            left, right = actual[key][name], expected[key][name]
            if kind in {'policy', 'role'} and left is not None and right is not None:
                require(left.get('etag'), 'IAM readback lacks its concurrency etag')
                if kind == 'role': require(not left.get('deleted'), 'Custom role is deleted')
                if not changing or (changing['kind'], changing['target']) != (kind, name):
                    require(left.get('etag') == right.get('etag'), 'Untouched IAM concurrency etag changed')
            actual[key][name], expected[key][name] = semantic(kind, left), semantic(kind, right)
    require(actual == expected, 'Live state differs from the reviewed journal projection; stop without repair')


class Client:
    def __init__(self, source, claims, actions):
        self.source, self.claims, self.actions = source, claims, copy.deepcopy(actions)
        token = admin_cloud.admin_token()
        self.write_apis = {key: Http(origin, token, {'x-goog-user-project': review.PROJECT}).call for key, origin in {
            'iam': 'https://iam.googleapis.com', 'crm': 'https://cloudresourcemanager.googleapis.com',
            'run': 'https://run.googleapis.com', 'registry': 'https://artifactregistry.googleapis.com'}.items()}
        self.github = Http('https://api.github.com', command(['gh', 'auth', 'token', '--hostname', 'github.com']), {'X-GitHub-Api-Version': '2022-11-28'})

    def snapshot(self):
        # Each bounded snapshot rechecks every reviewed direct target; no Troubleshooter rerun.
        self.reader = review.Live(self.source, self.claims)
        state = self.reader.read_state()
        state['predefined_roles'] = self.reader.predefined_roles()
        state['ancestry'] = self.reader.ancestry_audit()
        require(not self.reader.errors, 'Fresh direct or inherited policy evidence is incomplete')
        rules = json.loads((review.ROOT / 'ops/github-main-ruleset.json').read_text())
        checks = self.reader.pages(review.PREFIX + f'commits/{self.source}/check-runs?filter=latest', 'check_runs')
        for entry in next(r['parameters']['required_status_checks'] for r in rules['rules'] if r['type'] == 'required_status_checks'):
            matching = [r for r in checks if r['name'] == entry['context'] and r['app']['id'] == entry['integration_id'] and r['app']['slug'] == 'github-actions']
            require(max(matching, key=lambda r: r['id'], default={}).get('conclusion') == 'success', 'Exact-source required check is not green')
        runs = self.reader.pages(review.PREFIX + f'actions/workflows/test.yml/runs?branch=main&event=push&head_sha={self.source}', 'workflow_runs')
        require(any(r['head_sha'] == self.source and r['head_branch'] == 'main' and r['event'] == 'push' and r['conclusion'] == 'success' for r in runs), 'Exact-main Arcade push run is not green')
        self.evidence = self.reader.evidence
        return state

    def write(self, action, before):
        require(action in self.actions, 'Mutation is outside the prepared exact action set')
        kind, name, after = action['kind'], action['target'], action['after']
        if kind == 'role':
            require(before is None, 'Custom role already exists')
            return self.write_apis['iam']('POST', f'v1/projects/{review.PROJECT}/roles',
                {'roleId': review.ROLE_IDS[name], 'role': {k: v for k, v in after.items() if k != 'name'}})
        if kind == 'policy':
            require(before.get('etag') == action['before']['etag'] and before.get('etag'), 'Policy etag no longer matches reviewed before-state')
            api, path = self.reader.policy_location(name)
            return self.write_apis[api]('POST', path + ':setIamPolicy', {'policy': after})
        if kind == 'provider':
            return self.write_apis['iam']('PATCH', 'v1/' + after['name'] + '?updateMask=disabled', {'name': after['name'], 'disabled': False})
        require(kind == 'variable' and before is None and name in review.VARIABLES, 'Only absent approved identity variables may be created')
        req = urllib.request.Request(self.github.origin + '/' + review.PREFIX + 'actions/variables', method='POST',
            data=json.dumps(after).encode(), headers={**self.github.headers, 'Content-Type': 'application/json'})
        try:
            with self.github.opener.open(req, timeout=25) as response:
                require(response.code == 201, 'Variable CREATE did not return 201; outcome requires readback')
                return {'http_status': 201}
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, OSError):
            raise SetupError('Variable CREATE outcome is unverified; no overwrite or retry was attempted') from None

    def finish_operation(self, action, response):
        if action['kind'] != 'provider': return
        name = response.get('name', '')
        require(re.fullmatch(re.escape(action['after']['name']) + r'/operations/[A-Za-z0-9_.:-]+', name), 'Provider operation escaped its exact resource')
        require(name.rsplit('/', 1)[-1] not in {'.', '..'}, 'Invalid provider operation segment')
        result = response
        self.last_operation = result
        for attempt in range(20):
            if result.get('done') is True:
                require('error' not in result, 'Provider operation failed; retain journal and reconcile')
                return
            result = self.write_apis['iam']('GET', 'v1/' + name)
            require(result.get('name') == name, 'Provider operation readback identity changed')
            self.last_operation = result
            if attempt < 19 and result.get('done') is not True: time.sleep(2)
        if result.get('done') is True and 'error' not in result: return
        raise SetupError('Provider operation remains pending; resume by polling, never by repeating PATCH')


def prepare(evidence, manifest, helper, output, claims, client=None):
    audited = audit_evidence(evidence, manifest)
    source_gate(helper, helper)
    require(set(claims) == set(review.ACCOUNTS) and all(isinstance(n, int) and n > 0 for n in claims.values()), 'Fresh claims run IDs are required')
    client = client or Client(helper, claims, audited['plan']['actions'])
    baseline = {**audited['plan']['state'], 'ancestry': audited['ancestry']}
    baseline = copy.deepcopy(baseline)
    baseline['source'] = baseline['github']['source'] = helper
    baseline['github']['claims_runs'] = claims
    same_state(client.snapshot(), baseline)
    audited.update(historical_source=audited['source'], historical_helper=audited['audit_helper'],
                   historical_claims=copy.deepcopy(audited['claims']), historical_manifest=audited['audit_manifest'],
                   historical_review_code=audited['plan']['review_code'],
                   permission_evidence='HISTORICAL_66_TUPLES_NOT_A_FRESH_EFFECTIVE_ACCESS_PROOF', source=helper, claims=claims)
    audited['plan'] = review.make_plan({k: v for k, v in baseline.items() if k != 'ancestry'})
    value = {'schema': 1, 'scope_hash': review.digest(scope()), 'helper_sha': helper,
             'audit': audited, 'baseline': baseline, 'prepared_at': utc()}
    value['prepared_hash'] = review.digest(value)
    output = Path(output); require(not os.path.lexists(output), 'Preserve previous preparation output')
    output.mkdir(mode=0o700)
    review.private_json(output / 'prepared.json', value)
    return value


def transaction_receipt(journal, source, prepared_hash):
    receipt = Receipt(journal / 'completion.json', source, 'production-activation')
    if receipt.pending.exists():
        saved = load_json(receipt.pending)
        require(saved.get('prepared_hash') == prepared_hash, 'Pending transaction belongs to another prepared plan')
        receipt.file = os.fdopen(os.open(receipt.pending, os.O_RDWR | os.O_NOFOLLOW), 'r+b')
    else: receipt.__enter__()
    receipt._write({'head': source, 'phase': 'production-activation', 'prepared_hash': prepared_hash,
                    'note': 'Reserved storage; action journals, not this intent, establish completion.'})
    receipt.started = True
    return receipt


def apply(prepared_path, prepared_hash, approval_hash, helper, client=None):
    prepared_path = Path(prepared_path); prepared = load_json(prepared_path)
    require(prepared['prepared_hash'] == prepared_hash == review.digest({k: v for k, v in prepared.items() if k != 'prepared_hash'}), 'Prepared plan hash mismatch')
    require(approval_hash == prepared['scope_hash'] == review.digest(scope()), 'Explicit approval must cover the exact stable scope')
    source_gate(prepared['audit']['source'], helper)
    require(helper == prepared['helper_sha'], 'Prepared helper source changed')
    actions = prepared['audit']['plan']['actions']
    require(prepared['audit']['plan'] == review.make_plan(prepared['audit']['plan']['state']), 'Prepared action set changed')
    require(prepared['baseline'] == {**prepared['audit']['plan']['state'], 'ancestry': prepared['audit']['ancestry']}
            and prepared['audit']['claims'] == prepared['baseline']['github']['claims_runs'] and len(actions) == 18,
            'Prepared baseline or claims differ from the exact action plan')
    require(all(review.digest(prepared['baseline']['predefined_roles'][role]) == sha for role, sha in ROLE_HASHES.items()), 'Approved predefined role definitions changed')
    require(all(not provider.get('actorProviders') for provider in prepared['baseline']['providers'].values()), 'Unreviewed provider actor delegation')
    journal = prepared_path.parent / ('activation-' + prepared_hash[:16])
    if not journal.exists(): journal.mkdir(mode=0o700)
    require(not journal.is_symlink() and journal.stat().st_mode & 0o077 == 0, 'Activation journal must be private')
    lock = os.open(journal / '.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(lock, 'r+b') as stream:
        fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
        client = client or Client(prepared['audit']['source'], prepared['audit']['claims'], actions)
        def snapshot():
            value = client.snapshot()
            review.private_json(journal / f'read-{time.time_ns()}.json', {'observed_at': utc(), 'state': value,
                                'responses': getattr(client, 'evidence', [])})
            return value
        def finish_operation(action, response, index):
            client.last_operation = None
            try: client.finish_operation(action, response)
            finally:
                if action['kind'] == 'provider' and client.last_operation is not None:
                    review.private_json(journal / f'operation-{index:02d}-{time.time_ns()}.json',
                                        {'observed_at': utc(), 'operation': client.last_operation})
        expected = copy.deepcopy(prepared['baseline'])
        reservation = None
        try:
            if not (journal / 'completion.json').exists(): reservation = transaction_receipt(journal, helper, prepared_hash)
            for index, action in enumerate(actions):
                stem = journal / f'{index:02d}'
                intent_path, result_path, done_path = (Path(str(stem) + suffix) for suffix in ('.intent.json', '.response.json', '.done.json'))
                if done_path.exists():
                    done, intent = load_json(done_path), load_json(intent_path)
                    intent_matches(intent, action, expected, prepared_hash, approval_hash, index)
                    require(done['intent_hash'] == review.digest(intent) and equal_target(action['kind'], done['observed'], after_value(action)), 'Completed receipt differs from approved before/after state')
                    expected = project_after(expected, action, done['observed']); continue
                require(reservation is not None, 'Completed transaction is missing an action receipt')
                pending = intent_path.exists()
                if pending:
                    intent = load_json(intent_path)
                    intent_matches(intent, action, expected, prepared_hash, approval_hash, index)
                    if action['kind'] == 'provider':
                        require(result_path.exists(), 'Uncertain provider operation has no operation receipt; manual read-only reconciliation required')
                        finish_operation(action, load_json(result_path), index)
                else:
                    current = snapshot(); same_state(current, expected)
                    before = target(current, action)
                    require(semantic(action['kind'], before) == semantic(action['kind'], action['before']), 'Action before-state changed')
                    intent = {'prepared_hash': prepared_hash, 'scope_hash': approval_hash, 'index': index, 'action': action, 'before': before, 'observed_at': utc()}
                    review.private_json(intent_path, intent)
                    response = client.write(action, before)
                    review.private_json(result_path, response)
                    finish_operation(action, response, index)
                current = snapshot()
                after = after_value(action)
                projected = project_after(expected, action, after)
                same_state(current, projected, action)  # Pending BEFORE/unknown stops here; never replay.
                observed = target(current, action)
                review.private_json(done_path, {'intent_hash': review.digest(intent), 'observed': observed, 'reconciled': pending, 'observed_at': utc()})
                expected = project_after(expected, action, observed)
            same_state(snapshot(), expected)
            summary = {'status': 'DIRECT_ACTIVATION_VERIFIED_FLAGS_ABSENT', 'prepared_hash': prepared_hash,
                'scope_hash': approval_hash, 'source': helper, 'verified_actions': len(actions), 'activation_ready': False,
                'next_gate': 'Run identity-verified lane access proofs including actual revision GETs; do not enable publishing or release flags.'}
            if reservation:
                summary['verified_at'] = utc(); reservation.finish(summary)
            else:
                saved = load_json(journal / 'completion.json')['details']
                require({k: v for k, v in saved.items() if k != 'verified_at'} == summary, 'Completion receipt changed')
                summary = saved
            return summary
        finally:
            if reservation: reservation.__exit__(None, None, None)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', nargs='?', default='describe', choices=('describe', 'check', 'apply'))
    for name in ('helper-sha', 'evidence-dir', 'manifest-sha256', 'output-dir', 'prepared', 'prepared-hash', 'scope-approval'):
        parser.add_argument('--' + name)
    parser.add_argument('--publish-claims-run', type=int); parser.add_argument('--release-claims-run', type=int)
    args = parser.parse_args()
    try:
        if args.mode == 'describe': result = {'scope': scope(), 'scope_hash': review.digest(scope()), 'owner_approval': 'NOT_GRANTED_BY_THIS_OUTPUT'}
        elif args.mode == 'check':
            require(all((args.helper_sha, args.evidence_dir, args.manifest_sha256, args.output_dir, args.publish_claims_run, args.release_claims_run)), 'Check requires exact source/evidence/output and fresh claims arguments')
            prepared = prepare(args.evidence_dir, args.manifest_sha256, args.helper_sha, args.output_dir,
                               {'publish': args.publish_claims_run, 'release': args.release_claims_run})
            result = {k: prepared[k] for k in ('scope_hash', 'prepared_hash', 'helper_sha')}
            result.update(status='PREPARED_OWNER_AUTHORITY_MUST_EXIST_BEFORE_APPLY', historical_unknown_revision_checks=len(prepared['audit']['unknown_revisions']))
        else:
            require(all((args.helper_sha, args.prepared, args.prepared_hash, args.scope_approval)), 'Apply requires prepared plan and explicit scope approval hashes')
            result = apply(args.prepared, args.prepared_hash, args.scope_approval, args.helper_sha)
        print(json.dumps(result, indent=2, sort_keys=True))
    except (SetupError, review.release.ReleaseError, OSError, ValueError, KeyError, TypeError):
        print(json.dumps({'status': 'STOPPED', 'activation_ready': False,
            'instruction': 'Preserve private receipts. A pending mutation may have occurred; do not replay it. Reconcile exact readback and unresolved gates.'}))
        raise SystemExit(2) from None


if __name__ == '__main__': main()
