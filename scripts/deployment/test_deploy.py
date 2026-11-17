import argparse
import copy
import importlib.util
import io
import json
from pathlib import Path
import unittest
from unittest.mock import patch
from contextlib import redirect_stdout

spec = importlib.util.spec_from_file_location('deployment', Path(__file__).with_name('deploy.py'))
d = importlib.util.module_from_spec(spec)
spec.loader.exec_module(d)
IMAGE = 'europe-west1-docker.pkg.dev/' + d.PROJECT + '/factory-services/gateway@sha256:' + 'a' * 64
PREVIEW = IMAGE.replace('/gateway@', '/preview@')
URLS = {'gateway':'https://factory-gateway-123.europe-west1.run.app', 'preview':'https://factory-preview-123.europe-west1.run.app'}
# Cloud Run also returns hash-style URLs.
URLS = {'gateway':'https://factory-gateway-abc-ew.a.run.app', 'preview':'https://factory-preview-abc-ew.a.run.app'}

class FakeCloud:
    def __init__(self):
        self.calls=[]
        self.services={}
        self.policies={d.PEM:{'bindings':[]}}
        self.secrets={}
        self.project={'bindings':[]}
    def run(self,*args,data=None,parse=True):
        self.calls.append((args,data))
        if args[:2]==('services','list'):
            return [{'config':{'name':x}} for x in d.REQUIRED_APIS]
        if args[:2]==('firestore','databases'): return {}
        if args[:2]==('projects','get-ancestors'):return [{'type':'project','id':'123'}]
        if args[:2]==('projects','get-iam-policy'):return self.project
        if args[:2]==('projects','add-iam-policy-binding'):
            self.project['bindings'].append({'role':args[args.index('--role')+1],'members':[args[args.index('--member')+1]]});return {}
        if args[:3]==('iam','service-accounts','describe'):return {'disabled':False}
        if args[:3]==('iam','service-accounts','keys'):return []
        if args[:2]==('secrets','describe'):return {}
        if args==('secrets','list'):return [{'name':'projects/p/secrets/'+n} for n in self.policies]
        if args[:2]==('secrets','get-iam-policy'):return self.policies[args[2]]
        if args[:2]==('secrets','create'):self.policies[args[2]]={'bindings':[]};return {}
        if args[:2]==('secrets','add-iam-policy-binding'):
            self.policies[args[2]]['bindings']=[{'role':'roles/secretmanager.secretAccessor','members':[args[args.index('--member')+1]]}];return {}
        if args[:3]==('secrets','versions','list'):return [{'name':'projects/p/secrets/key/versions/7'}]
        if args[:3]==('secrets','versions','add'):
            self.secrets[args[3]]=json.loads(data);return {'name':'projects/p/secrets/config/versions/8'}
        if args[:3]==('secrets','versions','access'):
            return json.dumps(self.secrets[args[args.index('--secret')+1]])
        if args[:3]==('run','services','list'):return list(self.services.values())
        if args[:2]==('run','deploy'):
            kind=args[2].removeprefix('factory-')
            env=[{'name':p.split('=')[0],'value':p.split('=')[1]} for p in args[args.index('--set-env-vars')+1].split(',')]
            mounts=[]
            if '--set-secrets' in args:
                for item in args[args.index('--set-secrets')+1].split(','):
                    name,version=item.split('=')[1].split(':')
                    mounts.append({'secret':{'secretName':name,'items':[{'key':version}]}})
            self.services[args[2]]={'metadata':{'name':args[2],'labels':{'factory-deployment':'assignment-003'}},'status':{'url':URLS[kind],'conditions':[{'type':'Ready','status':'True'}]},'spec':{'template':{'metadata':{'annotations':{'autoscaling.knative.dev/minScale':'0','autoscaling.knative.dev/maxScale':'1'}},'spec':{'serviceAccountName':args[args.index('--service-account')+1],'containers':[{'image':args[args.index('--image')+1],'env':env}],'volumes':mounts}}}}
            return {}
        if args[:3]==('run','services','describe'):return self.services[args[3]]
        if args[:3] in [('run','services','add-iam-policy-binding'),('run','services','update-traffic')]:return {}
        raise AssertionError(args)

