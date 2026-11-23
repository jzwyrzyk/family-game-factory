#!/usr/bin/env python3
"""Read-only collection of the exact proposed Jems production activation scope.

This program has no mutation operation. Full resource/policy responses stay in a
new private directory; stdout contains only bounded review metadata. A review
hash records evidence, not authorization or proof of effective future access.
"""
from __future__ import annotations

import argparse
import copy
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import time
import urllib.parse

from admin_api import Http, SetupError, command, require
import admin_cloud
import admin_setup
import oidc_claims
import release

ROOT = Path(__file__).resolve().parents[2]
PROJECT = release.PROJECT
NUMBER = release.PROJECT_NUMBER
REGION = 'us-east5'
REPO = oidc_claims.REPO
PREFIX = f'repos/{REPO}/'
REGISTRY = f'projects/{PROJECT}/locations/{REGION}/repositories/jems-release-images'
APPROVED_APP = '023377f146c5cafdf828a6ad84c4466f3d564ac3'
MARKER = 'Jems reviewed production activation v1'
FLAGS = ('JEMS_IMAGE_PUBLISH_ENABLED', 'JEMS_CLOUD_RUN_RELEASE_ENABLED')
ROLE_IDS = {'services': 'jemsProductionServiceRelease', 'operations': 'jemsProductionOperationReader'}
ROLE_PERMISSIONS = {'services': ['run.revisions.get', 'run.services.get', 'run.services.update'],
                    'operations': ['run.operations.get']}
PREDEFINED_ROLES = ('roles/artifactregistry.writer', 'roles/artifactregistry.reader',
                    'roles/iam.serviceAccountUser', 'roles/iam.workloadIdentityUser')
RUNTIMES = {name: f"{('factory-coach' if name == 'factory-coach-private' else name)}@{PROJECT}.iam.gserviceaccount.com"
            for name in release.SERVICES}
ACCOUNTS = {'publish': f'jems-image-publisher@{PROJECT}.iam.gserviceaccount.com',
            'release': f'jems-cloud-run-release@{PROJECT}.iam.gserviceaccount.com'}
VARIABLES = {f'JEMS_{prefix}_{suffix}': value for lane, prefix in (('publish', 'PUBLISH'), ('release', 'RELEASE'))
             for suffix, value in (('WIF_PROVIDER', f'projects/{NUMBER}/locations/global/workloadIdentityPools/{oidc_claims.LANES[lane][1]}/providers/github-main'),
                                   ('SERVICE_ACCOUNT', ACCOUNTS[lane]))}
MAX_BYTES = 32_000_000
EVIDENCE_BYTES = 16_000_000


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def git(*args):
    return command(['git', '-C', str(ROOT), *args])


def private_json(path, value):
    """Create, fsync, and publish a new private file without replacing receipts."""
    path = Path(path)
    require(path.parent.is_dir(), 'Create a private output directory before running this command')
    require(not path.is_symlink() and not os.path.lexists(path), 'Output already exists; preserve the earlier record')
    data = (json.dumps(value, indent=2, sort_keys=True) + '\n').encode()
    require(len(data) <= MAX_BYTES, 'Private record exceeds bounded storage')
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(data); stream.flush(); os.fsync(stream.fileno())
        directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try: os.fsync(directory)
        finally: os.close(directory)
    except BaseException:
        # An incomplete file is evidence, never permission to repeat a mutation.
        raise


def read_private(path):
    path = Path(path)
    require(path.is_file() and not path.is_symlink(), 'Expected a regular private record')
    require(path.stat().st_size <= MAX_BYTES and path.stat().st_mode & 0o077 == 0,
            'Record must be owner-only and bounded')
    return json.loads(path.read_text())


def clean_source(source, helper):
    require(re.fullmatch(r'[a-f0-9]{40}', source or ''), 'Use a full immutable source SHA')
    require(re.fullmatch(r'[a-f0-9]{40}', helper or '') and git('rev-parse', 'HEAD') == helper, 'Checkout differs from the pinned helper source')
    command(['git', '-C', str(ROOT), 'merge-base', '--is-ancestor', source, helper])
    require(not git('status', '--porcelain', '--untracked-files=all'), 'Use a clean pinned checkout')
    command(['git', '-C', str(ROOT), 'merge-base', '--is-ancestor', APPROVED_APP, source])
    paths = git('diff', '--name-only', APPROVED_APP, source).splitlines()
    allowed = ('docs/', 'scripts/ops/')
    exact = {'DELIVERY-STATE.md', 'ARCHITECTURE-CURRENT.md', 'AGENTS.md', '.github/workflows/jems-service-images.yml',
             '.github/workflows/jems-cloud-run-release.yml', 'ops/release.json', 'ops/compatibility.json'}
    require(all(p.startswith(allowed) or p in exact for p in paths),
            'Source changes approved application code outside the activation/release scope')
    return source


