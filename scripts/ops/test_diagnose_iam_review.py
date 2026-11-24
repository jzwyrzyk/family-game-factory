"""Integrity, privacy and no-mutation tests for the two-request IAM diagnostic."""
import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import urllib.error

import diagnose_iam_review as d
from admin_api import SetupError
from test_production_activation import fixture


def records():
    state = fixture(); state['source'] = state['github']['source'] = d.RELEASE_SOURCE
    plan = d.review.make_plan(state)
    first = {'lane': 'publish', 'principal': d.TUPLE['principal'], 'resource': d.TUPLE['fullResourceName'],
             'permission': d.TUPLE['permission'], 'observed_access': 'UNKNOWN'}
    return {'raw-responses.json': [], 'proposed-activation-plan.json': plan,
            'audit.json': {'state': state, 'plan': plan, 'effective_audit': {'probes': [first], 'unknown_count': 66}},
            'summary.json': {'helper_sha': d.ORIGINAL_HELPER, 'release_source': d.RELEASE_SOURCE, 'mutations': 0,
                             'activation_ready': False, 'review_code': plan['review_code'], 'proposed_bindings': [{}] * 11},
            'prior-file-comparison.json': {'files': [{'path': str(d.review.PRIOR_DIRECTORY / 'factory-gateway.json'),
                 'status': 'PRESENT', 'matches_fresh_fields': True, 'complete_baseline_fields': True}]}}


def write_original(path, values):
    path.mkdir(mode=0o700)
    for name, value in values.items(): d.review.private_json(path / name, value)
    manifest = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in path.iterdir()}
    d.review.private_json(path / 'SHA256SUMS.json', manifest)
    return hashlib.sha256((path / 'SHA256SUMS.json').read_bytes()).hexdigest()


def response(operation, code=403, body=None):
    return {'operation': operation, 'http_status': code, 'body': body or {}}


def error_info(reason, **metadata):
    return {'error': {'status': 'PERMISSION_DENIED', 'message': 'PRIVATE MESSAGE', 'details': [{
        '@type': 'type.googleapis.com/google.rpc.ErrorInfo', 'reason': reason, 'domain': 'googleapis.com',
        'metadata': metadata}]}}


class Opener:
    def __init__(self, bodies): self.bodies, self.calls = list(bodies), []
    def open(self, request, timeout):
        self.calls.append((request, timeout))
        code, body = self.bodies.pop(0)
        encoded = body if isinstance(body, bytes) else json.dumps(body).encode()
        if code != 200: raise urllib.error.HTTPError(request.full_url, code, 'PRIVATE HTTP MESSAGE', {}, io.BytesIO(encoded))
        result = io.BytesIO(encoded); result.code = code
        return result


class Integrity(unittest.TestCase):
    def test_original_pin_manifest_and_all_file_hashes_are_required_before_auth(self):
        values = records()
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp); original = base / 'original'
            sha = write_original(original, values)
            with patch.object(d, 'ORIGINAL_MANIFEST', sha), patch.object(d, 'ORIGINAL_REVIEW', values['summary.json']['review_code']):
                self.assertEqual(d.original_evidence(original, sha), values)
                for bad_sha in ('0' * 64, ''):
                    with self.assertRaises(SetupError): d.original_evidence(original, bad_sha)
                (original / 'audit.json').write_text('{}')
                token_calls = []
                with self.assertRaises(SetupError):
                    d.diagnose(original, sha, base / 'output', 'a' * 40, lambda: token_calls.append(True))
                self.assertEqual(token_calls, [])
                self.assertFalse((base / 'output').exists())

    def test_different_helper_or_tuple_cannot_be_rebound_by_rehashing(self):
        for change in ('source', 'tuple'):
            values = records()
            if change == 'source': values['summary.json']['helper_sha'] = 'a' * 40
            else: values['audit.json']['effective_audit']['probes'][0]['principal'] = 'other@example.test'
            with tempfile.TemporaryDirectory() as temp:
                original = Path(temp) / 'original'; sha = write_original(original, values)
                with patch.object(d, 'ORIGINAL_MANIFEST', sha), patch.object(d, 'ORIGINAL_REVIEW', values['summary.json']['review_code']):
                    with self.assertRaises(SetupError): d.original_evidence(original, sha)

    def test_symlink_and_nonprivate_files_are_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'file'; path.write_text('{}'); path.chmod(0o644)
            with self.assertRaises(SetupError): d.read_file(path)
            path.chmod(0o600); link = Path(temp) / 'link'; link.symlink_to(path)
            with self.assertRaises(SetupError): d.read_file(link)


