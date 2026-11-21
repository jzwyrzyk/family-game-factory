#!/usr/bin/env python3
"""Read-only, redacted Jems Cloud Run diagnostics using a managed GCP identity.

Raw Cloud Run metadata, including environment bindings, stays in process memory;
only allowlisted fields are emitted. Normal gcloud authentication is used, but no
Secret Manager payloads, application/child records or logs are fetched. A ready
revision does not prove provider readiness or the identity's privilege ceiling.
Exit 0: all requested metadata checks passed; 1: unhealthy/unknown service;
2: identity, dependency, authorization, transport or metadata error.
"""
import argparse
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys

PROJECT = "family-game-factory-jzw"
REGION = "us-east5"
DIAGNOSTICS_ACCOUNT = f"jems-codex-diagnostics@{PROJECT}.iam.gserviceaccount.com"
SERVICES = ("factory-gateway", "factory-preview", "factory-coach-private")
FLAGS = (
    "FACTORY_ACTIONS_APPROVED", "FACTORY_BOOTSTRAP", "FACTORY_ADULT_PILOT_MODE",
    "FACTORY_ADULT_PILOT_OWNER_APPROVED", "FACTORY_ADULT_PILOT_PROFILE_ACCESS_VERIFIED",
    "FACTORY_COACH_APPROVED", "FACTORY_COACH_PRIVACY_APPROVED",
    "FACTORY_COACH_SAFEGUARDS_APPROVED", "FACTORY_COACH_ZDR_VERIFIED",
    "FACTORY_COACH_PRIVATE_EXECUTION_APPROVED", "FACTORY_COACH_AUDIO_APPROVED",
    "FACTORY_COACH_AUDIO_PRIVACY_APPROVED", "FACTORY_COACH_AUDIO_PARENT_CONSENT_APPROVED",
)
SELECTORS = {"config_dir": "CLOUDSDK_CONFIG",
             "configuration_name": "CLOUDSDK_ACTIVE_CONFIG_NAME",
             "credentials_file": "GOOGLE_APPLICATION_CREDENTIALS"}
DIGEST = re.compile(r"(?:^|@)(sha256:[a-f0-9]{64})$")
REVISION = re.compile(r"[a-z][a-z0-9-]{0,62}")


class DiagnosticError(Exception):
    """Contains only a fixed public diagnostic, never raw subprocess output."""


def identity_environment(alias=None, environ=None):
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
    if selected.get("service_account_email") != DIAGNOSTICS_ACCOUNT:
        raise DiagnosticError("IDENTITY_OUTSIDE_SCOPE: Select the managed Jems diagnostics service account; the connection does not name the approved identity.")
    setup = selected.get("setup")
    outcome = setup if isinstance(setup, str) else (setup.get("status", setup.get("state", setup.get("outcome"))) if isinstance(setup, dict) else None)
    if isinstance(outcome, str) and outcome.lower() in {"failed", "failure", "error", "not_ready"}:
        raise DiagnosticError("IDENTITY_SETUP_FAILED: Repair the managed GCP connection before running diagnostics.")
    # gcloud does not select its CLI identity from GOOGLE_APPLICATION_CREDENTIALS
    # alone. Do not accidentally fall back to an unrelated owner CLI session.
    if not selected.get("config_dir") and not selected.get("configuration_name"):
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
    env["CLOUDSDK_CORE_DISABLE_PROMPTS"] = "1"
    env["CLOUDSDK_RUN_PLATFORM"] = "managed"
    return env


def describe(kind, name, env):
    if kind not in {"services", "revisions"} or not valid_name(kind, name):
        raise DiagnosticError("RESOURCE_OUTSIDE_SCOPE: Only the three approved Jems service families can be inspected.")
    command = ["gcloud", "run", kind, "describe", name, "--project", PROJECT,
               "--region", REGION, "--quiet", "--format=json"]
    try:
        result = subprocess.run(command, env=env, capture_output=True, text=True,
                                timeout=35, check=False, stdin=subprocess.DEVNULL)
    except subprocess.TimeoutExpired:
        raise DiagnosticError("READ_TIMEOUT: Check the managed network route and retry this read-only diagnostic.") from None
    except OSError:
        raise DiagnosticError("GCLOUD_UNAVAILABLE: Install or repair the gcloud CLI in this environment.") from None
    if result.returncode:
        error = (result.stderr or "").lower()
        if any(s in error for s in ("unauthenticated", "invalid_grant", "no active account", "do not currently have an active account", "reauthentication", "invalid authentication credentials")):
            message = "AUTHENTICATION_FAILED: Refresh the managed GCP identity connection; do not paste credentials into chat."
        elif any(s in error for s in ("permission_denied", "permission denied", "does not have permission", "forbidden")):
            message = "ACCESS_DENIED: Verify the selected identity has the approved Cloud Run metadata read grants for this service."
        elif any(s in error for s in ("not_found", "not found", "cannot find service")):
            message = "RESOURCE_UNAVAILABLE: The requested service or revision was not found or is not visible to this identity."
        else:
            message = "READ_FAILED: Check the approved identity, network route and Cloud Run API availability. Raw output is suppressed."
        raise DiagnosticError(message)
    try:
        data = json.loads(result.stdout)
    except (ValueError, TypeError):
        raise DiagnosticError("INVALID_METADATA: Cloud Run returned an unsupported response; raw output is suppressed.") from None
    if not isinstance(data, dict) or data.get("metadata", {}).get("name") != name:
        raise DiagnosticError("INVALID_METADATA: Expected metadata for the exact requested Cloud Run resource.")
    return data


