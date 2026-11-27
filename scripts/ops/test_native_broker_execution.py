import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import native_broker_execution as op


class ExecutionTests(unittest.TestCase):
    def test_one_build_resume_and_uncertain_response(self):
        build_id = 'ab123456-1234-1234-1234-1234567890ab'
        proof = {'status':'BUILD_VERIFIED_NOT_DEPLOYED','source_sha':op.SOURCE,'archive_sha256':op.ARCHIVE,
                 'build_id':build_id,'image':op.build.IMAGE+'@sha256:'+'d'*64}
        plan = {'approve_plan_sha256':op.PLAN,'plan':{'source_sha':op.SOURCE,'archive_sha256':op.ARCHIVE},'inventory':'CHECKED'}
        with tempfile.TemporaryDirectory() as tmp, patch.object(op.build.publication,'cloud',return_value=[]), \
                patch.object(op.continuation,'invoke') as run, patch.object(op.continuation,'build_status',return_value='SUCCESS'):
            folder = Path(tmp)
            run.side_effect = [plan,{'status':'SUBMITTED_NOT_VERIFIED','source_sha':op.SOURCE,'build_id':build_id},proof,proof]
            self.assertEqual(op.build_once(folder),proof)
            self.assertEqual(op.build_once(folder),proof)
            self.assertEqual(sum('--submit' in c.args[2] for c in run.call_args_list),1)
            (folder/'build-id.json').unlink()
            with self.assertRaisesRegex(op.SetupError,'UNCERTAIN_SUBMISSION_NO_RETRY'): op.build_once(folder)
            self.assertEqual(run.call_count,4)

    def test_staging_canary_promotion_and_rollback_are_broker_only(self):
        baseline={'service':op.SERVICE,'baseline':op.SERVICE+'-abc','source':op.SOURCE}
        image=op.build.IMAGE+'@sha256:'+'f'*64
        revision=op.release.revision_name({**baseline,'image':image})
        original={baseline['baseline']:100}
        canary={baseline['baseline']:95,revision:5}
        promoted={revision:100}
        def current(allocation):
            return {'trafficStatuses':[{'revision':k,'percent':v} for k,v in allocation.items()]}
        with tempfile.TemporaryDirectory() as tmp, patch.object(op,'guard') as guard, patch.object(op.release,'rollout') as apply:
            guard.side_effect=list(map(current,[original,original,canary,promoted,promoted,original]))
            self.assertEqual(op.rollout(Path(tmp),baseline,image),revision)
            op.rollout(Path(tmp),baseline,image,rollback=True)
            self.assertEqual([c.args[0]['operation'] for c in apply.call_args_list],['stage','canary','promote','rollback'])
            self.assertTrue(all(c.args[0]['service']==op.SERVICE for c in apply.call_args_list))
            self.assertEqual(op.saved(Path(tmp),'stage.json')['traffic'],original)

    def test_exact_service_controller_rehearsal(self):
        from test_operations import CloudRunFixture

        class BrokerFixture(CloudRunFixture):
            service = op.SERVICE
            resource = op.BASE
            baseline = op.SERVICE + '-00001-old'
            baseline_image = op.build.IMAGE + '@sha256:' + '1' * 64
            candidate_image = op.build.IMAGE + '@sha256:' + '2' * 64

        cloud = BrokerFixture()
        cloud.state.update(name=op.BASE, uid='existing-service')
        cloud.state['template']['serviceAccount'] = op.broker.BROKER
        cloud.revisions[cloud.baseline] = cloud.revision(cloud.baseline, cloud.state['template'])
        with tempfile.TemporaryDirectory() as tmp, patch.object(op, 'api', cloud.call), \
                patch.object(op, 'service_policy', return_value='private-policy'):
            baseline = op.release.inspect_service(op.SERVICE, op.api)
            baseline.update(source=op.SOURCE, service_uid='existing-service', policy_hash='private-policy')
            candidate = op.rollout(Path(tmp), baseline, cloud.candidate_image)
            op.rollout(Path(tmp), baseline, cloud.candidate_image, rollback=True)
            self.assertEqual([p[0] for p in cloud.patches],
                             [op.BASE + '?updateMask=template,traffic'] + [op.BASE + '?updateMask=traffic'] * 3)
            self.assertEqual([sum(t['percent'] for t in patch['traffic'] if t['revision'] == candidate)
                              for _, patch in cloud.patches], [0, 5, 100, 0])
            self.assertEqual(op.release.traffic(cloud.state), {cloud.baseline:100})
            self.assertIn(cloud.baseline, cloud.revisions)

    def test_failed_stage_readback_never_promotes(self):
        baseline={'service':op.SERVICE,'baseline':'old','source':op.SOURCE}
        cur=lambda rev:{'trafficStatuses':[{'revision':rev,'percent':100}]}
        with tempfile.TemporaryDirectory() as tmp, patch.object(op,'guard',side_effect=[cur('old'),cur('unknown')]), \
                patch.object(op.release,'rollout') as apply:
            with self.assertRaisesRegex(op.SetupError,'ZERO_TRAFFIC_STAGE_UNVERIFIED'):
                op.rollout(Path(tmp),baseline,'image')
            self.assertEqual(apply.call_count,1)

    def test_unknown_native_result_rolls_back_and_prevents_second_dispatch(self):
        baseline={'source':op.SOURCE,'service':op.SERVICE,'baseline':'prior','baselineImage':'old'}
        with tempfile.TemporaryDirectory() as tmp, patch.object(op,'integrated'), patch.object(op,'guard'), \
                patch.object(op,'build_once',return_value={'image':'new@sha256:abc'}), patch.object(op,'command'), \
                patch.object(op,'rollout',return_value='candidate') as apply, patch.object(op.subprocess,'run',return_value=Mock(returncode=2, stdout='{}')) as child:
            folder=Path(tmp)
            op.keep(folder,'rollback.json',baseline)
            with self.assertRaisesRegex(op.SetupError,'IAM_ACCEPTANCE_FAILED'):op.execute('main',folder)
            self.assertTrue(apply.call_args.kwargs['rollback'])
            with self.assertRaisesRegex(op.SetupError,'QUALIFICATION_ALREADY_ATTEMPTED'):op.execute('main',folder)
            child.assert_called_once()