class Classifications(unittest.TestCase):
    def summarize(self, first, second): return d.summarize(records(), [first, second])

    def test_disabled_requires_exact_service_consumer_or_successful_state_read(self):
        for service, consumer, expected in [(d.SERVICE, 'projects/' + d.review.NUMBER, True),
                (d.SERVICE, 'projects/other', False), ('serviceusage.googleapis.com', 'projects/' + d.review.NUMBER, False)]:
            result = self.summarize(response('service_usage'), response('troubleshooter', body=error_info(
                'SERVICE_DISABLED', service=service, consumer=consumer)))
            self.assertEqual('API_DISABLED' in result['findings'], expected)
        result = self.summarize(response('service_usage', 200, {'name': d.SERVICE_NAME, 'state': 'DISABLED'}), response('troubleshooter'))
        self.assertIn('API_DISABLED', result['findings'])

    def test_user_project_rejection_is_not_an_inferred_missing_permission(self):
        result = self.summarize(response('service_usage'), response('troubleshooter', body=error_info('USER_PROJECT_DENIED')))
        self.assertEqual(result['findings'], ['USER_PROJECT_REJECTED'])
        explicit = error_info('IAM_PERMISSION_DENIED', permission='serviceusage.services.use', consumer='projects/' + d.review.NUMBER)
        result = self.summarize(response('service_usage'), response('troubleshooter', body=explicit))
        self.assertEqual(result['findings'], ['QUOTA_PROJECT_PERMISSION_DENIED'])

    def test_generic_403_and_enabled_api_are_not_target_denials(self):
        result = self.summarize(response('service_usage', 200, {'name': d.SERVICE_NAME, 'state': 'ENABLED'}),
                               response('troubleshooter', body={'error': {'status': 'PERMISSION_DENIED', 'message': 'PRIVATE'}}))
        self.assertEqual(result['findings'], ['INDETERMINATE'])
        self.assertEqual(result['single_tuple_access'], 'UNKNOWN')
        self.assertEqual(result['original_effective_unknown_count'], 66)
        self.assertNotIn('PRIVATE', json.dumps(result))

    def test_only_allowlisted_metadata_is_emitted(self):
        body = error_info('IAM_PERMISSION_DENIED', permission='iam.roles.get', service=d.SERVICE,
                          resource='PRIVATE RESOURCE', account='PRIVATE IDENTITY', token='PRIVATE TOKEN')
        body['error']['details'].append({'@type': 'arbitrary', 'value': 'PRIVATE DETAIL'})
        result = self.summarize(response('service_usage'), response('troubleshooter', body=body))
        text = json.dumps(result)
        self.assertNotIn('PRIVATE', text)
        self.assertIn('iam.roles.get', text)
        self.assertIn('EXPLICIT_IAM_PERMISSION_DENIED', result['findings'])

    def test_single_success_does_not_complete_original_66_check_review(self):
        result = self.summarize(response('service_usage', 200, {'name': d.SERVICE_NAME, 'state': 'ENABLED'}),
                               response('troubleshooter', 200, {'overallAccessState': 'CANNOT_ACCESS'}))
        self.assertEqual(result['single_tuple_access'], 'CANNOT_ACCESS')
        self.assertEqual(result['original_effective_unknown_count'], 66)
        self.assertFalse(result['activation_ready'])
        self.assertTrue(result['original_evidence_is_historical'])


