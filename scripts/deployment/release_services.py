#!/usr/bin/env python3
"""PR115 only: coordinated, journaled gateway and private-coach image release.

Default: remote-read-only snapshot and exact-source budget preflight. --execute
publishes both images, stages both at zero traffic and promotes coach then
gateway. Configuration, IAM, numeric secret versions, approval and worker pins
remain unchanged. No provider call, Pages dispatch or automatic replay occurs.
A serving receipt still requires the separate authenticated conversation check.
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
GATEWAY = 'factory-gateway'
COACH = 'factory-coach-private'
SERVICES = {'coach': COACH, 'gateway': GATEWAY}
ORDER = ('coach', 'gateway')
REGISTRIES = {key: f'{REGION}-docker.pkg.dev/{PROJECT}/factory-services/{key}' for key in SERVICES}
API = f'https://{REGION}-run.googleapis.com/apis/serving.knative.dev/v1/namespaces/{PROJECT}'
HEALTH = 'https://factory-gateway-ola734esta-ul.a.run.app/health'
CHECKS = {'Jems operations policy', 'Documentation references', 'browser',
          'learning', 'creative', 'private-coach-image', 'service-images'}
ROOT = Path(__file__).resolve().parents[2]
# One reviewed recovery of the already accepted PR115 build. This is not a
# general journal re-pinning option or permission to submit another build.
RECOVERABLE_BUILD = {
    'originalTool': '698c641188b1bf57378ea37d53bfe0073c20136b',
    'source': '19f5e46ae1141da3df7bf14d682757de7e9aec69',
    'tested': '986a9118674e1bbd1d4b0873b1993dac245627e9',
    'buildId': '5ef640d8-46a7-4bd5-ae41-d00e8296ed2c',
}
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
        need((kind == 'services' and name in SERVICES.values()) or
             (kind == 'revisions' and any(re.fullmatch(service + r'-[a-z0-9-]+', name) for service in SERVICES.values())), 'RESOURCE_OUT_OF_SCOPE')
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

    def iam(self, key):
        return publisher.cloud('run', 'services', 'get-iam-policy', SERVICES[key], '--region', REGION)

    def health(self):
        try:
            request = urllib.request.Request(HEALTH, headers={'Cache-Control': 'no-cache'})
            with self.opener.open(request, timeout=20) as response:
                data = json.loads(response.read(4096))
        except (OSError, ValueError):
            raise Stop('GATEWAY_HEALTH_UNAVAILABLE') from None
        need(data.get('ready') is True and type(data.get('paidExecution')) is bool, 'GATEWAY_NOT_HEALTHY')
        return {'ready': True, 'paidExecution': data['paidExecution']}


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


def routes(service, observed=False, service_name=GATEWAY):
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


def image(revision, registry):
    containers = revision.get('spec', {}).get('containers', [])
    need(len(containers) == 1, 'SINGLE_SERVICE_CONTAINER_REQUIRED')
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


def snapshot(cloud, key):
    name = SERVICES[key]
    service = cloud.resource('services', name)
    need(service.get('metadata', {}).get('name') == name
         and service['metadata'].get('namespace') in (PROJECT, NUMBER)
         and settled(service), 'SERVICE_NOT_SETTLED_' + key)
    traffic = routes(service, service_name=name)
    need(traffic == routes(service, True, name), 'TRAFFIC_STILL_RECONCILING_' + key)
    serving = [row for row in traffic if row['percent']]
    need(len(serving) == 1 and serving[0]['percent'] == 100, 'ONE_SERVING_BASELINE_REQUIRED_' + key)
    revision = cloud.resource('revisions', serving[0]['revisionName'])
    need(revision.get('metadata', {}).get('name') == serving[0]['revisionName']
         and active(revision), 'BASELINE_NOT_ACTIVE_' + key)
    old_image = image(revision, REGISTRIES[key])
    pinned_secrets(revision)
    need(template(service['spec']['template']) == template(revision), 'TEMPLATE_DIFFERS_FROM_SERVING_BASELINE_' + key)
    need(service['status'].get('latestCreatedRevisionName') == revision['metadata']['name']
         and service['status'].get('latestReadyRevisionName') == revision['metadata']['name'], 'OTHER_STAGED_REVISION_PRESENT_' + key)
    need(bool(service['metadata'].get('resourceVersion')), 'CAS_VERSION_MISSING_' + key)
    return {'service': service, 'revision': revision, 'iam': cloud.iam(key),
            'image': old_image, 'traffic': traffic}


def binding(gateway, coach, read_secret=command):
    """Verify the consumed numeric config and gateway/coach identity, in memory.

    No model key or unrelated secret is read. Both service templates are already
    bound to their observed serving or exact journaled candidate revisions.
    """
    origin = coach.get('status', {}).get('url', '')
    need(re.fullmatch(r'https://factory-coach-private-[a-z0-9.-]+\.run\.app', origin), 'COACH_ORIGIN_UNVERIFIED')
    env = coach['spec']['template']['spec']['containers'][0].get('env', [])
    def literal(name):
        entries = [row for row in env if row.get('name') == name]
        need(len(entries) == 1 and isinstance(entries[0].get('value'), str)
             and 'valueFrom' not in entries[0], 'COACH_CALLER_OR_AUDIENCE_UNVERIFIED')
        return entries[0]['value']
    caller = f'factory-gateway@{PROJECT}.iam.gserviceaccount.com'
    need(literal('FACTORY_COACH_PRIVATE_AUDIENCE') == origin
         and literal('FACTORY_COACH_GATEWAY_SERVICE_ACCOUNT') == caller
         and gateway['spec']['template']['spec'].get('serviceAccountName') == caller,
         'GATEWAY_COACH_IDENTITY_BINDING_DIFFERS')
    try:
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
    return {'coachOrigin': origin, 'gatewayCaller': caller, 'gatewayConfigVersion': mounted[1]}


def verify_binding(cloud, state):
    need(binding(cloud.resource('services', GATEWAY), cloud.resource('services', COACH)) == state['binding'],
         'GATEWAY_COACH_BINDING_CHANGED')


def application_checkout(directory, source):
    need(command(['git', 'rev-parse', 'HEAD'], directory) == source, 'APPLICATION_CHECKOUT_SOURCE_DIFFERS')
    need(not command(['git', 'status', '--porcelain'], directory), 'CLEAN_APPLICATION_CHECKOUT_REQUIRED')


def budget_preflight(root, application, source, revision):
    application_checkout(application, source)
    result = subprocess.run(['node', '--import', 'tsx', str(root / 'scripts/deployment/coach_release_budget.cjs'),
                             str(application), source], cwd=application, input=json.dumps(revision),
                            capture_output=True, text=True, timeout=60)
    try:
        proof = json.loads(result.stdout)
    except ValueError:
        raise Stop('COACH_BUDGET_PREFLIGHT_FAILED_VERIFY_PINNED_NPM_DEPENDENCIES') from None
    # The reviewed helper emits only allowlisted numbers/booleans and fixed codes.
    need(isinstance(proof, dict) and proof.get('sourceSha') == source
         and proof.get('revision') == revision['metadata']['name'], 'COACH_BUDGET_PROOF_DIFFERS')
    print(json.dumps({'status': 'COACH_BUDGET_PREFLIGHT', 'proof': proof}), flush=True)
    need(result.returncode == 0 and proof.get('arithmeticPass') is True,
         'COACH_UNCHANGED_CONFIGURATION_CANNOT_SERVE_REVIEWED_SOURCE')
    application_checkout(application, source)
    return proof


def request_body(service, new_template, traffic):
    result = {'apiVersion': 'serving.knative.dev/v1', 'kind': 'Service',
              'metadata': {key: copy.deepcopy(service['metadata'][key])
                           for key in ('name', 'namespace', 'resourceVersion')},
              'spec': copy.deepcopy(service['spec'])}
    result['metadata']['labels'] = copy.deepcopy(service['metadata'].get('labels', {}))
    result['metadata']['annotations'] = annotations(service['metadata'])
    result['spec']['template'] = copy.deepcopy(new_template)
    result['spec']['traffic'] = copy.deepcopy(traffic)
    return result


def save(path, state):
    descriptor, temporary = tempfile.mkstemp(prefix='release-', dir=path.parent)
    with os.fdopen(descriptor, 'w') as output:
        json.dump(state, output)
        output.flush()
        os.fsync(output.fileno())
    os.replace(temporary, path)


def candidate_template(state, key):
    record = state['services'][key]
    result = template(record['baseline']['revision'])
    result['metadata']['name'] = record['candidate']
    result['spec']['containers'][0]['image'] = state['build']['images'][key]
    return result


def promoted_routes(state, key):
    record = state['services'][key]
    return sorted([{'revisionName': record['candidate'], 'percent': 100}]
                  + [row for row in record['baseline']['traffic'] if row.get('tag')],
                  key=lambda row: (row.get('tag', ''), row['revisionName'], row['percent']))


def verify_baseline(cloud, state, key):
    before = state['services'][key]['baseline']
    old = cloud.resource('revisions', before['revision']['metadata']['name'])
    pinned_secrets(old)
    need(observed(old) and conditions(old).get('Ready', {}).get('status') == 'True'
         and image(old, REGISTRIES[key]) == before['image']
         and template(old) == template(before['revision']), 'BASELINE_CHANGED_' + key)
    need(digest(cloud.iam(key)) == digest(before['iam']), 'IAM_CHANGED_' + key)


def verify_shape(current, state, key, allowed):
    record = state['services'][key]
    expected = candidate_template(state, key)
    need(envelope(current) == envelope(record['baseline']['service']), 'SERVICE_POLICY_CHANGED_' + key)
    need(template(current['spec']['template']) == template(expected)
         and current['spec']['template']['metadata'].get('name') == record['candidate'],
         'CANDIDATE_CONFIGURATION_CHANGED_' + key)
    need(routes(current, service_name=SERVICES[key]) in allowed
         and routes(current, True, SERVICES[key]) in allowed, 'TRAFFIC_CHANGED_' + key)
    need(current.get('status', {}).get('latestCreatedRevisionName') == record['candidate'],
         'LATEST_CANDIDATE_CHANGED_' + key)


def observe(cloud, state, key, promoted=False):
    verify_baseline(cloud, state, key)
    record = state['services'][key]
    current = cloud.resource('services', SERVICES[key])
    old, new = record['baseline']['traffic'], promoted_routes(state, key)
    verify_shape(current, state, key, [old, new] if promoted else [old])
    revision = cloud.resource('revisions', record['candidate'], missing=True)
    if revision is None:
        return False
    need(revision['metadata']['name'] == record['candidate']
         and template(revision) == template(candidate_template(state, key)), 'CANDIDATE_REVISION_CHANGED_' + key)
    if conditions(revision).get('Ready', {}).get('status') == 'False':
        raise Stop('CANDIDATE_FAILED_' + key)
    if conditions(revision).get('Ready', {}).get('status') != 'True':
        return False
    need(image(revision, REGISTRIES[key]) == state['build']['images'][key], 'CANDIDATE_DIGEST_DIFFERS_' + key)
    if promoted:
        return (settled(current) and active(revision)
                and routes(current, service_name=SERVICES[key]) == new
                and routes(current, True, SERVICES[key]) == new
                and current['status'].get('latestReadyRevisionName') == record['candidate'])
    return (settled(current) and routes(current, service_name=SERVICES[key]) == old
            and routes(current, True, SERVICES[key]) == old
            and (active(revision) or stored_retired(revision)))


def verify_untouched(cloud, state, key):
    verify_baseline(cloud, state, key)
    current = cloud.resource('services', SERVICES[key])
    before = state['services'][key]['baseline']['service']
    need(current['metadata'].get('resourceVersion') == before['metadata']['resourceVersion']
         and current['spec'] == before['spec'] and envelope(current) == envelope(before),
         'CONCURRENT_SERVICE_CHANGE_' + key)
    need(settled(current) and active(cloud.resource('revisions', state['services'][key]['baseline']['revision']['metadata']['name']))
         and routes(current, service_name=SERVICES[key]) == routes(current, True, SERVICES[key]),
         'BASELINE_NOT_SETTLED_' + key)


def verify_stable(cloud, state, key):
    record = state['services'][key]
    step = 'promotion' if 'promotion' in record else 'stage' if 'stage' in record else None
    if step is None:
        verify_untouched(cloud, state, key)
    else:
        need(record[step]['phase'] == 'verified', 'UNRESOLVED_OTHER_SERVICE_TRANSITION_' + key)
        need(observe(cloud, state, key, step == 'promotion'), 'OTHER_SERVICE_NOT_SETTLED_' + key)


def verify_peers(cloud, state, target=None):
    for key in ORDER:
        if key != target:
            verify_stable(cloud, state, key)
    verify_binding(cloud, state)


def build_config(source, archive_hash, nonce):
    images = [REGISTRIES[key] + ':' + source for key in ORDER]
    steps = []
    for key, tag in zip(ORDER, images):
        entry = './private-executor.mjs' if key == 'coach' else './server/gateway.ts'
        loader = [] if key == 'coach' else ['--import', 'tsx']
        steps.extend([
            {'name': 'gcr.io/cloud-builders/docker', 'args': ['build', '--pull', '--label',
                'org.opencontainers.image.revision=' + source, '--label',
                'org.jems.source.archive.sha256=' + archive_hash, '-f', 'server/Dockerfile.' + key, '-t', tag, '.']},
            {'name': 'gcr.io/cloud-builders/docker', 'args': ['run', '--rm', '--network', 'none', '--entrypoint', 'node',
                tag, *loader, '--input-type=module', '-e',
                'if(process.getuid()===0)throw Error("NON_ROOT_REQUIRED");await import("' + entry + '");']}
        ])
    return {'steps': steps, 'images': images,
            'serviceAccount': f'projects/{PROJECT}/serviceAccounts/{publisher.BUILDER}',
            'options': {'logging': 'CLOUD_LOGGING_ONLY', 'machineType': 'E2_MEDIUM'},
            'timeout': '1200s', 'tags': ['jems-pr115-services', 'source-' + source, 'release-' + nonce]}


def verify_build_shape(actual, config):
    need(all(actual.get(key) == config[key] for key in ('images', 'serviceAccount', 'tags')), 'BUILD_IDENTITY_DIFFERS')
    options = copy.deepcopy(actual.get('options', {}))
    # Cloud Build documents these release fields as output-only. An empty
    # PoolOption selects no private pool; a nonempty name remains significant.
    # https://docs.cloud.google.com/build/docs/api/reference/rest/v1/projects.builds#BuildOptions
    options.pop('resolvedWorkerRelease', None)
    if isinstance(options.get('pool'), dict):
        for key in ('workerRelease', 'resolvedWorkerRelease'):
            options['pool'].pop(key, None)
        if not options['pool']:
            options.pop('pool')
    # Observed on the already accepted PR115 build. Cloud Build documents
    # legacy as the omitted-selection default until March 28, 2027.
    # https://docs.cloud.google.com/build/docs/release-channels
    if 'workerRelease' not in config['options'] and options.get('workerRelease') == 'legacy':
        options.pop('workerRelease')
    need(options == config['options'] and actual.get('timeout') == config['timeout'],
         'BUILD_EXECUTION_OPTIONS_DIFFER')
    # A matching Docker command alone does not bind machine/pool/env settings,
    # substitutions, extra artifact publication or a trigger's execution config.
    # The API may echo the same declared images in Artifacts.images. Permit
    # exactly that duplicate declaration, with no other artifact destinations.
    # Primary implementation: cloud-build-local validate.CheckArtifacts copies
    # Images into Artifacts.Images and requires equality when both are present.
    # https://github.com/GoogleCloudPlatform/cloud-build-local/blob/master/validate/validate.go
    artifacts = actual.get('artifacts')
    need(artifacts in (None, {}) or artifacts == {'images': config['images']}, 'UNEXPECTED_BUILD_ARTIFACTS')
    need(not any(actual.get(key) for key in ('substitutions', 'secrets', 'availableSecrets',
             'buildTriggerId', 'gitConfig', 'dependencies')), 'UNEXPECTED_BUILD_EXECUTION_CONFIGURATION')
    need(actual.get('queueTtl') in (None, '', '3600s'), 'UNREVIEWED_BUILD_QUEUE_TTL')
    read_only = {'id', 'name', 'projectId', 'status', 'statusDetail', 'createTime', 'startTime', 'finishTime',
                 'source', 'sourceProvenance', 'results', 'logUrl', 'logsBucket', 'timing', 'warnings', 'failureInfo', 'approval',
                 'queueTtl', 'substitutions', 'artifacts', 'secrets', 'availableSecrets', 'buildTriggerId', 'gitConfig', 'dependencies'}
    need(not set(actual).difference(config).difference(read_only), 'UNREVIEWED_BUILD_CONFIGURATION_FIELD')
    runtime_metadata = {'status', 'pullTiming', 'timing', 'exitCode'}
    steps = actual.get('steps', [])
    need(len(steps) == len(config['steps']) and all(
        {key: value for key, value in step.items() if key not in runtime_metadata} == expected
        for step, expected in zip(steps, config['steps'])), 'BUILD_STEPS_DIFFER')


def verify_build_source(actual, state):
    source = actual.get('source', {})
    need(isinstance(source, dict) and set(source) == {'storageSource'}, 'UNEXPECTED_BUILD_SOURCE_KIND')
    storage = source['storageSource']
    need(isinstance(storage, dict) and set(storage) <= {'bucket', 'object', 'generation'}, 'UNEXPECTED_STORAGE_SOURCE_SETTING')
    resolved = actual.get('sourceProvenance', {}).get('resolvedStorageSource', {})
    need(storage.get('bucket') == state['bucket'] and isinstance(storage.get('object'), str)
         and storage['object'].startswith('source/' + state['nonce'] + '/'), 'BUILD_SOURCE_LOCATION_DIFFERS')
    need(resolved.get('bucket') == storage['bucket'] and resolved.get('object') == storage['object']
         and re.fullmatch('[1-9][0-9]*', str(resolved.get('generation', ''))), 'BUILD_RESOLVED_SOURCE_MISSING')
    if storage.get('generation') is not None:
        need(str(storage['generation']) == str(resolved['generation']), 'BUILD_SOURCE_GENERATION_DIFFERS')
    receipt = {key: str(resolved[key]) for key in ('bucket', 'object', 'generation')}
    if state['build'].get('resolvedSource'):
        need(state['build']['resolvedSource'] == receipt, 'BUILD_RESOLVED_SOURCE_CHANGED')
    return receipt


def validate_journal(state):
    """Reject corrupt or repurposed recovery records before trusting their phases.

    Exact source archive and live Cloud Build receipts are additionally re-read
    on every normal execution. This local validation is available in rollback.
    """
    nonce = state.get('nonce', '')
    need(re.fullmatch('[a-f0-9]{32}', nonce), 'JOURNAL_NONCE_INVALID')
    need(state.get('bucket') == f'{PROJECT}-service-builds-{REGION}', 'JOURNAL_BUCKET_DIFFERS')
    need(set(state.get('services', {})) == set(ORDER), 'JOURNAL_SERVICES_DIFFER')
    build = state.get('build', {})
    need(build.get('phase') in ('prepared', 'attempted', 'verified')
         and re.fullmatch('[a-f0-9]{64}', build.get('archive', '')), 'JOURNAL_BUILD_INVALID')
    need(build.get('config') == build_config(state['source'], build['archive'], nonce), 'JOURNAL_BUILD_CONFIGURATION_DIFFERS')
    if build['phase'] == 'prepared':
        need(not any(key in build for key in ('id', 'images', 'resolvedSource')), 'JOURNAL_PREPARED_BUILD_HAS_PRIOR_ATTEMPT')
    if build['phase'] == 'attempted':
        need(not any(key in build for key in ('images', 'resolvedSource')), 'JOURNAL_ATTEMPTED_BUILD_HAS_VERIFIED_RECEIPT')
    if build.get('id'):
        need(re.fullmatch('[a-f0-9-]{36}', build['id']), 'JOURNAL_BUILD_ID_INVALID')
    if build['phase'] == 'verified':
        need(build.get('id') and set(build.get('images', {})) == set(ORDER)
             and isinstance(build.get('resolvedSource'), dict), 'JOURNAL_VERIFIED_BUILD_INCOMPLETE')
        for key in ORDER:
            need(re.fullmatch(re.escape(REGISTRIES[key]) + r'@sha256:[a-f0-9]{64}', build['images'][key]), 'JOURNAL_IMAGE_INVALID')
    for key in ORDER:
        record = state['services'][key]
        need(record.get('candidate') == SERVICES[key] + '-pr115-' + state['source'][:12] + '-' + nonce[:6],
             'JOURNAL_CANDIDATE_DIFFERS')
        before = record['baseline']
        need(before['service']['metadata']['name'] == SERVICES[key]
             and before['service']['metadata']['namespace'] in (PROJECT, NUMBER)
             and before['revision']['metadata']['name'].startswith(SERVICES[key] + '-')
             and image(before['revision'], REGISTRIES[key]) == before['image'], 'JOURNAL_BASELINE_INVALID')
        need(before['traffic'] == routes(before['service'], service_name=SERVICES[key])
             == routes(before['service'], True, SERVICES[key]), 'JOURNAL_BASELINE_TRAFFIC_DIFFERS')
        for step in ('stage', 'promotion', 'rollback'):
            if step not in record:
                continue
            entry = record[step]
            need(build['phase'] == 'verified' and entry.get('phase') in ('attempted', 'verified'), 'JOURNAL_TRANSITION_INVALID')
            if step == 'rollback' and 'request' not in entry:
                need(entry['phase'] == 'verified' and state.get('rollbackRequested') is True, 'JOURNAL_ROLLBACK_INVALID')
                continue
            request = entry.get('request', {})
            need(envelope(request) == envelope(before['service'])
                 and bool(request['metadata'].get('resourceVersion'))
                 and template(request['spec']['template']) == template(candidate_template(state, key))
                 and request['spec']['template']['metadata'].get('name') == record['candidate']
                 and routes(request, service_name=SERVICES[key]) ==
                     (promoted_routes(state, key) if step == 'promotion' else before['traffic']),
                 'JOURNAL_RECORDED_REQUEST_DIFFERS')
        if 'promotion' in record:
            need(all(state['services'][peer].get('stage', {}).get('phase') == 'verified' for peer in ORDER),
                 'JOURNAL_PROMOTION_BEFORE_STAGES')
            if key == 'gateway':
                need(state['services']['coach'].get('promotion', {}).get('phase') == 'verified',
                     'JOURNAL_GATEWAY_PROMOTED_BEFORE_COACH')


def recovery_provenance(state, proof, recover_from):
    """Keep the original tool identity; authorize only the reviewed existing build.

    A first adoption must precede every service attempt. Once recorded, the
    same recovery-tool SHA can resume journaled phases without replaying them.
    """
    if state['tool'] == proof['tool']:
        need(recover_from is None and 'buildRecovery' not in state, 'UNEXPECTED_RECOVERY_OVERRIDE')
        return None
    expected = RECOVERABLE_BUILD
    need(recover_from == expected['originalTool'] == state['tool']
         and state['source'] == expected['source'] and state['tested'] == expected['tested']
         and state['build'].get('id') == expected['buildId']
         and state['build'].get('phase') in ('attempted', 'verified'), 'JOURNAL_TOOL_RECOVERY_NOT_REVIEWED')
    need(re.fullmatch('[a-f0-9]{40}', proof['tool']) and proof['tool'] != expected['originalTool'], 'RECOVERY_TOOL_IDENTITY_INVALID')
    receipt = {**expected, 'version': 1, 'recoveryTool': proof['tool'],
        'nonce': state['nonce'], 'archiveSha256': state['build']['archive'],
        'candidates': {key: state['services'][key]['candidate'] for key in ORDER},
        'reason': 'verified-cloud-build-legacy-default-and-declared-image-echo'}
    if 'buildRecovery' in state:
        need(state['buildRecovery'] == receipt, 'RECOVERY_TOOL_OR_ORIGINAL_IDENTITY_CHANGED')
    else:
        need(not state.get('rollbackRequested')
             and all(not any(step in state['services'][key] for step in ('stage', 'promotion', 'rollback')) for key in ORDER),
             'RECOVERY_ADOPTION_REQUIRES_NO_SERVICE_ATTEMPTS')
    return receipt


def publish(root, application, cloud, state, path):
    record, config = state['build'], state['build']['config']
    if record['phase'] == 'prepared':
        application_checkout(application, state['source'])
        with tempfile.TemporaryDirectory(prefix='jems-pr115-source-') as directory:
            archive, archive_hash = publisher.source_archive(application, directory, state['source'])
            need(archive_hash == record['archive'], 'SOURCE_ARCHIVE_CHANGED')
            config_file = Path(directory) / 'build.json'
            config_file.write_text(json.dumps(config))
            publisher.preflight(REGION, state['bucket'])
            assert_source_current(state['source'], root)
            verify_peers(cloud, state)
            record['phase'] = 'attempted'
            save(path, state)
            actual = publisher.cloud('builds', 'submit', str(archive), '--config', str(config_file),
                '--region', REGION, '--gcs-source-staging-dir',
                'gs://' + state['bucket'] + '/source/' + state['nonce'], '--async')
            need(re.fullmatch('[a-f0-9-]{36}', actual.get('id', '')), 'BUILD_RESPONSE_MISSING_ID')
            record['id'] = actual['id']
            save(path, state)
    if not record.get('id'):
        matches = publisher.cloud('builds', 'list', '--region', REGION,
                                  '--filter', 'tags=release-' + state['nonce'], '--limit', '2')
        need(len(matches) == 1, 'BUILD_SUBMISSION_UNCERTAIN_NO_RESUBMISSION')
        verify_build_shape(matches[0], config)
        need(re.fullmatch('[a-f0-9-]{36}', matches[0].get('id', '')), 'RECOVERY_BUILD_ID_INVALID')
        record['id'] = matches[0]['id']
        save(path, state)
    for attempt in range(241):
        actual = publisher.cloud('builds', 'describe', record['id'], '--region', REGION)
        need(actual.get('id') == record['id'], 'BUILD_RECEIPT_ID_DIFFERS')
        verify_build_shape(actual, config)
        if actual.get('status') not in ('PENDING', 'QUEUED', 'WORKING'):
            break
        need(attempt < 240, 'BUILD_PENDING_RERUN_SAME_COMMAND_FOR_READ_ONLY_RECOVERY')
        if attempt % 6 == 0:
            print(json.dumps({'status': 'BUILD_PENDING', 'buildId': record['id']}), flush=True)
        time.sleep(5)
    need(actual.get('status') == 'SUCCESS', 'BUILD_NOT_SUCCESSFUL_NO_RESUBMISSION')
    resolved = verify_build_source(actual, state)
    results = actual.get('results', {}).get('images', [])
    need(len(results) == len(ORDER) and {row.get('name') for row in results} == set(config['images']), 'BUILD_DIGEST_MISSING')
    images = {}
    for key in ORDER:
        row = next(row for row in results if row['name'] == REGISTRIES[key] + ':' + state['source'])
        need(re.fullmatch('sha256:[a-f0-9]{64}', row.get('digest', '')), 'BUILD_DIGEST_MISSING')
        candidate = REGISTRIES[key] + '@' + row['digest']
        metadata = publisher.cloud('artifacts', 'docker', 'images', 'describe', candidate)
        need(metadata.get('image_summary', {}).get('digest') == row['digest'], 'REGISTRY_DIGEST_DIFFERS')
        need(candidate != state['services'][key]['baseline']['image'], 'CANDIDATE_EQUALS_BASELINE_' + key)
        images[key] = candidate
    if record.get('images'):
        need(record['images'] == images, 'RECORDED_BUILD_DIGEST_CHANGED')
    record.update({'phase': 'verified', 'images': images, 'resolvedSource': resolved})
    save(path, state)


def transition(root, cloud, state, path, key, promoted=False):
    record = state['services'][key]
    step = 'promotion' if promoted else 'stage'
    if step not in record:
        verify_peers(cloud, state, key)
        verify_baseline(cloud, state, key)
        current = cloud.resource('services', SERVICES[key])
        if promoted:
            need(record.get('stage', {}).get('phase') == 'verified' and observe(cloud, state, key), 'STAGING_NOT_SETTLED_' + key)
            need(all(state['services'][peer].get('stage', {}).get('phase') == 'verified' for peer in ORDER), 'BOTH_STAGES_REQUIRED')
            if key == 'gateway':
                need(state['services']['coach'].get('promotion', {}).get('phase') == 'verified', 'COACH_MUST_PROMOTE_FIRST')
        else:
            verify_untouched(cloud, state, key)
            need(cloud.resource('revisions', record['candidate'], missing=True) is None, 'CANDIDATE_EXISTS_WITHOUT_JOURNAL')
        body = request_body(current, candidate_template(state, key),
                            promoted_routes(state, key) if promoted else record['baseline']['traffic'])
        proposed = cloud.resource('services', SERVICES[key], body, validate=True)
        need(envelope(proposed) == envelope(current)
             and template(proposed['spec']['template']) == template(body['spec']['template'])
             and proposed['spec']['template']['metadata'].get('name') == record['candidate']
             and routes(proposed, service_name=SERVICES[key]) == routes(body, service_name=SERVICES[key]), 'API_VALIDATION_CHANGED_REQUEST')
        need(cloud.resource('services', SERVICES[key])['metadata'].get('resourceVersion') == current['metadata']['resourceVersion'], 'CONCURRENT_SERVICE_CHANGE_' + key)
        assert_source_current(state['source'], root)
        verify_peers(cloud, state, key)
        verify_baseline(cloud, state, key)
        need(cloud.resource('services', SERVICES[key])['metadata'].get('resourceVersion') == current['metadata']['resourceVersion'], 'CONCURRENT_SERVICE_CHANGE_' + key)
        record[step] = {'phase': 'attempted', 'request': body}
        save(path, state)
        cloud.resource('services', SERVICES[key], body)
    for attempt in range(121):
        verify_peers(cloud, state, key)
        if observe(cloud, state, key, promoted):
            record[step]['phase'] = 'verified'
            save(path, state)
            return
        need(attempt < 120, 'TRANSITION_PENDING_READ_ONLY_RECOVERY_' + key)
        if attempt % 6 == 0:
            print(json.dumps({'status': step.upper() + '_PENDING_READ_ONLY_RECOVERY', 'service': SERVICES[key]}), flush=True)
        time.sleep(5)


def rollback_one(cloud, state, path, key):
    record = state['services'][key]
    if 'stage' not in record:
        verify_untouched(cloud, state, key)
        return
    verify_baseline(cloud, state, key)
    current = cloud.resource('services', SERVICES[key])
    old, new = record['baseline']['traffic'], promoted_routes(state, key)
    # A known unapplied staging attempt needs no write. It is never replayed.
    if (template(current['spec']['template']) == template(record['baseline']['revision'])
            and routes(current, service_name=SERVICES[key]) == old
            and routes(current, True, SERVICES[key]) == old):
        verify_untouched(cloud, state, key)
        record['rollback'] = {'phase': 'verified', 'noWriteRequired': True}
        save(path, state)
        return
    verify_shape(current, state, key, [old, new])
    if 'rollback' not in record and not (routes(current, service_name=SERVICES[key]) == old
                                        and routes(current, True, SERVICES[key]) == old):
        body = request_body(current, current['spec']['template'], old)
        proposed = cloud.resource('services', SERVICES[key], body, validate=True)
        need(envelope(proposed) == envelope(current)
             and template(proposed['spec']['template']) == template(current['spec']['template'])
             and routes(proposed, service_name=SERVICES[key]) == old, 'ROLLBACK_VALIDATION_CHANGED_REQUEST')
        need(cloud.resource('services', SERVICES[key])['metadata'].get('resourceVersion') == current['metadata']['resourceVersion'], 'CONCURRENT_SERVICE_CHANGE_' + key)
        verify_baseline(cloud, state, key)
        record['rollback'] = {'phase': 'attempted', 'request': body}
        save(path, state)
        cloud.resource('services', SERVICES[key], body)
    for attempt in range(121):
        verify_baseline(cloud, state, key)
        current = cloud.resource('services', SERVICES[key])
        verify_shape(current, state, key, [old, new])
        old_revision = cloud.resource('revisions', record['baseline']['revision']['metadata']['name'])
        if (routes(current, service_name=SERVICES[key]) == old
                and routes(current, True, SERVICES[key]) == old and active(old_revision)):
            record['rollback'] = {**record.get('rollback', {}), 'phase': 'verified'}
            save(path, state)
            return
        need(attempt < 120, 'ROLLBACK_PENDING_READ_ONLY_RECOVERY_' + key)
        time.sleep(5)


def rollback(cloud, state, path):
    need(any('stage' in record for record in state['services'].values()), 'NO_STAGED_RELEASE_TO_ROLL_BACK')
    state['rollbackRequested'] = True
    save(path, state)
    # The newer gateway must leave traffic before the older coach returns.
    # Emergency rollback needs neither GitHub/CI nor an available coach endpoint.
    for key in reversed(ORDER):
        rollback_one(cloud, state, path, key)
    need(cloud.health() == state['health'], 'ROLLBACK_HEALTH_NOT_VERIFIED')
    print(json.dumps({'status': 'PR115_BACKEND_TRAFFIC_ROLLBACK_VERIFIED', 'source': state['source'],
        'revisions': {key: record['baseline']['revision']['metadata']['name'] for key, record in state['services'].items()}}), flush=True)


def run(root, application, directory, source, tested, execute=False, restore=False, recover_from=None):
    proof = local_source(root, source, tested) if restore else verify_source(root, source, tested)
    need(str(publisher.cloud('projects', 'describe', PROJECT).get('projectNumber')) == NUMBER, 'PROJECT_IDENTITY_CHANGED')
    cloud, path = Cloud(), directory / 'release.json'
    recovery = None
    if path.exists():
        need(not path.is_symlink() and path.stat().st_mode & 0o077 == 0, 'PRIVATE_JOURNAL_REQUIRED')
        state = json.loads(path.read_text())
        need(state['source'] == source and state['tested'] == tested, 'JOURNAL_SOURCE_DIFFERS')
        validate_journal(state)
        recovery = recovery_provenance(state, proof, recover_from)
    else:
        need(recover_from is None, 'RECOVERY_REQUIRES_THE_ORIGINAL_PRIVATE_JOURNAL')
        need(not restore, 'ROLLBACK_REQUIRES_THE_ORIGINAL_PRIVATE_JOURNAL')
        application_checkout(application, source)
        baselines = {key: snapshot(cloud, key) for key in ORDER}
        verified_binding = binding(baselines['gateway']['service'], baselines['coach']['service'])
        budget = budget_preflight(root, application, source, baselines['coach']['revision'])
        with tempfile.TemporaryDirectory(prefix='jems-pr115-plan-') as temporary:
            _, archive_hash = publisher.source_archive(application, temporary, source)
        nonce = uuid.uuid4().hex
        state = {**proof, 'nonce': nonce, 'health': cloud.health(), 'binding': verified_binding, 'coachBudget': budget,
            'services': {key: {'candidate': SERVICES[key] + '-pr115-' + source[:12] + '-' + nonce[:6],
                              'baseline': baselines[key]} for key in ORDER},
            'bucket': f'{PROJECT}-service-builds-{REGION}',
            'build': {'phase': 'prepared', 'archive': archive_hash, 'config': build_config(source, archive_hash, nonce)}}
        if execute:
            save(path, state)
    if restore:
        rollback(cloud, state, path)
        return
    need(not state.get('rollbackRequested'), 'RELEASE_WAS_ROLLED_BACK_NO_AUTOMATIC_REPROMOTION')
    # A local journal is a recovery record, never independent source approval.
    # Recompute the archive and allowance from the selected immutable checkout.
    application_checkout(application, source)
    with tempfile.TemporaryDirectory(prefix='jems-pr115-recheck-') as temporary:
        _, archive_hash = publisher.source_archive(application, temporary, source)
    need(archive_hash == state['build']['archive'], 'JOURNAL_SOURCE_ARCHIVE_DIFFERS')
    budget_preflight(root, application, source, state['services']['coach']['baseline']['revision'])
    if not execute:
        verify_peers(cloud, state)
    print(json.dumps({'status': 'PR115_RELEASE_PLAN', 'source': source, 'tested': tested,
        'baselines': {key: record['baseline']['revision']['metadata']['name'] for key, record in state['services'].items()},
        'candidates': {key: record['candidate'] for key, record in state['services'].items()},
        'archiveSha256': state['build']['archive'], 'journal': str(path), 'execute': execute,
        'steps': ['publish two images', 'stage both at zero traffic', 'promote coach', 'promote gateway',
                  'verify serving configuration and health', 'verify released conversation after website cutover']}), flush=True)
    if not execute:
        return
    # Even a verified journal must match the immutable Cloud Build and registry
    # receipt again. publish() submits only a never-attempted prepared build.
    publish(root, application, cloud, state, path)
    if recovery:
        if 'buildRecovery' not in state:
            verify_peers(cloud, state)
            state['buildRecovery'] = recovery
            save(path, state)
        print(json.dumps({'status': 'PR115_EXISTING_BUILD_RECOVERY_VERIFIED',
                          'originalTool': state['tool'], 'recoveryTool': proof['tool'],
                          'source': source, 'tested': tested, 'buildId': state['build']['id']}), flush=True)
    if not any('promotion' in record for record in state['services'].values()):
        for key in ORDER:
            if state['services'][key].get('stage', {}).get('phase') != 'verified':
                transition(root, cloud, state, path, key)
    for key in ORDER:
        if state['services'][key].get('promotion', {}).get('phase') != 'verified':
            transition(root, cloud, state, path, key, True)
    verify_peers(cloud, state)
    need(cloud.health() == state['health'], 'HEALTH_OR_PAID_ACTIVE_STATE_CHANGED_ROLLBACK_REQUIRED')
    print(json.dumps({'status': 'PR115_BACKENDS_SERVING_CONTEXT_CHECK_REQUIRED', 'source': source,
        'tested': tested, 'originalTool': state['tool'], 'executingTool': proof['tool'],
        'buildId': state['build']['id'], 'archiveSha256': state['build']['archive'],
        'services': {key: {'revision': record['candidate'], 'image': state['build']['images'][key],
                          'rollbackRevision': record['baseline']['revision']['metadata']['name']}
                     for key, record in state['services'].items()},
        'paidExecution': state['health']['paidExecution'], 'pagesDispatched': False,
        'conversationVerified': False}), flush=True)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--reviewed-source-sha', required=True)
    parser.add_argument('--tested-source-sha', required=True)
    parser.add_argument('--application-dir', required=True, help='Clean selected application checkout with lockfile npm dependencies installed')
    parser.add_argument('--state-dir', required=True, help='Private directory outside both checkouts; retain for recovery')
    parser.add_argument('--execute', action='store_true')
    parser.add_argument('--rollback', action='store_true')
    parser.add_argument('--recover-build-from-tool', choices=[RECOVERABLE_BUILD['originalTool']],
                        help='Explicit reviewed recovery of the existing PR115 build and original private journal; never creates a release or resubmits a build')
    args = parser.parse_args(argv)
    need(not (args.execute and args.rollback), 'SELECT_EXECUTE_OR_ROLLBACK')
    root = Path(__file__).resolve().parents[2]
    application, directory = Path(args.application_dir).resolve(), Path(args.state_dir).absolute()
    need(not directory.is_symlink() and not directory.is_relative_to(root)
         and not directory.is_relative_to(application), 'PRIVATE_EXTERNAL_STATE_DIRECTORY_REQUIRED')
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    need(directory.stat().st_mode & 0o077 == 0, 'STATE_DIRECTORY_MUST_BE_PRIVATE')
    descriptor = os.open(directory / 'release.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        run(root, application, directory, args.reviewed_source_sha, args.tested_source_sha,
            args.execute, args.rollback, args.recover_build_from_tool)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(str(error) if isinstance(error, Stop) else 'PR115_RELEASE_STOPPED; retain the private journal. No attempted mutation is replayed.', file=sys.stderr)
        sys.exit(2)


