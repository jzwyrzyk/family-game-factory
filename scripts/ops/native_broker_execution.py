"""Resume the verified zero-traffic #227 broker stage with one traffic target. Does not open Terraform state."""
import argparse
from datetime import datetime, timezone
import fcntl
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time

import bootstrap_request_diagnostics as broker
import continue_broker_activation as continuation
import production_activation as review
import release
import github_operations as github
import native_settled_coverage
from admin_api import Http, SetupError, command, require

SOURCE = 'bca6b5c383ed741e252793e468776921e32ff67f'
INTEGRATION = '4b055d857e357b5a32b184d52a8ea22338178a81'
ARCHIVE = '0ae8450f85574d941208ed21c7508abbfa7c60329a63c6037e56320bf9d6aa1d'
ROLLBACK_REVISION = 'jems-request-evidence-00001-nqz'
SERVICE = broker.SERVICE
BASE = release.LOCATION + '/services/' + SERVICE
ALLOW = {('roles/run.invoker','serviceAccount:' + broker.CALLER)}


def saved(folder, name):
    return json.loads((folder / name).read_text())


def keep(folder, name, data):
    review.private_json(folder / name, data)


def integrated(main):
    require(re.fullmatch('[0-9a-f]{40}',main), 'INVALID_MAIN')
    pr = github.api('GET', github.PREFIX + 'pulls/228')
    require(pr['merged'] is True and pr['head']['sha'] == INTEGRATION and pr['base']['ref'] == 'main'
            and pr['merge_commit_sha'] == main, 'APPROVED_INTEGRATION_UNVERIFIED')
    ref = github.api('GET', github.PREFIX + 'branches/main')
    require(ref.get('protected') is True and ref['commit']['sha'] == main, 'PROTECTED_MAIN_MOVED')


def verify_saved_build(folder):
    require(all((folder / name).is_file() for name in ('build-id.json', 'verified-build.json', 'stage.json')),
            'STAGED_BUILD_RECEIPTS_REQUIRED')
    build_id = saved(folder, 'build-id.json')['id']
    require(re.fullmatch(continuation.UUID, build_id), 'BUILD_ID_INVALID')
    proof = continuation.invoke(SOURCE, 'broker-build', ['--build-id', build_id], Path.home())
    require(proof == saved(folder, 'verified-build.json') and proof.get('source_sha') == SOURCE
            and proof.get('status') == 'BUILD_VERIFIED_NOT_DEPLOYED' and proof.get('archive_sha256') == ARCHIVE
            and proof.get('build_id') == build_id, 'VERIFIED_BUILD_CHANGED')
    broker.config(proof['image'])
    return proof


def service_policy():
    policy = broker.run('run','services','get-iam-policy',SERVICE,'--region='+broker.REGION)
    require(broker.grants(policy,ALLOW,'broker') == ALLOW,'BROKER_INVOKER_MISMATCH')
    return review.digest(policy)


def run_request(client, operation, method, path, body=None):
    try:
        return client.call(method, 'v2/' + path, body)
    except SetupError as exc:
        # admin_api suppresses the response body. Keep only its canonical HTTP
        # status and the local operation name, never the upstream path or text.
        match = re.search(r' returned HTTP ([1-5][0-9]{2})$', str(exc))
        suffix = 'HTTP_' + match[1] if match else 'RESPONSE_UNAVAILABLE'
        raise SetupError('BROKER_' + operation + '_' + suffix) from None


