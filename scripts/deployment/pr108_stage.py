#!/usr/bin/env python3
"""PR108 only: stage two immutable images from the actual serving revisions.

Preserves the serving configuration; no promotion, IAM/secret writes,
activation changes, paid inference, or preview deployment.
Raw service metadata stays in memory or the private local recovery journal.
An attempted PUT is never automatically repeated, including after interruption.
"""
import argparse
import copy
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

PROJECT = 'family-game-factory-jzw'
PROJECT_NUMBER = '1054529152893'
REGION = 'us-east5'
SOURCE_SHA = 'c43a18148421ea22edfba5f7e891530678ad4f4f'
PREFIX = f'{REGION}-docker.pkg.dev/{PROJECT}/factory-services/'
API = f'https://{REGION}-run.googleapis.com/apis/serving.knative.dev/v1/namespaces/{PROJECT}'
TARGETS = {
 'factory-coach-private': {
  'baseline':'factory-coach-private-00002-48r',
  'latestCreated':'factory-coach-private-00003-dqb',
  'latestReady':'factory-coach-private-00002-48r',
  'oldDigest':'99fe827da073d131470dcbe2a9c5c272fb0873289dc17531353f6a24314de278',
  'specHash':'9a27254597c5c8680fd8e66645c1961a3ae1d76f67baf252aac3e975bd032cad',
  'image':PREFIX+'coach@sha256:52e0bd8c0565e3ccf85ce6e111909d2cdc9446bfce159b7d62c92db1c24a8f54',
  'candidate':'factory-coach-private-pr108-c43a18148421',
 },
 'factory-gateway': {
  'baseline':'factory-gateway-workerpin-dddf53db-mwq1mbz7-e99f',
  'latestCreated':'factory-gateway-workerpin-dddf53db-mwq1mbz7-e99f',
  'latestReady':'factory-gateway-workerpin-dddf53db-mwq1mbz7-e99f',
  'oldDigest':'2d877b6fe6fe35da9ac297f5b18de7d3045a7b9168477d92c61a45fb1cc19c54',
  'specHash':'21b1b2fdda8991701ae16c3b547a20d1d5fa2b094316951d712a309073b14e24',
  'image':PREFIX+'gateway@sha256:4148837305a722895e0ee59f56e2337c0db845542f96d4f36aa6cd2b496bf521',
  'candidate':'factory-gateway-pr108-c43a18148421',
 },
}

# Only output/provenance metadata is removed. Arbitrary custom annotations and
# every deployment annotation (including VPC and secret aliases) are retained.
READ_ONLY_ANNOTATIONS = {
 'serving.knative.dev/creator', 'serving.knative.dev/lastModifier',
 'run.googleapis.com/operation-id', 'run.googleapis.com/ingress-status',
 'run.googleapis.com/urls', 'run.googleapis.com/startupProbeType',
}
SYSTEM_LABEL_PREFIXES = ('serving.knative.dev/', 'cloud.googleapis.com/')
READ_ONLY_LABELS = {'run.googleapis.com/satisfiesPzs', 'client.knative.dev/nonce'}

class StageError(Exception):
    pass

class CloudError(StageError):
    def __init__(self, code, uncertain=False):
        super().__init__(code)
        self.uncertain = uncertain

def require(condition, code):
    if not condition:
        raise StageError(code)

def digest(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':')).encode()).hexdigest()

def spec_without_image(revision):
    spec = copy.deepcopy(revision.get('spec',{}))
    for container in spec.get('containers',[]):
        container.pop('image',None)
    return spec

def pinned_active_secrets(revision):
    spec = revision.get('spec',{})
    mounted = set()
    def version(value):
        require(isinstance(value,str) and re.fullmatch(r'[1-9][0-9]*',value),
                'ACTIVE_SECRET_VERSION_NOT_PINNED')
    for container in spec.get('containers',[]):
        for entry in container.get('env',[]):
            reference = entry.get('valueFrom',{}).get('secretKeyRef')
            if reference is not None: version(reference.get('key'))
        mounted.update(item.get('name') for item in container.get('volumeMounts',[]))
    for volume in spec.get('volumes',[]):
        if volume.get('name') not in mounted or 'secret' not in volume: continue
        items = volume['secret'].get('items',[])
        require(bool(items), 'ACTIVE_SECRET_VERSION_NOT_PINNED')
        for item in items: version(item.get('key'))

