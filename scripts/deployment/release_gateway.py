#!/usr/bin/env python3
"""Manual, journaled gateway image release using existing owner credentials.

Default: read-only plan. --execute publishes one gateway image, stages it with
zero traffic, promotes it and checks health. Never grants access, changes paid
approval, deploys another service, or automatically repeats an attempted write.
An interrupted operation resumes by reading its private journal and cloud state.
"""
import argparse
import copy
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import uuid

import build as publisher
import continuity
import preactivation_audit

REPO = 'jzwyrzyk/family-game-factory'
PROJECT = publisher.PROJECT
NUMBER = '1054529152893'
REGION = 'us-east5'
SERVICE = 'factory-gateway'
COACH = 'factory-coach-private'
COACH_SOURCE = 'c43a18148421ea22edfba5f7e891530678ad4f4f'
COACH_IMAGE = (f'{REGION}-docker.pkg.dev/{PROJECT}/factory-services/coach@sha256:'
               '52e0bd8c0565e3ccf85ce6e111909d2cdc9446bfce159b7d62c92db1c24a8f54')
REGISTRY = f'{REGION}-docker.pkg.dev/{PROJECT}/factory-services/gateway'
API = f'https://{REGION}-run.googleapis.com/apis/serving.knative.dev/v1/namespaces/{PROJECT}'
HEALTH = 'https://factory-gateway-ola734esta-ul.a.run.app/health'
CHECKS = {'Jems operations policy', 'Documentation references', 'browser',
          'learning', 'creative', 'private-coach-image', 'service-images'}
ROOT = Path(__file__).resolve().parents[2]
READ_ONLY_ANNOTATIONS = {'serving.knative.dev/creator', 'serving.knative.dev/lastModifier',
    'run.googleapis.com/operation-id', 'run.googleapis.com/ingress-status',
    'run.googleapis.com/urls', 'run.googleapis.com/startupProbeType'}


class Stop(RuntimeError):
    pass


def need(value, code):
    if not value:
        raise Stop(code)


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def command(args, root=None):
    result = subprocess.run(args, cwd=root, capture_output=True, text=True, timeout=60)
    need(result.returncode == 0, 'AUTHENTICATED_COMMAND_FAILED_' + args[0])
    return result.stdout.strip()


def gh(path):
    return json.loads(command(['gh', 'api', f'repos/{REPO}/' + path]))


def local_source(root, source, tested):
    need(all(re.fullmatch('[a-f0-9]{40}', x) for x in (source, tested)), 'FULL_SOURCE_SHA_REQUIRED')
    need(not command(['git', 'status', '--porcelain'], root), 'CLEAN_TOOL_CHECKOUT_REQUIRED')
    need(command(['git', 'rev-parse', source + '^{tree}'], root)
         == command(['git', 'rev-parse', tested + '^{tree}'], root), 'TESTED_TREE_DIFFERS')
    return {'source': source, 'tested': tested, 'tool': command(['git', 'rev-parse', 'HEAD'], root)}


def assert_source_current(source, root=ROOT):
    main = gh('branches/main')
    need(main.get('protected') is True, 'PROTECTED_MAIN_REQUIRED')
    head = main.get('commit', {}).get('sha', '')
    need(re.fullmatch('[a-f0-9]{40}', head), 'MAIN_SHA_UNAVAILABLE')
    # Fetch only the observed immutable commit; never trust an old local main.
    command(['git', 'fetch', '--quiet', '--no-tags', f'https://github.com/{REPO}.git', head], root)
    command(['git', 'merge-base', '--is-ancestor', source, head], root)
    need(not command(['git', 'diff', '--name-only', source, head, '--', *publisher.SERVICE_SCOPE], root),
         'NEWER_SERVICE_SOURCE_ON_MAIN_RELEASE_REVIEW_REQUIRED')
    return head


def verify_source(root, source, tested):
    proof = local_source(root, source, tested)
    repo = json.loads(command(['gh', 'api', f'repos/{REPO}']))
    need(repo['id'] == 1458033181 and repo['owner']['id'] == 356692244, 'REPOSITORY_IDENTITY_CHANGED')
    proof['main'] = assert_source_current(source, root)
    checks = gh(f'commits/{tested}/check-runs?per_page=100')
    need(checks.get('total_count', 0) <= 100, 'CHECK_PAGINATION_REQUIRES_REVIEW')
    latest = {}
    for check in sorted(checks.get('check_runs', []), key=lambda x: x['id']):
        if check.get('app', {}).get('id') == 15368:
            need(check.get('head_sha') == tested, 'CHECK_SOURCE_DIFFERS')
            latest[check['name']] = check
    need(CHECKS <= latest.keys(), 'REQUIRED_CI_MISSING')
    need(all(latest[name].get('conclusion') == 'success' for name in CHECKS), 'REQUIRED_CI_NOT_SUCCESSFUL')
    need(all(c.get('status') == 'completed' and c.get('conclusion') in ('success', 'skipped', 'neutral')
             for c in latest.values()), 'SOURCE_CHECKS_NOT_FINISHED_SUCCESSFULLY')
    return proof


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


