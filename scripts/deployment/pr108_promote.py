#!/usr/bin/env python3
"""PR108 only: conditionally move coach, then gateway, to verified staged images.

Imports the same pinned pr108_stage.py. Keeps staging journals unchanged and
uses separate private promotion receipts. No image/config/IAM/secret writes,
new tags, provider calls, preview changes, or Pages dispatch. Attempted traffic
updates are never replayed; recovery observes actual state using reads.
"""
import argparse
import copy
import json
from pathlib import Path
import sys
import time
import urllib.request

import pr108_stage as stage

ORDER = ('factory-coach-private','factory-gateway')
GATEWAY_HEALTH = 'https://factory-gateway-ola734esta-ul.a.run.app/health'
require = stage.require

def stage_identity(journal):
    return stage.digest({key:journal[key] for key in
        ('sourceSha','service','target','baselineService','baselineRevision','request','iamHash')})

def promotion_traffic(journal):
    """Keep each tagged URL on its original revision; move canonical traffic."""
    old = journal['request']['spec']['traffic']
    tags = [dict(revisionName=item['revisionName'],percent=0,tag=item['tag'])
            for item in old if item.get('tag')]
    require(len({item['tag'] for item in tags})==len(tags), 'DUPLICATE_TRAFFIC_TAG')
    return stage.canonical_traffic([
        {'revisionName':journal['target']['candidate'],'percent':100}, *tags])

def with_traffic(journal, traffic):
    result = copy.deepcopy(journal)
    result['request']['spec']['traffic'] = copy.deepcopy(traffic)
    return result

def settled(service):
    generation = service.get('metadata',{}).get('generation')
    status = service.get('status',{})
    return (type(generation) is int and generation>0
            and generation==status.get('observedGeneration') and stage.ready(service)
            and not any(item.get('status')=='Unknown' for item in status.get('conditions',[])))

def make_promotion_service(current, journal):
    metadata = current['metadata']
    require(bool(metadata.get('resourceVersion')), 'CAS_VERSION_MISSING')
    result = {'apiVersion':'serving.knative.dev/v1','kind':'Service',
              'metadata':{'name':metadata['name'],'namespace':metadata['namespace'],
                          'resourceVersion':metadata['resourceVersion'],
                          'labels':copy.deepcopy(metadata.get('labels',{})),
                          'annotations':stage.clean_annotations(metadata)},
              'spec':copy.deepcopy(current['spec'])}
    result['spec']['traffic'] = promotion_traffic(journal)
    return result

def verify_promoted(current, candidate, journal):
    planned = with_traffic(journal,promotion_traffic(journal))
    return stage.verify_candidate(current,candidate,planned) and settled(current)

def verify_promotion_shape(proposed, journal):
    stage.verify_planned_shape(proposed,with_traffic(journal,promotion_traffic(journal)))

def read_facts(cloud, journal):
    service, target = journal['service'], journal['target']
    current = cloud.request('services',service)
    baseline = cloud.request('revisions',target['baseline'])
    stage.validate_baseline(journal['baselineService'],baseline,target)
    require(stage.template_from_revision(baseline,target['image'],target['candidate'])
            ==journal['request']['spec']['template'], 'SAVED_SERVING_METADATA_CHANGED')
    require(stage.digest(cloud.iam(service))==journal['iamHash'], 'IAM_CHANGED')
    candidate = cloud.request('revisions',target['candidate'])
    return current, candidate

def load_promotion(path, service, journal):
    require(not path.is_symlink() and (path.stat().st_mode & 0o077)==0,
            'PROMOTION_JOURNAL_PERMISSIONS_INVALID')
    try: value = json.loads(path.read_text())
    except (OSError,ValueError): raise stage.StageError('PROMOTION_JOURNAL_UNREADABLE') from None
    require(value.get('sourceSha')==stage.SOURCE_SHA and value.get('service')==service
            and value.get('stageIdentity')==stage_identity(journal), 'PROMOTION_JOURNAL_IDENTITY_MISMATCH')
    require(value.get('request')==make_promotion_service(value['beforeService'],journal),
            'PROMOTION_JOURNAL_REQUEST_MISMATCH')
    require(stage.service_envelope(value['beforeService'])==stage.service_envelope(journal['baselineService']),
            'PROMOTION_JOURNAL_POLICY_MISMATCH')
    require(stage.desired_traffic(value['beforeService'])==stage.canonical_traffic(journal['request']['spec']['traffic'])
            and stage.canonical_traffic(stage.pinned_traffic(value['beforeService']))
            ==stage.canonical_traffic(journal['request']['spec']['traffic']), 'PROMOTION_JOURNAL_BASELINE_MISMATCH')
    stage.verify_planned_shape(value['beforeService'],journal)
    return value

def receipt(service, status):
    target = stage.TARGETS[service]
    return {'service':service,'status':status,'sourceSha':stage.SOURCE_SHA,
            'candidateRevision':target['candidate'],'candidateImage':target['image']}

def progress(message):
    print('PR108: '+message,file=sys.stderr,flush=True)

