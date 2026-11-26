#!/usr/bin/env python3
"""Source-bound broker publication using the existing approved Cloud Build lane.

Offline by default. --check only inventories. --submit requires the plan hash;
--build-id verifies an existing build once and never submits or polls/retries it.
No credentials, deployment, IAM edits or raw build logs in output.
"""
import argparse
from cloudbuild_hash import exact_sha256
import gzip
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import re
import sys
import tarfile
import tempfile
from operation_journal import record

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('existing_service_build', ROOT / 'scripts/deployment/build.py')
publication = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publication)
PROJECT, BUILDER = publication.PROJECT, publication.BUILDER
REGION = 'us-east5'
BUCKET = PROJECT + '-service-builds-' + REGION
IMAGE = f'{REGION}-docker.pkg.dev/{PROJECT}/factory-services/request-broker'
FILES = ('Dockerfile', 'main.py', 'requirements.txt', 'requirements.lock')


class BuildVerificationError(RuntimeError):
    """A fixed public code, never upstream exception text or credential material."""
    def __init__(self, code):
        self.code = code
        super().__init__(code)


def require(ok, code):
    if not ok:
        raise BuildVerificationError(code)


def cloud_read(code, *args):
    try:
        return publication.cloud(*args)
    except Exception:
        raise BuildVerificationError(code) from None


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def archive(sha, *, require_head=True):
    require(re.fullmatch('[a-f0-9]{40}', sha or ''), 'SOURCE_SHA_INVALID')
    if require_head:
        require(publication.run(['git', 'rev-parse', 'HEAD'], ROOT).decode().strip() == sha, 'SOURCE_HEAD_MISMATCH')
    require(not publication.run(['git', 'status', '--porcelain', '--untracked-files=all'], ROOT), 'SOURCE_CHECKOUT_DIRTY')
    output = io.BytesIO()
    with gzip.GzipFile(fileobj=output, mode='wb', filename='', mtime=0) as compressed:
        with tarfile.open(fileobj=compressed, mode='w', format=tarfile.USTAR_FORMAT) as tar:
            for name in sorted(FILES):
                content = publication.run(['git', 'show', sha + ':ops/request-broker/' + name], ROOT)
                info = tarfile.TarInfo(name)
                info.size, info.mode = len(content), 0o644
                tar.addfile(info, io.BytesIO(content))
    return output.getvalue()


def source_archive(tool_sha, build_source):
    data = archive(tool_sha)
    if build_source != tool_sha:
        require(re.fullmatch('[a-f0-9]{40}', build_source), 'SOURCE_SHA_INVALID')
        # Recover the exact committed source without changing checkout or using a new image tag.
        publication.run(['git', 'fetch', '--quiet', '--filter=blob:none', '--depth=1',
                         'https://github.com/jzwyrzyk/family-game-factory.git', build_source], ROOT)
        data = archive(build_source, require_head=False)
    return data


def configuration(sha):
    image = IMAGE + ':' + sha
    return {'steps': [{'name': 'gcr.io/cloud-builders/docker', 'args': [
        'build', '--platform=linux/amd64', '--pull', '--label',
        'org.opencontainers.image.revision=' + sha, '-t', image, '.']}],
        'images': [image], 'serviceAccount': f'projects/{PROJECT}/serviceAccounts/{BUILDER}',
        'options': {'logging': 'CLOUD_LOGGING_ONLY', 'machineType': 'E2_MEDIUM',
                    'sourceProvenanceHash': ['SHA256']},
        'timeout': '600s', 'tags': ['jems-request-broker', 'source-' + sha]}


