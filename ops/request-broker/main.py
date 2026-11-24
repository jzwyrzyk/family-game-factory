"""HTTP entry point for the private Jems Cloud Run function.

Deploy only with the per-view IAM role and authenticated invocation described in
the setup guide. No raw entry, token, API error or input is logged or returned.
"""
from datetime import datetime, timedelta, timezone
from http.client import HTTPConnection, HTTPSConnection
import json
import os
import re
from time import monotonic
from urllib.parse import urlencode, urlsplit


PROJECT = "family-game-factory-jzw"
REGION = "us-east5"
ACCOUNT = f"jems-request-broker@{PROJECT}.iam.gserviceaccount.com"
LOG = f"projects/{PROJECT}/logs/run.googleapis.com%2Frequests"
VIEW_FILTER = (
    'source("projects/family-game-factory-jzw") AND resource.type="cloud_run_revision" '
    'AND log_id("run.googleapis.com/requests") AND resource.labels.location="us-east5" '
    'AND (resource.labels.service_name="factory-gateway" OR resource.labels.service_name="factory-preview" '
    'OR resource.labels.service_name="factory-coach-private")'
)
# Cloud Run's resource.labels protobuf map is needed to independently verify
# the project, location, service and revision. It never leaves this function.
FIELDS = ("nextPageToken,entries(timestamp,insertId,logName,resource(type,labels),"
          "httpRequest(requestMethod,requestUrl,status))")
ROUTES = {
    "factory-gateway": frozenset({
        "/health", "/v1/coach", "/v1/coach/status", "/v1/coach/erase",
        "/v1/coach/audio", "/v1/coach/audio/status", "/v1/coach/narration", "/v1/coach/narration/status",
    }),
    "factory-preview": frozenset({"/health"}),
    "factory-coach-private": frozenset({
        "/v1/private-coach/complete", "/v1/private-coach/status", "/v1/private-coach/audio",
        "/v1/private-coach/audio/status", "/v1/private-coach/narration", "/v1/private-coach/narration/status",
    }),
}
METHODS = frozenset({"GET", "HEAD", "POST", "PUT", "DELETE", "OPTIONS", "PATCH", "CONNECT", "TRACE"})
UTC_SECONDS = r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}"
PAGE_SIZE = 100
MAX_PAGES = 20
MAX_ROWS = 1000
MAX_BYTES = 2_000_000
LAG = timedelta(minutes=15)


class Failure(Exception):
    """A fixed code safe to publish. Never pass data or an upstream exception."""


def require(condition, reason):
    if not condition:
        raise Failure(reason)


def instant(value, reason, *, fraction=False):
    pattern = UTC_SECONDS + (r"(?:\.[0-9]{1,9})?" if fraction else "") + "Z"
    require(isinstance(value, str) and re.fullmatch(pattern, value), reason)
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        raise Failure(reason) from None


def normalized_time(value):
    # Retain nanosecond precision, which datetime alone would silently discard.
    fraction = value[20:-1] if "." in value else ""
    return value[:19] + "." + fraction.ljust(9, "0") + "Z"


def valid_revision(service, name):
    return (isinstance(name, str) and len(name) <= 63
            and re.fullmatch(re.escape(service) + r"-[a-z0-9](?:[a-z0-9-]*[a-z0-9])?", name) is not None)


def validate_scope(value, now):
    require(isinstance(value, dict) and set(value) == {"service", "revision", "start_utc", "end_utc"}, "INVALID_SCOPE")
    service, revision = value["service"], value["revision"]
    require(isinstance(service, str) and service in ROUTES, "INVALID_SCOPE")
    require(revision is None or valid_revision(service, revision), "INVALID_SCOPE")
    start = instant(value["start_utc"], "INVALID_SCOPE")
    end = instant(value["end_utc"], "INVALID_SCOPE")
    require(start < end <= now and end - start <= timedelta(hours=1), "INVALID_SCOPE")
    return start, end


def coverage_settings(env, start, end, now):
    location = env.get("JEMS_LOG_BUCKET_LOCATION")
    require(location in ("global", REGION), "CONFIG_UNVERIFIED")
    left = env.get("JEMS_COVERAGE_START_UTC")
    right = env.get("JEMS_COVERAGE_END_UTC")
    first = instant(left, "COVERAGE_UNVERIFIED")
    last = instant(right, "COVERAGE_UNVERIFIED")
    reviewed = instant(env.get("JEMS_VERIFIED_AT_UTC"), "COVERAGE_UNVERIFIED")
    expires = instant(env.get("JEMS_VERIFIED_UNTIL_UTC"), "COVERAGE_UNVERIFIED")
    require(timedelta(0) < last - first <= timedelta(days=7)
            and reviewed - last >= LAG and reviewed <= now
            and timedelta(0) < expires - reviewed <= timedelta(days=7), "COVERAGE_UNVERIFIED")
    view = f"projects/{PROJECT}/locations/{location}/buckets/_Default/views/jems-production-requests"
    coverage = {"start_utc": left, "end_utc": right} if first <= start < end <= last else None
    return view, coverage, env["JEMS_VERIFIED_AT_UTC"], expires


