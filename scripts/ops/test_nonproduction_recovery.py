import copy
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

import recover_nonproduction as recovery


def fixture():
    variables = {'billing_account': 'AAAAAA-BBBBBB-CCCCCC'}
    recorded = {'google_iam_workload_identity_pool.github', 'google_artifact_registry_repository.static'}
    provider = {'disabled': True, 'display_name': recovery.DISPLAY,
        'workload_identity_pool_id': 'jems-nonproduction', 'workload_identity_pool_provider_id': 'github-main',
        'attribute_mapping': {'google.subject': 'assertion.sub', 'attribute.environment': 'assertion.environment'},
        'attribute_condition': " && ".join([
            "assertion.repository == 'jzwyrzyk/family-game-factory'", "assertion.repository_id == '1458033181'",
            "assertion.repository_owner_id == '356692244'", "assertion.ref == 'refs/heads/main'",
            "assertion.workflow_ref == 'jzwyrzyk/family-game-factory/.github/workflows/jems-environments.yml@refs/heads/main'",
            "assertion.runner_environment == 'github-hosted'", "assertion.event_name in ['workflow_run', 'workflow_dispatch', 'schedule']",
            "assertion.environment in ['jems-nonproduction', 'jems-nonproduction-uat']"]),
        'oidc': [{'issuer_uri': 'https://token.actions.githubusercontent.com',
                  'allowed_audiences': ['https://iam.googleapis.com/' + recovery.PROVIDER_NAME]}]}
    budget = {'billing_account': variables['billing_account'], 'display_name': recovery.BUDGET_DISPLAY,
              'budget_filter': [{'projects': ['projects/' + recovery.NUMBER], 'calendar_period': 'MONTH',
                                 'credit_types_treatment': 'INCLUDE_ALL_CREDITS'}],
              'amount': [{'specified_amount': [{'currency_code': 'USD', 'units': '15', 'nanos': 0}]}],
              'threshold_rules': [{'threshold_percent': n, 'spend_basis': b} for n, b in
                                  [(0.5, 'CURRENT_SPEND'), (0.8, 'CURRENT_SPEND'), (1, 'FORECASTED_SPEND')]]}
    values = {recovery.PROVIDER: provider, recovery.BUDGET: budget,
              'google_iam_workload_identity_pool.github': {'disabled': True},
              'google_artifact_registry_repository.static': {'cleanup_policy_dry_run': True}}
    entries = [{'address': a, 'mode': 'managed', 'type': a.split('.')[0],
                'change': {'actions': ['no-op'] if a in recorded else ['create'], 'after': v, 'after_unknown': {}}}
               for a, v in values.items()]
    plan = {'resource_changes': entries, 'complete': True, 'errored': False,
            'configuration': {'provider_config': {'google.nonproduction_budget': {'expressions': {
                'project': {'constant_value': recovery.PROJECT},
                'billing_project': {'constant_value': recovery.PROJECT},
                'user_project_override': {'constant_value': True}}}},
                'root_module': {'resources': [{'address': recovery.BUDGET, 'provider_config_key': 'google.nonproduction_budget'}]}}}
    return plan, recorded, variables


