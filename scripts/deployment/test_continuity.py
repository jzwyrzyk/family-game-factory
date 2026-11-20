"""Offline tests: durable AI activation must be audited, not re-enabled on a web release."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('jems_continuity', Path(__file__).with_name('continuity.py'))
c = importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)

P = 'a' * 40
OLD = 'b' * 40
REPO = c.PRIVATE_REPO

def service(name, paid='false', adult=True):
    env = [{'name':'FACTORY_ACTIONS_APPROVED','value':paid}]
    if name == 'factory-gateway' and adult:
        env += [{'name':flag,'value':'true'} for flag in c.ADULT_FLAGS]
    return {
        'status':{'conditions':[{'type':'Ready','status':'True'}],
                  'latestReadyRevisionName':name+'-00001',
                  'traffic':[{'revisionName':name+'-00001','percent':100}]},
        'spec':{'template':{'spec':{
            'containers':[{'env':env,
                'volumeMounts':[{'name':'active-config','mountPath':'/var/run/factory-config'}]
                    if name == 'factory-gateway' else []}],
            'volumes':[{'name':'active-config',
                        'secret':{'secretName':'factory-gateway-private-config',
                                  'items':[{'key':'17'}]}}]
                    if name == 'factory-gateway' else []
        }}}
    }

def snapshot(paid='false'):
    return {n:service(n,paid if n == 'factory-gateway' else 'false')
            for n in ('factory-gateway','factory-preview','factory-coach-private')}

def wif(sha=P):
    return {'state':'ACTIVE','attributeCondition':(
        "assertion.repository_owner_id=='357047835' && "
        "assertion.repository_id=='1458899834' && "
        "assertion.ref=='refs/heads/main' && "
        "assertion.workflow_ref=='family-game-factory-lab/family-game-factory-worker/.github/workflows/factory-private.yml@refs/heads/main' && "
        "assertion.workflow_sha=='"+sha+"'")}

def config(active):
    return {'active':active,'approval':{'enabled':active},
            'workerApprovedSha':P,'workerRepository':REPO,
            'sessionKey':'not-logged','previewKey':'not-logged'}

class ContinuityTests(unittest.TestCase):
    def test_audit_inactive_state_without_secret_read(self):
        result=c.assess(snapshot(),wif(),P,P,P,'false',P,'inactive')
        self.assertEqual(result['generation'],'inactive')
        self.assertEqual(result['mutations'],0)
        self.assertEqual(result['privateConfig'],'not inspected')
    def test_audit_active_state_with_private_config(self):
        result=c.assess(snapshot('true'),wif(),P,P,P,'true',P,'active',config(True))
        self.assertEqual(result['generation'],'active')
        self.assertEqual(result['privateConfig'],'verified')
        self.assertNotIn('sessionKey',str(result))
    def test_active_claim_requires_private_config_evidence(self):
        with self.assertRaisesRegex(c.ContinuityError,'ACTIVE_PRIVATE_CONFIG_UNVERIFIED'):
            c.assess(snapshot('true'),wif(),P,P,P,'true',P,'active')
    def test_pending_or_mismatched_cloud_and_repo_approval_fails(self):
        for state,approval in [('true','false'),('false','true')]:
            with self.assertRaisesRegex(c.ContinuityError,'PAID_SWITCH_DRIFT'):
                c.assess(snapshot(state),wif(),P,P,P,approval,P,'active',config(True))
    def test_drift_rejects_old_trust_and_wrong_worker_pins(self):
        with self.assertRaisesRegex(c.ContinuityError,'WIF_TRUST_DRIFT'):
            c.assess(snapshot(),wif(OLD),P,P,P,'false',P,'inactive')
        for refs in [(OLD,P,P),(P,OLD,P),(P,P,OLD)]:
            with self.assertRaisesRegex(c.ContinuityError,'PRIVATE_WORKER_PIN_DRIFT'):
                c.assess(snapshot(),wif(),*refs,'false',P,'inactive')
        bad=wif();bad['attributeCondition'] += " || assertion.workflow_sha=='"+OLD+"'"
        with self.assertRaisesRegex(c.ContinuityError,'WIF_TRUST_DRIFT'):
            c.assess(snapshot(),bad,P,P,P,'false',P,'inactive')
        not_equal=wif()
        not_equal['attributeCondition']=not_equal['attributeCondition'].replace(
            "assertion.repository_owner_id=='357047835'",
            "assertion.repository_owner_id!='357047835'")
        with self.assertRaisesRegex(c.ContinuityError,'WIF_TRUST_DRIFT'):
            c.assess(snapshot(),not_equal,P,P,P,'false',P,'inactive')
    def test_distinct_service_readiness_and_adult_authorization(self):
        s=snapshot()
        s['factory-preview']['status']['traffic'][0]['percent']=20
        with self.assertRaisesRegex(c.ContinuityError,'SERVICE_READINESS_DRIFT'):
            c.assess(s,wif(),P,P,P,'false',P,'inactive')
        s=snapshot();s['factory-gateway']=service('factory-gateway',adult=False)
        with self.assertRaisesRegex(c.ContinuityError,'ADULT_POLICY_DRIFT'):
            c.assess(s,wif(),P,P,P,'false',P,'inactive')
    def test_historical_cloud_run_revisions_are_not_live_traffic_drift(self):
        # Real Cloud Run reports old revision entries with null traffic; only
        # the newest, ready revision actually receives 100%.
        active=snapshot()
        gateway=active['factory-gateway']
        current=gateway['status']['latestReadyRevisionName']
        gateway['status']['traffic']=[
            {'revisionName':'factory-gateway-00003-old'},
            {'revisionName':'factory-gateway-00007-old','percent':None},
            {'revisionName':current,'percent':100},
        ]
        self.assertTrue(c.ready(gateway))
        self.assertEqual(c.assess(active,wif(),P,P,P,'false',P,'inactive')['result'],
                         'CURRENT_STATE_VERIFIED')
        # Two positive traffic destinations are not a single accepted release.
        gateway['status']['traffic'][0]['percent']=1
        self.assertFalse(c.ready(gateway))
        # A serving revision that is not the ready revision is also rejected.
        gateway['status']['traffic']=[{'revisionName':'other-revision','percent':100}]
        self.assertFalse(c.ready(gateway))

    def test_exact_pinned_version_not_latest(self):
        self.assertEqual(c.mounted_config(service('factory-gateway')),
                         ('factory-gateway-private-config','17'))
        x=service('factory-gateway')
        x['spec']['template']['spec']['volumes'][0]['secret']['items'][0]['key']='latest'
        self.assertIsNone(c.mounted_config(x))
    def test_resolve_only_active_mount_with_unmounted_old_secret_versions(self):
        gateway=service('factory-gateway')
        spec=gateway['spec']['template']['spec']
        # This exactly models the owner-observed 2026-11-20 gateway:
        # version 2 remains as an orphaned volume, while version 3 is mounted.
        spec['volumes']=[
            {'name':'factory-gateway-private-config-ped-cut',
             'secret':{'secretName':'factory-gateway-private-config',
                       'items':[{'key':'2'}]}},
            {'name':'factory-gateway-private-config-mis-yek',
             'secret':{'secretName':'factory-gateway-private-config',
                       'items':[{'key':'3'}]}}
        ]
        spec['containers'][0]['volumeMounts']=[
            {'name':'factory-gateway-private-config-mis-yek',
             'mountPath':'/var/run/factory-config'}
        ]
        self.assertEqual(c.mounted_config(gateway),
                         ('factory-gateway-private-config','3'))
        # Unmounted historical versions may not be silently chosen.
        spec['containers'][0]['volumeMounts']=[]
        self.assertIsNone(c.mounted_config(gateway))
        # A mount to the wrong volume must not trigger a guess.
        spec['containers'][0]['volumeMounts']=[
            {'name':'missing','mountPath':'/var/run/factory-config'}]
        self.assertIsNone(c.mounted_config(gateway))
        # Two conflicting active mounts must be rejected.
        spec['containers'][0]['volumeMounts']=[
            {'name':'factory-gateway-private-config-ped-cut',
             'mountPath':'/var/run/factory-config'},
            {'name':'factory-gateway-private-config-mis-yek',
             'mountPath':'/var/run/factory-config'}]
        self.assertIsNone(c.mounted_config(gateway))
        # Correct mount with an unpinned/latest version also fails closed.
        spec['containers'][0]['volumeMounts']=spec['containers'][0]['volumeMounts'][1:]
        spec['volumes'][1]['secret']['items'][0]['key']='latest'
        self.assertIsNone(c.mounted_config(gateway))

    def test_cli_only_reads_and_never_discloses_configuration(self):
        commands=[]
        def read(args):
            commands.append(args)
            if args[:3]==['gcloud','run','services']:
                return service(args[4])
            return wif()
        def run(args):
            commands.append(args)
            if args[:3]==['gh','api','repos/'+REPO+'/git/ref/heads/main']:return P
            if args[:2]==['gh','api']:return P
            if args[:4]==['gh','variable','get','FACTORY_PRIVATE_WORKER_SHA']:return P
            if args[:4]==['gh','variable','get','FACTORY_ACTIONS_APPROVED']:return 'false'
            raise AssertionError(args)
        import io
        from contextlib import redirect_stdout
        out=io.StringIO()
        with redirect_stdout(out):
            c.main(['--private-worker-sha',P], run=run, read_json=read)
        self.assertIn('CURRENT_STATE_VERIFIED',out.getvalue())
        self.assertNotIn('not-logged',out.getvalue())
        for a in commands:
            self.assertNotIn(a[0:2],[
                ['gcloud','run','deploy'],['gcloud','run','services update'],
                ['gcloud','secrets','versions add'],['gh','variable set']])
            self.assertNotIn('update', ' '.join(a))
        self.assertFalse(any('secrets' in a for a in commands))

if __name__=='__main__':
    unittest.main()
