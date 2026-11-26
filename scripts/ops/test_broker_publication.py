import base64
import copy
import unittest
from unittest.mock import patch

import build_request_broker as build

SHA = 'b' * 40
HASH = 'a' * 64


def receipt():
    value = build.configuration(SHA)
    value.update(status='SUCCESS', source={'storageSource': {'bucket': build.BUCKET, 'object': 'source/x.tgz'}},
                 sourceProvenance={'resolvedStorageSource': {'bucket': build.BUCKET, 'object': 'source/x.tgz', 'generation': '1'},
                     'fileHashes': {'gs://source/x.tgz': {'fileHash': [{'type': 'SHA256',
                         'value': base64.b64encode(bytes.fromhex(HASH)).decode()}]}}},
                 results={'images': [{'name': build.IMAGE + ':' + SHA, 'digest': 'sha256:' + HASH}]})
    return value


class PublicationTests(unittest.TestCase):
    def test_standard_and_gcloud_urlsafe_hashes_preserve_exact_digest(self):
        actual = '2f450c0d49fb975326dd0c78c93b8edc20fb36fb4d832a7a73da677b1ffdf4f2'
        for encoder in (base64.b64encode, base64.urlsafe_b64encode):
            value = receipt()
            row = next(iter(value['sourceProvenance']['fileHashes'].values()))
            row['fileHash'][0]['value'] = encoder(bytes.fromhex(actual)).decode()
            self.assertTrue(build.predicates(value, SHA, actual)['SOURCE_ARCHIVE_HASH_MISMATCH'])
            self.assertFalse(build.predicates(value, SHA, '0' * 64)['SOURCE_ARCHIVE_HASH_MISMATCH'])
            row['fileHash'] *= 2
            self.assertFalse(build.predicates(value, SHA, actual)['SOURCE_ARCHIVE_HASH_MISMATCH'])

    def test_malformed_hash_encodings_and_noncanonical_bits_fail_closed(self):
        from cloudbuild_hash import sha256_bytes
        valid = base64.urlsafe_b64encode(bytes.fromhex('ff' * 32)).decode()
        for value in ('ff' * 32, valid.rstrip('='), valid + '=', valid + '\n',
                      valid[:-2] + '9=', valid.replace('_', '/', 1),
                      base64.b64encode(b'x' * 31).decode(), 'PRIVATE'):
            with self.assertRaises(ValueError): sha256_bytes(value)

    def test_exact_predicate_codes_and_no_provider_value_leakage(self):
        value = receipt()
        value['artifacts'] = {'images': build.configuration(SHA)['images']}
        result = build.diagnostic(value, SHA, HASH)
        self.assertIsNone(result['first_failed_predicate'])
        self.assertTrue(result['provider_shape']['artifacts_is_exact_images_mirror'])
        self.assertEqual(build.verify(value, SHA, HASH), build.IMAGE + '@sha256:' + HASH)
        value['artifacts']['objects'] = {'location': 'gs://unexpected'}
        with self.assertRaisesRegex(build.BuildVerificationError, '^BUILD_ARTIFACTS_UNEXPECTED$'):
            build.verify(value, SHA, HASH)
        value['serviceAccount'] = 'private-token-marker'
        value['steps'][0]['env'] = ['SECRET=private-token-marker']
        import json
        result = build.diagnostic(value, SHA, HASH)
        self.assertNotIn('private-token-marker', json.dumps(result))
        self.assertEqual(result['first_failed_predicate'], 'BUILD_SERVICE_ACCOUNT_MISMATCH')
        self.assertIn('BUILD_EXECUTABLE_STEPS_MISMATCH', result['failed_predicates'])

    def test_stage_specific_read_errors_suppress_upstream_exception(self):
        with patch.object(build.publication, 'cloud', side_effect=RuntimeError('private-token-marker')):
            with self.assertRaisesRegex(build.BuildVerificationError, '^BUILD_METADATA_READ_FAILED$'):
                build.qualify('12345678-1234-1234-1234-123456789abc', SHA, HASH)

    def test_provider_hash_and_runtime_metadata(self):
        value = receipt()
        value['steps'][0]['status'] = 'SUCCESS'
        self.assertEqual(build.verify(value, SHA, HASH), build.IMAGE + '@sha256:' + HASH)

    def test_wrong_source_identity_step_or_result_rejected(self):
        changes = [lambda v: v.update(serviceAccount='owner'),
                   lambda v: v['steps'][0].update(env=['TOKEN=bad']),
                   lambda v: v.update(secrets=[{}]),
                   lambda v: v.update(artifacts={'images': [build.IMAGE + ':wrong']}),
                   lambda v: v.update(artifacts={'images': build.configuration(SHA)['images'], 'npmPackages': []}),
                   lambda v: v.update(artifacts={'images': build.configuration(SHA)['images'] * 2}),
                   lambda v: v['sourceProvenance'].update(fileHashes={}),
                   lambda v: v['sourceProvenance']['resolvedStorageSource'].update(bucket='other'),
                   lambda v: v['sourceProvenance']['resolvedStorageSource'].pop('generation'),
                   lambda v: v['results']['images'][0].update(digest='latest'),
                   lambda v: v.update(status='WORKING'),
                   lambda v: v['source'].update(gitSource={}),
                   lambda v: v['options'].update(sourceProvenanceHash=['MD5'])]
        for change in changes:
            with self.subTest(change=change):
                value = receipt()
                change(value)
                with self.assertRaises(RuntimeError): build.verify(value, SHA, HASH)
        with self.assertRaises(RuntimeError): build.verify(receipt(), SHA, 'c' * 64)

    def test_no_submission_on_wrong_approval(self):
        with patch.object(build, 'archive', return_value=b'git archive'), \
             patch.object(build.publication, 'preflight'), patch.object(build.publication, 'cloud') as cloud:
            with self.assertRaises(RuntimeError):
                build.main(['--source-sha', SHA, '--submit', '--approve-plan-sha256', 'wrong'])
            cloud.assert_not_called()

    def test_verification_never_submits(self):
        value = receipt()
        build_id = '12345678-1234-1234-1234-123456789abc'
        value.update(id=build_id, projectId=build.PROJECT)
        with patch.object(build.publication, 'cloud', side_effect=[value, {'image_summary': {'digest': 'sha256:' + HASH}}]) as cloud:
            self.assertEqual(build.qualify(build_id, SHA, HASH)['source_sha'], SHA)
            self.assertEqual(cloud.call_args_list[0].args[:2], ('builds', 'describe'))
            self.assertEqual(cloud.call_count, 2)


if __name__ == '__main__': unittest.main()
