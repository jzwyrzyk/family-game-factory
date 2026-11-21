"""Offline publication contracts: no cloud credentials, network, Docker or paid builds."""
import copy
from contextlib import redirect_stdout, redirect_stderr
import importlib.util
import io
import json
from pathlib import Path
import shlex
import subprocess
import tarfile
import tempfile
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('service_build',Path(__file__).with_name('build.py'))
b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
SHA='a'*40
REGION='us-east5'
ID='11111111-2222-3333-4444-555555555555'
BUCKET=b.PROJECT+'-service-builds-'+REGION

class FakeCloud:
    def __init__(self):
        self.calls=[];self.statuses=['QUEUED','SUCCESS'];self.config=b.service_config(REGION,SHA)
        self.build={**copy.deepcopy(self.config),'id':ID,'status':'SUCCESS',
            'results':{'images':[{'name':name,'digest':'sha256:'+char*64} for name,char in zip(self.config['images'],'bc')]},
            'sourceProvenance':{'resolvedStorageSource':{'bucket':BUCKET,'object':'source/test.tgz','generation':'1'}}}
        self.project={'bindings':[self.binding('roles/logging.logWriter')]}
        self.ancestor={'bindings':[]}
        self.bucket={'location':'US-EAST5','uniform_bucket_level_access':True,'public_access_prevention':'enforced'}
        self.enabled=b.REQUIRED_APIS.copy()
    def binding(self,role):return {'role':role,'members':['serviceAccount:'+b.BUILDER]}
    def __call__(self,*args):
        self.calls.append(args)
        if args[:2]==('services','list'):return [{'config':{'name':n}} for n in self.enabled]
        if args[:3]==('artifacts','repositories','describe'):return {'format':'DOCKER','mode':'STANDARD_REPOSITORY'}
        if args[:3]==('iam','service-accounts','describe'):return {'email':b.BUILDER,'disabled':False}
        if args[:3]==('storage','buckets','describe'):return self.bucket
        if args[:2]==('projects','get-iam-policy'):return self.project
        if args[:2]==('projects','get-ancestors'):return [{'type':'organization','id':'123'}]
        if args[:2]==('organizations','get-iam-policy'):return self.ancestor
        if args[:3]==('artifacts','repositories','get-iam-policy'):return {'bindings':[self.binding('roles/artifactregistry.writer')]}
        if args[:3]==('storage','buckets','get-iam-policy'):return {'bindings':[self.binding('roles/storage.objectViewer')]}
        if args[:2]==('builds','submit'):
            self.assert_submit(args)
            return {'id':ID}
        if args[:2]==('builds','describe'):
            result=copy.deepcopy(self.build)
            if self.statuses:result['status']=self.statuses.pop(0)
            return result
        if args[:4]==('artifacts','docker','images','describe'):
            image=args[4]
            if '@sha256:' not in image:raise AssertionError('Must resolve immutable reference, never tag')
            return {'image_summary':{'digest':image.split('@')[1]}}
        raise AssertionError(args)
    def assert_submit(self,args):
        config=json.loads(Path(args[args.index('--config')+1]).read_text())
        if config!=self.config:raise AssertionError(config)
        if args[args.index('--gcs-source-staging-dir')+1]!='gs://'+BUCKET+'/source':raise AssertionError(args)
        if '--async' not in args:raise AssertionError(args)
        if not Path(args[2]).is_file():raise AssertionError(args)

