"""Verify or set the approved OAuth client at the nonproduction IAP web scope once."""
import argparse
import base64
import copy
from datetime import datetime, timezone
import fcntl
import getpass
import json
import os
from pathlib import Path
import re
import sys
import warnings

from admin_api import Http, SetupError
import recover_nonproduction as r

MAIN = '3c6a08fd80562c5114fdc0e652b5791f40b8d93c'
CLIENT = r.NUMBER + '-e2fvpbobikkbp68dbuijfclcgcm33un6.apps.googleusercontent.com'
BINDING = '6d5bed5a21744e42d0bec565fcc271b4558e2489248cc5357b33f3bde8f2e443'
PROJECT = 'projects/' + r.NUMBER
WEB = PROJECT + '/iap_web'
MASK = 'iapSettings.accessSettings.oauthSettings.clientId,iapSettings.accessSettings.oauthSettings.clientSecret'
PHASE = 'preflight'


def oauth(settings):
    block = settings.get('accessSettings', {}).get('oauthSettings', {})
    r.need(isinstance(block, dict) and 'clientSecret' not in block, 'UNEXPECTED_OAUTH_READ_MODEL')
    return block


def unrelated_digest(settings):
    # Ignore only the installed credential pair and its output-only fingerprint.
    value = copy.deepcopy(settings)
    access = value.get('accessSettings', {})
    block = access.get('oauthSettings', {})
    for field in ('clientId', 'clientSecretSha256'):
        block.pop(field, None)
    if not block:
        access.pop('oauthSettings', None)
    if not access:
        value.pop('accessSettings', None)
    return r.digest(value)


def client_state(settings):
    block = oauth(settings)
    client = block.get('clientId')
    r.need(client is None or isinstance(client, str), 'UNEXPECTED_OAUTH_READ_MODEL')
    if client:
        r.need(client == CLIENT, 'DIFFERENT_CLIENT_PRESERVED')
        return 'matched'
    r.need(not block.get('clientSecretSha256'), 'PARTIAL_CLIENT_PRESERVED')
    return 'empty'


def settings(api, resource):
    try:
        result = api.call('GET', 'v1/' + resource + ':iapSettings')
    except SetupError as error:
        scope = 'WEB' if resource == WEB else resource.split('/')[0].upper()
        http = re.search(r'HTTP (\d{3})$', str(error))
        raise r.Stop(scope + '_READ_' + ('HTTP_' + http[1] if http else 'TRANSPORT_OR_RESPONSE')) from None
    r.need(isinstance(result, dict) and result.get('name') == resource, 'SETTINGS_RESOURCE_UNVERIFIED')
    return result


def parents(crm, project):
    yield PROJECT
    parent = project.get('parent')
    seen = set()
    while parent:
        r.need(parent.get('type') in ('organization', 'folder') and re.fullmatch(r'[1-9][0-9]*', str(parent.get('id',''))),
               'PARENT_SCOPE_UNVERIFIED')
        resource = parent['type'] + 's/' + str(parent['id'])
        r.need(resource not in seen, 'PARENT_CYCLE')
        seen.add(resource)
        yield resource
        if parent['type'] == 'organization':
            return
        folder = crm.call('GET', 'v3/' + resource)
        ancestor = re.fullmatch(r'(folders|organizations)/([1-9][0-9]*)', folder.get('parent', ''))
        r.need(folder.get('name') == resource and ancestor, 'PARENT_SCOPE_UNVERIFIED')
        parent = {'type': ancestor[1][:-1], 'id': ancestor[2]}


def observe(api, crm, project):
    local = settings(api, WEB)
    if client_state(local) == 'matched':
        return local, WEB
    for scope in parents(crm, project):
        if client_state(settings(api, scope)) == 'matched':
            return local, scope
    return local, None


def get_secret():
    r.need(sys.stdin.isatty(), 'PRIVATE_ADMIN_TERMINAL_REQUIRED')
    with warnings.catch_warnings():
        # Fail closed if getpass cannot disable echo on this terminal.
        warnings.simplefilter('error', getpass.GetPassWarning)
        print('Continue only while no other administrator is editing these IAP settings.', flush=True)
        secret = getpass.getpass('Existing Jems DEV IAP client secret (hidden, Enter to stop): ')
    r.need(secret and len(secret) <= 2048 and secret.isascii() and all(32 < ord(c) < 127 for c in secret),
           'CLIENT_SECRET_NOT_PROVIDED_OR_INVALID')
    return secret


