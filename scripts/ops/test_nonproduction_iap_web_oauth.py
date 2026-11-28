from copy import deepcopy
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

import nonproduction_iap_web_oauth as op


class FakeIap:
    def __init__(self):
        self.records = {scope: {'name':scope} for scope in (op.WEB,op.PROJECT,'folders/1','organizations/2')}
        self.records[op.WEB]['applicationSettings'] = {'attributePropagationSettings': {'enable':True}}
        self.records[op.WEB]['accessSettings'] = {'oauthSettings':{'programmaticClients':['already-allowed']}}
        self.write_count=0
        self.ambiguous=False

    def call(self, method, path, body=None):
        if method=='GET':
            return deepcopy(self.records[path.removeprefix('v1/').removesuffix(':iapSettings')])
        assert method=='PATCH' and path=='v1/'+op.WEB+':iapSettings?updateMask='+op.MASK
        assert set(body)=={'name','accessSettings'} and body['name']==op.WEB
        assert set(body['accessSettings'])=={'oauthSettings'}
        values=body['accessSettings']['oauthSettings']
        assert set(values)=={'clientId','clientSecret'} and values['clientId']==op.CLIENT
        self.write_count+=1
        self.records[op.WEB]['accessSettings']['oauthSettings'].update(
            clientId=op.CLIENT,clientSecretSha256=op.r.sha(values['clientSecret'].encode()))
        if self.ambiguous:
            raise op.SetupError('transport uncertain')
        return deepcopy(self.records[op.WEB])


class IapOAuthTests(unittest.TestCase):
    def setUp(self):
        tmp=tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.folder=Path(tmp.name)
        self.api=FakeIap()
        self.crm=Mock()
        self.crm.call.return_value={'name':'folders/1','parent':'organizations/2'}
        self.project={'parent':{'type':'folder','id':'1'}}
        self.secret=Mock(return_value='synthetic-secret')
        patcher=patch.object(op,'get_secret',self.secret)
        patcher.start()
        self.addCleanup(patcher.stop)

    def run_check(self):
        return op.reconcile(self.folder,self.api,self.crm,self.project,lambda:None)

    def test_create_readback_and_idempotence(self):
        before=op.unrelated_digest(self.api.records[op.WEB])
        self.assertTrue(self.run_check()['write_this_run'])
        self.assertFalse(self.run_check()['write_this_run'])
        self.assertEqual(op.unrelated_digest(self.api.records[op.WEB]),before)
        self.assertEqual(self.api.write_count,1)
        self.secret.assert_called_once_with()
        self.assertNotIn(b'synthetic-secret',(self.folder/'oauth-write-intent.json').read_bytes())

    def test_existing_local_or_inherited(self):
        for scope in self.api.records:
            for client in (op.CLIENT,'different'):
                with self.subTest(scope=scope,client=client):
                    self.api.records[scope]['accessSettings']={'oauthSettings':{'clientId':client}}
                    if client==op.CLIENT:
                        self.assertEqual(self.run_check()['client_source_scope'],scope)
                    else:
                        with self.assertRaisesRegex(op.r.Stop,'DIFFERENT_CLIENT_PRESERVED'):
                            self.run_check()
                    del self.api.records[scope]['accessSettings']
        self.secret.assert_not_called()
        self.assertEqual(self.api.write_count,0)

    def test_competing_writer_or_drift(self):
        def during_prompt():
            self.api.records[op.WEB]['accessSettings']['oauthSettings']['loginHint']='example.test'
            return 'placeholder'
        self.secret.side_effect=during_prompt
        with self.assertRaisesRegex(op.r.Stop,'SETTINGS_CHANGED_DURING_REVIEW'):
            self.run_check()
        self.assertEqual(self.api.write_count,0)

    def test_readback_after_ambiguous_write(self):
        self.api.ambiguous=True
        with self.assertRaises(op.SetupError):
            self.run_check()
        self.assertFalse(self.run_check()['write_this_run'])
        self.assertEqual(self.api.write_count,1)
        self.api.records[op.WEB]['accessSettings']={}
        with self.assertRaisesRegex(op.r.Stop,'PRIOR_WRITE_UNCONFIRMED_NO_RESUBMISSION'):
            self.run_check()
        self.assertEqual(self.api.write_count,1)

    def test_access_error_and_inconsistent_responses_do_not_write(self):
        with patch.object(self.api,'call', side_effect=op.SetupError('GET returned HTTP 403')):
            with self.assertRaisesRegex(op.r.Stop,'WEB_READ_HTTP_403'):
                self.run_check()
        self.api.records[op.WEB]={}
        with self.assertRaisesRegex(op.r.Stop,'SETTINGS_RESOURCE_UNVERIFIED'):
            self.run_check()
        self.secret.assert_not_called()

    def test_malformed_client_is_not_empty(self):
        self.api.records[op.WEB]['accessSettings']['oauthSettings']['clientId'] = False
        with self.assertRaisesRegex(op.r.Stop, 'UNEXPECTED_OAUTH_READ_MODEL'):
            self.run_check()
        self.secret.assert_not_called()
        self.assertEqual(self.api.write_count, 0)

    def test_partial_or_changed_credentials(self):
        self.api.records[op.WEB]['accessSettings']['oauthSettings']['clientSecretSha256']='existing'
        with self.assertRaisesRegex(op.r.Stop,'PARTIAL_CLIENT_PRESERVED'):
            self.run_check()
        self.secret.assert_not_called()
        del self.api.records[op.WEB]['accessSettings']['oauthSettings']['clientSecretSha256']
        self.run_check()
        del self.api.records[op.WEB]['accessSettings']['oauthSettings']['clientSecretSha256']
        with self.assertRaisesRegex(op.r.Stop, 'SECRET_FINGERPRINT_UNAVAILABLE'):
            self.run_check()
        self.api.records[op.WEB]['accessSettings']['oauthSettings']['clientSecretSha256']='wrong'
        with self.assertRaisesRegex(op.r.Stop,'SECRET_FINGERPRINT_DIFFERS'):
            self.run_check()
        self.assertEqual(self.api.write_count,1)
