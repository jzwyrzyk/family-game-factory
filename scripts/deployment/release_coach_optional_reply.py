#!/usr/bin/env python3
"""PR133 optional reply recovery using the pinned, previously exercised release primitives.

Default is a read-only cloud plan. --execute publishes one immutable coach image,
stages it with zero traffic, verifies the preserved serving configuration and
promotes only factory-coach-private. Reuse the same private state directory to
recover an interrupted operation; an attempted mutation is never resubmitted.
--rollback restores the captured coach traffic without a build or provider call.
Use a fresh coach-reply-repair-<source>/state journal; the previous diagnostics
journal remains the recovery authority for its own pinned release. No model
request, secret-value read, gateway write, Pages or worker release occurs.
"""
import argparse
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import uuid

PRIMITIVES_SHA = '804574895d8ab86fe270e590ecfa05fa5d4bc290'
APPROVED_TESTED_SOURCE = 'd0e967ecd32fff3a8b7b1567ddc153c43b67747c'
DEPLOYED_SOURCE = '1996c1b382a797a6052ee1304867fdb5b620c3d3'
DEPLOYED_COACH = 'factory-coach-private-chatready-1996c1b382a7-9c98a0'
RELEASE_PURPOSE = 'coach-optional-reply-repair'
# PR117's three Pal COPY allowlist entries, already on the approved main base.
APPROVED_DOCKERIGNORE_BLOB = 'a1dc71d4b19121f33ca69d9e65fa3f8c5251f858'
PRIVATE_SCOPE = ('server/coach', 'server/Dockerfile.coach', 'server/trusted-devices.ts',
    'server/privacy/parent-consent.ts', 'server/adult-pilot.ts', 'server/pipeline/auth.ts',
    'src/studio/design.ts', 'src/studio/creation-readiness.ts', 'src/studio/conversation-view.ts',
    'package-lock.json', '.dockerignore')
ALLOWED_READINESS_FILES = {'server/coach/private-provider.ts', 'server/coach/private-executor.ts'}


class Stop(RuntimeError):
    pass


SAFE_ERRORS = (Stop,)


def safe_error(error):
    code = str(error)
    return code if isinstance(error, SAFE_ERRORS) and re.fullmatch('[A-Za-z0-9_]+', code) else 'COACH_RELEASE_STOPPED_RETAIN_PRIVATE_JOURNAL'


def need(ok, code):
    if not ok:
        raise Stop(code)


def git(root, *args):
    result = subprocess.run(['git', *args], cwd=root, capture_output=True, text=True, timeout=60)
    need(result.returncode == 0, 'LOCAL_SOURCE_READ_FAILED')
    return result.stdout.strip()


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    need(spec is not None and spec.loader is not None, 'RELEASE_MODULE_UNAVAILABLE')
    result = importlib.util.module_from_spec(spec)
    sys.modules[name] = result
    spec.loader.exec_module(result)
    return result


def libraries(root, primitives):
    """Isolate imports; the old guards use the current, complete source archiver."""
    need(git(primitives, 'rev-parse', 'HEAD') == PRIMITIVES_SHA
         and not git(primitives, 'status', '--porcelain'), 'PINNED_CLEAN_RELEASE_PRIMITIVES_REQUIRED')
    names = ('build', 'build_coach', 'continuity', 'preactivation_audit', 'release_services')
    prior = {name: sys.modules.get(name) for name in names}
    try:
        publisher = module('build', root / 'scripts/deployment/build.py')
        coach = module('build_coach', root / 'scripts/deployment/build_coach.py')
        for name in ('continuity', 'preactivation_audit', 'release_services'):
            module(name, primitives / ('scripts/deployment/' + name + '.py'))
        guards = sys.modules['release_services']
    finally:
        for name, value in prior.items():
            if value is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = value
    guards.ORDER = ('coach',)
    global SAFE_ERRORS
    SAFE_ERRORS = (Stop, guards.Stop)

    def build_config(source, archive, nonce):
        config = coach.config_for(guards.REGION, source)
        tag = config['images'][0]
        config['steps'][0]['args'][2:2] = ['--label', 'org.jems.source.archive.sha256=' + archive]
        config['steps'].append({'name': 'gcr.io/cloud-builders/docker', 'args': [
            'run', '--rm', '--network', 'none', '--entrypoint', 'node', tag,
            '--input-type=module', '-e',
            'if(process.getuid()===0)throw Error("NON_ROOT_REQUIRED");await import("./private-executor.mjs");']})
        config['tags'] = ['jems-coach-reply-repair', 'source-' + source, 'release-' + nonce]
        return config

    def source_current(source, operator=root):
        current = guards.gh('branches/main')
        head = current.get('commit', {}).get('sha', '')
        need(current.get('protected') is True and re.fullmatch('[a-f0-9]{40}', head), 'PROTECTED_MAIN_REQUIRED')
        guards.command(['git', 'fetch', '--quiet', '--no-tags', 'https://github.com/' + guards.REPO + '.git', head], operator)
        guards.command(['git', 'merge-base', '--is-ancestor', source, head], operator)
        need(not git(operator, 'diff', '--name-only', source, head, '--', *PRIVATE_SCOPE)
             and package_runtime(operator, source) == package_runtime(operator, head),
             'NEWER_PRIVATE_COACH_RUNTIME_REQUIRES_REVIEW')
        return head

    def peers(cloud, state, target=None):
        for key in guards.ORDER:
            if key != target:
                guards.verify_stable(cloud, state, key)
        guards.verify_untouched(cloud, {'services': {'gateway': {'baseline': state['gatewayGuard']}}}, 'gateway')

    class CoachCloud(guards.Cloud):
        def resource(self, kind, name, body=None, validate=False, missing=False):
            need(body is None or kind == 'services' and name == guards.COACH, 'ONLY_PRIVATE_COACH_WRITE_ALLOWED')
            return super().resource(kind, name, body, validate, missing)

    guards.build_config, guards.assert_source_current, guards.verify_peers = build_config, source_current, peers
    return guards, publisher, CoachCloud


