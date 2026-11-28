#!/usr/bin/env python3
"""Private capacity plan; exact duplicate Git packs or separately approved off-disk archives.

Never run GC/prune, remove refs, infer package reproducibility from a lockfile, or
archive/delete by default. Dedup retains every Git object byte, including dangling
objects. Archive staging and deletion are two separately approved phases. Stop all
processes using selected historical repositories before either mutation phase.
"""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import sys
import tarfile
import uuid

import cleanup_historical_checkouts as old

require, safe_path, digest = old.require, old.safe_path, old.digest
TARGET = 2 * 1024 ** 3
PACK = re.compile(r'pack-[a-f0-9]{40}\.(?:pack|idx|rev)')


def identity(path, *, linked=False):
    path = safe_path(path)
    with path.open('rb') as f:
        a = os.fstat(f.fileno())
        require(stat.S_ISREG(a.st_mode) and (linked or a.st_nlink == 1), 'LINK_OR_SPECIAL_FILE_PRESERVED')
        require(not os.listxattr(f.fileno()), 'XATTR_FILE_PRESERVED')
        h = hashlib.file_digest(f, 'sha256').hexdigest()
        b = os.fstat(f.fileno())
    snap = lambda s: [s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_ctime_ns, stat.S_IMODE(s.st_mode)]
    require(snap(a) == snap(b), 'FILE_CHANGED_DURING_READ')
    return {'path': str(path), 'stat': snap(b), 'sha256': h, 'allocated_bytes': b.st_blocks * 512}


def files_under(folder):
    if not folder.is_dir() or folder.is_symlink(): return
    for root, dirs, files in os.walk(folder, followlinks=False):
        dirs[:] = sorted(d for d in dirs if not (Path(root) / d).is_symlink())
        for name in sorted(files):
            p = Path(root) / name
            if not p.is_symlink() and p.is_file(): yield p


def metadata(root):
    common = old.git_directory(root, '--git-common-dir')
    records = [(str(p.relative_to(common)), identity(p)['sha256']) for p in files_under(common)
               if 'objects' not in p.relative_to(common).parts[:1]]
    if (root / '.git').is_file(): records.append(('worktree-pointer', identity(root / '.git')['sha256']))
    return digest(records)


def check_root(root, home):
    root = old.allowed_root(root, home)
    common = old.git_directory(root, '--git-common-dir')
    require(not (common / 'objects').is_symlink(), 'EXTERNAL_OBJECT_STORE_PRESERVED')
    require(not (common / 'objects/info/alternates').exists(), 'ALTERNATE_OBJECT_STORE_PRESERVED')
    require(not (common / 'modules').exists(), 'SUBMODULE_OBJECTS_PRESERVED')
    return root


def blocked_usage(root, home):
    """Stat only: quantify the shortfall without making blocked contents eligible."""
    root = safe_path(root)
    require(home in root.parents and old.allowed_name(root.relative_to(home).parts[0]), 'ROOT_NOT_ALLOWLISTED')
    counts = {'git_metadata_and_objects_bytes': 0, 'dependency_bytes': 0, 'other_bytes': 0}
    seen, examined = set(), 0
    for path in files_under(root):
        examined += 1
        if examined > 200000: return {**counts, 'complete': False, 'recoverability': 'NOT_VERIFIED'}
        info = path.lstat()
        if not stat.S_ISREG(info.st_mode) or (info.st_dev, info.st_ino) in seen: continue
        seen.add((info.st_dev, info.st_ino))
        parts = path.relative_to(root).parts
        category = ('git_metadata_and_objects_bytes' if '.git' in parts else
                    'dependency_bytes' if 'node_modules' in parts else 'other_bytes')
        counts[category] += info.st_blocks * 512
    return {**counts, 'complete': True, 'recoverability': 'NOT_VERIFIED'}


