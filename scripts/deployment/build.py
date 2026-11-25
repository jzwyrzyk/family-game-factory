#!/usr/bin/env python3
"""Publish reviewed service sources with Cloud Build; sandbox builds remain local and separate."""
import argparse
import gzip
import hashlib
import io
import json
from pathlib import Path
import re
import shlex
import subprocess
import sys
import tarfile
import tempfile
import time

PROJECT='family-game-factory-jzw'
SANDBOX='ghcr.io/jzwyrzyk/family-game-factory-sandbox'
SANDBOX_SCOPE=['.dockerignore','server/sandbox','server/agent/game-assets.cjs','server/quality/game-quality-evidence.cjs']
REQUIRED_SANDBOX_FILES=['server/sandbox/Dockerfile','server/sandbox/worker.cjs','server/sandbox/quality-capture.cjs','server/sandbox/source-validator.cjs','server/agent/game-assets.cjs','server/quality/game-quality-evidence.cjs']
BUILDER='factory-service-builder@'+PROJECT+'.iam.gserviceaccount.com'
SERVICE_SCOPE=['package.json','package-lock.json','.dockerignore','server','src/runtime/types.ts','src/runtime/manifests.ts','src/builder/submission.ts','src/storage/record-contract.ts','src/studio/design.ts','src/studio/creation-readiness.ts','src/studio/conversation-view.ts','src/creation/model.ts','src/creation/projects.ts','src/pals/catalog.ts','src/pals/catalog-artwork.generated.ts']
REQUIRED_APIS={'cloudbuild.googleapis.com','artifactregistry.googleapis.com','logging.googleapis.com','storage.googleapis.com','iam.googleapis.com'}


def stage_sources(root, destination, sha, scope, services=False):
    files=run(['git','ls-tree','-r','--name-only',sha,'--',*scope],root).decode().splitlines()
    for name in files:
        path=Path(name)
        if path.suffix in ('.pem','.key') or any(x in path.name.lower() for x in ['credentials','secrets','config.json','config.private']):continue
        if services and (any(part.startswith('.') for part in path.parts) and name!='.dockerignore'
                         or 'node_modules' in path.parts or name.startswith('server/testing/')
                         or re.search(r'(?:service[-_]account|token|api[-_]key|config\.).*\.json$',path.name,re.I)):
            continue
        target=Path(destination)/name
        target.parent.mkdir(parents=True,exist_ok=True)
        target.write_bytes(run(['git','show',sha+':'+name],root))

def run(args,cwd=None):
    result=subprocess.run(args,cwd=cwd,capture_output=True)
    if result.returncode:
        raise RuntimeError('Build command failed: '+args[0]+' '+args[1]+'. Output suppressed; inspect the owner Docker environment without printing credentials.')
    return result.stdout

def cloud(*args):
    command=['gcloud',*args,'--project',PROJECT,'--quiet','--format=json']
    try:
        return json.loads(run(command) or 'null')
    except FileNotFoundError as error:
        raise RuntimeError('gcloud CLI is required in the existing authenticated owner environment.') from error
    except (RuntimeError,ValueError) as error:
        if args[:2]==('builds','submit'):
            raise RuntimeError('Build submission failed or its response was lost. Inspect Cloud Build history before resubmitting; a build may already be running. No automatic retry was attempted.') from error
        # Commands here contain metadata only, but raw SDK diagnostics can contain tokens.
        raise RuntimeError('Cloud operation failed: '+' '.join(args[:3])+'. Check the documented API/IAM prerequisites and Cloud Build log URL; raw diagnostics suppressed.') from error


def service_config(region,sha):
    prefix=f'{region}-docker.pkg.dev/{PROJECT}/factory-services'
    images=[f'{prefix}/{kind}:{sha}' for kind in ('gateway','preview')]
    return {
        'steps':[{'name':'gcr.io/cloud-builders/docker','args':[
            'build','--pull','--label','org.opencontainers.image.revision='+sha,
            '-f','server/Dockerfile.'+kind,'-t',image,'.']}
            for kind,image in zip(('gateway','preview'),images)],
        'images':images,
        'serviceAccount':f'projects/{PROJECT}/serviceAccounts/{BUILDER}',
        'options':{'logging':'CLOUD_LOGGING_ONLY','machineType':'E2_MEDIUM'},
        'timeout':'1200s','tags':['factory-services','source-'+sha]}