def package_runtime(root, sha):
    value = json.loads(git(root, 'show', sha + ':package.json'))
    value.pop('scripts', None)
    return value


def scope(root, source):
    changed = set(git(root, 'diff', '--name-only', DEPLOYED_SOURCE, source, '--', *PRIVATE_SCOPE).splitlines())
    need(changed <= ALLOWED_READINESS_FILES | {'.dockerignore'}
         and git(root, 'rev-parse', source + ':.dockerignore') == APPROVED_DOCKERIGNORE_BLOB
         and package_runtime(root, DEPLOYED_SOURCE) == package_runtime(root, source),
         'SOURCE_EXCEEDS_PRIVATE_COACH_REPLY_SCOPE')
    # The selected source's archiver must match the reviewed operator's archiver.
    for name in ('build.py', 'build_coach.py'):
        expected = git(root, 'show', source + ':scripts/deployment/' + name)
        need(expected == (root / 'scripts/deployment' / name).read_text().strip(), 'SOURCE_PUBLISHER_DIFFERS')


def candidate(source, nonce):
    return 'factory-coach-private-chatmeta-' + source[:12] + '-' + nonce[:6]


def require_state_directory(directory, source):
    need(re.fullmatch('[a-f0-9]{40}', source) and directory.name == 'state'
         and directory.parent.name == 'coach-reply-repair-' + source,
         'COACH_REPLY_SOURCE_KEYED_STATE_DIRECTORY_REQUIRED')


