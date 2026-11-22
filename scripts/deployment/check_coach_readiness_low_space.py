#!/usr/bin/env python3
"""Offline readiness-bootstrap checks; local Git fixtures, no cloud or model calls."""
import contextlib
import io
import os
from pathlib import Path
import stat
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import run_coach_readiness_low_space as bootstrap


class ReadinessLowSpaceTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix='jems-readiness-bootstrap-check-')
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.home = self.root / 'owner'
        self.home.mkdir(mode=0o700)
        self.work = self.root / 'temporary-workspace'
        self.origin = self.root / 'fixture-origin'
        previous_umask = os.umask(0o077)
        self.addCleanup(os.umask, previous_umask)
        self.home_free = 10**12
        self.temp_free = 10**12
        self.commands = []
        self.pins = None

    def git(self, directory, *args):
        return subprocess.check_output(['git', '-C', str(directory), *args],
                                       stderr=subprocess.PIPE, text=True).strip()

    def fixture_pins(self):
        if self.pins is not None:
            return self.pins
        self.origin.mkdir(mode=0o700)
        self.git(self.origin, 'init', '--quiet')
        self.git(self.origin, 'config', 'user.name', 'Fixture')
        self.git(self.origin, 'config', 'user.email', 'fixture@example.invalid')
        (self.origin / '.gitignore').write_text('node_modules/\n')
        self.pins = {}
        for name in ('DEPLOYED', 'PRIMITIVES', 'TESTED', 'SOURCE', 'TOOL'):
            (self.origin / 'source.txt').write_text('Synthetic fixture ' + name + '\n')
            self.git(self.origin, 'add', '.gitignore', 'source.txt')
            self.git(self.origin, 'commit', '--quiet', '-m', 'Fixture ' + name)
            self.pins[name] = self.git(self.origin, 'rev-parse', 'HEAD')
        return self.pins

    def release_path(self):
        return self.home / 'jems-releases' / ('coach-readiness-' + self.fixture_pins()['SOURCE'])

    def cached_checkouts(self):
        self.work.mkdir(mode=0o700)
        for name, pin in (('operator', 'TOOL'), ('application', 'SOURCE'), ('primitives', 'PRIMITIVES')):
            directory = self.work / name
            subprocess.run(['git', 'clone', '--quiet', '--no-hardlinks', str(self.origin), str(directory)],
                           check=True, capture_output=True)
            self.git(directory, 'remote', 'set-url', 'origin', bootstrap.REMOTE)
            self.git(directory, 'checkout', '--quiet', '--detach', self.fixture_pins()[pin])

    def historical_markers(self):
        paths = (
            '.npm/_cacache/keep-cache',
            'jems-releases/coach-diagnostics-b4734b1323de87dfee96bb91769cbab3cff432e6/state/release.json',
            'jems-releases/coach-diagnostics-b4734b1323de87dfee96bb91769cbab3cff432e6/incomplete-tool/source.txt',
            'jems-releases/pr115-19f5e46ae1141da3df7bf14d682757de7e9aec69/application/node_modules/keep-package',
            'jems-releases/pr115-' + self.fixture_pins()['DEPLOYED'] + '/application/node_modules/keep-package',
        )
        snapshot = {}
        for relative in paths:
            path = self.home / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b'Preserve unknown source, cache or journal\n')
            snapshot[path] = (path.read_bytes(), path.stat().st_ino)
        return snapshot

    def assert_preserved(self, snapshot):
        for path, before in snapshot.items():
            self.assertEqual((path.read_bytes(), path.stat().st_ino), before)

    @contextlib.contextmanager
    def environment(self, allow_local_fetch=True, operator_code=0, after_install=None):
        pins = self.fixture_pins()
        real_command = bootstrap.command

        def local_command(arguments, **kwargs):
            self.commands.append(arguments)
            if arguments[0] == 'npm':
                self.assertEqual(arguments[:2], ['npm', 'ci'])
                self.assertEqual(kwargs['cwd'], self.work / 'application')
                self.assertIn('--ignore-scripts', arguments)
                (self.work / 'application/node_modules').mkdir(exist_ok=True)
                if after_install:
                    after_install()
                return ''
            self.assertEqual(arguments[0], 'git', 'Unexpected process in offline fixture')
            if 'fetch' in arguments:
                self.assertTrue(allow_local_fetch, 'Cached rollback must never fetch')
                arguments = list(arguments)
                arguments[arguments.index('origin')] = str(self.origin)
            return real_command(arguments, **kwargs)

        def fake_node(work):
            self.assertEqual(work, self.work)
            environment = os.environ.copy()
            for key, name in (('TMPDIR', 'temporary'), ('NPM_CONFIG_CACHE', 'npm-cache'),
                              ('NPM_CONFIG_LOGS_DIR', 'npm-logs')):
                directory = work / name
                bootstrap.owned_directory(directory)
                environment[key] = str(directory)
            return environment

        with contextlib.ExitStack() as stack:
            stack.enter_context(patch.multiple(bootstrap, **pins))
            stack.enter_context(patch.object(bootstrap.Path, 'home', return_value=self.home))
            stack.enter_context(patch.object(bootstrap, 'temporary_workspace', return_value=self.work))
            which = stack.enter_context(patch.object(bootstrap.shutil, 'which', return_value='/fixture/tool'))
            stack.enter_context(patch.object(bootstrap.shutil, 'disk_usage', side_effect=lambda path:
                                            SimpleNamespace(free=self.home_free if Path(path) == self.home
                                                            else self.temp_free)))
            stack.enter_context(patch.object(bootstrap, 'command', side_effect=local_command))
            node = stack.enter_context(patch.object(bootstrap, 'node_environment', side_effect=fake_node))
            operator = stack.enter_context(patch.object(bootstrap.subprocess, 'call', return_value=operator_code))
            stack.enter_context(contextlib.redirect_stdout(io.StringIO()))
            yield SimpleNamespace(operator=operator, node=node, which=which)

    def test_pending_or_malformed_pins_fail_before_any_setup(self):
        for pin in ('TOOL', 'SOURCE', 'TESTED', 'DEPLOYED', 'PRIMITIVES'):
            pins = {name: 'a' * 40 for name in ('TOOL', 'SOURCE', 'TESTED', 'DEPLOYED', 'PRIMITIVES')}
            pins[pin] = 'PENDING_REVIEWED_PIN'
            with self.subTest(pin=pin), patch.multiple(bootstrap, **pins), \
                    patch.object(bootstrap.os, 'umask') as umask, \
                    patch.object(bootstrap.shutil, 'which') as tools, \
                    patch.object(bootstrap, 'owned_directory') as directory, \
                    patch.object(bootstrap.subprocess, 'call') as operator:
                with self.assertRaisesRegex(bootstrap.Stop, '^IMMUTABLE_PIN_REQUIRED_' + pin + '$'):
                    bootstrap.run('execute')
                umask.assert_not_called()
                tools.assert_not_called()
                directory.assert_not_called()
                operator.assert_not_called()

    def test_workspace_names_bind_source_and_tool_without_historical_paths(self):
        with patch.multiple(bootstrap, SOURCE='1' * 40, TOOL='2' * 40):
            self.assertEqual(bootstrap.temporary_workspace(),
                             Path('/tmp/jems-coach-readiness-' + str(os.getuid()) + '-' + '1' * 12 + '-' + '2' * 12))

    def test_first_execution_creates_private_new_state_and_three_exact_checkouts(self):
        with self.environment() as execution:
            self.assertEqual(bootstrap.run('execute'), 0)
            state = self.release_path() / 'state'
            for directory in (self.home / 'jems-releases', self.release_path(), state, self.work):
                self.assertEqual(stat.S_IMODE(directory.stat().st_mode), 0o700)
                self.assertEqual(directory.stat().st_uid, os.getuid())
            for name, pin in (('operator', 'TOOL'), ('application', 'SOURCE'), ('primitives', 'PRIMITIVES')):
                bootstrap.verify_checkout(self.work / name, self.pins[pin])
            self.assertFalse((state / 'release.json').exists(), 'Only the operator may create its journal')
            self.assertEqual(sum('fetch' in command for command in self.commands), 3)
            execution.operator.assert_called_once()
            arguments = execution.operator.call_args.args[0]
            self.assertEqual(arguments, [bootstrap.sys.executable,
                str(self.work / 'operator/scripts/deployment/release_coach_diagnostics.py'),
                '--reviewed-source-sha', self.pins['SOURCE'], '--tested-source-sha', self.pins['TESTED'],
                '--application-dir', str(self.work / 'application'),
                '--primitives-dir', str(self.work / 'primitives'), '--state-dir', str(state), '--execute'])
            for key in ('TMPDIR', 'NPM_CONFIG_CACHE', 'NPM_CONFIG_LOGS_DIR'):
                self.assertTrue(Path(execution.operator.call_args.kwargs['env'][key]).is_relative_to(self.work))

    def test_existing_uncertain_journal_and_old_diagnostics_are_preserved_without_retry(self):
        snapshot = self.historical_markers()
        state = self.release_path() / 'state'
        state.mkdir(parents=True)
        journal = state / 'release.json'
        journal.write_bytes(b'{"phase":"uncertain cloud operation"}\n')
        snapshot[journal] = (journal.read_bytes(), journal.stat().st_ino)
        with self.environment(operator_code=7) as execution:
            self.assertEqual(bootstrap.run('execute'), 7)
            execution.operator.assert_called_once()
            arguments = execution.operator.call_args.args[0]
            self.assertEqual(arguments[arguments.index('--state-dir') + 1], str(state))
        self.assert_preserved(snapshot)

    def test_plan_omits_both_operator_mutation_flags(self):
        with self.environment() as execution:
            self.assertEqual(bootstrap.run('plan'), 0)
            execution.operator.assert_called_once()
            arguments = execution.operator.call_args.args[0]
            self.assertNotIn('--execute', arguments)
            self.assertNotIn('--rollback', arguments)
            self.assertNotIn('--plan', arguments)

    def test_low_home_stops_without_cleanup_or_retargeting_old_release_dependencies(self):
        snapshot = self.historical_markers()
        self.home_free = bootstrap.HOME_RESERVE - 1
        with self.environment() as execution, patch.object(bootstrap.shutil, 'rmtree') as removal:
            with self.assertRaisesRegex(bootstrap.Stop, '^HOME_JOURNAL_SPACE_REQUIRED_8_MIB$'):
                bootstrap.run('execute')
            removal.assert_not_called()
            execution.node.assert_not_called()
            execution.operator.assert_not_called()
        self.assertFalse(self.release_path().exists())
        self.assertFalse(self.work.exists())
        self.assert_preserved(snapshot)

    def test_fresh_setup_requires_three_gib_before_directory_creation(self):
        self.temp_free = bootstrap.TEMP_RESERVE - 1
        with self.environment() as execution:
            with self.assertRaisesRegex(bootstrap.Stop, '^TEMP_SOURCE_SPACE_REQUIRED_3_GIB$'):
                bootstrap.run('plan')
            execution.operator.assert_not_called()
        self.assertFalse((self.home / 'jems-releases').exists())
        self.assertFalse(self.work.exists())

    def test_headroom_is_rechecked_before_operator(self):
        def reduce_space():
            self.temp_free = bootstrap.OPERATOR_TEMP_RESERVE - 1

        with self.environment(after_install=reduce_space) as execution:
            with self.assertRaisesRegex(bootstrap.Stop, '^TEMP_OPERATOR_SPACE_REQUIRED_256_MIB$'):
                bootstrap.run('execute')
            execution.operator.assert_not_called()
        self.assertTrue((self.release_path() / 'state').is_dir())
        self.assertTrue((self.work / 'application').is_dir())

    def test_cached_rollback_needs_no_node_npm_download_or_git_fetch(self):
        self.fixture_pins()
        self.cached_checkouts()
        state = self.release_path() / 'state'
        state.mkdir(parents=True)
        journal = state / 'release.json'
        journal.write_bytes(b'{"phase":"candidate serving"}\n')
        snapshot = {journal: (journal.read_bytes(), journal.stat().st_ino)}
        self.temp_free = bootstrap.OPERATOR_TEMP_RESERVE
        with self.environment(allow_local_fetch=False) as execution:
            self.assertEqual(bootstrap.run('rollback'), 0)
            execution.node.assert_not_called()
            self.assertEqual([call.args[0] for call in execution.which.call_args_list], ['git', 'gcloud'])
            self.assertTrue(all(command[0] == 'git' and 'fetch' not in command for command in self.commands))
            execution.operator.assert_called_once()
            self.assertEqual(execution.operator.call_args.args[0][-1], '--rollback')
        self.assert_preserved(snapshot)

    def test_rollback_missing_cached_checkout_or_git_object_never_fetches(self):
        self.fixture_pins()
        self.cached_checkouts()
        with self.environment(allow_local_fetch=False) as execution:
            with self.assertRaisesRegex(bootstrap.Stop, '^ROLLBACK_CACHED_CHECKOUT_REQUIRED$'):
                bootstrap.checkout(self.work, 'absent', self.pins['SOURCE'], offline=True)
            with self.assertRaisesRegex(bootstrap.Stop, '^ROLLBACK_CACHED_GIT_OBJECT_REQUIRED$'):
                bootstrap.checkout(self.work, 'operator', self.pins['TOOL'], ('f' * 40,), offline=True)
            execution.operator.assert_not_called()

    def test_dirty_or_mismatched_cached_sources_stop_before_operator(self):
        self.fixture_pins()
        self.cached_checkouts()
        application = self.work / 'application'
        original = (application / 'source.txt').read_bytes()
        for name, code, alter, restore in (
            ('dirty', 'CLEAN_CHECKOUT_REQUIRED',
             lambda: (application / 'source.txt').write_bytes(b'Preserve local edit\n'),
             lambda: (application / 'source.txt').write_bytes(original)),
            ('source', 'CHECKOUT_SOURCE_DIFFERS',
             lambda: self.git(application, 'checkout', '--quiet', '--detach', self.pins['DEPLOYED']),
             lambda: self.git(application, 'checkout', '--quiet', '--detach', self.pins['SOURCE'])),
            ('remote', 'CHECKOUT_REMOTE_DIFFERS',
             lambda: self.git(application, 'remote', 'set-url', 'origin', '/unrelated'),
             lambda: self.git(application, 'remote', 'set-url', 'origin', bootstrap.REMOTE)),
        ):
            with self.subTest(name=name):
                alter()
                with self.environment(allow_local_fetch=False) as execution:
                    with self.assertRaisesRegex(bootstrap.Stop, '^' + code + '$'):
                        bootstrap.run('execute')
                    execution.node.assert_not_called()
                    execution.operator.assert_not_called()
                restore()

    def test_symlink_release_state_workspace_and_checkout_are_rejected(self):
        self.fixture_pins()
        self.cached_checkouts()
        state = self.release_path() / 'state'
        state.mkdir(parents=True)
        target = self.root / 'unrelated'
        target.mkdir()
        marker = target / 'keep'
        marker.write_bytes(b'untouched')
        paths = ((self.release_path(), 'DIRECTORY_SYMLINK_REQUIRES_REVIEW'),
                 (state, 'DIRECTORY_SYMLINK_REQUIRES_REVIEW'),
                 (self.work, 'TEMP_WORKSPACE_SYMLINK_REQUIRES_REVIEW'),
                 (self.work / 'application', 'PINNED_CHECKOUT_REQUIRED'))
        for path, code in paths:
            with self.subTest(path=path.name):
                preserved = path.with_name(path.name + '-preserved')
                path.rename(preserved)
                path.symlink_to(target, target_is_directory=True)
                try:
                    with self.environment(allow_local_fetch=False) as execution:
                        with self.assertRaisesRegex(bootstrap.Stop, '^' + code + '$'):
                            bootstrap.run('execute')
                        execution.operator.assert_not_called()
                    self.assertEqual(marker.read_bytes(), b'untouched')
                finally:
                    path.unlink()
                    preserved.rename(path)

    def test_competing_bootstrap_lock_prevents_preparation_and_operator(self):
        release = self.release_path()
        release.mkdir(parents=True)
        descriptor = bootstrap.acquire_lock(release / 'bootstrap.lock', 'ALREADY_RUNNING')
        try:
            with self.environment() as execution:
                with self.assertRaisesRegex(bootstrap.Stop, '^COACH_RELEASE_ALREADY_RUNNING$'):
                    bootstrap.run('execute')
                execution.node.assert_not_called()
                execution.operator.assert_not_called()
                self.assertFalse(self.work.exists())
        finally:
            os.close(descriptor)

    def test_failed_checkout_only_removes_its_new_temporary_staging(self):
        self.work.mkdir()
        retained = self.work / 'previous-failed-staging'
        retained.mkdir()
        marker = retained / 'unknown-file'
        marker.write_bytes(b'preserve previous work')
        original = bootstrap.command

        def failed_fetch(arguments, **kwargs):
            if 'fetch' in arguments:
                raise bootstrap.Stop('PINNED_SOURCE_FETCH_FAILED')
            return original(arguments, **kwargs)

        with patch.object(bootstrap, 'command', side_effect=failed_fetch), contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaisesRegex(bootstrap.Stop, '^PINNED_SOURCE_FETCH_FAILED$'):
                bootstrap.checkout(self.work, 'operator', 'a' * 40)
        self.assertEqual(list(self.work.iterdir()), [retained])
        self.assertEqual(marker.read_bytes(), b'preserve previous work')

    def test_bad_node_checksum_stops_before_extraction_or_execution(self):
        self.work.mkdir()
        marker = self.work / 'keep'
        marker.write_bytes(b'keep workspace content')

        def bad_download(arguments, **kwargs):
            self.assertEqual(arguments[0], 'curl', 'No extraction or binary execution after a checksum failure')
            self.assertIn('https://nodejs.org/dist/v22.23.5/node-v22.23.5-linux-x64.tar.gz', arguments)
            Path(arguments[arguments.index('--output') + 1]).write_bytes(b'not a verified Node archive')
            return ''

        with patch.object(bootstrap.platform, 'machine', return_value='x86_64'), \
                patch.object(bootstrap.platform, 'system', return_value='Linux'), \
                patch.object(bootstrap, 'command', side_effect=bad_download) as calls, \
                contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaisesRegex(bootstrap.Stop, '^NODE_ARCHIVE_CHECKSUM_DIFFERS$'):
                bootstrap.node_environment(self.work)
            self.assertEqual(calls.call_count, 1)
        self.assertEqual(list(self.work.iterdir()), [marker])

    def test_cached_node_requires_exact_versions_and_routes_package_paths_to_temp(self):
        node = self.work / 'node-v22.23.5-linux-x64'
        (node / 'bin').mkdir(parents=True)
        (node / 'bin/node').write_bytes(b'fixture binary is not executed')
        (node / 'bin/npm').write_bytes(b'fixture binary is not executed')
        calls = []

        def versions(arguments, **kwargs):
            calls.append(arguments)
            return 'v22.23.5' if arguments == ['node', '--version'] else '10.9.9'

        with patch.object(bootstrap.platform, 'machine', return_value='x86_64'), \
                patch.object(bootstrap.platform, 'system', return_value='Linux'), \
                patch.object(bootstrap, 'command', side_effect=versions):
            environment = bootstrap.node_environment(self.work)
        self.assertEqual(calls, [['node', '--version'], ['npm', '--version']])
        self.assertEqual(environment['PATH'].split(os.pathsep)[0], str(node / 'bin'))
        for key in ('TMPDIR', 'NPM_CONFIG_CACHE', 'NPM_CONFIG_LOGS_DIR'):
            self.assertTrue(Path(environment[key]).is_relative_to(self.work))
        with patch.object(bootstrap.platform, 'machine', return_value='x86_64'), \
                patch.object(bootstrap.platform, 'system', return_value='Linux'), \
                patch.object(bootstrap, 'command', return_value='v24.0.0'):
            with self.assertRaisesRegex(bootstrap.Stop, '^NODE_VERSION_DIFFERS$'):
                bootstrap.node_environment(self.work)
        with patch.object(bootstrap.platform, 'machine', return_value='x86_64'), \
                patch.object(bootstrap.platform, 'system', return_value='Linux'), \
                patch.object(bootstrap, 'command', side_effect=['v22.23.5', '11.0.0']):
            with self.assertRaisesRegex(bootstrap.Stop, '^NPM_VERSION_DIFFERS$'):
                bootstrap.node_environment(self.work)


if __name__ == '__main__':
    unittest.main(verbosity=2)