def safe_route(service, value):
    require(isinstance(value, str) and 0 < len(value) <= 65536, "INVALID_METADATA")
    # Reject ambiguous references. Never decode an unknown path, URL username,
    # encoded delimiter, query, fragment, dynamic ID or token into a route.
    if re.search(r"[\x00-\x20\x7f\\]", value) or value.startswith("//"):
        return "[other]"
    try:
        url = urlsplit(value)
        if url.fragment:
            return "[other]"
        if url.scheme or url.netloc:
            if (url.scheme not in ("http", "https") or not url.hostname
                    or url.username is not None or url.port == 0):
                return "[other]"
        elif not value.startswith("/"):
            return "[other]"
    except ValueError:
        return "[other]"
    # server/pipeline/http.ts matches one ASCII word/dash revision segment.
    if service == "factory-preview" and re.fullmatch(r"/preview/[\w-]+", url.path, re.ASCII):
        return "/preview/{id}"
    return url.path if url.path in ROUTES[service] else "[other]"


def project_entry(entry, scope):
    require(isinstance(entry, dict), "INVALID_METADATA")
    resource, request = entry.get("resource"), entry.get("httpRequest")
    require(isinstance(resource, dict) and isinstance(request, dict), "INVALID_METADATA")
    labels, service = resource.get("labels"), scope["service"]
    require(isinstance(labels, dict) and entry.get("logName") == LOG
            and resource.get("type") == "cloud_run_revision" and labels.get("project_id") == PROJECT
            and labels.get("location") == REGION and labels.get("service_name") == service, "INVALID_METADATA")
    revision = labels.get("revision_name")
    require(valid_revision(service, revision) and (scope["revision"] is None or scope["revision"] == revision),
            "INVALID_METADATA")
    timestamp = entry.get("timestamp")
    instant(timestamp, "INVALID_METADATA", fraction=True)
    timestamp = normalized_time(timestamp)
    require(normalized_time(scope["start_utc"]) <= timestamp < normalized_time(scope["end_utc"]), "INVALID_METADATA")
    key, status, method = entry.get("insertId"), request.get("status"), request.get("requestMethod")
    require(isinstance(key, str) and 0 < len(key) <= 512 and type(status) is int and 100 <= status <= 599
            and isinstance(method, str) and method in METHODS, "INVALID_METADATA")
    return (timestamp, key), {"timestamp_utc": timestamp, "service": service, "revision": revision,
                              "method": method, "route": safe_route(service, request.get("requestUrl")), "status": status}


class Logging:
    """Only fixed metadata-server GETs, exact view GETs and entries:list."""

    def __init__(self, view):
        self.view = view
        self.deadline = monotonic() + 45
        self.bearer = None

    def _request(self, path, *, metadata=False, body=None, plain=False):
        remaining = self.deadline - monotonic()
        require(remaining > 0, "TIMEOUT")
        timeout = min(8, remaining)
        if metadata:
            connection = HTTPConnection("metadata.google.internal", timeout=timeout)
            headers = {"Metadata-Flavor": "Google"}
        else:
            connection = HTTPSConnection("logging.googleapis.com", timeout=timeout)
            headers = {"Authorization": "Bearer " + self.bearer, "Content-Type": "application/json"}
        try:
            data = None if body is None else json.dumps(body).encode()
            connection.request("GET" if data is None else "POST", path, body=data, headers=headers)
            response = connection.getresponse()
            if response.status in (401, 403):
                raise Failure("PERMISSION_DENIED")
            require(response.status == 200 and (not metadata or response.getheader("Metadata-Flavor") == "Google"),
                    "SOURCE_UNAVAILABLE")
            raw = response.read(MAX_BYTES + 1)
            require(len(raw) <= MAX_BYTES, "ROW_LIMIT")
            require(monotonic() < self.deadline, "TIMEOUT")
            return raw.decode("utf-8") if plain else json.loads(raw)
        except TimeoutError:
            raise Failure("TIMEOUT") from None
        finally:
            connection.close()

    def connect(self):
        prefix = "/computeMetadata/v1/instance/service-accounts/default/"
        require(self._request(prefix + "email", metadata=True, plain=True).strip() == ACCOUNT, "CONFIG_UNVERIFIED")
        result = self._request(prefix + "token", metadata=True)
        require(isinstance(result, dict) and result.get("token_type") == "Bearer"
                and type(result.get("expires_in")) is int and result["expires_in"] > 45
                and isinstance(result.get("access_token"), str)
                and bool(re.fullmatch(r"[a-zA-Z0-9_./+=-]{16,16384}", result["access_token"])), "PERMISSION_DENIED")
        self.bearer = result["access_token"]

    def read_view(self):
        return self._request("/v2/" + self.view + "?fields=name,filter,createTime,updateTime")

    def page(self, scope, token):
        terms = [f'logName="{LOG}"', 'resource.type="cloud_run_revision"', f'resource.labels.project_id="{PROJECT}"',
                 f'resource.labels.location="{REGION}"', f'resource.labels.service_name="{scope["service"]}"',
                 f'timestamp>="{scope["start_utc"]}"', f'timestamp<"{scope["end_utc"]}"']
        if scope["revision"] is not None:
            terms.append(f'resource.labels.revision_name="{scope["revision"]}"')
        body = {"resourceNames": [self.view], "filter": " AND ".join(terms), "orderBy": "timestamp asc",
                "pageSize": PAGE_SIZE}
        if token:
            body["pageToken"] = token
        return self._request("/v2/entries:list?" + urlencode({"fields": FIELDS}), body=body)