def fixed_configuration(current, candidate, journal, traffic):
    """Validate configuration independently while traffic may be reconciling."""
    stage.verify_planned_shape(current,with_traffic(journal,traffic))
    target = journal['target']
    require(candidate.get('metadata',{}).get('name')==target['candidate'], 'CANDIDATE_NAME_MISMATCH')
    require(candidate.get('spec',{}).get('containers',[{}])[0].get('image')==target['image'],
            'CANDIDATE_DECLARED_IMAGE_CHANGED')
    # Activating a retired revision may temporarily make Ready Unknown. Keep
    # verifying its immutable configuration while final active checks poll.
    require(not any(row.get('type')=='Ready' and row.get('status')=='False'
                    for row in candidate.get('status',{}).get('conditions',[])), 'CANDIDATE_FAILED')
    require(stage.image_digest(candidate)==target['image'].split('@sha256:')[1],
            'CANDIDATE_IMAGE_MISMATCH')
    require(stage.template_from_revision(candidate,target['image'],target['candidate'])
            ==journal['request']['spec']['template'], 'CANDIDATE_CONFIGURATION_CHANGED')

def check_prepared(cloud, context, validate_only=True):
    journal, promotion = context['stage'], context['promotion']
    current, candidate = read_facts(cloud,journal)
    require(stage.staged_candidate_status(current,candidate,journal) is not None and settled(current),
            'STAGED_CANDIDATE_NOT_SETTLED')
    require(current['metadata'].get('resourceVersion')==promotion['beforeService']['metadata'].get('resourceVersion'),
            'CONCURRENT_SERVICE_CHANGE')
    require(make_promotion_service(current,journal)==promotion['request'], 'PREPARED_PROMOTION_CHANGED')
    if validate_only:
        proposed = cloud.request('services',journal['service'],promotion['request'],dry_run=True)
        verify_promotion_shape(proposed,journal)
        # A validation receipt never authorizes a fresh resourceVersion.
        check_prepared(cloud,context,validate_only=False)
    return receipt(journal['service'],'PREPARED_NO_TRAFFIC_CHANGE')

def prepare(cloud, directory, service):
    progress('Checking staged '+service+'.')
    source_path = directory/(service+'.json')
    require(source_path.exists(), 'STAGING_JOURNAL_MISSING')
    journal = stage.load_journal(source_path,service)
    require(journal.get('phase') in ('verified','configuration_verified'), 'STAGING_JOURNAL_NOT_VERIFIED')
    path = directory/(service+'.promotion.json')
    if path.exists():
        promotion = load_promotion(path,service,journal)
    else:
        current, candidate = read_facts(cloud,journal)
        require(stage.staged_candidate_status(current,candidate,journal) is not None and settled(current),
                'STAGED_CANDIDATE_NOT_SETTLED')
        promotion = {'sourceSha':stage.SOURCE_SHA,'service':service,'stageIdentity':stage_identity(journal),
                     'beforeService':current,'request':make_promotion_service(current,journal),'phase':'prepared'}
        stage.save_journal(path,promotion)
    return {'stage':journal,'promotion':promotion,'path':path}

def observe(cloud, context):
    journal, promotion = context['stage'], context['promotion']
    current, candidate = read_facts(cloud,journal)
    old = stage.canonical_traffic(journal['request']['spec']['traffic'])
    new = promotion_traffic(journal)
    desired = stage.desired_traffic(current)
    observed = stage.canonical_traffic(stage.pinned_traffic(current))
    require(desired in (old,new) and observed in (old,new), 'UNEXPECTED_TRAFFIC_TRANSITION')
    fixed_configuration(current,candidate,journal,desired)
    if desired==new and observed==new:
        return verify_promoted(current,candidate,journal)
    require(promotion['phase']!='verified', 'VERIFIED_PROMOTION_NO_LONGER_CURRENT')
    # A completed switch cannot still desire the old route. Returning to old
    # intent after new traffic is observed would be a concurrent rollback.
    require(not (desired==old and observed==new), 'CONCURRENT_TRAFFIC_ROLLBACK')
    if current['metadata'].get('resourceVersion')==promotion['beforeService']['metadata'].get('resourceVersion'):
        require(current.get('spec')==promotion['beforeService'].get('spec'), 'BASELINE_CHANGED_WITHOUT_VERSION')
    return False

def wait_for_promotion(cloud, context, wait_seconds):
    service = context['stage']['service']
    deadline, notice = time.monotonic()+wait_seconds, time.monotonic()+30
    while True:
        if observe(cloud,context):
            context['promotion']['phase'] = 'verified'
            stage.save_journal(context['path'],context['promotion'])
            progress(service+' now serves the verified candidate at 100%.')
            return receipt(service,'PROMOTED_VERIFIED')
        if time.monotonic()>=deadline:
            return receipt(service,'PENDING_OR_UNCERTAIN_READ_ONLY_RECOVERY')
        if time.monotonic()>=notice:
            progress('Waiting for '+service+' traffic; checking by reads only.')
            notice = time.monotonic()+30
        time.sleep(5)