def clean_annotations(metadata):
    values = metadata.get('annotations',{})
    require(isinstance(values,dict), 'INVALID_ANNOTATIONS')
    return {key:value for key,value in values.items() if key not in READ_ONLY_ANNOTATIONS}

def clean_labels(metadata):
    values = metadata.get('labels',{})
    require(isinstance(values,dict), 'INVALID_LABELS')
    return {key:value for key,value in values.items()
            if key not in READ_ONLY_LABELS and not key.startswith(SYSTEM_LABEL_PREFIXES)}

def template_from_revision(revision, image, candidate):
    metadata = revision.get('metadata',{})
    spec = copy.deepcopy(revision.get('spec',{}))
    require(len(spec.get('containers',[]))==1, 'UNEXPECTED_CONTAINER_LAYOUT')
    spec['containers'][0]['image'] = image
    return {'metadata':{'name':candidate,'labels':clean_labels(metadata),
                        'annotations':clean_annotations(metadata)}, 'spec':spec}

def pinned_traffic(service):
    observed = service.get('status',{}).get('traffic',[])
    require(isinstance(observed,list) and observed, 'UNRESOLVED_TRAFFIC')
    result = []
    for item in observed:
        name = item.get('revisionName')
        percent = item.get('percent') or 0
        if not percent and not item.get('tag'):
            continue
        require(isinstance(name,str) and name.startswith(service['metadata']['name']+'-')
                and type(percent) is int and 0<=percent<=100, 'UNRESOLVED_TRAFFIC')
        entry = {'revisionName':name,'percent':percent}
        if item.get('tag'):
            require(isinstance(item['tag'],str), 'INVALID_TRAFFIC_TAG')
            entry['tag'] = item['tag']
        result.append(entry)
    require(sum(item['percent'] for item in result)==100, 'UNRESOLVED_TRAFFIC')
    desired_tags = {item['tag'] for item in service.get('spec',{}).get('traffic',[]) if item.get('tag')}
    require(desired_tags=={item['tag'] for item in result if item.get('tag')}, 'UNRESOLVED_TRAFFIC_TAGS')
    return result

def desired_traffic(service):
    result = []
    for item in service.get('spec',{}).get('traffic',[]):
        percent = item.get('percent') or 0
        if not percent and not item.get('tag'):
            continue
        require(not item.get('latestRevision') and isinstance(item.get('revisionName'),str),
                'UNPINNED_DESIRED_TRAFFIC')
        entry = {'revisionName':item['revisionName'],'percent':percent}
        if item.get('tag'): entry['tag'] = item['tag']
        result.append(entry)
    return canonical_traffic(result)

def serving_traffic(service):
    return [item for item in pinned_traffic(service) if item['percent']>0]

def ready(revision):
    return any(item.get('type')=='Ready' and item.get('status')=='True'
               for item in revision.get('status',{}).get('conditions',[]))

def image_digest(revision):
    value = revision.get('status',{}).get('imageDigest','')
    match = re.search(r'(?:^|@)sha256:([a-f0-9]{64})$',value)
    require(match is not None, 'UNRESOLVED_IMAGE_DIGEST')
    return match.group(1)

