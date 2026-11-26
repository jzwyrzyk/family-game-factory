"""Managed SDK identity selection; legacy diagnose.py is frozen by release approval.

Use documented manifest fields only. Preserve proxy/guard selectors, reject ambient
credential ambiguity, and never edit/copy managed credential files or invoke a CLI.
"""
import json
import os
from pathlib import Path
from diagnose import DiagnosticError, DIAGNOSTICS_ACCOUNT, SELECTORS


def identity_environment(alias=None, environ=None, *, require_cli=False):
    env = dict(os.environ if environ is None else environ)
    path = env.get("OIC_MANIFEST_PATH")
    if not path:
        raise DiagnosticError("IDENTITY_NOT_CONFIGURED: Connect the approved GCP outbound identity to this environment; OIC_MANIFEST_PATH is missing.")
    try:
        manifest = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        raise DiagnosticError("IDENTITY_MANIFEST_UNREADABLE: Refresh the managed outbound identity connection.") from None
    if (not isinstance(manifest, dict) or type(manifest.get("version")) is not int
            or manifest["version"] != 1 or not isinstance(manifest.get("connections"), list)):
        raise DiagnosticError("IDENTITY_MANIFEST_UNSUPPORTED: A version-1 connections manifest is required.")
    candidates = [c for c in manifest["connections"] if isinstance(c, dict)
                  and str(c.get("provider_kind", "")).lower() == "gcp"]
    if alias:
        candidates = [c for c in candidates if c.get("alias") == alias]
    elif len(candidates) > 1:
        candidates = [c for c in candidates if c.get("is_default") is True]
    if len(candidates) != 1:
        raise DiagnosticError("IDENTITY_SELECTION_REQUIRED: Select a configured GCP identity with --identity-alias; no unique requested/default identity was found.")
    selected = candidates[0]
    if not isinstance(selected.get("alias"), str) or not selected["alias"]:
        raise DiagnosticError("IDENTITY_MANIFEST_UNSUPPORTED: The GCP connection has no alias.")
    # The provider documents managed selectors, not a required account field.
    # Honor an optional declaration if present without treating it as live proof.
    if "service_account_email" in selected and selected["service_account_email"] != DIAGNOSTICS_ACCOUNT:
        raise DiagnosticError("IDENTITY_OUTSIDE_SCOPE: The selected connection declares an unexpected diagnostics service account.")
    setup = selected.get("setup")
    outcome = setup if isinstance(setup, str) else (setup.get("status", setup.get("state", setup.get("outcome"))) if isinstance(setup, dict) else None)
    if isinstance(outcome, str) and outcome.lower() in {"failed", "failure", "error", "not_ready"}:
        raise DiagnosticError("IDENTITY_SETUP_FAILED: Repair the managed GCP connection before running diagnostics.")
    # gcloud does not select its CLI identity from GOOGLE_APPLICATION_CREDENTIALS
    # alone. Do not accidentally fall back to an unrelated owner CLI session.
    if require_cli and not selected.get("config_dir") and not selected.get("configuration_name"):
        raise DiagnosticError("IDENTITY_CLI_SELECTOR_MISSING: The GCP connection must supply config_dir or configuration_name for gcloud.")
    # Preserve managed bindings; reject ambiguity instead of clearing an auth
    # guard or silently allowing an ambient account to override this selection.
    unverified = ("CLOUDSDK_CORE_ACCOUNT", "CLOUDSDK_AUTH_ACCESS_TOKEN",
                  "CLOUDSDK_AUTH_ACCESS_TOKEN_FILE", "CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT")
    if any(env.get(key) for key in unverified) or any(
            key.startswith("CLOUDSDK_API_ENDPOINT_OVERRIDES_") and value for key, value in env.items()):
        raise DiagnosticError("IDENTITY_OVERRIDE_UNVERIFIED: Reconcile inherited account, token, impersonation or endpoint overrides in the managed connection settings.")
    credential_override = env.get("CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE")
    if credential_override and credential_override != selected.get("credentials_file"):
        raise DiagnosticError("IDENTITY_OVERRIDE_UNVERIFIED: The inherited credential override does not match the selected connection.")
    for source, target in SELECTORS.items():
        value = selected.get(source)
        if value is None and env.get(target):
            raise DiagnosticError("IDENTITY_SELECTOR_AMBIGUOUS: An inherited selector is not described by the selected connection; reconcile the managed connection settings.")
        if value is not None:
            if not isinstance(value, str) or not value or "\x00" in value:
                raise DiagnosticError("IDENTITY_SELECTOR_INVALID: Refresh the managed GCP connection.")
            env[target] = value
    if not require_cli and not selected.get("credentials_file"):
        raise DiagnosticError("IDENTITY_SDK_SELECTOR_MISSING: The managed connection must supply credentials_file for SDK authentication.")
    env["JEMS_DIAGNOSTIC_IDENTITY_ALIAS"] = selected["alias"]
    env["CLOUDSDK_CORE_DISABLE_PROMPTS"] = "1"
    env["CLOUDSDK_RUN_PLATFORM"] = "managed"
    return env

