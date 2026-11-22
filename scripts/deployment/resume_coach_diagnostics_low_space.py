#!/usr/bin/env python3
"""Resume the approved private-coach rollout with temporary source checkouts.

The original persistent release lock and journal are retained. Only regenerable
npm downloads and, if necessary, the old PR115 installed dependencies are removed.
The incomplete HOME checkout, source files and all release journals are preserved.
"""
import argparse
import fcntl
import hashlib
import os
from pathlib import Path
import platform
import shutil
import stat
import subprocess
import sys
import tempfile

TOOL = '9986ab4be38680cc8f2a9cc29f823b440ce03319'
SOURCE = 'b4734b1323de87dfee96bb91769cbab3cff432e6'
TESTED = '5688bb3f6a01a766af8b78c783faccd8cce8f89c'
DEPLOYED = '19f5e46ae1141da3df7bf14d682757de7e9aec69'
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


def command(arguments, cwd=None, env=None, code='LOCAL_COMMAND_FAILED', allowed=(0,)):
    result = subprocess.run(arguments, cwd=cwd, env=env, capture_output=True, text=True)
    need(result.returncode in allowed, code)
    return result.stdout.strip()


def private_directory(path):
    need(not path.is_symlink(), 'DIRECTORY_SYMLINK_REQUIRES_REVIEW')
    path.mkdir(mode=0o700, exist_ok=True)
    info = path.stat()
    need(stat.S_ISDIR(info.st_mode) and info.st_uid == os.getuid()
         and info.st_mode & 0o077 == 0, 'PRIVATE_DIRECTORY_REQUIRED')