class DeploymentTests(unittest.TestCase):
    def test_offline_default_and_explicit_mutation_boundary(self):
        cloud=FakeCloud()
        with redirect_stdout(io.StringIO()):d.main(['--region','europe-west1'],cloud)
        self.assertEqual(cloud.calls,[])
        with self.assertRaises(d.SafeError):d.main(['deploy','--region','europe-west1'],cloud)
        self.assertEqual(cloud.calls,[])
        with self.assertRaises(d.SafeError):d.main(['deploy','--execute','--region','europe-west1','--gateway-image','mutable:latest'],cloud)
        self.assertEqual(cloud.calls,[])

    def test_distinct_configuration_without_pem_and_repeatable_signing_keys(self):
        self.assertEqual(d.origin('https://factory-gateway-123.europe-west1.run.app'),'https://factory-gateway-123.europe-west1.run.app')
        c=d.configuration(*URLS.values())
        self.assertNotIn('sessionKey',c['preview']);self.assertNotIn('githubPrivateKeyFile',c['preview'])
        self.assertNotIn('githubPrivateKey',c['gateway']);self.assertFalse(c['gateway']['active'])
        self.assertFalse(c['gateway']['approval']['enabled']);self.assertEqual(c['gateway']['approvedSha'],d.WORKER)
        self.assertNotEqual(c['gateway']['sessionKey'],c['preview']['previewKey'])
        again=d.configuration(*URLS.values(),old=c['gateway'])
        self.assertEqual(c,again)
        prior={**c['gateway'],'workspace':'existing-family-workspace','familyId':'existing-family'}
        restored=d.configuration(*URLS.values(),old=prior)
        self.assertEqual(restored['gateway']['familyId'],'existing-family')
        self.assertEqual(restored['preview']['workspace'],'existing-family-workspace')
        with self.assertRaises(d.SafeError):d.configuration(*URLS.values(),old={**prior,'approvedSha':'b'*40})
        for bad in ['http://x.run.app','https://evil.example','https://user@x.a.run.app','https://x.a.run.app/path','https://x.a.run.app?x=1']:
            with self.assertRaises(d.SafeError):d.origin(bad)
        with self.assertRaises(d.SafeError):d.configuration(URLS['gateway'],URLS['gateway'])

    def test_iam_rejects_preview_writes_foreign_secret_and_public_access(self):
        member='serviceAccount:factory-preview@'+d.PROJECT+'.iam.gserviceaccount.com'
        with self.assertRaises(d.SafeError):d.check_bindings({'bindings':[{'role':'roles/datastore.user','members':[member]}]},member,{'roles/datastore.viewer'})
        with self.assertRaises(d.SafeError):d.check_secret_policy({'bindings':[{'role':'roles/secretmanager.secretAccessor','members':['allUsers']}]},set())
        cloud=FakeCloud();cloud.policies[d.PEM]={'bindings':[{'role':'roles/secretmanager.secretAccessor','members':[member]}]}
        with self.assertRaises(d.SafeError):d.preflight(cloud,'europe-west1')
        self.assertFalse(any(c[0][:2]==('run','deploy') for c in cloud.calls))

    def test_full_mocked_deploy_pins_secrets_isolates_identities_and_never_reads_pem(self):
        cloud=FakeCloud();out=io.StringIO()
        args=['deploy','--execute','--region','europe-west1','--gateway-image',IMAGE,'--preview-image',PREVIEW]
        with patch.object(d,'health') as health,redirect_stdout(out):d.main(args,cloud)
        self.assertEqual(health.call_count,2)
        self.assertEqual(len([x for x in cloud.calls if x[0][:2]==('run','deploy')]),4)
        self.assertFalse(any(x[0][:3]==('secrets','versions','access') for x in cloud.calls))
        self.assertNotIn(cloud.secrets[d.CONFIGS['gateway']]['sessionKey'],out.getvalue())
        config=copy.deepcopy(cloud.secrets)
        cloud.calls=[]
        with patch.object(d,'health'),redirect_stdout(io.StringIO()):d.main(args,cloud)
        self.assertEqual(cloud.secrets,config)
        self.assertEqual(len([x for x in cloud.calls if x[0][:2]==('run','deploy')]),2)
        for arguments,data in cloud.calls:
            self.assertFalse(any('--set-env-vars'==a and 'PRIVATE_KEY' in arguments[i+1] for i,a in enumerate(arguments)))
        # Active configs and unmanaged services are never silently replaced.
        cloud.secrets[d.CONFIGS['gateway']]['active']=True
        with self.assertRaises(d.SafeError):d.main(args,cloud)

    def test_drift_rejected(self):
        cloud=FakeCloud()
        args=d.service_args('preview',PREVIEW,'europe-west1',False,{'preview':'8','pem':'7'})
        cloud.run(*args)
        service=cloud.services['factory-preview']
        d.verify_service(service,'preview',PREVIEW,False,{'preview':'8','pem':'7'})
        service['spec']['template']['spec']['volumes'].append({'secret':{'secretName':d.PEM,'items':[{'key':'7'}]}})
        with self.assertRaises(d.SafeError):d.verify_service(service,'preview',PREVIEW,False,{'preview':'8','pem':'7'})


