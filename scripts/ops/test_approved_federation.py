import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import apply_approved_federation as op
from test_verify_nonproduction_completion import post_plan


class FederationTests(unittest.TestCase):
    def setUp(self):
        self.expected = {op.planner.POOL,op.planner.PROVIDER,op.r.BUDGET} | {f'google_project_service.api[{i}]' for i in range(24)}

    def plan(self, activated=False):
        plan = post_plan(self.expected)
        for row in plan['resource_changes']:
            if row['address'] in (op.planner.POOL,op.planner.PROVIDER):
                row['change'] = {'actions':['no-op'] if activated else ['update'],
                                 'before':{'disabled':not activated},'after':{'disabled':False}}
        return plan

    def test_scopes(self):
        for activated in (False,True):
            plan = self.plan(activated)
            op.verify_rows(plan,self.expected,activated)
            for mutate in (
                lambda p:p['resource_changes'][0]['change'].update(actions=['delete','create']),
                lambda p:p['resource_changes'].pop(),
                lambda p:p['output_changes']['configuration_identifiers'].update(actions=['update']),
                lambda p:p['resource_drift'][0]['change']['after'].update(display_name='changed'),
                lambda p:p['checks'].pop(),
            ):
                changed = self.plan(activated)
                mutate(changed)
                with self.assertRaises(op.r.Stop):
                    op.verify_rows(changed,self.expected,activated)
        plan = self.plan()
        row = next(x for x in plan['resource_changes'] if x['address']==op.planner.PROVIDER)
        row['change']['after']['attribute_condition'] = 'true'
        with self.assertRaises(op.r.Stop):
            op.verify_rows(plan,self.expected,False)

    def test_cache_copy_and_refusal(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            failed = root/op.FAILED
            failed.mkdir(mode=0o700)
            cache = failed/'.terraform/providers'
            package = cache/'registry.terraform.io/hashicorp/google/7.46.2/linux_amd64'
            package.mkdir(parents=True)
            unknown = package/'terraform.tfstate'
            unknown.write_bytes(b'preserve')
            with self.assertRaisesRegex(op.r.Stop,'CACHE_CONTENT_UNEXPECTED'):
                op.relocate_cache(failed,root)
            self.assertTrue(unknown.exists())
            binary = package/'terraform-provider-google_v7.46.2_x5'
            unknown.rename(binary)
            backup = op.relocate_cache(failed,root)
            self.assertEqual((backup/binary.relative_to(cache)).read_bytes(),b'preserve')
            self.assertFalse(cache.exists())
            self.assertEqual(op.relocate_cache(failed,root),backup)

    def test_one_time_or_partial_marker_stops_before_plan_or_cloud(self):
        with tempfile.TemporaryDirectory() as folder:
            home = Path(folder)
            parent = home/'work/jems-nonprod-state/partial-recovery'
            parent.mkdir(mode=0o700,parents=True)
            (home/'work/jems-operations-recovery').mkdir(mode=0o700)
            op.r.write_new(parent/'operator.lock',b'')
            op.r.write_new(parent/'federation-apply-started.json',{'intent':True})
            with patch.object(Path,'home',return_value=home), patch.object(op,'SCRATCH',home), \
                 patch.object(op.r,'source_identity'), patch.object(op.r,'Reader') as cloud:
                for approval,code in [('other','EXACT_APPROVAL_REQUIRED'),(op.PLAN,'APPLY_ALREADY_STARTED')]:
                    with self.assertRaisesRegex(op.r.Stop,code):
                        op.run('source',approval)
                cloud.assert_not_called()


if __name__=='__main__':
    unittest.main()