def valid_name(kind, name):
    return isinstance(name, str) and (name in SERVICES if kind == "services" else
           bool(REVISION.fullmatch(name)) and any(name.startswith(s + "-") for s in SERVICES))


def ready(resource):
    conditions = resource.get("status", {}).get("conditions", [])
    values = [c.get("status") for c in conditions if isinstance(c, dict) and c.get("type") == "Ready"]
    return {"True": "ready", "False": "not_ready"}.get(values[0], "unknown") if len(values) == 1 else "unknown"


def configuration(spec):
    """Only fixed flag names, booleans and reference counts leave this function."""
    containers = spec.get("containers", [])
    if not isinstance(containers, list) or len(containers) != 1 or not isinstance(containers[0], dict):
        raise DiagnosticError("UNSUPPORTED_CONTAINER_LAYOUT: Expected exactly one Jems application container.")
    container = containers[0]
    entries = container.get("env", [])
    flags = {}
    for name in FLAGS:
        matches = [entry for entry in entries if isinstance(entry, dict) and entry.get("name") == name]
        if matches:
            value = matches[0].get("value") if len(matches) == 1 else None
            flags[name] = {"true": True, "false": False}.get(value) if isinstance(value, str) else None
    secret_env = sum(bool(e.get("valueFrom", {}).get("secretKeyRef")) for e in entries if isinstance(e, dict))
    mount_names = {m.get("name") for m in container.get("volumeMounts", []) if isinstance(m, dict)}
    mounted = [v for v in spec.get("volumes", []) if isinstance(v, dict)
               and v.get("name") in mount_names and isinstance(v.get("secret"), dict)]
    config_refs = [v for v in mounted if v["secret"].get("secretName") in
                   {"factory-gateway-private-config", "factory-preview-private-config"}]
    config_env = [e for e in entries if isinstance(e, dict) and e.get("name") == "FACTORY_PRIVATE_CONFIG"]
    image = container.get("image", "")
    match = DIGEST.search(image) if isinstance(image, str) else None
    return {"flags": flags, "declared_image_digest": match.group(1) if match else None,
            "secret_environment_references": secret_env, "mounted_secret_references": len(mounted),
            "private_config_reference_present": bool(config_refs or any(e.get("valueFrom", {}).get("secretKeyRef") for e in config_env)),
            "private_config_path_configured": bool(config_env), "private_config_contents": "not_read"}


def revision_summary(service, name, env, read):
    if not valid_name("revisions", name) or not name.startswith(service + "-"):
        raise DiagnosticError("INVALID_REVISION_REFERENCE: Cloud Run returned a revision outside the selected service.")
    data = read("revisions", name, env)
    result = {"name": name, "health": ready(data), **configuration(data.get("spec", {}))}
    raw = data.get("status", {}).get("imageDigest", "")
    match = DIGEST.search(raw) if isinstance(raw, str) else None
    result["resolved_image_digest"] = match.group(1) if match else None
    return result


