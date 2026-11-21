#!/usr/bin/env python3
"""Read bounded error counts from the fixed Jems Cloud Logging view.

Use the normal managed gcloud connection without extracting a token or resetting
authentication configuration. Only fixed category counts leave this process;
the CLI projection excludes payloads and marks resource output private.
"""
import argparse
from collections import Counter
from datetime import datetime, timedelta, timezone
import json
import os
import shutil
import subprocess
import sys

from diagnose import DiagnosticError, PROJECT, REGION, identity_environment

VIEW = f"projects/{PROJECT}/locations/{REGION}/buckets/jems-diagnostics/views/cloud-run-errors"
SERVICES = {"factory-gateway", "factory-preview", "factory-coach-private"}
LOGS = {
    f"projects/{PROJECT}/logs/run.googleapis.com%2Frequests": "request",
    f"projects/{PROJECT}/logs/run.googleapis.com%2Fvarlog%2Fsystem": "platform",
}
SEVERITIES = {"ERROR", "CRITICAL", "ALERT", "EMERGENCY"}
SAMPLE_LIMIT = 500
MAX_RESPONSE_BYTES = 4_000_000
FORMAT = "json[private](resource.type,resource.labels.project_id,resource.labels.location,resource.labels.service_name,logName,severity)"


def summarize(entries):
    if not isinstance(entries, list):
        raise DiagnosticError("INVALID_LOG_METADATA: Expected a bounded list; raw output is suppressed.")
    counts = Counter()
    for entry in entries:
        if not isinstance(entry, dict) or not isinstance(entry.get("resource"), dict):
            raise DiagnosticError("INVALID_LOG_METADATA: Unsupported entry structure; raw output is suppressed.")
        resource = entry["resource"]
        labels = resource.get("labels")
        if (not isinstance(labels, dict) or not isinstance(resource.get("type"), str)
                or not isinstance(entry.get("logName"), str) or not isinstance(entry.get("severity"), str)
                or any(not isinstance(labels.get(key), str) for key in ("project_id", "location", "service_name"))):
            raise DiagnosticError("INVALID_LOG_METADATA: Unsupported projected fields; raw output is suppressed.")
        service = labels["service_name"]
        log = entry["logName"]
        severity = entry["severity"]
        if (resource["type"] == "cloud_run_revision" and labels["project_id"] == PROJECT
                and labels["location"] == REGION and service in SERVICES and log in LOGS and severity in SEVERITIES):
            counts[(service, LOGS[log], severity)] += 1
    return [
        {"service": service, "category": category, "severity": severity, "count": count}
        for (service, category, severity), count in sorted(counts.items())
    ]


def log_filter(hours, now):
    after = (now.astimezone(timezone.utc) - timedelta(hours=hours)).isoformat(timespec="seconds")
    fixed = [f'timestamp >= "{after}"', "severity >= ERROR", 'resource.type = "cloud_run_revision"',
             f'resource.labels.project_id = "{PROJECT}"', f'resource.labels.location = "{REGION}"',
             "(" + " OR ".join(f'resource.labels.service_name = "{name}"' for name in sorted(SERVICES)) + ")",
             "(" + " OR ".join(f'logName = "{name}"' for name in sorted(LOGS)) + ")"]
    return " AND ".join(fixed)


def read_summary(hours=2, *, alias=None, environ=None, now=None):
    if type(hours) is not int or not 1 <= hours <= 24:
        raise DiagnosticError("INVALID_TIME_WINDOW: Select a window from 1 through 24 hours.")
    inherited = os.environ if environ is None else environ
    if not shutil.which("gcloud", path=inherited.get("PATH")):
        raise DiagnosticError("GCLOUD_NOT_INSTALLED: Install the Google Cloud CLI in this managed environment.")
    env = identity_environment(alias, inherited)
    instant = now if now is not None else datetime.now(timezone.utc)
    command = ["gcloud", "logging", "read", log_filter(hours, instant),
               f"--resource-names={VIEW}", f"--project={PROJECT}",
               f"--limit={SAMPLE_LIMIT + 1}", "--order=desc", "--quiet", f"--format={FORMAT}"]
    try:
        result = subprocess.run(command, env=env, capture_output=True, text=True,
                                timeout=40, check=False, stdin=subprocess.DEVNULL)
    except subprocess.TimeoutExpired:
        raise DiagnosticError("READ_TIMEOUT: Check the approved Logging route and retry this read-only query.") from None
    except OSError:
        raise DiagnosticError("GCLOUD_UNAVAILABLE: Install or repair the Google Cloud CLI in this environment.") from None
    if result.returncode:
        error = (result.stderr or "")[:4096].lower()
        if any(value in error for value in ("unauthenticated", "invalid_grant", "no active account",
                                           "do not currently have an active account", "reauthentication",
                                           "invalid authentication credentials")):
            message = "AUTHENTICATION_FAILED: Refresh the selected managed GCP connection; do not paste credentials into chat."
        elif any(value in error for value in ("permission_denied", "permission denied", "does not have permission", "forbidden")):
            message = "ACCESS_DENIED: Verify the approved view-only Logging grant for the selected identity; do not broaden it to project-wide log access."
        elif any(value in error for value in ("not_found", "not found")):
            message = "LOG_VIEW_UNAVAILABLE: The fixed Jems diagnostic view is absent or not visible to this identity."
        else:
            message = "READ_FAILED: Check the managed identity, approved Logging route and API availability. Raw output is suppressed."
        raise DiagnosticError(message)
    if not isinstance(result.stdout, str) or len(result.stdout.encode("utf-8")) > MAX_RESPONSE_BYTES:
        raise DiagnosticError("LOG_RESPONSE_TOO_LARGE: The bounded projected response exceeded its limit; raw output is suppressed.")
    try:
        entries = json.loads(result.stdout)
    except (ValueError, TypeError):
        raise DiagnosticError("INVALID_LOG_METADATA: Unsupported projected JSON; raw output is suppressed.") from None
    if not isinstance(entries, list) or len(entries) > SAMPLE_LIMIT + 1:
        raise DiagnosticError("INVALID_LOG_METADATA: The response exceeded the requested entry bound; raw output is suppressed.")
    # Validate the sentinel too, but never include it in the returned counts.
    summarize(entries)
    return {"project": PROJECT, "view": VIEW, "hours": hours, "sample_limit": SAMPLE_LIMIT,
            "truncated": len(entries) > SAMPLE_LIMIT, "counts": summarize(entries[:SAMPLE_LIMIT]),
            "identity_account_verification": "not_verified", "identity_privilege_ceiling": "not_verified",
            "mutations": 0, "exit_code": 0}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--hours", type=int, default=2, choices=range(1, 25), metavar="1–24")
    parser.add_argument("--identity-alias", help="Select an existing managed GCP outbound identity alias")
    args = parser.parse_args(argv)
    try:
        result = read_summary(args.hours, alias=args.identity_alias)
    except DiagnosticError as error:
        result = {"error": str(error), "exit_code": 2, "mutations": 0,
                  "identity_account_verification": "not_verified", "identity_privilege_ceiling": "not_verified"}
    except (AttributeError, KeyError, TypeError, ValueError):
        result = {"error": "INVALID_LOG_METADATA: Unsupported response structure; raw output is suppressed.",
                  "exit_code": 2, "mutations": 0,
                  "identity_account_verification": "not_verified", "identity_privilege_ceiling": "not_verified"}
    print(json.dumps(result, sort_keys=True))
    return result["exit_code"]


if __name__ == "__main__":
    sys.exit(main())
