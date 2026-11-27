import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from zipfile import ZipFile

import verify_nonproduction_completion as verify
from test_nonproduction_recovery import iap_state

r = verify.r
POOL = 'google_iam_workload_identity_pool.github'


def post_plan(expected):
    before = {'budget_filter': [{'projects': ['projects/' + r.NUMBER],
              'credit_types_treatment': 'INCLUDE_ALL_CREDITS', **dict.fromkeys(verify.FILTERS)}]}
    after = copy.deepcopy(before)
    after['budget_filter'][0].update({k: [] for k in verify.FILTERS})
    values = {r.BUDGET: after, POOL: {'disabled': True}, r.PROVIDER: {'disabled': True}}
    rows = [{'address': a, 'mode': 'managed', 'change': {'actions': ['no-op'], 'after': values.get(a, {})}}
            for a in sorted(expected)]
    return {'terraform_version': '1.13.5', 'complete': True, 'errored': False, 'checks': [{'status': 'pass'}]*3,
            'resource_drift': [{'address': r.BUDGET, 'mode': 'managed',
                                'change': {'actions': ['update'], 'before': before, 'after': after}}],
            'resource_changes': rows, 'output_changes': {'configuration_identifiers': {'actions': ['no-op']}}}


class CompletionTests(unittest.TestCase):
    def test_only_reported_empty_collections_with_no_planned_actions_pass(self):
        expected = {r.BUDGET, r.PROVIDER, POOL}
        verify.verify_plan(post_plan(expected), expected)
        for mutate in [
                lambda p: p.update(complete=False), lambda p: p.update(errored=True),
                lambda p: p.update(deferred_changes=[{}]), lambda p: p['checks'][0].update(status='unknown'),
                lambda p: p['resource_changes'].pop(), lambda p: p['resource_changes'][0]['change'].update(actions=['create']),
                lambda p: p['resource_changes'][0]['change'].update(importing={'id': 'budget'}),
                lambda p: p['output_changes']['configuration_identifiers'].update(actions=['update']),
                lambda p: p['resource_drift'].append(p['resource_drift'][0]),
                lambda p: p['resource_drift'][0].update(address=POOL),
                lambda p: p['resource_drift'][0]['change']['after']['budget_filter'][0].update(subaccounts=['other']),
                lambda p: p['resource_drift'][0]['change']['after']['budget_filter'][0].update(projects=[]),
                lambda p: p['resource_drift'][0]['change']['after'].update(amount=[]),
                lambda p: next(x for x in p['resource_changes'] if x['address']==r.PROVIDER)['change']['after'].update(disabled=False)]:
            plan = post_plan(expected)
            mutate(plan)
            with self.subTest(mutate=mutate), self.assertRaises(r.Stop):
                verify.verify_plan(plan, expected)

    def test_exact_artifacts_integrity_generation_and_idempotence(self):
        with tempfile.TemporaryDirectory() as t:
            original = Path(t)
            parent = original/'partial-recovery'
            folder = parent/('attempt-'+'a'*32)
            folder.mkdir(parents=True, mode=0o700)
            parent.chmod(0o700)
            state = dict(iap_state(), version=4, lineage='original', serial=55)
            recorded = {r.IAP_IDENTITY, POOL} | {'sample.r'+str(i) for i in range(23)}
            for address in sorted((recorded | r.REMAINING) - {r.IAP_IDENTITY}):
                kind, name = address.split('.')
                state['resources'].append({'mode':'managed','type':kind,'name':name,'instances':[{}]})
            r.write_new(folder/'terraform.tfstate', state)
            hashes = r.evidence_hashes(original)
            receipt = {'source_sha':verify.APPLIED_SOURCE,'original_dir':str(original),'original_files':hashes,
                       'existing_resources':sorted(recorded),'inputs':{},'plan_sha256':r.sha(b'plan'),
                       'state_lineage':'original','state_serial':25,'recorded_iap_identity':r.recorded_iap_identity(state)}
            approval = r.digest(receipt)
            r.write_new(folder/'reviewed-recovery.json',receipt)
            r.write_new(folder/'remaining.tfplan',b'plan')
            r.write_new(parent/'apply-started',{'successor':str(folder),'source':verify.APPLIED_SOURCE,'approval':approval})
            r.write_new(folder/'apply-started',{'approval':approval})
            post = folder/'post-apply.tfplan'
            with ZipFile(post, 'w') as archive:
                archive.writestr('tfstate',json.dumps({'lineage':'original','serial':55}))
            post.chmod(0o600)
            checksum=r.sha(post.read_bytes())
            with patch.object(r,'original_evidence',return_value=(hashes,{},None,recorded)), \
                 patch.object(r,'command',return_value=json.dumps(post_plan(recorded | r.REMAINING))) as run:
                for wrong_approval, wrong_plan in [('wrong',checksum),(approval,'wrong')]:
                    with self.assertRaises(r.Stop):
                        verify.verify(original,wrong_approval,wrong_plan,'source')
                self.assertFalse((folder/'completed.json').exists())
                result=verify.verify(original,approval,checksum,'source')
                self.assertEqual(result['state_instances'],27)
                self.assertEqual(result,verify.verify(original,approval,checksum,'source'))
                self.assertTrue(all(c.args[0]==['terraform','show','-json',str(post)] for c in run.call_args_list))
                self.assertEqual(result,r.read_json(folder/'completed.json'))
                state['serial']+=1
                (folder/'terraform.tfstate').write_text(json.dumps(state))
                with self.assertRaisesRegex(r.Stop,'SUCCESSOR_GENERATION_CHANGED'):
                    verify.verify(original,approval,checksum,'source')
                self.assertEqual(result,r.read_json(folder/'completed.json'))
