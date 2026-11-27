"""One-time, fixed #227 broker publication and guarded rollout. Does not open Terraform state."""
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
import build_request_broker as build
import continue_broker_activation as continuation
import production_activation as review
import release
import github_operations as github
import native_settled_coverage
from admin_api import Http, SetupError, command, require

SOURCE = 'bca6b5c383ed741e252793e468776921e32ff67f'
INTEGRATION = '4b055d857e357b5a32b184d52a8ea22338178a81'
ARCHIVE = '0ae8450f85574d941208ed21c7508abbfa7c60329a63c6037e56320bf9d6aa1d'
PLAN = 'e2d6139981505e95187c86abc918efbc592b5f27e5d0b9a44f6baac7e7f1bf30'
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


def build_once(folder):
    reference = folder / 'build-id.json'
    if not reference.exists():
        existing = build.publication.cloud('builds','list','--region',build.REGION,
                                           '--filter=tags=source-' + SOURCE,'--limit=2')
        require(isinstance(existing,list) and len(existing) <= 1, 'SOURCE_BUILD_AMBIGUOUS')
        if existing:
            build_id = existing[0]['id']
        else:
            # Exclusive intent survives disconnect, uncertain submission, failed build or process restart.
            require(not (folder/'submission-intent.json').exists(), 'UNCERTAIN_SUBMISSION_NO_RETRY')
            plan = continuation.invoke(SOURCE,'broker-build',['--check'],Path.home())
            require(plan['approve_plan_sha256'] == PLAN and plan['plan']['source_sha'] == SOURCE and
                    plan['plan']['archive_sha256'] == ARCHIVE and plan['inventory'] == 'CHECKED', 'PLAN_CHANGED')
            keep(folder,'submission-intent.json',{'source':SOURCE,'plan':PLAN,'archive':ARCHIVE})
            result = continuation.invoke(SOURCE,'broker-build',['--submit','--approve-plan-sha256',PLAN],Path.home())
            require(result.get('status') == 'SUBMITTED_NOT_VERIFIED' and result.get('source_sha') == SOURCE,
                    'SUBMISSION_UNCERTAIN_NO_RETRY')
            build_id = result['build_id']
        require(re.fullmatch(continuation.UUID,build_id),'BUILD_ID_INVALID')
        keep(folder,'build-id.json',{'id':build_id})
    build_id = saved(folder,'build-id.json')['id']
    require(re.fullmatch(continuation.UUID,build_id),'BUILD_ID_INVALID')
    for _ in range(60):
        status = continuation.build_status(build_id)
        if status == 'SUCCESS':
            break
        require(status in ('QUEUED','PENDING','WORKING'),'BUILD_NOT_SUCCESS_NO_RETRY')
        time.sleep(15)
    else:
        raise SetupError('BUILD_PENDING_RESUME_BY_ID')
    proof = continuation.invoke(SOURCE,'broker-build',['--build-id',build_id],Path.home())
    require(proof['status'] == 'BUILD_VERIFIED_NOT_DEPLOYED' and proof['source_sha'] == SOURCE and
            proof['build_id'] == build_id and proof['archive_sha256'] == ARCHIVE, 'BUILD_PROOF_MISMATCH')
    broker.config(proof['image'])
    if not (folder/'verified-build.json').exists():
        keep(folder,'verified-build.json',proof)
    return proof


def service_policy():
    policy = broker.run('run','services','get-iam-policy',SERVICE,'--region='+broker.REGION)
    require(broker.grants(policy,ALLOW,'broker') == ALLOW,'BROKER_INVOKER_MISMATCH')
    return review.digest(policy)


