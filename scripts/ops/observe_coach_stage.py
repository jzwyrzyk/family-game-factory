#!/usr/bin/env python3
"""Owner-only, read-only observation of the November 23 Coach stage.

No flags, dispatch, IAM, traffic, provider calls or application records are changed.
Uses the preserved, checksum-pinned owner handoff and existing owner credentials.
This is deliberately pinned to the stage; it must stop after main/traffic changes.
"""
from collections import Counter
from datetime import datetime, timedelta, timezone
import hashlib
import importlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import tempfile
import types

WORK = Path('/home/jzwyrzyk/jems-production-activation.lekdl0n2')
STAGE_HELPER = '2ea4387f7a857a0ded7928ee35651f6c1ee88604c9a75c67ceca5976df7e220c'
STAGE_RUN = 45282960847
PROJECT = 'family-game-factory-jzw'
PROJECT_NUMBER = '1054529152893'
REGION = 'us-east5'
SERVICE = 'factory-coach-private'
LOCATION = f'projects/{PROJECT}/locations/{REGION}'
RESOURCE = f'{LOCATION}/services/{SERVICE}'
REQUEST_LOG = f'projects/{PROJECT}/logs/run.googleapis.com%2Frequests'
SYSTEM_LOG = f'projects/{PROJECT}/logs/run.googleapis.com%2Fvarlog%2Fsystem'
# Application payload logs are intentionally excluded, including stdout/stderr.
ERROR_LEVELS = {'ERROR', 'CRITICAL', 'ALERT', 'EMERGENCY'}
LIMIT = 500
FORMAT = ('json[private](timestamp,resource.type,resource.labels.project_id,'
          'resource.labels.location,resource.labels.service_name,'
          'resource.labels.revision_name,logName,severity,httpRequest.status)')


class ObservationError(Exception):
    pass


def need(ok, code):
    if not ok:
        raise ObservationError(code)


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def load_pinned(path, expected):
    info = path.lstat()
    need(path.resolve() == path.absolute() and stat.S_ISREG(info.st_mode)
         and info.st_uid == os.getuid() and info.st_mode & 0o077 == 0
         and info.st_size <= 100000, 'PRIVATE_HELPER_REQUIRED')
    raw = path.read_bytes()
    need(digest(raw) == expected, 'PINNED_HELPER_CHANGED')
    module = types.ModuleType('pinned_' + path.name.replace('.', '_'))
    module.__file__ = str(path)
    exec(compile(raw, str(path), 'exec'), module.__dict__)
    return module


def support():
    info = WORK.stat()
    need(WORK.is_dir() and WORK.resolve() == WORK.absolute()
         and info.st_uid == os.getuid() and info.st_mode & 0o077 == 0,
         'PRIVATE_WORKSPACE_REQUIRED')
    for path in sorted(WORK.glob('release-stage-helper.*')):
        info = path.lstat()
        if (stat.S_ISREG(info.st_mode) and info.st_uid == os.getuid()
                and info.st_mode & 0o077 == 0 and info.st_size <= 100000
                and digest(path.read_bytes()) == STAGE_HELPER):
            h = load_pinned(path, STAGE_HELPER)
            base = h.load_support()
            return h, base, base.support()
    raise ObservationError('PINNED_STAGE_HELPER_NOT_FOUND')


def command(args):
    env = dict(os.environ)
    env.pop('GH_DEBUG', None)
    env.update(GH_HOST='github.com', GH_PROMPT_DISABLED='1',
               CLOUDSDK_CORE_LOG_HTTP='false', CLOUDSDK_CORE_DISABLE_PROMPTS='1',
               PYTHONDONTWRITEBYTECODE='1')
    result = subprocess.run(args, env=env, capture_output=True,
                            stdin=subprocess.DEVNULL, timeout=60)
    need(result.returncode == 0, 'READ_COMMAND_FAILED')
    need(len(result.stdout) <= 4_000_000, 'READ_RESPONSE_TOO_LARGE')
    return result.stdout.decode().strip()


