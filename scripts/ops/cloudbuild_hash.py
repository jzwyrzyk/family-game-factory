"""Strict Cloud Build SHA-256 serialization: REST base64 or gcloud URL-safe base64."""
import base64
import re


def sha256_bytes(value):
    # gcloud's documented build output uses URL-safe base64; REST uses base64.
    # Accept canonical padded representations only, never arbitrary hex or text.
    if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9+/_-]{43}=', value):
        raise ValueError('PROVENANCE_SHA256_ENCODING_INVALID')
    raw = base64.b64decode(value, altchars=b'-_', validate=True)
    if len(raw) != 32 or value not in (base64.b64encode(raw).decode(), base64.urlsafe_b64encode(raw).decode()):
        raise ValueError('PROVENANCE_SHA256_ENCODING_INVALID')
    return raw


def exact_sha256(values, expected):
    if not isinstance(values, list): return False
    rows = [row for row in values if isinstance(row, dict) and row.get('type') == 'SHA256']
    if len(rows) != 1 or set(rows[0]) != {'type', 'value'}: return False
    try: return sha256_bytes(rows[0]['value']) == bytes.fromhex(expected)
    except (ValueError, TypeError): return False
