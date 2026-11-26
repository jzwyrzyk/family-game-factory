#!/usr/bin/env python3
"""Dehydrate recoverable historical Jems source files, never whole repositories.

Default is a private dry-run plan. Apply requires its exact hash, rechecks remote
recoverability and every selected file, and journals progress durably. All .git
metadata/objects, untracked/ignored files, local edits, Terraform and sensitive or
operational records remain in place. No cache/package deletion by assumption.
Close editors/other processes using the historical checkouts before apply.
"""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import tempfile
import time

REMOTE = 'https://github.com/jzwyrzyk/family-game-factory.git'
ROOT_NAMES = ('jems-releases', 'jems-access-review.DHFCAZKH', 'jems-gateway-repair-tool', 'jems-service-release')
TOOL_ROOT = Path(__file__).resolve().parents[2]
PROTECTED = ('journal', 'receipt', 'recover', 'credential', 'secret', 'terraform', 'tfstate',
             'tfplan', 'tfvars', 'audit', 'evidence', 'backup', 'checkpoint', 'handoff',
             'token', 'auth', 'config', 'key', 'state')


class CleanupError(RuntimeError):
    pass


def require(ok, code):
    if not ok: raise CleanupError(code)


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def git(root, *args):
    env = {**os.environ, 'GIT_OPTIONAL_LOCKS': '0', 'GIT_NO_REPLACE_OBJECTS': '1', 'GIT_TERMINAL_PROMPT': '0'}
    result = subprocess.run(['git', '-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null',
                             '-C', str(root), *args], capture_output=True, env=env, timeout=120)
    require(result.returncode == 0, 'GIT_READ_OR_REMOTE_PROOF_FAILED')
    return result.stdout


def safe_path(path):
    """Never traverse a symlink, including any existing parent."""
    path = Path(os.path.abspath(path))
    for item in [*reversed(path.parents), path]:
        require(not item.is_symlink(), 'SYMLINK_PATH_FORBIDDEN')
    return path


def protected(relative):
    parts = Path(relative).parts
    return (not parts or Path(relative).is_absolute() or '..' in parts or
            any(p.startswith('.') or any(word in p.lower() for word in PROTECTED) for p in parts) or
            Path(relative).suffix.lower() in ('.key', '.pem', '.p12', '.pfx', '.sqlite', '.db', '.log', '.tf'))


def allowed_root(root, home):
    root, home = safe_path(root), safe_path(home)
    require(root != home and home in root.parents, 'ROOT_OUTSIDE_APPROVED_HOME')
    require(root.relative_to(home).parts[0] in ROOT_NAMES, 'ROOT_NOT_ALLOWLISTED')
    require(root != TOOL_ROOT and root not in TOOL_ROOT.parents, 'ACTIVE_TOOL_CHECKOUT_FORBIDDEN')
    require(root != Path.cwd() and root not in Path.cwd().parents, 'CURRENT_WORKING_DIRECTORY_FORBIDDEN')
    require((root / '.git').is_dir() and not (root / '.git').is_symlink(), 'LINKED_OR_NONSTANDARD_GIT_DIR_PRESERVED')
    require(not any((root / '.git').rglob('*.lock')), 'GIT_OPERATION_IN_PROGRESS')
    require(git(root, 'rev-parse', '--show-toplevel').decode().strip() == str(root), 'REPOSITORY_ROOT_MISMATCH')
    require(git(root, 'remote', 'get-url', 'origin').decode().strip() == REMOTE, 'REMOTE_NOT_APPROVED')
    return root


def remote_proof(sha):
    require(re.fullmatch('[a-f0-9]{40}', sha), 'SOURCE_SHA_INVALID')
    # A fresh object database proves the named commit is retrievable from the
    # approved remote, not merely present in a local/stale remote-tracking ref.
    with tempfile.TemporaryDirectory(prefix='jems-recoverability-') as temp:
        git(temp, 'init', '--bare', '--quiet')
        git(temp, '-c', 'protocol.file.allow=never', 'fetch', '--quiet', '--no-tags',
            '--depth=1', '--filter=blob:none', REMOTE, sha)
        require(git(temp, 'rev-parse', 'FETCH_HEAD').decode().strip() == sha, 'REMOTE_SOURCE_MISMATCH')
        git(temp, 'cat-file', '-e', sha + '^{commit}')


def file_identity(path):
    path = safe_path(path)
    with path.open('rb') as handle:
        before = os.fstat(handle.fileno())
        require(stat.S_ISREG(before.st_mode) and before.st_nlink == 1, 'NONREGULAR_OR_HARDLINK_PRESERVED')
        require(not os.listxattr(handle.fileno()), 'EXTENDED_ATTRIBUTES_PRESERVED')
        h = hashlib.sha256()
        git_hash = hashlib.sha1(('blob ' + str(before.st_size) + '\0').encode())
        while data := handle.read(1024 * 1024): h.update(data); git_hash.update(data)
        after = os.fstat(handle.fileno())
    fingerprint = lambda s: [s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_ctime_ns, stat.S_IMODE(s.st_mode)]
    require(fingerprint(before) == fingerprint(after), 'FILE_CHANGED_DURING_READ')
    return {'stat': fingerprint(after), 'sha256': h.hexdigest(), 'git_blob': git_hash.hexdigest()}