def inspect(home, folder):
    repositories, blocked, packs = [], [], {}
    for candidate in old.discover(home):
        try:
            root = check_root(candidate, home)
            records, skipped = [], 0
            for category, base in [('git_objects', root / '.git/objects'), ('dependencies', root / 'node_modules')]:
                for path in files_under(base):
                    if category == 'git_objects' and not re.fullmatch(r'(?:[a-f0-9]{2}/[a-f0-9]{38}|pack/pack-[a-f0-9]{40}\.(?:pack|idx|rev|bitmap|promisor|mtimes))', path.relative_to(base).as_posix()):
                        skipped += 1; continue
                    if category == 'dependencies' and (old.protected(path.relative_to(base)) or '.git' in path.parts):
                        skipped += 1; continue
                    try: record = identity(path)
                    except old.CleanupError: skipped += 1; continue
                    record['category'] = category
                    records.append(record)
                    if path.parent == root / '.git/objects/pack' and PACK.fullmatch(path.name):
                        packs.setdefault((record['sha256'], record['stat'][2], record['stat'][5], record['stat'][0]), []).append(record)
            repositories.append({'root': str(root), 'metadata_sha256': metadata(root),
                'head': old.git(root, 'rev-parse', 'HEAD').decode().strip(), 'git_layout': old.worktree_layout(root, home), 'files': records,
                'preserved_files': skipped, 'lockfile_present': (root / 'package-lock.json').is_file()})
        except (old.CleanupError, OSError) as error:
            record = {'root': str(candidate), 'code': str(error) if isinstance(error, old.CleanupError) else 'LOCAL_READ_FAILED'}
            try: record['allocated_size_only'] = blocked_usage(candidate, home)
            except (old.CleanupError, OSError): record['allocated_size_only'] = {'status': 'UNAVAILABLE'}
            blocked.append(record)
    groups = [rows for rows in packs.values() if len(rows) > 1 and rows[0]['stat'][0] == folder.stat().st_dev]
    plan = {'schema': 2, 'operation': 'DEDUP_IDENTICAL_GIT_PACKS', 'home': str(home), 'vault': str(folder / 'object-vault'),
            'repositories': [{k: r[k] for k in ('root', 'metadata_sha256', 'head', 'git_layout')} for r in repositories],
            'groups': groups, 'requires_inactive_checkouts': True}
    recoverable = sum(sum(f['allocated_bytes'] for f in group[1:]) for group in groups)
    return plan, {'repositories': repositories, 'blocked': blocked,
        'dedup_recoverable_bytes': recoverable,
        'git_object_bytes': sum(f['allocated_bytes'] for r in repositories for f in r['files'] if f['category'] == 'git_objects'),
        'dependency_archive_bytes': sum(f['allocated_bytes'] for r in repositories for f in r['files'] if f['category'] == 'dependencies'),
        'target_bytes': TARGET, 'dedup_target_met': recoverable >= TARGET,
        'dependency_reproducibility': 'NOT_ASSUMED_FROM_LOCKFILE; unique or modified bytes require verified private archive'}


def validate_plan(plan):
    require(plan.get('schema') == 2 and plan.get('operation') in
            ('DEDUP_IDENTICAL_GIT_PACKS', 'PRIVATE_OFF_DISK_ARCHIVE'), 'PLAN_SCHEMA_INVALID')
    roots = [check_root(r['root'], safe_path(plan['home'])) for r in plan['repositories']]
    require(len(roots) == len(set(roots)), 'DUPLICATE_ROOT')
    selected = [f for g in plan.get('groups', []) for f in g] + plan.get('files', [])
    require(len({f['path'] for f in selected}) == len(selected), 'DUPLICATE_FILE')
    for entry in selected:
        path = safe_path(entry['path'])
        matches = [root for root in roots if root in path.parents]
        require(len(matches) == 1, 'FILE_OUTSIDE_REPOSITORY')
        root = matches[0]
        if entry['category'] == 'git_objects':
            relative = path.relative_to(root).as_posix()
            require(bool(re.fullmatch(r'\.git/objects/(?:[a-f0-9]{2}/[a-f0-9]{38}|pack/pack-[a-f0-9]{40}\.(?:pack|idx|rev|bitmap|promisor|mtimes))', relative)),
                    'NONOBJECT_GIT_FILE_PRESERVED')
        else:
            require(entry['category'] == 'dependencies' and root / 'node_modules' in path.parents and
                    not old.protected(path.relative_to(root / 'node_modules')), 'PROTECTED_DEPENDENCY_FILE')
    for group in plan.get('groups', []):
        require(len(group) >= 2 and all(f['category'] == 'git_objects' and PACK.fullmatch(Path(f['path']).name) for f in group), 'INVALID_PACK_GROUP')
        require(len({(f['sha256'], f['stat'][0], f['stat'][2], f['stat'][5]) for f in group}) == 1, 'NONIDENTICAL_PACK_GROUP')


