import base64
import gzip
import hashlib
import io
import json
import tarfile
import unittest
import urllib.error
from unittest.mock import Mock, patch

import inspect_broker_source as source

BUCKET = 'fixed-source-bucket'


def archive(*, changed=False, extra=False, level=9, mtime=0):
    raw = io.BytesIO()
    with tarfile.open(fileobj=raw, mode='w', format=tarfile.USTAR_FORMAT) as tar:
        for name in sorted(source.FILES | ({'private-extra'} if extra else set())):
            value = (name * 100 + ('CHANGED' if changed and name == 'main.py' else '')).encode()
            member = tarfile.TarInfo(name); member.size = len(value); member.mode = 0o644
            tar.addfile(member, io.BytesIO(value))
    out = io.BytesIO()
    with gzip.GzipFile(fileobj=out, mode='wb', filename='', mtime=mtime, compresslevel=level) as stream:
        stream.write(raw.getvalue())
    return out.getvalue()


def build(data):
    storage = {'bucket': BUCKET, 'object': 'source/fixed.tgz', 'generation': '123'}
    return {'source': {'storageSource': storage}, 'sourceProvenance': {
        'resolvedStorageSource': storage.copy(), 'fileHashes': {'gs://' + BUCKET + '/source/fixed.tgz#123': {
            'fileHash': [{'type': 'SHA256', 'value': base64.b64encode(hashlib.sha256(data).digest()).decode()}]}}}}


class SourceInspectionTests(unittest.TestCase):
    def test_different_compression_is_distinguished_without_qualification(self):
        expected, actual = archive(), archive(level=1, mtime=123)
        read = Mock(return_value=actual)
        result = source.inspect(build(actual), expected, BUCKET, read=read)
        read.assert_called_once_with(BUCKET, 'source/fixed.tgz', '123')
        self.assertTrue(result['staged_matches_provider_hash'])
        self.assertFalse(result['compressed_bytes_equal'])
        self.assertTrue(result['tar_bytes_equal'])
        self.assertTrue(result['member_bytes_and_modes_equal'])
        self.assertEqual(result['qualification'], 'NOT_GRANTED')
        self.assertEqual(result['archive_files_written'], 0)

    def test_changed_source_bytes_and_wrong_provider_hash_remain_visible(self):
        expected, actual = archive(), archive(changed=True)
        result = source.inspect(build(expected), expected, BUCKET, read=Mock(return_value=actual))
        self.assertFalse(result['staged_matches_provider_hash'])
        self.assertFalse(result['tar_bytes_equal'])
        self.assertFalse(result['member_matches']['main.py'])
        self.assertTrue(result['member_matches']['Dockerfile'])
        self.assertNotIn('CHANGED', json.dumps(result))

    def test_missing_generation_foreign_bucket_path_or_hash_key_never_fetches(self):
        expected = archive()
        for mutate in (lambda b: b['sourceProvenance']['resolvedStorageSource'].pop('generation'),
                       lambda b: b['sourceProvenance']['resolvedStorageSource'].update(bucket='other'),
                       lambda b: b['sourceProvenance']['resolvedStorageSource'].update(object='source/../secret'),
                       lambda b: b['sourceProvenance'].update(fileHashes={'private-key': {'fileHash': []}})):
            value = build(expected); mutate(value); read = Mock()
            result = source.inspect(value, expected, BUCKET, read=read)
            read.assert_not_called()
            self.assertEqual(result['status'], 'PINNED_SOURCE_INSPECTION_STOPPED')
            self.assertNotIn('private-key', json.dumps(result))

    def test_extra_member_concatenated_gzip_truncation_and_bomb_stop(self):
        expected = archive()
        for data in (archive(extra=True), expected + expected, expected[:-8], gzip.compress(b'x' * (source.MAX_TAR + 1))):
            result = source.inspect(build(data), expected, BUCKET, read=Mock(return_value=data))
            self.assertEqual(result['status'], 'PINNED_SOURCE_INSPECTION_STOPPED')
            self.assertNotIn('private-extra', json.dumps(result))

    def test_cli_requires_diagnostic_and_all_other_build_predicates(self):
        import build_request_broker as publisher
        args = ['--source-sha', 'b' * 40, '--build-id', '12345678-1234-1234-1234-123456789abc', '--inspect-source']
        with patch.object(publisher, 'source_archive', return_value=archive()) as local, \
             patch.object(publisher, 'cloud_read', return_value={'id': args[3], 'projectId': publisher.PROJECT}), \
             patch.object(publisher, 'diagnostic', return_value={'failed_predicates': ['BUILD_SERVICE_ACCOUNT_MISMATCH']}), \
             patch.object(source, 'inspect') as read:
            with self.assertRaisesRegex(publisher.BuildVerificationError, 'SOURCE_INSPECTION_REQUIRES_DIAGNOSTIC'):
                publisher.main(args)
            local.assert_not_called()
            with self.assertRaisesRegex(publisher.BuildVerificationError, 'SOURCE_INSPECTION_PREREQUISITES_FAILED'):
                publisher.main(args + ['--diagnose'])
            read.assert_not_called()

    def test_http_is_exact_generation_pinned_with_no_redirect_or_token_in_url(self):
        expected = archive(); response = Mock()
        response.status = 200; response.read.return_value = expected
        response.__enter__ = Mock(return_value=response); response.__exit__ = Mock(return_value=None)
        opener = Mock()
        def opened(request, **kwargs):
            response.geturl.return_value = request.full_url
            self.assertEqual(request.get_method(), 'GET')
            self.assertEqual(request.get_header('Accept-encoding'), 'gzip')
            self.assertIn('/source%2Ffixed.tgz?alt=media&generation=123', request.full_url)
            self.assertNotIn('PRIVATE-TOKEN', request.full_url)
            return response
        opener.open.side_effect = opened
        with patch.object(source, 'command', return_value='PRIVATE-TOKEN'), \
             patch.object(source.urllib.request, 'build_opener', return_value=opener) as constructor:
            self.assertEqual(source.fetch(BUCKET, 'source/fixed.tgz', '123'), expected)
            self.assertIsInstance(constructor.call_args.args[0], source.NoRedirect)
            response.read.assert_called_once_with(source.MAX_COMPRESSED + 1)
            for status in (302, 403, 404):
                opener.open.side_effect = urllib.error.HTTPError('private-url', status, 'PRIVATE', {}, None)
                with self.assertRaisesRegex(source.SourceError, '^STAGED_SOURCE_HTTP_' + str(status) + '$'):
                    source.fetch(BUCKET, 'source/fixed.tgz', '123')


if __name__ == '__main__': unittest.main()
