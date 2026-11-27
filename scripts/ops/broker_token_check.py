"""One operator-approved, caller-bound IAM check for the four diagnostic token boundaries."""
from datetime import datetime, timedelta, timezone
import re

from admin_api import Http, SetupError
import bootstrap_request_diagnostics as setup
from diagnose import DIAGNOSTICS_ACCOUNT
from production_activation import ACCOUNTS
from verify_release_access import Google, AccessError

PERMISSION = 'iam.serviceAccounts.getAccessToken'
IAM = 'https://iam.googleapis.com'
ISSUER = 'https://iamcredentials.googleapis.com'
SOURCES = (setup.CALLER, setup.BROKER)
TARGETS = (ACCOUNTS['release'], DIAGNOSTICS_ACCOUNT)
PREFIX = '//iam.googleapis.com/projects/' + setup.PROJECT + '/serviceAccounts/'


def eligible_tuple(row):
    return (row['principal'] in SOURCES and row['expected'] == 'CANNOT_ACCESS' and
            row['permission'] == PERMISSION and row['fullResourceName'] in {PREFIX + email for email in TARGETS})


def consent():
    try:
        with open('/dev/tty', 'w') as tty:
            tty.write('Existing issuance authority verified. Issue one 5-minute IAM-scoped token each for '
                      'the GitHub log reader and request broker to check their permissions? '
                      'Type APPROVE to continue: ')
            tty.flush()
        with open('/dev/tty', 'r') as tty:
            return tty.readline().strip() == 'APPROVE'
    except (OSError, ValueError):
        return False


def account_ids(admin):
    ids = {}
    for email in SOURCES + TARGETS:
        path = 'projects/' + setup.PROJECT + '/serviceAccounts/' + email
        data = admin.call('GET', 'v1/' + path + '?fields=name,email,projectId,uniqueId,disabled')
        uid = data.get('uniqueId')
        if (data.get('name') != path or data.get('email') != email or data.get('projectId') != setup.PROJECT
                or not re.fullmatch(r'[1-9][0-9]{5,30}', uid or '') or data.get('disabled', False) is not False):
            raise SetupError('ACCOUNT_IDENTITY_UNVERIFIED')
        ids[email] = uid
    if len(set(ids.values())) != len(ids):
        raise SetupError('ACCOUNT_IDENTITY_UNVERIFIED')
    return ids


def check_result(reply):
    if not isinstance(reply, dict) or set(reply) - {'permissions'}:
        raise SetupError('PERMISSION_RESPONSE_INVALID')
    if reply.get('permissions', []) == []:
        return 'CANNOT_ACCESS'
    if reply['permissions'] == [PERMISSION]:
        return 'CAN_ACCESS'
    raise SetupError('PERMISSION_RESPONSE_INVALID')


def eligibility(rows):
    if len(rows) != 4 or not all(eligible_tuple(r) for r in rows) or len({
            (r['principal'], r['fullResourceName']) for r in rows}) != 4:
        return 'TUPLES_UNVERIFIED'
    pending = [r for r in rows if not r['passed']]
    for r in pending:
        if (r['observed'] != 'UNKNOWN' or r['stage'] != 'troubleshooter' or
                r.get('error_status') != 'UNKNOWN_INFO' or set(r.get('policy_states', [])) != {
                    'ALLOW_ACCESS_STATE_UNKNOWN_INFO', 'DENY_ACCESS_STATE_NOT_DENIED',
                    'MEMBERSHIP_UNKNOWN_UNSUPPORTED', 'UNRESOLVED_MEMBER_PRINCIPAL'}):
            return 'OTHER_IAM_RESULT'
    return None


def verify(rows, operator_token, *, approve=consent):
    """Keep raw Troubleshooter observations. Never accept HTTP failures or missing targets."""
    problem = eligibility(rows)
    if problem:
        return {'status': problem, 'issuance_requests': 0}
    pending = [r for r in rows if not r['passed']]
    if not pending:
        return {'status': 'DIRECT_CHECK_UNNEEDED', 'issuance_requests': 0}
    sources = sorted({r['principal'] for r in pending})
    outcome = {'status': 'ACCOUNT_IDENTITY_UNVERIFIED', 'issuance_requests': 0}
    try:
        admin = Http(IAM, operator_token, {'x-goog-user-project': setup.PROJECT})
        ids = account_ids(admin)
        base = 'v1/projects/' + setup.PROJECT + '/serviceAccounts/'
        outcome['status'] = 'ADMIN_ISSUANCE_AUTHORITY_UNVERIFIED'
        for email in sources:
            reply = admin.call('POST', base + ids[email] + ':testIamPermissions', {'permissions': [PERMISSION]})
            if check_result(reply) != 'CAN_ACCESS':
                outcome['status'] = 'ADMIN_ISSUANCE_AUTHORITY_ABSENT'
                return outcome
        outcome['status'] = 'ISSUANCE_NOT_APPROVED'
        if not approve():
            return outcome
        issuer = Http(ISSUER, operator_token, {'x-goog-user-project': setup.PROJECT})
        answers = {}
        for email in sources:
            outcome['status'] = 'ISSUANCE_UNVERIFIED'
            outcome['issuance_requests'] += 1
            issued = issuer.call('POST', 'v1/projects/-/serviceAccounts/' + ids[email] + ':generateAccessToken',
                                 {'scope': ['https://www.googleapis.com/auth/iam'], 'lifetime': '300s'})
            expires = datetime.fromisoformat(issued['expireTime'].replace('Z', '+00:00'))
            now = datetime.now(timezone.utc)
            if not now < expires <= now + timedelta(seconds=305):
                return outcome
            caller = Google(issued.pop('accessToken'))
            outcome['status'] = 'SUBJECT_PERMISSION_RESPONSE_UNVERIFIED'
            for r in pending:
                if r['principal'] == email:
                    target = r['fullResourceName'].removeprefix(PREFIX)
                    url = IAM + '/' + base + ids[target] + ':testIamPermissions'
                    answers[r['row']] = check_result(caller.permissions(url, [PERMISSION]))
                    if answers[r['row']] == 'CAN_ACCESS':
                        r.update(troubleshooter_status=r.pop('error_status'), troubleshooter_observed='UNKNOWN',
                                 observed='CAN_ACCESS', passed=False, stage='subject_test_iam_permissions',
                                 principal_unique_id=ids[email], target_unique_id=ids[target])
                        outcome['status'] = 'UNEXPECTED_TOKEN_CREATION_PERMISSION'
                        return outcome
            del caller
        outcome['status'] = 'ACCOUNT_IDENTITY_CHANGED_OR_UNVERIFIED'
        if account_ids(admin) != ids:
            return outcome
        for r in pending:
            r['troubleshooter_status'] = r.pop('error_status')
            r['troubleshooter_observed'] = r['observed']
            r['observed'] = answers[r['row']]
            r['passed'] = r['observed'] == r['expected']
            r['stage'] = 'subject_test_iam_permissions'
            r['principal_unique_id'] = ids[r['principal']]
            r['target_unique_id'] = ids[r['fullResourceName'].removeprefix(PREFIX)]
        outcome.update(status='SUBJECT_PERMISSIONS_EVALUATED', verified_rows=sorted(answers))
    except (SetupError, AccessError, OSError, ValueError, TypeError, AttributeError, KeyError) as exc:
        status = getattr(exc.__context__, 'code', None)
        if type(status) is int and 400 <= status <= 599:
            outcome['http_status'] = status
    return outcome
