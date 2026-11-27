"""Bind one protected diagnostic invocation to live accounts and the approved broker image."""
from datetime import datetime, timezone
import http.client
import hashlib
from pathlib import Path
import re
import subprocess
import time
import uuid
import zipfile

from admin_api import Http, SetupError, require
import broker_token_check as check
import github_operations as github
import native_broker_probe as probe
import production_activation as review

STEPS = ('Select diagnostic operation', 'Verify current main before requesting a Google credential',
         'Obtain an ID token for the private diagnostics broker', 'Obtain a five-minute IAM credential for the GitHub caller',
         'Test the four native token permissions', 'Retain the sanitized report')
SERVICE = 'jems-request-evidence'
PROJECT = check.setup.PROJECT
REGISTRY = f'us-east5-docker.pkg.dev/{PROJECT}/factory-services/request-broker@'


def snapshot(token, digest):
    headers = {'x-goog-user-project': PROJECT}
    ids = check.account_ids(Http(check.IAM, token, headers))
    cloud = Http('https://run.googleapis.com', token, headers)
    path = f'projects/{PROJECT}/locations/us-east5/services/{SERVICE}'
    service = cloud.call('GET', 'v2/' + path + '?fields=name,reconciling,trafficStatuses(revision,percent)')
    aliases = {path, path.replace(PROJECT, check.setup.NUMBER)}
    require(service.get('name') in aliases and not service.get('reconciling'), 'BROKER_SERVICE_UNVERIFIED')
    traffic = service.get('trafficStatuses', [])
    require(len(traffic) == 1 and traffic[0].get('percent') == 100, 'BROKER_TRAFFIC_UNVERIFIED')
    revision = traffic[0].get('revision', '')
    for alias in aliases:
        if revision.startswith(alias + '/revisions/'):
            revision = revision.removeprefix(alias + '/revisions/')
            break
    require(re.fullmatch(SERVICE + '-[a-z0-9-]{1,40}', revision), 'BROKER_REVISION_UNVERIFIED')
    data = cloud.call('GET', 'v2/' + path + '/revisions/' + revision + '?fields=name,uid,serviceAccount,containers(image)')
    require(data.get('name') in {a + '/revisions/' + revision for a in aliases} and data.get('uid') and
            data.get('serviceAccount') == check.setup.BROKER and data.get('containers') == [{'image':REGISTRY + digest}],
            'BROKER_IDENTITY_OR_DIGEST_UNVERIFIED')
    return {'accounts':ids,'revision':revision,'revision_uid':data['uid'],'digest':digest}


