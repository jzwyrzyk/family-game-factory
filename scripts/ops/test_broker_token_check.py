from datetime import datetime, timedelta, timezone
import json
import unittest
from unittest.mock import Mock, patch

import audit_request_diagnostics as audit
import broker_token_check as check
from admin_api import SetupError


class BrokerTokenTests(unittest.TestCase):
    def setUp(self):
        self.emails = check.SOURCES + check.TARGETS
        self.ids = {email: str(110000000000000000000+i) for i,email in enumerate(self.emails)}
        self.api = Mock()
        self.wanted = {(r['principal'],r['fullResourceName'],r['permission']):r['expected'] for r in audit.tuples()}
        def evaluate(method, path, body):
            item = body['accessTuple']
            if check.eligible_tuple({**item,'expected':'CANNOT_ACCESS'}):
                return {'overallAccessState':'UNKNOWN_INFO',
                        'allowPolicyExplanation':{'allowAccessState':'ALLOW_ACCESS_STATE_UNKNOWN_INFO',
                         'explainedPolicies':[{'bindingExplanations':[{
                             'memberships':{'principal://private': {'membership':'MEMBERSHIP_UNKNOWN_UNSUPPORTED'}},
                             'combinedMembership':{'membership':'MEMBERSHIP_UNKNOWN_UNSUPPORTED'}}]}]},
                        'denyPolicyExplanation':{'denyAccessState':'DENY_ACCESS_STATE_NOT_DENIED'}}
            return {'overallAccessState':self.wanted[tuple(item[k] for k in ('principal','fullResourceName','permission'))]}
        self.api.call.side_effect = evaluate
        self.authority = {'permissions':[check.PERMISSION]}
        self.reply = {}
        self.issued = []
        self.mutate_identity = False
        self.reads = 0
        self.approve = Mock(return_value=True)

    def clients(self, host, token, headers):
        self.assertEqual(token, 'operator')
        self.assertEqual(headers, {'x-goog-user-project': check.setup.PROJECT})
        def request(method, path, body=None):
            if host == check.IAM and method == 'GET':
                self.reads += 1
                name = path.split('?')[0].removeprefix('v1/')
                email = name.split('/')[-1]
                return {'name':name,'projectId':check.setup.PROJECT,'email':email,
                        'uniqueId':self.ids[email] + ('8' if self.reads > 4 and self.mutate_identity else '')}
            self.assertEqual(method, 'POST')
            if host == check.IAM:
                self.assertTrue(path.endswith(':testIamPermissions'))
                self.assertEqual(body, {'permissions':[check.PERMISSION]})
                return self.authority
            self.assertEqual(host, check.ISSUER)
            self.assertEqual(body, {'scope':['https://www.googleapis.com/auth/iam'],'lifetime':'300s'})
            email = next(email for email in check.SOURCES if
                         path == 'v1/projects/-/serviceAccounts/' + self.ids[email] + ':generateAccessToken')
            self.issued.append(email)
            return {'accessToken':'secret-token-'+email,
                    'expireTime':(datetime.now(timezone.utc)+timedelta(seconds=295)).isoformat()}
        return Mock(call=Mock(side_effect=request))

    def caller(self, token):
        self.assertIn(token, ['secret-token-'+email for email in self.issued])
        def probe(url, wanted):
            self.assertIn(url, [check.IAM+'/v1/projects/'+check.setup.PROJECT+'/serviceAccounts/'+self.ids[email]
                                +':testIamPermissions' for email in check.TARGETS])
            self.assertEqual(wanted, [check.PERMISSION])
            if isinstance(self.reply, Exception):
                raise self.reply
            return self.reply
        return Mock(permissions=probe)

    def collect(self):
        with patch.object(check,'Http',side_effect=self.clients), patch.object(check,'Google',side_effect=self.caller):
            result = audit.audit(self.api,lambda _:True,subject_check=lambda rows:check.verify(rows,'operator',approve=self.approve))
        self.assertNotIn('secret-token-',json.dumps(result))
        return result

    def test_actual_accounts_four_negatives_then_full_live_roster(self):
        report = self.collect()
        self.assertEqual(report['status'],'FINITE_POLICY_CHECKS_PASSED')
        self.assertEqual(len(report['checks']),77)
        rows = [r for r in report['checks'] if r['stage']=='subject_test_iam_permissions']
        self.assertEqual([r['row'] for r in rows],[29,35,65,71])
        self.assertTrue(all(r['troubleshooter_status']=='UNKNOWN_INFO' and r['observed']=='CANNOT_ACCESS' for r in rows))
        self.assertCountEqual(self.issued, check.SOURCES)
        self.approve.assert_called_once()
        self.assertEqual(self.reads,8)

    def test_permission_preflight_or_decline_never_issues(self):
        for auth,consent,status in [({},True,'ADMIN_ISSUANCE_AUTHORITY_ABSENT'),
                ({'permissions':[check.PERMISSION]},False,'ISSUANCE_NOT_APPROVED')]:
            self.authority,self.approve.return_value = auth,consent
            report = self.collect()
            self.assertEqual(len(report['checks']),4)
            self.assertEqual(report['credential_check'],{'status':status,'issuance_requests':0})
            self.assertEqual(self.issued,[])

    def test_unexpected_grant_stops_immediately(self):
        self.reply = {'permissions':[check.PERMISSION]}
        report = self.collect()
        self.assertEqual(audit.summary(report)['observed'],{'UNKNOWN':3,'CAN_ACCESS':1})
        self.assertEqual(len(self.issued),1)
        self.assertEqual(report['status'],'NOT_ACCEPTED')

    def test_malformed_denied_or_replaced_target_never_passes(self):
        for response,change in [({'permissions':None},False),({'error':{}},False),
                                (SetupError('unavailable'),False),({},True)]:
            self.reads = 0
            self.reply,self.mutate_identity = response,change
            report = self.collect()
            self.assertEqual(audit.summary(report)['observed'],{'UNKNOWN':4})

    def test_relevant_conditional_policy_keeps_native_check_closed(self):
        original = self.api.call.side_effect
        def conditional(*args):
            result = original(*args)
            if 'allowPolicyExplanation' in result:
                binding = result['allowPolicyExplanation']['explainedPolicies'][0]['bindingExplanations'][0]
                binding['condition'] = {'expression':'private'}
            return result
        self.api.call.side_effect = conditional
        report = self.collect()
        self.assertEqual(report['credential_check']['status'],'OTHER_IAM_RESULT')
        self.approve.assert_not_called()

    def test_default_lane_never_uses_caller_credentials(self):
        with patch.object(check,'verify',side_effect=AssertionError):
            result = audit.audit(self.api,lambda _:True,unresolved_first=True)
        self.assertEqual(len(result['checks']),12)
        self.assertNotIn('credential_check',result)

    def test_other_unknowns_or_explicit_grants_cannot_trigger_issuance(self):
        for access in ('CAN_ACCESS','UNKNOWN_INFO','UNKNOWN_CONDITIONAL'):
            self.api.call.side_effect = None
            self.api.call.return_value = {'overallAccessState':access}
            self.assertEqual(self.collect()['credential_check']['status'],'OTHER_IAM_RESULT')
            self.approve.assert_not_called()


if __name__ == '__main__':
    unittest.main()
