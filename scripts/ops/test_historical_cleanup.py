import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import Mock, patch

import cleanup_historical_checkouts as cleanup


class CleanupTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.home = Path(self.temp.name)
        self.root = self.home / 'jems-releases' / 'historical'
        self.root.mkdir(parents=True)
        self.repo('init', '--quiet')
        self.repo('config', 'user.name', 'Fixture')
        self.repo('config', 'user.email', 'fixture@example.invalid')
        for name, value in {'source.py': 'source', 'changed.py': 'original', 'staged.py': 'original',
                            'receipt.json': 'receipt', 'journal.txt': 'journal', 'main.tf': 'terraform',
                            '.env': 'private', 'credential.key': 'private'}.items():
            (self.root / name).write_text(value)
        self.repo('add', '.')
        self.repo('commit', '-qm', 'Fixture')
        self.repo('remote', 'add', 'origin', cleanup.REMOTE)
        (self.root / 'changed.py').write_text('unique local edit')
        (self.root / 'staged.py').write_text('unique staged edit')
        self.repo('add', 'staged.py')
        (self.root / 'unique.json').write_text('private receipt')
        (self.root / 'node_modules').mkdir()
        (self.root / 'node_modules' / 'unique').write_text('unknown content')
        self.folder = self.home / 'receipts'
        self.folder.mkdir(mode=0o700)

    def tearDown(self): self.temp.cleanup()

    def repo(self, *args):
        return subprocess.run(['git', '-C', str(self.root), *args], capture_output=True, check=True).stdout

    def plan(self):
        repo = cleanup.repo_plan(self.root, self.home, proof=lambda sha: None)
        return {'schema': 1, 'operation': 'DELETE_RECOVERABLE_TRACKED_FILES_ONLY', 'home': str(self.home),
                'repositories': [repo], 'blocked': []}

    def test_only_remotely_recoverable_unchanged_source_selected(self):
        proof = Mock()
        result = cleanup.repo_plan(self.root, self.home, proof=proof)
        proof.assert_called_once_with(self.repo('rev-parse', 'HEAD').decode().strip())
        self.assertEqual([f['path'] for f in result['files']], ['source.py'])
        self.assertTrue((self.root / 'source.py').exists())

    def test_explicit_approval_and_remote_proof_required(self):
        plan = self.plan()
        with self.assertRaisesRegex(cleanup.CleanupError, 'APPROVAL'):
            cleanup.apply(plan, 'wrong', self.folder, proof=Mock())
        with self.assertRaisesRegex(cleanup.CleanupError, 'UNRECOVERABLE'):
            cleanup.apply(plan, cleanup.digest(plan), self.folder,
                          proof=Mock(side_effect=cleanup.CleanupError('UNRECOVERABLE')))
        self.assertTrue((self.root / 'source.py').exists())
        self.assertEqual(list(self.folder.iterdir()), [])

    def test_changed_files_and_staged_updates_block_before_deletion(self):
        for stage in (False, True):
            with self.subTest(stage=stage):
                plan = self.plan()
                (self.root / 'source.py').write_text('new local content')
                if stage: self.repo('add', 'source.py')
                with self.assertRaisesRegex(cleanup.CleanupError, 'FILE_OR_INDEX_CHANGED'):
                    cleanup.apply(plan, cleanup.digest(plan), self.folder, proof=lambda sha: None)
                self.assertEqual((self.root / 'source.py').read_text(), 'new local content')
                self.repo('restore', '--staged', '--worktree', 'source.py')

    def test_apply_preserves_unique_git_state_and_restores_without_overwrite(self):
        plan = self.plan()
        index = (self.root / '.git/index').read_bytes()
        ledger = cleanup.apply(plan, cleanup.digest(plan), self.folder, proof=lambda sha: None)
        self.assertFalse((self.root / 'source.py').exists())
        self.assertEqual((self.root / '.git/index').read_bytes(), index)
        for name in ('changed.py', 'staged.py', 'unique.json', 'receipt.json', 'journal.txt', 'main.tf', '.env', 'credential.key', 'node_modules/unique'):
            self.assertTrue((self.root / name).exists())
        self.assertIn('COMPLETE', ledger.read_text())
        self.assertEqual(cleanup.restore(plan), 1)
        self.assertEqual((self.root / 'source.py').read_text(), 'source')
        (self.root / 'source.py').write_text('new edit')
        self.assertEqual(cleanup.restore(plan), 0)
        self.assertEqual((self.root / 'source.py').read_text(), 'new edit')

    def test_path_symlink_linked_checkout_and_other_roots_blocked(self):
        (self.home / 'alias').symlink_to(self.root, target_is_directory=True)
        with self.assertRaisesRegex(cleanup.CleanupError, 'SYMLINK'):
            cleanup.allowed_root(self.home / 'alias', self.home)
        (self.root / '.git/index.lock').write_text('busy')
        with self.assertRaisesRegex(cleanup.CleanupError, 'IN_PROGRESS'):
            self.plan()

    def test_hardlinks_and_symlink_files_never_selected(self):
        (self.root / 'source.py').unlink()
        os.link(self.root / 'changed.py', self.root / 'source.py')
        self.assertEqual(self.plan()['repositories'][0]['files'], [])

    def test_path_replacement_is_captured_and_preserved_before_unlink(self):
        plan = self.plan()
        original = Path.rename
        def race(path, target):
            if path == self.root / 'source.py': path.write_text('unique concurrent content')
            return original(path, target)
        with patch.object(Path, 'rename', race):
            with self.assertRaisesRegex(cleanup.CleanupError, 'PRESERVED_IN_QUARANTINE'):
                cleanup.apply(plan, cleanup.digest(plan), self.folder, proof=lambda sha: None)
        self.assertEqual(cleanup.restore(plan), 1)
        self.assertEqual((self.root / 'source.py').read_text(), 'unique concurrent content')

    def test_no_automatic_replay_after_started_deletion(self):
        plan = self.plan()
        cleanup.apply(plan, cleanup.digest(plan), self.folder, proof=lambda sha: None)
        cleanup.restore(plan)
        with self.assertRaises((cleanup.CleanupError, FileExistsError)):
            cleanup.apply(plan, cleanup.digest(plan), self.folder, proof=lambda sha: None)


if __name__ == '__main__': unittest.main()