def validate_baseline(service, revision, target):
    service_name = target['candidate'].split('-pr108-',1)[0]
    require(service.get('metadata',{}).get('name')==service_name
            and service.get('metadata',{}).get('namespace') in (PROJECT,PROJECT_NUMBER), 'SERVICE_IDENTITY_MISMATCH')
    require(revision.get('metadata',{}).get('name')==target['baseline'], 'BASELINE_REVISION_CHANGED')
    label = revision.get('metadata',{}).get('labels',{}).get('serving.knative.dev/service')
    require(label in (None,service_name), 'REVISION_SERVICE_MISMATCH')
    actual = serving_traffic(service)
    require(len(actual)==1 and actual[0]['revisionName']==target['baseline'] and actual[0]['percent']==100,
            'SERVING_TRAFFIC_CHANGED')
    status = service.get('status',{})
    require(status.get('latestCreatedRevisionName')==target['latestCreated']
            and status.get('latestReadyRevisionName')==target['latestReady'], 'LATEST_REVISION_CHANGED')
    require(ready(revision) and image_digest(revision)==target['oldDigest'], 'SERVING_IMAGE_OR_READINESS_CHANGED')
    containers = revision.get('spec',{}).get('containers',[])
    require(len(containers)==1 and containers[0].get('image','').endswith('@sha256:'+target['oldDigest']),
            'SERVING_DECLARED_IMAGE_CHANGED')
    require(digest(spec_without_image(revision))==target['specHash'], 'SERVING_CONFIGURATION_CHANGED')
    pinned_active_secrets(revision)
    require(bool(service.get('metadata',{}).get('resourceVersion')), 'CAS_VERSION_MISSING')
    generation = service.get('metadata',{}).get('generation')
    require(type(generation) is int and generation>0 and generation==status.get('observedGeneration')
            and not any(c.get('status')=='Unknown' for c in status.get('conditions',[])),
            'SERVICE_STILL_RECONCILING')
    # Resolve each declared latest/tag target through its observed entry before
    # pinning. A pending tag/traffic change is not a stable baseline.
    observed = pinned_traffic(service)
    for item in service.get('spec',{}).get('traffic',[]):
        if not item.get('percent') and not item.get('tag'): continue
        matches = [row for row in observed if row.get('tag')==item.get('tag') and
                   row['revisionName']==(status.get('latestReadyRevisionName') if item.get('latestRevision') else item.get('revisionName'))]
        require(len(matches)==1 and matches[0]['percent']==(item.get('percent') or 0), 'TRAFFIC_STILL_RECONCILING')

def make_stage_service(service, revision, target):
    metadata = service['metadata']
    body = {'apiVersion':'serving.knative.dev/v1','kind':'Service',
            'metadata':{'name':metadata['name'],'namespace':metadata['namespace'],
                        'resourceVersion':metadata['resourceVersion'],
                        'labels':copy.deepcopy(metadata.get('labels',{})),
                        'annotations':clean_annotations(metadata)},
            'spec':copy.deepcopy(service.get('spec',{}))}
    body['spec']['template'] = template_from_revision(revision,target['image'],target['candidate'])
    body['spec']['traffic'] = pinned_traffic(service)
    return body

def canonical_traffic(traffic):
    return sorted(traffic,key=lambda item:(item.get('tag',''),item['revisionName'],item['percent']))

def service_envelope(service):
    metadata = service.get('metadata',{})
    spec = copy.deepcopy(service.get('spec',{}))
    spec.pop('template',None)
    spec.pop('traffic',None)
    return {'name':metadata.get('name'),'namespace':metadata.get('namespace'),
            'labels':metadata.get('labels',{}),'annotations':clean_annotations(metadata),'spec':spec}

def verify_candidate(service, candidate, journal):
    target = journal['target']
    require(service_envelope(service)==service_envelope(journal['baselineService']), 'SERVICE_POLICY_CHANGED')
    require(canonical_traffic(pinned_traffic(service))==canonical_traffic(journal['request']['spec']['traffic']),
            'SERVING_TRAFFIC_CHANGED')
    require(desired_traffic(service)==canonical_traffic(journal['request']['spec']['traffic']),
            'DESIRED_TRAFFIC_CHANGED')
    require(candidate.get('metadata',{}).get('name')==target['candidate'], 'CANDIDATE_NAME_MISMATCH')
    template = service.get('spec',{}).get('template',{})
    require(template.get('metadata',{}).get('name')==target['candidate'], 'LATEST_TEMPLATE_CHANGED')
    require(template.get('spec',{}).get('containers',[{}])[0].get('image')==target['image'],
            'LATEST_IMAGE_CHANGED')
    require(candidate.get('spec',{}).get('containers',[{}])[0].get('image')==target['image'],
            'CANDIDATE_DECLARED_IMAGE_CHANGED')
    if not ready(candidate):
        require(not any(c.get('type')=='Ready' and c.get('status')=='False'
                        for c in candidate.get('status',{}).get('conditions',[])), 'CANDIDATE_FAILED')
        return False
    require(image_digest(candidate)==target['image'].split('@sha256:')[1], 'CANDIDATE_IMAGE_MISMATCH')
    expected = journal['request']['spec']['template']
    actual = template_from_revision(candidate,target['image'],target['candidate'])
    require(actual==expected, 'CANDIDATE_CONFIGURATION_MISMATCH')
    require(template_from_revision(template,target['image'],target['candidate'])==expected, 'LATEST_TEMPLATE_CHANGED')
    return (service.get('metadata',{}).get('generation')==service.get('status',{}).get('observedGeneration')
            and service.get('status',{}).get('latestCreatedRevisionName')==target['candidate']
            and service.get('status',{}).get('latestReadyRevisionName')==target['candidate'])