def revision_reference(value, intent):
    """Classify only references within this verified project/service/location.

    The activation receipts bind this project ID and number. Do not accept an
    arbitrary suffix match, another namespace, a short name or an absent field.
    Unknown reference values are never included in the shareable report.
    """
    if value is None or value == '':
        return {'target': 'missing', 'project_reference': 'none'}
    if not isinstance(value, str):
        return {'target': 'unrecognized', 'project_reference': 'unrecognized'}
    for target in ('candidate', 'baseline'):
        if value == intent[target]:
            return {'target': target, 'project_reference': 'short_name'}
    for project, form in ((PROJECT, 'project_id'), (PROJECT_NUMBER, 'project_number')):
        prefix = f'projects/{project}/locations/{REGION}/services/{SERVICE}/revisions/'
        if value.startswith(prefix):
            suffix = value[len(prefix):]
            target = ('candidate' if suffix == intent['candidate'] else
                      'baseline' if suffix == intent['baseline'] else 'other_revision')
            return {'target': target, 'project_reference': form}
    return {'target': 'unrecognized', 'project_reference': 'unrecognized'}


def latest_references(release, intent, service):
    identities = {'baseline': intent['baseline'], 'candidate': release.revision_name(intent)}
    return {key: revision_reference(service.get(key), identities)
            for key in ('latestCreatedRevision', 'latestReadyRevision')}


def staged_state(release, intent, service, baseline, candidate):
    name = release.revision_name(intent)
    need(service.get('name') == RESOURCE and service.get('etag')
         and not service.get('reconciling', False), 'SERVICE_UNSTABLE')
    need(all(row['target'] == 'candidate' and row['project_reference'] in {'project_id', 'project_number'}
             for row in latest_references(release, intent, service).values()),
         'LATEST_REVISION_CHANGED')
    need(release.traffic(service) == {intent['baseline']: 100}, 'STAGE_TRAFFIC_CHANGED')
    # Validate desired traffic too; a pending or implicit/latest target is not
    # equivalent to the exact, retained baseline allocation.
    desired = [r for r in service.get('traffic', []) if r.get('percent', 0) > 0]
    need(len(desired) == 1 and desired[0].get('revision') == intent['baseline']
         and desired[0].get('percent') == 100
         and desired[0].get('type') == 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION',
         'DECLARED_TRAFFIC_CHANGED')
    release.pinned_tags(service)
    need(release.fingerprint(service['template']) == intent['configuration']
         and release.image(service['template']) == intent['image'], 'TEMPLATE_CHANGED')
    for revision, expected_name, expected_image in (
            (baseline, intent['baseline'], intent['baselineImage']),
            (candidate, name, intent['image'])):
        need(revision.get('name') == f'{RESOURCE}/revisions/{expected_name}'
             and release.ready(revision) and release.image(revision) == expected_image
             and release.fingerprint(revision) == intent['configuration'], 'REVISION_CHANGED')
    return {'baseline_percent': 100, 'candidate_percent': 0,
            'candidate': name, 'both_revisions_ready': True,
            'images_and_configuration_matched': True}


def continuity(h, c, gateway, wif, pins, config):
    # Do not call the historical assess(): its latest-ready-at-100% rule is
    # incompatible with an intentionally staged Coach. Verify that separately.
    need(c.ready(gateway), 'GATEWAY_READINESS_CHANGED')
    env = c.env_of(gateway)
    need(all(env.get(flag) == 'true' for flag in c.ADULT_FLAGS)
         and env.get('FACTORY_ACTIONS_APPROVED') == 'true', 'ADULT_APPROVAL_CHANGED')
    need(pins == [h.PRIVATE_WORKER, h.PRIVATE_WORKER, h.PRIVATE_WORKER, 'true'],
         'WORKER_APPROVAL_OR_PIN_CHANGED')
    c.check_wif(wif, h.PRIVATE_WORKER)
    need(config.get('active') is True and config.get('approval', {}).get('enabled') is True
         and config.get('workerApprovedSha') == h.PRIVATE_WORKER
         and config.get('workerRepository') == c.PRIVATE_REPO, 'PRIVATE_CONFIG_CHANGED')
    return {'adult_configuration': 'VERIFIED', 'worker_pin_and_trust': 'VERIFIED',
            'mounted_private_configuration': 'VERIFIED', 'live_provider_reply': 'NOT_TESTED'}


