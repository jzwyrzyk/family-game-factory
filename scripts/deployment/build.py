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

def run(args,cwd=None):
    result=subprocess.run(args,cwd=cwd,capture_output=True)
    if result.returncode:
        raise RuntimeError('Build command failed: '+args[0]+' '+args[1]+'. Output suppressed; inspect the owner Docker environment without printing credentials.')
    return result.stdout

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--region',required=True)
    p.add_argument('--execute',action='store_true')
    a=p.parse_args()
    if not re.fullmatch('[a-z]+-[a-z]+[0-9]',a.region):raise RuntimeError('Invalid region')
    if not a.execute:
        print('Plan only: build two tracked-source Docker images, push to existing factory-services registry, resolve immutable digests. Add --execute only after owner approval.')
        return
    root=Path(__file__).resolve().parents[2]
    scope=['package.json','package-lock.json','.dockerignore','server','src/runtime/types.ts','src/runtime/manifests.ts']
    run(['git','diff','--exit-code','HEAD','--',*scope],root)
    sha=run(['git','rev-parse','HEAD'],root).decode().strip()
    if not re.fullmatch('[a-f0-9]{40}',sha):raise RuntimeError('Invalid source commit')
    run(['gcloud','artifacts','repositories','describe','factory-services','--project',PROJECT,'--location',a.region,'--format=json'])
    images={}
    with tempfile.TemporaryDirectory(prefix='factory-build-') as tmp:
        # Never upload untracked workspace files. No .git, owner config, downloads or host credentials.
        files=run(['git','ls-tree','-r','--name-only','HEAD','--',*scope],root).decode().splitlines()
        for name in files:
            path=Path(name)
            if path.suffix in ('.pem','.key') or any(x in path.name.lower() for x in ['credentials','secrets','config.json','config.private']):continue
            target=Path(tmp)/name
            target.parent.mkdir(parents=True,exist_ok=True)
            target.write_bytes(run(['git','show','HEAD:'+name],root))
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
