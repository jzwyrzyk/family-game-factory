"""Read one generation-pinned build archive in memory; never qualify, extract or persist it."""
import base64
import hashlib
import io
import re
import tarfile
from urllib.parse import quote, urlencode
import urllib.error
import urllib.request
import zlib

from admin_api import NoRedirect, command

MAX_COMPRESSED = 2_000_000
MAX_TAR = 8_000_000
FILES = frozenset(('Dockerfile', 'main.py', 'requirements.txt', 'requirements.lock'))


class SourceError(RuntimeError):
    pass


def require(ok, code):
    if not ok: raise SourceError(code)


def reference(build, bucket):
    provenance = build.get('sourceProvenance', {})
    resolved = provenance.get('resolvedStorageSource', {})
    submitted = build.get('source', {}).get('storageSource', {})
    name, generation = resolved.get('object'), str(resolved.get('generation', ''))
    require(resolved.get('bucket') == bucket and submitted.get('bucket') == bucket,
            'STAGED_SOURCE_BUCKET_MISMATCH')
    require(isinstance(name, str) and re.fullmatch(r'source/[A-Za-z0-9._/-]+', name) and
            all(p not in ('', '.', '..') for p in name.split('/')), 'STAGED_SOURCE_OBJECT_INVALID')
    require(re.fullmatch('[1-9][0-9]{0,24}', generation), 'STAGED_SOURCE_GENERATION_INVALID')
    require(submitted.get('object') == name and
            ('generation' not in submitted or str(submitted['generation']) == generation),
            'STAGED_SOURCE_REFERENCE_MISMATCH')
    hashes = provenance.get('fileHashes', {})
    uri = 'gs://' + bucket + '/' + name
    require(isinstance(hashes, dict) and len(hashes) == 1 and next(iter(hashes)) in
            (uri, uri + '#' + generation), 'PROVENANCE_SOURCE_KEY_MISMATCH')
    values = next(iter(hashes.values())).get('fileHash', [])
    sha256 = [v.get('value') for v in values if v.get('type') == 'SHA256']
    require(len(sha256) == 1 and isinstance(sha256[0], str), 'PROVENANCE_SHA256_AMBIGUOUS')
    try: raw = base64.b64decode(sha256[0], validate=True)
    except (ValueError, TypeError): raise SourceError('PROVENANCE_SHA256_ENCODING_INVALID') from None
    require(len(raw) == 32, 'PROVENANCE_SHA256_ENCODING_INVALID')
    return name, generation, raw.hex()


def fetch(bucket, name, generation):
    # Called only after reference() binds the exact approved bucket/source/generation.
    token = command(['gcloud', 'auth', 'print-access-token', '--quiet'])
    url = ('https://storage.googleapis.com/download/storage/v1/b/' + quote(bucket, safe='') +
           '/o/' + quote(name, safe='') + '?' + urlencode({'alt': 'media', 'generation': generation}))
    # Ask for stored gzip bytes: GCS can otherwise transcode eligible objects.
    # urllib leaves the response bytes encoded; provider-hash comparison remains explicit.
    request = urllib.request.Request(url, method='GET', headers={
        'Authorization': 'Bearer ' + token, 'Accept-Encoding': 'gzip'})
    try:
        with urllib.request.build_opener(NoRedirect()).open(request, timeout=30) as response:
            require(response.status == 200 and response.geturl() == url, 'STAGED_SOURCE_RESPONSE_UNEXPECTED')
            data = response.read(MAX_COMPRESSED + 1)
            require(len(data) <= MAX_COMPRESSED, 'STAGED_SOURCE_TOO_LARGE')
            return data
    except urllib.error.HTTPError as error:
        raise SourceError('STAGED_SOURCE_HTTP_' + str(error.code) if error.code in
                          (301, 302, 303, 307, 308, 400, 401, 403, 404, 429, 500, 503) else
                          'STAGED_SOURCE_HTTP_FAILED') from None
    except (urllib.error.URLError, TimeoutError, OSError):
        raise SourceError('STAGED_SOURCE_TRANSPORT_FAILED') from None


def unpack(data):
    require(isinstance(data, bytes) and len(data) <= MAX_COMPRESSED, 'STAGED_SOURCE_TOO_LARGE')
    require(len(data) >= 18 and data[:3] == b'\x1f\x8b\x08', 'SOURCE_NOT_GZIP')
    try:
        decoder = zlib.decompressobj(31)
        content = decoder.decompress(data, MAX_TAR + 1)
        require(len(content) <= MAX_TAR, 'SOURCE_TAR_TOO_LARGE')
        require(decoder.eof and not decoder.unused_data and not decoder.unconsumed_tail,
                'SOURCE_GZIP_FRAMING_INVALID')
    except zlib.error: raise SourceError('SOURCE_GZIP_INVALID') from None
    return content


def members(content):
    result = {}
    try:
        with tarfile.open(fileobj=io.BytesIO(content), mode='r:') as archive:
            for member in archive:
                require(member.name in FILES and member.name not in result and member.isfile() and
                        not member.pax_headers and 0 <= member.size <= MAX_TAR,
                        'SOURCE_ARCHIVE_MEMBER_UNEXPECTED')
                result[member.name] = {'sha256': hashlib.sha256(archive.extractfile(member).read()).hexdigest(),
                    'size': member.size, 'mode': member.mode}
    except (tarfile.TarError, OSError): raise SourceError('SOURCE_TAR_INVALID') from None
    require(set(result) == FILES, 'SOURCE_ARCHIVE_MEMBERS_MISSING')
    return result


def compare(expected, staged, provider_sha):
    expected_tar, staged_tar = unpack(expected), unpack(staged)
    expected_members, staged_members = members(expected_tar), members(staged_tar)
    actual = hashlib.sha256(staged).hexdigest()
    return {'expected_archive_sha256': hashlib.sha256(expected).hexdigest(),
        'staged_archive_sha256': actual, 'provider_archive_sha256': provider_sha,
        'staged_matches_provider_hash': actual == provider_sha,
        'compressed_bytes_equal': staged == expected, 'tar_bytes_equal': staged_tar == expected_tar,
        'expected_tar_sha256': hashlib.sha256(expected_tar).hexdigest(),
        'staged_tar_sha256': hashlib.sha256(staged_tar).hexdigest(),
        'member_bytes_and_modes_equal': expected_members == staged_members,
        'member_matches': {name: expected_members[name] == staged_members[name] for name in sorted(FILES)},
        'gzip_header': {'expected_flags': expected[3], 'staged_flags': staged[3],
                        'expected_mtime_zero': expected[4:8] == b'\0' * 4,
                        'staged_mtime_zero': staged[4:8] == b'\0' * 4,
                        'expected_xfl': expected[8], 'staged_xfl': staged[8],
                        'expected_os': expected[9], 'staged_os': staged[9]},
        'qualification': 'NOT_GRANTED', 'cloud_mutations': 0, 'archive_files_written': 0}


def inspect(build, expected, bucket, read=fetch):
    try:
        name, generation, provider_sha = reference(build, bucket)
        return {'status': 'PINNED_SOURCE_COMPARED', **compare(expected, read(bucket, name, generation), provider_sha)}
    except Exception as error:
        return {'status': 'PINNED_SOURCE_INSPECTION_STOPPED', 'code': str(error) if isinstance(error, SourceError)
                else 'PINNED_SOURCE_INSPECTION_UNAVAILABLE', 'qualification': 'NOT_GRANTED', 'cloud_mutations': 0}