def validate(guards, state):
    need(state.get('version') == 1 and state.get('purpose') == RELEASE_PURPOSE
         and state.get('primitives') == PRIMITIVES_SHA
         and re.fullmatch('[a-f0-9]{32}', state.get('nonce', '')), 'JOURNAL_IDENTITY_INVALID')
    need(set(state.get('services', {})) == {'coach'}
         and state.get('bucket') == f'{guards.PROJECT}-service-builds-{guards.REGION}', 'JOURNAL_SCOPE_INVALID')
    build, record = state['build'], state['services']['coach']
    need(re.fullmatch('[a-f0-9]{64}', build.get('archive', ''))
         and build.get('config') == guards.build_config(state['source'], build['archive'], state['nonce']),
         'JOURNAL_BUILD_CONFIGURATION_DIFFERS')
    need(build.get('phase') in ('prepared', 'attempted', 'verified'), 'JOURNAL_BUILD_PHASE_INVALID')
    if build['phase'] == 'prepared':
        need(not any(key in build for key in ('id', 'images', 'resolvedSource')), 'JOURNAL_PREPARED_BUILD_HAS_ATTEMPT')
    if build['phase'] == 'attempted':
        need(not any(key in build for key in ('images', 'resolvedSource')), 'JOURNAL_ATTEMPT_HAS_VERIFIED_FIELDS')
    if build.get('id'):
        need(re.fullmatch('[a-f0-9-]{36}', build['id']), 'JOURNAL_BUILD_ID_INVALID')
    if build['phase'] == 'verified':
        need(bool(build.get('id')) and set(build.get('images', {})) == {'coach'}
             and isinstance(build.get('resolvedSource'), dict)
             and re.fullmatch(re.escape(guards.REGISTRIES['coach']) + r'@sha256:[a-f0-9]{64}', build['images']['coach']),
             'JOURNAL_VERIFIED_BUILD_INCOMPLETE')
    need(record.get('candidate') == candidate(state['source'], state['nonce']), 'JOURNAL_CANDIDATE_DIFFERS')
    for key, before in (('coach', record['baseline']), ('gateway', state['gatewayGuard'])):
        name = guards.SERVICES[key]
        need(before['service']['metadata']['name'] == name
             and before['service']['metadata']['namespace'] in (guards.PROJECT, guards.NUMBER)
             and guards.image(before['revision'], guards.REGISTRIES[key]) == before['image']
             and before['traffic'] == guards.routes(before['service'], service_name=name)
             == guards.routes(before['service'], True, name)
             and guards.template(before['service']['spec']['template']) == guards.template(before['revision']),
             'JOURNAL_BASELINE_INVALID')
        guards.pinned_secrets(before['revision'])
    need(record['baseline']['revision']['metadata']['name'] == DEPLOYED_COACH, 'JOURNAL_APPROVED_BASELINE_DIFFERS')
    for step in ('stage', 'promotion', 'rollback'):
        if step not in record:
            continue
        entry = record[step]
        need(build['phase'] == 'verified' and entry.get('phase') in ('attempted', 'verified'), 'JOURNAL_TRANSITION_INVALID')
        if step == 'rollback' and 'request' not in entry:
            need(state.get('rollbackRequested') is True and entry['phase'] == 'verified', 'JOURNAL_ROLLBACK_INVALID')
            continue
        body, before = entry.get('request', {}), record['baseline']
        need(guards.envelope(body) == guards.envelope(before['service'])
             and bool(body['metadata'].get('resourceVersion'))
             and guards.template(body['spec']['template']) == guards.template(guards.candidate_template(state, 'coach'))
             and body['spec']['template']['metadata'].get('name') == record['candidate']
             and guards.routes(body, service_name=guards.COACH) ==
             (guards.promoted_routes(state, 'coach') if step == 'promotion' else before['traffic']),
             'JOURNAL_RECORDED_REQUEST_DIFFERS')
    if 'promotion' in record:
        need(record.get('stage', {}).get('phase') == 'verified', 'JOURNAL_PROMOTION_PRECEDES_VERIFIED_STAGE')


def identity(guards, gateway, coach):
    caller = f'factory-gateway@{guards.PROJECT}.iam.gserviceaccount.com'
    origin = coach['service']['status'].get('url', '')
    need(re.fullmatch(r'https://factory-coach-private-[a-z0-9.-]+\.run\.app', origin), 'COACH_ORIGIN_UNVERIFIED')
    env = coach['revision']['spec']['containers'][0].get('env', [])
    for name, value in (('FACTORY_COACH_PRIVATE_AUDIENCE', origin), ('FACTORY_COACH_GATEWAY_SERVICE_ACCOUNT', caller)):
        rows = [row for row in env if row.get('name') == name]
        need(len(rows) == 1 and rows[0].get('value') == value and 'valueFrom' not in rows[0], 'COACH_CALLER_BINDING_DIFFERS')
    need(gateway['revision']['spec'].get('serviceAccountName') == caller, 'GATEWAY_IDENTITY_DIFFERS')


