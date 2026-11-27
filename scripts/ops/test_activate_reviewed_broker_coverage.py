from copy import deepcopy
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import activate_reviewed_broker_coverage as a
from test_operations import CloudRunFixture


class AttestationTests(unittest.TestCase):
    def test_only_reviewed_later_view_events_are_accepted(self):
        class Client:
            def call(self,method,path,body):
                self.request=body
                if 'protoPayload(' in path:
                    raise a.SetupError('POST limited read returned HTTP 400')
                return self.response
        client=Client()
        events=[{'timestamp':stamp,'protoPayload':{'methodName':'google.logging.v2.ConfigServiceV2.CreateView',
                 'resourceName':a.op.broker.VIEW,'status':{'code':code}}} for stamp,code in
                [('2026-11-26T15:37:05.390435979Z',3),('2026-11-26T17:20:23.557065071Z',0)]]
        client.response={'entries':events}
        a.reviewed_events(client,a.coverage.instant('2026-11-27T19:35:00Z'))
        self.assertIn('protoPayload.methodName="google.logging.v2.ConfigServiceV2.CreateView"', client.request['filter'])
        self.assertIn('protoPayload.resourceName="'+a.op.broker.VIEW+'"', client.request['filter'])
        events.pop()
        with self.assertRaisesRegex(a.SetupError,'ROUTING_HISTORY_CHANGED'):
            a.reviewed_events(client,a.coverage.instant('2026-11-27T19:35:00Z'))

    def test_public_failure_reports_only_phase_and_canonical_status(self):
        self.assertEqual(a.stop_detail(a.SetupError('POST https://private-target returned HTTP 400')), 'HTTP_400')
        self.assertEqual(a.stop_detail(a.SetupError('arbitrary provider detail')), 'SetupError')

    def test_exact_tuple_stage_promote_verify_and_restore_on_incomplete_readback(self):
        from contextlib import ExitStack
        class Broker(CloudRunFixture):
            service = a.op.SERVICE
            resource = a.op.BASE
            baseline = a.PREVIOUS
            baseline_image = a.IMAGE
        for fail in (False,True):
            with self.subTest(fail=fail), tempfile.TemporaryDirectory() as tmp, ExitStack() as mocks:
                folder=Path(tmp)
                clock=mocks.enter_context(patch.object(a,'datetime'))
                clock.now.return_value=a.coverage.instant('2026-11-27T20:00:00Z')
                cloud=Broker()
                cloud.state['template']['containers'][0]['env']=[{'name':'JEMS_LOG_BUCKET_LOCATION','value':'global'}]
                cloud.state['template']['serviceAccount']=a.op.broker.BROKER
                cloud.state['scaling']={'maxInstanceCount':1}
                cloud.revisions[a.PREVIOUS]=cloud.revision(a.PREVIOUS,cloud.state['template'])
                baseline={'configuration':a.op.release.fingerprint(cloud.state['template'])}
                hist={s:[{'revision':s+'-abc','status':'200','logs':n,'metric':n}] for s,n in a.COUNTS.items()}
                routing={'ancestors':[],'default_sink':{'name':'_Default','filter':'NOT LOG_ID("other")'}}
                accepted={'image':a.IMAGE,'serving_revision':a.PREVIOUS,'artifact_sha256':a.NATIVE_DIGEST,'native_run':'46056038814'}
                evidence={'operator_source':'377f58966e585eea4e21dec783b7593bd0070b85','accepted':accepted,'start_utc':a.START,'end_utc':a.END,
                          'routing_checks':{'bucket_active':True,'retention_days':30,'restricted_fields_present':False,'view_filter_matches':True,
                          'sink_targets_bucket':True,'active_sink_exclusions':0,'ancestor_intercepts':0},'routing':routing,
                          'counts_by_revision_status':hist,'routing_history':{'projects/'+a.op.broker.PROJECT:2,'sink_errors_in_interval':0},
                          'services':{s:{'comparison':'MATCH','view_entries':n,'independent_requests':n,'max_ingestion_seconds':1} for s,n in a.COUNTS.items()}}
                for name,data in [('accepted.json',accepted),('rollback.json',baseline),(a.RECEIPT,evidence)]:
                    a.op.keep(folder,name,data)
                for obj,key,opts in [(a.op,'integrated',{}),(a,'command',{'return_value':'test'}),(a,'reviewed_events',{}),
                    (a.coverage,'collect',{'return_value':deepcopy(evidence)}),(a.coverage,'routing_history',{'return_value':evidence['routing_history']}),
                    (a.op,'guard',{'side_effect':lambda _:cloud.call('GET',a.op.BASE)}),(a.op,'api',{'side_effect':cloud.call}),
                    (a.op.release,'cloud_api',{'return_value':cloud.call})]:
                    mocks.enter_context(patch.object(obj,key,**opts))
                read=mocks.enter_context(patch.object(a,'read_run'))
                if fail:
                    read.side_effect=a.SetupError('NATIVE_COVERAGE_UNVERIFIED')
                    with self.assertRaisesRegex(a.SetupError,'NATIVE_COVERAGE_UNVERIFIED'): a.run(folder,'test-source')
                    self.assertEqual(a.op.release.traffic(cloud.state),{a.PREVIOUS:100})
                else:
                    read.side_effect=['1','2','3']
                    result=a.run(folder,'test-source')
                    self.assertEqual(result['status'],'DATED_BROKER_COVERAGE_ACCEPTED')
                    self.assertEqual(a.op.release.traffic(cloud.state),{result['serving_revision']:100})
                self.assertEqual([path for path,_ in cloud.patches],
                                 [a.op.BASE+'?updateMask=template,traffic']+[a.op.BASE+'?updateMask=traffic']*(2 if fail else 1))
                staged=cloud.patches[0][1]
                self.assertEqual(staged['traffic'],a.target(a.PREVIOUS))
                self.assertEqual(a.op.release.image(staged['template']),a.IMAGE)
                self.assertEqual(len(staged['template']['containers'][0]['env']),5)

    def test_federation_summary_flags_unexpected_iam_or_resource_changes(self):
        import prepare_accepted_federation_plan as federation
        before={'disabled':True,'condition':'reviewed'}
        plan={'complete':True,'checks':[{'status':'pass'}],'resource_changes':[
            {'mode':'managed','address':address,'change':{'actions':['update'],'before':before,'after':{**before,'disabled':False}}}
            for address in (federation.POOL,federation.PROVIDER)] + [
            {'mode':'managed','address':f'existing.{n}','change':{'actions':['no-op']}} for n in range(25)]}
        self.assertTrue(federation.summarize(plan)['expected_disabled_field_updates'])
        plan['resource_changes'][1]['change']['after']['condition']='changed'
        self.assertFalse(federation.summarize(plan)['expected_disabled_field_updates'])