def reconcile(folder, api, crm, project, verify_main):
    global PHASE
    PHASE = 'read-web-and-inheritance'
    initial, match = observe(api, crm, project)
    intent_file = folder/'oauth-write-intent.json'
    intent = r.read_json(r.private_path(intent_file)) if intent_file.exists() else None
    if intent:
        r.need(intent['resource'] == WEB and intent['client_id'] == CLIENT and intent['mask'] == MASK,
               'PRIOR_INTENT_DIFFERS')
        r.need(match == WEB, 'PRIOR_WRITE_UNCONFIRMED_NO_RESUBMISSION')
    wrote = False
    if match is None:
        PHASE = 'private-input'
        secret = get_secret()
        verify_main()
        PHASE = 'final-empty-read'
        latest, match = observe(api, crm, project)
        r.need(initial == latest or match is not None, 'SETTINGS_CHANGED_DURING_REVIEW')
        if match is None:
            intent = {'resource': WEB, 'client_id': CLIENT, 'mask': MASK, 'other_settings_sha256': unrelated_digest(latest),
                      'expected_secret_sha256': r.sha(secret.encode())}
            r.write_new(intent_file, intent)
            PHASE = 'one-time-masked-patch'
            api.call('PATCH','v1/'+WEB+':iapSettings?updateMask='+MASK,
                     {'name':WEB,'accessSettings':{'oauthSettings':{'clientId':CLIENT,'clientSecret':secret}}})
            wrote = True
        del secret
    PHASE = 'verify-readback'
    current, match = observe(api, crm, project)
    r.need(match is not None, 'CLIENT_READBACK_UNCONFIRMED')
    if intent:
        r.need(match == WEB and unrelated_digest(current) == intent['other_settings_sha256'], 'OTHER_SETTINGS_CHANGED')
        fingerprint = oauth(current).get('clientSecretSha256')
        r.need(isinstance(fingerprint, str) and fingerprint, 'SECRET_FINGERPRINT_UNAVAILABLE')
        raw = bytes.fromhex(intent['expected_secret_sha256'])
        encodings = (raw.hex(), raw.hex().upper(), base64.b64encode(raw).decode(), base64.urlsafe_b64encode(raw).decode())
        r.need(fingerprint in {*encodings, *(value.rstrip('=') for value in encodings)}, 'SECRET_FINGERPRINT_DIFFERS')
    return {'status':'IAP_OAUTH_CLIENT_VERIFIED','project':r.PROJECT,'target':WEB,'client_source_scope':match,
            'client_id':CLIENT,'write_this_run':wrote,'other_settings_verified':bool(intent),
            'controller_enabled':False,'authenticated_invocation':'PENDING'}


def check_main():
    branch = json.loads(r.command(['gh','api','--hostname','github.com','repos/jzwyrzyk/family-game-factory/branches/main'],
                                  phase='GITHUB_PROTECTED_MAIN'))
    r.need(branch.get('protected') is True and branch['commit']['sha']==MAIN, 'PROTECTED_MAIN_CHANGED')


def run(source):
    os.umask(0o077)
    r.source_identity(source)
    check_main()
    folder = r.private_path(Path.home()/'work/jems-operations-recovery/private-dev-binding-229', directory=True)
    installed = r.read_json(r.private_path(folder/'installed.json'))
    r.need(installed['source']==MAIN and installed['environment']=='jems-nonproduction' and
           installed['status']=='PRIVATE_DEV_BINDING_INSTALLED' and installed['iap_audience']==CLIENT
           and installed['binding_sha256']==BINDING, 'PRIVATE_BINDING_RECEIPT_DIFFERS')
    # The same user ADC source already used by the approved recovery operators.
    identity = r.Reader()
    headers = {'x-goog-user-project':r.PROJECT}
    crm = Http('https://cloudresourcemanager.googleapis.com', identity.token, headers)
    api = Http('https://iap.googleapis.com', identity.token, headers)
    project = crm.call('GET','v1/projects/'+r.PROJECT)
    r.need(project.get('projectId')==r.PROJECT and str(project.get('projectNumber'))==r.NUMBER
           and project.get('lifecycleState')=='ACTIVE','PROJECT_IDENTITY_DIFFERS')
    with r.private_path(folder/'admin.lock').open('rb') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        result = reconcile(folder,api,crm,project,check_main)
        stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
        r.write_new(folder/('iap-web-oauth-'+stamp+'.json'),{**result,'operator_source':source})
        return result


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-sha',required=True)
    args=parser.parse_args()
    try:
        print(json.dumps(run(args.source_sha)))
    except (Exception,KeyboardInterrupt) as exc:
        code=str(exc) if re.fullmatch('[A-Z][A-Z_0-9]{2,90}',str(exc)) else type(exc).__name__
        if isinstance(exc,SetupError):
            http=re.search(r'HTTP (\d{3})$',str(exc))
            code='API_HTTP_'+http[1] if http else 'API_RESPONSE_OR_TRANSPORT_ERROR'
        print(json.dumps({'status':'IAP_OAUTH_STOPPED','phase':PHASE,'code':code,'automatic_retry':False}))
        raise SystemExit(2)
