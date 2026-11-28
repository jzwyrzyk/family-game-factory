import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import dev_foundation_plan as p


def env():
    return {'GITHUB_ACTIONS':'true','GITHUB_REPOSITORY':p.REPOSITORY,'GITHUB_REPOSITORY_ID':'1458033181',
            'GITHUB_REPOSITORY_OWNER_ID':'356692244','GITHUB_REF':'refs/heads/main','GITHUB_REF_PROTECTED':'true',
            'GITHUB_EVENT_NAME':'workflow_dispatch','GITHUB_RUN_ATTEMPT':'1','GITHUB_WORKFLOW_REF':p.WORKFLOW,
            'GITHUB_WORKFLOW_SHA':'a'*40,'GITHUB_SHA':'a'*40,'DEV_PLAN_SOURCE':'a'*40,
            'DEV_PLAN_ENVIRONMENT':'jems-dev-foundation-plan','GITHUB_RUN_ID':'1234','DEV_PROJECT_NUMBER':'1234567890123'}


class PlanTests(unittest.TestCase):
    def test_ref_target_and_source_boundaries(self):
        self.assertEqual(p.context(env())[0]['projectId'],p.PROJECT)
        for key,value in [('GITHUB_EVENT_NAME','pull_request'),('GITHUB_REF','refs/heads/feature'),
                          ('GITHUB_RUN_ATTEMPT','2'),('GITHUB_REF_PROTECTED','false'),
                          ('GITHUB_REPOSITORY_ID','123'),('GITHUB_WORKFLOW_SHA','b'*40),
                          ('DEV_PROJECT_NUMBER','1092405124984'),('DEV_PROJECT_NUMBER','1054529152893'),
                          ('DEV_PLAN_SOURCE','b'*40),('DEV_PLAN_ENVIRONMENT','jems-nonproduction'),
                          ('GITHUB_WORKFLOW_REF',p.WORKFLOW.replace('plan.yml','apply.yml'))]:
            with self.subTest(key=key), self.assertRaises(p.DevError): p.context({**env(),key:value})

    def test_preflight_checks_current_main_without_cloud(self):
        for current in ['a'*40,'b'*40]:
            with patch.dict(os.environ,env(),clear=True),patch.object(sys,'argv',['plan','--preflight']), \
                 patch.object(p,'command',return_value=json.dumps({'protected':True,'commit':{'sha':current}}).encode()) as run, \
                 patch.object(p,'credentials') as auth:
                if current=='a'*40:self.assertEqual(p.main(),0)
                else:
                    with self.assertRaises(p.DevError):p.main()
                auth.assert_not_called()
                self.assertEqual(run.call_count,1)
                self.assertEqual(run.call_args.args[0][0],'gh')

    def test_inventory_adapter_rejects_mutating_commands(self):
        cloud=p.ReadOnlyCloud(p.target('1234567890123'))
        for args in [('services','enable','run.googleapis.com'),('secrets','versions','access','1'),
                     ('projects','add-iam-policy-binding',p.PROJECT),('storage','cp','x','y'),
                     ('run','deploy','jems-dev-app'),('compute','instances','create','x')]:
            with self.subTest(args=args),self.assertRaises(p.DevError): cloud.command(args)
        for prefix in p.READ_PREFIXES:
            self.assertNotIn('--impersonate-service-account',cloud.command(prefix))

    def test_missing_api_plan_stops_before_resource_inventory(self):
        class Fake(p.ReadOnlyCloud):
            def __init__(self,m): super().__init__(m);self.calls=[]
            def run(self,*args):
                self.command(args);self.calls.append(args)
                if args[:2]==('projects','describe'):return {**self.manifest,'lifecycleState':'ACTIVE','labels':{'environment':'development','application':'jems'}}
                if args[:3]==('iam','service-accounts','describe'):return {'email':p.ACCOUNT,'projectId':p.PROJECT}
                if args[:4]==('iam','service-accounts','keys','list'):return []
                if args[:2]==('services','list'):return []
                raise AssertionError('Unexpected inventory or mutation: '+str(args))
        m=p.target('1234567890123');cloud=Fake(m)
        proposal=p.build_plan(m,'a'*40,'1234',cloud)
        self.assertEqual(len(proposal['pendingCommands']),1)
        self.assertEqual(proposal['stage'],'api-enablement')
        self.assertFalse(proposal['applySupported'])
        self.assertIn('--impersonate-service-account',proposal['pendingCommands'][0])
        self.assertNotIn('allowedAdults',proposal['target'])
        self.assertEqual(len(cloud.calls),4)

    def test_private_storage_and_readback(self):
        m=p.target('1234567890123');plan={'runId':'1234','operatorSource':'a'*40,'kind':'dev-foundation-proposal',
         'stage':'foundation','pendingCommands':[['private-command','adult@example.invalid']], 'reviewBy':'later'}
        calls=[];raw=None
        def run(args):
            nonlocal raw
            calls.append(args)
            if args[2:4]==['buckets','describe']:
                return json.dumps({'project_number':m['projectNumber'],'location':'US-EAST5',
                                  'uniform_bucket_level_access':True,'public_access_prevention':'enforced'}).encode()
            if args[2]=='cp':
                self.assertIn('--if-generation-match=0',args);raw=Path(args[3]).read_bytes();return b''
            if args[2]=='cat':return raw
            raise AssertionError(args)
        with tempfile.TemporaryDirectory() as tmp,patch.object(p,'command',side_effect=run):
            receipt=p.store_plan(m,plan,{'RUNNER_TEMP':tmp})
        self.assertNotIn('adult@example.invalid',json.dumps(receipt))
        self.assertEqual(receipt['planSha256'],p.digest(plan))
        self.assertEqual(len(calls),3)

    def test_foreign_or_public_bucket_cannot_receive_plan(self):
        for extra in [{'project_number':'1092405124984'},{'public_access_prevention':'inherited'},
                      {'uniform_bucket_level_access':False},{'location':'EU'}]:
            metadata={'project_number':'1234567890123','location':'US-EAST5',
                      'uniform_bucket_level_access':True,'public_access_prevention':'enforced',**extra}
            with patch.object(p,'command',return_value=json.dumps(metadata).encode()) as command:
                with self.assertRaises(p.DevError):p.store_plan(p.target('1234567890123'),{}, {})
                self.assertEqual(command.call_count,1)

    def test_upload_failure_does_not_replay(self):
        metadata={'project_number':'1234567890123','location':'US-EAST5',
                  'uniform_bucket_level_access':True,'public_access_prevention':'enforced'}
        with patch.object(p,'command',side_effect=[json.dumps(metadata).encode(),p.DevError('uncertain')]) as command:
            with self.assertRaises(p.DevError):p.store_plan(p.target('1234567890123'),{'runId':'1234'}, {})
            self.assertEqual(command.call_count,2)

    def test_credentials_reject_wrong_project_account_and_user_adc(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'gha-creds-abc123.json'
            m=p.target('1234567890123');settings={**env(),'GITHUB_WORKSPACE':tmp,
                'GOOGLE_APPLICATION_CREDENTIALS':str(path),'CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE':str(path)}
            good={'type':'external_account','audience':'//iam.googleapis.com/projects/1234567890123/locations/global/workloadIdentityPools/jems-dev-operations/providers/github-dev-foundation-plan',
                  'service_account_impersonation_url':'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/'+p.ACCOUNT+':generateAccessToken',
                  'token_url':'https://sts.googleapis.com/v1/token','subject_token_type':'urn:ietf:params:oauth:token-type:jwt'}
            path.write_text(json.dumps(good))
            with patch.object(p,'command',return_value=(p.ACCOUNT+'\n').encode()):p.credentials(settings,m)
            for change in [{'type':'authorized_user'},{'audience':'//iam.googleapis.com/production'},
                           {'service_account_impersonation_url':'https://example.invalid/token'}]:
                path.write_text(json.dumps({**good,**change}))
                with self.assertRaises(p.DevError):p.credentials(settings,m)
            path.write_text(json.dumps(good))
            with self.assertRaises(p.DevError):p.credentials({**settings,'CLOUDSDK_AUTH_ACCESS_TOKEN':'invalid'},m)


if __name__=='__main__':unittest.main()