def verify_planned_shape(service, journal):
    expected = journal['request']['spec']['template']
    actual = service.get('spec',{}).get('template',{})
    require(service_envelope(service)==service_envelope(journal['baselineService']), 'VALIDATION_CHANGED_SERVICE_POLICY')
    require(desired_traffic(service)==canonical_traffic(journal['request']['spec']['traffic']), 'VALIDATION_CHANGED_TRAFFIC')
    require(actual.get('metadata',{}).get('name')==journal['target']['candidate']
            and actual.get('spec',{}).get('containers',[{}])[0].get('image')==journal['target']['image'],
            'VALIDATION_CHANGED_CANDIDATE')
    require(template_from_revision(actual,journal['target']['image'],journal['target']['candidate'])==expected,
            'VALIDATION_CHANGED_CONFIGURATION')

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None

class Cloud:
    def __init__(self):
        self.token = None
        self.opener = urllib.request.build_opener(NoRedirect)

    def cli(self, *args):
        result = subprocess.run(['gcloud',*args,'--project',PROJECT,'--quiet','--format=json'],
                                capture_output=True,text=True,timeout=45)
        require(result.returncode==0, 'READ_ONLY_GCLOUD_FAILED')
        try: return json.loads(result.stdout)
        except ValueError: raise StageError('INVALID_CLOUD_METADATA') from None

    def request(self, kind, name, body=None, dry_run=False, missing=False):
        require(kind in ('services','revisions') and re.fullmatch(r'[a-z][a-z0-9-]{0,62}',name), 'RESOURCE_OUT_OF_SCOPE')
        require(any(name==s or kind=='revisions' and name.startswith(s+'-') for s in TARGETS), 'RESOURCE_OUT_OF_SCOPE')
        if self.token is None:
            token = subprocess.run(['gcloud','auth','print-access-token','--quiet'],
                                   capture_output=True,text=True,timeout=30)
            require(token.returncode==0 and bool(token.stdout.strip()), 'CLOUD_AUTHENTICATION_FAILED')
            self.token = token.stdout.strip()
        mutation = body is not None and not dry_run
        require(body is None or kind=='services', 'MUTATION_OUT_OF_SCOPE')
        url = API+'/'+kind+'/'+name+('?dryRun=all' if dry_run else '')
        req = urllib.request.Request(url,method='PUT' if body is not None else 'GET',
              data=json.dumps(body).encode() if body is not None else None,
              headers={'Authorization':'Bearer '+self.token,'Content-Type':'application/json'})
        try:
            with self.opener.open(req,timeout=45) as response:
                data = json.loads(response.read(2*1024*1024))
        except urllib.error.HTTPError as error:
            if error.code==404 and missing and body is None: return None
            raise CloudError('HTTP_'+str(error.code), uncertain=mutation and (error.code>=500 or error.code==408)) from None
        except (OSError,ValueError,TimeoutError):
            raise CloudError('CLOUD_RESPONSE_UNKNOWN' if mutation else 'CLOUD_READ_FAILED', uncertain=mutation) from None
        if not isinstance(data,dict):
            raise CloudError('CLOUD_RESPONSE_UNKNOWN' if mutation else 'INVALID_CLOUD_METADATA',uncertain=mutation)
        return data

    def iam(self, service):
        return self.cli('run','services','get-iam-policy',service,'--region',REGION)

