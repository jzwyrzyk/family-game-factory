#!/usr/bin/env python3
"""Owner-side read-only observation after Coach promotion and Gateway stage."""
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import types

REPO = 'jzwyrzyk/family-game-factory'
WORK = Path('/home/jzwyrzyk/jems-production-activation.lekdl0n2')
STAGE_MAIN = '9733364de7674df49b531174781b813db20afa47'
STAGE_RUN = '45299860492'
PROMOTE_MAIN = 'a4bdadfb08538b2ab46c09e5d17cf1c24e6303fc'
PROMOTE_RUN = '45299475371'
HELPER_SOURCE = 'c63c5a01e9b74b0adff660ea3a763775723da534'
HELPERS = {
    'release': ('scripts/ops/release.py', '81e520fae28de860e662e050f8de5a0611e006c8b5e25d3323579957e5d4da1d'),
    'conditions': ('scripts/ops/observe_coach_stage.py', '2d601a47372bab8daec350d53ab7bbfa8a9e9007246aaa823d7d004d261039c0'),
    'runtime': ('scripts/deployment/inspect_coach_runtime.py', '708ca587a15537b2da8a7ac2a6f52ed7a9fc4be7ec86b7bd8204bfa527c6cf2c'),
}
PROJECT = 'family-game-factory-jzw'
PROJECT_NUMBER = '1054529152893'
PREFIX = 'us-east5-docker.pkg.dev/' + PROJECT + '/'
PINS = {
    'factory-coach-private': {
        'candidate': 'factory-coach-private-r-890188092e3f4396dab0',
        'baseline': 'factory-coach-private-chatready-1996c1b382a7-9c98a0',
        'image': PREFIX + 'jems-release-images/coach@sha256:67cf3b3b92f83ecf5f107b68c00606cf5bbc946561d13104d37ad929c80575e3',
        'baselineImage': PREFIX + 'factory-services/coach@sha256:5719a739f5a470adf40bb544aab82afee3fab4dea8b2544b7f2b5dcc16e21488',
        'configuration': '92c35f30b7dd8ff67d8fc41eb1b1319b1180c4686af53d6a10195f9fd68c13a7',
        'candidatePercent': 100,
    },
    'factory-gateway': {
        'candidate': 'factory-gateway-r-eaf5effa06d031818f52',
        'baseline': 'factory-gateway-pr115-19f5e46ae114-fb5fa6',
        'image': PREFIX + 'jems-release-images/gateway@sha256:18c62e421f5a8c4f6fbf4223b2121f979e64cdf7a9d3821ddf03379dad082436',
        'baselineImage': PREFIX + 'factory-services/gateway@sha256:7a36d722f09e8a78aefbbb5470c5b8fc164d8be10b8222feea2947dd266cd7d0',
        'configuration': 'e75c30de0f926d94228c2fc6fca2a1e204b87c0e1577d1163edc6be974505510',
        'candidatePercent': 0,
    },
}


class ObservationError(Exception):
    pass


def need(value, code):
    if not value:
        raise ObservationError(code)


def command(args, timeout=60):
    result = subprocess.run(args, stdin=subprocess.DEVNULL, capture_output=True, timeout=timeout)
    need(result.returncode == 0, 'READ_COMMAND_FAILED')
    need(len(result.stdout) <= 1_000_000, 'READ_RESPONSE_TOO_LARGE')
    return result.stdout


def github(path):
    return json.loads(command(['gh', 'api', '--hostname', 'github.com', 'repos/' + REPO + '/' + path]))


