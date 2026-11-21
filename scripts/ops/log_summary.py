#!/usr/bin/env python3
"""Summarize error metadata from the isolated Jems Cloud Logging view."""
import argparse
from collections import Counter
from datetime import datetime, timedelta, timezone
import json
import os
import subprocess
import tempfile
import urllib.error
import urllib.request

PROJECT = "family-game-factory-jzw"
VIEW = f"projects/{PROJECT}/locations/us-east5/buckets/jems-diagnostics/views/cloud-run-errors"
SERVICES = {"factory-gateway", "factory-preview", "factory-coach-private"}
LOGS = {
    "run.googleapis.com%2Frequests": "request",
    "run.googleapis.com%2Fvarlog%2Fsystem": "platform",
}
SEVERITIES = {"ERROR", "CRITICAL", "ALERT", "EMERGENCY"}


def summarize(entries):
    counts = Counter()
    for entry in entries:
        resource = entry.get("resource", {})
        service = resource.get("labels", {}).get("service_name")
        log = entry.get("logName", "").rsplit("/", 1)[-1]
        severity = entry.get("severity")
        if resource.get("type") == "cloud_run_revision" and service in SERVICES and log in LOGS and severity in SEVERITIES:
            counts[(service, LOGS[log], severity)] += 1
    return [
        {"service": service, "category": category, "severity": severity, "count": count}
        for (service, category, severity), count in sorted(counts.items())
    ]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--hours", type=int, default=2, choices=range(1, 25), metavar="1–24")
    args = parser.parse_args()
    try:
        with open(os.environ["OIC_MANIFEST_PATH"], encoding="utf-8") as stream:
            manifest = json.load(stream)
        matches = [entry for entry in manifest["connections"] if entry.get("provider_kind") == "gcp"
                   and entry.get("service_account_email") == f"jems-codex-diagnostics@{PROJECT}.iam.gserviceaccount.com"]
        if manifest.get("version") != 1 or len(matches) != 1:
            raise ValueError("Expected one managed diagnostics connection")
        # Isolate gcloud's writable cache while reusing the managed credential.
        with tempfile.TemporaryDirectory(prefix="jems-log-auth-") as config:
            env = {key: value for key, value in os.environ.items() if not key.startswith("CLOUDSDK_")
                   or key == "CLOUDSDK_CORE_CUSTOM_CA_CERTS_FILE"}
            env.update(CLOUDSDK_CONFIG=config,
                       CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE=matches[0]["credentials_file"])
            token = subprocess.check_output(["gcloud", "auth", "print-access-token", "--quiet"],
                                            env=env, stderr=subprocess.DEVNULL, text=True, timeout=30).strip()
        after = (datetime.now(timezone.utc) - timedelta(hours=args.hours)).isoformat(timespec="seconds")
        payload = {
            "resourceNames": [VIEW],
            "filter": f'timestamp >= "{after}" AND severity >= ERROR',
            "orderBy": "timestamp desc",
            "pageSize": 500,
        }
        request = urllib.request.Request(
            "https://logging.googleapis.com/v2/entries:list",
            data=json.dumps(payload).encode(),
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            result = json.load(response)
        print(json.dumps({"hours": args.hours, "truncated": bool(result.get("nextPageToken")),
                          "counts": summarize(result.get("entries", []))}))
    except (OSError, ValueError, KeyError, subprocess.SubprocessError) as error:
        code = error.code if isinstance(error, urllib.error.HTTPError) else "transport/authentication"
        raise SystemExit(f"Scoped log read failed ({code})") from None


if __name__ == "__main__":
    main()