def instant(value):
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    need(parsed.tzinfo is not None, 'LOG_TIMESTAMP_INVALID')
    return parsed


def log_filter(revisions, start, end, errors=False):
    need(len(revisions) == 2 and all(re.fullmatch(r'[a-z0-9-]+', r) for r in revisions),
         'REVISION_FILTER_INVALID')
    fields = [f'timestamp >= "{start.isoformat()}"', f'timestamp <= "{end.isoformat()}"',
              'resource.type="cloud_run_revision"', f'resource.labels.project_id="{PROJECT}"',
              f'resource.labels.location="{REGION}"', f'resource.labels.service_name="{SERVICE}"',
              '(' + ' OR '.join(f'resource.labels.revision_name="{r}"' for r in revisions) + ')']
    if errors:
        fields += ['severity>=ERROR', f'(logName="{REQUEST_LOG}" OR logName="{SYSTEM_LOG}")']
    else:
        fields += [f'logName="{REQUEST_LOG}"', 'httpRequest.requestMethod="POST"',
                   'httpRequest.requestUrl =~ "/v1/private-coach/complete($|[?])"']
    return ' AND '.join(fields)


def log_summary(entries, revisions, start, end, errors=False):
    need(isinstance(entries, list) and len(entries) <= LIMIT + 1, 'LOG_RESPONSE_INVALID')
    counts = Counter()
    for index, row in enumerate(entries):
        need(isinstance(row, dict) and set(row) <= {'timestamp', 'resource', 'logName', 'severity', 'httpRequest'},
             'LOG_PROJECTION_INVALID')
        resource = row.get('resource', {})
        labels = resource.get('labels', {})
        need(set(resource) == {'type', 'labels'} and resource['type'] == 'cloud_run_revision'
             and set(labels) == {'project_id', 'location', 'service_name', 'revision_name'}
             and labels['project_id'] == PROJECT and labels['location'] == REGION
             and labels['service_name'] == SERVICE and labels['revision_name'] in revisions,
             'LOG_SCOPE_INVALID')
        need(start <= instant(row['timestamp']) <= end, 'LOG_WINDOW_INVALID')
        severity = row.get('severity', 'DEFAULT')
        need(severity in {'DEFAULT', 'DEBUG', 'INFO', 'NOTICE', 'WARNING'} | ERROR_LEVELS,
             'LOG_SEVERITY_INVALID')
        http = row.get('httpRequest', {})
        need(isinstance(http, dict) and set(http) <= {'status'}, 'LOG_HTTP_PROJECTION_INVALID')
        status = http.get('status')
        if row.get('logName') == REQUEST_LOG:
            need(type(status) is int and 100 <= status <= 599, 'LOG_STATUS_INVALID')
            category = 'request'
        else:
            need(errors and row.get('logName') == SYSTEM_LOG and not http, 'LOG_NAME_INVALID')
            category = 'platform'
        need(not errors or severity in ERROR_LEVELS, 'LOG_ERROR_SEVERITY_INVALID')
        if index < LIMIT:
            role = 'baseline' if labels['revision_name'] == revisions[0] else 'candidate'
            counts[(role, category, severity, status)] += 1
    return {'read_succeeded': True, 'sample_limit': LIMIT, 'truncated': len(entries) > LIMIT,
            'counts': [{'revision': r, 'category': c, 'severity': s, 'http_status': h, 'count': n}
                       for (r, c, s, h), n in sorted(counts.items(), key=lambda item: str(item[0]))]}


