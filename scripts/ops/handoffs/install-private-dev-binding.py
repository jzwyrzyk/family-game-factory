#!/usr/bin/env python3
"""Install the owner-approved private binding on the disabled nonproduction controller."""
import base64
import fcntl
import getpass
import hashlib
import importlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile

REPO = 'jzwyrzyk/family-game-factory'
ENV = 'jems-nonproduction'
SECRET = 'JEMS_OWNER_IAP_BINDING'
MAIN = '3c6a08fd80562c5114fdc0e652b5791f40b8d93c'
PROJECT = 'jems-jzw-nonprod'
NUMBER = '1092405124984'
ENV_ID = 28612269438
STATE = '3a6ea98f2ebd908d13a300fd9b101dd3442f22ec1d981bc5c7ab2488f40a53f2'
PLAN = 'd4802a183aa00c9bb6891a7a4a73bf38cab3946e0e52916c83e6c09ccfd6a1b4'
FILES = {'scripts/environments/private_iap.py':'e33cbdd117036afe71c9f06a1ba8b53102f34d9e36823bd0af7b2fd01fd25ba3',
         'scripts/environments/cloud.py':'cdd58179b75819c0e80aee8c77c0ac4f95e39348eb2d2f7f593bb1467061f429',
         'ops/environments.json':'26df634acc9a480e62389369f9e2c57dad15720f7fa947d7b966d227fdbee061'}


def require(ok, code):
    if not ok:
        raise RuntimeError(code)


def command(argv, code, payload=None):
    env = {**os.environ, 'GH_DEBUG':'', 'GH_PROMPT_DISABLED':'1'}
    result = subprocess.run(argv, input=payload if payload is not None else b'',
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=90, env=env)
    if result.returncode:
        http = re.search(rb'HTTP (\d{3})', result.stderr)
        raise RuntimeError(code + ('_HTTP_'+http[1].decode() if http else ''))
    return result.stdout


def api(path, code):
    return json.loads(command(['gh','api','--hostname','github.com','--method','GET','repos/'+REPO+'/'+path],code))


def digest(data):
    return hashlib.sha256(data).hexdigest()


def local(path, directory=False):
    require(path.resolve()==path and path.stat().st_uid==os.getuid() and not path.stat().st_mode & 0o077
            and (path.is_dir() if directory else path.is_file() and path.stat().st_nlink==1), 'PRIVATE_PATH_REQUIRED')
    return path


def read(path):
    return json.loads(local(path).read_bytes())


