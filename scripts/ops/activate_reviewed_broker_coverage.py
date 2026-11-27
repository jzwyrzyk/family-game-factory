"""Install one dated private-broker coverage tuple and verify protected GitHub readback."""
import argparse
from collections import Counter
from copy import deepcopy
from datetime import datetime, timezone
import fcntl
import json
import os
from pathlib import Path
import re
import sys
import time

import github_operations as github
import native_broker_execution as op
import native_settled_coverage as coverage
from admin_api import command, require, SetupError

MAIN = '7576543a68d92e78ab74884dbd34a78f84c46029'
RECEIPT = 'operation-a0ea27db0b2843de9c840166d4959028-coverage.json'
PREVIOUS = 'jems-request-evidence-r-cf49775a5f0876047146'
IMAGE = op.broker.publication.IMAGE+'@sha256:9b4ea06f03b0725182fa123898d8ab536dcabebe604affee88aaefe23e983143'
START = '2026-11-24T15:20:00Z'
END = '2026-11-24T16:20:00Z'
COUNTS = {'factory-gateway':31,'factory-preview':2,'factory-coach-private':2}
NATIVE_DIGEST = 'sha256:cb01648cc090948f68c1132b749db669b993deea68a94cd258b25865d87720ad'


PHASE = 'startup'


def phase(name):
    global PHASE
    PHASE = name


def stop_detail(exc):
    message = str(exc)
    if re.fullmatch('[A-Z][A-Z0-9_]{2,80}', message):
        return message
    http = re.search(r'(?:returned HTTP |failed \()([1-5][0-9]{2})\)?$', message)
    if http:
        return 'HTTP_' + http[1]
    if isinstance(exc, SetupError) and 'GitHub operation failed' in message:
        return 'GITHUB_API_FAILED'
    return type(exc).__name__


def verify_source(evidence, accepted):
    require(evidence.get('operator_source') == '377f58966e585eea4e21dec783b7593bd0070b85' and
            evidence.get('accepted') == accepted and accepted['image'] == IMAGE and accepted['serving_revision'] == PREVIOUS
            and accepted['native_run']=='46056038814' and accepted['artifact_sha256']==NATIVE_DIGEST
            and (evidence['start_utc'],evidence['end_utc'])==(START,END),'SOURCE_RECEIPT_DIFFERS')
    require(evidence['routing_checks']=={'bucket_active':True,'retention_days':30,'restricted_fields_present':False,
            'view_filter_matches':True,'sink_targets_bucket':True,'active_sink_exclusions':0,'ancestor_intercepts':0}
            and evidence['routing']['ancestors']==[] and evidence['routing_history']=={
                'projects/'+op.broker.PROJECT:2,'sink_errors_in_interval':0}
            and coverage.sink_includes_requests(evidence['routing']['default_sink'])=='ONLY_OTHER_LOGS_EXCLUDED',
            'ROUTING_RECEIPT_DIFFERS')
    for service,total in COUNTS.items():
        row = evidence['services'][service]
        detail = evidence['counts_by_revision_status'][service]
        require(row['comparison']=='MATCH' and row['independent_requests']==row['view_entries']==total and
                0<=row['max_ingestion_seconds']<=3 and sum(r['metric'] for r in detail)==total and
                all(r['metric']==r['logs'] for r in detail),'REQUEST_COUNT_RECEIPT_DIFFERS')


def revision(name, image, fingerprint):
    path = op.BASE+'/revisions/'+name
    value = op.api('GET',path)
    require(value['name']==path and op.release.ready(value) and op.release.image(value)==image
            and op.release.fingerprint(value)==fingerprint,'REVISION_UNVERIFIED')


def read_run(folder, service, histogram):
    inputs = {'service':service,'revision':'','start_utc':START,'end_utc':END}
    scope = github.validate_inputs(inputs)
    op.keep(folder, service+'-intent.json', {'main':MAIN,'scope':scope})
    dispatch = github.api('POST',github.PREFIX+'actions/workflows/'+github.WORKFLOW+'/dispatches',
                          {'ref':'main','return_run_details':True,'inputs':inputs})
    run_id = str(dispatch['workflow_run_id'])
    require(re.fullmatch('[1-9][0-9]{0,19}',run_id),'RUN_ID_UNVERIFIED')
    op.keep(folder,service+'-run.json',{'id':run_id})
    for _ in range(90):
        if github.api('GET',github.PREFIX+'actions/runs/'+run_id).get('status')=='completed':
            break
        time.sleep(5)
    else:
        raise SetupError('DIAGNOSTICS_RUN_PENDING')
    report, receipt = github.read_attempt(run_id, MAIN, github.ACCEPTANCE_STEPS, github.api)
    require(receipt['attempt']=='1' and receipt['workflow_conclusion']=='success' and receipt['job_verified']
            and report['scope']==scope and report['coverage']=={'start_utc':START,'end_utc':END}
            and github.triage(report)['status']=='COMPLETE' and report['counts']['total']==COUNTS[service],
            'NATIVE_COVERAGE_UNVERIFIED')
    got = Counter((r['revision'],str(r['status'])) for r in report['requests'])
    expected = {(r['revision'],r['status']):r['metric'] for r in histogram if r['metric']}
    require(got==expected,'NATIVE_HISTOGRAM_DIFFERS')
    op.keep(folder,service+'-verified.json',receipt)
    return run_id


