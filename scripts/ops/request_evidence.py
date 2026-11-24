"""Validate one protected workflow request and publish its bounded broker evidence."""
from collections import Counter
from datetime import datetime, timedelta, timezone
import http.client
import json
import os
from pathlib import Path
import re
import sys

from diagnose import PROJECT, REGION

BROKER_HOST = "jems-request-evidence-1054529152893.us-east5.run.app"
OUTPUT = Path("diagnostics-output/report.json")
MAX_BYTES = 512 * 1024
MAX_ROWS = 1000
INPUT_KEYS = ("service", "revision", "start_utc", "end_utc")
ROUTES = {
    "factory-gateway": frozenset(("/health", "/v1/coach", "/v1/coach/status", "/v1/coach/erase",
                                 "/v1/coach/audio", "/v1/coach/audio/status", "/v1/coach/narration",
                                 "/v1/coach/narration/status", "[other]")),
    "factory-preview": frozenset(("/health", "/preview/{id}", "[other]")),
    "factory-coach-private": frozenset(("/v1/private-coach/complete", "/v1/private-coach/status",
                                       "/v1/private-coach/audio", "/v1/private-coach/audio/status",
                                       "/v1/private-coach/narration", "/v1/private-coach/narration/status",
                                       "[other]")),
}
METHODS = {"GET", "HEAD", "POST", "PUT", "DELETE", "OPTIONS", "PATCH", "CONNECT", "TRACE"}
# Exact pre-controller revision names documented by the production release receipts.
LEGACY_SELECTORS = {
    "factory-gateway-pr115-19f5e46ae114-fb5fa6", "factory-gateway-workerpin-dddf53db-mwq1mbz7-e99f",
    "factory-coach-private-chatready-1996c1b382a7-9c98a0", "factory-coach-private-chatdiag-b4734b1323de-a14b8b",
    "factory-coach-private-pr115-19f5e46ae114-fb5fa6",
}
COMPLETIONS = {"factory-gateway": "/v1/coach", "factory-coach-private": "/v1/private-coach/complete"}
ROW_KEYS = {"timestamp_utc", "service", "revision", "method", "route", "status"}
FLAGS = {"pagination_exhausted", "truncated", "permissions_verified", "coverage_verified", "ingestion_delay_assessed"}
BROKER_REASONS = {
    "COMPLETE": {"OK"},
    "INCOMPLETE": {"COVERAGE_UNVERIFIED", "INGESTION_DELAY", "ROW_LIMIT", "PAGINATION_INVALID", "INVALID_METADATA", "TIMEOUT"},
    "UNAVAILABLE": {"COVERAGE_UNVERIFIED", "CONFIG_UNVERIFIED", "PERMISSION_DENIED", "SOURCE_UNAVAILABLE"},
    "NOT_CHECKED": {"INVALID_SCOPE"},
}
SECOND = r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}"
GROUP_KEYS = ("service", "revision", "method", "route", "status")


class InvalidEvidence(ValueError):
    pass


def require(condition):
    if not condition:
        raise InvalidEvidence()


def utc(value, fractional=False):
    pattern = SECOND + (r"(?:\.[0-9]{1,9})?" if fractional else "") + "Z"
    require(isinstance(value, str) and re.fullmatch(pattern, value, re.ASCII))
    # Scope boundaries have whole-second precision. Keep all original row timestamp
    # digits in the report, including the nanoseconds datetime would discard.
    return datetime.strptime(value[:19], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc)


def valid_revision(service, revision):
    return (isinstance(revision, str) and len(revision) <= 63
            and re.fullmatch(re.escape(service) + r"-[a-z0-9](?:[a-z0-9-]*[a-z0-9])?", revision))


def allowed_selector(service, revision):
    # A caller-controlled label is public even on a denied request. Accept only
    # release hashes, native revision numbers, or a previously published exact name.
    return valid_revision(service, revision) and (revision in LEGACY_SELECTORS or re.fullmatch(
        re.escape(service) + r"-(?:r-[0-9a-f]{20}|[0-9]{5}-[a-z0-9]{3})", revision))


def query_scope(env, now):
    if env.get("GITHUB_EVENT_NAME") == "workflow_dispatch":
        # GitHub logs inline step env assignments. Read dispatch inputs from the
        # runner's event file so rejected caller text never appears in a step header.
        with open(env["GITHUB_EVENT_PATH"], "rb") as stream:
            data = stream.read(256 * 1024 + 1)
        require(len(data) <= 256 * 1024)
        inputs = json.loads(data)["inputs"]
        require(isinstance(inputs, dict) and set(inputs) <= set(INPUT_KEYS))
    else:
        inputs = {key: env.get("INPUT_" + key.upper(), "") for key in INPUT_KEYS}
    service = inputs["service"]
    revision = inputs.get("revision", "")
    require(service in ROUTES and (revision == "" or allowed_selector(service, revision)))
    start = utc(inputs["start_utc"])
    end = utc(inputs["end_utc"])
    require(timedelta(0) < end - start <= timedelta(hours=1) and end <= now)
    return {"service": service, "revision": revision or None,
            "start_utc": inputs["start_utc"], "end_utc": inputs["end_utc"]}