def sync_dir(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try: os.fsync(fd)
    finally: os.close(fd)


def recheck(plan):
    validate_plan(plan)
    home = safe_path(plan['home'])
    for repo in plan['repositories']:
        root = check_root(repo['root'], home)
        if 'git_layout' in repo:
            require(old.worktree_layout(root, home) == repo['git_layout'], 'WORKTREE_LAYOUT_CHANGED')
        require(metadata(root) == repo['metadata_sha256'], 'GIT_METADATA_CHANGED_REPLAN')
        require(old.git(root, 'rev-parse', 'HEAD').decode().strip() == repo['head'], 'HEAD_CHANGED_REPLAN')
    for entry in [f for g in plan.get('groups', []) for f in g] + plan.get('files', []):
        require(identity(entry['path']) == {k: entry[k] for k in ('path', 'stat', 'sha256', 'allocated_bytes')}, 'CONTENT_CHANGED_REPLAN')


def write_json(path, value):
    safe_path(path)
    if path.exists():
        require(json.loads(path.read_bytes()) == value, 'EXISTING_RECORD_DIFFERS')
    else:
        with path.open('x') as f: old.durable(f, value)


def captured_matches(entry, path):
    current = identity(path, linked=True)
    require(current['sha256'] == entry['sha256'] and current['stat'][:4] == entry['stat'][:4] and
            current['stat'][5] == entry['stat'][5], 'CAPTURED_CONTENT_CHANGED_PRESERVED')


def dedup(plan, approval, folder, inactive):
    require(inactive and approval == digest(plan), 'EXPLICIT_DEDUP_APPROVAL_AND_INACTIVE_CHECKOUTS_REQUIRED')
    require(plan['operation'] == 'DEDUP_IDENTICAL_GIT_PACKS', 'PLAN_KIND_INVALID')
    require(safe_path(plan['vault']) == folder / 'object-vault', 'VAULT_BINDING_INVALID')
    require(bool(plan['groups']), 'NO_DUPLICATES_TO_DEDUP')
    recheck(plan)
    vault = old.private_dir(folder / 'object-vault', safe_path(plan['home']))
    journal_path = folder / ('dedup-' + approval + '.jsonl')
    free_before = shutil.disk_usage(folder).free
    with journal_path.open('x') as journal:
        old.durable(journal, {'event': 'STARTED', 'plan': approval}); sync_dir(folder)
        for group in plan['groups']:
            source = group[0]
            canonical = vault / (source['sha256'] + '-' + str(source['stat'][5]))
            require(canonical.parent.stat().st_dev == source['stat'][0], 'CROSS_DEVICE_DEDUP_FORBIDDEN')
            if not canonical.exists():
                os.link(safe_path(source['path']), canonical, follow_symlinks=False); sync_dir(vault)
            require(identity(canonical, linked=True)['sha256'] == source['sha256'] and canonical.stat().st_mode & 0o777 == source['stat'][5], 'VAULT_CONTENT_MISMATCH')
            for entry in group[1:]:
                path = safe_path(entry['path'])
                require(identity(path) == {k: entry[k] for k in ('path', 'stat', 'sha256', 'allocated_bytes')}, 'CONTENT_CHANGED_STOPPED')
                captured = path.parent / ('.jems-dedup-' + uuid.uuid4().hex)
                old.durable(journal, {'event': 'CAPTURE_INTENT', 'path': str(path), 'captured': str(captured), 'vault': str(canonical)})
                path.rename(captured)
                captured_matches(entry, captured)
                os.link(canonical, path, follow_symlinks=False)  # exclusive: never overwrite a concurrent replacement
                require(identity(path, linked=True)['sha256'] == entry['sha256'], 'LINK_CONTENT_MISMATCH')
                captured_matches(entry, captured)
                sync_dir(path.parent)
                captured.unlink(); sync_dir(path.parent)
                old.durable(journal, {'event': 'DEDUPLICATED', 'path': str(path), 'sha256': entry['sha256']})
        old.durable(journal, {'event': 'COMPLETE'})
    return {'status': 'APPROVED_PACK_DEDUP_COMPLETE', 'all_object_bytes': 'RETAINED', 'journal': str(journal_path),
            'observed_free_bytes_delta': shutil.disk_usage(folder).free - free_before,
            'space_measurement_limit': 'Other filesystem activity can affect this observation'}


def archive_plan(capacity, home, destination):
    destination = old.private_dir(destination, home)
    require(destination.stat().st_uid == os.getuid(), 'ARCHIVE_OWNER_MISMATCH')
    require(not any(p == destination or p in destination.parents for p in map(Path, ('/tmp', '/var/tmp', '/dev/shm'))), 'VOLATILE_ARCHIVE_FORBIDDEN')
    require(destination.stat().st_dev != home.stat().st_dev, 'ARCHIVE_MUST_BE_OFF_HOME_FILESYSTEM')
    # A directory inside any source must never be a backup destination.
    for r in capacity['repositories']:
        require(Path(r['root']) not in destination.parents, 'ARCHIVE_INSIDE_SOURCE')
    return {'schema': 2, 'operation': 'PRIVATE_OFF_DISK_ARCHIVE', 'home': str(home),
        'destination': str(destination), 'destination_device': destination.stat().st_dev,
        'repositories': [{k: r[k] for k in ('root', 'metadata_sha256', 'head', 'git_layout')} for r in capacity['repositories']],
        'files': [f for r in capacity['repositories'] for f in r['files']],
        'privacy': 'May include historical secrets inside Git objects. Private same-owner off-disk storage only; no network upload.',
        'effect_after_separate_deletion_approval': 'Repositories/dependencies may be unusable until restored; all selected bytes remain in verified archive.'}


def verify_archive(plan, archive):
    archive = safe_path(archive)
    with tarfile.open(archive, 'r:') as tar:
        for index, entry in enumerate(plan['files']):
            member = tar.next()
            require(member is not None and member.name == str(index) and member.isfile() and
                    member.size == entry['stat'][2], 'ARCHIVE_MEMBER_MISMATCH')
            f = tar.extractfile(member)
            require(hashlib.file_digest(f, 'sha256').hexdigest() == entry['sha256'], 'ARCHIVE_CONTENT_MISMATCH')
        require(tar.next() is None, 'ARCHIVE_EXTRA_MEMBER')
    return identity(archive)['sha256']


def create_archive(plan, approval, folder, inactive):
    require(inactive and approval == digest(plan), 'SEPARATE_ARCHIVE_APPROVAL_REQUIRED')
    require(plan['operation'] == 'PRIVATE_OFF_DISK_ARCHIVE', 'PLAN_KIND_INVALID')
    dest = old.private_dir(Path(plan['destination']), safe_path(plan['home']))
    require(dest.stat().st_dev == plan['destination_device'] and dest.stat().st_dev != Path(plan['home']).stat().st_dev,
            'ARCHIVE_DESTINATION_CHANGED')
    require(bool(plan['files']), 'NO_FILES_TO_ARCHIVE')
    recheck(plan)
    target = dest / ('jems-private-' + approval + '.tar')
    required_bytes = sum(f['stat'][2] + 1024 for f in plan['files']) + 16 * 1024 * 1024
    require(shutil.disk_usage(dest).free >= required_bytes, 'INSUFFICIENT_ARCHIVE_SPACE')
    staging_journal = folder / ('archive-stage-' + approval + '.jsonl')
    with staging_journal.open('x') as journal:
        old.durable(journal, {'event': 'STARTED', 'archive': str(target), 'plan_sha256': approval})
    sync_dir(folder)
    with target.open('xb') as out:
        with tarfile.open(fileobj=out, mode='w|') as tar:
            for index, entry in enumerate(plan['files']):
                info = tarfile.TarInfo(str(index)); info.size = entry['stat'][2]; info.mode = 0o600
                with safe_path(entry['path']).open('rb') as f: tar.addfile(info, f)
        out.flush(); os.fsync(out.fileno())
    sync_dir(dest)
    recheck(plan)
    sha = verify_archive(plan, target)
    target.chmod(0o400)
    receipt = {'schema': 1, 'plan_sha256': approval, 'archive': str(target), 'archive_sha256': sha,
               'status': 'ARCHIVE_VERIFIED_NO_DELETION'}
    write_json(folder / ('archive-receipt-' + approval + '.json'), receipt)
    with staging_journal.open('a') as journal: old.durable(journal, {'event': 'VERIFIED', 'archive_sha256': sha})
    sync_dir(folder)
    return {**receipt, 'deletion_approval_sha256': digest({'plan': plan, 'archive': receipt})}


def archive_check(plan, receipt):
    validate_plan(plan)
    dest = old.private_dir(Path(plan['destination']), safe_path(plan['home']))
    require(dest.stat().st_uid == os.getuid() and dest.stat().st_dev == plan['destination_device'] and
            dest.stat().st_dev != Path(plan['home']).stat().st_dev, 'ARCHIVE_DESTINATION_CHANGED')
    require(receipt['plan_sha256'] == digest(plan), 'ARCHIVE_PLAN_MISMATCH')
    require(Path(receipt['archive']).parent == safe_path(plan['destination']), 'ARCHIVE_PATH_MISMATCH')
    require(verify_archive(plan, receipt['archive']) == receipt['archive_sha256'], 'ARCHIVE_CHANGED')


def delete_archived(plan, receipt, approval, folder, inactive):
    require(inactive and approval == digest({'plan': plan, 'archive': receipt}), 'SEPARATE_DELETION_APPROVAL_REQUIRED')
    recheck(plan); archive_check(plan, receipt)
    with (folder / ('archive-deletion-' + approval + '.jsonl')).open('x') as journal:
        old.durable(journal, {'event': 'STARTED', 'approval': approval}); sync_dir(folder)
        for entry in plan['files']:
            path = safe_path(entry['path']); captured = path.parent / ('.jems-archive-' + uuid.uuid4().hex)
            require(identity(path) == {k: entry[k] for k in ('path', 'stat', 'sha256', 'allocated_bytes')}, 'CONTENT_CHANGED_STOPPED')
            old.durable(journal, {'event': 'CAPTURE_INTENT', 'path': str(path), 'captured': str(captured)})
            path.rename(captured); captured_matches(entry, captured); sync_dir(path.parent); captured.unlink(); sync_dir(path.parent)
            old.durable(journal, {'event': 'DELETED_ARCHIVED_FILE', 'path': str(path)})
        old.durable(journal, {'event': 'COMPLETE'})
    return {'status': 'APPROVED_ARCHIVED_BYTES_DELETED', 'archive_retained': True}


def recover_captures(plan, folder, journal_name):
    validate_plan(plan)
    allowed = {f['path'] for g in plan.get('groups', []) for f in g} | {f['path'] for f in plan.get('files', [])}
    journal = safe_path(folder / journal_name)
    if not journal.exists(): return 0
    restored = 0
    for line in journal.read_text().splitlines():
        row = json.loads(line)
        if row.get('event') != 'CAPTURE_INTENT': continue
        require(row['path'] in allowed, 'CAPTURE_OUTSIDE_PLAN')
        path, captured = safe_path(row['path']), safe_path(row['captured'])
        require(captured.parent == path.parent and bool(re.fullmatch(r'\.jems-(?:archive|dedup)-[a-f0-9]{32}', captured.name)), 'CAPTURE_PATH_INVALID')
        if captured.exists() and not path.exists():
            require(captured.is_file(), 'CAPTURE_NOT_REGULAR')
            os.link(captured, path, follow_symlinks=False); sync_dir(path.parent)
            captured.unlink(); restored += 1
    return restored


def restore(plan, receipt, folder):
    archive_check(plan, receipt)
    restored = recover_captures(plan, folder, 'archive-deletion-' + digest({'plan': plan, 'archive': receipt}) + '.jsonl')
    with tarfile.open(receipt['archive'], 'r:') as tar:
        for index, entry in enumerate(plan['files']):
            path = safe_path(entry['path'])
            if path.exists(): continue
            staged = path.parent / ('.jems-restore-' + uuid.uuid4().hex)
            h = hashlib.sha256()
            with staged.open('xb') as out, tar.extractfile(str(index)) as source:
                while block := source.read(1024 * 1024): out.write(block); h.update(block)
                out.flush(); os.fsync(out.fileno())
            require(h.hexdigest() == entry['sha256'], 'RESTORE_BYTES_CHANGED_STAGED_FILE_PRESERVED')
            staged.chmod(entry['stat'][5])
            os.link(staged, path, follow_symlinks=False); sync_dir(path.parent)
            staged.unlink(); restored += 1
    return {'status': 'MISSING_ARCHIVED_FILES_RESTORED', 'files': restored, 'overwritten': 0}


def main(argv=None):
    os.umask(0o077)
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--home-dir', type=Path, required=True); p.add_argument('--receipt-dir', type=Path, required=True)
    p.add_argument('--archive-dir', type=Path)
    modes = p.add_mutually_exclusive_group()
    for name in ('dedup-plan', 'create-archive', 'delete-archived', 'restore-archive', 'restore-dedup'): modes.add_argument('--' + name, type=Path)
    p.add_argument('--archive-receipt', type=Path); p.add_argument('--approve-plan-sha256')
    p.add_argument('--confirm-inactive', action='store_true')
    a = p.parse_args(argv); home = safe_path(a.home_dir); folder = old.private_dir(a.receipt_dir, home)
    with (folder / 'capacity.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        selected = a.dedup_plan or a.create_archive or a.delete_archived or a.restore_archive or a.restore_dedup
        if selected:
            plan = json.loads(safe_path(selected).read_bytes()); require(plan['home'] == str(home), 'PLAN_HOME_MISMATCH')
            if a.restore_dedup:
                result = {'status': 'CAPTURE_RECOVERY', 'files': recover_captures(plan, folder, 'dedup-' + digest(plan) + '.jsonl')}
            elif a.dedup_plan: result = dedup(plan, a.approve_plan_sha256, folder, a.confirm_inactive)
            elif a.create_archive: result = create_archive(plan, a.approve_plan_sha256, folder, a.confirm_inactive)
            else:
                receipt = json.loads(safe_path(a.archive_receipt).read_bytes())
                result = restore(plan, receipt, folder) if a.restore_archive else delete_archived(plan, receipt, a.approve_plan_sha256, folder, a.confirm_inactive)
            print(json.dumps(result)); return
        plan, capacity = inspect(home, folder)
        code = digest(plan); write_json(folder / ('dedup-plan-' + code + '.json'), plan)
        write_json(folder / ('capacity-' + digest(capacity) + '.json'), capacity)
        if a.archive_dir:
            archive = archive_plan(capacity, home, a.archive_dir)
            write_json(folder / ('archive-plan-' + digest(archive) + '.json'), archive)
        print(json.dumps({'status': 'CAPACITY_DRY_RUN_NO_DELETION_OR_ARCHIVE', 'dedup_plan_sha256': code,
            **{k: v for k, v in capacity.items() if k not in ('repositories', 'blocked')},
            'repositories': [{'root': r['root'], 'git_object_bytes': sum(f['allocated_bytes'] for f in r['files'] if f['category'] == 'git_objects'),
                              'dependency_bytes': sum(f['allocated_bytes'] for f in r['files'] if f['category'] == 'dependencies'),
                              'related_worktrees': r['git_layout']['worktrees']} for r in capacity['repositories']],
            'blocked': capacity['blocked'], 'private_plans_directory': str(folder),
            'archive_plan_sha256': digest(archive) if a.archive_dir else None,
            'archive_requires_separate_approval': True,
            'byte_estimate_limit': 'Allocated-byte estimate; existing filesystem sharing can reduce actual reclaimed space. Do not sum alternative plans.'}, indent=2))


if __name__ == '__main__':
    try: main()
    except old.CleanupError as error: print(json.dumps({'status': 'STOPPED', 'code': str(error), 'automatic_retry': False})); sys.exit(2)
    except Exception: print(json.dumps({'status': 'STOPPED', 'code': 'CAPACITY_OPERATION_UNAVAILABLE_OR_PARTIAL', 'automatic_retry': False})); sys.exit(2)
