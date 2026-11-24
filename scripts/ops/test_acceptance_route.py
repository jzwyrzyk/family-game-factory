import copy
import unittest
import release
from test_operations import CloudRunFixture

class GatewayFixture(CloudRunFixture):
    service = 'factory-gateway'
    resource = f'{release.LOCATION}/services/{service}'
    baseline = f'{service}-00001-abc'
    baseline_image = f'{release.LEGACY_REGISTRY}/gateway@sha256:' + '1' * 64
    candidate_image = f'{release.REGISTRY}/gateway@sha256:' + '2' * 64

class AcceptanceRouteTests(unittest.TestCase):
    def fixture(self):
        f = GatewayFixture()
        f.transition('stage'); f.transition('canary')
        return f

    def test_route_lifecycle_preserves_traffic_config_and_existing_tags(self):
        f = self.fixture()
        old = dict(release.traffic_target(f.baseline, 0), tag='retained')
        for field in ('traffic', 'trafficStatuses'): f.state[field] = [*f.state[field], copy.deepcopy(old)]
        before = copy.deepcopy(f.state['template'])
        self.assertEqual(f.transition('acceptance-route-add'), 'ACCEPTANCE_ROUTE_ADDED')
        patch = f.patches[-1][1]
        self.assertEqual(set(patch), {'traffic', 'etag'})
        self.assertIn(old, patch['traffic'])
        self.assertEqual(release.traffic(f.state), {f.baseline:95, f.candidate:5})
        self.assertEqual(f.state['template'], before)
        count = len(f.patches)
        f.transition('acceptance-route-add')
        self.assertEqual(len(f.patches), count)
        self.assertEqual(f.transition('acceptance-route-remove'), 'ACCEPTANCE_ROUTE_REMOVED')
        self.assertEqual(release.pinned_tags(f.state), [old])
        count = len(f.patches); f.transition('acceptance-route-remove')
        self.assertEqual(len(f.patches), count)

    def test_add_requires_canary_ready_pinned_current_candidate(self):
        for change in ('allocation', 'readiness', 'image', 'latest', 'configuration', 'declared'):
            with self.subTest(change=change):
                f = self.fixture()
                if change == 'allocation': f.state['trafficStatuses'] = [release.traffic_target(f.baseline,100)]
                if change == 'readiness': f.revisions[f.candidate]['conditions'] = []
                if change == 'image': f.revisions[f.candidate]['containers'][0]['image'] = f.baseline_image
                if change == 'latest': f.state['latestCreatedRevision'] = f.resource+'/revisions/'+f.baseline
                if change == 'configuration': f.state['template']['timeout'] = '999s'
                if change == 'declared': f.state['traffic'] = [release.traffic_target(f.baseline,100)]
                count = len(f.patches)
                with self.assertRaises(release.ReleaseError): f.transition('acceptance-route-add')
                self.assertEqual(len(f.patches), count)

    def test_conflicting_tag_is_not_reassigned_or_removed(self):
        for operation in ('acceptance-route-add', 'acceptance-route-remove'):
            f = self.fixture()
            tag = dict(release.traffic_target(f.baseline,0),tag='jems-test-'+f.candidate.rsplit('-r-',1)[1])
            for field in ('traffic','trafficStatuses'): f.state[field] = [*f.state[field], copy.deepcopy(tag)]
            count=len(f.patches)
            with self.assertRaisesRegex(release.ReleaseError,'another revision'): f.transition(operation)
            self.assertEqual(len(f.patches),count)

    def test_cleanup_after_promotion_or_rollback_and_unhealthy_candidate(self):
        for operation in ('promote','rollback'):
            f=self.fixture(); f.transition('acceptance-route-add'); f.transition(operation)
            before=release.traffic(f.state)
            f.revisions[f.candidate]['conditions']=[]
            f.transition('acceptance-route-remove')
            self.assertEqual(release.traffic(f.state),before)
            self.assertEqual(release.pinned_tags(f.state),[])

    def test_promotion_removes_only_own_tag_atomically_and_retry_is_idempotent(self):
        f=self.fixture(); f.transition('acceptance-route-add')
        old=dict(release.traffic_target(f.baseline,0), tag='recovery')
        for field in ('traffic','trafficStatuses'): f.state[field]=[*f.state[field],copy.deepcopy(old)]
        count=len(f.patches); f.transition('promote')
        self.assertEqual(len(f.patches),count+1)
        self.assertEqual(release.traffic(f.state),{f.candidate:100})
        self.assertEqual(release.pinned_tags(f.state),[old])
        self.assertIn(f.baseline,f.revisions)
        count=len(f.patches); f.transition('promote')
        self.assertEqual(len(f.patches),count)

    def test_promotion_refuses_conflicting_acceptance_tag_before_write(self):
        f=self.fixture()
        tag=dict(release.traffic_target(f.baseline,0),tag='jems-test-'+f.candidate.rsplit('-r-',1)[1])
        for field in ('traffic','trafficStatuses'): f.state[field]=[*f.state[field],copy.deepcopy(tag)]
        count=len(f.patches)
        with self.assertRaisesRegex(release.ReleaseError,'another revision'): f.transition('promote')
        self.assertEqual(len(f.patches),count)

    def test_already_promoted_cleanup_preserves_allocation(self):
        f=self.fixture(); f.transition('acceptance-route-add')
        tagged=release.pinned_tags(f.state)
        for field in ('traffic','trafficStatuses'):
            f.state[field]=[release.traffic_target(f.candidate,100),*copy.deepcopy(tagged)]
        f.transition('promote')
        self.assertEqual(release.traffic(f.state),{f.candidate:100})
        self.assertEqual(release.pinned_tags(f.state),[])

    def test_fixed_tag_fits_observed_gateway_dns_labels(self):
        f=self.fixture(); f.transition('acceptance-route-add')
        tag=release.pinned_tags(f.state)[0]['tag']
        self.assertEqual(tag,'jems-test-'+f.candidate.rsplit('-r-',1)[1])
        for service_label in ('factory-gateway-ola734esta-ul','factory-gateway-1054529152893'):
            self.assertLessEqual(len(tag+'---'+service_label),63)

    def test_other_service_is_rejected(self):
        f=CloudRunFixture(); f.transition('stage'); f.transition('canary')
        count=len(f.patches)
        with self.assertRaisesRegex(release.ReleaseError,'Gateway-only'): f.transition('acceptance-route-add')
        self.assertEqual(len(f.patches),count)

    def test_wrong_post_update_traffic_is_failure(self):
        f=self.fixture()
        def api(method,path,payload=None):
            result=f.call(method,path,payload)
            if method=='PATCH': f.state['trafficStatuses']=[release.traffic_target(f.candidate,100)]
            return result
        with self.assertRaisesRegex(release.ReleaseError,'changed serving allocation'):
            release.rollout({**f.intent,'operation':'acceptance-route-add'},api)