class Cloud:
    def __init__(self):
        self.token = None
        self.opener = urllib.request.build_opener(NoRedirect)

    def resource(self, kind, name, body=None, validate=False, missing=False):
        need((kind == 'services' and name == SERVICE) or
             (kind == 'revisions' and re.fullmatch(SERVICE + r'-[a-z0-9-]+', name)), 'RESOURCE_OUT_OF_SCOPE')
        need(body is None or kind == 'services', 'WRITE_OUT_OF_SCOPE')
        # Obtain a fresh short-lived token for each request; never persist it.
        token = command(['gcloud', 'auth', 'print-access-token', '--quiet'])
        request = urllib.request.Request(API + '/' + kind + '/' + name + ('?dryRun=all' if validate else ''),
            method='GET' if body is None else 'PUT',
            data=None if body is None else json.dumps(body).encode(),
            headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
        try:
            with self.opener.open(request, timeout=45) as response:
                data = json.loads(response.read(2 * 1024 * 1024))
        except urllib.error.HTTPError as error:
            if missing and body is None and error.code == 404:
                return None
            raise Stop('CLOUD_HTTP_' + str(error.code) + '_INSPECT_JOURNAL_BEFORE_CONTINUING') from None
        except (OSError, ValueError):
            raise Stop('CLOUD_RESPONSE_UNKNOWN_INSPECT_JOURNAL_BEFORE_CONTINUING') from None
        need(isinstance(data, dict), 'INVALID_CLOUD_RESPONSE')
        return data

    def iam(self):
        return publisher.cloud('run', 'services', 'get-iam-policy', SERVICE, '--region', REGION)

    def health(self):
        try:
            request = urllib.request.Request(HEALTH, headers={'Cache-Control': 'no-cache'})
            with self.opener.open(request, timeout=20) as response:
                data = json.loads(response.read(4096))
        except (OSError, ValueError):
            raise Stop('GATEWAY_HEALTH_UNAVAILABLE') from None
        need(data.get('ready') is True and type(data.get('paidExecution')) is bool, 'GATEWAY_NOT_HEALTHY')
        return {'ready': True, 'paidExecution': data['paidExecution']}

    def compatible_coach(self, gateway):
        return coach_compatibility(gateway)


def annotations(meta):
    return {k: v for k, v in meta.get('annotations', {}).items() if k not in READ_ONLY_ANNOTATIONS}


def template(revision):
    meta = revision.get('metadata', {})
    labels = {k: v for k, v in meta.get('labels', {}).items()
              if not k.startswith(('serving.knative.dev/', 'cloud.googleapis.com/'))
              and k not in ('run.googleapis.com/satisfiesPzs', 'client.knative.dev/nonce')}
    return {'metadata': {'labels': labels, 'annotations': annotations(meta)},
            'spec': copy.deepcopy(revision['spec'])}


def envelope(service):
    meta = service['metadata']
    spec = {k: v for k, v in service['spec'].items() if k not in ('template', 'traffic')}
    return {'name': meta['name'], 'namespace': meta['namespace'],
            'labels': meta.get('labels', {}), 'annotations': annotations(meta), 'spec': spec}


def routes(service, observed=False, service_name=SERVICE):
    rows = service.get('status' if observed else 'spec', {}).get('traffic', [])
    result = []
    for row in rows:
        percent = row.get('percent') or 0
        if percent == 0 and not row.get('tag'):
            continue
        name = row.get('revisionName')
        need(not row.get('latestRevision') and isinstance(name, str)
             and re.fullmatch(re.escape(service_name) + r'-[a-z0-9-]+', name)
             and type(percent) is int and 0 <= percent <= 100, 'EXPLICIT_RESOLVED_TRAFFIC_REQUIRED')
        item = {'revisionName': name, 'percent': percent}
        if row.get('tag'):
            need(percent == 0 and isinstance(row['tag'], str), 'TAGGED_PERCENTAGE_REQUIRES_SEPARATE_REVIEW')
            item['tag'] = row['tag']
        result.append(item)
    need(sum(r['percent'] for r in result) == 100 and
         len({r.get('tag') for r in result if r.get('tag')}) == sum(bool(r.get('tag')) for r in result),
         'AMBIGUOUS_TRAFFIC')
    return sorted(result, key=lambda x: (x.get('tag', ''), x['revisionName'], x['percent']))


def conditions(resource):
    rows = resource.get('status', {}).get('conditions', [])
    need(isinstance(rows, list) and all(isinstance(x, dict) and isinstance(x.get('type'), str)
                                      for x in rows), 'INVALID_CONDITIONS')
    result = {x['type']: x for x in rows}
    need(len(result) == len(rows), 'DUPLICATE_CONDITION')
    return result


def observed(resource):
    generation = resource.get('metadata', {}).get('generation')
    actual = resource.get('status', {}).get('observedGeneration')
    return (type(generation) is int and generation > 0
            and type(actual) is int and actual == generation)


def settled(service):
    rows = conditions(service)
    return (observed(service) and rows.get('Ready', {}).get('status') == 'True'
            and all(x.get('status') == 'True' for x in rows.values()))


def active(revision):
    rows = conditions(revision)
    return (observed(revision)
            and all(rows.get(k, {}).get('status') == 'True' for k in ('Ready', 'Active', 'ResourcesAvailable'))
            and all(x.get('status') == 'True' and x.get('reason') not in ('Retired', 'Retiring') for x in rows.values()))


def stored_retired(revision):
    rows = conditions(revision)
    expected = {'Ready': ('True', 'Retired'), 'Active': ('False', 'Retired'),
                'ResourcesAvailable': ('Unknown', 'Retired')}
    return (observed(revision) and all((rows.get(name, {}).get('status'), rows.get(name, {}).get('reason')) == value
                for name, value in expected.items())
            and rows.get('ContainerReady', {}).get('status') == 'True'
            and all(row.get('status') == 'True' for name, row in rows.items() if name not in expected))


def image(revision, registry=REGISTRY):
    containers = revision.get('spec', {}).get('containers', [])
    need(len(containers) == 1, 'SINGLE_GATEWAY_CONTAINER_REQUIRED')
    value = containers[0].get('image', '')
    need(re.fullmatch(re.escape(registry) + r'@sha256:[a-f0-9]{64}', value), 'IMMUTABLE_SERVICE_IMAGE_REQUIRED')
    need(revision.get('status', {}).get('imageDigest', '').endswith('@' + value.split('@')[1])
         or revision.get('status', {}).get('imageDigest') == value.split('@')[1], 'OBSERVED_IMAGE_DIGEST_DIFFERS')
    return value


def pinned_secrets(revision):
    """Identical 'latest' references may resolve new configuration on restart."""
    mounted = set()
    def numeric(value):
        need(isinstance(value, str) and re.fullmatch('[1-9][0-9]*', value), 'ACTIVE_SECRET_VERSION_NOT_PINNED')
    spec = revision.get('spec', {})
    for container in spec.get('containers', []):
        for entry in container.get('env', []):
            reference = entry.get('valueFrom', {}).get('secretKeyRef')
            if reference is not None:
                numeric(reference.get('key'))
        mounted.update(row.get('name') for row in container.get('volumeMounts', []))
    for volume in spec.get('volumes', []):
        if volume.get('name') not in mounted or 'secret' not in volume:
            continue
        items = volume['secret'].get('items', [])
        need(bool(items), 'ACTIVE_SECRET_VERSION_NOT_PINNED')
        for entry in items:
            numeric(entry.get('key'))


def coach_compatibility(gateway, read=None, read_secret=None):
    """Read the exact reviewed peer and consumed gateway binding; no peer writes.

    PR109's source-pinned publication receipt ties COACH_IMAGE to COACH_SOURCE.
    The gateway config payload exists only in this function's memory. Its key,
    tokens, family/workspace, approval and other fields are never persisted.
    """
    read = read or publisher.cloud
    read_secret = read_secret or command
    service = read('run', 'services', 'describe', COACH, '--region', REGION)
    need(service.get('metadata', {}).get('name') == COACH
         and service['metadata'].get('namespace') in (PROJECT, NUMBER)
         and settled(service), 'COMPATIBLE_COACH_NOT_SETTLED')
    traffic = routes(service, service_name=COACH)
    need(traffic == routes(service, True, COACH), 'COACH_TRAFFIC_STILL_RECONCILING')
    serving = [row for row in traffic if row['percent']]
    need(len(serving) == 1 and serving[0]['percent'] == 100, 'ONE_COMPATIBLE_COACH_BASELINE_REQUIRED')
    name = serving[0]['revisionName']
    revision = read('run', 'revisions', 'describe', name, '--region', REGION)
    need(revision.get('metadata', {}).get('name') == name and active(revision), 'COMPATIBLE_COACH_NOT_ACTIVE')
    need(image(revision, COACH_IMAGE.split('@')[0]) == COACH_IMAGE, 'REVIEWED_COACH_IMAGE_NOT_SERVING')
    origin = service.get('status', {}).get('url', '')
    need(re.fullmatch(r'https://factory-coach-private-[a-z0-9.-]+\.run\.app', origin), 'COACH_ORIGIN_UNVERIFIED')
    environment = revision['spec']['containers'][0].get('env', [])
    def literal(name):
        rows = [row for row in environment if row.get('name') == name]
        need(len(rows) == 1 and isinstance(rows[0].get('value'), str) and 'valueFrom' not in rows[0],
             'COACH_CALLER_OR_AUDIENCE_UNVERIFIED')
        return rows[0]['value']
    caller = f'factory-gateway@{PROJECT}.iam.gserviceaccount.com'
    need(literal('FACTORY_COACH_PRIVATE_AUDIENCE') == origin
         and literal('FACTORY_COACH_GATEWAY_SERVICE_ACCOUNT') == caller
         and gateway['spec']['template']['spec'].get('serviceAccountName') == caller,
         'GATEWAY_COACH_IDENTITY_BINDING_DIFFERS')
    try:
        # Reuse the existing audited consumed-mount proof; never enumerate or
        # read an orphaned volume, another secret, or the mutable latest alias.
        preactivation_audit.require_consumed_config_mount(gateway)
        mounted = continuity.mounted_config(gateway)
        need(mounted is not None and mounted[0] == 'factory-gateway-private-config'
             and re.fullmatch('[1-9][0-9]*', mounted[1]), 'PINNED_GATEWAY_CONFIG_REQUIRED')
        raw = read_secret(['gcloud', 'secrets', 'versions', 'access', mounted[1],
                           '--secret=' + mounted[0], '--project=' + PROJECT, '--quiet'])
        need(len(raw) <= 131072, 'GATEWAY_BINDING_CONFIG_INVALID')
        config = json.loads(raw)
        need(isinstance(config, dict) and config.get('coachPrivateOrigin') == origin,
             'GATEWAY_POINTS_TO_DIFFERENT_COACH')
        del raw, config
    except (preactivation_audit.AuditError, continuity.ContinuityError, ValueError, TypeError):
        raise Stop('GATEWAY_COACH_BINDING_UNVERIFIED') from None
    return {'service': COACH, 'revision': name, 'source': COACH_SOURCE,
            'image': COACH_IMAGE, 'origin': origin, 'gatewayConfigVersion': mounted[1]}


def verify_peer(cloud, state):
    need(cloud.compatible_coach(state['baseline']['service']) == state['coach'],
         'COMPATIBLE_COACH_CHANGED_DURING_RELEASE')


def snapshot(cloud):
    service = cloud.resource('services', SERVICE)
    need(service['metadata'].get('namespace') in (PROJECT, NUMBER) and settled(service), 'GATEWAY_NOT_SETTLED')
    traffic = routes(service)
    need(traffic == routes(service, True), 'TRAFFIC_STILL_RECONCILING')
    positive = [x for x in traffic if x['percent']]
    need(len(positive) == 1 and positive[0]['percent'] == 100, 'ONE_SERVING_BASELINE_REQUIRED')
    baseline = cloud.resource('revisions', positive[0]['revisionName'])
    need(baseline['metadata']['name'] == positive[0]['revisionName'] and active(baseline), 'BASELINE_NOT_ACTIVE')
    old_image = image(baseline)
    pinned_secrets(baseline)
    need(template(service['spec']['template']) == template(baseline), 'TEMPLATE_DIFFERS_FROM_SERVING_BASELINE')
    need(service['status'].get('latestCreatedRevisionName') == baseline['metadata']['name']
         and service['status'].get('latestReadyRevisionName') == baseline['metadata']['name'], 'OTHER_STAGED_REVISION_PRESENT')
    need(bool(service['metadata'].get('resourceVersion')), 'CAS_VERSION_MISSING')
    return {'service': service, 'revision': baseline, 'iam': cloud.iam(), 'health': cloud.health(),
            'image': old_image, 'traffic': traffic}


def request_body(service, new_template, traffic):
    result = {'apiVersion': 'serving.knative.dev/v1', 'kind': 'Service',
              'metadata': {k: copy.deepcopy(service['metadata'][k])
                           for k in ('name', 'namespace', 'resourceVersion')},
              'spec': copy.deepcopy(service['spec'])}
    result['metadata']['labels'] = copy.deepcopy(service['metadata'].get('labels', {}))
    result['metadata']['annotations'] = annotations(service['metadata'])
    result['spec']['template'] = copy.deepcopy(new_template)
    result['spec']['traffic'] = copy.deepcopy(traffic)
    return result


def verify_shape(current, before, expected_template, allowed_routes):
    need(envelope(current) == envelope(before), 'SERVICE_POLICY_CHANGED')
    need(template(current['spec']['template']) == template(expected_template)
         and current['spec']['template']['metadata'].get('name') == expected_template['metadata'].get('name'),
         'CANDIDATE_CONFIGURATION_CHANGED')
    need(routes(current) in allowed_routes and routes(current, True) in allowed_routes, 'TRAFFIC_CHANGED')


def verify_baseline(cloud, state):
    before = state['baseline']
    old = cloud.resource('revisions', before['revision']['metadata']['name'])
    pinned_secrets(old)
    # Once the candidate serves, the baseline may legitimately be retired.
    # Ready and immutable identity/configuration remain required for rollback.
    need(observed(old) and conditions(old).get('Ready', {}).get('status') == 'True'
         and image(old) == before['image'] and template(old) == template(before['revision']),
         'BASELINE_CHANGED')
    need(digest(cloud.iam()) == digest(before['iam']), 'IAM_CHANGED')


def save(path, state):
    descriptor, temporary = tempfile.mkstemp(prefix='release-', dir=path.parent)
    with os.fdopen(descriptor, 'w') as output:
        json.dump(state, output)
        output.flush()
        os.fsync(output.fileno())
    os.replace(temporary, path)


def build_config(source, archive_hash, nonce):
    tag = REGISTRY + ':' + source
    return {'steps': [
        {'name': 'gcr.io/cloud-builders/docker', 'args': ['build', '--pull', '--label',
            'org.opencontainers.image.revision=' + source, '--label',
            'org.jems.source.archive.sha256=' + archive_hash, '-f', 'server/Dockerfile.gateway', '-t', tag, '.']},
        {'name': 'gcr.io/cloud-builders/docker', 'args': ['run', '--rm', '--network', 'none', '--entrypoint', 'node',
            tag, '--import', 'tsx', '--input-type=module', '-e',
            'if(process.getuid()===0)throw Error("NON_ROOT_REQUIRED");await import("./server/gateway.ts");']}
        ], 'images': [tag], 'serviceAccount': f'projects/{PROJECT}/serviceAccounts/{publisher.BUILDER}',
        'options': {'logging': 'CLOUD_LOGGING_ONLY', 'machineType': 'E2_MEDIUM'},
        'timeout': '1200s', 'tags': ['jems-gateway-repair', 'source-' + source, 'release-' + nonce]}


def verify_build_shape(actual, config):
    need(all(actual.get(k) == config[k] for k in ('images', 'serviceAccount', 'tags')), 'BUILD_IDENTITY_DIFFERS')
    steps = actual.get('steps', [])
    runtime_metadata = {'status', 'pullTiming', 'timing', 'exitCode'}
    need(len(steps) == len(config['steps']) and all(
        {k: v for k, v in step.items() if k not in runtime_metadata} == expected
        for step, expected in zip(steps, config['steps'])), 'BUILD_STEPS_DIFFER')
    need(not actual.get('secrets') and not actual.get('availableSecrets'), 'UNEXPECTED_BUILD_SECRETS')


def publish(root, state, path):
    record = state['build']
    config = record['config']
    if record['phase'] == 'prepared':
        with tempfile.TemporaryDirectory(prefix='jems-gateway-source-') as directory:
            archive, sha = publisher.source_archive(root, directory, state['source'])
            need(sha == record['archive'], 'SOURCE_ARCHIVE_CHANGED')
            config_file = Path(directory) / 'build.json'
            config_file.write_text(json.dumps(config))
            publisher.preflight(REGION, state['bucket'])
            assert_source_current(state['source'], root)
            verify_peer(Cloud(), state)
            record['phase'] = 'attempted'
            save(path, state)
            actual = publisher.cloud('builds', 'submit', str(archive), '--config', str(config_file),
                '--region', REGION, '--gcs-source-staging-dir', 'gs://' + state['bucket'] + '/source', '--async')
            need(re.fullmatch('[a-f0-9-]{36}', actual.get('id', '')), 'BUILD_RESPONSE_MISSING_ID')
            record['id'] = actual['id']
            save(path, state)
    if not record.get('id'):
        matches = publisher.cloud('builds', 'list', '--region', REGION,
                                  '--filter', 'tags=release-' + state['nonce'], '--limit', '2')
        need(len(matches) == 1, 'BUILD_SUBMISSION_UNCERTAIN_NO_RESUBMISSION')
        verify_build_shape(matches[0], config)
        record['id'] = matches[0]['id']
        save(path, state)
    for attempt in range(241):
        actual = publisher.cloud('builds', 'describe', record['id'], '--region', REGION)
        verify_build_shape(actual, config)
        if actual.get('status') not in ('PENDING', 'QUEUED', 'WORKING'):
            break
        need(attempt < 240, 'BUILD_PENDING_RERUN_SAME_COMMAND_FOR_READ_ONLY_RECOVERY')
        if attempt % 6 == 0:
            print(json.dumps({'status': 'BUILD_PENDING', 'buildId': record['id']}), flush=True)
        time.sleep(5)
    need(actual.get('status') == 'SUCCESS', 'BUILD_NOT_SUCCESSFUL_NO_RESUBMISSION')
    results = actual.get('results', {}).get('images', [])
    need(len(results) == 1 and results[0].get('name') == config['images'][0]
         and re.fullmatch('sha256:[a-f0-9]{64}', results[0].get('digest', '')), 'BUILD_DIGEST_MISSING')
    candidate = REGISTRY + '@' + results[0]['digest']
    metadata = publisher.cloud('artifacts', 'docker', 'images', 'describe', candidate)
    need(metadata.get('image_summary', {}).get('digest') == results[0]['digest'], 'REGISTRY_DIGEST_DIFFERS')
    need(candidate != state['baseline']['image'], 'CANDIDATE_EQUALS_BASELINE')
    if 'image' in record:
        need(record['image'] == candidate, 'RECORDED_BUILD_DIGEST_CHANGED')
    record.update({'phase': 'verified', 'image': candidate})
    save(path, state)
    return candidate


def candidate_template(state):
    result = template(state['baseline']['revision'])
    result['metadata']['name'] = state['candidate']
    result['spec']['containers'][0]['image'] = state['build']['image']
    return result


def promote_traffic(state):
    return sorted([{'revisionName': state['candidate'], 'percent': 100}]
                  + [x for x in state['baseline']['traffic'] if x.get('tag')],
                  key=lambda x: (x.get('tag', ''), x['revisionName'], x['percent']))


def observe(cloud, state, promoted):
    verify_baseline(cloud, state)
    current = cloud.resource('services', SERVICE)
    old, new = state['baseline']['traffic'], promote_traffic(state)
    verify_shape(current, state['baseline']['service'], candidate_template(state), [old, new] if promoted else [old])
    need(current.get('status', {}).get('latestCreatedRevisionName') == state['candidate'], 'LATEST_CANDIDATE_CHANGED')
    revision = cloud.resource('revisions', state['candidate'], missing=True)
    if revision is None:
        return False
    need(revision['metadata']['name'] == state['candidate']
         and template(revision) == template(candidate_template(state)), 'CANDIDATE_REVISION_CHANGED')
    if conditions(revision).get('Ready', {}).get('status') == 'False':
        raise Stop('CANDIDATE_FAILED')
    if conditions(revision).get('Ready', {}).get('status') != 'True':
        return False
    need(image(revision) == state['build']['image'], 'CANDIDATE_DIGEST_DIFFERS')
    if promoted:
        return (settled(current) and active(revision) and routes(current) == new and routes(current, True) == new
                and current['status'].get('latestReadyRevisionName') == state['candidate'])
    # Stored retired revisions may be activated only through the subsequent
    # explicit traffic transition; this receipt is not a startup/health claim.
    return (settled(current) and routes(current) == old and routes(current, True) == old
            and (active(revision) or stored_retired(revision)))


def transition(cloud, state, path, promoted=False):
    key = 'promotion' if promoted else 'stage'
    if key not in state:
        verify_baseline(cloud, state)
        current = cloud.resource('services', SERVICE)
        if promoted:
            need(observe(cloud, state, False), 'STAGING_NOT_SETTLED')
        else:
            need(current['metadata'].get('resourceVersion') == state['baseline']['service']['metadata']['resourceVersion']
                 and current['spec'] == state['baseline']['service']['spec']
                 and envelope(current) == envelope(state['baseline']['service']), 'CONCURRENT_SERVICE_CHANGE')
            need(cloud.resource('revisions', state['candidate'], missing=True) is None, 'CANDIDATE_EXISTS_WITHOUT_JOURNAL')
        body = request_body(current, candidate_template(state),
                            promote_traffic(state) if promoted else state['baseline']['traffic'])
        proposed = cloud.resource('services', SERVICE, body, validate=True)
        # A dry-run may retain old observed traffic. Validate the desired body.
        need(envelope(proposed) == envelope(current)
             and template(proposed['spec']['template']) == template(body['spec']['template'])
             and proposed['spec']['template']['metadata'].get('name') == state['candidate']
             and routes(proposed) == routes(body), 'API_VALIDATION_CHANGED_REQUEST')
        need(cloud.resource('services', SERVICE)['metadata'].get('resourceVersion')
             == current['metadata']['resourceVersion'], 'CONCURRENT_SERVICE_CHANGE')
        verify_baseline(cloud, state)
        # Building may take minutes. Recheck reviewed main immediately before
        # each stage/promotion, independently of the service resourceVersion.
        assert_source_current(state['source'])
        verify_peer(cloud, state)
        need(cloud.resource('services', SERVICE)['metadata'].get('resourceVersion')
             == current['metadata']['resourceVersion'], 'CONCURRENT_SERVICE_CHANGE')
        state[key] = {'phase': 'attempted', 'request': body}
        save(path, state)
        cloud.resource('services', SERVICE, body)
    for attempt in range(121):
        if observe(cloud, state, promoted):
            state[key]['phase'] = 'verified'
            save(path, state)
            return
        need(attempt < 120, 'CLOUD_TRANSITION_PENDING_RERUN_SAME_COMMAND_FOR_READ_ONLY_RECOVERY')
        if attempt % 6 == 0:
            print(json.dumps({'status': key.upper() + '_PENDING_READ_ONLY_RECOVERY'}), flush=True)
        time.sleep(5)


def rollback(cloud, state, path):
    """Restore only the journal's original traffic; retain the candidate template."""
    need('stage' in state, 'NO_STAGED_RELEASE_TO_ROLL_BACK')
    verify_baseline(cloud, state)
    current = cloud.resource('services', SERVICE)
    old, new = state['baseline']['traffic'], promote_traffic(state)
    verify_shape(current, state['baseline']['service'], candidate_template(state), [old, new])
    need(current['status'].get('latestCreatedRevisionName') == state['candidate'], 'NEWER_RELEASE_BLOCKS_ROLLBACK')
    if 'rollback' not in state and not (routes(current) == old and routes(current, True) == old):
        body = request_body(current, current['spec']['template'], old)
        proposed = cloud.resource('services', SERVICE, body, validate=True)
        need(envelope(proposed) == envelope(current)
             and template(proposed['spec']['template']) == template(current['spec']['template'])
             and routes(proposed) == old, 'ROLLBACK_VALIDATION_CHANGED_REQUEST')
        need(cloud.resource('services', SERVICE)['metadata'].get('resourceVersion')
             == current['metadata']['resourceVersion'], 'CONCURRENT_SERVICE_CHANGE')
        verify_baseline(cloud, state)
        state['rollback'] = {'phase': 'attempted', 'request': body}
        save(path, state)
        cloud.resource('services', SERVICE, body)
    for attempt in range(121):
        verify_baseline(cloud, state)
        current = cloud.resource('services', SERVICE)
        verify_shape(current, state['baseline']['service'], candidate_template(state), [old, new])
        need(current['status'].get('latestCreatedRevisionName') == state['candidate'], 'NEWER_RELEASE_BLOCKS_ROLLBACK')
        baseline = cloud.resource('revisions', state['baseline']['revision']['metadata']['name'])
        if routes(current) == old and routes(current, True) == old and active(baseline):
            need(cloud.health() == state['baseline']['health'], 'ROLLBACK_HEALTH_NOT_VERIFIED')
            state['rollback'] = {**state.get('rollback', {}), 'phase': 'verified'}
            save(path, state)
            print(json.dumps({'status': 'GATEWAY_TRAFFIC_ROLLBACK_VERIFIED', 'source': state['source'],
                              'baseline': baseline['metadata']['name']}), flush=True)
            return
        need(attempt < 120, 'ROLLBACK_PENDING_RERUN_SAME_ROLLBACK_COMMAND_FOR_READ_ONLY_RECOVERY')
        if attempt % 6 == 0:
            print(json.dumps({'status': 'ROLLBACK_PENDING_READ_ONLY_RECOVERY'}), flush=True)
        time.sleep(5)


def run(root, directory, source, tested, execute=False, restore=False):
    # Emergency traffic restoration relies on the previously verified private
    # journal and local pinned tool/source; it never waits on GitHub or CI.
    proof = local_source(root, source, tested) if restore else verify_source(root, source, tested)
    need(str(publisher.cloud('projects', 'describe', PROJECT).get('projectNumber')) == NUMBER, 'PROJECT_IDENTITY_CHANGED')
    cloud = Cloud()
    path = directory / 'release.json'
    if path.exists():
        need(not path.is_symlink() and path.stat().st_mode & 0o077 == 0, 'PRIVATE_JOURNAL_REQUIRED')
        state = json.loads(path.read_text())
        need(state['source'] == source and state['tested'] == tested and state['tool'] == proof['tool'], 'JOURNAL_SOURCE_DIFFERS')
    else:
        need(not restore, 'ROLLBACK_REQUIRES_THE_ORIGINAL_PRIVATE_JOURNAL')
        baseline = snapshot(cloud)
        with tempfile.TemporaryDirectory(prefix='jems-gateway-plan-') as temporary:
            _, archive_hash = publisher.source_archive(root, temporary, source)
        nonce = uuid.uuid4().hex
        state = {**proof, 'nonce': nonce, 'baseline': baseline,
                 'coach': cloud.compatible_coach(baseline['service']),
                 'candidate': SERVICE + '-repair-' + source[:12] + '-' + nonce[:6],
                 'bucket': f'{PROJECT}-service-builds-{REGION}',
                 'build': {'phase': 'prepared', 'archive': archive_hash,
                           'config': build_config(source, archive_hash, nonce)}}
        if execute:
            save(path, state)
    if restore:
        rollback(cloud, state, path)
        return
    need('rollback' not in state, 'RELEASE_WAS_ROLLED_BACK_NO_AUTOMATIC_REPROMOTION')
    print(json.dumps({'status': 'RELEASE_PLAN', 'source': source, 'tested': tested,
        'baseline': state['baseline']['revision']['metadata']['name'], 'candidate': state['candidate'],
        'archiveSha256': state['build']['archive'], 'service': SERVICE,
        'steps': ['publish gateway image', 'stage at zero traffic', 'promote gateway', 'verify health'],
        'journal': str(path), 'execute': execute}), flush=True)
    if not execute:
        return
    verify_peer(cloud, state)
    if 'promotion' not in state:
        publish(root, state, path)
        transition(cloud, state, path)
    transition(cloud, state, path, True)
    need(cloud.health() == state['baseline']['health'], 'HEALTH_OR_PAID_ACTIVE_STATE_CHANGED_TRAFFIC_ROLLBACK_REQUIRED')
    need(observe(cloud, state, True), 'FINAL_SERVICE_VERIFICATION_CHANGED')
    verify_peer(cloud, state)
    print(json.dumps({'status': 'GATEWAY_REPAIR_RELEASE_VERIFIED', 'source': source,
        'candidate': state['candidate'], 'image': state['build']['image'],
        'rollbackRevision': state['baseline']['revision']['metadata']['name'],
        'buildId': state['build']['id'], 'paidExecution': state['baseline']['health']['paidExecution']}), flush=True)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--reviewed-source-sha', required=True)
    parser.add_argument('--tested-source-sha', required=True)
    parser.add_argument('--state-dir', required=True, help='Private directory outside the tool checkout; retain for recovery')
    parser.add_argument('--execute', action='store_true')
    parser.add_argument('--rollback', action='store_true', help='Traffic-only recovery using the original private journal')
    args = parser.parse_args(argv)
    need(not (args.execute and args.rollback), 'SELECT_EXECUTE_OR_ROLLBACK')
    root = Path(__file__).resolve().parents[2]
    directory = Path(args.state_dir).absolute()
    need(not directory.is_symlink() and not directory.is_relative_to(root), 'PRIVATE_EXTERNAL_STATE_DIRECTORY_REQUIRED')
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    need(directory.stat().st_mode & 0o077 == 0, 'STATE_DIRECTORY_MUST_BE_PRIVATE')
    descriptor = os.open(directory / 'release.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        run(root, directory, args.reviewed_source_sha, args.tested_source_sha, args.execute, args.rollback)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(str(error) if isinstance(error, Stop) else 'GATEWAY_RELEASE_STOPPED; retain the private journal and rerun the same pinned command. No attempted write will repeat.', file=sys.stderr)
        sys.exit(2)
