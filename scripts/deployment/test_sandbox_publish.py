"""Offline release-boundary checks for the manual, source-pinned GHCR publisher."""
from pathlib import Path
import importlib.util
import json
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT/'.github/workflows/sandbox-publish.yml'
PUBLIC_SOURCE = 'd1a0996edd3f2e70b64c41a1e9edc1aeb676b8f4'

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
            'Verify premium packaged bytes and desktop and touch captures',
            'Publish to GHCR after protocol validation',
            'Retain digest-bound publication and package receipts',
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

    def test_published_digest_is_bound_to_image_that_passed_both_protocols(self):
        text=self.source()
        ordered=['docker tag jems-sandbox:prepublish jems-premium-sandbox:ci',
                 'node --import tsx tools/premium-sandbox-check.ts',
                 'docker push "$tag"', 'docker pull "$ref"',
                 '.imageId == $id and .source == $source', 'PUBLISHED_SANDBOX_IMAGE=$ref']
        offsets=[text.index(step) for step in ordered]
        self.assertEqual(offsets,sorted(offsets))
        self.assertIn('github.ref_protected',text)
        self.assertIn('if-no-files-found: error',text)

    def test_attestation_job_only_signs_verified_manifest_after_publication(self):
        publisher, attestation = self.source().split('\n  attest-reviewed-sandbox:')
        self.assertNotIn('id-token: write', publisher)
        self.assertNotIn('attestations: write', publisher)
        self.assertLess(publisher.index('.imageId == $id and .source == $source'),
                        publisher.index('echo "digest=$digest" >> "$GITHUB_OUTPUT"'))
        self.assertIn('needs: publish-reviewed-sandbox', attestation)
        self.assertIn('subject-digest: ${{ needs.publish-reviewed-sandbox.outputs.digest }}', attestation)
        self.assertIn('subject-name: ghcr.io/jzwyrzyk/family-game-factory-sandbox', attestation)
        self.assertNotIn('packages: write', attestation)
        self.assertNotIn('actions/checkout', attestation)
        self.assertNotIn('run:', attestation)

    def test_fixture_loader_from_real_typescript_package(self):
        # Regression for run 44837433067: named ESM import of a TS fixture
        # compiled as CommonJS failed before the Docker envelope test.
        # npm ci is run by CI before deployment tests.
        result=subprocess.run([
            'node','--import','tsx','-e',
            'const {hopper}=require("./server/testing/generated-fixtures.ts");'
            'if(!hopper||hopper.kind!=="generated-module-v1"||'
            '!Array.isArray(hopper.controls)||'
            'typeof hopper.source!=="string"||'
            '!hopper.source.includes("createGame"))'
            'throw Error("SANDBOX_SYNTHETIC_FIXTURE_INVALID");'
            'process.stdout.write(JSON.stringify({game:hopper}));'
        ],cwd=ROOT,text=True,capture_output=True,timeout=25)
        self.assertEqual(result.returncode,0,
                         'TYPE_SCRIPT_FIXTURE_LOAD_FAILED')
        value=json.loads(result.stdout)
        self.assertEqual(value['game']['kind'],'generated-module-v1')
        self.assertGreater(len(value['game']['source']),40)

    def test_wire_input_is_validated_before_docker_container(self):
        text=self.source()
        self.assertIn('const {hopper} = require("./server/testing/generated-fixtures.ts")',text)
        self.assertNotIn('import {hopper} from',text)
        self.assertIn('SANDBOX_FIXTURE_ENVELOPE_VALIDATED',text)
        self.assertIn('SANDBOX_SYNTHETIC_FIXTURE_INVALID',text)
        self.assertLess(text.index('SANDBOX_FIXTURE_ENVELOPE_VALIDATED'),
                        text.index('timeout 90s docker run --rm -i'))
        self.assertIn('< "$RUNNER_TEMP/jems-sandbox-wire-input.json"',text)
        self.assertLess(text.index('SANDBOX_ENVELOPE_WIRE_CONTRACT_PASSED'),
                        text.index('docker push "$tag"'))

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
