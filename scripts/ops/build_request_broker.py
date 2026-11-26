#!/usr/bin/env python3
"""Source-bound broker publication using the existing approved Cloud Build lane.

Offline by default. --check only inventories. --submit requires the plan hash;
--build-id verifies an existing build once and never submits or polls/retries it.
No credentials, deployment, IAM edits or raw build logs in output.
"""
import argparse
import base64
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

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('existing_service_build', ROOT / 'scripts/deployment/build.py')
publication = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publication)
PROJECT, BUILDER = publication.PROJECT, publication.BUILDER
REGION = 'us-east5'
BUCKET = PROJECT + '-service-builds-' + REGION
IMAGE = f'{REGION}-docker.pkg.dev/{PROJECT}/factory-services/request-broker'
FILES = ('Dockerfile', 'main.py', 'requirements.txt', 'requirements.lock')


def require(ok, message):
    if not ok:
        raise RuntimeError(message)


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def archive(sha):
    require(re.fullmatch('[a-f0-9]{40}', sha or ''), 'Full source SHA required')
    require(publication.run(['git', 'rev-parse', 'HEAD'], ROOT).decode().strip() == sha, 'Source HEAD differs')
    require(not publication.run(['git', 'status', '--porcelain', '--untracked-files=all'], ROOT), 'Clean source required')
    output = io.BytesIO()
    with gzip.GzipFile(fileobj=output, mode='wb', filename='', mtime=0) as compressed:
        with tarfile.open(fileobj=compressed, mode='w', format=tarfile.USTAR_FORMAT) as tar:
            for name in sorted(FILES):
                content = publication.run(['git', 'show', sha + ':ops/request-broker/' + name], ROOT)
                info = tarfile.TarInfo(name)
                info.size, info.mode = len(content), 0o644
                tar.addfile(info, io.BytesIO(content))
    return output.getvalue()


def configuration(sha):
    image = IMAGE + ':' + sha
    return {'steps': [{'name': 'gcr.io/cloud-builders/docker', 'args': [
        'build', '--platform=linux/amd64', '--pull', '--label',
        'org.opencontainers.image.revision=' + sha, '-t', image, '.']}],
        'images': [image], 'serviceAccount': f'projects/{PROJECT}/serviceAccounts/{BUILDER}',
        'options': {'logging': 'CLOUD_LOGGING_ONLY', 'machineType': 'E2_MEDIUM',
                    'sourceProvenanceHash': ['SHA256']},
        'timeout': '600s', 'tags': ['jems-request-broker', 'source-' + sha]}


def verify(build, sha, archive_hash):
    expected = configuration(sha)
    require(build.get('status') == 'SUCCESS', 'Existing build not successful; inspect its status, do not resubmit')
    for key in ('serviceAccount', 'images', 'tags', 'timeout'):
        require(build.get(key) == expected[key], 'Build configuration differs')
    require(all(build.get('options', {}).get(k) == v for k, v in expected['options'].items()), 'Build options differ')
    require(not any(build.get('options', {}).get(k) for k in
                    ('env', 'secretEnv', 'volumes', 'automapSubstitutions', 'dynamicSubstitutions', 'pool')),
            'Unexpected executable build options')
    require(not any(build.get(k) for k in ('secrets', 'availableSecrets', 'substitutions', 'artifacts', 'dependencies')),
            'Unexpected executable build configuration')
    metadata = {'status', 'pullTiming', 'timing', 'exitCode'}
    require([{k: v for k, v in s.items() if k not in metadata} for s in build.get('steps', [])]
            == expected['steps'], 'Build executable steps differ')
    provenance = build.get('sourceProvenance', {})
    storage = provenance.get('resolvedStorageSource', {})
    require(storage.get('bucket') == BUCKET and re.fullmatch(r'source/[A-Za-z0-9._/-]+', storage.get('object', ''))
            and str(storage.get('generation', '')).isdigit(), 'Resolved source generation missing or unexpected')
    source = build.get('source', {})
    require(set(source) == {'storageSource'} and all(source['storageSource'].get(k) == storage[k]
            for k in ('bucket', 'object')), 'Source provenance differs')
    hashes = provenance.get('fileHashes', {})
    require(len(hashes) == 1, 'Exactly one source archive hash required')
    expected_hash = base64.b64encode(bytes.fromhex(archive_hash)).decode()
    require(any(h == {'type': 'SHA256', 'value': expected_hash}
                for h in next(iter(hashes.values())).get('fileHash', [])), 'Provider source hash differs')
    images = build.get('results', {}).get('images', [])
    require(len(images) == 1 and images[0].get('name') == expected['images'][0]
            and re.fullmatch('sha256:[a-f0-9]{64}', images[0].get('digest', '')), 'Build image result differs')
    return IMAGE + '@' + images[0]['digest']


def qualify(build_id, sha, archive_hash):
    require(re.fullmatch('[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}', build_id or ''), 'Exact build UUID required')
    build = publication.cloud('builds', 'describe', build_id, '--region', REGION)
    require(build.get('id') == build_id and build.get('projectId') == PROJECT, 'Build identity differs')
    image = verify(build, sha, archive_hash)
    artifact = publication.cloud('artifacts', 'docker', 'images', 'describe', image)
    require(artifact.get('image_summary', {}).get('digest') == image.split('@')[1], 'Registry digest differs')
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
    a = p.parse_args(argv)
    data = archive(a.source_sha)
    archive_hash = hashlib.sha256(data).hexdigest()
    plan = {'source_sha': a.source_sha, 'archive_sha256': archive_hash, 'source_bucket': BUCKET,
            'build': configuration(a.source_sha), 'cost': 'One build, at most 10 minutes; storage/logging extra',
            'deployment': False, 'iam_changes': False}
    if a.build_id:
        print(json.dumps(qualify(a.build_id, a.source_sha, archive_hash), indent=2)); return
    if a.check or a.submit:
        publication.preflight(REGION, BUCKET)
    if a.submit:
        require(a.approve_plan_sha256 == digest(plan), 'Approve exact build plan before spending')
        with tempfile.TemporaryDirectory(prefix='jems-broker-build-') as folder:
            source = Path(folder) / 'source.tgz'
            config = Path(folder) / 'build.json'
            source.write_bytes(data)
            config.write_text(json.dumps(plan['build']))
            result = publication.cloud('builds', 'submit', str(source), '--config', str(config),
                '--region', REGION, '--gcs-source-staging-dir', 'gs://' + BUCKET + '/source', '--async')
        build_id = result.get('id')
        require(re.fullmatch('[a-f0-9-]{36}', build_id or ''), 'Submission uncertain; inspect existing builds; never auto-resubmit')
        print(json.dumps({'status': 'SUBMITTED_NOT_VERIFIED', 'build_id': build_id,
                          'source_sha': a.source_sha, 'recovery': 'Use --build-id; never repeat --submit'})); return
    print(json.dumps({'plan': plan, 'approve_plan_sha256': digest(plan),
                      'inventory': 'CHECKED' if a.check else 'NOT_CHECKED'}, indent=2))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('Broker build stopped; raw diagnostics suppressed. If submission began, inspect existing build history before retry.', file=sys.stderr)
        sys.exit(2)
