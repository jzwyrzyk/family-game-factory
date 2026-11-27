"""Produce a private, unapplied Terraform activation plan after diagnostic acceptance."""
import json
import os
from pathlib import Path
import tempfile

import native_broker_execution as op
import recover_nonproduction as records
from admin_api import require

POOL = 'google_iam_workload_identity_pool.github'
PROVIDER = 'google_iam_workload_identity_pool_provider.github'


def summarize(plan):
    managed = [r for r in plan['resource_changes'] if r['mode']=='managed']
    actions = {r['address']:r['change'] for r in managed if r['change']['actions']!=['no-op']}
    expected = (len(managed)==27 and set(actions)=={POOL,PROVIDER} and plan.get('complete') is True
                and not plan.get('errored') and not plan.get('deferred_changes') and
                all(r['status']=='pass' for r in plan.get('checks',[])))
    for change in actions.values():
        before,after = change.get('before'),change.get('after')
        expected = expected and change['actions']==['update'] and isinstance(before,dict) and isinstance(after,dict)
        if expected:
            expected = (before.get('disabled') is True and after.get('disabled') is False and
                        {**before,'disabled':False}==after and not change.get('importing') and not change.get('replace_paths'))
    return {'expected_disabled_field_updates':expected, 'managed_instances':len(managed),
            'managed_changes':{key:value['actions'] for key,value in actions.items()},
            'refresh_addresses':[r['address'] for r in plan.get('resource_drift',[])],
            'changed_outputs':[k for k,v in plan.get('output_changes',{}).items() if v['actions']!=['no-op']],
            'checks':[r['status'] for r in plan.get('checks',[])]}


def main():
    os.umask(0o077)
    directory = Path(os.environ['JEMS_OPERATION_JOURNAL']).parent
    # Planning outputs may use a private /tmp directory when persistent home is
    # full. The accepted administrative receipt always comes from its original home.
    receipts = Path.home() / 'work/jems-operations-recovery'
    coverage = op.saved(receipts/('native-broker-'+op.SOURCE)/'dated-coverage-nov24-1520','complete.json')
    require(coverage['status']=='DATED_BROKER_COVERAGE_ACCEPTED' and len(coverage['runs'])==3,
            'BROKER_ACCEPTANCE_REQUIRED')
    parent = Path.home()/'work/jems-nonprod-state/partial-recovery'
    marker=records.read_json(records.private_path(parent/'apply-started'))
    successor=records.private_path(marker['successor'],directory=True)
    require(successor.parent==parent and marker['approval']=='c77c0320fd13eff89de5ae5956100c769e473c655373cc99aa40df6fffc411ab',
            'SUCCESSOR_MARKER_DIFFERS')
    completed=op.saved(successor,'completed.json')
    require(completed['status']=='RECOVERED_DISABLED_NOT_ACTIVATED' and completed['state_instances']==27
            and completed['post_apply_plan']=='NO_CHANGES' and completed['federation_enabled'] is False,
            'SUCCESSOR_COMPLETION_UNVERIFIED')
    prior=op.saved(successor,'reviewed-recovery.json')
    require(records.digest(prior)==marker['approval'], 'SUCCESSOR_RECEIPT_DIFFERS')
    # Use a new directory with only the reviewed configuration, provider lockfile,
    # variables and exact completed state. The authoritative successor stays untouched.
    pending=Path(tempfile.mkdtemp(prefix='federation-plan.', dir=directory))
    for name in ('main.tf','.terraform.lock.hcl','terraform.tfvars.json','terraform.tfstate'):
        data=records.private_path(successor/name).read_bytes()
        expected=completed['successor_state_sha256'] if name=='terraform.tfstate' else prior['inputs'][name]
        require(records.sha(data)==expected, 'SUCCESSOR_BYTES_CHANGED')
        records.write_new(pending/name,data)
    records.Reader()  # Enforce the existing ADC and Terraform override restrictions.
    def call(args,phase):
        return records.command(['terraform',*args],pending,phase,folder=pending)
    require(json.loads(call(['version','-json'],'VERSION'))['terraform_version']=='1.13.5','TERRAFORM_VERSION_DIFFERS')
    mirror = successor/'.terraform/providers'
    require(mirror.is_dir(), 'EXISTING_PROVIDER_DIRECTORY_MISSING')
    call(['init','-input=false','-lockfile=readonly','-backend=false','-plugin-dir='+str(mirror)],'FEDERATION_INIT')
    binary=pending/'federation.tfplan'
    call(['plan','-input=false','-var=enable_federation=true','-out='+str(binary)],'FEDERATION_PLAN')
    plan=json.loads(call(['show','-json',str(binary)],'FEDERATION_SHOW'))
    result={'status':'FEDERATION_PLAN_AWAITING_REVIEW','applied':False,'plan_sha256':records.sha(binary.read_bytes()),
            'private_plan':str(binary),'successor_state_sha256':completed['successor_state_sha256'],**summarize(plan)}
    op.keep(pending,'review.json',result)
    print(json.dumps(result))


if __name__=='__main__':
    try:
        main()
    except Exception as exc:
        import re
        import errno
        code=errno.errorcode.get(exc.errno,'OS_ERROR') if isinstance(exc,OSError) else str(exc)
        print(json.dumps({'status':'FEDERATION_PLAN_STOPPED','code':code if re.fullmatch('[A-Z][A-Z_0-9]{2,80}',code) else type(exc).__name__,'applied':False}))
        raise SystemExit(2)