class ActivationGateTests(unittest.TestCase):
    def test_sandbox_skip_or_partial_output_is_never_success(self):
        import subprocess
        spec=importlib.util.spec_from_file_location('sandbox_verify',Path(__file__).with_name('verify-sandbox.py'))
        gate=importlib.util.module_from_spec(spec);spec.loader.exec_module(gate)
        for text in ['SKIP gVisor integration: image not configured','PASS gVisor: compiled only','']:
            with self.assertRaises(RuntimeError):gate.require_full_smoke(subprocess.CompletedProcess([],0,text,''))
        output=('PASS gVisor: one compiled, desktop/mobile input-driven win, replay, parent isolation, no egress\n'
                'PASS gVisor: two compiled, desktop/mobile input-driven win, replay, parent isolation, no egress\n'
                'PASS gVisor: hostile infinite module and network API rejected\n')
        gate.require_full_smoke(subprocess.CompletedProcess([],0,output,''))
        with self.assertRaises(RuntimeError):gate.require_full_smoke(subprocess.CompletedProcess([],1,output,''))



class BuildSafetyTests(unittest.TestCase):
    def test_redeployment_preserves_private_worker_app_storage_and_family_configuration(self):
        old=d.configuration(*URLS.values())['gateway']
        old.update(workerRepository='family-game-factory-lab/family-game-factory-worker',workerRepositoryId='1458899834',
                   workerWorkflow='factory-private.yml',workerApprovedSha='b'*40,githubInstallationId='reviewed-org-installation',
                   artifactBucket='existing-private-artifacts',schedulerEmail='existing-scheduler@example.com')
        old['approval'].update(model='reviewed-model',inputUsdPerMillion=.75,outputUsdPerMillion=4.5)
        configs=d.configuration(*URLS.values(),old=old)
        self.assertEqual(configs['gateway'],old)
        self.assertEqual(configs['preview']['artifactBucket'],old['artifactBucket'])

    def test_sandbox_build_defaults_to_offline_plan(self):
        module=self.builder()
        with patch.object(module,'run') as run,patch('sys.argv',['build.py','--sandbox']),redirect_stdout(io.StringIO()):module.main()
        run.assert_not_called()

    def test_sandbox_build_stages_reviewed_commit_without_publishing_or_cloud_calls(self):
        module=self.builder();seen=[];sha='c'*40
        def fake(args,cwd=None):
            seen.append(args)
            if args[:3]==['git','ls-tree','-r']:return b'.dockerignore\nserver/sandbox/Dockerfile\nserver/sandbox/worker.cjs\nserver/sandbox/key.pem\n'
            if args[:2]==['git','show']:
                self.assertTrue(args[2].startswith(sha+':'));return b'tracked fixture'
            if args[0]=='env':
                self.assertIn('DOCKER_BUILDKIT=1',args)
                self.assertTrue((Path(cwd)/'server/sandbox/worker.cjs').exists())
                self.assertFalse((Path(cwd)/'server/sandbox/key.pem').exists())
            return b''
        with patch.object(module,'run',side_effect=fake),patch('sys.argv',['build.py','--sandbox','--execute','--reviewed-source-sha',sha]),redirect_stdout(io.StringIO()) as output:module.main()
        self.assertIn('NOT published',output.getvalue())
        self.assertFalse(any(args[0]=='gcloud' or args[:2]==['docker','push'] for args in seen))

    def builder(self):
        spec=importlib.util.spec_from_file_location('build_deployment',Path(__file__).with_name('build.py'))
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        return module

    def test_build_defaults_to_no_commands(self):
        module=self.builder()
        with patch.object(module,'run') as run,patch('sys.argv',['build.py','--region','europe-west1']),redirect_stdout(io.StringIO()):module.main()
        run.assert_not_called()


if __name__=='__main__':unittest.main()