def normalized(kind, value):
    if value is None: return None
    value = copy.deepcopy(value)
    if kind == 'policy':
        value.pop('etag', None)
        value['version'] = value.get('version', 1)
        value['bindings'] = sorted([{**b, 'members': sorted(b['members'])} for b in value.get('bindings', [])],
                                   key=lambda b: json.dumps(b, sort_keys=True))
    elif kind == 'role':
        value = {k: value.get(k) for k in ('name', 'title', 'description', 'includedPermissions', 'stage')}
        value['includedPermissions'] = sorted(value.get('includedPermissions') or [])
    elif kind == 'provider':
        value.pop('etag', None)
        value.pop('updateTime', None)
        value['disabled'] = value.get('disabled', False)
    elif kind == 'variable':
        value = {k: value[k] for k in ('name', 'value')}
    return value


def add_members(policy, pairs):
    require(isinstance(policy, dict) and policy.get('etag'), 'IAM policy has no concurrency etag')
    result = copy.deepcopy(policy)
    require(result.get('version', 1) in (1, 3), 'Unexpected IAM policy version')
    result['version'] = 3
    bindings = result.setdefault('bindings', [])
    for role, member in sorted(pairs):
        matches = [b for b in bindings if b.get('role') == role and not b.get('condition')]
        require(len(matches) <= 1, 'Duplicate unconditioned IAM role bindings')
        if matches:
            matches[0]['members'] = sorted(set(matches[0]['members']) | {member})
        else:
            bindings.append({'role': role, 'members': [member]})
    return result


def expected_role(kind):
    return {'name': f'projects/{PROJECT}/roles/{ROLE_IDS[kind]}',
            'title': {'services': 'Jems service release', 'operations': 'Jems operation polling'}[kind],
            'description': MARKER, 'includedPermissions': ROLE_PERMISSIONS[kind], 'stage': 'GA'}


def own_subject(lane):
    pool = oidc_claims.LANES[lane][1]
    return f'principal://iam.googleapis.com/projects/{NUMBER}/locations/global/workloadIdentityPools/{pool}/subject/{oidc_claims.expected_claims(lane)["sub"]}'


def permission_pairs(state):
    publisher = f'serviceAccount:{ACCOUNTS["publish"]}'
    rollout = f'serviceAccount:{ACCOUNTS["release"]}'
    pairs = {
        'registry': [('roles/artifactregistry.writer', publisher), ('roles/artifactregistry.reader', rollout)],
        'project': [(expected_role('operations')['name'], rollout)],
    }
    for service, row in state['services'].items():
        pairs['service:' + service] = [(expected_role('services')['name'], rollout)]
        pairs['account:' + row['runtime_account']] = [('roles/iam.serviceAccountUser', rollout)]
    for lane in ACCOUNTS:
        pairs['account:' + ACCOUNTS[lane]] = [('roles/iam.workloadIdentityUser', own_subject(lane))]
    return pairs


def validate_state(state):
    require(state['project'] == {'id': PROJECT, 'number': NUMBER}, 'Unexpected project identity')
    require(state['github']['source'] == state['source'] and state['github']['protected'], 'Expected exact protected main')
    require(state['registry']['format'] == 'DOCKER' and state['registry']['immutable_tags'] is True
            and not state['registry']['cleanup_policies'], 'Registry must retain immutable candidates without cleanup policy')
    require(set(state['services']) == set(release.SERVICES), 'Unexpected enrolled service set')
    for service, row in state['services'].items():
        require(row['runtime_account'] == RUNTIMES[service] and row['configuration_matches'] is True,
                'Current serving/runtime configuration differs from the reviewed service scope')
        require(re.fullmatch(r'[a-f0-9]{64}', row['configuration']), 'Missing actual configuration fingerprint')
        require(re.search(r'@sha256:[a-f0-9]{64}$', row['image']), 'Baseline image is not immutable')
    require(all(v is None for v in state['flags'].values()), 'Both release enable flags must remain absent')
    require(not state['github']['shadow_variables'], 'Environment or organization variables shadow release settings')
    require(not state['keys'], 'Dedicated release identities must have no user-managed keys')
    require(set(state['predefined_roles']) == set(PREDEFINED_ROLES)
            and all(state['predefined_roles'].values()), 'Proposed predefined role permissions were not all observed')
    for name, value in state['variables'].items():
        require(value is None or value == VARIABLES[name], 'Unexpected existing deployment identity variable')
    for lane, current in state['providers'].items():
        expected = {'name': VARIABLES[f'JEMS_{"PUBLISH" if lane == "publish" else "RELEASE"}_WIF_PROVIDER'],
                    'state': 'ACTIVE', 'description': admin_cloud.MARKER,
                    'attributeMapping': {'google.subject': 'assertion.sub'},
                    'attributeCondition': admin_cloud.lane_condition(lane)}
        require(all(current.get(k) == v for k, v in expected.items()), 'Provider differs from the reviewed exact trust')
        require(current.get('oidc', {}).get('issuerUri') == 'https://token.actions.githubusercontent.com'
                and not current['oidc'].get('allowedAudiences') and not current['oidc'].get('jwksJson'),
                'Unexpected OIDC issuer, audience, or signing-key override')
        require(current.get('disabled') is True, 'Both dedicated providers must remain disabled')
    for kind, existing in state['roles'].items():
        require(existing is None or not existing.get('deleted') and normalized('role', existing) == expected_role(kind),
                'Custom role name collides with a different permission definition')
    pairs = permission_pairs(state)
    managed = {f'serviceAccount:{email}' for email in ACCOUNTS.values()} | {own_subject(l) for l in ACCOUNTS}
    for target, policy in state['policies'].items():
        require(policy.get('etag'), 'IAM read lacks concurrency etag')
        for binding in policy.get('bindings', []):
            for member in set(binding.get('members', [])) & managed:
                require(not binding.get('condition') and (binding['role'], member) in pairs[target],
                        'Dedicated identity has an unexpected direct grant; do not silently repair it')
    return pairs