class ServiceBuildTests(unittest.TestCase):
    def invoke(self,*args,cloud=None):
        output=io.StringIO()
        with patch('sys.argv',['build.py','--region',REGION,*args]),patch.object(b,'cloud',cloud or FakeCloud()),redirect_stdout(output),redirect_stderr(io.StringIO()):
            b.main()
        return output.getvalue()

    def test_offline_plan_is_deterministic_and_never_executes_commands(self):
        with patch.object(b,'run') as run:
            first=self.invoke('--reviewed-source-sha',SHA)
            self.assertEqual(first,self.invoke('--reviewed-source-sha',SHA));run.assert_not_called()
        config=json.loads(first)['build']
        self.assertEqual(config['serviceAccount'],f'projects/{b.PROJECT}/serviceAccounts/{b.BUILDER}')
        self.assertEqual(config['options'],{'logging':'CLOUD_LOGGING_ONLY','machineType':'E2_MEDIUM'})
        self.assertEqual(config['timeout'],'1200s')
        self.assertEqual(len(config['images']),2)

    def test_exact_commit_and_explicit_execution_required_before_cloud_calls(self):
        cloud=FakeCloud()
        for args in [('--execute',),('--execute','--reviewed-source-sha','main'),('--execute','--reviewed-source-sha','a'*39),
                     ('--reviewed-source-sha',SHA,'--preflight','--execute'),('--build-id','invalid','--reviewed-source-sha',SHA)]:
            with self.assertRaises(RuntimeError):self.invoke(*args,cloud=cloud)
        self.assertEqual(cloud.calls,[])

    def test_preflight_is_read_only_and_missing_apis_fail_clearly(self):
        cloud=FakeCloud();self.invoke('--preflight',cloud=cloud)
        self.assertFalse(any(c[:2]==('builds','submit') for c in cloud.calls))
        cloud.enabled.remove('cloudbuild.googleapis.com')
        with patch.object(b,'cloud',cloud),self.assertRaisesRegex(RuntimeError,'Required APIs disabled: cloudbuild.googleapis.com'):b.preflight(REGION,BUCKET)

    def test_preflight_rejects_broad_or_inherited_grants_and_wrong_bucket(self):
        for change in ('project','ancestor','bucket'):
            cloud=FakeCloud()
            if change=='project':cloud.project['bindings'].append(cloud.binding('roles/editor'))
            if change=='ancestor':cloud.ancestor['bindings'].append(cloud.binding('roles/artifactregistry.writer'))
            if change=='bucket':cloud.bucket['public_access_prevention']='inherited'
            with patch.object(b,'cloud',cloud),self.assertRaises(RuntimeError):b.preflight(REGION,BUCKET)

    def test_real_git_archive_excludes_worktree_private_files_and_has_stable_hash(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)/'repo';root.mkdir()
            def git(*args):return subprocess.check_output(['git',*args],cwd=root,stderr=subprocess.DEVNULL).decode().strip()
            git('init','-q')
            files=['package.json','package-lock.json','.dockerignore','server/Dockerfile.gateway','server/Dockerfile.preview',
                   'server/gateway.ts','server/private-config.ts','src/runtime/types.ts','src/runtime/manifests.ts','src/studio/design.ts',
                   'src/studio/creation-readiness.ts','src/studio/conversation-view.ts',
                   'src/creation/model.ts','src/creation/projects.ts',
                   'server/key.pem','server/config.json','server/config.private.json','server/service-account.json','server/credentials.json',
                   'server/token.json','server/api-key.json','server/.env','server/.private/config.json','server/node_modules/p/index.js',
                   'server/testing/fixture.ts','unrelated.txt']
            for name in files:
                path=root/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_text('reviewed '+name)
            git('add','-f','.')
            git('-c','user.name=Test','-c','user.email=test@example.com','commit','-qm','Reviewed')
            sha=git('rev-parse','HEAD')
            (root/'server/gateway.ts').write_text('dirty working tree')
            (root/'server/untracked-token.txt').write_text('untracked private token')
            hashes=[]
            for _ in range(2):
                with tempfile.TemporaryDirectory() as staged:
                    archive,digest=b.source_archive(root,staged,sha);hashes.append(digest)
                    with tarfile.open(archive) as tar:
                        names=tar.getnames()
                        self.assertEqual(set(names),set(files[:14]))
                        self.assertEqual(tar.extractfile('server/gateway.ts').read(),b'reviewed server/gateway.ts')
            self.assertEqual(hashes[0],hashes[1])

    def test_real_archive_contains_current_dockerfile_copy_inputs_and_supports_older_sources(self):
        source=Path(__file__).resolve().parents[2]
        dockerfiles={kind:(source/('server/Dockerfile.'+kind)).read_text() for kind in ('gateway','preview','coach')}
        dockerignore=(source/'.dockerignore').read_text()
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)/'repo';root.mkdir()
            def git(*args):return subprocess.check_output(['git',*args],cwd=root,stderr=subprocess.DEVNULL).decode().strip()
            def write(name,content):
                path=root/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_text(content)
            def commit():
                git('add','-A');git('-c','user.name=Test','-c','user.email=test@example.com','commit','-qm','Reviewed')
                return git('rev-parse','HEAD')
            git('init','-q')
            inputs=['package.json','package-lock.json','.dockerignore','server/gateway.ts','server/preview-server.ts',
                    'server/coach/private-executor.ts','server/trusted-devices.ts','server/privacy/parent-consent.ts',
                    'server/adult-pilot.ts','server/pipeline/auth.ts',
                    'src/runtime/types.ts','src/runtime/manifests.ts','src/studio/design.ts',
                    'src/studio/creation-readiness.ts','src/studio/conversation-view.ts',
                    'src/creation/model.ts','src/creation/projects.ts']
            for name in inputs:write(name,'reviewed '+name)
            write('.dockerignore',dockerignore)
            for kind,content in dockerfiles.items():write('server/Dockerfile.'+kind,content)
            sha=commit()
            with tempfile.TemporaryDirectory() as staged:
                archive,_=b.source_archive(root,staged,sha)
                with tarfile.open(archive) as tar:
                    names=set(tar.getnames())
                    # The source tar is still filtered by Docker. This repository
                    # uses a deny-by-default context with explicit shared inputs.
                    patterns=[line.strip() for line in tar.extractfile('.dockerignore').read().decode().splitlines() if line.strip() and not line.lstrip().startswith('#')]
                    self.assertEqual(patterns[0],'**')
                    for kind,content in dockerfiles.items():
                        for line in content.replace('\\\n',' ').splitlines():
                            if not line.startswith('COPY '):continue
                            tokens=shlex.split(line)[1:]
                            if any(token.startswith('--from=') for token in tokens):continue
                            paths=[token for token in tokens if not token.startswith('--')][:-1]
                            for name in paths:
                                self.assertTrue(name in names or any(p.startswith(name+'/') for p in names),(kind,name))
                                if name.startswith('src/'):
                                    self.assertIn('!'+name,patterns,(kind,name,'Docker context excludes this COPY input'))
                                    for parent in Path(name).parents:
                                        if parent!=Path('.'):self.assertIn('!'+parent.as_posix()+'/',patterns)
                    for name in inputs[-2:]:self.assertEqual(tar.extractfile(name).read(),('reviewed '+name).encode())

            # A future Dockerfile dependency outside the narrow source allowlist
            # must fail locally instead of starting a billable doomed build.
            write('src/unstaged.ts','reviewed but not allowed')
            for kind in ('gateway','coach'):
                for name,content in dockerfiles.items():write('server/Dockerfile.'+name,content)
                write('server/Dockerfile.'+kind,dockerfiles[kind]+'COPY src/unstaged.ts ./src/\n')
                missing=commit()
                with tempfile.TemporaryDirectory() as staged,patch.object(b,'cloud') as cloud:
                    with self.assertRaisesRegex(RuntimeError,'src/unstaged.ts.*Dockerfile.'+kind+' COPY'):b.source_archive(root,staged,missing)
                    cloud.assert_not_called()

            # Rollback source predating Creation, readiness and private coach
            # must stay publishable; its own Dockerfiles determine the inputs.
            for kind,content in dockerfiles.items():
                if kind=='coach':(root/'server/Dockerfile.coach').unlink();continue
                write('server/Dockerfile.'+kind,'\n'.join(line for line in content.splitlines() if 'src/creation/' not in line and 'src/studio/creation-readiness.ts' not in line)+'\n')
            for name in [*inputs[-2:],'src/studio/creation-readiness.ts','src/studio/conversation-view.ts']:(root/name).unlink()
            older=commit()
            with tempfile.TemporaryDirectory() as staged:
                archive,_=b.source_archive(root,staged,older)
                with tarfile.open(archive) as tar:
                    self.assertFalse(any(name.startswith('src/creation/') for name in tar.getnames()))
                    self.assertNotIn('server/Dockerfile.coach',tar.getnames())
                    self.assertNotIn('src/studio/creation-readiness.ts',tar.getnames())

    def test_full_publish_stages_once_builds_both_and_independently_verifies_digests(self):
        cloud=FakeCloud()
        def archive(root,tmp,sha):
            self.assertEqual(sha,SHA);p=Path(tmp)/'source.tgz';p.write_bytes(b'fixture');return p,'d'*64
        with patch.object(b,'source_archive',side_effect=archive),patch.object(b,'run') as run,patch.object(b.time,'sleep') as sleep:
            release=json.loads(self.invoke('--execute','--reviewed-source-sha',SHA,cloud=cloud))
        run.assert_called_once();self.assertEqual(run.call_args.args[0],['git','cat-file','-e',SHA+'^{commit}'])
        sleep.assert_called_once_with(10)
        self.assertEqual(release['reviewedSourceSha'],SHA);self.assertFalse(release['deployed'])
        self.assertEqual(release['buildId'],ID);self.assertEqual(release['sourceArchiveSha256'],'d'*64)
        self.assertTrue(release['images']['gateway'].endswith('@sha256:'+'b'*64))
        self.assertTrue(release['images']['preview'].endswith('@sha256:'+'c'*64))
        self.assertEqual(sum(c[:2]==('builds','submit') for c in cloud.calls),1)
        self.assertEqual(sum(c[:4]==('artifacts','docker','images','describe') for c in cloud.calls),2)

    def test_recovery_is_read_only_and_never_rebuilds(self):
        cloud=FakeCloud();cloud.statuses=[]
        with patch.object(b,'run') as run:
            result=json.loads(self.invoke('--build-id',ID,'--reviewed-source-sha',SHA,cloud=cloud));run.assert_not_called()
        self.assertEqual(result['buildId'],ID)
        self.assertTrue(all(c[:2]==('builds','describe') or c[:4]==('artifacts','docker','images','describe') for c in cloud.calls))

    def test_failed_partial_mismatched_build_or_unverified_digest_never_returns_release(self):
        good=FakeCloud()
        failures=[]
        for status in ['FAILURE','TIMEOUT','CANCELLED']:
            bad=copy.deepcopy(good.build);bad['status']=status;failures.append(bad)
        bad=copy.deepcopy(good.build);bad['results']['images'].pop();failures.append(bad)
        bad=copy.deepcopy(good.build);bad['results']['images'][1]['name']=bad['results']['images'][0]['name'];failures.append(bad)
        bad=copy.deepcopy(good.build);bad['results']['images'][0]['digest']='latest';failures.append(bad)
        bad=copy.deepcopy(good.build);bad['serviceAccount']='factory-gateway@example.com';failures.append(bad)
        bad=copy.deepcopy(good.build);bad['steps'][0]['args'].append('--unexpected');failures.append(bad)
        for bad in failures:
            with self.subTest(build=bad),patch.object(b,'cloud',good),self.assertRaises(RuntimeError):b.verify_build(bad,good.config)
        with patch.object(b,'cloud',return_value={'image_summary':{'digest':'sha256:'+'e'*64}}),self.assertRaisesRegex(RuntimeError,'Registry digest verification failed'):
            b.verify_build(good.build,good.config)

    def test_polling_is_bounded_and_does_not_resubmit(self):
        cloud=FakeCloud();cloud.statuses=['WORKING']*181
        with patch.object(b.time,'sleep') as sleep,self.assertRaisesRegex(RuntimeError,'recover by ID'):
            self.invoke('--build-id',ID,'--reviewed-source-sha',SHA,cloud=cloud)
        self.assertEqual(sleep.call_count,180)
        self.assertFalse(any(c[:2]==('builds','submit') for c in cloud.calls))

    def test_diagnostics_hide_raw_credentials_and_warn_about_ambiguous_submission(self):
        for args,pattern in [(('builds','describe',ID),'Cloud operation failed'),(('builds','submit','source.tgz'),'response was lost')]:
            with patch.object(b,'run',side_effect=RuntimeError('SYNTHETIC_SECRET_TOKEN')):
                with self.assertRaisesRegex(RuntimeError,pattern) as error:b.cloud(*args)
                self.assertNotIn('SYNTHETIC_SECRET_TOKEN',str(error.exception))

    def test_missing_sdk_and_malformed_submission_have_actionable_safe_diagnostics(self):
        with patch.object(b,'run',side_effect=FileNotFoundError()),self.assertRaisesRegex(RuntimeError,'gcloud CLI is required'):
            b.cloud('services','list')
        with patch.object(b,'run',return_value=b'invalid response'),self.assertRaisesRegex(RuntimeError,'response was lost'):
            b.cloud('builds','submit','source.tgz')

if __name__=='__main__':unittest.main()