class RecoveryTests(unittest.TestCase):
    def guard(self, plan=None, imports=None):
        default, recorded, variables = fixture()
        return recovery.guard_plan(plan or default, recorded, variables, imports or {})

    def test_only_two_expected_creations_and_preserved_resources(self):
        self.assertEqual({r['address'] for r in self.guard()}, recovery.REMAINING)

    def test_any_existing_mutation_replacement_delete_or_missing_address_stops(self):
        for actions in (['update'], ['delete'], ['delete', 'create'], ['create', 'delete'], ['create'], ['forget']):
            plan, _, _ = fixture(); plan['resource_changes'][2]['change']['actions'] = actions
            with self.subTest(actions=actions), self.assertRaisesRegex(recovery.Stop, 'UNEXPECTED_ACTION'):
                self.guard(plan)
        plan, _, _ = fixture(); plan['resource_changes'].pop()
        with self.assertRaisesRegex(recovery.Stop, 'SCOPE_MISMATCH'): self.guard(plan)

    def test_unexpected_resources_and_obsolete_role_are_rejected(self):
        for address in (recovery.OBSOLETE, 'google_service_account_key.backdoor'):
            plan, _, _ = fixture(); extra = copy.deepcopy(plan['resource_changes'][0]); extra['address'] = address
            plan['resource_changes'].append(extra)
            with self.assertRaisesRegex(recovery.Stop, 'SCOPE_MISMATCH'): self.guard(plan)

    def test_drift_checks_deferred_changes_and_data_reads_fail_closed(self):
        for field, value in (('resource_drift', [{}]), ('errored', True), ('complete', False),
                             ('deferred_changes', [{}]), ('checks', [{'status': 'unknown'}]), ('checks', [{'status': 'fail'}])):
            plan, _, _ = fixture(); plan[field] = value
            with self.subTest(field=field), self.assertRaises(recovery.Stop): self.guard(plan)
        plan, _, _ = fixture()
        plan['resource_changes'].append({'address': 'data.google_project.nonproduction', 'mode': 'data', 'change': {'actions': ['read']}})
        with self.assertRaisesRegex(recovery.Stop, 'DEFERRED_DATA'): self.guard(plan)

    def test_import_only_exact_id_and_no_modification(self):
        plan, _, _ = fixture(); entry = plan['resource_changes'][0]
        entry['change']['actions'] = ['no-op']; entry['change']['importing'] = {'id': recovery.PROVIDER_NAME}
        self.guard(plan, {recovery.PROVIDER: recovery.PROVIDER_NAME})
        for actions in (['create'], ['update'], ['delete', 'create']):
            entry['change']['actions'] = actions
            with self.assertRaises(recovery.Stop): self.guard(plan, {recovery.PROVIDER: recovery.PROVIDER_NAME})
        entry['change']['actions'] = ['no-op']
        with self.assertRaisesRegex(recovery.Stop, 'IMPORT_ID'): self.guard(plan, {recovery.PROVIDER: 'wrong'})
        with self.assertRaises(recovery.Stop): self.guard(plan)

    def test_no_federation_or_budget_scope_widening(self):
        mutations = [
            (0, 'disabled', False), (0, 'attribute_condition', 'true'), (0, 'attribute_mapping', {'google.subject': 'assertion.actor'}),
            (0, 'oidc', [{'issuer_uri': 'https://attacker.example'}]),
            (1, 'billing_account', 'OTHER'), (1, 'budget_filter', [{'projects': []}]),
            (1, 'amount', [{'specified_amount': [{'units': '150', 'currency_code': 'USD'}]}]),
            (1, 'all_updates_rule', [{'pubsub_topic': 'projects/production/topics/disable-billing'}]),
            (2, 'disabled', False), (3, 'cleanup_policy_dry_run', False)]
        for index, key, value in mutations:
            plan, _, _ = fixture(); plan['resource_changes'][index]['change']['after'][key] = value
            with self.subTest(key=key), self.assertRaises(recovery.Stop): self.guard(plan)

    def test_quota_project_and_alias_must_be_nonproduction(self):
        for key, value in (('project', 'family-game-factory-jzw'), ('billing_project', 'family-game-factory-jzw'), ('user_project_override', False)):
            plan, _, _ = fixture()
            plan['configuration']['provider_config']['google.nonproduction_budget']['expressions'][key]['constant_value'] = value
            with self.assertRaisesRegex(recovery.Stop, 'QUOTA_PROJECT'): self.guard(plan)
        plan, _, _ = fixture()
        plan['configuration']['root_module']['resources'][0]['provider_config_key'] = 'google'
        with self.assertRaisesRegex(recovery.Stop, 'ALIAS'): self.guard(plan)

    def test_full_plan_fingerprint_changes_for_outputs_before_unknowns_and_variables(self):
        plan, _, _ = fixture(); old = recovery.plan_identity(plan)
        plan['timestamp'] = 'new'; self.assertEqual(old, recovery.plan_identity(plan))
        for key in ('output_changes', 'prior_state', 'variables'):
            changed = copy.deepcopy(plan); changed[key] = {'changed': True}
            self.assertNotEqual(old, recovery.plan_identity(changed))
        changed = copy.deepcopy(plan); changed['resource_changes'][0]['change']['after_unknown']['id'] = True
        self.assertNotEqual(old, recovery.plan_identity(changed))

    def test_errors_are_fixed_codes_numeric_3_does_not_prove_cause(self):
        self.assertEqual(recovery.failure_codes('INVALID_ARGUMENT code 3 private-user@example.com'), ['INVALID_ARGUMENT'])
        self.assertIn('WIF_DISPLAY_NAME_LIMIT', recovery.failure_codes('display_name must be at most 32 characters'))
        self.assertIn('IAP_PROJECT_ROLE_INVALID', recovery.failure_codes('Role roles/iap.serviceAgent is not supported for this resource'))
        self.assertIn('IAM_POLICY_CONTENTION', recovery.failure_codes('concurrent policy changes; etag mismatch'))
        text = 'PERMISSION_DENIED serviceusage.services.use SECRET_ABC'
        self.assertNotIn('SECRET', str(recovery.failure_codes(text)))

    def test_writes_are_durable_exclusive_and_paths_private(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); p = root / 'receipt'
            recovery.write_new(p, {'a': 1}); self.assertEqual(recovery.private_path(p), p)
            with self.assertRaises(FileExistsError): recovery.write_new(p, {'a': 2})
            self.assertEqual(json.loads(p.read_bytes()), {'a': 1})
            link = root / 'link'; link.symlink_to(p)
            with self.assertRaisesRegex(recovery.Stop, 'SYMLINK'): recovery.private_path(link)
            p.chmod(0o644)
            with self.assertRaisesRegex(recovery.Stop, 'PERMISSIONS'): recovery.private_path(p)

    def test_state_rejects_taints_deposed_and_duplicate_instances(self):
        state = {'version': 4, 'serial': 25, 'lineage': 'lineage', 'resources': [
            {'mode': 'managed', 'type': 'google_project_service', 'name': 'api', 'instances': [{'index_key': 'iam.googleapis.com'}]}]}
        self.assertEqual(recovery.state_addresses(state), {'google_project_service.api["iam.googleapis.com"]'})
        for key, value in (('status', 'tainted'), ('deposed', 'old')):
            bad = copy.deepcopy(state); bad['resources'][0]['instances'][0][key] = value
            with self.assertRaisesRegex(recovery.Stop, 'TAINTED_OR_DEPOSED'): recovery.state_addresses(bad)
        state['resources'][0]['instances'] *= 2
        with self.assertRaisesRegex(recovery.Stop, 'DUPLICATE'): recovery.state_addresses(state)

    def test_evidence_preserved_and_new_attempts_excluded(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); recovery.write_new(root / 'original', b'original bytes')
            before = recovery.evidence_hashes(root)
            (root / 'partial-recovery').mkdir(mode=0o700)
            recovery.write_new(root / 'partial-recovery' / 'new-receipt', b'new')
            self.assertEqual(before, recovery.evidence_hashes(root))
            (root / 'original').write_bytes(b'changed')
            self.assertNotEqual(before, recovery.evidence_hashes(root))

    def test_managed_identity_cannot_fall_back_to_owner_adc(self):
        with patch.dict(os.environ, {'OIC_MANIFEST_PATH': '/managed/manifest'}), patch.object(recovery, 'command') as call:
            with self.assertRaisesRegex(recovery.Stop, 'USER_ADC_CONTEXT_REQUIRED'): recovery.Reader()
            call.assert_not_called()

    def test_mutation_marker_prevents_replay_before_auth(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); parent = root / 'partial-recovery'; parent.mkdir(mode=0o700)
            recovery.write_new(parent / 'apply-started', {'approval': 'old'})
            with patch.object(recovery, 'source_identity'), patch.object(recovery, 'original_evidence', return_value=({}, {}, {}, set())), \
                 patch.object(recovery, 'Reader') as reader, patch('builtins.print') as emit:
                code = recovery.main(['--source-sha', 'a'*40, '--state-dir', temp, '--plan'])
                self.assertEqual(code, 2); reader.assert_not_called()
                self.assertIn('RECOVERY_ALREADY_STARTED', emit.call_args.args[0])

    def test_wrong_approval_stops_before_cloud_or_terraform(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp); recovery.write_new(folder / 'reviewed-recovery.json', {'source_sha': 'a'*40})
            with patch.object(recovery, 'tf') as tf, patch.object(recovery, 'reconcile') as read:
                with self.assertRaisesRegex(recovery.Stop, 'APPROVAL_HASH'): recovery.execute(folder, folder, 'a'*40, 'b'*64, None)
                tf.assert_not_called(); read.assert_not_called()

    def test_legacy_credential_overrides_cannot_change_terraform_identity(self):
        for key in ('GOOGLE_CLOUD_KEYFILE_JSON', 'GCLOUD_KEYFILE_JSON'):
            with patch.dict(os.environ, {key: 'private'}), patch.object(recovery, 'command') as call:
                with self.assertRaisesRegex(recovery.Stop, 'USER_ADC_CONTEXT_REQUIRED'): recovery.Reader()
                call.assert_not_called()

    def transaction(self, temp):
        original = Path(temp); parent = original / 'partial-recovery'; parent.mkdir(mode=0o700)
        folder = parent / 'attempt'; folder.mkdir(mode=0o700)
        plan, recorded, variables = fixture()
        recovery.write_new(folder / 'main.tf', b'configuration')
        recovery.write_new(folder / 'remaining.tfplan', b'plan bytes')
        recovery.write_new(folder / '.terraform.lock.hcl', b'lock')
        recovery.write_new(folder / 'terraform.tfvars.json', variables)
        recovery.write_new(folder / 'terraform.tfstate', b'state')
        observed = {'imports': {}}
        receipt = {'source_sha': 'a'*40, 'source_files': {'infra/nonproduction/main.tf': recovery.sha(b'configuration'),
                       'infra/nonproduction/.terraform.lock.hcl': recovery.sha(b'lock')}, 'original_dir': str(original),
                   'original_files': {}, 'inputs': {name: recovery.sha((folder/name).read_bytes()) for name in
                       ('main.tf', '.terraform.lock.hcl', 'terraform.tfvars.json', 'terraform.tfstate')},
                   'plan_sha256': recovery.sha(b'plan bytes'), 'plan_identity': recovery.plan_identity(plan),
                   'inventory': observed, 'state_lineage': 'lineage', 'state_serial': 25}
        recovery.write_new(folder / 'reviewed-recovery.json', receipt)
        return original, folder, plan, recorded, variables, observed, receipt

    def test_plan_tampering_during_network_recheck_stops_before_marker(self):
        for filename in ('main.tf', 'remaining.tfplan'):
            with tempfile.TemporaryDirectory() as temp:
                original, folder, plan, recorded, variables, observed, receipt = self.transaction(temp)
                def recheck(*args):
                    (folder / filename).write_bytes(b'changed during recheck')
                    return plan, []
                with patch.object(recovery, 'source_identity', return_value=receipt['source_files']), \
                     patch.object(recovery, 'original_evidence', return_value=({}, variables, {}, recorded)), \
                     patch.object(recovery, 'evidence_hashes', return_value={}), \
                     patch.object(recovery, 'command', return_value=b'{"terraform_version":"1.13.5"}'), \
                     patch.object(recovery, 'reconcile', return_value=observed), \
                     patch.object(recovery, 'make_plan', side_effect=recheck), patch.object(recovery, 'tf') as tf:
                    with self.assertRaisesRegex(recovery.Stop, 'RECOVERY_(INPUT|PLAN)_CHANGED'):
                        recovery.execute(original, folder, 'a'*40, recovery.digest(receipt), None)
                    self.assertFalse((original / 'partial-recovery/apply-started').exists())
                    self.assertFalse(any('apply' in c.args for c in tf.call_args_list))

    def test_apply_failure_keeps_global_marker_and_blocks_automatic_replay(self):
        with tempfile.TemporaryDirectory() as temp:
            original, folder, plan, recorded, variables, observed, receipt = self.transaction(temp)
            def terraform(folder, *args, **kwargs):
                if args[0] == 'apply': raise recovery.Stop('TERRAFORM_APPLY_TIMEOUT_UNCERTAIN')
                return b''
            with patch.object(recovery, 'source_identity', return_value=receipt['source_files']), \
                 patch.object(recovery, 'original_evidence', return_value=({}, variables, {}, recorded)), \
                 patch.object(recovery, 'evidence_hashes', return_value={}), \
                 patch.object(recovery, 'command', return_value=b'{"terraform_version":"1.13.5"}'), \
                 patch.object(recovery, 'reconcile', return_value=observed), \
                 patch.object(recovery, 'make_plan', return_value=(plan, [])), patch.object(recovery, 'tf', side_effect=terraform):
                with self.assertRaisesRegex(recovery.Stop, 'TIMEOUT_UNCERTAIN'):
                    recovery.execute(original, folder, 'a'*40, recovery.digest(receipt), None)
            self.assertTrue((original / 'partial-recovery/apply-started').is_file())
            self.assertTrue((folder / 'apply-started').is_file())
            self.assertEqual((folder / 'remaining.tfplan').read_bytes(), b'plan bytes')

    def cloud_reader(self, changes=None):
        account = 'billingAccounts/AAAAAA-BBBBBB-CCCCCC'
        base = {
            ('cloudresourcemanager', 'v1/projects/' + recovery.PROJECT): {'projectId': recovery.PROJECT, 'projectNumber': recovery.NUMBER, 'lifecycleState': 'ACTIVE'},
            ('cloudbilling', 'v1/projects/' + recovery.PROJECT + '/billingInfo'): {'billingEnabled': True, 'billingAccountName': account},
            ('cloudbilling', 'v1/' + account): {'open': True},
            ('iam', 'v1/' + recovery.POOL_NAME): {'name': recovery.POOL_NAME, 'state': 'ACTIVE', 'disabled': True},
            ('cloudresourcemanager', 'v1/projects/' + recovery.PROJECT + ':getIamPolicy'): {'bindings': []},
        }
        base.update(changes or {})
        def call(host, method, path, body=None, **kwargs):
            if (host, path) in base: return base[(host,path)]
            if path.endswith(':testIamPermissions'): return {'permissions': body['permissions']}
            if host == 'serviceusage': return {'state': 'ENABLED'}
            if '/serviceAccounts/' in path: return {'email': f'service-{recovery.NUMBER}@gcp-sa-iap.iam.gserviceaccount.com'}
            if path.startswith('v1/' + recovery.POOL_NAME + '/providers?'): return {'workloadIdentityPoolProviders': []}
            if host == 'billingbudgets': return {'budgets': []}
            raise AssertionError((host,method,path))
        return Mock(call=Mock(side_effect=call))

    def test_live_reconciliation_reads_only_and_never_infers_denial_as_absence(self):
        api = self.cloud_reader(); variables = fixture()[2]
        result = recovery.reconcile(api, variables)
        self.assertTrue(result['provider_absent'] and result['budget_absent'])
        for call in api.call.call_args_list:
            host, method, path = call.args[:3]
            self.assertTrue(method == 'GET' or path.endswith((':testIamPermissions', ':getIamPolicy')))
        denied = Mock(); denied.call.side_effect = recovery.Stop('READ_PERMISSION_DENIED')
        with self.assertRaisesRegex(recovery.Stop, 'PERMISSION_DENIED'): recovery.reconcile(denied, variables)

    def test_existing_obsolete_binding_or_enabled_pool_stops_without_deletion(self):
        for changes, code in [
            ({('cloudresourcemanager', 'v1/projects/' + recovery.PROJECT + ':getIamPolicy'): {'bindings': [{'role':'roles/iap.serviceAgent'}]}}, 'OBSOLETE_IAP_BINDING_EXISTS'),
            ({('iam', 'v1/' + recovery.POOL_NAME): {'name':recovery.POOL_NAME,'state':'ACTIVE','disabled':False}}, 'FEDERATION_NOT_DISABLED')]:
            with self.assertRaisesRegex(recovery.Stop, code): recovery.reconcile(self.cloud_reader(changes), fixture()[2])

    def test_pagination_is_exhaustive_and_loops_are_blocked(self):
        api = Mock(); api.call.side_effect = [{'budgets':[{'name':'one'}], 'nextPageToken':'next'}, {'budgets':[{'name':'two'}]}]
        self.assertEqual(len(recovery.page_list(api, 'billingbudgets', 'v1/account/budgets', 'budgets')), 2)
        self.assertIn('pageToken=next', api.call.call_args.args[2])
        api = Mock(); api.call.return_value = {'nextPageToken':'loop'}
        with self.assertRaisesRegex(recovery.Stop, 'PAGINATION_LOOP'): recovery.page_list(api, 'iam', 'path', 'providers')

    def test_actual_audit_messages_are_correlated_and_only_fixed_fields_shared(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); recovery.write_new(root/'apply-started', b'marker')
            rows = []
            for method, name, message, code in [
                ('CreateWorkloadIdentityPoolProvider', recovery.PROVIDER_NAME, 'display_name exceeds 32 characters PRIVATE', 3),
                ('SetIamPolicy', 'projects/' + recovery.PROJECT, 'Role roles/iap.serviceAgent is not supported for this resource PRIVATE', 3),
                ('SetIamPolicy', 'projects/' + recovery.PROJECT, 'Concurrent policy changes PRIVATE', 10),
                ('CreateWorkloadIdentityPoolProvider', 'projects/other/providers/github-main', 'display_name exceeds 32 characters', 3)]:
                rows.append({'protoPayload':{'methodName':method, 'resourceName':name, 'status':{'code':code,'message':message}}})
            api=Mock(); api.call.return_value={'entries':rows}
            result=recovery.audit(api,root,root)
            self.assertTrue(result['name_error_confirmed'] and result['iap_role_error_confirmed'])
            self.assertEqual(len(result['failures']),3)
            self.assertNotIn('PRIVATE', json.dumps(result))
            self.assertIn('PRIVATE', (root/'provider-errors.private.json').read_text())
            self.assertEqual(result['budget_error'], 'NOT_OBSERVED_CONFIGURATION_REQUIREMENT_CONFIRMED_FROM_PROVIDER_DOCUMENTATION')


if __name__ == '__main__': unittest.main()