def acquire_lock(path, code):
    descriptor = os.open(path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        info = os.fstat(descriptor)
        need(stat.S_ISREG(info.st_mode) and info.st_uid == os.getuid(), 'PRIVATE_LOCK_REQUIRED')
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
    if shutil.disk_usage(home).free >= HOME_RESERVE:
        return
    cache_root, cache = home / '.npm', home / '.npm' / '_cacache'
    if cache.exists() or cache.is_symlink():
        need(cache_root.is_dir() and not cache_root.is_symlink()
             and cache.is_dir() and not cache.is_symlink(), 'NPM_CACHE_PATH_REQUIRES_REVIEW')
        shutil.rmtree(cache)
        print('REMOVED_REGENERABLE_NPM_DOWNLOAD_CACHE', flush=True)
    if shutil.disk_usage(home).free >= HOME_RESERVE:
        return
    old_release = home / 'jems-releases' / ('pr115-' + DEPLOYED)
    application, dependencies = old_release / 'application', old_release / 'application' / 'node_modules'
    if dependencies.exists() or dependencies.is_symlink():
        need(old_release.is_dir() and not old_release.is_symlink()
             and dependencies.is_dir() and not dependencies.is_symlink(), 'PR115_DEPENDENCY_PATH_REQUIRES_REVIEW')
        verify_checkout(application, DEPLOYED)
        need(not git(application, 'ls-files', '--', 'node_modules'), 'TRACKED_DEPENDENCIES_MUST_BE_PRESERVED')
        command(['git', '-C', str(application), 'check-ignore', '-q', '--', 'node_modules/'],
                code='DEPENDENCIES_ARE_NOT_IGNORED')
        old_state = old_release / 'state'
        need(old_state.is_dir() and not old_state.is_symlink(), 'PR115_STATE_DIRECTORY_REQUIRES_REVIEW')
        descriptor = acquire_lock(old_state / 'release.lock', 'PR115_RELEASE_ALREADY_RUNNING')
        try:
            shutil.rmtree(dependencies)
        finally:
            os.close(descriptor)
        print('REMOVED_REGENERABLE_PR115_DEPENDENCIES', flush=True)
    need(shutil.disk_usage(home).free >= HOME_RESERVE, 'HOME_JOURNAL_SPACE_REQUIRED_8_MIB')


def checkout(work, name, expected, extra=()):
    destination = work / name
    if destination.exists() or destination.is_symlink():
        verify_checkout(destination, expected)
    else:
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
    if missing:
        command(['git', '-C', str(destination), 'fetch', '--quiet', '--no-tags', '--depth=1',
                 'origin', *missing], code='PINNED_SOURCE_FETCH_FAILED')
    return destination


def node_environment(work):
    architecture = {'x86_64': 'x64', 'aarch64': 'arm64', 'arm64': 'arm64'}.get(platform.machine())
    need(platform.system() == 'Linux' and architecture in NODE_HASHES, 'UNSUPPORTED_NODE_PLATFORM')
    name = 'node-v' + NODE_VERSION + '-linux-' + architecture
    previous = Path('/tmp/jems-chat-rollout.qfgeyx')
    node_root = work / name
    if not node_root.exists():
        candidate = previous / name
        if (not previous.is_symlink() and previous.is_dir()
                and previous.stat().st_uid == os.getuid() and previous.stat().st_mode & 0o077 == 0
                and not candidate.is_symlink() and (candidate / 'bin/node').is_file()
                and (candidate / 'bin/npm').is_file()):
            node_root = candidate
        else:
            print('PREPARING_VERIFIED_NODE_22_23_5', flush=True)
            archive = work / (name + '.tar.gz')
            command(['curl', '--fail', '--silent', '--show-error', '--location', '--retry', '2',
                     '--connect-timeout', '15', '--max-time', '120', '--proto', '=https', '--tlsv1.2',
                     'https://nodejs.org/dist/v' + NODE_VERSION + '/' + archive.name,
                     '--output', str(archive)], code='NODE_DOWNLOAD_FAILED')
            digest = hashlib.sha256()
            with archive.open('rb') as stream:
                for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                    digest.update(chunk)
            need(digest.hexdigest() == NODE_HASHES[architecture], 'NODE_ARCHIVE_CHECKSUM_DIFFERS')
            stage = Path(tempfile.mkdtemp(prefix='node-preparing-', dir=work))
            try:
                command(['tar', '-xzf', str(archive), '-C', str(stage), '--no-same-owner'], code='NODE_EXTRACT_FAILED')
                (stage / name).rename(node_root)
            finally:
                shutil.rmtree(stage)
    need(not node_root.is_symlink(), 'NODE_DIRECTORY_SYMLINK_REQUIRES_REVIEW')
    env = os.environ.copy()
    env['PATH'] = str(node_root / 'bin') + os.pathsep + env.get('PATH', '')
    env['TMPDIR'] = str(work / 'temporary')
    env['NPM_CONFIG_CACHE'] = str(work / 'npm-cache')
    env['NPM_CONFIG_LOGS_DIR'] = str(work / 'npm-logs')
    for key in ('TMPDIR', 'NPM_CONFIG_CACHE', 'NPM_CONFIG_LOGS_DIR'):
        private_directory(Path(env[key]))
    need(command(['node', '--version'], env=env) == 'v' + NODE_VERSION, 'NODE_VERSION_DIFFERS')
    need(command(['npm', '--version'], env=env) == '10.9.9', 'NPM_VERSION_DIFFERS')
    return env


def run(mode):
    os.umask(0o077)
    for name in ('GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR'):
        need(name not in os.environ, 'GIT_CONTEXT_OVERRIDE_PRESENT')
    programs = ('git', 'gcloud') if mode == 'rollback' else ('git', 'gcloud', 'gh', 'curl', 'tar')
    for name in programs:
        need(shutil.which(name) is not None, 'REQUIRED_TOOL_MISSING_' + name)
    home = Path.home()
    releases = home / 'jems-releases'
    release = releases / ('coach-diagnostics-' + SOURCE)
    need(releases.is_dir() and not releases.is_symlink()
         and release.is_dir() and not release.is_symlink(), 'ORIGINAL_RELEASE_DIRECTORY_REQUIRED')
    state = release / 'state'
    need(not state.is_symlink(), 'STATE_DIRECTORY_SYMLINK_REQUIRES_REVIEW')
    descriptor = acquire_lock(release / 'bootstrap.lock', 'COACH_RELEASE_ALREADY_RUNNING')
    try:
        work = Path('/tmp') / ('jems-coach-lowspace-' + str(os.getuid()) + '-' + SOURCE[:12] + '-' + TOOL[:12])
        need(not work.is_symlink(), 'TEMP_WORKSPACE_SYMLINK_REQUIRES_REVIEW')
        new_checkouts = any(not (work / name).exists() for name in ('operator', 'application', 'primitives'))
        if new_checkouts:
            need(shutil.disk_usage('/tmp').free >= TEMP_RESERVE, 'TEMP_SOURCE_SPACE_REQUIRED_3_GIB')
        ensure_journal_room(home)
        private_directory(work)
        operator = checkout(work, 'operator', TOOL, (SOURCE, TESTED, DEPLOYED))
        application = checkout(work, 'application', SOURCE)
        primitives = checkout(work, 'primitives', PRIMITIVES)
        env = os.environ.copy()
        if mode != 'rollback':
            env = node_environment(work)
            print('INSTALLING_PINNED_DEPENDENCIES_IN_TEMP_STORAGE', flush=True)
            command(['npm', 'ci', '--include=dev', '--ignore-scripts', '--no-audit', '--no-fund',
                     '--cache', env['NPM_CONFIG_CACHE'], '--logs-dir', env['NPM_CONFIG_LOGS_DIR']],
                    cwd=application, env=env, code='PINNED_DEPENDENCY_INSTALL_FAILED')
        else:
            private_directory(work / 'temporary')
            env['TMPDIR'] = str(work / 'temporary')
        need(shutil.disk_usage(home).free >= HOME_RESERVE, 'HOME_JOURNAL_SPACE_REQUIRED_8_MIB')
        if mode != 'rollback':
            need(shutil.disk_usage('/tmp').free >= OPERATOR_TEMP_RESERVE,
                 'TEMP_OPERATOR_SPACE_REQUIRED_256_MIB')
        print('RUNNING_UNCHANGED_APPROVED_COACH_OPERATOR', flush=True)
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