def predicates(build, sha, archive_hash):
    """Evaluate all original verification predicates; emit only fixed names/booleans.

    Cloud Build may mirror top-level images in artifacts.images; only the exact
    same list is accepted. No other artifact fields or destinations are allowed.
    This function is also used by the bounded administrator probe.
    """
    expected = configuration(sha)
    require(isinstance(build, dict), 'BUILD_RESPONSE_SHAPE_INVALID')
    try:
        options = build.get('options', {})
        provenance = build.get('sourceProvenance', {})
        storage = provenance.get('resolvedStorageSource', {})
        source = build.get('source', {})
        hashes = provenance.get('fileHashes', {})
        images = build.get('results', {}).get('images', [])
        metadata = {'status', 'pullTiming', 'timing', 'exitCode'}
        checks = {'BUILD_STATUS_NOT_SUCCESS': build.get('status') == 'SUCCESS'}
        for key, code in (('serviceAccount', 'BUILD_SERVICE_ACCOUNT_MISMATCH'),
                          ('images', 'BUILD_IMAGES_MISMATCH'), ('tags', 'BUILD_TAGS_MISMATCH'),
                          ('timeout', 'BUILD_TIMEOUT_MISMATCH')):
            checks[code] = build.get(key) == expected[key]
        for key, code in (('logging', 'BUILD_LOGGING_MISMATCH'), ('machineType', 'BUILD_MACHINE_TYPE_MISMATCH'),
                          ('sourceProvenanceHash', 'BUILD_HASH_OPTION_MISMATCH')):
            checks[code] = options.get(key) == expected['options'][key]
        checks['BUILD_EXECUTABLE_OPTIONS_UNEXPECTED'] = not any(options.get(k) for k in
            ('env', 'secretEnv', 'volumes', 'automapSubstitutions', 'dynamicSubstitutions', 'pool'))
        checks['BUILD_SECRETS_UNEXPECTED'] = not any(build.get(k) for k in ('secrets', 'availableSecrets'))
        checks['BUILD_SUBSTITUTIONS_UNEXPECTED'] = not build.get('substitutions')
        checks['BUILD_ARTIFACTS_UNEXPECTED'] = (not build.get('artifacts') or
            build.get('artifacts') == {'images': expected['images']})
        checks['BUILD_DEPENDENCIES_UNEXPECTED'] = not build.get('dependencies')
        checks['BUILD_EXECUTABLE_STEPS_MISMATCH'] = [
            {k: v for k, v in step.items() if k not in metadata} for step in build.get('steps', [])] == expected['steps']
        checks['SOURCE_BUCKET_MISMATCH'] = storage.get('bucket') == BUCKET
        checks['SOURCE_OBJECT_INVALID'] = bool(re.fullmatch(r'source/[A-Za-z0-9._/-]+', storage.get('object', '')))
        checks['SOURCE_GENERATION_MISSING'] = str(storage.get('generation', '')).isdigit()
        checks['SOURCE_PROVENANCE_MISMATCH'] = set(source) == {'storageSource'} and all(
            source['storageSource'].get(k) == storage.get(k) for k in ('bucket', 'object'))
        checks['SOURCE_ARCHIVE_HASH_COUNT_INVALID'] = len(hashes) == 1
        checks['SOURCE_ARCHIVE_HASH_MISMATCH'] = len(hashes) == 1 and exact_sha256(
            next(iter(hashes.values())).get('fileHash', []), archive_hash)
        checks['BUILD_RESULT_IMAGE_MISMATCH'] = len(images) == 1 and images[0].get('name') == expected['images'][0]
        checks['BUILD_RESULT_DIGEST_INVALID'] = len(images) == 1 and bool(re.fullmatch('sha256:[a-f0-9]{64}', images[0].get('digest', '')))
        return checks
    except (AttributeError, TypeError, ValueError, KeyError):
        raise BuildVerificationError('BUILD_RESPONSE_SHAPE_INVALID') from None


def diagnostic(build, sha, archive_hash):
    checks = predicates(build, sha, archive_hash)
    failures = [code for code, passed in checks.items() if not passed]
    # Fixed structural facts distinguish common API expansions without disclosing
    # field values, paths, environment strings, substitutions or arbitrary keys.
    artifacts = build.get('artifacts')
    return {'status': 'BUILD_PREDICATES_PASSED' if not failures else 'BUILD_VERIFICATION_FAILED',
            'first_failed_predicate': failures[0] if failures else None, 'failed_predicates': failures,
            'checks': checks, 'provider_shape': {
                'artifacts_is_exact_images_mirror': artifacts == {'images': configuration(sha)['images']},
                'artifact_other_fields_present': isinstance(artifacts, dict) and bool(set(artifacts) - {'images'}),
                'source_generation_pinned': 'generation' in build.get('source', {}).get('storageSource', {})},
            'source_sha': sha, 'archive_sha256': archive_hash, 'cloud_mutations': 0,
            'registry_checked': False, 'live_acceptance': False}


def verify(build, sha, archive_hash):
    checks = predicates(build, sha, archive_hash)
    for code, passed in checks.items():
        require(passed, code)
    return IMAGE + '@' + build['results']['images'][0]['digest']