def save_journal(path, value):
    descriptor, temporary_name = tempfile.mkstemp(prefix=path.name+'.',dir=path.parent)
    temporary = Path(temporary_name)
    with os.fdopen(descriptor,'w') as output:
        json.dump(value,output)
        output.flush()
        os.fsync(output.fileno())
    os.replace(temporary,path)
    os.chmod(path,0o600)

def load_journal(path, service):
    require(not path.is_symlink() and (path.stat().st_mode & 0o077)==0, 'JOURNAL_PERMISSIONS_INVALID')
    try: value = json.loads(path.read_text())
    except (OSError,ValueError): raise StageError('JOURNAL_UNREADABLE') from None
    require(value.get('sourceSha')==SOURCE_SHA and value.get('service')==service
            and value.get('target')==TARGETS[service], 'JOURNAL_IDENTITY_MISMATCH')
    validate_baseline(value['baselineService'],value['baselineRevision'],value['target'])
    require(value.get('request')==make_stage_service(value['baselineService'],value['baselineRevision'],value['target']),
            'JOURNAL_REQUEST_MISMATCH')
    return value

def observe(cloud, journal):
    service = journal['service']
    target = journal['target']
    current = cloud.request('services',service)
    baseline = cloud.request('revisions',target['baseline'])
    validate_baseline(journal['baselineService'],baseline,target)
    require(template_from_revision(baseline,target['image'],target['candidate'])==journal['request']['spec']['template'],
            'SAVED_SERVING_METADATA_CHANGED')
    require(digest(cloud.iam(service))==journal['iamHash'], 'IAM_CHANGED')
    require(service_envelope(current)==service_envelope(journal['baselineService']), 'SERVICE_POLICY_CHANGED')
    require(canonical_traffic(pinned_traffic(current))==canonical_traffic(journal['request']['spec']['traffic']),
            'SERVING_TRAFFIC_CHANGED')
    original = journal['baselineService']
    if current.get('metadata',{}).get('resourceVersion')==original.get('metadata',{}).get('resourceVersion'):
        require(current.get('spec')==original.get('spec'), 'BASELINE_CHANGED_WITHOUT_VERSION')
        return False
    require(desired_traffic(current)==canonical_traffic(journal['request']['spec']['traffic']),
            'DESIRED_TRAFFIC_CHANGED')
    candidate = cloud.request('revisions',target['candidate'],missing=True)
    if candidate is None: return False
    return verify_candidate(current,candidate,journal)

def report(service, target, status):
    return {'service':service,'status':status,'servingRevision':target['baseline'],'servingPercent':100,
            'candidateRevision':target['candidate'],'candidatePercent':0,'candidateImage':target['image'],
            'promoted':False}