def service_summary(service, data, env, read):
    status = data.get("status", {})
    generation = data.get("metadata", {}).get("generation")
    observed = status.get("observedGeneration")
    reconciled = generation == observed if type(generation) is int and type(observed) is int else None
    names = set()
    latest = {}
    for key in ("latestCreatedRevisionName", "latestReadyRevisionName"):
        value = status.get(key)
        if value is not None:
            if not valid_name("revisions", value) or not value.startswith(service + "-"):
                raise DiagnosticError("INVALID_REVISION_REFERENCE: Latest revision is outside the selected service.")
            names.add(value)
        latest[key] = value
    traffic = []
    for entry in status.get("traffic", []) or []:
        percent = entry.get("percent", 0)
        # Tagged rollback entries commonly have omitted/null percentages.
        percent = 0 if percent is None else percent
        if type(percent) is not int or not 0 <= percent <= 100:
            raise DiagnosticError("INVALID_TRAFFIC_METADATA: Cloud Run returned an invalid traffic percentage.")
        if percent == 0:
            continue
        name = entry.get("revisionName")
        if not valid_name("revisions", name) or not name.startswith(service + "-"):
            raise DiagnosticError("INVALID_REVISION_REFERENCE: Serving revision is outside the selected service.")
        traffic.append({"revision": name, "percent": percent})
        names.add(name)
    if len(names) > 12:
        raise DiagnosticError("REVISION_LIMIT_EXCEEDED: Review the unexpectedly large active revision set privately.")
    revisions = [revision_summary(service, name, env, read) for name in sorted(names)]
    health = {r["name"]: r["health"] for r in revisions}
    serving_ready = bool(traffic) and sum(t["percent"] for t in traffic) == 100 and all(health[t["revision"]] == "ready" for t in traffic)
    latest_health = health.get(latest["latestCreatedRevisionName"], "unknown")
    result = {"service": service, "health": ready(data), "configuration_reconciled": reconciled,
              **latest, "traffic": traffic, "serving_revisions_ready": serving_ready,
              "latest_created_revision_health": latest_health,
              "template": configuration(data.get("spec", {}).get("template", {}).get("spec", {})),
              "revisions": revisions}
    result["metadata_checks_passed"] = result["health"] == "ready" and reconciled is True and serving_ready and latest_health == "ready"
    return result


def report(environ=None, alias=None, self_check=False, read=describe):
    if not shutil.which("gcloud", path=(os.environ if environ is None else environ).get("PATH")):
        raise DiagnosticError("GCLOUD_NOT_INSTALLED: Install the Google Cloud CLI in this managed environment.")
    env = identity_environment(alias, environ)
    services = (SERVICES[0],) if self_check else SERVICES
    result = {"project": PROJECT, "region": REGION, "mode": "self_check" if self_check else "diagnose",
              "mutations": 0, "private_config_contents": "not_read", "logs": "not_read",
              "identity_privilege_ceiling": "not_verified",
              "scope": "Cloud Run metadata only; provider and application readiness are not verified", "services": []}
    for name in services:
        try:
            data = read("services", name, env)
            entry = {"service": name, "metadata_read": "passed"} if self_check else service_summary(name, data, env, read)
            result["services"].append(entry)
        except DiagnosticError as error:
            result["services"].append({"service": name, "error": str(error)})
    result["exit_code"] = (2 if any("error" in s for s in result["services"]) else
                           0 if self_check or all(s["metadata_checks_passed"] for s in result["services"]) else 1)
    return result


def human_report(result):
    lines = ["Jems Cloud Run diagnostics — " + result["mode"], f"Project: {PROJECT}; region: {REGION}"]
    for service in result["services"]:
        if "error" in service:
            lines.append(service["service"] + ": " + service["error"])
        elif result["mode"] == "self_check":
            lines.append(service["service"] + ": configured-connection metadata read passed; privilege ceiling not verified")
        else:
            traffic = ", ".join(f'{t["revision"]} {t["percent"]}%' for t in service["traffic"]) or "unknown"
            lines.append(f'{service["service"]}: {service["health"]}; reconciled={service["configuration_reconciled"]}; latest={service["latest_created_revision_health"]}; traffic={traffic}')
            for revision in service["revisions"]:
                lines.append(f'  {revision["name"]}: {revision["health"]}; image={revision["resolved_image_digest"] or "unknown"}; config reference={revision["private_config_reference_present"]}')
                if revision["flags"]:
                    lines.append("    " + ", ".join(f"{k}={str(v).lower() if v is not None else 'unknown'}" for k, v in revision["flags"].items()))
    lines.append("No Secret Manager payloads, application/child records or logs fetched. Metadata does not verify application/provider readiness or identity privilege limits. No cloud mutations.")
    return "\n".join(lines)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--identity-alias", help="Select an existing managed GCP outbound identity alias")
    parser.add_argument("--self-check", action="store_true", help="Check gcloud, managed identity and gateway metadata access only")
    parser.add_argument("--json", action="store_true", help="Print the redacted report as JSON")
    args = parser.parse_args(argv)
    try:
        result = report(alias=args.identity_alias, self_check=args.self_check)
    except DiagnosticError as error:
        result = {"error": str(error), "exit_code": 2, "mutations": 0}
    except (AttributeError, KeyError, TypeError, ValueError):
        result = {"error": "INVALID_METADATA: Unsupported response structure; raw output is suppressed.", "exit_code": 2, "mutations": 0}
    print(json.dumps(result, indent=2) if args.json else result["error"] if "error" in result else human_report(result))
    return result["exit_code"]


if __name__ == "__main__":
    sys.exit(main())
