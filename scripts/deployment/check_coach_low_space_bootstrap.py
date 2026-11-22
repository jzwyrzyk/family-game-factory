#!/usr/bin/env python3
"""Offline filesystem and orchestration checks; no network or cloud calls."""
import contextlib
import io
import os
from pathlib import Path
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import resume_coach_diagnostics_low_space as bootstrap


class LowSpaceBootstrapTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix='jems-lowspace-check-')
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.home = self.root / 'owner'
        self.home.mkdir()
        previous_umask = os.umask(0o077)
        self.addCleanup(os.umask, previous_umask)

    def git(self, directory, *args):
        return subprocess.check_output(['git', '-C', str(directory), *args],
                                       stderr=subprocess.PIPE, text=True).strip()

    def repository(self, directory):
        directory.mkdir(parents=True)
        self.git(directory, 'init', '--quiet')
        self.git(directory, 'config', 'user.name', 'Fixture')
        self.git(directory, 'config', 'user.email', 'fixture@example.invalid')
        self.git(directory, 'remote', 'add', 'origin', bootstrap.REMOTE)
        (directory / '.gitignore').write_text('node_modules/\n')
        (directory / 'source.txt').write_text('approved source\n')
        self.git(directory, 'add', '.gitignore', 'source.txt')
        self.git(directory, 'commit', '--quiet', '-m', 'Fixture source')
        return self.git(directory, 'rev-parse', 'HEAD')

    def old_worktree(self):
        origin = self.root / 'fixture-repository'
        commit = self.repository(origin)
        release = self.home / 'jems-releases' / ('pr115-' + commit)
        release.mkdir(parents=True)
        application = release / 'application'
        self.git(origin, 'worktree', 'add', '--quiet', '--detach', str(application), commit)
        dependencies = application / 'node_modules'
        dependencies.mkdir()
        (dependencies / 'replaceable.js').write_text('installed package\n')
        state = release / 'state'
        state.mkdir()
        journal = state / 'release.json'
        journal.write_bytes(b'{"phase":"existing receipt"}\n')
        return commit, application, dependencies, journal

    def free_after_removal(self, path):
        return lambda _: SimpleNamespace(free=0 if path.exists() else bootstrap.HOME_RESERVE)

    def test_cache_cleanup_preserves_source_journal_and_other_npm_files(self):
        cache = self.home / '.npm' / '_cacache'
        cache.mkdir(parents=True)
        (cache / 'download').write_text('rebuildable')
        log = cache.parent / 'keep-log'
        log.write_bytes(b'keep npm metadata')
        source = self.home / 'incomplete-tool'
        source.mkdir()
        (source / 'source.txt').write_bytes(b'unknown local source')
        journal = self.home / 'release.json'
        journal.write_bytes(b'original journal')
        inode = journal.stat().st_ino
        with patch.object(bootstrap.shutil, 'disk_usage', side_effect=self.free_after_removal(cache)), \
                contextlib.redirect_stdout(io.StringIO()):
            bootstrap.ensure_journal_room(self.home)
        self.assertFalse(cache.exists())
        self.assertEqual(log.read_bytes(), b'keep npm metadata')
        self.assertEqual((source / 'source.txt').read_bytes(), b'unknown local source')
        self.assertEqual((journal.read_bytes(), journal.stat().st_ino), (b'original journal', inode))

    def test_old_worktree_dependency_cleanup_preserves_source_and_journal(self):
        commit, application, dependencies, journal = self.old_worktree()
        self.assertTrue((application / '.git').is_file())
        before = (journal.read_bytes(), journal.stat().st_ino)
        with patch.object(bootstrap, 'DEPLOYED', commit), \
                patch.object(bootstrap.shutil, 'disk_usage', side_effect=self.free_after_removal(dependencies)), \
                contextlib.redirect_stdout(io.StringIO()):
            bootstrap.ensure_journal_room(self.home)
        self.assertFalse(dependencies.exists())
        self.assertEqual((application / 'source.txt').read_text(), 'approved source\n')
        self.assertEqual(self.git(application, 'rev-parse', 'HEAD'), commit)
        self.assertEqual((journal.read_bytes(), journal.stat().st_ino), before)

    def test_dirty_old_worktree_is_preserved(self):
        commit, application, dependencies, journal = self.old_worktree()
        (application / 'source.txt').write_text('uncommitted work\n')
        before = journal.read_bytes()
        with patch.object(bootstrap, 'DEPLOYED', commit), \
                patch.object(bootstrap.shutil, 'disk_usage', return_value=SimpleNamespace(free=0)):
            with self.assertRaisesRegex(bootstrap.Stop, '^CLEAN_CHECKOUT_REQUIRED$'):
                bootstrap.ensure_journal_room(self.home)
        self.assertTrue(dependencies.is_dir())
        self.assertEqual((application / 'source.txt').read_text(), 'uncommitted work\n')
        self.assertEqual(journal.read_bytes(), before)

    def test_symlink_cache_is_rejected_without_touching_its_target(self):
        target = self.root / 'unrelated'
        target.mkdir()
        marker = target / 'keep'
        marker.write_bytes(b'preserve')
        npm = self.home / '.npm'
        npm.mkdir()
        cache = npm / '_cacache'
        cache.symlink_to(target, target_is_directory=True)
        with patch.object(bootstrap.shutil, 'disk_usage', return_value=SimpleNamespace(free=0)):
            with self.assertRaisesRegex(bootstrap.Stop, '^NPM_CACHE_PATH_REQUIRES_REVIEW$'):
                bootstrap.ensure_journal_room(self.home)
        self.assertTrue(cache.is_symlink())
        self.assertEqual(marker.read_bytes(), b'preserve')

    def test_cached_checkout_with_existing_objects_never_fetches(self):
        work = self.root / 'workspace'
        directory = work / 'operator'
        first = self.repository(directory)
        (directory / 'source.txt').write_text('second source\n')
        self.git(directory, 'commit', '--quiet', '-am', 'Second fixture source')
        second = self.git(directory, 'rev-parse', 'HEAD')
        original = bootstrap.command

        def local_only(arguments, **kwargs):
            self.assertNotIn('fetch', arguments, 'Cached source must not require network access')
            self.assertEqual(arguments[0], 'git')
            return original(arguments, **kwargs)

        with patch.object(bootstrap, 'command', side_effect=local_only):
            self.assertEqual(bootstrap.checkout(work, 'operator', second, (first, second)), directory)
        self.assertEqual(self.git(directory, 'status', '--porcelain'), '')

    def test_existing_lock_refuses_a_second_holder(self):
        path = self.root / 'bootstrap.lock'
        descriptor = bootstrap.acquire_lock(path, 'ALREADY_RUNNING')
        try:
            with self.assertRaisesRegex(bootstrap.Stop, '^ALREADY_RUNNING$'):
                bootstrap.acquire_lock(path, 'ALREADY_RUNNING')
        finally:
            os.close(descriptor)
        descriptor = bootstrap.acquire_lock(path, 'ALREADY_RUNNING')
        os.close(descriptor)

    def test_execute_calls_original_operator_once_and_keeps_original_journal(self):
        release = self.home / 'jems-releases' / ('coach-diagnostics-' + bootstrap.SOURCE)
        state = release / 'state'
        state.mkdir(parents=True)
        journal = state / 'release.json'
        journal.write_bytes(b'original persistent release journal')
        before = (journal.read_bytes(), journal.stat().st_ino)
        incomplete = release / 'incomplete-source'
        incomplete.write_bytes(b'preserved')
        workspace = self.root / 'prepared'
        env = {'PATH': '/fixture', 'NPM_CONFIG_CACHE': str(workspace / 'cache'),
               'NPM_CONFIG_LOGS_DIR': str(workspace / 'logs')}

        def prepared_checkout(work, name, expected, extra=()):
            self.assertTrue(str(work).startswith('/tmp/jems-coach-lowspace-'))
            return workspace / name

        with patch.object(bootstrap.Path, 'home', return_value=self.home), \
                patch.object(bootstrap.shutil, 'which', return_value='/fixture/tool'), \
                patch.object(bootstrap.shutil, 'disk_usage', return_value=SimpleNamespace(free=10**12)), \
                patch.object(bootstrap, 'private_directory'), \
                patch.object(bootstrap, 'checkout', side_effect=prepared_checkout), \
                patch.object(bootstrap, 'node_environment', return_value=env), \
                patch.object(bootstrap, 'command', return_value='') as preparation, \
                patch.object(bootstrap.subprocess, 'call', return_value=7) as operator, \
                contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(bootstrap.run('execute'), 7)
        operator.assert_called_once_with([
            bootstrap.sys.executable, str(workspace / 'operator/scripts/deployment/release_coach_diagnostics.py'),
            '--reviewed-source-sha', bootstrap.SOURCE, '--tested-source-sha', bootstrap.TESTED,
            '--application-dir', str(workspace / 'application'),
            '--primitives-dir', str(workspace / 'primitives'), '--state-dir', str(state), '--execute'], env=env)
        self.assertEqual(preparation.call_count, 1)
        self.assertEqual(preparation.call_args.args[0][:2], ['npm', 'ci'])
        self.assertEqual((journal.read_bytes(), journal.stat().st_ino), before)
        self.assertEqual(incomplete.read_bytes(), b'preserved')

    def test_bad_node_archive_is_rejected_before_extraction_or_execution(self):
        work = self.root / 'workspace'
        work.mkdir()
        real_path = Path

        def fixture_path(value):
            return self.root / 'missing-prior-node' if str(value) == '/tmp/jems-chat-rollout.qfgeyx' else real_path(value)

        def bad_download(arguments, **kwargs):
            self.assertEqual(arguments[0], 'curl', 'No archive extraction or binary execution is allowed')
            real_path(arguments[arguments.index('--output') + 1]).write_bytes(b'invalid archive')
            return ''

        with patch.object(bootstrap, 'Path', side_effect=fixture_path), \
                patch.object(bootstrap.platform, 'machine', return_value='x86_64'), \
                patch.object(bootstrap.platform, 'system', return_value='Linux'), \
                patch.object(bootstrap, 'command', side_effect=bad_download) as command, \
                contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaisesRegex(bootstrap.Stop, '^NODE_ARCHIVE_CHECKSUM_DIFFERS$'):
                bootstrap.node_environment(work)
        self.assertEqual(command.call_count, 1)


if __name__ == '__main__':
    unittest.main(verbosity=2)
