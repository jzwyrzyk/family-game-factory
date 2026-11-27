import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

path=Path(__file__).parent/'handoffs/install-private-dev-binding.py'
spec=importlib.util.spec_from_file_location('install_dev_binding',path)
op=importlib.util.module_from_spec(spec)
spec.loader.exec_module(op)


class PrivateBindingTests(unittest.TestCase):
    def test_existing_binding_or_uncertain_prior_attempt_never_writes(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(op,'command') as command:
            folder=Path(tmp)
            with patch.object(op,'metadata',return_value={'updated_at':'date'}):
                with self.assertRaisesRegex(RuntimeError,'EXISTING_BINDING_PRESERVED'):
                    op.install(folder,{},None,{})
            op.write(folder/'write-intent.json',b'{}')
            with patch.object(op,'metadata',return_value=None):
                with self.assertRaisesRegex(RuntimeError,'PRIOR_WRITE_INTENT_REVIEW_REQUIRED'):
                    op.install(folder,{},None,{})
            command.assert_not_called()

    def test_invalid_client_does_not_request_members_or_change_secret(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(op,'metadata',return_value=None), \
             patch.object(op.sys.stdin,'isatty',return_value=True), patch.object(op.getpass,'getpass') as ask, \
             patch.object(op,'command') as command:
            for answer in ('','123456789012-fake.apps.googleusercontent.com'):
                with patch('builtins.input',return_value=answer), self.assertRaises(RuntimeError):
                    op.install(Path(tmp),{},None,{})
            ask.assert_not_called()
            command.assert_not_called()

    def test_success_uncertain_write_and_replay(self):
        secret='{"nonce":"fixture","members":["user:adult@example.invalid"]}'
        checksum=hashlib.sha256(secret.encode()).hexdigest()
        client=op.NUMBER+'-test.apps.googleusercontent.com'
        helper=Mock()
        helper.prepare.return_value=({'ownerIapBindingSha256':checksum},secret)
        receipt={'updated_at':'2026-11-27T00:00:00Z'}
        for failed in (False,True):
            with tempfile.TemporaryDirectory() as tmp, patch.object(op.sys.stdin,'isatty',return_value=True), \
                 patch('builtins.input',return_value=client), patch.object(op.getpass,'getpass',return_value='adult@example.invalid'), \
                 patch.object(op,'target'), patch.object(op,'metadata',side_effect=[None,None,receipt,receipt]), \
                 patch.object(op,'command') as cmd:
                folder=Path(tmp)
                if failed:
                    cmd.side_effect=RuntimeError('SECRET_WRITE_UNCONFIRMED')
                    with self.assertRaisesRegex(RuntimeError,'SECRET_WRITE_UNCONFIRMED'):
                        op.install(folder,{},helper,{})
                    self.assertTrue((folder/'write-intent.json').exists())
                    self.assertFalse((folder/'installed.json').exists())
                else:
                    result=op.install(folder,{},helper,{})
                    self.assertEqual(op.install(folder,{},helper,{}),result)
                    self.assertEqual(result['binding_sha256'],checksum)
                    self.assertNotIn('example.invalid',json.dumps(result))
                cmd.assert_called_once_with(['gh','secret','set',op.SECRET,'--repo','github.com/'+op.REPO,
                                             '--env',op.ENV],'SECRET_WRITE_UNCONFIRMED',secret.encode())
