#!/usr/bin/env python3
"""Read-only metadata for the two production chat services and recent requests.

Uses the operator's existing gcloud authentication. Reads only Cloud Run service
and revision descriptions plus bounded Cloud Logging request metadata. It never
reads Secret Manager values, the mounted gateway configuration, request bodies,
or provider responses, and performs no service change or inference request.

Only explicit revision environment settings are reported. An absent setting is
unknown here: the image or application may supply a default. Request status 200
does not establish that the status response contained available:true.
"""

from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
import json
import re
import subprocess
from urllib.parse import urlsplit

PROJECT = "family-game-factory-jzw"
REGION = "us-east5"
SERVICES = ("factory-gateway", "factory-coach-private")
FLAGS = (
    "FACTORY_ADULT_PILOT_MODE", "FACTORY_ADULT_PILOT_OWNER_APPROVED",
    "FACTORY_ADULT_PILOT_PROFILE_ACCESS_VERIFIED", "FACTORY_COACH_APPROVED",
    "FACTORY_COACH_PRIVACY_APPROVED", "FACTORY_COACH_SAFEGUARDS_APPROVED",
    "FACTORY_COACH_ZDR_VERIFIED", "FACTORY_COACH_PRIVATE_EXECUTION_APPROVED",
    "FACTORY_COACH_AUDIO_APPROVED",
)
NUMBERS = (
    "FACTORY_COACH_INPUT_CHARS", "FACTORY_COACH_OUTPUT_TOKENS",
    "FACTORY_COACH_MAX_MICRO_USD", "FACTORY_COACH_INPUT_PRICE",
    "FACTORY_COACH_OUTPUT_PRICE",
)
PATHS = {
    "/v1/coach", "/v1/coach/status", "/v1/private-coach/complete",
    "/v1/private-coach/status",
}
UNREPORTED = "unknown_image_or_runtime_default"


def cloud(*args):
    result = subprocess.run(
        ["gcloud", *args, "--project=" + PROJECT, "--format=json", "--quiet"],
        capture_output=True, text=True, timeout=45,
    )
    if result.returncode:
        # gcloud stderr may contain private configuration or credentials.
        raise RuntimeError("CLOUD_READ_FAILED")
    return json.loads(result.stdout)


def settings(entries):
    def literal(name):
        matches = [entry for entry in entries if entry.get("name") == name]
        if not matches:
            return None, UNREPORTED
        if len(matches) != 1:
            return None, "ambiguous_revision_entries"
        if matches[0].get("valueFrom"):
            return None, "referenced_value_not_read"
        value = matches[0].get("value")
        return (value, "explicit_literal") if isinstance(value, str) else (None, "unparsed_literal")

    output = {}
    for key in FLAGS:
        value, source = literal(key)
        output[key] = value if value in ("true", "false") else source if value is None else "unparsed_literal"
    for key in NUMBERS:
        value, source = literal(key)
        output[key] = source if value is None else "unparsed_literal"
        if value is not None:
            try:
                number = Decimal(value)
                if number.is_finite() and abs(number) <= 9007199254740991 and number == number.to_integral_value():
                    output[key] = int(number)
            except (InvalidOperation, ValueError):
                pass
    model, source = literal("FACTORY_COACH_MODEL")
    output["FACTORY_COACH_MODEL"] = (
        model if model is not None and re.fullmatch(r"[A-Za-z0-9._-]{1,100}", model)
        else source if model is None else "unparsed_literal"
    )
    reviewed, source = literal("FACTORY_COACH_PRICES_REVIEWED")
    output["FACTORY_COACH_PRICES_REVIEWED"] = source if reviewed is None else "unparsed_literal"
    if reviewed is not None:
        try:
            output["FACTORY_COACH_PRICES_REVIEWED"] = datetime.fromisoformat(reviewed.replace("Z", "+00:00")).isoformat()
        except ValueError:
            pass
    keys = [entry for entry in entries if entry.get("name") == "FACTORY_COACH_PRIVATE_OPENAI_API_KEY"]
    reference = ((keys[0].get("valueFrom") or {}).get("secretKeyRef") or {}) if len(keys) == 1 else {}
    output["coachKeyMount"] = {
        "entryCount": len(keys),
        "secretReferencePresent": bool(reference.get("name")),
        "numericVersionPinned": bool(re.fullmatch(r"[1-9][0-9]*", str(reference.get("key", "")))),
        "literalValuePresent": any("value" in entry for entry in keys),
    }
    return output


