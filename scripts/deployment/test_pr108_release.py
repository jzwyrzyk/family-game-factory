"""Exercise the real release shell with isolated, offline command doubles."""
import json
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).with_name('pr108_release.sh').resolve()
SOURCE = 'c43a18148421ea22edfba5f7e891530678ad4f4f'
REPO = 'jzwyrzyk/family-game-factory'
PAGES_BLOB = '829f5995de534cd308608d9347f1b7c26c32993d'
REGRESSIONS_BLOB = '6860d1c3fc4d454ec30b6cde7079bd4853536040'

COMMAND_DOUBLE = r'''
import json
import os
from pathlib import Path
import sys

name, args = Path(sys.argv[0]).name, sys.argv[1:]
behavior = json.loads(Path(os.environ['JEMS_TEST_BEHAVIOR']).read_text())
marker = Path(os.environ['JEMS_TEST_STATE']) / 'pages-dispatch.attempted.json'
event = {'command': name, 'args': args, 'attemptExists': marker.exists()}
if marker.exists():
    event['attempt'] = json.loads(marker.read_text())
with Path(os.environ['JEMS_TEST_LOG']).open('a') as stream:
    stream.write(json.dumps(event) + '\n')

if name == 'python3':
    script = Path(args[0]).name if args else ''
    if script == 'pr108_stage.py':
        raise SystemExit(behavior.get('stage_exit', 0))
    if script != 'pr108_promote.py':
        raise SystemExit('UNEXPECTED_PYTHON_COMMAND')
    if behavior.get('concurrent_attempt'):
        marker.write_text(json.dumps({'sourceSha': behavior['source'],
                                      'attemptedAt': 'another-process'}))
    raise SystemExit(behavior.get('promotion_exit', 0))
if name != 'gh':
    raise SystemExit('UNEXPECTED_COMMAND')
if args[:1] == ['api']:
    if behavior.get('api_exit'):
        raise SystemExit(behavior['api_exit'])
    if '/contents/.github/workflows/pages.yml?ref=main' in args[1]:
        print(behavior['pages_blob'])
    elif '/contents/scripts/deployment/regressions.py?ref=main' in args[1]:
        print(behavior['regressions_blob'])
    else:
        raise SystemExit('UNEXPECTED_API_READ')
elif args[:2] == ['run', 'list']:
    limit = args[args.index('--limit') + 1]
    if behavior.get('fail_list_limit') == limit:
        raise SystemExit(45)
    print(json.dumps([{'databaseId': 123, 'headSha': behavior['source'],
                       'status': 'in_progress'}]))
elif args[:2] == ['workflow', 'run']:
    if not marker.exists():
        raise SystemExit('DISPATCH_WITHOUT_PRIOR_ATTEMPT_MARKER')
    if behavior.get('dispatch_exit'):
        print('DISPATCH_RESPONSE_UNKNOWN', file=sys.stderr)
    raise SystemExit(behavior.get('dispatch_exit', 0))
else:
    raise SystemExit('UNEXPECTED_GH_COMMAND')
'''


class ReleaseWrapperTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='jems-release-test-')
        self.addCleanup(self.temporary.cleanup)
        self.directory = Path(self.temporary.name)
        self.state = self.directory / 'private state with spaces'
        self.state.mkdir(mode=0o700)
        self.bin = self.directory / 'bin'
        self.bin.mkdir()
        self.log = self.directory / 'commands.jsonl'
        self.behavior_file = self.directory / 'behavior.json'
        self.behavior = {'source': SOURCE, 'pages_blob': PAGES_BLOB,
                         'regressions_blob': REGRESSIONS_BLOB}
        for command in ('gh', 'python3'):
            executable = self.bin / command
            executable.write_text('#!' + sys.executable + '\n' + COMMAND_DOUBLE)
            executable.chmod(0o700)
        # No general system PATH: the wrapper cannot fall through to real gh,
        # Python/cloud tooling, curl or any other network-capable executable.
        for command in ('dirname', 'date'):
            executable = shutil.which(command)
            self.assertIsNotNone(executable)
            (self.bin / command).symlink_to(executable)
        self.bash = shutil.which('bash')
        self.assertIsNotNone(self.bash)
        self.environment = {
            'PATH': str(self.bin), 'JEMS_TEST_LOG': str(self.log),
            'JEMS_TEST_STATE': str(self.state),
            'JEMS_TEST_BEHAVIOR': str(self.behavior_file),
        }

    @property
    def marker(self):
        return self.state / 'pages-dispatch.attempted.json'

    def run_release(self, **behavior):
        self.behavior.update(behavior)
        self.behavior_file.write_text(json.dumps(self.behavior))
        return subprocess.run([self.bash, str(SCRIPT), str(self.state)],
                              cwd=self.directory, env=self.environment,
                              text=True, capture_output=True, timeout=10)

    def events(self):
        return [json.loads(line) for line in self.log.read_text().splitlines()]

    def python_calls(self, script):
        return [event for event in self.events()
                if event['command'] == 'python3' and Path(event['args'][0]).name == script]

    def stages(self):
        return self.python_calls('pr108_stage.py')

    def promotions(self):
        return self.python_calls('pr108_promote.py')

    def dispatches(self):
        return [event for event in self.events()
                if event['command'] == 'gh' and event['args'][:2] == ['workflow', 'run']]

    def test_success_stages_promotes_then_dispatches_exact_source_and_origins_once(self):
        result = self.run_release()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len(self.stages()), 1)
        self.assertEqual(self.stages()[0]['args'], [
            str(SCRIPT.with_name('pr108_stage.py')), '--state-dir', str(self.state), '--execute'])
        self.assertEqual(self.promotions()[0]['args'], [
            str(SCRIPT.with_name('pr108_promote.py')), '--state-dir', str(self.state), '--execute'])
        self.assertEqual(len(self.promotions()), 1)
        self.assertEqual(len(self.dispatches()), 1)
        dispatch = self.dispatches()[0]
        self.assertEqual(dispatch['args'], [
            'workflow', 'run', 'pages.yml', '--repo', REPO, '--ref', 'main',
            '-f', 'source_sha=' + SOURCE,
            '-f', 'gateway_origin=https://factory-gateway-ola734esta-ul.a.run.app',
            '-f', 'preview_origin=https://factory-preview-ola734esta-ul.a.run.app'])
        self.assertTrue(dispatch['attemptExists'])
        self.assertEqual(dispatch['attempt']['sourceSha'], SOURCE)
        self.assertRegex(dispatch['attempt']['attemptedAt'], r'^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$')
        self.assertEqual(stat.S_IMODE(self.marker.stat().st_mode), 0o600)
        self.assertEqual(stat.S_IMODE((self.state / 'pages-before.json').stat().st_mode), 0o600)
        self.assertEqual(json.loads((self.state / 'pages-before.json').read_text())[0]['databaseId'], 123)
        operations = [(event['command'], event['args'][:2]) for event in self.events()]
        self.assertEqual([operation[0] for operation in operations], ['gh', 'gh', 'python3', 'python3', 'gh', 'gh', 'gh'])
        self.assertEqual([Path(operation[1][0]).name for operation in operations[2:4]],
                         ['pr108_stage.py', 'pr108_promote.py'])
        self.assertEqual(operations[4:], [('gh', ['run', 'list']), ('gh', ['workflow', 'run']), ('gh', ['run', 'list'])])
        self.assertIn('PAGES_DISPATCH=ACCEPTED', result.stdout)

    def test_failed_staging_never_promotes_or_attempts_pages_dispatch(self):
        result = self.run_release(stage_exit=8)
        self.assertEqual(result.returncode, 8)
        self.assertEqual(len(self.stages()), 1)
        self.assertEqual(self.promotions(), [])
        self.assertEqual(self.dispatches(), [])
        self.assertFalse(self.marker.exists())
        self.assertFalse((self.state / 'pages-before.json').exists())

    def assert_promotion_recovery_skips_stage(self, service):
        journal = self.state / (service + '.promotion.json')
        journal.write_text('{"syntheticPromotionJournal":true}\n')
        before = journal.read_bytes()
        # A fatal stage double proves the recovery path never invokes it.
        result = self.run_release(stage_exit=88)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.stages(), [])
        self.assertEqual(len(self.promotions()), 1)
        self.assertEqual(len(self.dispatches()), 1)
        self.assertEqual(journal.read_bytes(), before)

    def test_existing_coach_promotion_journal_skips_stage_for_recovery(self):
        self.assert_promotion_recovery_skips_stage('factory-coach-private')

    def test_existing_gateway_promotion_journal_skips_stage_for_recovery(self):
        self.assert_promotion_recovery_skips_stage('factory-gateway')

    def test_failed_promotion_never_attempts_pages_dispatch(self):
        result = self.run_release(promotion_exit=9)
        self.assertEqual(result.returncode, 9)
        self.assertEqual(len(self.stages()), 1)
        self.assertEqual(len(self.promotions()), 1)
        self.assertEqual(self.dispatches(), [])
        self.assertFalse(self.marker.exists())
        self.assertFalse((self.state / 'pages-before.json').exists())

    def test_uncertain_dispatch_retains_marker_and_rerun_only_lists(self):
        first = self.run_release(dispatch_exit=73)
        self.assertEqual(first.returncode, 73)
        self.assertEqual(len(self.dispatches()), 1)
        marker_before = self.marker.read_bytes()
        event_count = len(self.events())
        second = self.run_release(dispatch_exit=0)
        self.assertEqual(second.returncode, 0, second.stderr)
        self.assertEqual(self.marker.read_bytes(), marker_before)
        self.assertEqual(len(self.stages()), 1)
        self.assertEqual(len(self.promotions()), 1)
        self.assertEqual(len(self.dispatches()), 1)
        recovered = self.events()[event_count:]
        self.assertEqual(len(recovered), 1)
        self.assertEqual(recovered[0]['args'][:2], ['run', 'list'])
        self.assertIn('no backend change or second dispatch', second.stdout)

    def test_either_reviewed_workflow_dependency_drift_blocks_before_promotion(self):
        for field in ('pages_blob', 'regressions_blob'):
            with self.subTest(field=field):
                self.behavior.update(pages_blob=PAGES_BLOB, regressions_blob=REGRESSIONS_BLOB)
                result = self.run_release(**{field: '0' * 40})
                self.assertEqual(result.returncode, 2)
                self.assertEqual(self.stages(), [])
                self.assertEqual(self.promotions(), [])
                self.assertEqual(self.dispatches(), [])
                self.assertFalse(self.marker.exists())

    def test_github_read_failure_stops_before_backend_promotion(self):
        result = self.run_release(api_exit=41)
        self.assertEqual(result.returncode, 41)
        self.assertEqual(self.stages(), [])
        self.assertEqual(self.promotions(), [])
        self.assertEqual(self.dispatches(), [])
        self.assertFalse(self.marker.exists())

    def test_marker_created_by_other_process_cannot_be_overwritten_or_dispatched(self):
        result = self.run_release(concurrent_attempt=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.dispatches(), [])
        self.assertEqual(json.loads(self.marker.read_text())['attemptedAt'], 'another-process')

    def test_post_dispatch_list_failure_still_prevents_repeat(self):
        first = self.run_release(fail_list_limit='5')
        self.assertEqual(first.returncode, 45)
        self.assertIn('PAGES_DISPATCH=ACCEPTED', first.stdout)
        self.assertTrue(self.marker.exists())
        second = self.run_release(fail_list_limit=None)
        self.assertEqual(second.returncode, 0, second.stderr)
        self.assertEqual(len(self.stages()), 1)
        self.assertEqual(len(self.promotions()), 1)
        self.assertEqual(len(self.dispatches()), 1)


if __name__ == '__main__':
    unittest.main()
