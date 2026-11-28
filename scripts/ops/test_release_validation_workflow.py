"""The new read-only evidence gate cannot bypass or alter release authority."""
import hashlib
import os
from pathlib import Path
import subprocess
import tempfile
import textwrap
import unittest


ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / '.github/workflows/jems-cloud-run-release.yml'


class ReleaseValidationWorkflow(unittest.TestCase):
    def setUp(self):
        self.text = WORKFLOW.read_text()
        self.plan = self.text.split('  plan:\n', 1)[1].split('  transition:\n', 1)[0]
        self.gate = textwrap.dedent(self.plan.split('        id: plan\n', 1)[1].split('        run: |\n', 1)[1])

    def run_gate(self, operation, verifier_exit=0):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            output, summary, calls = (root / name for name in ('output', 'summary', 'calls'))
            output.write_text('')
            summary.write_text('')
            node = root / 'node'
            node.write_text('#!/bin/sh\nprintf "%s\\n" "$@" > "$VERIFIER_CALLS"\n'
                            'printf "fixture verification result\\n"\nexit "$VERIFIER_EXIT"\n')
            node.chmod(0o700)
            result = subprocess.run(['/bin/bash', '-c', self.gate], capture_output=True, text=True, env={
                'PATH': str(root) + os.pathsep + os.defpath,
                'GITHUB_OUTPUT': str(output), 'GITHUB_STEP_SUMMARY': str(summary),
                'VERIFIER_CALLS': str(calls), 'VERIFIER_EXIT': str(verifier_exit),
                'RELEASE_SOURCE': 'a' * 40, 'RELEASE_OPERATION': operation,
                'RELEASE_EVIDENCE': '123', 'RELEASE_PLAN': '{"operation":"' + operation + '"}',
            })
            return result, output.read_text(), summary.read_text(), calls.read_text() if calls.exists() else None

    def test_failed_evidence_never_exposes_transition_output_even_when_tee_succeeds(self):
        for operation in ('stage', 'canary', 'promote', 'acceptance-route-add', 'acceptance-route-remove'):
            with self.subTest(operation=operation):
                result, output, _summary, calls = self.run_gate(operation, verifier_exit=7)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(output, '')
                self.assertEqual(calls.splitlines(), ['scripts/ci/verify-release-validation.mjs', 'a' * 40, '123'])

    def test_successful_evidence_is_required_before_forwarding_exact_operation(self):
        for operation in ('stage', 'canary', 'promote', 'acceptance-route-add', 'acceptance-route-remove'):
            with self.subTest(operation=operation):
                result, output, summary, calls = self.run_gate(operation)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(output, 'operation=' + operation + '\n')
                self.assertIsNotNone(calls)
                self.assertIn('{"operation":"' + operation + '"}', summary)

    def test_rollback_and_empty_intent_do_not_require_node_or_application_success(self):
        result, output, _summary, calls = self.run_gate('rollback', verifier_exit=7)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(output, 'operation=rollback\n')
        self.assertIsNone(calls)
        result, output, _summary, calls = self.run_gate('', verifier_exit=7)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(output, '')
        self.assertIsNone(calls)
        self.assertIn("if: steps.intent.outputs.operation != '' && steps.intent.outputs.operation != 'rollback'", self.plan)

    def test_plan_uses_pinned_dependency_free_node_and_keeps_source_preconditions(self):
        self.assertIn('actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020', self.plan)
        self.assertIn('node-version: 22', self.plan)
        self.assertNotIn('npm ', self.plan)
        self.assertNotIn('id-token:', self.plan)
        self.assertNotIn('gh api ', self.plan)
        self.assertIn('git merge-base --is-ancestor "$source" HEAD', self.plan)
        self.assertIn('python3 scripts/ops/release.py ops/release.json', self.plan)
        self.assertIn('operation: ${{ steps.plan.outputs.operation }}', self.plan)
        self.assertIn("github.ref == 'refs/heads/main' && github.ref_protected", self.plan)

    def test_approved_transition_retains_identity_attestation_main_and_dependency_gates(self):
        transition = self.text.split('  transition:\n', 1)[1]
        for step in ('production_gate.py transition', 'google-github-actions/auth@', 'gh attestation verify',
                     'production_gate.py dependencies', 'git ls-remote origin refs/heads/main', 'ops/release.json --apply'):
            self.assertIn(step, transition)
        self.assertLess(transition.index('production_gate.py transition'), transition.index('google-github-actions/auth@'))
        self.assertLess(transition.index('production_gate.py dependencies'), transition.index('ops/release.json --apply'))
        self.assertIn('environment: jems-cloud-run-production', transition)
        self.assertIn("vars.JEMS_CLOUD_RUN_RELEASE_ENABLED == 'true'", transition)
        self.assertIn('--deny-self-hosted-runners',transition)
        review = self.text.split('  review-release:\n')[1].split('  plan:\n')[0]
        self.assertIn('environment: jems-production-approval', review)
        self.assertIn('permissions: {}', review)
        self.assertNotIn('id-token: write', review)
        self.assertNotIn('google-github-actions/auth', review)
        self.assertIn("inputs.release_review == 'off'", self.plan)
        self.assertIn('group: jems-cloud-run-production', self.text)


if __name__ == '__main__':
    unittest.main()
