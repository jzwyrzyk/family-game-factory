"""Finite semantic model of the documented filter subset, not provider acceptance."""
import itertools
import json
import re
import unittest

import operational_recovery as recovery
import test_request_broker as runtime_tests

broker = runtime_tests.broker


def parse_filter(text):
    tokens = re.findall(r'"(?:[^"\\]|\\.)*"|[A-Za-z_][A-Za-z0-9_.]*|=~|[=()]|\S', text)
    pos = 0

    def take(expected=None):
        nonlocal pos
        value = tokens[pos]; pos += 1
        if expected is not None and value != expected: raise ValueError('unexpected token')
        return value

    def atom():
        if tokens[pos] == '(':
            take('('); result = conjunction(); take(')'); return result
        name = take()
        if tokens[pos] == '(':
            take('('); value = json.loads(take()); take(')')
            if name not in ('source', 'log_id'): raise ValueError('unexpected function')
            return ('=', name, value)
        operator, value = take(), json.loads(take())
        if operator not in ('=', '=~'): raise ValueError('unexpected operator')
        return (operator, name, value)

    # Logging query language gives OR precedence over AND; explicit groups
    # in the historical expression preserve the intended service alternatives.
    def disjunction():
        terms = [atom()]
        while pos < len(tokens) and tokens[pos] == 'OR': take('OR'); terms.append(atom())
        return ('OR', terms) if len(terms) > 1 else terms[0]

    def conjunction():
        terms = [disjunction()]
        while pos < len(tokens) and tokens[pos] == 'AND': take('AND'); terms.append(disjunction())
        return ('AND', terms) if len(terms) > 1 else terms[0]

    tree = conjunction()
    if pos != len(tokens): raise ValueError('trailing tokens')
    return tree


def matches(tree, fields):
    operator = tree[0]
    if operator == 'AND': return all(matches(t, fields) for t in tree[1])
    if operator == 'OR': return any(matches(t, fields) for t in tree[1])
    value = fields.get(tree[1])
    if not isinstance(value, str): return False
    if operator == '=': return value == tree[2]
    # This candidate uses only literal ASCII alternatives and full-string anchors,
    # common to RE2 and Python. No lookaround/backreference/case-folding emulation.
    return re.fullmatch(tree[2], value) is not None


class FilterContractTests(unittest.TestCase):
    def test_flat_filter_preserves_all_restrictions_and_rejects_near_match_services(self):
        previous = parse_filter(recovery.FAILED_BUILD_VIEW_FILTER)
        current = parse_filter(broker.VIEW_FILTER)
        self.assertEqual(current[0], 'AND')
        self.assertEqual(len(current[1]), 5)
        self.assertTrue(all(t[0] in ('=', '=~') for t in current[1]))
        expected = {
            'source': 'projects/family-game-factory-jzw',
            'log_id': 'run.googleapis.com/requests',
            'resource.type': 'cloud_run_revision',
            'resource.labels.location': 'us-east5',
        }
        services = ['factory-gateway', 'factory-preview', 'factory-coach-private']
        candidates = services + ['other', 'factory-gateway-extra', 'x-factory-preview',
            'FACTORY-GATEWAY', 'factory-coach-private\n', 'factory-gateway|other', '', None]
        keys = list(expected)
        for combination in itertools.product(*[[expected[k], 'other', None] for k in keys], candidates):
            fields = dict(zip([*keys, 'resource.labels.service_name'], combination))
            intended = all(fields[k] == expected[k] for k in keys) and combination[-1] in services
            self.assertEqual(matches(previous, fields), intended)
            self.assertEqual(matches(current, fields), intended)

    def test_old_filter_and_unanchored_alternatives_remain_runtime_configuration_failures(self):
        fixture = runtime_tests.BrokerTests(); fixture.setUp()
        for value in (recovery.FAILED_BUILD_VIEW_FILTER,
                      broker.VIEW_FILTER.replace('^(factory-', '(factory-'),
                      broker.VIEW_FILTER.replace('private)$', 'private|other)$')):
            fixture.factory.side_effect = None
            fixture.factory.return_value = fixture.reader
            fixture.reader.read_view.return_value = {'name': 'projects/' + broker.PROJECT +
                '/locations/global/buckets/_Default/views/jems-production-requests',
                'filter': value, 'updateTime': '2026-11-24T02:50:00Z'}
            result = fixture.run_pages([{}])
            self.assertEqual(result['reason'], 'CONFIG_UNVERIFIED')
            fixture.reader.page.assert_not_called()


if __name__ == '__main__': unittest.main()
