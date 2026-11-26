"""Append fixed, lightweight recovery fields to a launcher-owned private journal."""
import json
import os
import re
import stat

FIELDS = {'source_sha': r'[a-f0-9]{40}', 'archive_sha256': r'[a-f0-9]{64}',
          'build_id': r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}',
          'image': r'us-east5-docker\.pkg\.dev/family-game-factory-jzw/factory-services/request-broker@sha256:[a-f0-9]{64}'}


def record(event, **fields):
    path = os.environ.get('JEMS_OPERATION_JOURNAL')
    if not path: return
    if event not in ('BUILD_SUBMISSION_INTENT', 'BUILD_SUBMITTED', 'BUILD_VERIFIED') or any(
        key not in FIELDS or not re.fullmatch(FIELDS[key], value) for key, value in fields.items()):
        raise RuntimeError('RECOVERY_RECEIPT_FIELDS_INVALID')
    fd = os.open(path, os.O_WRONLY | os.O_APPEND | os.O_NOFOLLOW)
    with os.fdopen(fd, 'a') as handle:
        info = os.fstat(handle.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
            raise RuntimeError('RECOVERY_RECEIPT_NOT_PRIVATE')
        handle.write(json.dumps({'event': event, **fields}, sort_keys=True) + '\n')
        handle.flush(); os.fsync(handle.fileno())