def verify(rows, token, main_sha, digest, journal_dir, *, reader=github.api, observe=snapshot,
           sleep=time.sleep, clock=time.monotonic):
    status = {'status':'NATIVE_SCOPE_UNVERIFIED'}
    try:
        problem = check.eligibility(rows)
        if problem:
            return {'status':problem}
        if all(r['passed'] for r in rows):
            return {'status':'DIRECT_CHECK_UNNEEDED'}
        require(re.fullmatch('[a-f0-9]{40}', main_sha) and re.fullmatch('sha256:[a-f0-9]{64}', digest), 'INVALID_PINS')

        def current_main():
            result = reader('GET', github.PREFIX + 'branches/main')
            require(result.get('protected') is True and result['commit']['sha'] == main_sha, 'MAIN_UNVERIFIED')

        status['status'] = 'PROTECTED_MAIN_UNVERIFIED'
        current_main()
        status['status'] = 'PROTECTED_CONTROLLER_BYTES_UNVERIFIED'
        for file in ('.github/workflows/' + github.WORKFLOW, 'scripts/ops/native_broker_probe.py',
                     'scripts/ops/request_evidence.py', 'scripts/ops/diagnose.py', 'ops/request-broker/main.py'):
            data = (review.ROOT / file).read_bytes()
            blob = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
            remote = reader('GET', github.PREFIX + 'contents/' + file + '?ref=' + main_sha)
            require(remote.get('type') == 'file' and remote.get('sha') == blob, 'CONTROLLER_BYTES_DIFFER')
        status['status'] = 'NATIVE_INVENTORY_UNVERIFIED'
        before = observe(token, digest)
        challenge = uuid.uuid4().hex
        started = datetime.now(timezone.utc).replace(microsecond=0)
        # Store the unique challenge before dispatch. Never repeat an uncertain dispatch.
        review.private_json(Path(journal_dir) / ('native-intent-' + challenge + '.json'),
                            {'challenge':challenge,'source':main_sha,'inventory':before,'started':started.isoformat()})
        status.update(status='DISPATCH_UNCONFIRMED',challenge=challenge)
        dispatch = reader('POST', github.PREFIX + 'actions/workflows/' + github.WORKFLOW + '/dispatches',
                          {'ref':'main','return_run_details':True,'inputs':{'operation':'token-boundary','challenge':challenge}})
        run_id = str(dispatch['workflow_run_id'])
        require(re.fullmatch('[1-9][0-9]{0,19}', run_id), 'INVALID_RUN_ID')
        status.update(status='NATIVE_RUN_INCOMPLETE',run_id=run_id)
        deadline = clock() + 420
        while clock() < deadline:
            run = reader('GET', github.PREFIX + 'actions/runs/' + run_id)
            if run.get('status') == 'completed':
                break
            sleep(8)
        else:
            return status
        status['status'] = 'NATIVE_RECEIPT_UNVERIFIED'
        report, receipt = github.read_attempt(run_id, main_sha, STEPS, reader)
        require(receipt['attempt'] == '1' and set(report) == {
            'operation','challenge','workflow','observed_at_utc','broker_revision','caller','broker'} and
            report['operation'] == 'token-boundary' and report['challenge'] == challenge and
            all(probe.valid_rows(report[who]) for who in ('caller','broker')), 'INVALID_NATIVE_REPORT')
        observed = github.evidence.utc(report['observed_at_utc'])
        require(started <= observed <= datetime.now(timezone.utc), 'STALE_NATIVE_REPORT')
        status.update(artifact_sha256=receipt['artifact_sha256'],workflow_source=main_sha,broker_digest=digest,
                      broker_revision=before['revision'],observed_at_utc=report['observed_at_utc'])
        outcomes = [report['caller' if r['principal'] == check.setup.CALLER else 'broker']
                          [r['fullResourceName'].split('/')[-1].split('@')[0]] for r in rows]
        if 'PRESENT' in outcomes:
            status['status'] = 'REPORTED_TOKEN_CREATION_PERMISSION'
            status['reported_rows'] = [row['row'] for row, outcome in zip(rows, outcomes) if outcome == 'PRESENT']
            return status
        require(report['broker_revision'] == before['revision'], 'BROKER_REVISION_DIFFERS')
        if receipt['workflow_conclusion'] != 'success' or not receipt['job_verified'] or 'UNKNOWN' in outcomes:
            return status
        current_main()
        status['status'] = 'NATIVE_INVENTORY_CHANGED_OR_UNVERIFIED'
        require(observe(token, digest) == before, 'INVENTORY_CHANGED')
        for row in rows:
            if not row['passed']:
                row.update(troubleshooter_status=row.pop('error_status'),troubleshooter_observed=row['observed'],
                           stage='native_test_iam_permissions', observed='CANNOT_ACCESS', passed=True,
                           principal_unique_id=before['accounts'][row['principal']],
                           target_unique_id=before['accounts'][row['fullResourceName'].removeprefix(check.PREFIX)])
        status['status'] = 'NATIVE_PERMISSIONS_VERIFIED'
    except (SetupError, OSError, ValueError, TypeError, AttributeError, KeyError, IndexError,
            http.client.HTTPException, subprocess.SubprocessError, zipfile.BadZipFile):
        pass
    return status