def preflight(region,bucket):
    enabled={x.get('config',{}).get('name') for x in cloud('services','list','--enabled')}
    missing=REQUIRED_APIS-enabled
    if missing:raise RuntimeError('Required APIs disabled: '+', '.join(sorted(missing))+'. No API was enabled; use the owner-authorized setup instructions.')
    repo=cloud('artifacts','repositories','describe','factory-services','--location',region)
    if repo.get('format')!='DOCKER' or repo.get('mode','STANDARD_REPOSITORY')!='STANDARD_REPOSITORY':
        raise RuntimeError('factory-services must be an existing standard Docker repository.')
    account=cloud('iam','service-accounts','describe',BUILDER)
    if account.get('disabled'):raise RuntimeError('Dedicated build service account is disabled.')
    meta=cloud('storage','buckets','describe','gs://'+bucket)
    if str(meta.get('location','')).lower()!=region:
        raise RuntimeError('Source-only staging bucket must be in the build region.')
    if not meta.get('uniform_bucket_level_access') or meta.get('public_access_prevention')!='enforced':
        raise RuntimeError('Source bucket requires uniform bucket-level access and enforced public access prevention.')
    # Direct and inherited grants must be reviewed; an empty repository policy does not imply no access.
    member='serviceAccount:'+BUILDER
    policies=[(cloud('projects','get-iam-policy',PROJECT),{'roles/logging.logWriter'})]
    for ancestor in cloud('projects','get-ancestors',PROJECT):
        if ancestor['type'] in ('folder','organization'):
            policies.append((cloud(ancestor['type']+'s','get-iam-policy',ancestor['id']),set()))
    policies += [(cloud('artifacts','repositories','get-iam-policy','factory-services','--location',region),{'roles/artifactregistry.writer'}),
                 (cloud('storage','buckets','get-iam-policy','gs://'+bucket),{'roles/storage.objectViewer'})]
    for policy,allowed in policies:
        bindings=[b for b in policy.get('bindings',[]) if member in b.get('members',[])]
        if any(b.get('role') not in allowed or b.get('condition') for b in bindings):
            raise RuntimeError('Dedicated builder has unexpected direct/inherited IAM grants; inspect metadata. No IAM was changed.')
        if allowed and {b['role'] for b in bindings}!=allowed:
            raise RuntimeError('Dedicated builder is missing a scoped grant: '+', '.join(sorted(allowed))+'. No IAM was changed.')


def verify_service_copy_inputs(context):
    # Validate the selected source's Dockerfiles, not the publisher's checkout:
    # older reviewed releases legitimately have no Creation source dependency.
    for kind in ('gateway','preview','coach'):
        dockerfile=context/('server/Dockerfile.'+kind)
        # Older reviewed rollback sources predate the separate coach image.
        if kind=='coach' and not dockerfile.is_file():continue
        for line in dockerfile.read_text().replace('\\\n',' ').splitlines():
            tokens=shlex.split(line,comments=True)
            if not tokens or tokens[0].upper()!='COPY':continue
            if any(token.startswith('--from=') for token in tokens[1:]):continue
            inputs=[token for token in tokens[1:] if not token.startswith('--')][:-1]
            if not inputs:raise RuntimeError('Unsupported service Dockerfile COPY syntax: '+kind)
            for name in inputs:
                path=Path(name)
                if path.is_absolute() or '..' in path.parts or any(char in name for char in '[]*?${}'):
                    raise RuntimeError('Unsupported service Dockerfile COPY source: '+name)
                if not (context/path).exists():
                    raise RuntimeError('Reviewed service source is incomplete: '+name+' (Dockerfile.'+kind+' COPY)')


def source_archive(root,tmp,sha):
    context=Path(tmp)/'context'
    stage_sources(root,context,sha,SERVICE_SCOPE,services=True)
    for name in ['package.json','package-lock.json','.dockerignore','server/Dockerfile.gateway','server/Dockerfile.preview','src/studio/design.ts','src/runtime/types.ts','src/runtime/manifests.ts']:
        if not (context/name).is_file():raise RuntimeError('Reviewed service source is incomplete: '+name)
    verify_service_copy_inputs(context)
    archive=Path(tmp)/'source.tgz'
    # Stable source digest: only git blobs, sorted names, no host modes/mtime/uid, no SDK ignore rules.
    with archive.open('wb') as output,gzip.GzipFile(fileobj=output,mode='wb',filename='',mtime=0) as compressed,tarfile.open(fileobj=compressed,mode='w') as tar:
        for path in sorted(context.rglob('*')):
            if path.is_file():
                content=path.read_bytes()
                entry=tarfile.TarInfo(path.relative_to(context).as_posix());entry.size=len(content);entry.mode=0o644
                tar.addfile(entry,io.BytesIO(content))
    return archive,hashlib.sha256(archive.read_bytes()).hexdigest()