def api(method,path,body=None):
    # Exact service and reviewed revision GETs; only the existing etag-bound controller can patch traffic/template.
    allowed = (method == 'GET' and (path == BASE or path.startswith(BASE+'/revisions/'))) or (
        method == 'PATCH' and path in (BASE+'?updateMask=traffic',BASE+'?updateMask=template,traffic'))
    require(allowed,'UNEXPECTED_CLOUD_RUN_OPERATION')
    token = command(['gcloud','auth','print-access-token','--quiet'])
    client = Http('https://run.googleapis.com',token,{'x-goog-user-project':broker.PROJECT})
    result = client.call(method,'v2/'+path,body)
    if method == 'PATCH':
        operation = result.get('name','')
        require(re.fullmatch('projects/(?:'+broker.PROJECT+'|'+broker.NUMBER+
                             ')/locations/us-east5/operations/[A-Za-z0-9_-]+',operation),'OPERATION_ID_INVALID')
        for _ in range(90):
            if result.get('done'):
                require('error' not in result,'BROKER_OPERATION_FAILED')
                return result
            time.sleep(4)
            result = client.call('GET','v2/'+operation)
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


def capture(folder):
    baseline = release.inspect_service(SERVICE,api)
    require(baseline['matchesServingConfiguration'], 'BASELINE_TEMPLATE_MISMATCH')
    image = baseline['baselineImage']
    broker.config(image)
    service = broker.run('run','services','describe',SERVICE,'--region='+broker.REGION)
    broker.validate_service(service,image)
    current = api('GET',BASE)
    require(not release.pinned_tags(current) and release.traffic(current) == {baseline['baseline']:100},
            'BASELINE_TRAFFIC_CHANGED')
    uid = current['uid']
    keep(folder,'rollback.json',{**baseline,'service_uid':uid,'policy_hash':service_policy(),
                                 'traffic':current['traffic'],'source':SOURCE})


def guard(baseline):
    current = api('GET',BASE)
    require(current.get('name') == BASE and current.get('uid') == baseline['service_uid'] and not current.get('invokerIamDisabled',False)
            and not current.get('reconciling',False) and not release.pinned_tags(current)
            and current['template'].get('serviceAccount') == broker.BROKER
            and service_policy() == baseline['policy_hash'],'BROKER_IDENTITY_IAM_OR_TRAFFIC_CHANGED')
    return current


def rollout(folder,baseline,image,rollback=False):
    intent = {**baseline,'image':image}
    candidate = release.revision_name(intent)
    original = {baseline['baseline']:100}
    canary = {baseline['baseline']:95,candidate:5}
    promoted = {candidate:100}
    traffic = release.traffic(guard(baseline))
    if rollback:
        if traffic != original:
            release.rollout({**intent,'operation':'rollback'},api)
        require(release.traffic(guard(baseline)) == original,'ROLLBACK_UNVERIFIED')
        return
    require(traffic in (original,canary,promoted),'UNEXPECTED_TRAFFIC')
    if traffic == original:
        release.rollout({**intent,'operation':'stage'},api)
        require(release.traffic(guard(baseline)) == original,'ZERO_TRAFFIC_STAGE_UNVERIFIED')
        if not (folder/'stage.json').exists():
            keep(folder,'stage.json',{'revision':candidate,'image':image,'traffic':original})
        release.rollout({**intent,'operation':'canary'},api)
        traffic = release.traffic(guard(baseline))
        require(traffic == canary,'CANARY_ALLOCATION_UNVERIFIED')
    if traffic == canary:
        release.rollout({**intent,'operation':'promote'},api)
    require(release.traffic(guard(baseline)) == promoted,'PROMOTION_UNVERIFIED')
    return candidate


def execute(main,folder):
    integrated(main)
    if not (folder/'rollback.json').exists():
        capture(folder)
    baseline = saved(folder,'rollback.json')
    require(baseline.get('source') == SOURCE and baseline.get('service') == SERVICE,'ROLLBACK_IDENTITY_INVALID')
    guard(baseline)
    proof = build_once(folder)
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
                and re.fullmatch('[0-9a-f]{64}', native.get('artifact_sha256', '')), 'NATIVE_EVIDENCE_UNVERIFIED')
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
    p.add_argument('protected_main')
    args = p.parse_args()
    os.umask(0o077)
    folder = Path(os.environ['JEMS_OPERATION_JOURNAL']).parent / ('native-broker-'+SOURCE)
    folder.mkdir(mode=0o700,exist_ok=True)
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
