"""One-time activation of the two reviewed existing nonproduction federation resources."""
import argparse
from datetime import datetime, timezone
import errno
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import tempfile

import activate_reviewed_broker_coverage as broker
import prepare_accepted_federation_plan as planner
import recover_nonproduction as r
from verify_nonproduction_completion import verify_budget_refresh

PLAN = 'd4802a183aa00c9bb6891a7a4a73bf38cab3946e0e52916c83e6c09ccfd6a1b4'
STATE = '2d6e11afc58d9ec22c48d1994ad515cedce5299ba7bf16b97404c4aa547e61d1'
RECOVERY = 'c77c0320fd13eff89de5ae5956100c769e473c655373cc99aa40df6fffc411ab'
SCRATCH = Path('/tmp/jems-federation.VOZzf2ZN')
PLANNING = SCRATCH/'federation-plan.eeav3t5e'
FAILED = 'federation-plan.l7qm29e0'
PHASE = 'preflight'


def phase(value):
    global PHASE
    PHASE = value


def private_bytes(path):
    return r.private_path(path).read_bytes()


def cache_inventory(root):
    manifest = {}
    for path in sorted(root.rglob('*')):
        mode = path.lstat().st_mode
        r.need(not stat.S_ISLNK(mode), 'CACHE_LINK_UNEXPECTED')
        if stat.S_ISDIR(mode):
            continue
        relative = path.relative_to(root).as_posix()
        r.need(stat.S_ISREG(mode) and path.stat().st_uid == os.getuid() and re.fullmatch(
            r'registry\.terraform\.io/hashicorp/google(?:-beta)?/7\.46\.2/linux_amd64/'
            r'(?:LICENSE\.txt|terraform-provider-google(?:-beta)?_v7\.46\.2(?:_x[0-9]+)?)', relative),
            'CACHE_CONTENT_UNEXPECTED')
        with path.open('rb') as stream:
            digest = hashlib.sha256()
            for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                digest.update(chunk)
        manifest[relative] = digest.hexdigest()
    return manifest


def relocate_cache(failed, scratch):
    r.private_path(failed, directory=True)
    r.need(not any((failed/name).exists() for name in ('federation.tfplan','review.json')), 'FAILED_ATTEMPT_CHANGED')
    cache = failed/'.terraform/providers'
    r.need(cache.resolve() == cache and scratch.resolve() == scratch, 'CACHE_PATH_CHANGED')
    backup = scratch/'failed-attempt-provider-cache'
    receipt = scratch/'cache-copy.json'
    if not receipt.exists():
        before = cache_inventory(cache)
        r.need(before and not backup.exists(), 'CACHE_COPY_NEEDS_REVIEW')
        shutil.copytree(cache, backup, symlinks=True)
        r.need(cache_inventory(backup) == before == cache_inventory(cache), 'CACHE_COPY_DIFFERS')
        r.write_new(receipt, before)
    verified = r.read_json(r.private_path(receipt))
    r.need(verified and cache_inventory(backup) == verified, 'CACHE_BACKUP_DIFFERS')
    if cache.exists():
        remaining = cache_inventory(cache)
        r.need(all(verified.get(k) == v for k,v in remaining.items()), 'CACHE_CHANGED')
        # Only the fixed failed-attempt cache may be removed after byte-for-byte copying.
        shutil.rmtree(cache)
    return backup


def verify_rows(plan, expected, activated):
    rows = plan['resource_changes']
    managed = {row['address']:row['change'] for row in rows if row['mode']=='managed'}
    r.need(len(expected)==27 and set(managed)==expected and len(managed)==sum(row['mode']=='managed' for row in rows)
           and plan['terraform_version']=='1.13.5' and plan['complete'] is True and plan['errored'] is False
           and not plan.get('deferred_changes') and [c['status'] for c in plan['checks']]==['pass']*3,
           'PLAN_SCOPE_DIFFERS')
    for row in rows:
        change = row['change']
        update = not activated and row['address'] in (planner.POOL, planner.PROVIDER)
        r.need(change['actions'] == (['update'] if update else ['no-op']) and not row.get('previous_address')
               and not change.get('importing') and not change.get('replace_paths'), 'PLAN_ACTION_DIFFERS')
    for name in (planner.POOL, planner.PROVIDER):
        change = managed[name]
        r.need(change['after']['disabled'] is False and (activated or (
            change['before']['disabled'] is True and {**change['before'],'disabled':False} == change['after'])),
            'FEDERATION_CONFIG_DIFFERS')
    r.need(all(v['actions']==['no-op'] for v in plan.get('output_changes',{}).values()), 'OUTPUT_CHANGE')
    if not activated or plan.get('resource_drift'):
        verify_budget_refresh(plan.get('resource_drift',[]))


