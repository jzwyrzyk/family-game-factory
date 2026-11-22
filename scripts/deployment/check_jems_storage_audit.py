#!/usr/bin/env python3
"""Offline fixture checks for the advisory, read-only Jems storage inventory.

All repositories/files are disposable fixture data; no cloud calls or network
are required. The helper under review is never edited by this test program.
"""
import contextlib
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

HELPER = Path(os.environ.get('JEMS_AUDIT_HELPER', str(Path(__file__).with_name('inspect_jems_storage.py'))))
spec = importlib.util.spec_from_file_location('jems_storage_inventory_under_test', HELPER)
audit_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit_module)


def no_processes():
    return {'coverage': 'offline_fixture', 'notProofOfInactivity': True,
            'counts': {}, 'openDeletedUniqueAllocatedBytes': 0,
            'openDeletedUniqueFiles': 0, 'processes': []}


class AuditFixtures(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='audit-fixture-')
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.home = self.base / 'home'
        self.home.mkdir()
        self.env = patch.dict(os.environ, {
            'HOME': str(self.home), 'GIT_CONFIG_GLOBAL': '/dev/null',
            'GIT_CONFIG_SYSTEM': '/dev/null', 'GIT_CONFIG_NOSYSTEM': '1',
            'GIT_TERMINAL_PROMPT': '0', 'GIT_AUTHOR_NAME': 'Offline Fixture',
            'GIT_AUTHOR_EMAIL': 'offline@example.invalid',
            'GIT_COMMITTER_NAME': 'Offline Fixture',
            'GIT_COMMITTER_EMAIL': 'offline@example.invalid',
        })
        self.env.start()
        self.addCleanup(self.env.stop)

    def write(self, relative, data='ordinary fixture\n', root=None):
        path = (root or self.home) / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(data)
        return path

    def git(self, root, *args):
        result = subprocess.run(['git', '-C', str(root), *args], check=True,
                                capture_output=True, text=True)
        return result.stdout.strip()

    def repo(self, name='project', commit=True):
        root = self.home / name
        root.mkdir(parents=True, exist_ok=True)
        self.git(root, 'init', '--quiet')
        if commit:
            self.write('source.txt', root=root)
            self.git(root, 'add', 'source.txt')
            self.git(root, 'commit', '--quiet', '-m', 'offline baseline')
        return root

    def inventory(self, roots=(), scan_home=True):
        inventory = audit_module.Inventory(self.home, None)
        if scan_home:
            inventory.scan(self.home)
        for root in roots:
            inventory.add(root, root.lstat(), root.parent, (root.name,))
            inventory.scan(root, (root.name,))
        return inventory

    def finish(self, inventory):
        with patch.object(inventory, 'processes', return_value=no_processes()), contextlib.redirect_stderr(io.StringIO()):
            return inventory.finish()

    def metadata(self, root):
        result = {}
        for directory, names, files in os.walk(root, followlinks=False):
            for name in names + files:
                path = Path(directory) / name
                info = path.lstat()
                digest = hashlib.sha256(path.read_bytes()).hexdigest() if stat.S_ISREG(info.st_mode) else None
                result[str(path.relative_to(root))] = (info.st_mode, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns, digest)
        return result

    def test_all_home_hidden_and_opaque_sizes_without_names_or_bodies(self):
        secret = 'JEMS_CANARY_SECRET_BODY_NEVER_OUTPUT'
        opaque_names = ['account-owner-private-7.json', 'unique-conversation-title-8.md']
        self.write('.config/' + opaque_names[0], secret * 1024)
        self.write('.gemini/' + opaque_names[1], secret * 512)
        self.write('.hidden-unclassified/payload.bin', 'x' * 4097)
        self.write('normal/credentials-unique.json', secret)
        self.write('normal/.env.production', secret)
        self.write('normal/source.txt', secret)
        report = self.finish(self.inventory())
        serialized = json.dumps(report)
        self.assertNotIn(secret, serialized)
        for name in opaque_names + ['credentials-unique.json', '.env.production']:
            self.assertNotIn(name, serialized)
        groups = {row['path']: row for row in report['directories']}
        for key in ('HOME/.config', 'HOME/.gemini'):
            self.assertGreater(groups[key]['allocatedBytes'], 0)
            self.assertEqual(groups[key]['decision'], 'KEEP')
        self.assertIn('HOME/.hidden-unclassified', groups)
        self.assertGreaterEqual(report['totalEntriesScanned'], 10)

    def test_hardlinks_sparse_files_and_symlinks_account_without_following(self):
        original = self.write('data/original', 'x' * 8192)
        os.link(original, self.home / 'data/alias')
        with (self.home / 'data/sparse').open('wb') as stream:
            stream.seek(8 * 1024 * 1024)
            stream.write(b'x')
        external = self.base / 'external'
        external.mkdir()
        self.write('never-scanned', root=external)
        (self.home / 'external-link').symlink_to(external, target_is_directory=True)
        (self.home / 'loop').symlink_to(self.home, target_is_directory=True)
        report = self.finish(self.inventory())
        entries = {row['path']: row for row in report['entries']}
        self.assertFalse(any('never-scanned' in key for key in entries))
        self.assertEqual(entries['HOME/external-link']['kind'], 'symlink')
        pair = [entries['HOME/data/original'], entries['HOME/data/alias']]
        self.assertEqual(sum(row['uniqueAllocatedBytesAttributed'] for row in pair), pair[0]['allocatedBytes'])
        self.assertGreater(entries['HOME/data/sparse']['apparentBytes'], entries['HOME/data/sparse']['allocatedBytes'])
        self.assertEqual(report['physicalBytesUniqueAcrossScannedRoots'], sum(row['uniqueAllocatedBytesAttributed'] for row in entries.values()))

    def test_cross_mount_directory_recorded_but_not_traversed(self):
        mount = self.home / 'mounted'
        self.write('mounted/cross-device-secret', 'fixture')
        real_scandir = os.scandir

        class Entry:
            def __init__(self, entry):
                self.entry, self.path, self.name = entry, entry.path, entry.name
            def stat(self, **kwargs):
                info = self.entry.stat(**kwargs)
                if Path(self.path) != mount:
                    return info
                class Info:
                    st_dev = info.st_dev + 100
                    def __getattr__(self, key):
                        return getattr(info, key)
                return Info()

        class Scan:
            def __init__(self, path):
                self.iterator = real_scandir(path)
            def __enter__(self):
                return iter([Entry(entry) for entry in self.iterator])
            def __exit__(self, *args):
                self.iterator.close()

        with patch.object(audit_module.os, 'scandir', side_effect=Scan):
            inventory = self.inventory()
        report = self.finish(inventory)
        self.assertIn('HOME/mounted', report['mountedDirectoriesNotTraversed'])
        self.assertFalse(any('cross-device-secret' in row['path'] for row in report['entries']))

    def test_source_git_index_and_files_metadata_unchanged(self):
        root = self.repo()
        self.write('source.txt', 'edited tracked content\n', root=root)
        self.write('untracked.txt', root=root)
        self.write('state/release.json', '{"source":"' + 'a' * 40 + '"}', root=root)
        before = self.metadata(self.home)
        self.finish(self.inventory())
        after = self.metadata(self.home)
        self.assertEqual(before, after)

    def test_dirty_unborn_nested_and_stashed_work_is_preserved(self):
        dirty = self.repo('dirty')
        self.write('source.txt', 'modified\n', root=dirty)
        self.write('new.txt', root=dirty)
        unborn = self.repo('unborn', commit=False)
        self.write('unique.txt', root=unborn)
        nested = self.repo('parent/nested')
        stash = self.repo('stashed')
        self.write('source.txt', 'stash content\n', root=stash)
        self.git(stash, 'stash', 'push', '--quiet', '-m', 'secret stash title must not appear')
        report = self.finish(self.inventory())
        repos = {row['path']: row for row in report['repositories']}
        for path in ('HOME/dirty', 'HOME/unborn', 'HOME/stashed'):
            self.assertEqual(repos[path]['decision'], 'KEEP', path)
            self.assertFalse(repos[path]['publicationVerified'])
        self.assertIn('HOME/parent/nested', repos)
        self.assertEqual(repos['HOME/stashed']['stashEntries'], 1)
        self.assertIsNone(repos['HOME/unborn']['head'])
        self.assertNotIn('secret stash title', json.dumps(report))

    def test_linked_worktree_and_shared_object_dependencies_are_identified(self):
        primary = self.repo('primary')
        linked = self.home / 'linked'
        self.git(primary, 'worktree', 'add', '--quiet', '-b', 'fixture-linked', str(linked))
        shared = self.home / 'shared-clone'
        self.git(self.home, 'clone', '--quiet', '--shared', str(primary), str(shared))
        report = self.finish(self.inventory())
        repos = {row['path']: row for row in report['repositories']}
        self.assertTrue(repos['HOME/linked']['gitMetadataIsFile'])
        self.assertEqual(repos['HOME/primary']['gitCommonDirectory'], repos['HOME/linked']['gitCommonDirectory'])
        self.assertGreaterEqual(len(repos['HOME/primary']['worktrees']), 2)
        self.assertTrue(repos['HOME/shared-clone']['objectAlternates'])
        for path in ('HOME/primary', 'HOME/linked', 'HOME/shared-clone'):
            self.assertIn('shared_git_objects_or_worktree_dependencies', repos[path]['reasons'])
            self.assertNotIn('SAFE', repos[path]['decision'])

    def test_ignored_unique_files_never_become_disposal_approval(self):
        root = self.repo()
        self.write('.gitignore', 'notes.private\nnode_modules/\nbuild/\n', root=root)
        self.git(root, 'add', '.gitignore')
        self.git(root, 'commit', '--quiet', '-m', 'ignored fixture')
        self.write('notes.private', 'unique ignored work', root=root)
        self.write('node_modules/handwritten-private-work.txt', 'unique ignored work', root=root)
        self.write('build/draft.txt', 'unique ignored work', root=root)
        report = self.finish(self.inventory())
        repo = report['repositories'][0]
        self.assertGreater(repo['ignoredFileCategories'].get('unclassified_data', 0), 0)
        self.assertTrue(repo['ignoredEnumerationComplete'])
        self.assertFalse(repo['publicationVerified'])
        self.assertNotIn('SAFE', json.dumps(report).upper())
        self.assertEqual((root / 'notes.private').read_text(), 'unique ignored work')

    def test_journal_export_is_strictly_allowlisted_and_phase_validated(self):
        secret = 'JEMS_UNKNOWN_JOURNAL_FIELD_SECRET'
        value = {'source': 'a' * 40, 'tested': 'b' * 40, 'tool': 'c' * 40,
                 'primitives': 'd' * 40, 'unknownSecret': secret,
                 'build': {'phase': 'verified', 'headers': secret},
                 'rollbackRequested': True,
                 'services': {'coach': {'stage': {'phase': 'verified', 'token': secret},
                                        'promotion': {'phase': secret}},
                              secret: {'stage': {'phase': 'verified'}}}}
        self.write('release/state/release.json', json.dumps(value))
        report = self.finish(self.inventory())
        self.assertEqual(len(report['releaseJournals']), 1)
        journal = report['releaseJournals'][0]
        self.assertEqual(journal['source'], 'a' * 40)
        self.assertEqual(journal['buildPhase'], 'verified')
        self.assertEqual(journal['servicePhases']['coach']['promotion'], 'unknown')
        self.assertTrue(journal['rollbackRequested'])
        self.assertNotIn(secret, json.dumps(report))
        self.assertEqual(journal['decision'], 'KEEP')

    def test_recovery_journal_under_generated_name_still_kept(self):
        self.write('build/state/release.json', '{"source":"' + 'e' * 40 + '"}')
        report = self.finish(self.inventory())
        self.assertEqual(len(report['releaseJournals']), 1)
        groups = {row['path']: row for row in report['directories']}
        self.assertEqual(groups['HOME/build']['decision'], 'KEEP')

    def test_current_coach_home_and_temporary_workspace_protected(self):
        current = 'coach-diagnostics-b4734b1323de87dfee96bb91769cbab3cff432e6'
        self.write('jems-releases/' + current + '/operator/source.py')
        temporary = self.base / 'jems-coach-lowspace-1000-b4734b1323de-9986ab4be386'
        temporary.mkdir()
        self.write('node_modules/fixture.js', root=temporary)
        report = self.finish(self.inventory((temporary,)))
        current_groups = [row for row in report['directories'] if 'coach-diagnostics-' in row['path'] or 'jems-coach-lowspace-' in row['path']]
        self.assertTrue(current_groups)
        for row in current_groups:
            self.assertEqual(row['decision'], 'KEEP', row['path'])

    def test_git_configured_clean_filter_is_never_executed(self):
        root = self.repo()
        marker = self.base / 'filter-executed'
        program = self.base / 'filter.py'
        program.write_text('from pathlib import Path\nimport sys\nPath(' + repr(str(marker)) + ').write_text("executed")\nsys.stdout.write(sys.stdin.read())\n')
        self.git(root, 'config', 'filter.fixture.clean', sys.executable + ' ' + str(program))
        self.git(root, 'config', 'filter.fixture.required', 'true')
        self.write('.gitattributes', 'source.txt filter=fixture\n', root=root)
        self.git(root, 'add', '.gitattributes', 'source.txt')
        self.git(root, 'commit', '--quiet', '-m', 'filter fixture')
        marker.unlink(missing_ok=True)
        tracked = self.write('source.txt', 'changed! fixture\n', root=root)
        info = tracked.stat()
        os.utime(tracked, ns=(info.st_atime_ns, info.st_mtime_ns + 3_000_000_000))
        self.git(root, 'status', '--porcelain=v1')
        self.assertTrue(marker.exists(), 'Negative control failed: ordinary status did not invoke the fixture filter')
        marker.unlink()
        self.finish(self.inventory())
        self.assertFalse(marker.exists(), 'Audit executed a Git external clean filter')

    def test_git_context_overrides_cannot_redirect_repo_inspection(self):
        wanted = self.repo('wanted')
        hostile = self.repo('hostile')
        self.write('other.txt', root=hostile)
        self.git(hostile, 'add', '.')
        self.git(hostile, 'commit', '--quiet', '-m', 'different fixture head')
        expected = self.git(wanted, 'rev-parse', 'HEAD')
        inventory = self.inventory()
        with patch.dict(os.environ, {'GIT_DIR': str(hostile / '.git'),
                                     'GIT_WORK_TREE': str(hostile),
                                     'GIT_INDEX_FILE': str(hostile / '.git/index'),
                                     'GIT_COMMON_DIR': str(hostile / '.git'),
                                     'GIT_OBJECT_DIRECTORY': str(hostile / '.git/objects')}):
            row = inventory.repository(wanted)
        self.assertEqual(row['head'], expected)

    def test_inherited_git_trace_does_not_write_a_file(self):
        self.repo()
        trace = self.base / 'git-trace-output'
        with patch.dict(os.environ, {'GIT_TRACE': str(trace), 'GIT_TRACE_SETUP': str(trace)}):
            self.finish(self.inventory())
        self.assertFalse(trace.exists(), 'Inherited Git tracing wrote an unexpected file')

    def test_active_path_beyond_display_limit_still_protected(self):
        paths = []
        for index in range(15):
            paths.append(self.write('active-%02d/held.bin' % index))
        code = 'import sys; handles = [open(path) for path in sys.argv[1:]]; print("READY", flush=True); sys.stdin.read()'
        child = subprocess.Popen([sys.executable, '-c', code, *map(str, paths)],
                                 cwd=self.base, stdin=subprocess.PIPE,
                                 stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        def finish_child():
            if child.poll() is None:
                child.communicate('', timeout=5)
        self.addCleanup(finish_child)
        self.assertEqual(child.stdout.readline().strip(), 'READY')
        inventory = self.inventory()
        with contextlib.redirect_stderr(io.StringIO()):
            report = inventory.finish()
        rows = {row['path']: row for row in report['directories']}
        last = rows['HOME/active-14']
        self.assertTrue(last['activeReferenceObserved'])
        self.assertEqual(last['decision'], 'KEEP')
        process = next(row for row in report['processReferences']['processes'] if row['pid'] == child.pid)
        self.assertTrue(process.get('groupsTruncated', process.get('pathsTruncated', False)))

    def test_external_git_symlink_is_reported_without_inspection(self):
        external = self.base / 'external-repo'
        external.mkdir()
        self.git(external, 'init', '--quiet')
        self.write('outside.txt', root=external)
        self.git(external, 'add', '.')
        self.git(external, 'commit', '--quiet', '-m', 'outside scope')
        linked = self.home / 'git-symlink'
        linked.mkdir()
        (linked / '.git').symlink_to(external / '.git', target_is_directory=True)
        inventory = self.inventory()
        actual_run = audit_module.subprocess.run
        calls = []
        def observe(*args, **kwargs):
            calls.append(args[0])
            return actual_run(*args, **kwargs)
        with patch.object(audit_module.subprocess, 'run', side_effect=observe):
            report = self.finish(inventory)
        self.assertEqual(calls, [], 'Git inspected metadata behind an external .git symlink')
        self.assertEqual(len(report['repositories']), 1)
        self.assertIn('KEEP', report['repositories'][0]['decision'])

    def test_main_terminal_truncation_is_explicit_and_full_report_retains_entries(self):
        for index in range(85):
            self.write('workspace-%03d/file.bin' % index, 'x' * 100)
        output = self.base / 'output'
        output.mkdir(mode=0o700)
        inventory = self.inventory()
        report = self.finish(inventory)
        actual_iterdir = Path.iterdir
        def limited_tmp(path):
            return iter([]) if path == Path('/tmp') else actual_iterdir(path)
        stdout = io.StringIO()
        with patch.object(Path, 'home', return_value=self.home), patch.object(Path, 'iterdir', limited_tmp), \
             patch.object(audit_module.Inventory, 'processes', return_value=no_processes()), \
             patch.object(sys, 'argv', [str(HELPER), '--output-dir', str(output)]), \
             contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(io.StringIO()):
            audit_module.main()
        text = stdout.getvalue()
        summary = json.loads(text.split('JEMS_STORAGE_REVIEW_BEGIN\n', 1)[1].split('\nJEMS_STORAGE_REVIEW_END', 1)[0])
        self.assertGreater(summary['terminalTruncation']['topLevelDirectories'], 0)
        self.assertEqual(summary['totalEntriesScanned'], report['totalEntriesScanned'])
        saved = Path(summary['fullMetadataReport'])
        self.assertEqual(saved.stat().st_mode & 0o777, 0o600)
        full = json.loads(saved.read_text())
        self.assertGreaterEqual(len(full['entries']), 170)
        self.assertGreaterEqual(len(full['directories']), 85)
        self.assertEqual(summary['filesDeleted'], 0)
        self.assertEqual(summary['networkCalls'], 0)


if __name__ == '__main__':
    unittest.main(verbosity=2)
