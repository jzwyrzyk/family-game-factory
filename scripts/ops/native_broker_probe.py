"""Protected diagnostic workflow. Only fixed operations and bounded result fields can reach its artifact."""
import importlib.util
import json
import os
from pathlib import Path
import re
import sys
from datetime import datetime, timezone

import request_evidence as evidence

# Execute exactly the same two-target IAM client as the reviewed broker image.
source = Path(__file__).resolve().parents[2] / 'ops/request-broker/main.py'
spec = importlib.util.spec_from_file_location('request_broker', source)
broker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(broker)


def selection(env):
    if env.get('GITHUB_EVENT_NAME') == 'schedule':
        return 'request-evidence', ''
    evidence.require(env.get('GITHUB_EVENT_NAME') == 'workflow_dispatch')
    with open(env['GITHUB_EVENT_PATH'], 'rb') as f:
        raw = f.read(262145)
    evidence.require(len(raw) <= 262144)
    inputs = json.loads(raw, object_pairs_hook=evidence.unique_keys)['inputs']
    evidence.require(isinstance(inputs, dict) and set(inputs) <= set(evidence.INPUT_KEYS) | {'operation','challenge'})
    operation = inputs.get('operation', 'request-evidence')
    challenge = inputs.get('challenge', '')
    evidence.require((operation == 'request-evidence' and challenge == '') or
                     (operation == 'token-boundary' and re.fullmatch('[0-9a-f]{32}', challenge)))
    return operation, challenge


def valid_rows(rows):
    return (isinstance(rows, dict) and set(rows) == set(broker.TOKEN_TARGETS)
            and all(x in ('PRESENT','NOT_RETURNED','UNKNOWN') for x in rows.values()))


def collect(env, challenge):
    caller = broker.token_permissions(env.get('CALLER_IAM_TOKEN'))
    remote = dict.fromkeys(broker.TOKEN_TARGETS, 'UNKNOWN')
    revision = None
    if 'PRESENT' not in caller.values():
        try:
            reply = evidence.broker_query({'operation':'token-boundary'}, env.get('DIAGNOSTICS_ID_TOKEN'))
            evidence.require(isinstance(reply, dict) and set(reply) == {'operation','revision','permissions'} and
                             reply['operation'] == 'token-boundary' and valid_rows(reply['permissions']) and
                             re.fullmatch('jems-request-evidence-[a-z0-9-]{1,40}', reply['revision']))
            remote, revision = reply['permissions'], reply['revision']
        except (ValueError, TypeError, OSError, evidence.TransportFailure, evidence.http.client.HTTPException):
            pass
    return {'operation':'token-boundary', 'challenge':challenge, 'workflow':evidence.provenance(env),
            'observed_at_utc': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
            'broker_revision':revision, 'caller':caller, 'broker':remote}


def main():
    try:
        operation, challenge = selection(os.environ)
        if sys.argv[1:] == ['select']:
            with open(os.environ['GITHUB_OUTPUT'], 'a') as stream:
                print('mode=' + operation, file=stream)
            return 0
        evidence.require(sys.argv[1:] == ['probe'] and operation == 'token-boundary')
        report = collect(os.environ, challenge)
        evidence.publish(report, os.environ, show_summary=False)
        return 0 if all(outcome == 'NOT_RETURNED' for who in ('caller','broker')
                        for outcome in report[who].values()) else 1
    except (ValueError, TypeError, OSError, KeyError, RecursionError):
        return 2


if __name__ == '__main__':
    sys.exit(main())