def check_view(metadata, view, reviewed):
    require(isinstance(metadata, dict) and metadata.get("name") == view
            and isinstance(metadata.get("filter"), str)
            and " ".join(metadata["filter"].split()) == VIEW_FILTER, "CONFIG_UNVERIFIED")
    version = metadata.get("updateTime", metadata.get("createTime"))
    instant(version, "CONFIG_UNVERIFIED", fraction=True)
    require(normalized_time(version) <= normalized_time(reviewed), "CONFIG_UNVERIFIED")
    return version


def read_all(reader, scope):
    token, seen_tokens, rows = None, set(), {}
    for _ in range(MAX_PAGES):
        page = reader.page(scope, token)
        require(isinstance(page, dict) and set(page) <= {"entries", "nextPageToken"}, "PAGINATION_INVALID")
        entries = page.get("entries", [])  # Protobuf omits empty repeated fields.
        require(isinstance(entries, list) and len(entries) <= PAGE_SIZE, "PAGINATION_INVALID")
        for entry in entries:
            key, row = project_entry(entry, scope)
            require(key not in rows or rows[key] == row, "INVALID_METADATA")
            rows[key] = row
            require(len(rows) <= MAX_ROWS, "ROW_LIMIT")
        token = page.get("nextPageToken", "")
        require(isinstance(token, str) and len(token) <= 16384 and token not in seen_tokens, "PAGINATION_INVALID")
        if not token:
            return [rows[key] for key in sorted(rows)]
        seen_tokens.add(token)  # Empty pages can still have a continuation.
    raise Failure("ROW_LIMIT")


def evaluate(query, env, now, reader_factory=Logging):
    started = monotonic()
    flags = {"pagination_exhausted": False, "truncated": False, "permissions_verified": False,
             "ingestion_delay_assessed": False, "coverage_verified": False}
    result = {"query_status": "UNAVAILABLE", "reason": "SOURCE_UNAVAILABLE", "rows": [],
              "scope": None, "coverage": None, "completeness": flags}
    try:
        start, end = validate_scope(query, now)
        result["scope"] = query
        flags["ingestion_delay_assessed"] = True
        require(now - end >= LAG, "INGESTION_DELAY")
        view, coverage, reviewed, expires = coverage_settings(env, start, end, now)
        reader = reader_factory(view)
        reader.connect()
        version = check_view(reader.read_view(), view, reviewed)
        rows = read_all(reader, query)
        require(check_view(reader.read_view(), view, reviewed) == version, "CONFIG_UNVERIFIED")
        finished = now + timedelta(seconds=monotonic() - started)
        flags.update(pagination_exhausted=True, permissions_verified=True)
        result["rows"] = rows
        if coverage is not None and finished < expires:
            flags["coverage_verified"] = True
            result.update(query_status="COMPLETE", reason="OK", coverage=coverage)
        else:
            # Successful reads establish each returned observation. Counts and
            # absence claims additionally depend on dated routing and retention.
            result.update(query_status="INCOMPLETE", reason="COVERAGE_UNVERIFIED")
    except Failure as error:
        reason = str(error)
        if reason == "INVALID_SCOPE":
            result["query_status"] = "NOT_CHECKED"
        elif reason in ("ROW_LIMIT", "PAGINATION_INVALID", "INVALID_METADATA", "INGESTION_DELAY", "TIMEOUT"):
            result["query_status"] = "INCOMPLETE"
        flags["truncated"] = reason == "ROW_LIMIT"
        result["reason"] = reason
    except Exception:
        # Library/network error messages can include tokens, URLs and payloads.
        # Never let Functions Framework log the exception or serialize details.
        pass
    return result


def request_evidence(request):
    query = None
    try:
        if (request.method == "POST" and request.path == "/" and not request.query_string
                and request.mimetype == "application/json" and 0 < (request.content_length or 0) <= 1024):
            query = json.loads(request.stream.read(1025))
    except Exception:
        pass
    result = evaluate(query, os.environ, datetime.now(timezone.utc))
    return (json.dumps(result, separators=(",", ":")), 200,
            {"Content-Type": "application/json", "Cache-Control": "no-store"})