class CoverageTests(unittest.TestCase):
    def test_independent_metric_requires_actual_samples_and_exact_interval(self):
        from datetime import datetime, timezone, timedelta
        import native_settled_coverage as c
        end=datetime.now(timezone.utc).replace(second=0,microsecond=0)
        start=end-timedelta(hours=1)
        client=Mock()
        client.call.return_value={}
        with self.assertRaisesRegex(op.SetupError,'NO_INDEPENDENT_SAMPLES'):
            c.metric_counts(client,'factory-gateway',start,end)
        labels={'service_name':'factory-gateway','project_id':c.setup.PROJECT,'location':c.setup.REGION,'revision_name':'factory-gateway-unit'}
        interval={'startTime':c.utc(start),'endTime':c.utc(end)}
        series={'metricKind':'DELTA','valueType':'INT64','resource':{'type':'cloud_run_revision','labels':labels},
                'metric':{'type':c.METRIC,'labels':{'response_code':'200'}},
                'points':[{'interval':interval,'value':{'int64Value':'3'}}]}
        client.call.return_value={'timeSeries':[series]}
        self.assertEqual(c.metric_counts(client,'factory-gateway',start,end),{('factory-gateway-unit','200'):3})
        interval['startTime']=c.utc(start-timedelta(minutes=1))
        with self.assertRaisesRegex(op.SetupError,'METRIC_INTERVAL_UNVERIFIED'):
            c.metric_counts(client,'factory-gateway',start,end)

    def test_private_log_projection_does_not_request_urls_or_application_data(self):
        from datetime import datetime,timezone,timedelta
        import native_settled_coverage as c
        end=datetime.now(timezone.utc).replace(second=0,microsecond=0)
        client=Mock()
        client.call.return_value={}
        self.assertEqual(c.log_counts(client,'factory-preview',end-timedelta(hours=1),end),{})
        m,path,body=client.call.call_args.args
        self.assertEqual(m,'POST')
        self.assertIn('httpRequest(status)',path)
        self.assertNotIn('requestUrl',path)
        self.assertEqual(body['resourceNames'],[c.setup.VIEW])