def inspect():
    report = {
        "project": PROJECT, "region": REGION, "readOnly": True,
        "observedAtUtc": datetime.now(timezone.utc).isoformat(),
        "configurationScope": "Explicit serving-revision env only; image/runtime defaults, mounted configuration and secret values are not read.",
        "services": [],
    }
    for service in SERVICES:
        item = {"service": service, "serving": []}
        try:
            description = cloud("run", "services", "describe", service, "--region=" + REGION)
            annotations = description.get("metadata", {}).get("annotations", {})
            ingress = annotations.get("run.googleapis.com/ingress")
            item["ingress"] = ingress if ingress in ("all", "internal", "internal-and-cloud-load-balancing") else "unreported"
            active = {}
            for target in description.get("status", {}).get("traffic", []):
                percent, revision = target.get("percent", 0), target.get("revisionName", "")
                if type(percent) is int and percent > 0:
                    if not re.fullmatch(re.escape(service) + r"-[a-z0-9-]{1,63}", revision):
                        raise RuntimeError("SERVING_REVISION_UNRESOLVED")
                    active[revision] = active.get(revision, 0) + percent
            if not active or len(active) > 4:
                raise RuntimeError("SERVING_TRAFFIC_NOT_BOUNDED")
            item["trafficTotalPercent"] = sum(active.values())
            for revision, percent in sorted(active.items()):
                described = cloud("run", "revisions", "describe", revision, "--region=" + REGION)
                containers = described.get("spec", {}).get("containers", [])
                if len(containers) != 1:
                    raise RuntimeError("UNEXPECTED_CONTAINER_LAYOUT")
                revision_annotations = described.get("metadata", {}).get("annotations", {})
                egress = revision_annotations.get("run.googleapis.com/vpc-access-egress")
                item["serving"].append({
                    "revision": revision, "percent": percent,
                    "vpcEgress": egress if egress in ("all-traffic", "private-ranges-only") else "unreported",
                    "vpcConnectorPresent": bool(revision_annotations.get("run.googleapis.com/vpc-access-connector")),
                    "directVpcPresent": bool(revision_annotations.get("run.googleapis.com/network-interfaces")),
                    "settings": settings(containers[0].get("env", [])),
                })
        except Exception:
            item["error"] = "SERVICE_METADATA_READ_FAILED"
        report["services"].append(item)

    query = (
        'resource.type="cloud_run_revision" AND '
        'resource.labels.location="' + REGION + '" AND '
        '(resource.labels.service_name="factory-gateway" OR resource.labels.service_name="factory-coach-private") AND '
        'logName="projects/' + PROJECT + '/logs/run.googleapis.com%2Frequests" AND '
        '(httpRequest.requestMethod="GET" OR httpRequest.requestMethod="POST") AND '
        'httpRequest.requestUrl=~"/v1/(coach|coach/status|private-coach/complete|private-coach/status)$"'
    )
    try:
        entries = cloud("logging", "read", query, "--freshness=2h", "--limit=500", "--order=desc")
        posts, status_reads, per_status = [], [], {}
        for entry in entries:
            request = entry.get("httpRequest", {})
            labels = entry.get("resource", {}).get("labels", {})
            path = urlsplit(request.get("requestUrl", "")).path
            service = labels.get("service_name")
            if path not in PATHS or service not in SERVICES or labels.get("location") != REGION:
                continue
            row = {
                "at": entry.get("timestamp"), "service": service,
                "revision": labels.get("revision_name"),
                "method": request.get("requestMethod"), "path": path,
                "status": request.get("status"), "latency": request.get("latency"),
            }
            if row["method"] == "POST" and len(posts) < 30:
                posts.append(row)
            elif row["method"] == "GET" and per_status.get((service, path), 0) < 4:
                status_reads.append(row)
                per_status[(service, path)] = per_status.get((service, path), 0) + 1
        report["requests"] = {
            "window": "2h", "queryLimitReached": len(entries) == 500,
            "lastChatPosts": posts, "latestStatusGets": status_reads,
            "statusBodyAvailableNotObserved": True,
        }
    except Exception:
        report["requests"] = {"error": "REQUEST_METADATA_READ_FAILED"}
    return report


def main():
    report = inspect()
    print(json.dumps(report, indent=2))
    return 2 if "error" in report["requests"] or any("error" in item for item in report["services"]) else 0


if __name__ == "__main__":
    raise SystemExit(main())
