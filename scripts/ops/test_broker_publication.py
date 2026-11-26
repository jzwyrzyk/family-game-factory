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
    def test_provider_hash_and_runtime_metadata(self):
        value = receipt()
        value['steps'][0]['status'] = 'SUCCESS'
        self.assertEqual(build.verify(value, SHA, HASH), build.IMAGE + '@sha256:' + HASH)

    def test_wrong_source_identity_step_or_result_rejected(self):
        changes = [lambda v: v.update(serviceAccount='owner'),
                   lambda v: v['steps'][0].update(env=['TOKEN=bad']),
                   lambda v: v.update(secrets=[{}]),
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