def inspect(cloud, context, wait_seconds=0):
    phase = context['promotion'].get('phase')
    if phase=='prepared': return check_prepared(cloud,context)
    require(phase in ('attempted','uncertain','verified','rejected'), 'UNKNOWN_PROMOTION_PHASE')
    if phase=='rejected':
        observe(cloud,context)
        return receipt(context['stage']['service'],'REJECTED_READ_ONLY_INSPECTION_NO_RETRY')
    return wait_for_promotion(cloud,context,wait_seconds)

def promote(cloud, context, execute=False, wait_seconds=600):
    promotion, journal = context['promotion'], context['stage']
    service = journal['service']
    if promotion.get('phase')!='prepared': return inspect(cloud,context,wait_seconds)
    if not execute: return check_prepared(cloud,context)
    check_prepared(cloud,context,validate_only=False)
    promotion['phase'] = 'attempted'
    stage.save_journal(context['path'],promotion)
    progress('Switching '+service+' to its verified candidate; no configuration changes.')
    try:
        cloud.request('services',service,promotion['request'])
    except stage.CloudError as error:
        promotion['phase'] = 'uncertain' if error.uncertain else 'rejected'
        promotion['errorCode'] = str(error)
        stage.save_journal(context['path'],promotion)
        raise stage.StageError('PROMOTION_'+promotion['phase'].upper()+'_'+str(error)+
            '; rerun without --execute to inspect. No traffic PUT will repeat.') from None
    return wait_for_promotion(cloud,context,wait_seconds)

def gateway_health():
    progress('Checking canonical gateway health.')
    try:
        request = urllib.request.Request(GATEWAY_HEALTH,headers={'Cache-Control':'no-cache'})
        with urllib.request.build_opener(stage.NoRedirect).open(request,timeout=20) as response:
            require(response.status==200, 'GATEWAY_HEALTH_HTTP_FAILURE')
            value = json.loads(response.read(4096))
    except stage.StageError: raise
    except Exception: raise stage.StageError('GATEWAY_HEALTH_READ_FAILED') from None
    require(isinstance(value,dict) and value.get('ready') is True and value.get('paidExecution') is True,
            'GATEWAY_HEALTH_OR_APPROVED_ACTIVE_STATE_CHANGED')
    return {'url':GATEWAY_HEALTH,'ready':True,'paidExecution':True}

def run(cloud, directory, execute=False, wait_seconds=600, health=gateway_health):
    # Prepare and API-validate BOTH service transitions before the first PUT.
    contexts = [prepare(cloud,directory,service) for service in ORDER]
    for context in contexts:
        outcome = inspect(cloud,context,wait_seconds if context['promotion']['phase']!='prepared' else 0)
        require(outcome['status'] in ('PREPARED_NO_TRAFFIC_CHANGE','PROMOTED_VERIFIED'),
                'PRIOR_PROMOTION_UNRESOLVED_NO_NEW_WRITES')
    for index, context in enumerate(contexts):
        # Recheck the already-promoted coach immediately before the gateway
        # write; cross-service updates cannot share one Cloud Run CAS token.
        for previous in contexts[:index]:
            require(observe(cloud,previous), 'PREVIOUS_PROMOTION_NO_LONGER_VERIFIED')
        outcome = promote(cloud,context,execute,wait_seconds)
        print(json.dumps(outcome),flush=True)
        if outcome['status']!='PROMOTED_VERIFIED':
            return 3 if outcome['status']=='PREPARED_NO_TRAFFIC_CHANGE' else 2
    # Recheck both after the second switch; a prior success receipt is not a
    # substitute for the current service/template/IAM/traffic state.
    for context in contexts:
        require(observe(cloud,context), 'FINAL_PROMOTION_VERIFICATION_PENDING')
    health_receipt = health()
    print(json.dumps({'status':'PROMOTED_VERIFIED','sourceSha':stage.SOURCE_SHA,
                      'services':list(ORDER),'gatewayHealth':health_receipt,'pagesDispatched':False}),flush=True)
    print('BACKENDS_STATUS=PROMOTED_VERIFIED',flush=True)
    return 0

def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--state-dir',required=True,help='Existing private pr108_stage journal directory')
    parser.add_argument('--execute',action='store_true',help='Switch the two prepared exact revisions once')
    parser.add_argument('--wait-seconds',type=int,default=600)
    args = parser.parse_args(argv)
    require(0<=args.wait_seconds<=900, 'INVALID_WAIT_BOUND')
    directory = Path(args.state_dir).absolute()
    require(directory.is_dir() and not directory.is_symlink() and (directory.stat().st_mode & 0o077)==0,
            'PRIVATE_STAGING_DIRECTORY_REQUIRED')
    return run(stage.Cloud(),directory,args.execute,args.wait_seconds)

if __name__=='__main__':
    try: sys.exit(main())
    except stage.StageError as error:
        print('PR108_PROMOTION_STOPPED: '+str(error),file=sys.stderr)
        sys.exit(2)
    except Exception:
        print('PR108_PROMOTION_STOPPED: local/transport failure; inspect without --execute. No automatic retry.',file=sys.stderr)
        sys.exit(2)