def make_plan(state):
    pairs = validate_state(state)
    actions = []
    def add(kind, target, before, after):
        if normalized(kind, before) != normalized(kind, after):
            actions.append({'kind': kind, 'target': target, 'before': before, 'after': after})
    for kind in ROLE_IDS:
        add('role', kind, state['roles'][kind], expected_role(kind))
    for target in sorted(pairs):
        before = state['policies'][target]
        add('policy', target, before, add_members(before, pairs[target]))
    # All grants precede either provider enablement. Four variables follow providers.
    for lane in ACCOUNTS:
        before = state['providers'][lane]
        add('provider', lane, before, {**before, 'disabled': False})
    for name, value in VARIABLES.items():
        before = None if state['variables'][name] is None else {'name': name, 'value': state['variables'][name]}
        add('variable', name, before, {'name': name, 'value': value})
    plan = {'schema': 1, 'phase': 'production-activation-review-only', 'source': state['source'], 'state': state,
            'actions': actions, 'activation_ready': False,
            'limits': ['Owner approval of this exact scope is required separately from its hash.',
                       'Direct IAM snapshots are not proof of all inherited access or deny policies.',
                       'Provider and GitHub variable APIs have no documented conditional-write etag; use single operator, minimal write and exact pre/post checks.',
                       'Both enable flags remain absent; federated access proofs and separate enable plan are mandatory.',
                       'No service template, traffic, data, runtime account, model, spending, or private-worker trust mutation.']}
    plan['review_code'] = digest(plan)
    return plan