def provenance(env):
    run = env.get("GITHUB_RUN_ID", "")
    attempt = env.get("GITHUB_RUN_ATTEMPT", "")
    sha = env.get("GITHUB_SHA", "")
    if all(re.fullmatch(r"[1-9][0-9]{0,19}", value) for value in (run, attempt)) and re.fullmatch("[a-f0-9]{40}", sha):
        return {"run_id": run, "attempt": attempt, "workflow_source_sha": sha}
    return None


def initial_report(scope, env, now):
    return {"schema_version": 1, "project": PROJECT, "region": REGION, "query_status": "NOT_CHECKED",
            "reason": "NOT_STARTED" if scope else "INVALID_SCOPE", "scope": scope,
            "observed_at_utc": now.strftime("%Y-%m-%dT%H:%M:%SZ"), "workflow": provenance(env),
            "coverage": None, "completeness": dict.fromkeys(sorted(FLAGS)), "requests": [], "counts": None}


def counts_for(rows):
    classes = {label: 0 for label in ("http_1xx", "http_2xx", "http_3xx", "http_4xx", "http_5xx",
                                      "coach_2xx", "coach_4xx", "coach_5xx")}
    groups = Counter()
    for row in rows:
        category = str(row["status"] // 100) + "xx"
        classes["http_" + category] += 1
        if (row["method"] == "POST" and row["route"] == COMPLETIONS.get(row["service"])
                and category in ("2xx", "4xx", "5xx")):
            classes["coach_" + category] += 1
        groups[tuple(row[key] for key in GROUP_KEYS)] += 1
    return {"total": len(rows), **classes,
            "by_route_and_status": [{**dict(zip(GROUP_KEYS, group)), "count": count}
                                    for group, count in sorted(groups.items())]}


def verified_result(payload, scope, now):
    require(isinstance(payload, dict) and set(payload) == {"scope", "coverage", "query_status", "reason", "rows", "completeness"})
    status = payload["query_status"]
    require(status in BROKER_REASONS and payload["reason"] in BROKER_REASONS[status])
    require(payload["scope"] == scope)
    flags = payload["completeness"]
    require(isinstance(flags, dict) and set(flags) == FLAGS and all(type(value) is bool for value in flags.values()))
    coverage = payload["coverage"]
    start, end = utc(scope["start_utc"]), utc(scope["end_utc"])
    if flags["coverage_verified"]:
        require(isinstance(coverage, dict) and set(coverage) == {"start_utc", "end_utc"})
        first, last = utc(coverage["start_utc"]), utc(coverage["end_utc"])
        require(first <= start < end <= last <= now and last - first <= timedelta(days=7))
    else:
        require(coverage is None)
    rows = payload["rows"]
    require(isinstance(rows, list) and len(rows) <= MAX_ROWS)
    unverified_coverage = status == "INCOMPLETE" and payload["reason"] == "COVERAGE_UNVERIFIED"
    if status == "COMPLETE" or unverified_coverage:
        require(flags["pagination_exhausted"] and not flags["truncated"] and flags["permissions_verified"]
                and flags["ingestion_delay_assessed"] and flags["coverage_verified"] == (status == "COMPLETE"))
        require(now - end >= timedelta(minutes=15))
    else:
        require(not rows)
    for row in rows:
        require(isinstance(row, dict) and set(row) == ROW_KEYS)
        require(row["service"] == scope["service"] and valid_revision(scope["service"], row["revision"]))
        require(scope["revision"] is None or row["revision"] == scope["revision"])
        require(start <= utc(row["timestamp_utc"], fractional=True) < end)
        require(row["method"] in METHODS and row["route"] in ROUTES[scope["service"]])
        require(type(row["status"]) is int and 100 <= row["status"] <= 599)
    # Distinct insert IDs can produce identical published metadata. Only the
    # private broker sees these IDs and can safely deduplicate.
    def sort_key(row):
        stamp = row["timestamp_utc"]
        return (stamp[:19], stamp[20:-1].ljust(9, "0"), *(row[key] for key in GROUP_KEYS))
    return {"query_status": status, "reason": payload["reason"], "completeness": flags, "coverage": coverage,
            "requests": sorted(rows, key=sort_key), "counts": counts_for(rows) if status == "COMPLETE" else None}


def unique_keys(pairs):
    record = {}
    for name, value in pairs:
        require(name not in record)
        record[name] = value
    return record


class TransportFailure(Exception):
    def __init__(self, reason):
        self.reason = reason


def broker_query(scope, token):
    if not isinstance(token, str) or len(token) > 16000 or not re.fullmatch(
            r"[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", token):
        raise TransportFailure("IDENTITY_UNAVAILABLE")
    # Fixed TLS origin. http.client never follows redirects or uses environment
    # proxy settings. No error response body, URL or token is logged.
    connection = http.client.HTTPSConnection(BROKER_HOST, timeout=100)
    try:
        connection.request("POST", "/", body=json.dumps(scope).encode("ascii"),
                           headers={"Content-Type": "application/json", "Authorization": "Bearer " + token})
        response = connection.getresponse()
        if response.status != 200:
            reason = {401: "IDENTITY_UNAVAILABLE", 403: "PERMISSION_DENIED", 404: "BROKER_UNAVAILABLE"}.get(
                response.status, "BROKER_UNAVAILABLE")
            raise TransportFailure(reason)
        require(response.getheader("Content-Type", "").split(";")[0].strip().lower() == "application/json")
        body = response.read(MAX_BYTES + 1)
        require(len(body) <= MAX_BYTES)
        return json.loads(body, object_pairs_hook=unique_keys)
    finally:
        connection.close()


def summary(report):
    scope = report["scope"]
    lines = ["## Production request evidence", "",
             f'**{report["query_status"]}** · `{report["reason"]}` · {report["observed_at_utc"]}']
    if scope:
        who = scope["revision"] or "all revisions (service-wide)"
        lines.extend(["", f'{report["project"]} / {report["region"]} / {scope["service"]} / {who}',
                      f'UTC interval [`{scope["start_utc"]}`, `{scope["end_utc"]}`)'])
    coverage = report["coverage"]
    if coverage:
        lines.append(f'Verified source coverage [`{coverage["start_utc"]}`, `{coverage["end_utc"]}`)')
    counts = report["counts"]
    if counts is None:
        lines.extend(["", "Request totals are unknown."])
        if report["requests"]:
            observed = Counter(row["status"] for row in report["requests"])
            lines.append("Observed lower bounds by HTTP status: " + ", ".join(
                f"{status} (at least {count})" for status, count in sorted(observed.items())) + ".")
    else:
        statuses = Counter()
        for row in counts["by_route_and_status"]:
            statuses[row["status"]] += row["count"]
        lines.extend(["", f'{counts["total"]} requests · {counts["http_2xx"]} HTTP 2xx · '
                      f'{counts["http_4xx"]} HTTP 4xx · {counts["http_5xx"]} HTTP 5xx',
                      f'Coach completion POSTs returning HTTP 2xx: {counts["coach_2xx"]}.'])
        if statuses:
            lines.append("Observed HTTP statuses (count): " + ", ".join(
                f"{status} ({count})" for status, count in sorted(statuses.items())) + ".")
        else:
            lines.append("No matching request entries. Traffic health is unknown.")
    return "\n".join(lines) + "\n"


def publish(report, env, *, show_summary=True):
    OUTPUT.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    # Stale seed files are replaced as a single operation.
    temporary = OUTPUT.with_suffix(".tmp")
    temporary.write_text(json.dumps(report, ensure_ascii=True, sort_keys=True, indent=2) + "\n", encoding="ascii")
    temporary.replace(OUTPUT)
    if not show_summary:
        return
    rendered = summary(report)
    if env.get("GITHUB_STEP_SUMMARY"):
        with open(env["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as stream:
            stream.write(rendered)
    else:
        print(rendered, end="")


def main(argv=None, *, env=None, now=None, fetch=None):
    args = sys.argv[1:] if argv is None else argv
    env = os.environ if env is None else env
    fixed_now = now
    now = datetime.now(timezone.utc) if fixed_now is None else fixed_now
    fetch = broker_query if fetch is None else fetch
    if args not in (["validate"], ["query"]):
        return 2
    try:
        scope = query_scope(env, now)
    except (ValueError, TypeError, KeyError, OSError, RecursionError):
        scope = None
    report = initial_report(scope, env, now)
    if args == ["query"] and scope:
        try:
            payload = fetch(scope, env.get("DIAGNOSTICS_ID_TOKEN", ""))
            report.update(verified_result(payload, scope, now))
        except TransportFailure as failure:
            report.update(query_status="UNAVAILABLE", reason=failure.reason)
        except TimeoutError:
            report.update(query_status="INCOMPLETE", reason="TIMEOUT")
        except (OSError, http.client.HTTPException):
            report.update(query_status="UNAVAILABLE", reason="BROKER_UNAVAILABLE")
        except (ValueError, TypeError, KeyError, RecursionError):
            report.update(query_status="INCOMPLETE", reason="INVALID_BROKER_RESPONSE")
        except Exception:
            # Unexpected parser/transport exception messages can contain upstream data.
            report.update(query_status="INCOMPLETE", reason="INVALID_BROKER_RESPONSE")
    checked = datetime.now(timezone.utc) if fixed_now is None else fixed_now
    report["observed_at_utc"] = checked.strftime("%Y-%m-%dT%H:%M:%SZ")
    publish(report, env, show_summary=(args == ["query"] or scope is None))
    return 0 if (args == ["validate"] and scope) or report["query_status"] == "COMPLETE" else 1


if __name__ == "__main__":
    raise SystemExit(main())