class ReadOnlyRequests(unittest.TestCase):
    def test_exact_two_requests_private_results_and_unchanged_originals(self):
        values = records()
        opener = Opener([(200, {'name': d.SERVICE_NAME, 'state': 'ENABLED'}),
                         (403, error_info('USER_PROJECT_DENIED', private='PRIVATE TOKEN'))])
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp); original = base / 'original'; out = base / 'out'
            sha = write_original(original, values)
            before = {p.name: p.read_bytes() for p in original.iterdir()}
            with patch.object(d, 'ORIGINAL_MANIFEST', sha), patch.object(d, 'ORIGINAL_REVIEW', values['summary.json']['review_code']):
                summary = d.diagnose(original, sha, out, 'a' * 40, lambda: 'SECRET ACCESS TOKEN', opener)
                with self.assertRaises(SetupError): d.diagnose(original, sha, out, 'a' * 40, lambda: self.fail('must not get token'), opener)
            self.assertEqual(before, {p.name: p.read_bytes() for p in original.iterdir()})
            self.assertEqual(out.stat().st_mode & 0o777, 0o700)
            self.assertTrue(all(p.stat().st_mode & 0o777 == 0o600 for p in out.iterdir()))
            self.assertIn('PRIVATE TOKEN', (out / 'raw-responses.json').read_text())
            self.assertNotIn('PRIVATE', json.dumps(summary)); self.assertNotIn('SECRET', json.dumps(summary))
            self.assertEqual(summary['original_action_counts'], {'role': 2, 'policy': 10, 'provider': 2, 'variable': 4})
            self.assertEqual(summary['original_proposed_binding_count'], 11)
            self.assertTrue(all(summary['original_providers_disabled'].values()))
            self.assertTrue(all(summary['original_flags_absent'].values()))
            self.assertTrue(summary['original_prior_file_comparisons'][0]['matches_fresh_fields'])
            saved_summary = json.loads((out / 'summary.json').read_text())
            self.assertEqual(saved_summary['diagnostic_helper_sha'], 'a' * 40)
            self.assertIn('observed_at_utc', saved_summary)
            for name, digest in json.loads((out / 'SHA256SUMS.json').read_text()).items():
                self.assertEqual(hashlib.sha256((out / name).read_bytes()).hexdigest(), digest)
        self.assertEqual(len(opener.calls), 2)
        for (req, timeout), (method, url) in zip(opener.calls, d.ROUTES.values()):
            self.assertEqual((req.method, req.full_url, timeout), (method, url, 25))
            self.assertEqual(dict((k.lower(), v) for k, v in req.header_items())['x-goog-user-project'], d.review.PROJECT)
        self.assertIsNone(opener.calls[0][0].data)
        self.assertEqual(json.loads(opener.calls[1][0].data), {'accessTuple': d.TUPLE})

    def test_no_mutation_operation_or_automatic_retry(self):
        opener = Opener([(403, {'error': {'message': 'PRIVATE'}})])
        with self.assertRaises(SetupError): d.request(opener, 'secret', 'enable')
        self.assertEqual(opener.calls, [])
        d.request(opener, 'secret', 'troubleshooter')
        self.assertEqual(len(opener.calls), 1)

    def test_non_json_error_is_private_and_not_classified_by_message(self):
        raw = d.request(Opener([(403, b'PRIVATE SERVICE_DISABLED MESSAGE')]), 'secret', 'troubleshooter')
        self.assertIn('PRIVATE', raw['non_json_body'])
        safe = d.sanitize(raw)
        self.assertNotIn('PRIVATE', json.dumps(safe)); self.assertEqual(safe['error_info'], [])


if __name__ == '__main__': unittest.main()