def reviewed_events(log, now):
    project = 'projects/'+op.broker.PROJECT
    clause = (f'logName="{project}/logs/cloudaudit.googleapis.com%2Factivity" AND timestamp>="{START}" '
              f'AND timestamp<="{coverage.utc(now)}" AND protoPayload.serviceName="logging.googleapis.com" AND '
              'protoPayload.methodName=~"(Create|Update|Delete|Undelete)(Sink|Bucket|View|Exclusion)"')
    failed = '2026-11-26T15:37:05.390435979Z'
    succeeded = '2026-11-26T17:20:23.557065071Z'
    # protoPayload is a protobuf Any. Filter its AuditLog fields in the query,
    # then request only the typed top-level timestamp in the REST partial response.
    clause += (f' AND protoPayload.methodName="google.logging.v2.ConfigServiceV2.CreateView"'
               f' AND protoPayload.resourceName="{op.broker.VIEW}" AND '
               f'((timestamp="{failed}" AND protoPayload.status.code=3) OR '
               f'(timestamp="{succeeded}" AND (NOT protoPayload.status.code:* OR protoPayload.status.code=0)))')
    response = log.call('POST','v2/entries:list?fields=nextPageToken,entries(timestamp)',
                        {'resourceNames':[project], 'filter':clause, 'pageSize':20})
    require(not response.get('nextPageToken') and sorted(row['timestamp'] for row in response.get('entries',[]))
            == [failed,succeeded], 'ROUTING_HISTORY_CHANGED')


def read_service(baseline):
    current = op.guard(baseline)
    require(current['scaling']['maxInstanceCount']==1 and current.get('etag'), 'SERVICE_CONFIGURATION_CHANGED')
    return current


def target(name):
    return [op.release.traffic_target(name,100)]


def switch(baseline, origin, destination, candidate, config):
    current = read_service(baseline)
    require(op.release.traffic(current)=={origin:100} and current['latestCreatedRevision']==op.BASE+'/revisions/'+candidate
            and op.release.image(current['template'])==IMAGE and op.release.fingerprint(current['template'])==config,
            'SERVING_REVISION_CHANGED')
    op.api('PATCH',op.BASE+'?updateMask=traffic',{'traffic':target(destination),'etag':current['etag']})
    require(op.release.traffic(read_service(baseline))=={destination:100},'TRAFFIC_UNVERIFIED')


