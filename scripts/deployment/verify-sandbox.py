#!/usr/bin/env python3
"""Required activation prerequisite; run on the approved isolated runner, never the gateway."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from datetime import datetime, timezone
WORKER='dcb887e6a51ba000fda1ccc42b9d198f8b9895f9'

def require_full_smoke(result):
    text=result.stdout
    if result.returncode or 'SKIP' in text or text.count('PASS gVisor:') < 3 or 'hostile infinite module and network API rejected' not in text or 'compiled, desktop/mobile input-driven win, replay, parent isolation, no egress' not in text:
        raise RuntimeError('Full gVisor browser smoke did not pass. Activation remains blocked; skips and host tests are insufficient.')

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--worker-checkout',required=True,type=Path)
    p.add_argument('--image',required=True)
    p.add_argument('--evidence',required=True,type=Path)
    a=p.parse_args()
    if not re.fullmatch(r'sha256:[a-f0-9]{64}|[\w./:-]+@sha256:[a-f0-9]{64}',a.image):raise RuntimeError('Immutable sandbox image required')
    sha=subprocess.check_output(['git','rev-parse','HEAD'],cwd=a.worker_checkout,text=True).strip()
    if sha!=WORKER:raise RuntimeError('Smoke must test the preserved approved worker commit')
    subprocess.run(['git','diff','--exit-code','HEAD','--','server','tests','package.json','package-lock.json'],cwd=a.worker_checkout,check=True,capture_output=True)
    if subprocess.check_output(['git','ls-files','--others','--exclude-standard','--','server','tests'],cwd=a.worker_checkout,text=True).strip():
        raise RuntimeError('Untracked worker source/test files require review')
    # Dedicated runner must have no provider/cloud/App secrets. Do not inherit arbitrary environment.
    env={k:os.environ[k] for k in ['PATH','HOME','TMPDIR'] if k in os.environ}
    env['FACTORY_TEST_SANDBOX_IMAGE']=a.image
    result=subprocess.run(['npm','run','test:sandbox'],cwd=a.worker_checkout,env=env,text=True,capture_output=True,timeout=300)
    require_full_smoke(result)
    evidence={'version':1,'workerSha':sha,'imageDigest':a.image,'fullBrowserSmokePassed':True,
              'checkedAt':datetime.now(timezone.utc).isoformat(),'outputSha256':hashlib.sha256(result.stdout.encode()).hexdigest()}
    a.evidence.write_text(json.dumps(evidence,indent=2)+'\n')
    print('Full gVisor browser smoke passed. Evidence recorded; activation still requires owner security/budget approval.')

if __name__=='__main__':
    try:main()
    except Exception:
        print('Full gVisor browser smoke failed or runner prerequisites missing. Activation remains blocked. No sensitive runner diagnostics printed.',file=sys.stderr)
        sys.exit(1)