class Live:
    """Fixed-resource clients; tokens remain in memory and are never serialized."""
    def __init__(self, source, claim_runs):
        self.source, self.claim_runs = source, claim_runs
        token = admin_cloud.admin_token()
        self.evidence, self.errors = [], []
        self.started, self.calls, self.evidence_bytes = time.monotonic(), 0, 0
        self.http = {name: self.readonly(Http(origin, token, {'x-goog-user-project': PROJECT}).call, name) for name, origin in {
            'run': 'https://run.googleapis.com', 'iam': 'https://iam.googleapis.com',
            'registry': 'https://artifactregistry.googleapis.com',
            'crm': 'https://cloudresourcemanager.googleapis.com',
            'troubleshooter': 'https://policytroubleshooter.googleapis.com'}.items()}
        self.gh = self.readonly(admin_setup.github_api(), "github")

    def readonly(self, call, origin):
        def read(method, path, data=None, **kwargs):
            route = path.split('?')[0]
            safe_post = (origin in {'iam', 'crm'} and route.endswith(':getIamPolicy')
                         or origin == 'crm' and route == f'v1/projects/{PROJECT}:getAncestry'
                         or origin == 'troubleshooter' and route == 'v3/iam:troubleshoot')
            require(method == 'GET' or method == 'POST' and safe_post,
                    'Read-only collector rejected a mutation-capable API call')
            require(self.calls < 400 and time.monotonic() - self.started < 600
                    and self.evidence_bytes < EVIDENCE_BYTES, 'Read-only collection exceeded its bounded request/time/size budget')
            self.calls += 1
            try:
                response = call(method, path, data, **kwargs)
                size = len(json.dumps(response, sort_keys=True).encode())
                self.evidence_bytes += size
                require(self.evidence_bytes <= EVIDENCE_BYTES, 'Response exceeded the remaining private evidence budget')
                self.evidence.append({'origin': origin, 'method': method, 'path': path,
                                      'observed_at_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'response': response})
                return response
            except SetupError as error:
                self.evidence.append({'origin': origin, 'method': method, 'path': path,
                                      'observed_at_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'error': str(error)})
                raise
        return read

    def capture(self, label, operation):
        try:
            return operation()
        except (SetupError, release.ReleaseError, OSError, ValueError, KeyError, TypeError) as error:
            self.errors.append({'scope': label, 'status': 'UNKNOWN',
                                'reason': str(error) if isinstance(error, (SetupError, release.ReleaseError))
                                else 'Response shape, transport, or local evidence could not be verified'})
            return None

    def pages(self, path, key=None): return list(admin_setup.github_pages(self.gh, path, key))
    def policy_location(self, target):
        if target == 'registry': return 'registry', f'v1/{REGISTRY}'
        if target == 'project': return 'crm', f'v1/projects/{PROJECT}'
        if target.startswith('service:'): return 'run', f'v2/{release.LOCATION}/services/{target.split(":",1)[1]}'
        if target.startswith('account:'): return 'iam', f'v1/projects/{PROJECT}/serviceAccounts/{target.split(":",1)[1]}'
        raise SetupError('Unknown fixed policy target')
    def read_target(self, kind, target):
        if kind == 'policy':
            api, path = self.policy_location(target)
            if api == 'crm':
                return self.http[api]('POST', path + ':getIamPolicy', {'options': {'requestedPolicyVersion': 3}})
            if api == 'iam':
                return self.http[api]('POST', path + ':getIamPolicy?options.requestedPolicyVersion=3')
            return self.http[api]('GET', path + ':getIamPolicy?options.requestedPolicyVersion=3')
        if kind == 'role': return self.http['iam']('GET', f'v1/projects/{PROJECT}/roles/{ROLE_IDS[target]}', missing=True)
        if kind == 'provider':
            return self.http['iam']('GET', 'v1/' + VARIABLES[f'JEMS_{"PUBLISH" if target == "publish" else "RELEASE"}_WIF_PROVIDER'])
        if kind == 'variable': return self.gh('GET', PREFIX + 'actions/variables/' + target, missing=True)
        raise SetupError('Unexpected action kind')

    def github_state(self):
        repo = self.gh('GET', PREFIX.rstrip('/'))
        require(str(repo['id']) == oidc_claims.REPO_ID and str(repo['owner']['id']) == oidc_claims.OWNER
                and repo['default_branch'] == 'main' and repo.get('permissions', {}).get('admin'),
                'Expected repository administrator on the fixed Jems repository')
        branch = self.gh('GET', PREFIX + 'branches/main')
        require(branch['protected'] and branch['commit']['sha'] == self.source, 'Protected main changed; re-review source')
        rules = json.loads((ROOT / 'ops/github-main-ruleset.json').read_text())
        found = self.pages(PREFIX + 'rulesets?includes_parents=true')
        named = [r for r in found if r['name'] == rules['name']]
        require(len(named) == 1, 'Expected the existing reviewed main ruleset')
        actual = self.gh('GET', PREFIX + f'rulesets/{named[0]["id"]}?includes_parents=false')
        require(admin_setup.exact_rules(actual, rules), 'Main ruleset changed')
        effective = self.pages(PREFIX + 'rules/branches/main')
        require({r['type'] for r in effective} == {r['type'] for r in rules['rules']}
                and all(r.get('ruleset_id') == named[0]['id'] for r in effective), 'Unexpected effective main protections')
        shadow = []
        for environment, _, _ in oidc_claims.LANES.values():
            path = PREFIX + 'environments/' + environment
            value = self.gh('GET', path)
            require(value.get('deployment_branch_policy') == admin_setup.SELECTED_BRANCH and
                    all(p['type'] == 'branch_policy' for p in value.get('protection_rules', [])), 'Environment restrictions changed')
            branches = self.pages(path + '/deployment-branch-policies', 'branch_policies')
            require(len(branches) == 1 and branches[0]['name'] == 'main' and branches[0]['type'] == 'branch', 'Environment permits another ref')
            shadow += [v['name'] for v in self.pages(path + '/variables', 'variables') if v['name'] in set(VARIABLES) | set(FLAGS)]
        # Personal repository owner: organization variables cannot apply. Fail closed if ownership changes.
        require(repo['owner']['type'] == 'User', 'Organization variable inheritance requires separate review')
        for lane, run_id in self.claim_runs.items():
            run = self.gh('GET', PREFIX + f'actions/runs/{run_id}')
            workflow = oidc_claims.LANES[lane][2]
            require(run['head_sha'] == self.source and run['head_branch'] == 'main' and run['event'] == 'workflow_dispatch'
                    and run['path'] == '.github/workflows/' + workflow and run['conclusion'] == 'success'
                    and run['head_repository']['full_name'] == REPO, 'Claims run is not for exact reviewed main/workflow')
            jobs = {j['name']: j for j in self.pages(PREFIX + f'actions/runs/{run_id}/jobs?filter=latest', 'jobs')}
            probe = jobs.get('verify-identity', {})
            require(probe.get('conclusion') == 'success' and any(s.get('conclusion') == 'success' and
                    s['name'].startswith('Run python3 scripts/ops/oidc_claims.py') for s in probe.get('steps', [])), 'Claims-only proof step did not pass')
            for name in ({'build', 'publish'} if lane == 'publish' else {'plan', 'transition'}):
                require(jobs.get(name, {}).get('conclusion') == 'skipped', 'Claims proof included a mutation lane')
        return {'source': self.source, 'protected': True, 'claims_runs': self.claim_runs, 'shadow_variables': sorted(shadow),
                'ruleset_hash': digest(admin_setup.comparable_rules(actual))}

    def read_state(self):
        project = self.http['crm']('GET', f'v1/projects/{PROJECT}')
        require(project['lifecycleState'] == 'ACTIVE', 'Production project is not active')
        registry = self.http['registry']('GET', 'v1/' + REGISTRY)
        require(registry.get('description') == admin_cloud.MARKER and registry.get('mode', 'STANDARD_REPOSITORY') == 'STANDARD_REPOSITORY', 'Unexpected registry ownership or mode')
        images = self.http['registry']('GET', 'v1/' + REGISTRY + '/dockerImages?pageSize=100')
        services = {}
        for name in sorted(release.SERVICES):
            path = f'v2/{release.LOCATION}/services/{name}'
            current = self.http['run']('GET', path)
            observed = release.inspect_service(name, lambda method, p, data=None: self.http['run'](method, 'v2/' + p, data))
            after = self.http['run']('GET', path)
            require(after == current and observed['configuration'] == release.fingerprint(current['template']),
                    'Service changed while inspecting its serving revision')
            services[name] = {'baseline': observed['baseline'], 'image': observed['baselineImage'],
                              'configuration': observed['configuration'], 'configuration_matches': observed['matchesServingConfiguration'],
                              'runtime_account': current['template']['serviceAccount'], 'etag': current['etag']}
        providers, keys = {}, []
        for lane, email in ACCOUNTS.items():
            account = self.http['iam']('GET', f'v1/projects/{PROJECT}/serviceAccounts/{email}')
            require(account['email'] == email and not account.get('disabled') and account.get('description') == admin_cloud.MARKER,
                    'Dedicated account differs from reviewed preparation')
            listed = self.http['iam']('GET', f'v1/projects/{PROJECT}/serviceAccounts/{email}/keys?keyTypes=USER_MANAGED')
            keys += listed.get('keys', [])
            provider = self.read_target('provider', lane); providers[lane] = provider
            poolpath = provider['name'].rsplit('/providers/', 1)[0]
            pool = self.http['iam']('GET', 'v1/' + poolpath)
            require(pool.get('state') == 'ACTIVE' and not pool.get('disabled') and pool.get('description') == admin_cloud.MARKER
                    and pool.get('mode') in (None, 'MODE_UNSPECIFIED', 'FEDERATION_ONLY'), 'Dedicated pool state differs')
            listing = self.http['iam']('GET', 'v1/' + poolpath + '/providers?pageSize=100')
            require(not listing.get('nextPageToken') and len(listing.get('workloadIdentityPoolProviders', [])) == 1,
                    'Dedicated pool has additional or unread providers')
        variables = {n: self.read_target('variable', n) for n in VARIABLES}
        flags = {n: self.read_target('variable', n) for n in FLAGS}
        for email in set(RUNTIMES.values()):
            account = self.http['iam']('GET', f'v1/projects/{PROJECT}/serviceAccounts/{email}')
            require(account.get('email') == email and not account.get('disabled'), 'Runtime service account unavailable')
        state = {'source': self.source, 'project': {'id': project['projectId'], 'number': str(project['projectNumber'])},
                 'github': self.github_state(),
                 'registry': {'format': registry['format'], 'immutable_tags': registry.get('dockerConfig', {}).get('immutableTags'),
                              'cleanup_policies': registry.get('cleanupPolicies', {}),
                              'empty': not images.get('dockerImages') and not images.get('nextPageToken'),
                              'image_count_lower_bound': len(images.get('dockerImages', []))},
                 'services': services, 'providers': providers, 'keys': keys,
                 'variables': {n: v['value'] if v else None for n, v in variables.items()}, 'flags': flags,
                 'roles': {k: self.read_target('role', k) for k in ROLE_IDS}}
        state['policies'] = {target: self.read_target('policy', target) for target in permission_pairs(state)}
        return state

    def ancestry_audit(self):
        ancestry = self.http['crm']('POST', f'v1/projects/{PROJECT}:getAncestry', {})
        ancestors = ancestry.get('ancestor', [])
        require(0 < len(ancestors) <= 16, 'Unexpected project ancestry size')
        require(ancestors[0].get('resourceId', {}).get('type') == 'project'
                and str(ancestors[0]['resourceId'].get('id')) in {PROJECT, NUMBER}, 'Unexpected ancestry root project')
        parents = []
        for ancestor in ancestors[1:]:
            resource = ancestor.get('resourceId', {})
            require(resource.get('type') in {'folder', 'organization'} and re.fullmatch(r'[0-9]{1,20}', str(resource.get('id'))),
                    'Unexpected project ancestor')
            kind = 'folders' if resource['type'] == 'folder' else 'organizations'
            path = f'v3/{kind}/{resource["id"]}:getIamPolicy'
            policy = self.capture('ancestor-policy:' + kind + '/' + str(resource['id']),
                                  lambda path=path: self.http['crm']('POST', path, {'options': {'requestedPolicyVersion': 3}}))
            parents.append({'resource': kind + '/' + str(resource['id']), 'policy': policy,
                            'status': 'READ' if policy is not None else 'UNKNOWN'})
        deny = []
        for ancestor in ancestors:
            resource = ancestor['resourceId']
            plural = {'project': 'projects', 'folder': 'folders', 'organization': 'organizations'}[resource['type']]
            ident = NUMBER if resource['type'] == 'project' else str(resource['id'])
            attachment = f'cloudresourcemanager.googleapis.com/{plural}/{ident}'
            collection = 'v2/policies/' + urllib.parse.quote(attachment, safe='') + '/denypolicies'
            page_token = None
            for page in range(10):
                path = collection + '?pageSize=100' + ('&pageToken=' + urllib.parse.quote(page_token, safe='') if page_token else '')
                result = self.capture('deny-list:' + attachment, lambda path=path: self.http['iam']('GET', path))
                if result is None:
                    deny.append({'attachment': attachment, 'status': 'UNKNOWN'}); break
                for policy in result.get('policies', []):
                    name = policy.get('name', '')
                    require(name.startswith(collection[3:] + '/'), 'Deny policy escaped the observed attachment point')
                    detail = self.capture('deny-policy:' + name, lambda name=name: self.http['iam']('GET', 'v2/' + name))
                    deny.append({'attachment': attachment, 'name': name, 'status': 'READ' if detail is not None else 'UNKNOWN', 'policy': detail})
                page_token = result.get('nextPageToken')
                if not page_token: break
            else:
                self.errors.append({'scope': 'deny-list:' + attachment, 'status': 'UNKNOWN', 'reason': 'Deny-policy pagination exceeded bound'})
        return {'ancestry': ancestry, 'parent_policies': parents, 'deny_policies': deny,
                'limit': 'Reads preserve policy evidence but do not enumerate all group memberships or principal access boundaries. Unknown or inaccessible policy scopes remain unverified.'}

    def predefined_roles(self):
        def read(role):
            value = self.http['iam']('GET', 'v1/' + role)
            require(value.get('name') == role and not value.get('deleted')
                    and isinstance(value.get('includedPermissions'), list) and value['includedPermissions'],
                    'Predefined role permissions could not be verified')
            return value
        return {role: self.capture('predefined-role:' + role, lambda role=role: read(role)) for role in PREDEFINED_ROLES}

    def effective_audit(self, state=None):
        probes, untested = [], []
        registry_name = '//artifactregistry.googleapis.com/' + REGISTRY
        project_name = f'//cloudresourcemanager.googleapis.com/projects/{NUMBER}'
        for lane, email in ACCOUNTS.items():
            cases = [(registry_name, p) for p in ('artifactregistry.repositories.downloadArtifacts',
                      'artifactregistry.repositories.uploadArtifacts', 'artifactregistry.repositories.setIamPolicy')]
            cases += [(project_name, p) for p in ('run.operations.get', 'run.services.create',
                       'resourcemanager.projects.setIamPolicy', 'iam.serviceAccounts.actAs',
                       'iam.serviceAccounts.getAccessToken', 'secretmanager.versions.access')]
            for name in sorted(release.SERVICES):
                resource = '//run.googleapis.com/' + release.LOCATION + '/services/' + name
                cases += [(resource, p) for p in ('run.services.get', 'run.services.update', 'run.services.delete',
                                                'run.services.setIamPolicy', 'run.routes.invoke')]
                baseline = (state or {}).get('services', {}).get(name, {}).get('baseline')
                if isinstance(baseline, str) and re.fullmatch(re.escape(name) + r'-[a-z0-9-]+', baseline):
                    # Troubleshooter uses the IAM/asset full name, not the nested v2 GET path.
                    cases.append(('//run.googleapis.com/' + release.LOCATION + '/revisions/' + baseline, 'run.revisions.get'))
                else:
                    untested.append({'lane': lane, 'service': name, 'permission': 'run.revisions.get',
                                     'reason': 'No independently verified serving revision was available'})
            for email_runtime in sorted(set(RUNTIMES.values())):
                resource = f'//iam.googleapis.com/projects/{PROJECT}/serviceAccounts/{email_runtime}'
                cases += [(resource, p) for p in ('iam.serviceAccounts.actAs', 'iam.serviceAccounts.getAccessToken')]
            for resource, permission in cases:
                result = self.capture('effective:' + lane + ':' + permission,
                    lambda resource=resource, permission=permission, email=email:
                    self.http['troubleshooter']('POST', 'v3/iam:troubleshoot',
                        {'accessTuple': {'principal': email, 'fullResourceName': resource, 'permission': permission}}))
                access = result.get('overallAccessState') if isinstance(result, dict) else None
                status = access if access in {'CAN_ACCESS', 'CANNOT_ACCESS'} else 'UNKNOWN'
                probes.append({'lane': lane, 'principal': email, 'resource': resource, 'permission': permission,
                               'observed_access': status})
        return {'probes': probes, 'untested': untested,
                'unknown_count': sum(p['observed_access'] == 'UNKNOWN' for p in probes) + len(untested),
                'scope': 'Finite current allow/deny-policy probes using the existing operator identity. No provider enabled and no federated token exchange performed.',
                'limit': 'v3 Policy Troubleshooter evaluates allow/deny policy for finite tuples. Principal access boundaries, unavailable group membership, conditional context and all other resource access remain outside any broad claim. CANNOT_ACCESS applies only to that tested tuple; this is not an exhaustive least-privilege certificate.',
                'future_access': 'Proposed bindings are not effective merely because current policy was inspected.'}

    def collect(self):
        state = self.capture('direct-state', self.read_state)
        # Even a failed high-level check must not conceal independent IAM reads.
        fixed_targets = ['registry', 'project'] + ['service:' + s for s in sorted(release.SERVICES)] + [
            'account:' + email for email in sorted(set(ACCOUNTS.values()) | set(RUNTIMES.values()))]
        policies = {target: self.capture('policy:' + target, lambda target=target: self.read_target('policy', target))
                    for target in fixed_targets}
        roles = self.predefined_roles()
        ancestry = self.capture('project-ancestry', self.ancestry_audit)
        effective = self.effective_audit(state)
        final_branch = self.capture('final-main', lambda: self.gh('GET', PREFIX + 'branches/main'))
        if final_branch is not None and (not final_branch.get('protected') or final_branch['commit']['sha'] != self.source):
            self.errors.append({'scope': 'final-main', 'status': 'DRIFT', 'reason': 'Protected main changed during collection'})
        # Repeated IAM observations must agree; concurrent changes require a new collection.
        if state is not None:
            state['predefined_roles'] = roles
            for target, prior in state['policies'].items():
                if policies.get(target) != prior:
                    self.errors.append({'scope': 'policy:' + target, 'status': 'DRIFT', 'reason': 'IAM policy changed during collection'})
        plan = self.capture('exact-proposed-diff', lambda: make_plan(state)) if state is not None else None
        return {'state': state, 'plan': plan, 'independent_policy_reads': policies,
                'predefined_roles': roles, 'ancestry_audit': ancestry, 'effective_audit': effective, 'errors': self.errors}


PRIOR_DIRECTORY = Path('/tmp/jems-prod-preflight.q5rjfP')
PRIOR_PROPOSAL = Path('/tmp/jems-activation-plan.rbLCNJ/production-plan.txt')


def prior_files(state):
    """Inspect only the exact owner-provided paths; never execute prior tools."""
    records = []
    paths = [PRIOR_DIRECTORY / (s + '.json') for s in sorted(release.SERVICES)] + [
        PRIOR_DIRECTORY / 'release.py', PRIOR_PROPOSAL]
    for path in paths:
        row = {'path': str(path), 'status': 'ABSENT'}
        if os.path.lexists(path):
            try:
                require(path.is_file() and not path.is_symlink() and not path.parent.is_symlink(), 'Prior file is not a regular direct file')
                info = path.stat()
                require(info.st_uid == os.getuid() and info.st_size <= MAX_BYTES, 'Prior file owner or size is unexpected')
                data = path.read_bytes()
                row.update(status='PRESENT', bytes=len(data), sha256=hashlib.sha256(data).hexdigest())
                if path.suffix == '.json':
                    saved = json.loads(data)
                    require(isinstance(saved, dict), 'Prior baseline is not an object')
                    service = path.stem
                    if state and service in state['services']:
                        live = state['services'][service]
                        expected = {'service': service, 'baseline': live['baseline'], 'baselineImage': live['image'],
                                    'configuration': live['configuration'], 'matchesServingConfiguration': live['configuration_matches']}
                        present = {k: v for k, v in expected.items() if k in saved}
                        row['compared_fields'] = sorted(present)
                        row['matches_fresh_fields'] = bool(present) and all(saved[k] == v for k, v in present.items())
                        row['complete_baseline_fields'] = set(expected) <= set(saved)
                elif path.name == 'release.py':
                    approved = command(['git', '-C', str(ROOT), 'show', APPROVED_APP + ':scripts/ops/release.py']) + '\n'
                    row['matches_approved_source_bytes'] = hashlib.sha256(approved.encode()).hexdigest() == row['sha256']
            except (SetupError, OSError, ValueError, TypeError, KeyError):
                row['status'] = 'UNVERIFIED'
        records.append(row)
    return {'files': records, 'scope': 'Existence/hash/comparison only; no file modified or executed. Historical proposal is not an IAM audit.',
            'adult_continuity': 'Owner reported CURRENT_STATE_VERIFIED printed in Cloud Shell; no durable receipt supplied. Not re-established by this collector.'}


def resource_name(target):
    if target == 'registry': return REGISTRY
    if target == 'project': return f'projects/{PROJECT}'
    kind, name = target.split(':', 1)
    return f'{release.LOCATION}/services/{name}' if kind == 'service' else f'projects/{PROJECT}/serviceAccounts/{name}'


def collect_to_directory(client, source, helper, output):
    output = Path(output)
    require(not os.path.lexists(output), 'Collection directory already exists; retain it and use a new path')
    output.mkdir(mode=0o700, parents=False)
    require(output.stat().st_mode & 0o077 == 0, 'Collection directory must be private')
    result = client.collect()
    prior = prior_files(result['state'])
    private_json(output / 'raw-responses.json', client.evidence)
    private_json(output / 'audit.json', result)
    private_json(output / 'prior-file-comparison.json', prior)
    if result['plan'] is not None:
        private_json(output / 'proposed-activation-plan.json', result['plan'])
    # Exact tuples are a proposal; an absent policy must never be described as a missing grant.
    tuples = []
    if result['plan'] is not None:
        for target, pairs in permission_pairs(result['state']).items():
            policy = result['state']['policies'].get(target)
            for role, member in pairs:
                observed = any(b.get('role') == role and member in b.get('members', []) and not b.get('condition')
                               for b in (policy or {}).get('bindings', [])) if policy is not None else None
                tuples.append({'resource': resource_name(target), 'role': role, 'member': member,
                               'direct_status': 'PRESENT' if observed else 'PROPOSED_ADD' if observed is False else 'UNKNOWN'})
    grants = []
    for probe in result['effective_audit']['probes']:
        if probe['observed_access'] == 'CAN_ACCESS':
            row = {key: probe[key] for key in ('lane', 'principal', 'resource', 'permission')}
            if probe['permission'] == 'run.routes.invoke' and probe['resource'].rsplit('/', 1)[-1] in {'factory-gateway', 'factory-preview'}:
                row['review_note'] = 'Public gateway/preview invocation is expected existing public ingress.'
            grants.append(row)
    summary = {'schema': 1, 'status': 'READ_ONLY_REVIEW_COMPLETE' if result['plan'] and not result['errors'] and result['effective_audit']['unknown_count'] == 0 else 'READ_ONLY_REVIEW_INCOMPLETE',
               'observed_at_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
               'helper_sha': helper, 'release_source': source, 'activation_ready': False, 'mutations': 0,
               'review_code': result['plan']['review_code'] if result['plan'] else None,
               'proposal_status': 'EXACT_DIRECT_SCOPE_RECORDED' if result['plan'] else 'BLOCKED',
               'proposed_bindings': tuples,
               'proposed_role_definitions': [expected_role(k) for k in ROLE_IDS] if result['plan'] else [],
               'proposed_provider_enablement': [VARIABLES[n] for n in VARIABLES if n.endswith('_WIF_PROVIDER')] if result['plan'] else [],
               'proposed_identity_variables': VARIABLES if result['plan'] else {}, 'enable_flags': {n: 'KEEP_UNSET' for n in FLAGS},
               'errors': result['errors'], 'effective_unknown_count': result['effective_audit']['unknown_count'],
               'current_effective_grants': grants,
               'current_effective_denied_count': sum(p['observed_access'] == 'CANNOT_ACCESS' for p in result['effective_audit']['probes']),
               'effective_untested': result['effective_audit'].get('untested', []),
               'predefined_role_observations': [{'role': role, 'status': 'READ' if value else 'UNKNOWN',
                    'permission_count': len(value['includedPermissions']) if value else None,
                    'definition_sha256': digest(value) if value else None}
                    for role, value in result.get('predefined_roles', {}).items()],
               'effective_scope_limit': result['effective_audit']['limit'],
               'prior_file_statuses': [{'path': r['path'], 'status': r['status']} for r in prior['files']],
               'private_output': str(output), 'owner_approval': 'STOP. Explicit approval of the new IAM scope is still required; this collector cannot apply it.'}
    private_json(output / 'summary.json', summary)
    manifest = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(output.iterdir()) if p.is_file()}
    private_json(output / 'SHA256SUMS.json', manifest)
    summary['manifest_sha256'] = hashlib.sha256((output / 'SHA256SUMS.json').read_bytes()).hexdigest()
    return summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--helper-sha', required=True)
    parser.add_argument('--release-source', required=True)
    parser.add_argument('--publish-claims-run', type=int, required=True)
    parser.add_argument('--release-claims-run', type=int, required=True)
    parser.add_argument('--output-dir', required=True)
    args = parser.parse_args()
    try:
        clean_source(args.release_source, args.helper_sha)
        client = Live(args.release_source, {'publish': args.publish_claims_run, 'release': args.release_claims_run})
        summary = collect_to_directory(client, args.release_source, args.helper_sha, args.output_dir)
        print(json.dumps(summary, indent=2, sort_keys=True))
        if summary['status'] != 'READ_ONLY_REVIEW_COMPLETE': raise SystemExit(2)
    except (SetupError, release.ReleaseError, OSError, ValueError, KeyError, TypeError) as error:
        print(json.dumps({'status': 'READ_ONLY_REVIEW_STOPPED', 'mutations': 0,
                          'reason': str(error) if isinstance(error, (SetupError, release.ReleaseError))
                          else 'Private storage, input, or API response could not be verified',
                          'instruction': 'Preserve partial output. No new IAM grant, provider, flag, image or traffic change was attempted.'}))
        raise SystemExit(2) from None


if __name__ == '__main__': main()