def write(path,data):
    with os.fdopen(os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600),'wb') as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())
    fd=os.open(path.parent,os.O_RDONLY|os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def target():
    branch=api('branches/main','GITHUB_MAIN_READ_FAILED')
    require(branch['protected'] is True and branch['commit']['sha']==MAIN,'PROTECTED_MAIN_CHANGED')
    environment=api('environments/'+ENV,'GITHUB_ENVIRONMENT_READ_FAILED')
    require(environment['id']==ENV_ID and environment['deployment_branch_policy']=={
        'custom_branch_policies':True,'protected_branches':False},'ENVIRONMENT_SCOPE_CHANGED')
    policy=api('environments/'+ENV+'/deployment-branch-policies','GITHUB_BRANCH_POLICY_READ_FAILED')
    require(policy['total_count']==1 and [(row['name'],row['type']) for row in policy['branch_policies']]==[('main','branch')],
            'ENVIRONMENT_BRANCH_POLICY_CHANGED')


def metadata():
    path='environments/'+ENV+'/secrets'
    seen=0
    for page in range(1,101):
        result=api(path+f'?per_page=100&page={page}','GITHUB_ENVIRONMENT_SECRETS_READ_FAILED')
        rows=result['secrets']
        for row in rows:
            if row['name'].upper()==SECRET:
                return row
        seen+=len(rows)
        if seen==result['total_count']:
            return None
        require(len(rows)==100, 'SECRET_LIST_INCOMPLETE')
    raise RuntimeError('SECRET_LIST_INCOMPLETE')


def state_outputs():
    parent=Path.home()/'work/jems-nonprod-state/partial-recovery'
    marker=read(parent/'federation-apply-started.json')
    active=local(Path(marker['authoritative_directory']),True)
    require(active.parent==parent and marker['plan_sha256']==PLAN,'ACTIVE_STATE_MARKER_CHANGED')
    completed=read(active/'completed.json')
    raw=local(active/'terraform.tfstate').read_bytes()
    require(digest(raw)==STATE==completed['state_sha256'] and completed['plan_sha256']==PLAN and
            completed['status']=='FEDERATION_ENABLED_VERIFIED' and completed['post_apply_plan']=='NO_CHANGES' and
            completed['managed_instances']==27 and completed['project']==PROJECT,'FEDERATION_RECEIPT_CHANGED')
    outputs=json.loads(raw)['outputs']['configuration_identifiers']['value']
    require(set(outputs)=={'projectId','projectNumber','region','registry','runtimeServiceAccount',
            'testRuntimeServiceAccount','deployServiceAccount','uatServiceAccount','wifProvider'}
            and outputs['projectId']==PROJECT and outputs['projectNumber']==NUMBER, 'STATE_OUTPUTS_CHANGED')
    return outputs


def install(folder, template, helper, identifiers):
    existing=metadata()
    if existing:
        require((folder/'installed.json').is_file(), 'EXISTING_BINDING_PRESERVED')
        prior=read(folder/'installed.json')
        proposal=read(folder/'environments.json')
        require(prior['github_updated_at']==existing['updated_at'] and prior['binding_sha256']==proposal['ownerIapBindingSha256']
                and prior['binding_sha256']==digest(local(folder/'iap-binding.json').read_bytes()),'EXISTING_BINDING_REVIEW_REQUIRED')
        return prior
    require(not (folder/'write-intent.json').exists(),'PRIOR_WRITE_INTENT_REVIEW_REQUIRED')
    require(not (folder/'installed.json').exists(),'PREVIOUS_SECRET_MISSING')
    require(sys.stdin.isatty(),'INTERACTIVE_ADMIN_TERMINAL_REQUIRED')
    print('In Google Auth Platform > Clients for jems-jzw-nonprod, open the existing Web application intended for DEV IAP.',flush=True)
    client=input('Paste its Client ID, or press Enter if there is no suitable client: ').strip()
    require(client,'NO_EXISTING_CLIENT_IDENTIFIED')
    require(re.fullmatch(re.escape(NUMBER)+r'-[a-z0-9]+\.apps\.googleusercontent\.com',client),'NONPRODUCTION_CLIENT_ID_MISMATCH')
    accounts=getpass.getpass('Approved adult Google account email(s), comma separated (hidden): ')
    proposal,secret=helper.prepare({**template,**identifiers,'enabled':True,'directoryIssue':156,'iapAudience':client},accounts)
    target()
    require(metadata() is None,'EXISTING_BINDING_PRESERVED')
    write(folder/'environments.json',(json.dumps(proposal,indent=2)+'\n').encode())
    write(folder/'iap-binding.json',secret.encode())
    write(folder/'write-intent.json',json.dumps({'binding_sha256':proposal['ownerIapBindingSha256'],'source':MAIN}).encode())
    command(['gh','secret','set',SECRET,'--repo','github.com/'+REPO,'--env',ENV],'SECRET_WRITE_UNCONFIRMED',secret.encode())
    record=metadata()
    require(record and record.get('updated_at'),'SECRET_METADATA_UNCONFIRMED')
    receipt={'status':'PRIVATE_DEV_BINDING_INSTALLED','source':MAIN,'environment':ENV,
             'binding_sha256':proposal['ownerIapBindingSha256'],'iap_audience':client,
             'client_evidence':'ADMIN_SELECTED_WEB_CLIENT_IN_PROJECT_CONSOLE','github_updated_at':record['updated_at'],
             'controller_enabled':False,'authenticated_invocation':'PENDING'}
    write(folder/'installed.json',json.dumps(receipt).encode())
    return receipt


def main():
    os.umask(0o077)
    target()
    ids=state_outputs()
    project=json.loads(command(['gcloud','projects','describe',PROJECT,'--format=json(projectId,projectNumber,lifecycleState)'],
                               'PROJECT_IDENTITY_READ_FAILED'))
    require(project.get('projectId')==PROJECT and str(project.get('projectNumber'))==NUMBER
            and project.get('lifecycleState')=='ACTIVE','PROJECT_IDENTITY_CHANGED')
    with tempfile.TemporaryDirectory() as scratch:
        for name,expected in FILES.items():
            item=api('contents/'+name+'?ref='+MAIN,'PINNED_SOURCE_READ_FAILED')
            data=base64.b64decode(item['content'])
            require(digest(data)==expected,'PINNED_SOURCE_DIFFERS')
            write(Path(scratch)/Path(name).name,data)
        template=read(Path(scratch)/'environments.json')
        require(template['enabled'] is False,'DEPLOYMENT_ALREADY_ENABLED')
        sys.path.insert(0,scratch)
        helper=importlib.import_module('private_iap')
        receipts=local(Path.home()/'work/jems-operations-recovery',True)
        folder=receipts/'private-dev-binding-229'
        folder.mkdir(mode=0o700,exist_ok=True)
        local(folder,True)
        fd=os.open(folder/'admin.lock',os.O_RDONLY|os.O_CREAT|os.O_NOFOLLOW,0o600)
        with os.fdopen(fd,'rb') as lock:
            fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
            print(json.dumps(install(folder,template,helper,ids)),flush=True)


if __name__=='__main__':
    try:
        main()
    except (Exception,KeyboardInterrupt) as exc:
        code=str(exc) if re.fullmatch('[A-Z][A-Z_0-9]{2,90}',str(exc)) else type(exc).__name__
        print(json.dumps({'status':'PRIVATE_DEV_BINDING_STOPPED','code':code}),flush=True)
        raise SystemExit(2)
