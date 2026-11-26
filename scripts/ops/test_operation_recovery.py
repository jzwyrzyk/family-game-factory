import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import operation_journal as journal

ROOT = Path(__file__).resolve().parents[2]


class RecoveryTests(unittest.TestCase):
    def test_receipt_allowlist_private_files_and_no_credentials(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'receipt.jsonl'
            path.touch(mode=0o600)
            with patch.dict(os.environ, {'JEMS_OPERATION_JOURNAL': str(path)}):
                journal.record('BUILD_SUBMISSION_INTENT', source_sha='a' * 40, archive_sha256='b' * 64)
                with self.assertRaises(RuntimeError): journal.record('BUILD_SUBMITTED', token='private-marker')
                self.assertNotIn('private-marker', path.read_text())
                path.chmod(0o644)
                with self.assertRaises(RuntimeError): journal.record('BUILD_SUBMITTED', source_sha='a' * 40)

    def test_absent_receipt_does_not_create_files(self):
        with patch.dict(os.environ, {}, clear=True): journal.record('BUILD_SUBMITTED', source_sha='a' * 40)

    def run_handoff(self, temp, mode):
        base = Path(temp)
        bin_dir, tmp_dir = base / 'bin', base / 'tmp'
        bin_dir.mkdir(); tmp_dir.mkdir()
        git = bin_dir / 'git'
        git.write_text('''#!/usr/bin/env python3
import sys
from pathlib import Path
root=Path(sys.argv[2]); args=sys.argv[3:]
if args[0]=='checkout':
    target=root/'scripts/ops';target.mkdir(parents=True,exist_ok=True)
    (target/'github_operations.py').write_text("import os,sys\\nfrom pathlib import Path\\nprint('private-output-marker')\\nif os.environ['FIXTURE_MODE']=='dirty': Path(__file__).resolve().parents[2].joinpath('unique-journal').write_text('unique')\\nsys.exit(9 if os.environ['FIXTURE_MODE']=='failure' else 0)\\n")
elif args[0]=='rev-parse': print('a'*40)
elif args[0]=='status' and (root/'unique-journal').exists(): print('?? unique-journal')
''')
        git.chmod(0o755)
        env = {**os.environ, 'PATH': str(bin_dir) + os.pathsep + os.environ['PATH'], 'TMPDIR': str(tmp_dir),
               'JEMS_OPERATIONS_RECEIPT_DIR': str(base / 'receipts'), 'FIXTURE_MODE': mode}
        result = subprocess.run(['bash', str(ROOT / 'scripts/ops/handoffs/operations-bootstrap.sh'),
                                 'a' * 40, 'github', '--check'], env=env, cwd=base, capture_output=True)
        records = next((base / 'receipts').glob('operation-*.jsonl')).read_text()
        return result, records, tmp_dir

    def test_temporary_checkout_removed_on_success_and_failure_with_receipts(self):
        for mode in ('success', 'failure'):
            with self.subTest(mode=mode), tempfile.TemporaryDirectory() as temp:
                result, records, tmp = self.run_handoff(temp, mode)
                self.assertEqual(result.returncode, 0 if mode == 'success' else 9)
                self.assertEqual(list(tmp.iterdir()), [])
                entries = [json.loads(line) for line in records.splitlines()]
                self.assertEqual(entries[0]['event'], 'STARTED')
                self.assertEqual(entries[-1]['temporary_checkout'], 'REMOVED')
                self.assertNotIn('private-output-marker', records)

    def test_unexpected_local_output_retained_and_location_recorded(self):
        with tempfile.TemporaryDirectory() as temp:
            result, records, tmp = self.run_handoff(temp, 'dirty')
            self.assertEqual(result.returncode, 0)
            final = json.loads(records.splitlines()[-1])
            self.assertEqual(final['temporary_checkout'], 'RETAINED_LOCAL_CHANGES')
            self.assertEqual((Path(final['retained_path']) / 'unique-journal').read_text(), 'unique')


if __name__ == '__main__': unittest.main()