def verify_build(build,config):
    if build.get('serviceAccount')!=config['serviceAccount'] or build.get('images')!=config['images'] or build.get('tags')!=config['tags']:
        raise RuntimeError('Build identity/source tags/images differ from the reviewed publication plan.')
    actual=build.get('steps',[])
    if len(actual)!=len(config['steps']) or any(a.get('name')!=e['name'] or a.get('args')!=e['args'] for a,e in zip(actual,config['steps'])):
        raise RuntimeError('Build steps differ from the reviewed publication plan.')
    if build.get('status')!='SUCCESS':raise RuntimeError('Build did not succeed: '+str(build.get('status'))+'. Inspect its Cloud Build logs; no images authorized for deployment.')
    results=build.get('results',{}).get('images',[])
    if len(results)!=2 or {x.get('name') for x in results}!=set(config['images']):
        raise RuntimeError('Cloud Build did not report both expected image digests.')
    images={}
    for result in results:
        digest=result.get('digest','')
        if not re.fullmatch('sha256:[a-f0-9]{64}',digest):raise RuntimeError('Cloud Build image digest missing/invalid.')
        image=result['name'].rsplit(':',1)[0]+'@'+digest
        # Verify the immutable reference, not a mutable tag that a later build may overwrite.
        metadata=cloud('artifacts','docker','images','describe',image)
        if metadata.get('image_summary',{}).get('digest')!=digest:
            raise RuntimeError('Artifact Registry digest verification failed.')
        images[image.rsplit('/',1)[1].split('@')[0]]=image
    return images