def run(root, application, primitives, directory, source, tested, execute=False, restore=False):
    need(tested == APPROVED_TESTED_SOURCE, 'EXACT_PR133_TESTED_SOURCE_REQUIRED')
    require_state_directory(directory, source)
    guards, publisher, Cloud = libraries(root, primitives)
    proof = guards.local_source(root, source, tested) if restore else guards.verify_source(root, source, tested)
    need(str(publisher.cloud('projects', 'describe', guards.PROJECT).get('projectNumber')) == guards.NUMBER, 'PROJECT_IDENTITY_CHANGED')
    cloud, path = Cloud(), directory / 'release.json'
    if path.exists():
        need(not path.is_symlink() and path.stat().st_mode & 0o077 == 0, 'PRIVATE_JOURNAL_REQUIRED')
        state = json.loads(path.read_text())
        need(all(state.get(key) == proof[key] for key in ('source', 'tested', 'tool')), 'JOURNAL_SOURCE_OR_TOOL_DIFFERS')
        validate(guards, state)
    else:
        need(not restore, 'ROLLBACK_REQUIRES_ORIGINAL_JOURNAL')
        scope(root, source)
        guards.application_checkout(application, source)
        before, gateway = guards.snapshot(cloud, 'coach'), guards.snapshot(cloud, 'gateway')
        need(before['revision']['metadata']['name'] == DEPLOYED_COACH, 'APPROVED_SERVING_BASELINE_CHANGED')
        identity(guards, gateway, before)
        # The approved PR131 source projects input and varies its response schema.
        # The historical primitive's static-schema helper cannot prove this cost.
        guards.budget_preflight(root, application, source, before['revision'])
        with tempfile.TemporaryDirectory(prefix='jems-coach-plan-') as temporary:
            _, archive = publisher.source_archive(application, temporary, source)
        nonce = uuid.uuid4().hex
        state = {**proof, 'version': 1, 'purpose': RELEASE_PURPOSE,
            'primitives': PRIMITIVES_SHA, 'nonce': nonce, 'gatewayGuard': gateway,
            'services': {'coach': {'baseline': before, 'candidate': candidate(source, nonce)}},
            'bucket': f'{guards.PROJECT}-service-builds-{guards.REGION}',
            'build': {'phase': 'prepared', 'archive': archive, 'config': guards.build_config(source, archive, nonce)}}
        if execute:
            guards.save(path, state)
    if restore:
        need('stage' in state['services']['coach'], 'NO_COACH_STAGE_TO_ROLL_BACK')
        state['rollbackRequested'] = True
        guards.save(path, state)
        guards.rollback_one(cloud, state, path, 'coach')
        print(json.dumps({'status': 'COACH_REPLY_REPAIR_ROLLED_BACK', 'revision': DEPLOYED_COACH}))
        return
    need(not state.get('rollbackRequested'), 'ROLLED_BACK_RELEASE_CANNOT_REPROMOTE')
    scope(root, source)
    guards.application_checkout(application, source)
    with tempfile.TemporaryDirectory(prefix='jems-coach-recheck-') as temporary:
        _, archive = publisher.source_archive(application, temporary, source)
    need(archive == state['build']['archive'], 'JOURNAL_SOURCE_ARCHIVE_DIFFERS')
    print(json.dumps({'status': 'COACH_REPLY_REPAIR_PLAN', 'source': source, 'tested': tested,
        'baseline': DEPLOYED_COACH, 'candidate': state['services']['coach']['candidate'],
        'archiveSha256': archive, 'execute': execute, 'gatewayWrite': False, 'providerCall': False}), flush=True)
    if not execute:
        guards.verify_peers(cloud, state)
        return
    guards.publish(root, application, cloud, state, path)
    for promoted in (False, True):
        step = 'promotion' if promoted else 'stage'
        if state['services']['coach'].get(step, {}).get('phase') != 'verified':
            guards.transition(root, cloud, state, path, 'coach', promoted)
    guards.verify_peers(cloud, state)
    print(json.dumps({'status': 'COACH_REPLY_REPAIR_SERVING', 'source': source, 'tested': tested,
        'tool': state['tool'], 'primitives': PRIMITIVES_SHA, 'buildId': state['build']['id'],
        'archiveSha256': archive, 'revision': state['services']['coach']['candidate'],
        'image': state['build']['images']['coach'], 'rollbackRevision': DEPLOYED_COACH,
        'gatewayUnchanged': True, 'conversationVerified': False, 'providerCall': False}), flush=True)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    for flag in ('reviewed-source-sha', 'tested-source-sha', 'application-dir', 'primitives-dir', 'state-dir'):
        parser.add_argument('--' + flag, required=True)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--execute', action='store_true')
    mode.add_argument('--rollback', action='store_true')
    args = parser.parse_args(argv)
    root = Path(__file__).resolve().parents[2]
    application, primitives = Path(args.application_dir).resolve(), Path(args.primitives_dir).resolve()
    directory = Path(args.state_dir).absolute()
    require_state_directory(directory, args.reviewed_source_sha)
    need(not directory.is_symlink() and all(not directory.is_relative_to(path) for path in (root, application, primitives)),
         'PRIVATE_EXTERNAL_STATE_DIRECTORY_REQUIRED')
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    need(directory.stat().st_mode & 0o077 == 0, 'STATE_DIRECTORY_MUST_BE_PRIVATE')
    descriptor = os.open(directory / 'release.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        run(root, application, primitives, directory, args.reviewed_source_sha, args.tested_source_sha, args.execute, args.rollback)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Only fixed symbolic codes are emitted; never serialize cloud stderr,
        # a service template, secret reference map or arbitrary exception text.
        print(safe_error(error), file=sys.stderr)
        sys.exit(2)
