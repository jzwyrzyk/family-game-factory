#!/usr/bin/env python3
"""Prepare the pinned private-coach readiness rollout in temporary storage.

Only the new source-keyed readiness lock and state directory live in HOME.
Existing diagnostic checkouts, journals, caches and dependencies are never
removed. Release recovery and uncertain-operation handling belong to the pinned
operator; this bootstrap invokes it once and preserves its journal.
"""
import argparse
import fcntl
import hashlib
import os
from pathlib import Path
import platform
import re
import shutil
import stat
import subprocess
import sys
import tempfile

# Published operator and exact merged PR131 source, independently tree-verified.
# All immutable pins are checked before any filesystem setup.
TOOL = '2b8f65de6e02637e34d1c89ac27512fcbd6c15b3'
SOURCE = '1996c1b382a797a6052ee1304867fdb5b620c3d3'
TESTED = 'ae084f6b2b0364830adc9ae47c87046cbf7c2d72'
DEPLOYED = 'b4734b1323de87dfee96bb91769cbab3cff432e6'
PRIMITIVES = '804574895d8ab86fe270e590ecfa05fa5d4bc290'
REMOTE = 'https://github.com/jzwyrzyk/family-game-factory.git'
NODE_VERSION = '22.23.5'
NODE_HASHES = {
    'x64': 'c54118104acc524633b5abe106bbf44a53126ec8b4e5fa105cb92b5d7de8a1a1',
    'arm64': '8bd3dc69eee8f3f226315a80d7d1d4faccf217a4c8fae500168ac2e38f3bdba3',
}
HOME_RESERVE = 8 * 1024 * 1024
TEMP_RESERVE = 3 * 1024 * 1024 * 1024
OPERATOR_TEMP_RESERVE = 256 * 1024 * 1024


class Stop(RuntimeError):
    pass


def need(condition, code):
    if not condition:
        raise Stop(code)


def validate_pins():
    for name in ('TOOL', 'SOURCE', 'TESTED', 'DEPLOYED', 'PRIMITIVES'):
        need(re.fullmatch(r'[0-9a-f]{40}', globals()[name]) is not None,
             'IMMUTABLE_PIN_REQUIRED_' + name)


def command(arguments, cwd=None, env=None, code='LOCAL_COMMAND_FAILED', allowed=(0,)):
    result = subprocess.run(arguments, cwd=cwd, env=env, capture_output=True, text=True)
    need(result.returncode in allowed, code)
    return result.stdout.strip()


def owned_directory(path, private=True):
    need(not path.is_symlink(), 'DIRECTORY_SYMLINK_REQUIRES_REVIEW')
    if not path.exists():
        path.mkdir(mode=0o700)
    info = path.stat()
    forbidden = 0o077 if private else 0o022
    need(stat.S_ISDIR(info.st_mode) and info.st_uid == os.getuid()
         and info.st_mode & forbidden == 0, 'PRIVATE_DIRECTORY_REQUIRED')