def api(method,path,body=None):
    # Exact service and reviewed revision GETs; only the existing etag-bound controller can patch traffic/template.
    allowed = (method == 'GET' and (path == BASE or path.startswith(BASE+'/revisions/'))) or (
        method == 'PATCH' and path == BASE+'?updateMask=traffic')
    require(allowed,'UNEXPECTED_CLOUD_RUN_OPERATION')
    token = command(['gcloud','auth','print-access-token','--quiet'])
    client = Http('https://run.googleapis.com',token,{'x-goog-user-project':broker.PROJECT})
    if method == 'PATCH':
        action = 'SET_TRAFFIC'
        require(isinstance(body, dict) and set(body) == {'traffic', 'etag'} and body['etag']
                and len(body['traffic']) == 1 and body['traffic'][0] == release.traffic_target(
                    body['traffic'][0].get('revision'), 100) and body['traffic'][0].get('revision'),
                'SINGLE_TRAFFIC_TARGET_REQUIRED')
    else:
        action = 'READ_SERVICE' if path == BASE else 'READ_REVISION'
    result = run_request(client, action, method, path, body)
    if method == 'PATCH':
        operation = result.get('name','')
        require(re.fullmatch('projects/(?:'+broker.PROJECT+'|'+broker.NUMBER+
                             ')/locations/us-east5/operations/[A-Za-z0-9_-]+',operation),'OPERATION_ID_INVALID')
        for _ in range(90):
            if result.get('done'):
                if 'error' in result:
                    code = result['error'].get('code') if isinstance(result['error'], dict) else None
                    status = str(code) if type(code) is int and 0 < code <= 16 else 'UNKNOWN'
                    raise SetupError('BROKER_' + action + '_RPC_' + status)
                return result
            time.sleep(4)
            result = run_request(client, 'POLL_' + action, 'GET', operation)
        raise SetupError('BROKER_OPERATION_UNCERTAIN')
    number = 'projects/'+broker.NUMBER+'/'
    for key in ('name','latestCreatedRevision','latestReadyRevision'):
        if str(result.get(key,'')).startswith(number):
            result[key] = 'projects/'+broker.PROJECT+'/'+result[key][len(number):]
    if path == BASE:
        for key in ('latestCreatedRevision','latestReadyRevision'):
            value = result.get(key)
            if isinstance(value,str) and re.fullmatch(SERVICE+r'-[a-z0-9-]+',value):
                result[key] = BASE + '/revisions/' + value
        for key in ('traffic','trafficStatuses'):
            for row in result.get(key, []):
                revision = row.get('revision','')
                for project in (broker.PROJECT,broker.NUMBER):
                    prefix = f'projects/{project}/locations/us-east5/services/{SERVICE}/revisions/'
                    if revision.startswith(prefix):
                        row['revision'] = revision.removeprefix(prefix)
                        break
    return result


def guard(baseline):
    current = api('GET',BASE)
    require(current.get('name') == BASE and current.get('uid') == baseline['service_uid'] and not current.get('invokerIamDisabled',False)
            and not current.get('reconciling',False) and not release.pinned_tags(current)
            and current['template'].get('serviceAccount') == broker.BROKER
            and service_policy() == baseline['policy_hash'],'BROKER_IDENTITY_IAM_OR_TRAFFIC_CHANGED')
    return current


def rollout(folder,baseline,image,rollback=False):
    original = baseline['baseline']
    candidate = release.revision_name({**baseline, 'image': image})
    require(saved(folder, 'stage.json') == {'revision': candidate, 'image': image, 'traffic': {original: 100}},
            'STAGE_RECEIPT_DIFFERS')
    current = guard(baseline)
    require(current.get('scaling', {}).get('maxInstanceCount') == 1 and
            release.fingerprint(current['template']) == baseline['configuration'], 'BROKER_CONFIGURATION_CHANGED')
    allocation = release.traffic(current)
    require(allocation in ({original: 100}, {candidate: 100}), 'UNEXPECTED_TRAFFIC')
    target = original if rollback else candidate

    def verify_revision(name, expected_image):
        path = BASE + '/revisions/' + name
        revision = api('GET', path)
        require(revision.get('name') == path and release.ready(revision) and release.image(revision) == expected_image
                and release.fingerprint(revision) == baseline['configuration'], 'REVISION_PROOF_MISMATCH')

    verify_revision(original, baseline['baselineImage'])
    expected = BASE + '/revisions/' + candidate
    if not rollback or allocation != {original: 100}:
        require(current.get('latestCreatedRevision') == expected and release.image(current['template']) == image,
                'STAGED_REVISION_CHANGED')
    if not rollback:
        # Service.latestReadyRevision identifies a revision serving traffic.
        # The staged revision has zero traffic and its own Ready condition.
        verify_revision(candidate, image)
    if allocation != {target: 100}:
        require(current.get('etag'), 'SERVICE_ETAG_MISSING')
        api('PATCH', BASE + '?updateMask=traffic',
            {'etag': current['etag'], 'traffic': [release.traffic_target(target, 100)]})
    after = guard(baseline)
    require(after.get('scaling', {}).get('maxInstanceCount') == 1 and release.traffic(after) == {target: 100}
            and release.fingerprint(after['template']) == baseline['configuration'], 'TRAFFIC_READBACK_UNVERIFIED')
    verify_revision(target, baseline['baselineImage'] if rollback else image)
    return target