def observe(report):
    h, base, a = support()
    output = Path(tempfile.mkdtemp(prefix='coach-stage-observation-', dir=WORK))
    report['private_output'] = str(output)
    report['phase'] = 'RECEIPTS_AND_GITHUB'
    activated = h.historical_receipts(base, a)
    api = base.GitHub(a)
    h.controls(a, api, enabled=True)
    raw = h.github_file(api, 'ops/release.json', h.RELEASE_COMMIT)
    need(digest(raw) == h.INTENT_HASH, 'STAGE_INTENT_CHANGED')
    intent = json.loads(raw)
    proof = h.run_gate(api, STAGE_RUN, h.RELEASE_COMMIT, 'jems-cloud-run-release.yml',
                       'workflow_dispatch', {'plan', 'transition'})
    job = api.get(h.PREFIX + f"actions/jobs/{proof['jobs']['transition']}")
    for step in ('Verify signed image provenance', 'Check current main and execute reviewed transition'):
        need(any(s['name'] == step and s['conclusion'] == 'success' for s in job['steps']), 'STAGE_STEP_UNVERIFIED')
    report.update(source=h.SOURCE, release_commit=h.RELEASE_COMMIT, stage_run=STAGE_RUN)
    report['phase'] = 'LIVE_CLOUD'
    access = importlib.import_module('verify_release_access')
    google = access.Google(command(['gcloud', 'auth', 'print-access-token', '--quiet']))
    identity = google.identity()
    need(identity.get('verified_email') is True and identity.get('email') == command(
        ['gcloud', 'config', 'get-value', 'account']), 'OPERATOR_IDENTITY_UNVERIFIED')
    def get(method, resource):
        need(method == 'GET', 'MUTATION_REJECTED')
        return google.get('https://run.googleapis.com/v2/' + resource)
    release = a.review.release
    current = get('GET', RESOURCE)
    name = release.revision_name(intent)
    baseline = get('GET', RESOURCE + '/revisions/' + intent['baseline'])
    candidate = get('GET', RESOURCE + '/revisions/' + name)
    report['latest_revision_references'] = latest_references(release, intent, current)
    report['stage'] = staged_state(release, intent, current, baseline, candidate)
    for expected in activated['service_baselines']:
        if expected['service'] == SERVICE:
            continue
        observed = release.inspect_service(expected['service'], get)
        need(all(observed[k] == expected[k] for k in observed)
             and observed['matchesServingConfiguration'] is True, 'PEER_BASELINE_CHANGED')
    report['peer_baselines'] = 'VERIFIED'
    access.permission_check(google, 'operator_coach_recovery', 'https://run.googleapis.com/v2/'
                            + RESOURCE + ':testIamPermissions', {'run.services.get', 'run.services.update'}, set())
    access.permission_check(google, 'operator_operation_read',
                            'https://cloudresourcemanager.googleapis.com/v3/projects/1054529152893:testIamPermissions',
                            {'run.operations.get'}, set())
    report['recovery_access'] = 'VERIFIED'
    report['phase'] = 'CONTINUITY'
    c = load_pinned(WORK / h.VERIFICATION_FOLDER / 'continuity.py', h.CONTINUITY_HASH)
    gateway = json.loads(command(['gcloud', 'run', 'services', 'describe', 'factory-gateway',
                                  '--project=' + PROJECT, '--region=' + REGION, '--format=json']))
    wif = json.loads(command(['gcloud', 'iam', 'workload-identity-pools', 'providers', 'describe',
                              'private-worker', '--project=' + PROJECT, '--location=global',
                              '--workload-identity-pool=fgf-github', '--format=json']))
    pins = [command(['gh', 'api', '--hostname', 'github.com', 'repos/' + c.PRIVATE_REPO + '/git/ref/' + ref,
                     '--jq', '.object.sha']) for ref in ('heads/main', 'tags/factory-execution-' + h.PRIVATE_WORKER)]
    pins += [command(['gh', 'variable', 'get', key, '-R', c.PRIVATE_REPO])
             for key in ('FACTORY_PRIVATE_WORKER_SHA', 'FACTORY_ACTIONS_APPROVED')]
    mounted = c.mounted_config(gateway)
    need(mounted is not None, 'MOUNTED_CONFIGURATION_UNVERIFIED')
    config = json.loads(command(['gcloud', 'secrets', 'versions', 'access', mounted[1],
                                '--secret=' + mounted[0], '--project=' + PROJECT]))
    report['continuity'] = continuity(h, c, gateway, wif, pins, config)
    report['phase'] = 'LOG_METADATA'
    end = datetime.now(timezone.utc)
    run = api.get(h.PREFIX + f'actions/runs/{STAGE_RUN}')
    start = max(end - timedelta(minutes=15), instant(run['created_at']))
    need(start < end, 'OBSERVATION_WINDOW_INVALID')
    revisions = [intent['baseline'], name]
    report['window'] = {'from': start.isoformat(), 'through': end.isoformat()}
    report['logs'] = {}
    for key, errors in (('completion_requests', False), ('request_platform_errors', True)):
        entries = json.loads(command(['gcloud', 'logging', 'read', log_filter(revisions, start, end, errors),
                                      '--project=' + PROJECT, '--limit=' + str(LIMIT + 1), '--order=desc',
                                      '--quiet', '--format=' + FORMAT]))
        report['logs'][key] = log_summary(entries, revisions, start, end, errors)
    report['phase'] = 'FINAL_STATE'
    again = get('GET', RESOURCE)
    need(again == current, 'SERVICE_CHANGED_DURING_OBSERVATION')
    h.controls(a, api, enabled=True)
    runs = api.pages(h.PREFIX + 'actions/workflows/jems-cloud-run-release.yml/runs?branch=main', 'workflow_runs')
    need(all(r['status'] == 'completed' for r in runs)
         and {r['id'] for r in runs if r['head_sha'] == h.RELEASE_COMMIT} == {h.PLAN_RUN, STAGE_RUN},
         'OTHER_RELEASE_ATTEMPT_REQUIRES_REVIEW')
    report.update(status='READ_ONLY_STAGE_OBSERVATION_COMPLETE', phase='COMPLETE',
                  observed_at=datetime.now(timezone.utc).isoformat())
    # Empty counts prove only query access. Even complete logs do not prove an
    # Adult conversation, provider behavior, retained games or drained work.
    report['monitoring_sample_complete'] = not any(v['truncated'] for v in report['logs'].values())
    report['candidate_errors_observed'] = sum(r['count'] for r in report['logs']['request_platform_errors']['counts']
                                            if r['revision'] == 'candidate')
    a.review.private_json(output / 'github-evidence.json', api.evidence)
    return output