def repo_plan(root, home, proof=remote_proof):
    root = allowed_root(root, home)
    sha = git(root, 'rev-parse', 'HEAD').decode().strip()
    proof(sha)
    index = {}
    for row in git(root, 'ls-files', '--stage', '-z').split(b'\0'):
        if not row: continue
        info, name = row.split(b'\t', 1)
        mode, oid, stage = info.decode().split()
        index[os.fsdecode(name)] = (mode, oid, stage)
    files, preserved = [], 0
    for row in git(root, 'ls-tree', '-r', '-z', sha).split(b'\0'):
        if not row: continue
        info, name = row.split(b'\t', 1)
        mode, kind, oid = info.decode().split()
        relative = os.fsdecode(name)
        if (protected(relative) or kind != 'blob' or mode not in ('100644', '100755') or
                index.get(relative) != (mode, oid, '0')):
            preserved += 1; continue
        path = root / relative
        if not path.exists() or path.is_symlink(): preserved += 1; continue
        try: identity = file_identity(path)
        except CleanupError: preserved += 1; continue
        if identity['git_blob'] != oid or identity['stat'][-1] not in ((0o644, 0o600) if mode == '100644' else (0o755, 0o700)):
            preserved += 1; continue
        files.append({'path': relative, **identity})
    info = root.stat()
    return {'root': str(root), 'root_identity': [info.st_dev, info.st_ino], 'source_sha': sha,
            'remote': REMOTE, 'files': files, 'bytes': sum(f['stat'][2] for f in files),
            'preserved_tracked_files': preserved, 'git_and_all_untracked_ignored_files': 'PRESERVED'}


def discover(home):
    for name in ROOT_NAMES:
        base = safe_path(home / name)
        if not base.exists(): continue
        for folder, dirs, _ in os.walk(base, followlinks=False):
            path = Path(folder)
            if (path / '.git').exists():
                yield path
                dirs[:] = []; continue
            dirs[:] = [d for d in dirs if not d.startswith('.') and d not in ('node_modules', 'vendor')
                       and not protected(d) and not (path / d).is_symlink()]
            require(len(path.relative_to(base).parts) <= 8, 'DISCOVERY_DEPTH_LIMIT')


def private_dir(path, home):
    path = safe_path(path)
    require(not any(path == home / n or home / n in path.parents for n in ROOT_NAMES), 'RECEIPT_INSIDE_CLEANUP_SCOPE')
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    require(path.stat().st_mode & 0o077 == 0, 'RECEIPT_DIRECTORY_MUST_BE_PRIVATE')
    return path


def durable(handle, value):
    handle.write(json.dumps(value, sort_keys=True) + '\n'); handle.flush(); os.fsync(handle.fileno())


def validate_snapshot(plan, proof):
    home = safe_path(plan['home'])
    for repo in plan['repositories']:
        root = allowed_root(repo['root'], home)
        info = root.stat()
        require([info.st_dev, info.st_ino] == repo['root_identity'], 'ROOT_CHANGED')
        require(git(root, 'rev-parse', 'HEAD').decode().strip() == repo['source_sha'], 'HEAD_CHANGED')
        proof(repo['source_sha'])
        current = {f['path']: f for f in repo_plan(root, home, proof=lambda sha: None)['files']}
        for entry in repo['files']:
            require(current.get(entry['path']) == entry, 'FILE_OR_INDEX_CHANGED_REPLAN')


def apply(plan, approval, folder, proof=remote_proof):
    require(approval == digest(plan), 'EXPLICIT_DELETION_APPROVAL_REQUIRED')
    require(plan.get('schema') == 1 and plan.get('operation') == 'DELETE_RECOVERABLE_TRACKED_FILES_ONLY', 'PLAN_SCHEMA_INVALID')
    validate_snapshot(plan, proof)  # No deletion if any selected file already changed.
    ledger = folder / ('deletion-' + approval + '.jsonl')
    # Exclusive creation also prevents automatic replay after an interrupted run.
    with ledger.open('x') as journal:
        durable(journal, {'plan_sha256': approval, 'event': 'STARTED', 'repositories': [
            {k: repo[k] for k in ('root', 'source_sha', 'remote')} for repo in plan['repositories']]})
        for repo in plan['repositories']:
            root = Path(repo['root'])
            quarantine = root / ('.jems-cleanup-' + approval)
            quarantine.mkdir(mode=0o700)
            for index, entry in enumerate(repo['files']):
                path = safe_path(root / entry['path'])
                require(not protected(entry['path']), 'PROTECTED_FILE_SELECTED')
                require(file_identity(path) == {k: entry[k] for k in ('stat', 'sha256', 'git_blob')}, 'FILE_CHANGED_STOPPED')
                staged = quarantine / str(index)
                durable(journal, {'event': 'DELETE_INTENT', 'root': str(root), 'source_sha': repo['source_sha'],
                                  'quarantine': str(staged), **entry})
                # Rename first, then rehash the captured file. A concurrent pathname
                # replacement is preserved in quarantine, never blindly unlinked.
                path.rename(staged)
                captured = file_identity(staged)
                require(captured['sha256'] == entry['sha256'] and captured['git_blob'] == entry['git_blob'] and
                        captured['stat'][:4] == entry['stat'][:4] and captured['stat'][5] == entry['stat'][5],
                        'CAPTURED_FILE_CHANGED_PRESERVED_IN_QUARANTINE')
                staged.unlink()
                durable(journal, {'event': 'DELETED', 'root': str(root), 'path': entry['path']})
            quarantine.rmdir()
        durable(journal, {'event': 'COMPLETE'})
    return ledger