def execute(main,folder):
    integrated(main)
    require((folder / 'rollback.json').is_file(), 'ROLLBACK_RECEIPT_REQUIRED')
    baseline = saved(folder,'rollback.json')
    require(baseline.get('source') == SOURCE and baseline.get('service') == SERVICE and
            baseline.get('baseline') == ROLLBACK_REVISION, 'ROLLBACK_IDENTITY_INVALID')
    guard(baseline)
    proof = verify_saved_build(folder)
    require(proof['image'] != baseline['baselineImage'],'CANDIDATE_EQUALS_ROLLBACK')
    if (folder/'qualification-intent.json').exists():
        if (folder/'accepted.json').exists():
            return saved(folder,'accepted.json')
        rollout(folder, baseline, proof['image'], rollback=True)
        print(json.dumps({'rollback':'BASELINE_TRAFFIC_VERIFIED','revision':baseline['baseline']}), flush=True)
        raise SetupError('QUALIFICATION_ALREADY_ATTEMPTED_INSPECT_RECEIPT')
    try:
        revision = rollout(folder,baseline,proof['image'])
        keep(folder,'qualification-intent.json',{'main':main,'revision':revision,'image':proof['image']})
        checked = subprocess.run(['bash', str(continuation.LAUNCHER), SOURCE, 'broker-iam', '--native-controller',
                                  main, proof['image'].split('@')[1]], stdout=subprocess.PIPE, text=True, check=False)
        require(bool(checked.stdout.strip()), 'IAM_REPORT_MISSING')
        report = json.loads(checked.stdout)
        require(isinstance(report, dict), 'INVALID_IAM_REPORT')
        print(json.dumps(report), flush=True)
        keep(folder, 'iam-summary.json', report)
        require(checked.returncode == 0 and report.get('broker_iam') == 'FINITE_POLICY_CHECKS_PASSED'
                and report.get('passed') == report.get('checks') == 77 and report.get('failures') == [],
                'IAM_ACCEPTANCE_FAILED')
        native = report.get('credential_check', {})
        require(native.get('status') == 'NATIVE_PERMISSIONS_VERIFIED' and native.get('workflow_source') == main
                and native.get('broker_digest') == proof['image'].split('@')[1]
                and native.get('broker_revision') == revision and re.fullmatch('[1-9][0-9]*', native.get('run_id', ''))
                and re.fullmatch('sha256:[0-9a-f]{64}', native.get('artifact_sha256', '')), 'NATIVE_EVIDENCE_UNVERIFIED')
        result = {'status':'BROKER_IAM_ACCEPTED_COVERAGE_PENDING','build_id':proof['build_id'],
                  'image':proof['image'],'serving_revision':revision,'rollback_revision':baseline['baseline'],
                  'native_run':native['run_id'], 'artifact_sha256':native['artifact_sha256']}
        keep(folder,'accepted.json',result)
        return result
    except (Exception,KeyboardInterrupt):
        rollout(folder,baseline,proof['image'],rollback=True)
        print(json.dumps({'rollback':'BASELINE_TRAFFIC_VERIFIED','revision':baseline['baseline']}),flush=True)
        raise


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--source-sha',required=True)
    p.add_argument('--resume-staged', action='store_true', required=True)
    p.add_argument('protected_main')
    args = p.parse_args()
    os.umask(0o077)
    folder = Path(os.environ['JEMS_OPERATION_JOURNAL']).parent / ('native-broker-'+SOURCE)
    require(folder.is_dir() and not folder.is_symlink() and folder.stat().st_uid == os.getuid() and
            folder.stat().st_mode & 0o077 == 0,'PRIVATE_RECEIPT_DIRECTORY_REQUIRED')
    print('Broker execution receipts: '+str(folder),flush=True)
    with (folder/'operator.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        accepted = execute(args.protected_main,folder)
        print(json.dumps(accepted),flush=True)
        path = folder/'coverage-observation.json'
        if not path.exists():
            require(release.traffic(guard(saved(folder, 'rollback.json'))) ==
                    {accepted['serving_revision']: 100}, 'ACCEPTED_REVISION_MOVED')
            evidence = native_settled_coverage.collect(command(['gcloud','auth','print-access-token','--quiet']),
                                                      datetime.now(timezone.utc))
            keep(folder,path.name,evidence)
        result = saved(folder,path.name)
        print(json.dumps({k:result[k] for k in ('status','start_utc','end_utc','routing_checks','services','attestation_installed')}),flush=True)


if __name__ == '__main__':
    try:
        main()
    except (Exception,KeyboardInterrupt) as exc:
        message = str(exc)
        code = message if re.fullmatch('[A-Z][A-Z0-9_]{2,80}',message) else type(exc).__name__
        print(json.dumps({'status':'STOPPED','code':code,'automatic_resubmission':False}),flush=True)
        sys.exit(2)