def acquire_lock(path, code):
    descriptor = os.open(path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        info = os.fstat(descriptor)
        need(stat.S_ISREG(info.st_mode) and info.st_uid == os.getuid()
             and info.st_mode & 0o077 == 0 and info.st_nlink == 1, 'PRIVATE_LOCK_REQUIRED')
        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise Stop(code) from None
        return descriptor
    except BaseException:
        os.close(descriptor)
        raise


def git(directory, *arguments):
    return command(['git', '-C', str(directory), *arguments], code='LOCAL_GIT_CHECK_FAILED')


def verify_checkout(directory, expected):
    need(directory.is_dir() and not directory.is_symlink(), 'PINNED_CHECKOUT_REQUIRED')
    need(not (directory / '.git').is_symlink(), 'GIT_DIRECTORY_SYMLINK_REQUIRES_REVIEW')
    need(git(directory, 'rev-parse', '--show-toplevel') == str(directory.resolve()), 'REPOSITORY_ROOT_DIFFERS')
    need(git(directory, 'remote', 'get-url', 'origin') == REMOTE, 'CHECKOUT_REMOTE_DIFFERS')
    need(git(directory, 'rev-parse', 'HEAD') == expected, 'CHECKOUT_SOURCE_DIFFERS')
    need(not git(directory, 'status', '--porcelain'), 'CLEAN_CHECKOUT_REQUIRED')


def ensure_journal_room(home):
    need(shutil.disk_usage(home).free >= HOME_RESERVE, 'HOME_JOURNAL_SPACE_REQUIRED_8_MIB')


def temporary_workspace():
    return Path('/tmp') / ('jems-coach-readiness-' + str(os.getuid()) + '-' + SOURCE[:12] + '-' + TOOL[:12])


def checkout(work, name, expected, extra=(), offline=False):
    destination = work / name
    if destination.exists() or destination.is_symlink():
        verify_checkout(destination, expected)
    else:
        need(not offline, 'ROLLBACK_CACHED_CHECKOUT_REQUIRED')
        print('PREPARING_PINNED_' + name.upper(), flush=True)
        stage = Path(tempfile.mkdtemp(prefix=name + '-preparing-', dir=work))
        try:
            command(['git', 'init', '--quiet', str(stage)])
            command(['git', '-C', str(stage), 'remote', 'add', 'origin', REMOTE])
            command(['git', '-C', str(stage), 'fetch', '--quiet', '--no-tags', '--depth=1',
                     'origin', expected, *extra], code='PINNED_SOURCE_FETCH_FAILED')
            command(['git', '-C', str(stage), 'checkout', '--quiet', '--detach', expected],
                    code='PINNED_SOURCE_CHECKOUT_FAILED')
            verify_checkout(stage, expected)
            stage.rename(destination)
        finally:
            if stage.exists():
                shutil.rmtree(stage)
    missing = [sha for sha in extra if subprocess.run(
        ['git', '-C', str(destination), 'cat-file', '-e', sha + '^{commit}'],
        capture_output=True).returncode != 0]
    need(not (offline and missing), 'ROLLBACK_CACHED_GIT_OBJECT_REQUIRED')
    if missing:
        command(['git', '-C', str(destination), 'fetch', '--quiet', '--no-tags', '--depth=1',
                 'origin', *missing], code='PINNED_SOURCE_FETCH_FAILED')
    return destination


def node_environment(work):
    architecture = {'x86_64': 'x64', 'aarch64': 'arm64', 'arm64': 'arm64'}.get(platform.machine())
    need(platform.system() == 'Linux' and architecture in NODE_HASHES, 'UNSUPPORTED_NODE_PLATFORM')
    name = 'node-v' + NODE_VERSION + '-linux-' + architecture
    node_root = work / name
    need(not node_root.is_symlink(), 'NODE_DIRECTORY_SYMLINK_REQUIRES_REVIEW')
    if not node_root.exists():
        print('PREPARING_VERIFIED_NODE_22_23_5', flush=True)
        stage = Path(tempfile.mkdtemp(prefix='node-preparing-', dir=work))
        try:
            archive = stage / (name + '.tar.gz')
            command(['curl', '--fail', '--silent', '--show-error', '--location', '--retry', '2',
                     '--connect-timeout', '15', '--max-time', '120', '--proto', '=https', '--tlsv1.2',
                     'https://nodejs.org/dist/v' + NODE_VERSION + '/' + archive.name,
                     '--output', str(archive)], code='NODE_DOWNLOAD_FAILED')
            digest = hashlib.sha256()
            with archive.open('rb') as stream:
                for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                    digest.update(chunk)
            need(digest.hexdigest() == NODE_HASHES[architecture], 'NODE_ARCHIVE_CHECKSUM_DIFFERS')
            command(['tar', '-xzf', str(archive), '-C', str(stage), '--no-same-owner'], code='NODE_EXTRACT_FAILED')
            (stage / name).rename(node_root)
        finally:
            shutil.rmtree(stage)
    owned_directory(node_root, private=False)
    need((node_root / 'bin/node').is_file() and (node_root / 'bin/npm').is_file(), 'NODE_BINARIES_REQUIRED')
    env = os.environ.copy()
    env['PATH'] = str(node_root / 'bin') + os.pathsep + env.get('PATH', '')
    env['TMPDIR'] = str(work / 'temporary')
    env['NPM_CONFIG_CACHE'] = str(work / 'npm-cache')
    env['NPM_CONFIG_LOGS_DIR'] = str(work / 'npm-logs')
    for key in ('TMPDIR', 'NPM_CONFIG_CACHE', 'NPM_CONFIG_LOGS_DIR'):
        owned_directory(Path(env[key]))
    need(command(['node', '--version'], env=env) == 'v' + NODE_VERSION, 'NODE_VERSION_DIFFERS')
    need(command(['npm', '--version'], env=env) == '10.9.9', 'NPM_VERSION_DIFFERS')
    return env


def run(mode):
    validate_pins()
    need(mode in ('execute', 'plan', 'rollback'), 'INVALID_MODE')
    os.umask(0o077)
    for name in ('GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR'):
        need(name not in os.environ, 'GIT_CONTEXT_OVERRIDE_PRESENT')
    programs = ('git', 'gcloud') if mode == 'rollback' else ('git', 'gcloud', 'gh', 'curl', 'tar')
    for name in programs:
        need(shutil.which(name) is not None, 'REQUIRED_TOOL_MISSING_' + name)
    home = Path.home()
    releases = home / 'jems-releases'
    release = releases / ('coach-readiness-' + SOURCE)
    state = release / 'state'
    work = temporary_workspace()
    need(not work.is_symlink(), 'TEMP_WORKSPACE_SYMLINK_REQUIRES_REVIEW')
    ensure_journal_room(home)
    new_checkouts = any(not (work / name).exists() for name in ('operator', 'application', 'primitives'))
    if mode != 'rollback' and (new_checkouts or not (work / 'application/node_modules').is_dir()):
        need(shutil.disk_usage('/tmp').free >= TEMP_RESERVE, 'TEMP_SOURCE_SPACE_REQUIRED_3_GIB')
    # A pre-existing common releases parent may be readable; the new release and
    # state directories must remain private. Never chmod an existing directory.
    owned_directory(releases, private=False)
    owned_directory(release)
    descriptor = acquire_lock(release / 'bootstrap.lock', 'COACH_RELEASE_ALREADY_RUNNING')
    try:
        owned_directory(state)
        need(not (state / 'release.json').is_symlink(), 'JOURNAL_SYMLINK_REQUIRES_REVIEW')
        owned_directory(work)
        offline = mode == 'rollback'
        operator = checkout(work, 'operator', TOOL, (SOURCE, TESTED, DEPLOYED), offline=offline)
        application = checkout(work, 'application', SOURCE, offline=offline)
        primitives = checkout(work, 'primitives', PRIMITIVES, offline=offline)
        env = os.environ.copy()
        if not offline:
            need(not (application / 'node_modules').is_symlink(), 'DEPENDENCY_SYMLINK_REQUIRES_REVIEW')
            env = node_environment(work)
            print('INSTALLING_PINNED_DEPENDENCIES_IN_TEMP_STORAGE', flush=True)
            command(['npm', 'ci', '--include=dev', '--ignore-scripts', '--no-audit', '--no-fund',
                     '--cache', env['NPM_CONFIG_CACHE'], '--logs-dir', env['NPM_CONFIG_LOGS_DIR']],
                    cwd=application, env=env, code='PINNED_DEPENDENCY_INSTALL_FAILED')
            verify_checkout(application, SOURCE)
        else:
            owned_directory(work / 'temporary')
            env['TMPDIR'] = str(work / 'temporary')
        ensure_journal_room(home)
        need(shutil.disk_usage('/tmp').free >= OPERATOR_TEMP_RESERVE,
             'TEMP_OPERATOR_SPACE_REQUIRED_256_MIB')
        print('RUNNING_PINNED_COACH_READINESS_OPERATOR', flush=True)
        arguments = [sys.executable, str(operator / 'scripts/deployment/release_coach_diagnostics.py'),
                     '--reviewed-source-sha', SOURCE, '--tested-source-sha', TESTED,
                     '--application-dir', str(application), '--primitives-dir', str(primitives),
                     '--state-dir', str(state)]
        if mode != 'plan':
            arguments.append('--' + mode)
        return subprocess.call(arguments, env=env)
    finally:
        os.close(descriptor)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', nargs='?', choices=('execute', 'plan', 'rollback'), default='execute')
    args = parser.parse_args()
    try:
        return run(args.mode)
    except Stop as error:
        print(str(error), file=sys.stderr)
    except (OSError, ValueError, subprocess.SubprocessError):
        print('LOCAL_STORAGE_SETUP_FAILED_RETAIN_EXISTING_RELEASE_JOURNAL', file=sys.stderr)
    return 2


if __name__ == '__main__':
    raise SystemExit(main())