def restore(plan):
    """Recover missing selected source files only; never overwrite anything."""
    restored = 0
    home = safe_path(plan['home'])
    for repo in plan['repositories']:
        root = allowed_root(repo['root'], home)
        quarantine = safe_path(root / ('.jems-cleanup-' + digest(plan)))
        for index, entry in enumerate(repo['files']):
            path = safe_path(root / entry['path'])
            if path.exists(): continue
            require(not protected(entry['path']), 'PROTECTED_FILE_SELECTED')
            staged = safe_path(quarantine / str(index))
            if staged.exists():
                # Prefer captured local bytes after interruption/mutation. Link
                # exclusively; never overwrite a new file at the original path.
                require(staged.is_file(), 'QUARANTINE_CONTENT_PRESERVED_FOR_REVIEW')
                os.link(staged, path, follow_symlinks=False)
                staged.unlink(); restored += 1; continue
            data = git(root, 'cat-file', 'blob', entry['git_blob'])
            require(hashlib.sha256(data).hexdigest() == entry['sha256'], 'RECOVERY_BLOB_MISMATCH')
            # Historical directories are retained by apply; no arbitrary parent creation.
            with path.open('xb') as handle: handle.write(data); handle.flush(); os.fsync(handle.fileno())
            path.chmod(entry['stat'][-1]); restored += 1
        if quarantine.exists() and not any(quarantine.iterdir()): quarantine.rmdir()
    return restored


def main(argv=None):
    os.umask(0o077)
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--home-dir', type=Path, required=True)
    p.add_argument('--receipt-dir', type=Path, required=True)
    modes = p.add_mutually_exclusive_group()
    modes.add_argument('--apply-plan', type=Path)
    modes.add_argument('--restore-plan', type=Path)
    p.add_argument('--approve-plan-sha256')
    args = p.parse_args(argv)
    home = safe_path(args.home_dir)
    folder = private_dir(args.receipt_dir, home)
    # Serializes this utility; external editing must also be stopped by the operator.
    with (folder / 'cleanup.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        selected = args.apply_plan or args.restore_plan
        if selected:
            plan = json.loads(selected.read_bytes())
            require(plan['home'] == str(home), 'PLAN_HOME_DIFFERS')
            if args.restore_plan:
                print(json.dumps({'status': 'MISSING_SOURCE_RESTORED', 'files': restore(plan)})); return
            ledger = apply(plan, args.approve_plan_sha256, folder)
            print(json.dumps({'status': 'APPROVED_TRACKED_FILES_DELETED', 'ledger': str(ledger),
                              'git_metadata_and_unique_files': 'PRESERVED'})); return
        repositories, blocked = [], []
        for root in discover(home):
            try: repositories.append(repo_plan(root, home))
            except CleanupError as error: blocked.append({'root': str(root), 'code': str(error)})
        plan = {'schema': 1, 'operation': 'DELETE_RECOVERABLE_TRACKED_FILES_ONLY', 'home': str(home),
                'repositories': repositories, 'blocked': blocked}
        code = digest(plan)
        path = folder / ('cleanup-plan-' + code + '.json')
        with path.open('x') as handle: durable(handle, plan)
        print(json.dumps({'status': 'DRY_RUN_NO_DELETIONS', 'private_plan': str(path),
                          'approve_plan_sha256': code, 'recoverable_bytes': sum(r['bytes'] for r in repositories),
                          'repositories': len(repositories), 'blocked_repositories': len(blocked),
                          'preserved': 'All Git metadata, untracked/ignored files, local edits, operational records, credentials and Terraform'}, indent=2))


if __name__ == '__main__':
    try: main()
    except CleanupError as error:
        print(json.dumps({'status': 'STOPPED', 'code': str(error), 'retry_deletion': False})); sys.exit(2)
    except Exception:
        print(json.dumps({'status': 'STOPPED', 'code': 'CLEANUP_UNAVAILABLE_OR_PARTIAL', 'retry_deletion': False})); sys.exit(2)
