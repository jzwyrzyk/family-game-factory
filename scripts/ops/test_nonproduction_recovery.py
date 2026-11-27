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
                'root_module': {'resources': [{'address': recovery.BUDGET, 'provider_config_key': 'google.nonproduction_budget',
                    'expressions': {'budget_filter': [{'calendar_period': {'constant_value': 'MONTH'},
                        'credit_types_treatment': {'constant_value': 'INCLUDE_ALL_CREDITS'},
                        'projects': {'references': ['data.google_project.nonproduction.number', 'data.google_project.nonproduction']}}]}}]}}}
    return plan, recorded, variables


def iap_state():
    email = 'service-1092405124984@gcp-sa-iap.iam.gserviceaccount.com'
    attributes = {'id': 'projects/jems-jzw-nonprod/services/iap.googleapis.com', 'project': 'jems-jzw-nonprod',
                  'service': 'iap.googleapis.com', 'email': email, 'member': 'serviceAccount:' + email}
    return {'resources': [{'mode': 'managed', 'type': 'google_project_service_identity', 'name': 'iap',
                           'provider': 'provider["registry.terraform.io/hashicorp/google-beta"]',
                           'instances': [{'attributes': attributes}]}]}


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

    def refresh_case(self):
        plan, recorded, variables = fixture()
        rows = {row['address']: row for row in plan['resource_changes']}
        registry = rows[recovery.REGISTRY]
        registry['change']['after'].update(project=recovery.PROJECT, location='us-east5',
            repository_id='jems-environments', labels={}, effective_labels={'goog-terraform-provisioned': 'true'})
        binding = {'address': recovery.RUNTIME_ACT_AS, 'mode': 'managed', 'type': 'google_service_account_iam_member',
                   'change': {'actions': ['no-op'], 'after': {'etag': 'current', 'role': recovery.ACT_AS_ROLE,
                              'member': recovery.DEPLOY_MEMBER, 'service_account_id': recovery.RUNTIME_ACCOUNT,
                              'condition': []}}}
        plan['resource_changes'].append(binding)
        recorded.add(binding['address'])
        plan['resource_drift'] = []
        for row, field, old in ((registry, 'labels', None), (binding, 'etag', 'previous')):
            row['change']['before'] = copy.deepcopy(row['change']['after'])
            drift = copy.deepcopy(row)
            drift['change']['actions'] = ['update']
            drift['change']['before'][field] = old
            plan['resource_drift'].append(drift)
        policy = {'etag': 'current', 'version': 1, 'bindings': [
            {'role': role, 'members': [recovery.DEPLOY_MEMBER]} for role in (recovery.INSPECT_ROLE, recovery.ACT_AS_ROLE)]}
        api = Mock()
        api.call.return_value = policy
        return plan, recorded, variables, {}, api

    def test_two_refresh_fields_require_no_ops_and_matching_direct_runtime_policy(self):
        args = self.refresh_case()
        self.assertEqual([r['actions'] for r in recovery.guard_plan(*args)], [['create'], ['create']])
        args[-1].call.assert_called_once_with('iam', 'POST',
            'v1/projects/jems-jzw-nonprod/serviceAccounts/jems-static-runtime@jems-jzw-nonprod.iam.gserviceaccount.com'
            ':getIamPolicy?options.requestedPolicyVersion=3')

    def test_policy_is_rechecked_before_creating_the_apply_marker(self):
        plan, recorded, variables, _, api = self.refresh_case()
        with tempfile.TemporaryDirectory() as temp:
            original, folder, _, _, _, observed, receipt = self.transaction(temp)
            receipt['plan_identity'] = recovery.plan_identity(plan)
            (folder / 'reviewed-recovery.json').write_text(json.dumps(receipt))
            api.call.return_value['etag'] = 'changed-since-review'
            with patch.object(recovery, 'source_identity', return_value=receipt['source_files']), \
                 patch.object(recovery, 'original_evidence', return_value=({}, variables, iap_state(), recorded)), \
                 patch.object(recovery, 'command', return_value=b'{"terraform_version":"1.13.5"}'), \
                 patch.object(recovery, 'reconcile', return_value=observed), \
                 patch.object(recovery, 'tf', return_value=json.dumps(plan).encode()) as terraform:
                with self.assertRaisesRegex(recovery.Stop, 'RUNTIME_POLICY_ETAG_MISMATCH'):
                    recovery.execute(original, folder, 'a'*40, recovery.digest(receipt), api)
            self.assertFalse((original / 'partial-recovery/apply-started').exists())
            self.assertFalse(any('apply' in c.args for c in terraform.call_args_list))

    def test_refresh_never_accepts_other_attributes_addresses_unknowns_moves_or_actions(self):
        mutations = [
            lambda rows: rows.append(copy.deepcopy(rows[0])),
            lambda rows: rows[1].update(address='google_service_account_iam_member.runtime_inspect'),
            lambda rows: rows[0]['change']['before'].pop('labels'),
            lambda rows: rows[0]['change']['before'].update(effective_labels={}),
            lambda rows: rows[1]['change']['before'].update(role='roles/owner'),
            lambda rows: rows[1]['change'].update(after_unknown={'member': True}),
            lambda rows: rows[1]['change'].update(importing={'id': 'other'}),
            lambda rows: rows[1]['change'].update(actions=['delete']),
            lambda rows: rows[0].update(previous_address='google_artifact_registry_repository.other'),
        ]
        for mutate in mutations:
            args = self.refresh_case()
            mutate(args[0]['resource_drift'])
            with self.subTest(mutation=mutate), self.assertRaisesRegex(recovery.Stop, 'EXISTING_RESOURCE_DRIFT'):
                recovery.guard_plan(*args)
        for key, value in [('actions', ['update']), ('after', {'labels': {}}), ('before', {})]:
            args = self.refresh_case()
            args[0]['resource_changes'][3]['change'][key] = value
            with self.subTest(key=key), self.assertRaises(recovery.Stop): recovery.guard_plan(*args)

    def test_real_labels_and_changed_resource_identities_still_block(self):
        for index, field, wrong in [(0, 'labels', {'new': 'true'}), (0, 'project', 'other'),
                                    (0, 'repository_id', 'other'), (1, 'etag', 'previous'),
                                    (1, 'role', 'roles/owner'), (1, 'member', 'allUsers'),
                                    (1, 'service_account_id', 'other'), (1, 'condition', [{'title': 'conditional'}])]:
            args = self.refresh_case()
            row = args[0]['resource_drift'][index]
            planned = next(r for r in args[0]['resource_changes'] if r['address'] == row['address'])
            for attrs in (planned['change']['before'], planned['change']['after'], row['change']['after']):
                attrs[field] = wrong
            if field not in ('labels', 'etag'):
                row['change']['before'][field] = wrong
            with self.subTest(field=field), self.assertRaisesRegex(recovery.Stop, 'REFRESH_MISMATCH'):
                recovery.guard_plan(*args)

    def test_changed_runtime_policy_missing_grants_conditions_and_denial_block(self):
        for mutate in [lambda policy: policy.update(etag='other'),
                       lambda policy: policy['bindings'].pop(),
                       lambda policy: policy['bindings'].append({'role': 'roles/owner', 'members': ['allUsers']}),
                       lambda policy: policy['bindings'][0]['members'].append('allUsers'),
                       lambda policy: policy['bindings'][1].update(condition={'expression': 'true'}),
                       lambda policy: policy.update(version=2)]:
            args = self.refresh_case()
            mutate(args[-1].call.return_value)
            with self.assertRaisesRegex(recovery.Stop, 'RUNTIME_POLICY_'): recovery.guard_plan(*args)
        args = self.refresh_case()
        args[-1].call.side_effect = recovery.Stop('READ_PERMISSION_DENIED')
        with self.assertRaisesRegex(recovery.Stop, 'READ_PERMISSION_DENIED'): recovery.guard_plan(*args)
        with self.assertRaisesRegex(recovery.Stop, 'EVIDENCE_REQUIRED'): recovery.guard_plan(*args[:-1])

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

    def test_locked_provider_month_default_keeps_budget_and_alias_checks(self):
        plan, _, _ = fixture()
        change = plan['resource_changes'][1]['change']
        filt = change['after']['budget_filter'][0]
        filt.update(calendar_period=None, custom_period=[], credit_types=None, resource_ancestors=None, subaccounts=None)
        change['after_unknown']['budget_filter'] = [{'labels': True, 'services': True, 'projects': [False], 'custom_period': []}]
        self.guard(plan)
        for val in ('YEAR', 'QUARTER', '', 'CALENDAR_PERIOD_UNSPECIFIED'):
            filt['calendar_period'] = val
            with self.subTest(val=val), self.assertRaisesRegex(recovery.Stop, 'BUDGET_FILTER_CHANGED'): self.guard(plan)
        del filt['calendar_period']
        with self.assertRaisesRegex(recovery.Stop, 'BUDGET_FILTER_CHANGED'): self.guard(plan)
        filt['calendar_period'] = None
        for val in (True, [{'calendar_period': True}], [{'custom_period': True}]):
            change['after_unknown']['budget_filter'] = val
            with self.assertRaisesRegex(recovery.Stop, 'BUDGET_PERIOD_UNKNOWN'): self.guard(plan)
        change['after_unknown'] = {}
        filt['custom_period'] = [{'start_date': [{}]}]
        with self.assertRaisesRegex(recovery.Stop, 'BUDGET_FILTER_CHANGED'): self.guard(plan)

    def test_month_default_requires_explicit_exact_filter_configuration(self):
        for key, wrong in [('calendar_period', None), ('calendar_period', {'constant_value': 'YEAR'}),
                           ('calendar_period', {'references': ['var.period']}), ('custom_period', []),
                           ('projects', {'references': ['var.other']}), ('services', {'constant_value': ['one']})]:
            plan, _, _ = fixture()
            plan['resource_changes'][1]['change']['after']['budget_filter'][0]['calendar_period'] = None
            config = plan['configuration']['root_module']['resources'][0]['expressions']['budget_filter'][0]
            if wrong is None:
                del config[key]
            else:
                config[key] = wrong
            with self.subTest(key=key), self.assertRaisesRegex(recovery.Stop, 'BUDGET_FILTER_CONFIG_CHANGED'):
                self.guard(plan)

    def test_live_budget_inventory_checks_effective_month_and_scope(self):
        account = 'billingAccounts/AAAAAA-BBBBBB-CCCCCC'
        key = ('billingbudgets', 'v1/' + account + '/budgets?pageSize=100')
        budget = {'name': account + '/budgets/b1', 'displayName': recovery.BUDGET_DISPLAY}
        for overrides, allowed in [({}, True), ({'calendarPeriod': 'MONTH'}, True),
                ({'calendarPeriod': 'QUARTER'}, False), ({'customPeriod': {}}, False), ({'projects': []}, False),
                ({'creditTypesTreatment': 'EXCLUDE_ALL_CREDITS'}, False), ({'services': ['services/one']}, False),
                ({'labels': {'only': ['one']}}, False)]:
            budget['budgetFilter'] = {'projects': ['projects/' + recovery.NUMBER], **overrides}
            api = self.cloud_reader({key: {'budgets': [budget]}})
            with self.subTest(overrides=overrides):
                if allowed:
                    self.assertEqual(recovery.reconcile(api, fixture()[2])['imports'][recovery.BUDGET], budget['name'])
                else:
                    with self.assertRaisesRegex(recovery.Stop, 'LIVE_BUDGET_FILTER_CHANGED'):
                        recovery.reconcile(api, fixture()[2])

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
                   'inventory': observed, 'recorded_iap_identity': recovery.recorded_iap_identity(iap_state()),
                   'live_iap_acceptance': 'REQUIRED_BEFORE_DEV', 'state_lineage': 'lineage', 'state_serial': 25}
        recovery.write_new(folder / 'reviewed-recovery.json', receipt)
        return original, folder, plan, recorded, variables, observed, receipt

    def test_apply_revalidates_recorded_identity_against_original_before_planning(self):
        with tempfile.TemporaryDirectory() as temp:
            original, folder, _, recorded, variables, _, receipt = self.transaction(temp)
            receipt['recorded_iap_identity']['email'] = 'wrong'
            (folder / 'reviewed-recovery.json').write_text(json.dumps(receipt))
            with patch.object(recovery, 'source_identity', return_value=receipt['source_files']), \
                 patch.object(recovery, 'original_evidence', return_value=({}, variables, iap_state(), recorded)), \
                 patch.object(recovery, 'tf') as tf:
                with self.assertRaisesRegex(recovery.Stop, 'IAP_STATE_RECEIPT_MISMATCH'):
                    recovery.execute(original, folder, 'a'*40, recovery.digest(receipt), None)
                tf.assert_not_called()
                self.assertFalse((original / 'partial-recovery/apply-started').exists())

    def test_plan_tampering_during_network_recheck_stops_before_marker(self):
        for filename in ('main.tf', 'remaining.tfplan'):
            with tempfile.TemporaryDirectory() as temp:
                original, folder, plan, recorded, variables, observed, receipt = self.transaction(temp)
                def recheck(*args):
                    (folder / filename).write_bytes(b'changed during recheck')
                    return plan, []
                with patch.object(recovery, 'source_identity', return_value=receipt['source_files']), \
                     patch.object(recovery, 'original_evidence', return_value=({}, variables, iap_state(), recorded)), \
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
                 patch.object(recovery, 'original_evidence', return_value=({}, variables, iap_state(), recorded)), \
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
            if (host, path) in base:
                value = base[(host, path)]
                if isinstance(value, Exception): raise value
                return value
            if path.endswith(':testIamPermissions'): return {'permissions': body['permissions']}
            if host == 'serviceusage': return {'state': 'ENABLED'}
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

    def test_google_managed_identity_is_verified_from_preserved_record(self):
        evidence = recovery.recorded_iap_identity(iap_state())
        self.assertEqual(evidence['address'], 'google_project_service_identity.iap')
        self.assertEqual(evidence['evidence'], 'original_terraform_state')
        api = self.cloud_reader()
        self.assertTrue(recovery.reconcile(api, fixture()[2])['iap_api_enabled'])
        paths = [c.args[2] for c in api.call.call_args_list]
        self.assertIn('v1/projects/1092405124984/services/iap.googleapis.com', paths)
        self.assertFalse(any('serviceAccounts/' in p or 'generateServiceIdentity' in p for p in paths))

    def test_mismatched_or_missing_service_identity_attributes_stop(self):
        for field in ('id', 'project', 'service', 'email', 'member'):
            for absent in (True, False):
                state = iap_state()
                attrs = state['resources'][0]['instances'][0]['attributes']
                if absent: del attrs[field]
                else: attrs[field] = 'wrong'
                with self.subTest(field=field, absent=absent), self.assertRaisesRegex(recovery.Stop, 'IAP_STATE_IDENTITY_MISMATCH'):
                    recovery.recorded_iap_identity(state)

    def test_missing_or_substituted_state_evidence_stops_before_remote_reads(self):
        record = iap_state()['resources'][0]
        for resources in ([], [record, record], [dict(record, module='module.other')], [dict(record, mode='data')],
                          [dict(record, provider='different')], [dict(record, instances=[])],
                          [dict(record, instances=[dict(record['instances'][0], index_key=0)])],
                          [dict(record, instances=[dict(record['instances'][0], status='tainted')])]):
            with self.subTest(resources=resources), patch.object(recovery, 'audit') as read:
                with self.assertRaisesRegex(recovery.Stop, 'IAP_STATE_RECORD'):
                    recovery.prepare(None, None, None, None, None, {'resources': resources}, None, None)
                read.assert_not_called()

    def test_disabled_iap_and_permission_denials_remain_blockers(self):
        iap = ('serviceusage', 'v1/projects/1092405124984/services/iap.googleapis.com')
        budgets = ('billingbudgets', 'v1/billingAccounts/AAAAAA-BBBBBB-CCCCCC/budgets?pageSize=100')
        for key, reply, code in ((iap, {'state': 'DISABLED'}, 'REQUIRED_API_DISABLED'),
                                 (iap, recovery.Stop('READ_PERMISSION_DENIED'), 'READ_PERMISSION_DENIED'),
                                 (budgets, recovery.Stop('READ_PERMISSION_DENIED'), 'READ_PERMISSION_DENIED'),
                                 (('cloudbilling', 'v1/billingAccounts/AAAAAA-BBBBBB-CCCCCC:testIamPermissions'),
                                  {'permissions': ['billing.budgets.list']}, 'REQUIRED_PERMISSION_MISSING')):
            with self.subTest(key=key), self.assertRaisesRegex(recovery.Stop, code):
                recovery.reconcile(self.cloud_reader({key: reply}), fixture()[2])

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

    def test_missing_provider_log_requires_exact_create_values_in_both_saved_plans(self):
        diagnosis = {'name_error_confirmed': False, 'failures': [{'resource': 'project_iam'}]}
        after = {'workload_identity_pool_provider_id': 'github-main', 'disabled': True,
                 'display_name': 'Protected main environment controller'}
        row = {'address': recovery.PROVIDER, 'type': 'google_iam_workload_identity_pool_provider', 'after': after}
        evidence = recovery.provider_name_evidence(diagnosis, [row], [row])
        self.assertEqual((evidence['length'], evidence['maximum'], evidence['provider_error_observed']), (37, 32, False))
        for bad in ([], [row, row], [dict(row, address='other')], [dict(row, type='other')],
                    [dict(row, after=dict(after, disabled=False))], [dict(row, after=dict(after, display_name='valid'))],
                    [dict(row, after=dict(after, workload_identity_pool_provider_id='another'))]):
            for pair in ((bad, [row]), ([row], bad)):
                with self.subTest(pair=pair), self.assertRaisesRegex(recovery.Stop, 'PROVIDER_PLAN_EVIDENCE_MISMATCH'):
                    recovery.provider_name_evidence(diagnosis, *pair)
        diagnosis['failures'].append({'resource': recovery.PROVIDER})
        with self.assertRaisesRegex(recovery.Stop, 'UNRESOLVED_PROVIDER_AUDIT_ERROR'):
            recovery.provider_name_evidence(diagnosis, [row], [row])

    def test_unconfirmed_iap_role_stops_before_plan_regardless_of_name_evidence(self):
        with tempfile.TemporaryDirectory() as temp:
            with patch.object(recovery, 'command', return_value=b'{"terraform_version":"1.13.5"}'), \
                 patch.object(recovery, 'audit', return_value={'name_error_confirmed': True, 'iap_role_error_confirmed': False}), \
                 patch.object(recovery, 'reconcile', return_value={}), patch.object(recovery, 'tf') as tf:
                with self.assertRaisesRegex(recovery.Stop, 'IAP_ROLE_AUDIT_UNCONFIRMED'):
                    recovery.prepare(Path(temp), Path(temp), None, {}, {}, iap_state(), set(), None)
                tf.assert_not_called()

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
