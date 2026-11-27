import hashlib
import io
import json
from datetime import datetime, timezone
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch
import zipfile

import audit_request_diagnostics as audit
import native_broker_acceptance as native
import native_broker_probe as probe


class NativeProbeTests(unittest.TestCase):
    def test_only_two_fixed_targets_and_one_nonmutating_permission(self):
        for status, body, expected in [(200,b'{}','NOT_RETURNED'), (200,b'{"permissions":[]}','NOT_RETURNED'),
                (200,json.dumps({'permissions':[probe.broker.TOKEN_PERMISSION]}).encode(),'PRESENT'),
                (403,b'{}','UNKNOWN'), (404,b'{}','UNKNOWN'), (200,b'','UNKNOWN'),
                (200,b'{"permissions":null}','UNKNOWN'), (200,b'{"permissions":["grant"],"permissions":[]}','UNKNOWN'), (200,b'{"other":1}','UNKNOWN')]:
            response = Mock(status=status)
            response.read.return_value = body
            with patch.object(probe.broker,'HTTPSConnection') as connect:
                connect.return_value.getresponse.return_value = response
                rows = probe.broker.token_permissions('redacted-fixture-token')
                self.assertEqual(rows[probe.broker.TOKEN_TARGETS[0]],expected)
                calls = connect.return_value.request.call_args_list
                self.assertEqual(len(calls),1 if expected == 'PRESENT' else 2)
                for target, call in zip(probe.broker.TOKEN_TARGETS, calls):
                    self.assertEqual(call.args[:2], ('POST',f'/v1/projects/{native.PROJECT}/serviceAccounts/'
                                                      f'{target}@{native.PROJECT}.iam.gserviceaccount.com:testIamPermissions'))
                    self.assertEqual(json.loads(call.args[2]),{'permissions':[probe.broker.TOKEN_PERMISSION]})
                    self.assertEqual(connect.call_args.args, ('iam.googleapis.com',))

    def test_entrypoint_rejects_custom_targets_without_contacting_iam(self):
        def request(payload):
            raw = json.dumps(payload).encode()
            return Mock(method='POST',path='/',query_string=b'',mimetype='application/json',
                        content_length=len(raw),stream=io.BytesIO(raw))
        with patch.object(probe.broker,'runtime_token_boundary', return_value={'operation':'token-boundary'}) as native_call:
            payload = {'operation':'token-boundary'}
            probe.broker.request_evidence(request({**payload,'target':'other'}))
            native_call.assert_not_called()
            self.assertEqual(json.loads(probe.broker.request_evidence(request(payload))[0]),payload)
            native_call.assert_called_once()

    def test_wrong_runtime_identity_does_not_probe(self):
        with patch.dict('os.environ',{'K_REVISION':'jems-request-evidence-00001-abc'}), \
                patch.object(probe.broker.Logging,'connect',side_effect=probe.broker.Failure('CONFIG_UNVERIFIED')), \
                patch.object(probe.broker,'token_permissions') as send:
            self.assertEqual(set(probe.broker.runtime_token_boundary()['permissions'].values()),{'UNKNOWN'})
            send.assert_not_called()

    def test_snapshot_rejects_changed_image_runtime_and_split_traffic(self):
        digest = 'sha256:' + 'b'*64
        path = f'projects/{native.PROJECT}/locations/us-east5/services/{native.SERVICE}'
        rev = native.SERVICE + '-00001-abc'
        service = {'name':path,'trafficStatuses':[{'revision':rev,'percent':100}]}
        revision = {'name':path+'/revisions/'+rev,'uid':'example','serviceAccount':native.check.setup.BROKER,
                    'containers':[{'image':native.REGISTRY+digest}]}
        for changed_service, changed_revision, ok in [
                (service, revision, True),
                ({**service,'reconciling':True},revision,False),
                ({**service,'trafficStatuses':[{'revision':rev,'percent':10}]},revision,False),
                (service,{**revision,'containers':[{'image':'tag'}]},False),
                (service,{**revision,'serviceAccount':'other'},False)]:
            client=Mock()
            client.call.side_effect=[changed_service,changed_revision]
            with patch.object(native,'Http',return_value=client), patch.object(native.check,'account_ids',return_value={}):
                if ok:
                    self.assertEqual(native.snapshot('fixture',digest)['revision'],rev)
                else:
                    with self.assertRaises(native.SetupError): native.snapshot('fixture',digest)
                self.assertTrue(all(call.args[0]=='GET' for call in client.call.call_args_list))

    def test_manual_selection_only_and_no_custom_scope(self):
        self.assertEqual(probe.selection({'GITHUB_EVENT_NAME':'schedule'}),('request-evidence',''))
        with tempfile.TemporaryDirectory() as d:
            p = Path(d)/'event.json'
            env = {'GITHUB_EVENT_NAME':'workflow_dispatch','GITHUB_EVENT_PATH':str(p)}
            inputs = {'operation':'token-boundary','challenge':'e'*32}
            p.write_text(json.dumps({'inputs':inputs}))
            self.assertEqual(probe.selection(env),('token-boundary','e'*32))
            for bad in ({**inputs,'target':'custom'},{**inputs,'challenge':'unsafe'},{**inputs,'operation':'request-evidence'}):
                p.write_text(json.dumps({'inputs':bad}))
                with self.assertRaises(ValueError): probe.selection(env)

    def exercise(self, fault):
        sha = 'a'*40
        digest = 'sha256:'+'b'*64
        revision = 'jems-request-evidence-00001-abc'
        calls = []
        challenge = ''
        raw = b''
        def github(method, path, data=None, binary=False):
            nonlocal challenge, raw
            if method == 'POST':
                self.assertEqual(path, native.github.PREFIX+'actions/workflows/'+native.github.WORKFLOW+'/dispatches')
                self.assertEqual(data['ref'],'main')
                calls.append(method)
                challenge = data['inputs']['challenge']
                return None if fault == 'lost-dispatch' else {'workflow_run_id':123}
            self.assertEqual(method,'GET')
            if path.endswith('branches/main'):
                return {'protected':fault!='unprotected','commit':{'sha':sha}}
            if '/contents/' in path:
                file = path.split('/contents/')[1].split('?')[0]
                content = (native.review.ROOT/file).read_bytes()
                blob = hashlib.sha1(b'blob '+str(len(content)).encode()+b'\0'+content).hexdigest()
                return {'type':'file','sha':blob if fault!='wrong-controller' else '0'*40}
            if path.endswith('runs/123'):
                return {'id':123,'head_sha':sha,'head_branch':'main','event':'workflow_dispatch','run_attempt':1,
                        'path':'.github/workflows/'+native.github.WORKFLOW,'status':'completed','conclusion':'success',
                        'repository':{'id':1458033181},'head_repository':{'id':1458033181}}
            if '/artifacts?' in path:
                results = dict.fromkeys(probe.broker.TOKEN_TARGETS,'NOT_RETURNED')
                report = {'operation':'token-boundary','workflow':{'run_id':'123','attempt':'1','workflow_source_sha':sha},
                          'broker_revision':revision if fault!='old-revision' else 'other',
                          'challenge':challenge if fault!='replay' else 'e'*32,'caller':dict(results),'broker':dict(results),
                          'observed_at_utc':datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}
                if fault in ('PRESENT','UNKNOWN'):
                    report['caller'][probe.broker.TOKEN_TARGETS[0]]=fault
                out = io.BytesIO()
                with zipfile.ZipFile(out,'w') as f: f.writestr('report.json',json.dumps(report))
                raw = out.getvalue()
                return {'total_count':1,'artifacts':[{'id':17,'name':'jems-request-evidence-123-1','size_in_bytes':len(raw),
                    'digest':'sha256:'+hashlib.sha256(raw).hexdigest()}]}
            if path.endswith('/17/zip'): return raw
            self.assertIn('/attempts/1/jobs?',path)
            return {'total_count':1,'jobs':[{'name':'evidence','status':'completed','conclusion':'success','run_id':123,
                    'head_sha':sha,'steps':[{'name':s,'status':'completed','conclusion':'success'}
                    for s in (native.STEPS[:-1] if fault=='missing-step' else native.STEPS)]}]}
        ids = {email:str(123456789123456789+i) for i,email in enumerate(native.check.SOURCES + native.check.TARGETS)}
        snap = {'accounts':ids,'revision':revision,'revision_uid':'uid','digest':digest}
        observe = Mock(side_effect=[snap, {} if fault=='account-changed' else snap])
        policy = Mock()
        def evaluate(method,path,body):
            item = body['accessTuple']
            row = next(r for r in audit.tuples() if all(r[k]==v for k,v in item.items()))
            if native.check.eligible_tuple(row):
                return {'overallAccessState':'UNKNOWN_INFO',
                        'allowPolicyExplanation':{'allowAccessState':'ALLOW_ACCESS_STATE_UNKNOWN_INFO',
                        'explainedPolicies':[{'bindingExplanations':[{'memberships':{'principal://private':
                        {'membership':'MEMBERSHIP_UNKNOWN_UNSUPPORTED'}},'combinedMembership':
                        {'membership':'MEMBERSHIP_UNKNOWN_UNSUPPORTED'}}]}]},
                        'denyPolicyExplanation':{'denyAccessState':'DENY_ACCESS_STATE_NOT_DENIED'}}
            return {'overallAccessState':row['expected']}
        policy.call.side_effect = evaluate
        with tempfile.TemporaryDirectory() as d:
            report = audit.audit(policy,lambda _:True,subject_check=lambda rows:
                native.verify(rows,'fixture',sha,digest,d,reader=github,observe=observe))
        self.assertEqual(len(calls), 0 if fault in ('unprotected','wrong-controller') else 1)
        return report

    def test_one_dispatch_verifies_complete_current_roster_and_retains_original_unknowns(self):
        report = self.exercise(None)
        self.assertEqual(report['status'],'FINITE_POLICY_CHECKS_PASSED')
        self.assertEqual(len(report['checks']),77)
        self.assertEqual([r['row'] for r in report['checks'] if r.get('troubleshooter_status')=='UNKNOWN_INFO'],[29,35,65,71])

    def test_rejects_replay_mismatch_unexpected_grant_and_partial_execution(self):
        for fault in ('lost-dispatch','unprotected','wrong-controller','old-revision','replay',
                      'account-changed','PRESENT','UNKNOWN','missing-step'):
            with self.subTest(fault=fault):
                report = self.exercise(fault)
                self.assertEqual(report['status'],'NOT_ACCEPTED')
                self.assertEqual(len(report['checks']),4)
                if fault == 'PRESENT':
                    self.assertEqual(report['credential_check']['reported_rows'],[29])


if __name__ == '__main__':
    unittest.main()