def services(args):
    sha=args.reviewed_source_sha or ''
    bucket=args.source_bucket or f'{PROJECT}-service-builds-{args.region}'
    if not re.fullmatch(r'[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]',bucket):raise RuntimeError('Invalid source bucket name.')
    if sha and not re.fullmatch('[a-f0-9]{40}',sha):raise RuntimeError('Reviewed full service source SHA required; branches/tags are not accepted.')
    config=service_config(args.region,sha or '<REVIEWED_SHA>')
    if args.preflight and (args.execute or args.build_id):raise RuntimeError('--preflight cannot submit or recover a build.')
    if not args.execute and not args.preflight and not args.build_id:
        print(json.dumps({'project':PROJECT,'region':args.region,'reviewedSourceSha':sha or 'REQUIRED',
            'sourceBucket':bucket,'sourceScope':SERVICE_SCOPE,'build':config,
            'mutations':'none (offline plan); --preflight reads metadata; --execute uploads and starts a billable build',
            'deployment':'separate owner authorization; only verified @sha256 references may be used'},indent=2))
        return
    if args.preflight:
        preflight(args.region,bucket)
        print('Read-only publishing preflight passed. Owner must also review group/impersonation grants. No build or upload started.')
        return
    if not re.fullmatch('[a-f0-9]{40}',sha):raise RuntimeError('Reviewed full service source SHA required before any cloud call.')
    if args.build_id and not re.fullmatch('[a-f0-9-]{36}',args.build_id):raise RuntimeError('Invalid Cloud Build ID.')
    root=Path(__file__).resolve().parents[2]
    source_hash=None
    build_id=args.build_id
    if not build_id:
        # Resolve the exact commit before touching the cloud. Never use HEAD or workspace files.
        run(['git','cat-file','-e',sha+'^{commit}'],root)
        with tempfile.TemporaryDirectory(prefix='factory-services-') as tmp:
            archive,source_hash=source_archive(root,tmp,sha)
            config_file=Path(tmp)/'cloudbuild.json';config_file.write_text(json.dumps(config))
            preflight(args.region,bucket)
            print('Submitting reviewed source '+sha+' archive sha256:'+source_hash,file=sys.stderr,flush=True)
            submitted=cloud('builds','submit',str(archive),'--config',str(config_file),'--region',args.region,
                '--gcs-source-staging-dir','gs://'+bucket+'/source','--async')
            build_id=submitted.get('id','')
            if not re.fullmatch('[a-f0-9-]{36}',build_id):raise RuntimeError('Submission returned no build ID. Inspect Cloud Build history before resubmitting.')
    print(f'Build ID: {build_id} (recover with --build-id {build_id} and the same reviewed SHA/region).',file=sys.stderr,flush=True)
    print(f'https://console.cloud.google.com/cloud-build/builds;region={args.region}/{build_id}?project={PROJECT}',file=sys.stderr,flush=True)
    # Bounded polling, no automatic resubmission. A disconnected client does not cancel the build.
    for attempt in range(181):
        build=cloud('builds','describe',build_id,'--region',args.region)
        if build.get('status') not in ('PENDING','QUEUED','WORKING'):break
        if attempt==180:raise RuntimeError('Build still running; recover by ID. Do not start another build.')
        time.sleep(10)
    images=verify_build(build,config)
    print(json.dumps({'project':PROJECT,'region':args.region,'reviewedSourceSha':sha,'buildId':build_id,
        'sourceArchiveSha256':source_hash,'source':build.get('sourceProvenance',{}).get('resolvedStorageSource',build.get('source',{})),
        'images':images,'deployed':False},indent=2))


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--region')
    p.add_argument('--sandbox',action='store_true',help='Build sandbox locally; publish only with --publish')
    p.add_argument('--reviewed-source-sha')
    p.add_argument('--publish',action='store_true',help='Explicitly publish the sandbox image after owner authorization')
    p.add_argument('--execute',action='store_true')
    p.add_argument('--preflight',action='store_true',help='Read-only service publishing prerequisites; no build/upload')
    p.add_argument('--build-id',help='Recover/verify an existing service build; never resubmit')
    p.add_argument('--source-bucket',help='Dedicated source-only bucket; default PROJECT-service-builds-REGION')
    a=p.parse_args()
    if not a.sandbox and not re.fullmatch('[a-z]+-[a-z]+[0-9]',a.region or ''):raise RuntimeError('Invalid region')
    if a.publish and not a.sandbox:raise RuntimeError('--publish applies only to --sandbox')
    if not a.sandbox:
        services(a)
        return
    if a.preflight or a.build_id or a.source_bucket:raise RuntimeError('Service publishing options do not apply to --sandbox')
    if not a.execute:
        print('Plan only: build sandbox from a reviewed commit locally; publishing additionally requires --publish and owner authorization.')
        return
    root=Path(__file__).resolve().parents[2]
    if a.sandbox:
        sha=a.reviewed_source_sha or ''
        if not re.fullmatch('[a-f0-9]{40}',sha):raise RuntimeError('Reviewed full sandbox source SHA required')
        run(['git','cat-file','-e',sha+'^{commit}'],root)
        image=SANDBOX+':'+sha
        with tempfile.TemporaryDirectory(prefix='factory-sandbox-build-') as tmp:
            stage_sources(root,tmp,sha,SANDBOX_SCOPE)
            missing=[name for name in REQUIRED_SANDBOX_FILES if not (Path(tmp)/name).is_file()]
            if missing:raise RuntimeError('Reviewed sandbox source incomplete: '+', '.join(missing))
            run(['docker','buildx','version'])
            run(['docker','buildx','inspect','--bootstrap'])
            run(['env','DOCKER_BUILDKIT=1','docker','build','--pull','--label','org.opencontainers.image.revision='+sha,
                 '-f','server/sandbox/Dockerfile','-t',image,'.'],tmp)
        if a.publish:
            run(['docker','push',image])
            digests=json.loads(run(['docker','image','inspect',image,'--format','{{json .RepoDigests}}']))
            matches=[x for x in digests if re.fullmatch(re.escape(SANDBOX)+r'@sha256:[a-f0-9]{64}',x)]
            if len(matches)!=1:raise RuntimeError('Published sandbox digest unverified')
            print(matches[0])
        else:
            print('Built locally; NOT published: '+image)
        return

if __name__=='__main__':
    try:main()
    except Exception as error:
        print(str(error) if isinstance(error,RuntimeError) else 'Build failed; sensitive diagnostics suppressed.',file=sys.stderr)
        sys.exit(1)
