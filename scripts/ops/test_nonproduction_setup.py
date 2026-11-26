import copy
import tempfile
from pathlib import Path
import unittest
from unittest.mock import Mock

import setup_nonproduction as setup


def reader(*args):
    if args[:2] == ('projects', 'list'): return []
    if args[:3] == ('billing', 'projects', 'describe'):
        return {'billingEnabled': True, 'billingAccountName': 'billingAccounts/AAAAAA-BBBBBB-CCCCCC'}
    if args[:3] == ('billing', 'accounts', 'describe'):
        return {'open': True, 'name': 'billingAccounts/AAAAAA-BBBBBB-CCCCCC'}
    raise AssertionError(args)


class NonproductionTests(unittest.TestCase):
    def test_invisible_is_not_available_and_inventory_never_creates(self):
        api = Mock(side_effect=reader)
        result = setup.inventory(api)
        self.assertEqual(result['project_id_status'], 'NOT_VISIBLE_GLOBAL_AVAILABILITY_UNVERIFIED')
        self.assertEqual(result['creation'][0][:3], ['gcloud', 'projects', 'create'])
        self.assertFalse(any('create' in call.args for call in api.call_args_list))

    def test_disabled_billing_wrong_project_and_inaccessible_fail_closed(self):
        def bad(*args):
            if args[:2] == ('projects', 'list'):
                return [{'projectId': setup.PROJECT, 'projectNumber': setup.PRODUCTION_NUMBER, 'lifecycleState': 'ACTIVE'}]
            return reader(*args)
        with self.assertRaises(RuntimeError): setup.inventory(bad)
        with self.assertRaises(RuntimeError): setup.inventory(Mock(side_effect=RuntimeError('denied')))
        def billing(*args):
            if args[:3] == ('billing', 'projects', 'describe'): return {'billingEnabled': False}
            return reader(*args)
        with self.assertRaises(RuntimeError): setup.inventory(billing)

    def test_creates_only_no_delete_update_unknown_type_or_production(self):
        entry = {'address': 'google_service_account.dev', 'mode': 'managed',
                 'type': 'google_service_account', 'change': {'actions': ['create'], 'after': {'project': setup.PROJECT}}}
        self.assertEqual(len(setup.validate_plan({'resource_changes': [entry]})), 1)
        for actions in (['delete'], ['delete', 'create'], ['update'], ['create', 'delete']):
            bad = copy.deepcopy(entry); bad['change']['actions'] = actions
            with self.assertRaises(RuntimeError): setup.validate_plan({'resource_changes': [bad]})
        bad = copy.deepcopy(entry); bad['change']['after']['project'] = setup.PRODUCTION
        with self.assertRaises(RuntimeError): setup.validate_plan({'resource_changes': [bad]})
        bad = copy.deepcopy(entry); bad['type'] = 'google_service_account_key'
        with self.assertRaises(RuntimeError): setup.validate_plan({'resource_changes': [bad]})
        with self.assertRaises(RuntimeError): setup.validate_plan({'deferred_changes': [{}]})

    def test_private_state_outside_checkout_and_extra_input_rejected(self):
        with self.assertRaises(RuntimeError): setup.state_dir(str(setup.ROOT / 'state'))
        with tempfile.TemporaryDirectory() as temp:
            folder = setup.state_dir(temp)
            (folder / 'override.tf').write_text('malicious')
            with self.assertRaisesRegex(RuntimeError, 'Unexpected Terraform input'):
                setup.prepare(folder, 'a' * 40, {}, {'project_number': '123456789'})


if __name__ == '__main__': unittest.main()