def main():
    sys.dont_write_bytecode = True
    os.umask(0o077)
    report = {'status': 'READ_ONLY_STAGE_OBSERVATION_BLOCKED', 'phase': 'LOCAL_SUPPORT', 'mutations': 0,
              'limits': 'No paid call, data inventory, job-drain or gameplay acceptance. Empty logs are not functional success. No canary was dispatched.'}
    try:
        output = observe(report)
        code = 0
    except Exception as error:
        report['status'] = 'READ_ONLY_STAGE_OBSERVATION_BLOCKED'
        report['error_code'] = str(error) if isinstance(error, ObservationError) else 'CHECK_FAILED_RAW_ERROR_SUPPRESSED'
        code = 2
        output = Path(report['private_output']) if 'private_output' in report else None
    if output is not None:
        try:
            raw = (json.dumps(report, sort_keys=True, indent=2) + '\n').encode()
            with (output / 'completion.json').open('xb') as stream:
                stream.write(raw)
            report['completion_sha256'] = digest(raw)
        except OSError:
            report.update(status='READ_ONLY_STAGE_OBSERVATION_BLOCKED', error_code='RECEIPT_WRITE_FAILED')
            code = 2
    print(json.dumps(report, sort_keys=True, indent=2))
    return code


if __name__ == '__main__':
    sys.exit(main())
