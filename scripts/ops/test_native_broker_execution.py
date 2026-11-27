import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import native_broker_execution as op


class ExecutionTests(unittest.TestCase):
    def test_provider_error_retains_operation_and_status_only(self):
        client = Mock()
        client.call.side_effect = op.SetupError('PATCH private-target returned HTTP 400')
        with self.assertRaisesRegex(op.SetupError, r'^BROKER_STAGE_HTTP_400$'):
            op.run_request(client, 'STAGE', 'PATCH', 'private-target', {})
        client.call.side_effect = op.SetupError('sensitive transport detail')
        with self.assertRaisesRegex(op.SetupError, r'^BROKER_POLL_STAGE_RESPONSE_UNAVAILABLE$'):
            op.run_request(client, 'POLL_STAGE', 'GET', 'private-operation')

    def test_resume_only_reverifies_existing_build(self):
        build_id = 'ab123456-1234-1234-1234-1234567890ab'
        proof = {'status':'BUILD_VERIFIED_NOT_DEPLOYED', 'source_sha':op.SOURCE, 'archive_sha256':op.ARCHIVE,
                 'build_id':build_id, 'image':op.broker.publication.IMAGE+'@sha256:'+'d'*64}
        with tempfile.TemporaryDirectory() as tmp, patch.object(op.continuation, 'invoke', return_value=proof) as run:
            folder = Path(tmp)
            with self.assertRaisesRegex(op.SetupError, 'STAGED_BUILD_RECEIPTS_REQUIRED'):
                op.verify_saved_build(folder)
            run.assert_not_called()
            for name, value in [('build-id.json', {'id':build_id}), ('verified-build.json', proof), ('stage.json', {})]:
                op.keep(folder, name, value)
            self.assertEqual(op.verify_saved_build(folder), proof)
            run.assert_called_once_with(op.SOURCE, 'broker-build', ['--build-id', build_id], Path.home())
            run.return_value = {**proof, 'image':'different-image'}
            with self.assertRaisesRegex(op.SetupError, 'VERIFIED_BUILD_CHANGED'):
                op.verify_saved_build(folder)

    def test_single_target_resume_and_rollback(self):
        from test_operations import CloudRunFixture

        class BrokerFixture(CloudRunFixture):
            service = op.SERVICE
            resource = op.BASE
            baseline = op.ROLLBACK_REVISION
            baseline_image = op.broker.publication.IMAGE + '@sha256:' + '1' * 64
            candidate_image = op.broker.publication.IMAGE + '@sha256:' + '2' * 64

        cloud = BrokerFixture()
        cloud.state.update(name=op.BASE, uid='existing-service', scaling={'maxInstanceCount': 1})
        cloud.state['template']['serviceAccount'] = op.broker.BROKER
        cloud.revisions[cloud.baseline] = cloud.revision(cloud.baseline, cloud.state['template'])
        with tempfile.TemporaryDirectory() as tmp, patch.object(op, 'api', cloud.call), \
                patch.object(op, 'service_policy', return_value='private-policy'):
            folder = Path(tmp)
            baseline = op.release.inspect_service(op.SERVICE, op.api)
            baseline.update(source=op.SOURCE, service_uid='existing-service', policy_hash='private-policy')
            intent = {**baseline, 'image':cloud.candidate_image}
            candidate = op.release.revision_name(intent)
            op.release.rollout({**intent, 'operation':'stage'}, cloud.call)
            cloud.state['latestReadyRevision'] = op.BASE + '/revisions/' + cloud.baseline
            op.keep(folder, 'stage.json', {'revision':candidate,'image':cloud.candidate_image,'traffic':{cloud.baseline:100}})
            cloud.patches.clear()
            cloud.state['scaling'] = {'maxInstanceCount': 2}
            with self.assertRaisesRegex(op.SetupError, 'BROKER_CONFIGURATION_CHANGED'):
                op.rollout(folder, baseline, cloud.candidate_image)
            cloud.state['scaling'] = {'maxInstanceCount': 1}
            cloud.revisions[candidate]['conditions'] = []
            with self.assertRaisesRegex(op.SetupError, 'REVISION_PROOF_MISMATCH'):
                op.rollout(folder, baseline, cloud.candidate_image)
            self.assertEqual(cloud.patches, [])
            cloud.revisions[candidate] = cloud.revision(candidate, cloud.state['template'])
            self.assertEqual(op.rollout(folder, baseline, cloud.candidate_image), candidate)
            self.assertEqual(op.rollout(folder, baseline, cloud.candidate_image), candidate)
            cloud.revisions[candidate]['conditions'] = []
            op.rollout(folder, baseline, cloud.candidate_image, rollback=True)
            self.assertEqual([path for path, _ in cloud.patches], [op.BASE + '?updateMask=traffic'] * 2)
            self.assertEqual([data['traffic'] for _, data in cloud.patches],
                             [[op.release.traffic_target(name, 100)] for name in (candidate, cloud.baseline)])
            self.assertEqual(cloud.state['scaling'], {'maxInstanceCount': 1})

    def test_77_passes_require_the_verified_github_artifact_digest(self):
        import json
        image = op.broker.publication.IMAGE + '@sha256:' + 'a' * 64
        native = {'status':'NATIVE_PERMISSIONS_VERIFIED', 'workflow_source':'main', 'broker_digest':image.split('@')[1],
                  'broker_revision':'candidate', 'run_id':'101'}
        baseline = {'source':op.SOURCE, 'service':op.SERVICE, 'baseline':op.ROLLBACK_REVISION, 'baselineImage':'old'}
        for digest, accepted in [('sha256:' + 'b'*64, True), ('b'*64, False), ('sha256:malformed', False)]:
            with self.subTest(digest=digest), tempfile.TemporaryDirectory() as tmp, patch.object(op, 'integrated'), \
                    patch.object(op, 'guard'), patch.object(op, 'verify_saved_build', return_value={'image':image,'build_id':'id'}), \
                    patch.object(op, 'rollout', return_value='candidate') as apply, patch.object(op.subprocess, 'run') as child:
                folder = Path(tmp)
                op.keep(folder, 'rollback.json', baseline)
                report = {'broker_iam':'FINITE_POLICY_CHECKS_PASSED','passed':77,'checks':77,'failures':[],
                          'credential_check':{**native,'artifact_sha256':digest}}
                child.return_value = Mock(returncode=0, stdout=json.dumps(report))
                if accepted:
                    self.assertEqual(op.execute('main', folder)['artifact_sha256'], digest)
                    self.assertEqual(op.saved(folder, 'accepted.json')['native_run'], '101')
                    apply.assert_called_once()
                else:
                    with self.assertRaisesRegex(op.SetupError, 'NATIVE_EVIDENCE_UNVERIFIED'):
                        op.execute('main', folder)
                    self.assertTrue(apply.call_args.kwargs['rollback'])
                    self.assertFalse((folder/'accepted.json').exists())

    def test_unknown_native_result_rolls_back_and_prevents_second_dispatch(self):
        baseline={'source':op.SOURCE,'service':op.SERVICE,'baseline':op.ROLLBACK_REVISION,'baselineImage':'old'}
        with tempfile.TemporaryDirectory() as tmp, patch.object(op,'integrated'), patch.object(op,'guard'), \
                patch.object(op,'verify_saved_build',return_value={'image':'new@sha256:abc'}), patch.object(op,'command'), \
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

    def test_population_uses_independent_samples_and_preserves_canary_preference(self):
        import native_settled_coverage as c
        from datetime import timedelta
        first = c.instant('2026-11-24T02:19:00Z')
        hour = timedelta(hours=1)
        later = first + 24*hour
        times = {s:[first+hour/2, later] for s in c.SERVICES}
        self.assertEqual(c.select_interval(times,first,later), (first, first+hour))
        times[c.SERVICES[0]] = [later]
        self.assertEqual(c.select_interval(times,first,later), (later-hour,later))
        times[c.SERVICES[0]] = []
        self.assertIsNone(c.select_interval(times,first,later))

    def test_sink_filter_sampling_or_unknown_expression_needs_review(self):
        import native_settled_coverage as c
        self.assertEqual(c.sink_includes_requests({'name':'_Default','filter':'NOT LOG_ID("other")'}), 'ONLY_OTHER_LOGS_EXCLUDED')
        for expression in ('NOT LOG_ID("run.googleapis.com/requests")', 'sample(insertId, 0.5)', 'LOG_ID("other")'):
            self.assertEqual(c.sink_includes_requests({'name':'_Default','filter':expression}), 'REVIEW_FILTER')
