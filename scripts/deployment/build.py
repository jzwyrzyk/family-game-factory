#!/usr/bin/env python3
"""Build/push only reviewed tracked sources on the owner's Docker machine; no Cloud Build identity."""
import argparse
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile

PROJECT='family-game-factory-jzw'
SANDBOX='ghcr.io/jzwyrzyk/family-game-factory-sandbox'

def stage_sources(root, destination, sha, scope):
    files=run(['git','ls-tree','-r','--name-only',sha,'--',*scope],root).decode().splitlines()
    for name in files:
        path=Path(name)
        if path.suffix in ('.pem','.key') or any(x in path.name.lower() for x in ['credentials','secrets','config.json','config.private']):continue
        target=Path(destination)/name
        target.parent.mkdir(parents=True,exist_ok=True)
        target.write_bytes(run(['git','show',sha+':'+name],root))

def run(args,cwd=None):
    result=subprocess.run(args,cwd=cwd,capture_output=True)
    if result.returncode:
        raise RuntimeError('Build command failed: '+args[0]+' '+args[1]+'. Output suppressed; inspect the owner Docker environment without printing credentials.')
    return result.stdout

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--region')
    p.add_argument('--sandbox',action='store_true',help='Build sandbox locally; publish only with --publish')
    p.add_argument('--reviewed-source-sha')
    p.add_argument('--publish',action='store_true',help='Explicitly publish the sandbox image after owner authorization')
    p.add_argument('--execute',action='store_true')
    a=p.parse_args()
    if not a.sandbox and not re.fullmatch('[a-z]+-[a-z]+[0-9]',a.region or ''):raise RuntimeError('Invalid region')
    if a.publish and not a.sandbox:raise RuntimeError('--publish applies only to --sandbox')
    if not a.execute:
        print('Plan only: '+('build sandbox from a reviewed commit locally; publishing additionally requires --publish and owner authorization.' if a.sandbox else 'build two tracked-source Docker images, push to existing factory-services registry, resolve immutable digests. Add --execute only after owner approval.'))
        return
    root=Path(__file__).resolve().parents[2]
    if a.sandbox:
        sha=a.reviewed_source_sha or ''
        if not re.fullmatch('[a-f0-9]{40}',sha):raise RuntimeError('Reviewed full sandbox source SHA required')
        run(['git','cat-file','-e',sha+'^{commit}'],root)
        image=SANDBOX+':'+sha
        with tempfile.TemporaryDirectory(prefix='factory-sandbox-build-') as tmp:
            stage_sources(root,tmp,sha,['.dockerignore','server/sandbox'])
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
    scope=['package.json','package-lock.json','.dockerignore','server','src/runtime/types.ts','src/runtime/manifests.ts','src/studio/design.ts']
    run(['git','diff','--exit-code','HEAD','--',*scope],root)
    sha=run(['git','rev-parse','HEAD'],root).decode().strip()
    if not re.fullmatch('[a-f0-9]{40}',sha):raise RuntimeError('Invalid source commit')
    run(['gcloud','artifacts','repositories','describe','factory-services','--project',PROJECT,'--location',a.region,'--format=json'])
    images={}
    with tempfile.TemporaryDirectory(prefix='factory-build-') as tmp:
        # Never upload untracked workspace files. No .git, owner config, downloads or host credentials.
        stage_sources(root,tmp,'HEAD',scope)
        for kind in ['gateway','preview']:
            image=f'{a.region}-docker.pkg.dev/{PROJECT}/factory-services/{kind}:{sha}'
            run(['docker','build','--label','org.opencontainers.image.revision='+sha,'-f','server/Dockerfile.'+kind,'-t',image,'.'],tmp)
            run(['docker','push',image])
            raw=run(['gcloud','artifacts','docker','images','describe',image,'--project',PROJECT,'--format=json'])
            digest=json.loads(raw)['image_summary']['digest']
            if not re.fullmatch('sha256:[a-f0-9]{64}',digest):raise RuntimeError('Registry digest missing')
            images[kind]=image.rsplit(':',1)[0]+'@'+digest
    print('Built from reviewed commit '+sha+'. Review image/SBOM before deploying.')
    print('python3 scripts/deployment/deploy.py deploy --execute --region '+a.region+' --gateway-image '+images['gateway']+' --preview-image '+images['preview'])

if __name__=='__main__':
    try:main()
    except Exception as error:
        print(str(error) if isinstance(error,RuntimeError) else 'Build failed; sensitive diagnostics suppressed.',file=sys.stderr)
        sys.exit(1)