def qualify(build_id, sha, archive_hash):
    require(re.fullmatch('[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}', build_id or ''), 'BUILD_ID_INVALID')
    build = cloud_read('BUILD_METADATA_READ_FAILED', 'builds', 'describe', build_id, '--region', REGION)
    require(build.get('id') == build_id and build.get('projectId') == PROJECT, 'BUILD_RESOURCE_IDENTITY_MISMATCH')
    image = verify(build, sha, archive_hash)
    artifact = cloud_read('REGISTRY_METADATA_READ_FAILED', 'artifacts', 'docker', 'images', 'describe', image)
    require(artifact.get('image_summary', {}).get('digest') == image.split('@')[1], 'REGISTRY_DIGEST_MISMATCH')
    record('BUILD_VERIFIED', source_sha=sha, archive_sha256=archive_hash, build_id=build_id, image=image)
    return {'status': 'BUILD_VERIFIED_NOT_DEPLOYED', 'source_sha': sha, 'archive_sha256': archive_hash,
            'build_id': build_id, 'builder': BUILDER, 'image': image}


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source-sha', required=True)
    modes = p.add_mutually_exclusive_group()
    modes.add_argument('--check', action='store_true')
    modes.add_argument('--submit', action='store_true')
    modes.add_argument('--build-id')
    p.add_argument('--approve-plan-sha256')
    p.add_argument('--build-source-sha', help='Original immutable build source; allowed only with --build-id')
    p.add_argument('--diagnose', action='store_true', help='Read existing build and report all fixed verification predicates')
    p.add_argument('--inspect-source', action='store_true', help='With --diagnose, compare only the generation-pinned source archive in memory; never qualify')
    a = p.parse_args(argv)
    require(not a.build_source_sha or a.build_id, 'BUILD_SOURCE_REQUIRES_EXISTING_BUILD')
    require(not a.diagnose or a.build_id, 'DIAGNOSTIC_REQUIRES_EXISTING_BUILD')
    require(not a.inspect_source or a.diagnose, 'SOURCE_INSPECTION_REQUIRES_DIAGNOSTIC')
    build_source = a.build_source_sha or a.source_sha
    data = source_archive(a.source_sha, build_source)
    archive_hash = hashlib.sha256(data).hexdigest()
    plan = {'source_sha': a.source_sha, 'archive_sha256': archive_hash, 'source_bucket': BUCKET,
            'build': configuration(a.source_sha), 'cost': 'One build, at most 10 minutes; storage/logging extra',
            'deployment': False, 'iam_changes': False}
    if a.build_id:
        if a.diagnose:
            require(re.fullmatch('[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}', a.build_id), 'BUILD_ID_INVALID')
            build = cloud_read('BUILD_METADATA_READ_FAILED', 'builds', 'describe', a.build_id, '--region', REGION)
            require(build.get('id') == a.build_id and build.get('projectId') == PROJECT, 'BUILD_RESOURCE_IDENTITY_MISMATCH')
            result = {'build_id': a.build_id, **diagnostic(build, build_source, archive_hash)}
            if a.inspect_source:
                require(set(result['failed_predicates']) <= {'SOURCE_ARCHIVE_HASH_MISMATCH'}, 'SOURCE_INSPECTION_PREREQUISITES_FAILED')
                import inspect_broker_source
                result['source_inspection'] = inspect_broker_source.inspect(build, data, BUCKET)
            print(json.dumps(result, indent=2)); return
        print(json.dumps(qualify(a.build_id, build_source, archive_hash), indent=2)); return
    if a.check or a.submit:
        publication.preflight(REGION, BUCKET)
    if a.submit:
        require(a.approve_plan_sha256 == digest(plan), 'BUILD_PLAN_APPROVAL_MISMATCH')
        record('BUILD_SUBMISSION_INTENT', source_sha=a.source_sha, archive_sha256=archive_hash)
        with tempfile.TemporaryDirectory(prefix='jems-broker-build-') as folder:
            source = Path(folder) / 'source.tgz'
            config = Path(folder) / 'build.json'
            source.write_bytes(data)
            config.write_text(json.dumps(plan['build']))
            result = publication.cloud('builds', 'submit', str(source), '--config', str(config),
                '--region', REGION, '--gcs-source-staging-dir', 'gs://' + BUCKET + '/source', '--async')
        build_id = result.get('id')
        require(re.fullmatch('[a-f0-9-]{36}', build_id or ''), 'BUILD_SUBMISSION_UNCERTAIN_NO_RETRY')
        record('BUILD_SUBMITTED', source_sha=a.source_sha, build_id=build_id)
        print(json.dumps({'status': 'SUBMITTED_NOT_VERIFIED', 'build_id': build_id,
                          'source_sha': a.source_sha, 'recovery': 'Use --build-id; never repeat --submit'})); return
    print(json.dumps({'plan': plan, 'approve_plan_sha256': digest(plan),
                      'inventory': 'CHECKED' if a.check else 'NOT_CHECKED'}, indent=2))


if __name__ == '__main__':
    try:
        main()
    except BuildVerificationError as error:
        print(json.dumps({'status': 'STOPPED', 'code': error.code, 'resubmit': False}), file=sys.stderr)
        sys.exit(2)
    except Exception:
        print(json.dumps({'status': 'STOPPED', 'code': 'BUILD_TOOL_UNAVAILABLE_OR_UNCERTAIN', 'resubmit': False}), file=sys.stderr)
        sys.exit(2)
