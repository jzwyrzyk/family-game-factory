import copy
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import cleanup_historical_checkouts as old
import recover_checkout_space as space


class CapacityTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.home = Path(self.temp.name)
        self.a = self.home / 'jems-gateway-repair-tool.aB123456'
        self.a.mkdir()
        for args in [('init', '-q'), ('config', 'user.name', 'Fixture'), ('config', 'user.email', 'fixture@example.invalid')]: self.git(self.a, *args)
        (self.a / 'source.py').write_text('unique local committed source\n' * 500)
        self.git(self.a, 'add', '.'); self.git(self.a, 'commit', '-qm', 'Unpublished local fixture')
        self.git(self.a, 'remote', 'add', 'origin', old.REMOTE)
        self.git(self.a, 'gc', '--prune=never')  # Fixture creation only, never a utility operation.
        self.b = self.home / 'jems-service-release-20261126'
        shutil.copytree(self.a, self.b)
        (self.b / 'source.py').write_text('unique dirty local changes')
        for root in (self.a, self.b):
            (root / 'recovery-receipt.json').write_text('unique receipt')
            (root / 'credentials.key').write_text('private credential')
            (root / 'node_modules/package').mkdir(parents=True)
            (root / 'node_modules/package/index.js').write_text('modified dependency bytes')
            (root / 'node_modules/package/secret.json').write_text('private secret')
            (root / 'reviewed.tfplan').write_bytes(b'private terraform plan')
        self.folder = self.home / 'capacity-receipts'; self.folder.mkdir(mode=0o700)

    def tearDown(self): self.temp.cleanup()

    def git(self, root, *args):
        return subprocess.run(['git', '-C', str(root), *args], capture_output=True, check=True).stdout

    def inspect(self): return space.inspect(self.home, self.folder)

    def test_suffixed_roots_and_exact_duplicates_are_found_without_mutation(self):
        plan, result = self.inspect()
        self.assertEqual(len(result['repositories']), 2)
        self.assertEqual(result['blocked'], [])
        self.assertGreater(result['dedup_recoverable_bytes'], 0)
        self.assertFalse(result['dedup_target_met'])
        self.assertTrue((self.b / 'source.py').exists())
        self.assertTrue(all(f['category'] == 'git_objects' for group in plan['groups'] for f in group))
        for name in ('jems-service-releaseX', 'jems-unknown', 'jems-service-release/../other', 'jems-service-release..'):
            self.assertFalse(old.allowed_name(name))
        with self.assertRaises(old.CleanupError): old.private_dir(self.a / 'new-receipts', self.home)

    def test_dedup_preserves_every_object_dirty_file_and_git_record(self):
        plan, _ = self.inspect()
        before = {r: self.git(r, 'cat-file', '--batch-all-objects', '--batch-check=%(objectname)') for r in (self.a, self.b)}
        records = {r: space.metadata(r) for r in (self.a, self.b)}
        result = space.dedup(plan, old.digest(plan), self.folder, True)
        self.assertEqual(result['status'], 'APPROVED_PACK_DEDUP_COMPLETE')
        for root in (self.a, self.b):
            self.assertEqual(before[root], self.git(root, 'cat-file', '--batch-all-objects', '--batch-check=%(objectname)'))
            self.assertEqual(records[root], space.metadata(root))
            self.git(root, 'fsck', '--full')
            for name in ('recovery-receipt.json', 'credentials.key', 'reviewed.tfplan', 'node_modules/package/secret.json'):
                self.assertTrue((root / name).exists())
        self.assertEqual((self.b / 'source.py').read_text(), 'unique dirty local changes')
        for group in plan['groups']:
            self.assertEqual(len({Path(f['path']).stat().st_ino for f in group}), 1)
        with self.assertRaises((old.CleanupError, FileExistsError)):
            space.dedup(plan, old.digest(plan), self.folder, True)

    def test_wrong_approval_changes_and_nonidentical_groups_block_before_mutation(self):
        plan, _ = self.inspect()
        with self.assertRaises(old.CleanupError): space.dedup(plan, 'wrong', self.folder, True)
        with self.assertRaises(old.CleanupError): space.dedup(plan, old.digest(plan), self.folder, False)
        forged = copy.deepcopy(plan); forged['groups'][0][1]['sha256'] = '0' * 64
        with self.assertRaisesRegex(old.CleanupError, 'NONIDENTICAL'):
            space.dedup(forged, old.digest(forged), self.folder, True)
        self.git(self.b, 'config', 'fixture.changed', 'true')
        with self.assertRaisesRegex(old.CleanupError, 'METADATA_CHANGED'):
            space.dedup(plan, old.digest(plan), self.folder, True)

    def test_archive_destination_and_protected_paths_are_not_inferred_safe(self):
        plan, report = self.inspect()
        with self.assertRaises(old.CleanupError): space.archive_plan(report, self.home, self.folder / 'same-disk')
        selected = [f for r in report['repositories'] for f in r['files']]
        self.assertFalse(any('secret.json' in f['path'] or 'tfplan' in f['path'] for f in selected))
        bad = copy.deepcopy(plan); bad['groups'][0][0]['path'] = str(self.a / 'credentials.key')
        with self.assertRaises(old.CleanupError): space.validate_plan(bad)

    def archive_fixture(self):
        _, result = self.inspect(); dest = self.home / 'simulated-external'; dest.mkdir(mode=0o700)
        plan = {'schema': 2, 'operation': 'PRIVATE_OFF_DISK_ARCHIVE', 'home': str(self.home),
                'destination': str(dest), 'destination_device': dest.stat().st_dev,
                'repositories': [{k:r[k] for k in ('root','metadata_sha256','head')} for r in result['repositories']],
                'files': [f for r in result['repositories'] for f in r['files']]}
        return plan

    def test_archive_then_separate_deletion_and_no_overwrite_restoration(self):
        plan = self.archive_fixture()
        # Simulate the policy boundary only: production refuses a same-device destination.
        real_stat = Path.stat
        def stat(path, *args, **kwargs):
            observed = real_stat(path, *args, **kwargs)
            if path == self.home:
                values = list(observed); values[2] = -1; return os.stat_result(values)
            return observed
        with patch.object(Path, 'stat', stat):
            with self.assertRaises(old.CleanupError): space.create_archive(plan, 'wrong', self.folder, True)
            result = space.create_archive(plan, old.digest(plan), self.folder, True)
        receipt = json.loads((self.folder / ('archive-receipt-' + old.digest(plan) + '.json')).read_bytes())
        self.assertTrue(all(Path(f['path']).exists() for f in plan['files']))
        with self.assertRaises(old.CleanupError): space.delete_archived(plan, receipt, old.digest(plan), self.folder, True)
        with patch.object(Path, 'stat', stat):
            space.delete_archived(plan, receipt, result['deletion_approval_sha256'], self.folder, True)
        self.assertFalse(any(Path(f['path']).exists() for f in plan['files']))
        dep = self.a / 'node_modules/package/index.js'; dep.write_text('new local change')
        with patch.object(Path, 'stat', stat):
            restored = space.restore(plan, receipt, self.folder)
        self.assertGreater(restored['files'], 0)
        self.assertEqual(dep.read_text(), 'new local change')
        for root in (self.a, self.b): self.git(root, 'fsck', '--full')
        self.assertTrue(Path(receipt['archive']).exists())

    def test_corrupt_archive_blocks_deletion_and_forged_protected_paths(self):
        plan = self.archive_fixture()
        target = Path(plan['destination']) / 'corrupt.tar'; target.write_bytes(b'not an archive')
        receipt = {'plan_sha256': old.digest(plan), 'archive': str(target), 'archive_sha256': '0' * 64}
        with self.assertRaises(Exception):
            space.delete_archived(plan, receipt, old.digest({'plan': plan, 'archive': receipt}), self.folder, True)
        self.assertTrue(all(Path(f['path']).exists() for f in plan['files']))
        forged = copy.deepcopy(plan); forged['files'][0]['path'] = str(self.a / '.git/config')
        with self.assertRaisesRegex(old.CleanupError, 'NONOBJECT'):
            space.validate_plan(forged)
        self.assertEqual(list(self.folder.glob('archive-deletion-*.jsonl')), [])

    def test_dedup_race_preserves_captured_content_and_recovers_without_overwrite(self):
        plan, _ = self.inspect(); target = Path(plan['groups'][0][1]['path'])
        rename = Path.rename
        def race(path, dest):
            if path == target:
                path.chmod(0o600); path.write_bytes(b'unique concurrent mutation')
            return rename(path, dest)
        with patch.object(Path, 'rename', race), self.assertRaises(old.CleanupError):
            space.dedup(plan, old.digest(plan), self.folder, True)
        self.assertEqual(space.recover_captures(plan, self.folder, 'dedup-' + old.digest(plan) + '.jsonl'), 1)
        self.assertEqual(target.read_bytes(), b'unique concurrent mutation')

    def test_links_locks_and_unknown_roots_are_preserved(self):
        (self.a / '.git/index.lock').write_text('busy')
        _, report = self.inspect()
        self.assertTrue(any(r['code'] == 'GIT_OPERATION_IN_PROGRESS' for r in report['blocked']))
        (self.home / 'jems-service-release.alias').symlink_to(self.b, target_is_directory=True)
        _, report = self.inspect()
        self.assertTrue(any(r['code'] == 'SYMLINK_PATH_FORBIDDEN' for r in report['blocked']))


if __name__ == '__main__': unittest.main()