def run(folder, source):
    from datetime import timedelta
    phase('protected-main')
    op.integrated(MAIN)
    accepted = op.saved(folder,'accepted.json')
    evidence = op.saved(folder,RECEIPT)
    phase('private-source-receipt')
    verify_source(evidence,accepted)
    baseline = op.saved(folder,'rollback.json')
    lane = folder/'dated-coverage-nov24-1520'
    lane.mkdir(mode=0o700,exist_ok=True)
    now = datetime.now(timezone.utc).replace(microsecond=0)
    phase('broker-service-and-policy')
    current = read_service(baseline)
    if (lane/'complete.json').exists():
        receipt = op.saved(lane,'complete.json')
        require(op.release.traffic(current)=={receipt['serving_revision']:100} and
                coverage.instant(receipt['expires_utc'])>now,'ACCEPTED_STATE_CHANGED_OR_EXPIRED')
        return receipt
    require(not (lane/'stage-intent.json').exists(),'STAGE_ALREADY_ATTEMPTED_RECONCILE_RECEIPTS')
    require(op.release.traffic(current)=={PREVIOUS:100} and current['latestCreatedRevision']==op.BASE+'/revisions/'+PREVIOUS
            and op.release.image(current['template'])==IMAGE and
            op.release.fingerprint(current['template'])==baseline['configuration'],'ACCEPTED_BROKER_CHANGED')
    phase('accepted-revision')
    revision(PREVIOUS,IMAGE,baseline['configuration'])
    token = command(['gcloud','auth','print-access-token','--quiet'])
    log = coverage.Http('https://logging.googleapis.com',token,{'x-goog-user-project':op.broker.PROJECT})
    phase('dated-view-events')
    reviewed_events(log,now)
    phase('independent-source-readback')
    live = coverage.collect(token,now,interval=(coverage.instant(START),coverage.instant(END)))
    require(live['routing_checks']==evidence['routing_checks'] and live['routing']==evidence['routing']
            and live['counts_by_revision_status']==evidence['counts_by_revision_status'] and
            live['services']==evidence['services'],'COVERAGE_SOURCE_CHANGED')
    phase('routing-history-readback')
    require(coverage.routing_history(log,live,now)==evidence['routing_history'],'ROUTING_HISTORY_CHANGED')
    expiry = min(now+timedelta(days=7),coverage.instant(START)+timedelta(days=30))
    require(expiry > now+timedelta(hours=1),'RETENTION_EXPIRES_TOO_SOON')
    dates = {'JEMS_COVERAGE_START_UTC':START,'JEMS_COVERAGE_END_UTC':END,
             'JEMS_VERIFIED_AT_UTC':coverage.utc(now),'JEMS_VERIFIED_UNTIL_UTC':coverage.utc(expiry)}
    template = deepcopy(current['template'])
    env = template['containers'][0]['env']
    require(env==[{'name':'JEMS_LOG_BUCKET_LOCATION','value':'global'}],'BROKER_ENVIRONMENT_CHANGED')
    env.extend({'name':k,'value':v} for k,v in dates.items())
    candidate = op.SERVICE+'-c-'+op.review.digest(dates)[:20]
    template['revision'] = candidate
    config = op.release.fingerprint(template)
    phase('record-stage-intent')
    op.keep(lane,'stage-intent.json',{'source':source,'native':accepted,'dates':dates,'coverage_receipt':RECEIPT,
                                      'candidate':candidate,'fingerprint':config,'rollback':PREVIOUS})
    try:
        phase('stage-dated-revision')
        stage = op.release.cloud_api(token)
        stage('PATCH',op.BASE+'?updateMask=template,traffic',
              {'etag':current['etag'],'template':template,'traffic':target(PREVIOUS)})
        phase('verify-staged-revision')
        staged = read_service(baseline)
        require(op.release.traffic(staged)=={PREVIOUS:100} and
                staged['latestCreatedRevision']==op.BASE+'/revisions/'+candidate and
                op.release.fingerprint(staged['template'])==config,'STAGE_UNVERIFIED')
        revision(candidate,IMAGE,config)
        phase('select-single-target')
        switch(baseline,PREVIOUS,candidate,candidate,config)
        runs = {}
        for service in COUNTS:
            phase('github-readback-' + service)
            runs[service] = read_run(lane,service,evidence['counts_by_revision_status'][service])
        op.integrated(MAIN)
        require(op.release.traffic(read_service(baseline))=={candidate:100},'SERVING_REVISION_CHANGED')
        revision(candidate,IMAGE,config)
        receipt = {'status':'DATED_BROKER_COVERAGE_ACCEPTED','start_utc':START,'end_utc':END,
                   'expires_utc':coverage.utc(expiry),'serving_revision':candidate,'rollback_revision':PREVIOUS,
                   'original_rollback_revision':op.ROLLBACK_REVISION,'image':IMAGE,'runs':runs,'counts':COUNTS}
        op.keep(lane,'complete.json',receipt)
        return receipt
    except (Exception,KeyboardInterrupt):
        after = read_service(baseline)
        if op.release.traffic(after)=={candidate:100}:
            require(after['latestCreatedRevision']==op.BASE+'/revisions/'+candidate and
                    op.release.fingerprint(after['template'])==config,'ROLLBACK_PRECONDITION_CHANGED')
            revision(PREVIOUS,IMAGE,baseline['configuration'])
            switch(baseline,candidate,PREVIOUS,candidate,config)
        require(op.release.traffic(read_service(baseline))=={PREVIOUS:100},'ROLLBACK_UNVERIFIED')
        print(json.dumps({'rollback':'ACCEPTED_NATIVE_BROKER_VERIFIED','revision':PREVIOUS}),flush=True)
        raise


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-sha', required=True)
    parser.add_argument('--install-reviewed-hour', action='store_true', required=True)
    args=parser.parse_args()
    os.umask(0o077)
    try:
        folder=Path(os.environ['JEMS_OPERATION_JOURNAL']).parent/('native-broker-'+op.SOURCE)
        with (folder/'operator.lock').open('a') as lock:
            fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
            print(json.dumps(run(folder,args.source_sha)),flush=True)
    except (Exception,KeyboardInterrupt) as exc:
        print(json.dumps({'status':'ATTESTATION_STOPPED','phase':PHASE,'code':stop_detail(exc),'automatic_retry':False}),flush=True)
        sys.exit(2)