def workflow(run, sha):
    value = github('actions/runs/' + run)
    need(str(value.get('id')) == run and value.get('head_sha') == sha
         and value.get('head_branch') == 'main' and value.get('event') == 'push'
         and value.get('run_attempt') == 1
         and value.get('path') == '.github/workflows/jems-cloud-run-release.yml'
         and value.get('status') == 'completed' and value.get('conclusion') == 'success',
         'RELEASE_RUN_NOT_SUCCESSFUL')
    jobs = github('actions/runs/' + run + '/jobs?per_page=100').get('jobs', [])
    transitions = [row for row in jobs if row.get('name') == 'transition']
    need(len(transitions) == 1 and transitions[0].get('status') == 'completed'
         and transitions[0].get('conclusion') == 'success', 'TRANSITION_NOT_SUCCESSFUL')
    completed = transitions[0].get('completed_at', '')
    need(isinstance(completed, str) and re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z', completed), 'TRANSITION_TIME_INVALID')
    return {'run': int(run), 'commit': sha, 'conclusion': 'success', 'transition_completed_at': completed}


def known_reference(value, service, revision=None):
    suffix = '/locations/us-east5/services/' + service
    if revision is not None:
        suffix += '/revisions/' + revision
    return value in {'projects/' + project + suffix for project in (PROJECT, PROJECT_NUMBER)}


def verify_state(release, condition_summary, service, current, revisions):
    pins = PINS[service]
    need(known_reference(current.get('name'), service), 'SERVICE_IDENTITY_CHANGED')
    generation = current.get('generation')
    need(isinstance(generation, str) and re.fullmatch(r'[1-9][0-9]*', generation)
         and current.get('observedGeneration') == generation and not current.get('reconciling', False)
         and current.get('terminalCondition', {}).get('type') == 'Ready'
         and current.get('terminalCondition', {}).get('state') == 'CONDITION_SUCCEEDED',
         'SERVICE_NOT_RECONCILED')
    need(known_reference(current.get('latestCreatedRevision'), service, pins['candidate']), 'LATEST_CREATED_CHANGED')
    need(any(known_reference(current.get('latestReadyRevision'), service, pins[role])
             for role in ('candidate', 'baseline')), 'LATEST_READY_CHANGED')
    active = pins['candidate'] if pins['candidatePercent'] else pins['baseline']
    need(release.traffic(current) == {active: 100}, 'EFFECTIVE_TRAFFIC_CHANGED')
    desired = [row for row in current.get('traffic', []) if row.get('percent', 0) > 0]
    need(len(desired) == 1 and desired[0].get('revision') == active and desired[0].get('percent') == 100
         and desired[0].get('type') == 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION', 'DESIRED_TRAFFIC_CHANGED')
    release.pinned_tags(current)
    need(release.fingerprint(current['template']) == pins['configuration'], 'SERVICE_CONFIGURATION_CHANGED')
    conditions = {}
    for role in ('candidate', 'baseline'):
        item = revisions[role]
        need(known_reference(item.get('name'), service, pins[role]) and release.ready(item), 'REVISION_NOT_READY')
        need(release.image(item) == pins['image' if role == 'candidate' else 'baselineImage'], 'REVISION_IMAGE_CHANGED')
        need(release.fingerprint(item) == pins['configuration'], 'REVISION_CONFIGURATION_CHANGED')
        conditions[role] = condition_summary(item)
    return {'candidate': pins['candidate'], 'candidate_percent': pins['candidatePercent'],
            'baseline_percent': 100 - pins['candidatePercent'], 'service_reconciled': True,
            'images_and_configuration_matched': True, 'both_revisions_ready': True,
            'candidate_conditions': conditions['candidate'],
            'candidate_lifecycle_review': 'REQUIRED_BEFORE_CANARY' if not pins['candidatePercent'] else 'SERVING',
            'post_transition_conversation': 'NOT_TESTED_BY_THIS_READ'}


FAILURE_STAGES = set('caller_verification configuration readiness input_validation budget input_moderation inference output_moderation usage_validation reply_validation unknown'.split())
FAILURE_REASONS = set('denied verification_failed unavailable invalid_request input_limit private_information turn_budget rate_limit http_error transport_error timeout cancelled invalid_json invalid_shape response_limit refused incomplete output_limit provider_failed invalid_usage reply_invalid reply_shape_invalid reply_proposal_invalid reply_quote_invalid reply_question_invalid readiness_missing readiness_invalid readiness_shape_invalid readiness_evidence_invalid readiness_inconsistent readiness_context_invalid readiness_reference_invalid unknown'.split())


def failure_metadata(entries, after, through):
    need(isinstance(entries, list) and len(entries) <= 51, 'FAILURE_SAMPLE_INVALID')
    rows = []
    for item in entries[:50]:
        need(isinstance(item, dict) and set(item) <= {'timestamp', 'resource', 'jsonPayload'}, 'FAILURE_FIELDS_INVALID')
        resource, event = item.get('resource', {}), item.get('jsonPayload', {})
        need(isinstance(resource, dict) and set(resource) <= {'labels'} and isinstance(resource.get('labels'), dict)
             and set(resource['labels']) == {'revision_name'}, 'FAILURE_RESOURCE_INVALID')
        need(isinstance(event, dict) and set(event) <= {'event', 'version', 'stage', 'reason', 'providerHttpStatus', 'incompleteReason', 'elapsedMs'}
             and event.get('event') == 'jems_private_coach_failure' and type(event.get('version')) is int and event['version'] == 1,
             'FAILURE_EVENT_INVALID')
        revision = resource['labels']['revision_name']
        need(revision in {PINS['factory-coach-private'][role] for role in ('candidate', 'baseline')}, 'FAILURE_REVISION_INVALID')
        at = datetime.fromisoformat(item['timestamp'].replace('Z', '+00:00'))
        need(at.tzinfo is not None and after <= at <= through, 'FAILURE_TIME_INVALID')
        stage, reason = event.get('stage'), event.get('reason')
        need(isinstance(stage, str) and stage in FAILURE_STAGES and isinstance(reason, str) and reason in FAILURE_REASONS, 'FAILURE_ENUM_INVALID')
        row = {'at': at.isoformat(), 'revision': revision, 'stage': stage, 'reason': reason}
        for key, valid in (
            ('providerHttpStatus', lambda value: type(value) is int and 100 <= value <= 599),
            ('elapsedMs', lambda value: type(value) is int and 0 <= value <= 3600000),
            ('incompleteReason', lambda value: isinstance(value, str) and value in {'max_output_tokens', 'content_filter', 'other'}),
        ):
            if key in event and event[key] is not None:
                need(valid(event[key]), 'FAILURE_VALUE_INVALID')
                row[key] = event[key]
        rows.append(row)
    return {'read_succeeded': True, 'sample_limit': 50, 'truncated': len(entries) == 51, 'events': rows}


def main():
    os.umask(0o077)
    os.environ.update(GH_DEBUG='', GH_PROMPT_DISABLED='1', CLOUDSDK_CORE_LOG_HTTP='false',
                      CLOUDSDK_CORE_DISABLE_PROMPTS='1', PYTHONDONTWRITEBYTECODE='1')
    folder = Path(tempfile.mkdtemp(prefix='backend-stage-observation.', dir=WORK))
    report = {'status': 'READ_ONLY_BACKEND_OBSERVATION_BLOCKED', 'mutations': 0,
              'private_output': str(folder), 'limits': 'No paid request, deploy, promotion or rollback. Request metadata does not establish content quality or post-transition conversation acceptance.'}
    try:
        need(all(re.fullmatch(r'[a-f0-9]{40}', value) for value in (STAGE_MAIN, PROMOTE_MAIN))
             and all(re.fullmatch(r'[1-9][0-9]*', value) for value in (STAGE_RUN, PROMOTE_RUN)), 'RECEIPT_PINS_REQUIRED')
        need(github('git/ref/heads/main')['object']['sha'] == STAGE_MAIN, 'MAIN_CHANGED')
        report['releases'] = {'coach': workflow(PROMOTE_RUN, PROMOTE_MAIN), 'gateway': workflow(STAGE_RUN, STAGE_MAIN)}
        modules = {}
        for name, (path, expected) in HELPERS.items():
            raw = command(['gh', 'api', '--hostname', 'github.com', '-H', 'Accept: application/vnd.github.raw+json',
                           'repos/' + REPO + '/contents/' + path + '?ref=' + HELPER_SOURCE])
            need(hashlib.sha256(raw).hexdigest() == expected, 'HELPER_CHECKSUM_MISMATCH')
            destination = folder / (name + '.py')
            destination.write_bytes(raw)
            module = types.ModuleType('pinned_' + name)
            module.__file__ = str(destination)
            exec(compile(raw, str(destination), 'exec'), module.__dict__)
            modules[name] = module
        release = modules['release']
        read = release.cloud_api(release.gcloud_token())
        report['services'] = {}
        for service, pins in PINS.items():
            resource = 'projects/' + PROJECT + '/locations/us-east5/services/' + service
            current = read('GET', resource)
            revisions = {role: read('GET', resource + '/revisions/' + pins[role]) for role in ('candidate', 'baseline')}
            report['services'][service] = verify_state(release, modules['conditions'].condition_summary, service, current, revisions)
        report['preview_release_input'] = release.inspect_service('factory-preview', read)
        need(report['preview_release_input']['matchesServingConfiguration'] is True, 'PREVIEW_CONFIGURATION_MISMATCH')
        runtime = json.loads(command(['python3', str(folder / 'runtime.py')], timeout=240))
        with (folder / 'runtime.json').open('x') as stream:
            json.dump(runtime, stream, sort_keys=True, indent=2)
        need('error' not in runtime.get('requests', {}) and all('error' not in row for row in runtime.get('services', [])), 'RUNTIME_READ_FAILED')
        rows = runtime.get('services', [])
        need(len(rows) == len(PINS) and {row.get('service') for row in rows} == set(PINS), 'RUNTIME_SERVICE_SET_CHANGED')
        for row in rows:
            pins = PINS[row['service']]
            active = pins['candidate'] if pins['candidatePercent'] else pins['baseline']
            need(row.get('trafficTotalPercent') == 100 and len(row.get('serving', [])) == 1
                 and row['serving'][0].get('revision') == active and row['serving'][0].get('percent') == 100,
                 'SERVING_TRAFFIC_CHANGED_DURING_READ')
        after = report['releases']['coach']['transition_completed_at']
        cutoff = datetime.fromisoformat(after.replace('Z', '+00:00'))
        requests = runtime['requests']
        report['requests_after_coach_promotion'] = {
            'from': after, 'query_window': requests.get('window'),
            'query_limit_reached': requests.get('queryLimitReached'),
            'post_list_at_limit': len(requests.get('lastChatPosts', [])) == 30,
            'status_response_body_not_observed': True,
            **{key: [row for row in requests.get(key, [])
                     if datetime.fromisoformat(row['at'].replace('Z', '+00:00')) >= cutoff]
               for key in ('lastChatPosts', 'latestStatusGets')},
        }
        through = datetime.now(timezone.utc)
        pins = PINS['factory-coach-private']
        query = ' AND '.join([
            'resource.type="cloud_run_revision"', 'resource.labels.location="us-east5"',
            'resource.labels.project_id="' + PROJECT + '"',
            'resource.labels.service_name="factory-coach-private"',
            '(resource.labels.revision_name="' + pins['candidate'] + '" OR resource.labels.revision_name="' + pins['baseline'] + '")',
            'logName="projects/' + PROJECT + '/logs/run.googleapis.com%2Fstderr"',
            'jsonPayload.event="jems_private_coach_failure"',
            'timestamp>="' + cutoff.isoformat() + '"', 'timestamp<="' + through.isoformat() + '"',
        ])
        projection = 'json(timestamp,resource.labels.revision_name,jsonPayload.event,jsonPayload.version,jsonPayload.stage,jsonPayload.reason,jsonPayload.providerHttpStatus,jsonPayload.incompleteReason,jsonPayload.elapsedMs)'
        entries = json.loads(command(['gcloud', 'logging', 'read', query, '--project=' + PROJECT,
                                      '--limit=51', '--order=desc', '--format=' + projection, '--quiet']))
        report['coach_failure_metadata_after_promotion'] = failure_metadata(entries, cutoff, through)
        need(github('git/ref/heads/main')['object']['sha'] == STAGE_MAIN, 'MAIN_CHANGED_DURING_OBSERVATION')
        report['status'] = 'READ_ONLY_BACKEND_OBSERVATION_COMPLETE'
    except Exception as error:
        report['error_code'] = str(error) if type(error) is ObservationError else 'CHECK_FAILED_RAW_ERROR_SUPPRESSED'
    report['observed_at'] = datetime.now(timezone.utc).isoformat()
    raw = (json.dumps(report, sort_keys=True, indent=2) + '\n').encode()
    with (folder / 'completion.json').open('xb') as stream:
        stream.write(raw)
    report['completion_sha256'] = hashlib.sha256(raw).hexdigest()
    print(json.dumps(report, sort_keys=True, indent=2))
    return 0 if report['status'] == 'READ_ONLY_BACKEND_OBSERVATION_COMPLETE' else 2


if __name__ == '__main__':
    raise SystemExit(main())