def stage(cloud, directory, service, execute=False, wait_seconds=600):
    target = TARGETS[service]
    path = directory/(service+'.json')
    if path.exists():
        journal = load_journal(path,service)
    else:
        current = cloud.request('services',service)
        baseline = cloud.request('revisions',target['baseline'])
        validate_baseline(current,baseline,target)
        require(cloud.request('revisions',target['candidate'],missing=True) is None, 'CANDIDATE_EXISTS_WITHOUT_JOURNAL')
        registry = cloud.cli('artifacts','docker','images','describe',target['image'])
        require(registry.get('image_summary',{}).get('digest')==target['image'].split('@')[1], 'NEW_IMAGE_DIGEST_UNVERIFIED')
        journal = {'sourceSha':SOURCE_SHA,'service':service,'target':target,'phase':'prepared',
                   'baselineService':current,'baselineRevision':baseline,'iamHash':digest(cloud.iam(service)),
                   'request':make_stage_service(current,baseline,target)}
        save_journal(path,journal)
    if journal['phase']=='prepared':
        if not execute: return report(service,target,'PREPARED_NO_MUTATION')
        # API-side validation does not persist anything. Re-read before PUT and
        # carry the ORIGINAL resourceVersion; never refresh a stale condition.
        proposed = cloud.request('services',service,journal['request'],dry_run=True)
        verify_planned_shape(proposed,journal)
        current = cloud.request('services',service)
        require(current['metadata'].get('resourceVersion')==journal['baselineService']['metadata'].get('resourceVersion'),
                'CONCURRENT_SERVICE_CHANGE')
        baseline = cloud.request('revisions',target['baseline'])
        validate_baseline(current,baseline,target)
        require(current.get('spec')==journal['baselineService'].get('spec')
                and service_envelope(current)==service_envelope(journal['baselineService']), 'SAVED_BASELINE_CHANGED')
        require(make_stage_service(current,baseline,target)==journal['request'], 'SAVED_REQUEST_CHANGED')
        require(digest(cloud.iam(service))==journal['iamHash'], 'IAM_CHANGED')
        require(cloud.request('revisions',target['candidate'],missing=True) is None, 'CANDIDATE_ALREADY_EXISTS')
        journal['phase'] = 'attempted'
        save_journal(path,journal)
        try:
            cloud.request('services',service,journal['request'])
        except CloudError as error:
            journal['phase'] = 'uncertain' if error.uncertain else 'rejected'
            journal['errorCode'] = str(error)
            save_journal(path,journal)
            raise StageError('STAGE_'+journal['phase'].upper()+'_'+str(error)+'; rerun without --execute for read-only inspection; no PUT will repeat') from None
    if journal['phase']=='rejected':
        require(not execute, 'PRIOR_MUTATION_REJECTED_NO_RETRY')
        observe(cloud,journal)
        return report(service,target,'REJECTED_READ_ONLY_INSPECTION_NO_RETRY')
    require(journal['phase'] in ('attempted','uncertain','verified'), 'PRIOR_MUTATION_REJECTED_NO_RETRY')
    # Existing journals always recover by reads. Even --execute cannot replay a
    # mutation whose response was lost or whose client stopped after submission.
    deadline = time.monotonic()+wait_seconds
    while True:
        if observe(cloud,journal):
            journal['phase'] = 'verified'
            save_journal(path,journal)
            return report(service,target,'STAGED_READY_VERIFIED')
        if time.monotonic()>=deadline:
            return report(service,target,'PENDING_OR_UNCERTAIN_READ_ONLY_RECOVERY')
        time.sleep(5)

def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--state-dir',required=True,help='Private Cloud Shell directory retained for recovery; never upload its journals')
    parser.add_argument('--execute',action='store_true',help='Stage prepared exact revisions once, with zero traffic')
    parser.add_argument('--wait-seconds',type=int,default=600)
    args = parser.parse_args(argv)
    require(0<=args.wait_seconds<=900, 'INVALID_WAIT_BOUND')
    directory = Path(args.state_dir).absolute()
    require(not directory.is_symlink(), 'STATE_DIRECTORY_INVALID')
    directory.mkdir(mode=0o700,parents=True,exist_ok=True)
    require((directory.stat().st_mode & 0o077)==0, 'STATE_DIRECTORY_MUST_BE_PRIVATE')
    cloud = Cloud()
    if args.execute:
        # Inspect both baselines before the first mutation. A prior uncertain
        # attempt is inspected by reads and must resolve before any new stage.
        for service in TARGETS:
            outcome = stage(cloud,directory,service,False,0)
            if outcome['status'] not in ('STAGED_READY_VERIFIED','PREPARED_NO_MUTATION'):
                print(json.dumps(outcome),flush=True)
                return 2
    for service in TARGETS:
        outcome = stage(cloud,directory,service,args.execute,args.wait_seconds)
        print(json.dumps(outcome),flush=True)
        if outcome['status'] not in ('STAGED_READY_VERIFIED','PREPARED_NO_MUTATION'): return 2
    return 0

if __name__=='__main__':
    try: sys.exit(main())
    except StageError as error:
        print('PR108_STAGE_STOPPED: '+str(error),file=sys.stderr)
        sys.exit(2)
    except Exception:
        print('PR108_STAGE_STOPPED: unexpected local/transport failure; inspect by rerunning without --execute. No automatic retry.',file=sys.stderr)
        sys.exit(2)