def run(source, approval):
    os.umask(0o077)
    r.need(approval == PLAN, 'EXACT_APPROVAL_REQUIRED')
    r.need(os.environ.get('TF_WORKSPACE','default')=='default', 'TERRAFORM_WORKSPACE_DIFFERS')
    r.source_identity(source)
    scratch = r.private_path(SCRATCH, directory=True)
    work = Path.home()/'work'
    parent = r.private_path(work/'jems-nonprod-state/partial-recovery', directory=True)
    receipts = r.private_path(work/'jems-operations-recovery', directory=True)
    intent = parent/'federation-apply-started.json'
    with r.private_path(parent/'operator.lock').open('rb') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        r.need(not intent.exists(), 'APPLY_ALREADY_STARTED_INSPECT_DURABLE_RECEIPT')
        marker = r.read_json(r.private_path(parent/'apply-started'))
        original = r.private_path(marker['successor'], directory=True)
        r.need(original.parent==parent and marker['approval']==RECOVERY, 'SUCCESSOR_MARKER_DIFFERS')
        prior = r.read_json(r.private_path(original/'reviewed-recovery.json'))
        completed = r.read_json(r.private_path(original/'completed.json'))
        r.need(r.digest(prior)==RECOVERY and completed['successor_state_sha256']==STATE
               and completed['status']=='RECOVERED_DISABLED_NOT_ACTIVATED', 'RECOVERY_EVIDENCE_DIFFERS')
        saved = private_bytes(PLANNING/'federation.tfplan')
        r.need(r.sha(saved)==PLAN, 'PLAN_HASH_DIFFERS')
        inputs = {}
        for name in ('terraform.tfstate','main.tf','.terraform.lock.hcl','terraform.tfvars.json'):
            data = private_bytes(original/name)
            r.need(r.sha(data)==(STATE if name=='terraform.tfstate' else prior['inputs'][name])
                   and private_bytes(PLANNING/name)==data, 'INPUT_BYTES_DIFFER')
            inputs[name] = data
        state = json.loads(inputs['terraform.tfstate'])
        expected = r.state_addresses(state)
        coverage = r.read_json(r.private_path(receipts/('native-broker-'+broker.op.SOURCE)/
                                               'dated-coverage-nov24-1520/complete.json'))
        r.need(coverage['status']=='DATED_BROKER_COVERAGE_ACCEPTED' and coverage['counts']==broker.COUNTS
               and broker.coverage.instant(coverage['expires_utc'])>datetime.now(timezone.utc), 'COVERAGE_UNAVAILABLE')
        reader = r.Reader()
        broker.op.integrated(broker.MAIN)
        providers = r.page_list(reader, 'iam', 'v1/'+r.POOL_NAME+'/providers?showDeleted=true', 'workloadIdentityPoolProviders')
        r.need(len(providers)==1 and providers[0]['name']==r.PROVIDER_NAME, 'PROVIDER_INVENTORY_DIFFERS')
        for name in (r.POOL_NAME, r.PROVIDER_NAME):
            live = reader.call('iam','GET','v1/'+name)
            r.need(live['name']==name and live['state']=='ACTIVE' and live.get('disabled') is True, 'LIVE_STATE_DIFFERS')
        r.need(json.loads(r.tf(PLANNING,'version','-json'))['terraform_version']=='1.13.5', 'TERRAFORM_VERSION_DIFFERS')
        reviewed = json.loads(r.tf(PLANNING,'show','-json','federation.tfplan'))
        verify_rows(reviewed,expected,False)
        phase('fresh-plan-check')
        fresh = Path(tempfile.mkdtemp(prefix='fresh.',dir=scratch))/'fresh.tfplan'
        r.tf(PLANNING,'plan','-input=false','-var=enable_federation=true','-out='+str(fresh))
        refreshed = json.loads(r.tf(PLANNING,'show','-json',str(fresh)))
        r.need(r.plan_identity(refreshed)==r.plan_identity(reviewed), 'FRESH_PLAN_DIFFERS')
        phase('cache-relocation')
        backup = relocate_cache(receipts/FAILED, scratch)
        # Retain room for Terraform's state backup, post-plan, journal and lock.
        reserve = max(8*1024*1024, 8*(len(saved)+sum(map(len,inputs.values()))))
        r.need(shutil.disk_usage(parent).free>=reserve, 'DURABLE_SPACE_INSUFFICIENT')
        phase('durable-preparation')
        active = Path(tempfile.mkdtemp(prefix='federation-active.',dir=parent))
        for name,data in inputs.items():
            r.write_new(active/name,data)
        r.write_new(active/'federation.tfplan',saved)
        r.tf(active,'init','-input=false','-lockfile=readonly','-backend=false',
             '-plugin-dir='+str(original/'.terraform/providers'))
        r.write_new(active/'activation.auto.tfvars.json', {'enable_federation':True})
        r.need(r.sha(private_bytes(active/'federation.tfplan'))==PLAN and private_bytes(active/'terraform.tfstate')==
               private_bytes(original/'terraform.tfstate')==inputs['terraform.tfstate'] and
               shutil.disk_usage(active).free>=reserve and not (original/'.terraform.tfstate.lock.info').exists(),
               'DURABLE_PRECONDITION_CHANGED')
        broker.op.integrated(broker.MAIN)
        phase('one-time-apply')
        # This durable pointer selects the only state directory for any post-apply reconciliation.
        r.write_new(intent, {'plan_sha256':PLAN,'baseline_state_sha256':STATE,'authoritative_directory':str(active),
                             'source':source,'provider_cache_copy':str(backup)})
        r.tf(active,'apply','-input=false','federation.tfplan')
        phase('readback')
        current = r.read_json(r.private_path(active/'terraform.tfstate'))
        r.need(current['lineage']==state['lineage'] and current['serial']>state['serial']
               and r.state_addresses(current)==expected, 'APPLIED_STATE_DIFFERS')
        r.tf(active,'plan','-input=false','-detailed-exitcode','-out=post-activation.tfplan',ok=(0,2))
        post = json.loads(r.tf(active,'show','-json','post-activation.tfplan'))
        verify_rows(post,expected,True)
        for name in (r.POOL_NAME, r.PROVIDER_NAME):
            live = reader.call('iam','GET','v1/'+name)
            r.need(live['name']==name and live['state']=='ACTIVE' and live.get('disabled',False) is False,
                   'FEDERATION_READBACK_DIFFERS')
        r.need(r.sha(private_bytes(original/'terraform.tfstate'))==STATE, 'RECOVERY_SNAPSHOT_CHANGED')
        result = {'status':'FEDERATION_ENABLED_VERIFIED','plan_sha256':PLAN,'managed_instances':len(expected),
                  'post_apply_plan':'NO_CHANGES','project':r.PROJECT,'authoritative_directory':str(active),
                  'state_sha256':r.sha(private_bytes(active/'terraform.tfstate')),
                  'post_plan_sha256':r.sha(private_bytes(active/'post-activation.tfplan')),
                  'baseline_state_sha256':STATE,'dev_deployed':False}
        r.write_new(active/'completed.json',result)
        print(json.dumps(result))


if __name__=='__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-sha', required=True)
    parser.add_argument('--approve-plan-sha256', required=True)
    args = parser.parse_args()
    try:
        run(args.source_sha,args.approve_plan_sha256)
    except Exception as exc:
        code = errno.errorcode.get(exc.errno,'OS_ERROR') if isinstance(exc,OSError) else str(exc)
        print(json.dumps({'status':'FEDERATION_STOPPED','phase':PHASE,
                          'code':code if re.fullmatch('[A-Z][A-Z_0-9]{2,80}',code) else type(exc).__name__,
                          'automatic_retry':False}),flush=True)
        raise SystemExit(2)
