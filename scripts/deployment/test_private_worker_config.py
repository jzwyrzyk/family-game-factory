"""No-cloud test: private worker migration preserves all existing credentials and Firestore identity."""
import importlib.util
from pathlib import Path
import unittest

SCRIPT=Path(__file__).with_name('private_worker_config.py')
spec=importlib.util.spec_from_file_location('private_worker_config',SCRIPT)
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class PrivateWorkerConfigTests(unittest.TestCase):
    def setUp(self):
        self.old={
            'active':False,'approval':{'enabled':False,'model':'','priceReviewedOn':''},
            'repository':'jzwyrzyk/family-game-factory',
            'repositoryId':'1458033181',
            'approvedSha':'dcb887e6a51ba000fda1ccc42b9d198f8b9895f9',
            'workflow':'factory-agent.yml',
            'projectId':'family-game-factory-jzw',
            'workspace':'family-001',
            'familyId':'family-001',
            'sessionKey':'synthetic-not-a-secret',
            'previewKey':'different-synthetic-key',
            'githubPrivateKeyFile':'/existing/private/mount/key.pem',
            'githubInstallationId':'182105358',
            'gatewayOrigin':'https://existing.example.run.app',
            'previewOrigin':'https://different.example.run.app'}
    def test_preserves_data_and_frozen_worker_source(self):
        migrated=module.make_config(self.old,'b'*40)
        self.assertEqual(migrated['workerRepository'],'jzwyrzyk/family-game-factory-worker')
        self.assertEqual(migrated['workerRepositoryId'],'1458899834')
        self.assertEqual(migrated['workerWorkflow'],'factory-private.yml')
        self.assertEqual(migrated['workerApprovedSha'],'b'*40)
        for name in self.old:
            self.assertEqual(migrated[name],self.old[name])
        self.assertIsNot(migrated,self.old)
    def test_never_activates_paid_generation(self):
        self.assertFalse(module.make_config(self.old,'b'*40)['active'])
        self.assertFalse(module.make_config(self.old,'b'*40)['approval']['enabled'])
        for bad in ({**self.old,'active':True},
                    {**self.old,'approval':{'enabled':True}},
                    {**self.old,'approvedSha':'c'*40},
                    {**self.old,'repository':'wrong/repo'}):
            with self.assertRaises(ValueError):
                module.make_config(bad,'b'*40)
    def test_rejects_unreviewed_private_sha(self):
        for bad in ('main','0'*39,'g'*40,'B'*40,''):
            with self.assertRaises(ValueError):
                module.make_config(self.old,bad)
