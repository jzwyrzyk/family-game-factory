"""Finite permission evidence must not infer denial from missing inventory."""
import unittest
import verify_diagnostic_access as access

class InventoryTests(unittest.TestCase):
    def run_check(self, inventory_status=None, extra=False):
        calls = []
        class Client:
            def __init__(self, origin, token): self.origin = origin
            def call(self, method, path, body=None):
                calls.append((method, path))
                if method == 'GET':
                    if 'jems-request-broker@' in path: return {'_inventory_http_status': 404}
                    if inventory_status: return {'_inventory_http_status': inventory_status}
                    return {'name': path}
                allowed = ['run.services.get', 'run.services.getIamPolicy', 'run.revisions.get', 'run.revisions.list'] if self.origin == 'https://run.googleapis.com' else []
                if extra and self.origin == 'https://run.googleapis.com': allowed.append('run.services.delete')
                return {'permissions': allowed}
        result = access.verify(None, Client, verified_identity={
            'effective_account': access.ACCOUNT, 'effective_account_unique_id': '123456789012345678901',
            'verification': 'google_tokeninfo_and_iam'})
        return result, calls

    def test_existing_resources_and_expected_absent_account(self):
        result, calls = self.run_check()
        self.assertEqual(result['status'], 'FINITE_CHECKS_PASSED')
        absent = [c for c in result['checks'] if 'jems-request-broker@' in c['resource']][0]
        self.assertEqual(absent['status'], 'NOT_FOUND_EXPECTED_UNPROVISIONED')
        self.assertEqual(absent['denied'], [])
        self.assertFalse(any(m == 'POST' and 'jems-request-broker@' in p for m,p in calls))
        self.assertFalse(any('userinfo' in p for _,p in calls))

    def test_inaccessible_and_missing_never_denied(self):
        for status in (403, 404):
            result, calls = self.run_check(status)
            self.assertEqual(result['status'], 'FINITE_CHECKS_INCOMPLETE')
            self.assertTrue(all(not c['denied'] for c in result['checks']))
            self.assertFalse(any(m == 'POST' for m,p in calls))

    def test_unexpected_permissions_fail_acceptance(self):
        result, _ = self.run_check(extra=True)
        self.assertEqual(result['status'], 'FINITE_CHECKS_INCOMPLETE')
        self.assertEqual(result['checks'][0]['status'], 'UNEXPECTED_PERMISSIONS')
