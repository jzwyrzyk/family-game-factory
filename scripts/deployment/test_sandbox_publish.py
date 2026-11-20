"""Offline release-boundary checks for the manual, source-pinned GHCR publisher."""
from pathlib import Path
import importlib.util
import unittest

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT/'.github/workflows/sandbox-publish.yml'
PUBLIC_SOURCE = 'b472c224f7e8ef8ab0986ce6f755728d7cc63d46'

class ManualSandboxPublisherTests(unittest.TestCase):
    def source(self):
        return WORKFLOW.read_text()

    def test_only_manual_dispatch_on_exact_main_and_reviewed_source(self):
        text=self.source()
        self.assertIn('on:\n  workflow_dispatch:',text)
        self.assertNotIn('\n  push:',text)
        self.assertNotIn('\n  pull_request:',text)
        self.assertIn('REVIEWED_SANDBOX_SHA: '+PUBLIC_SOURCE,text)
        self.assertIn("github.repository == 'jzwyrzyk/family-game-factory'",text)
        self.assertIn("github.ref == 'refs/heads/main'",text)
        self.assertIn('git merge-base --is-ancestor',text)
        self.assertIn('git checkout --detach "$REVIEWED_SANDBOX_SHA"',text)

    def test_release_is_source_scoped_and_does_not_rotate_private_worker(self):
        text=self.source()
        self.assertIn('contents: read',text)
        self.assertIn('packages: write',text)
        self.assertIn('persist-credentials: false',text)
        self.assertIn('secrets.GITHUB_TOKEN',text)
        self.assertEqual(text.count('secrets.'),1)
        self.assertNotIn('gh variable set',text)
        self.assertNotIn('FACTORY_ACTIONS_APPROVED=true',text)
        self.assertNotIn('gcloud run',text)
        self.assertNotIn('gh workflow run',text)

    def test_no_publication_before_source_and_wire_validation(self):
        text=self.source()
        stages=[
            'Verify exact reviewed merged sandbox source',
            'Stage only committed, reviewed sandbox inputs',
            'Build and validate sandbox before any publication',
            'Exercise current envelope protocol in isolated no-network container',
            'Publish to GHCR after protocol validation',
        ]
        indexes=[text.index(label) for label in stages]
        self.assertEqual(indexes,sorted(indexes))
        self.assertIn('sha256sum',text)
        self.assertIn('worker.cjs source-validator.cjs quality-capture.cjs',text)
        self.assertIn('JSON.stringify({game:hopper})',text)
        self.assertIn('SANDBOX_ENVELOPE_WIRE_CONTRACT_PASSED',text)
        self.assertIn('source-$REVIEWED_SANDBOX_SHA-run-$GITHUB_RUN_ID-attempt-$GITHUB_RUN_ATTEMPT',text)
        self.assertIn('PUBLISHED_SANDBOX_IMAGE=$ref',text)
        self.assertIn('NOT YET PRODUCTION-ACCEPTED',text)

    def test_local_builder_has_required_source_files(self):
        spec=importlib.util.spec_from_file_location('build',ROOT/'scripts/deployment/build.py')
        module=importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        expected={'server/sandbox','server/agent/game-assets.cjs',
                  'server/quality/game-quality-evidence.cjs','.dockerignore'}
        self.assertTrue(expected.issubset(set(module.SANDBOX_SCOPE)))
        self.assertIn('server/sandbox/quality-capture.cjs',module.REQUIRED_SANDBOX_FILES)
        self.assertIn('server/agent/game-assets.cjs',module.REQUIRED_SANDBOX_FILES)
        self.assertIn('server/quality/game-quality-evidence.cjs',module.REQUIRED_SANDBOX_FILES)

if __name__=='__main__':
    unittest.main()
