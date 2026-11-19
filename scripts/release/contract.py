#!/usr/bin/env python3
"""Jems release contract: read-only plan, explicit Pages release, honest production checks.

This module intentionally has no Google Cloud mutations, no model calls, and no
paid-AI activation operation. See docs/release/JEMS_RELEASE_SYSTEM.md.
"""
import argparse
import ipaddress
import json
from pathlib import Path
import re
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

SHA = re.compile(r"^[a-f0-9]{40}$")
HOST = re.compile(r"^[a-z0-9-]+(?:\.[a-z0-9-]+)+$")
MAX_BODY = 65536


class ReleaseError(ValueError):
    pass


def checked_sha(value):
    if not isinstance(value, str) or not SHA.fullmatch(value):
        raise ReleaseError("A full, lowercase, immutable 40-character commit SHA is required")
    return value


def checked_origin(raw):
    """Canonical HTTPS origin without path, credentials, query or fragment."""
    if not isinstance(raw, str) or not raw:
        raise ReleaseError("An existing reviewed HTTPS service origin is required")
    try:
        parts = urlsplit(raw)
        host = parts.hostname or ""
        ipaddress.ip_address(host)
        raise ReleaseError("IP-address service origins are not permitted")
    except ValueError as exc:
        if isinstance(exc, ReleaseError):
            raise
    if (parts.scheme != "https" or not HOST.fullmatch(host) or
            parts.netloc != host or parts.path or parts.query or parts.fragment or
            parts.username or parts.password):
        raise ReleaseError("Service URL must be one canonical HTTPS origin with no path, port or credentials")
    return raw


def checked_site_base(raw):
    """GitHub Pages or a reviewed custom site; path must be absolute and bounded."""
    if not isinstance(raw, str):
        raise ReleaseError("A canonical HTTPS Pages URL is required")
    parts = urlsplit(raw)
    host = parts.hostname or ""
    if (parts.scheme != "https" or not HOST.fullmatch(host) or parts.netloc != host or
            parts.query or parts.fragment or parts.username or parts.password or
            not parts.path.endswith("/") or "\\" in parts.path or
            any(segment in ("..", ".") for segment in parts.path.split("/")) or
            "//" in parts.path):
        raise ReleaseError("Site must be a canonical HTTPS base URL ending in /")
    return raw


def checked_pair(gateway, preview, required):
    if not gateway and not preview and not required:
        return "", ""
    if not gateway or not preview:
        raise ReleaseError("Both existing gateway and separate preview origins are required")
    gateway, preview = checked_origin(gateway), checked_origin(preview)
    if gateway == preview:
        raise ReleaseError("Gateway and untrusted preview must be on different origins")
    return gateway, preview


def release_plan(operation, source_sha, reviewed_sha, main_sha, gateway="", preview=""):
    source_sha, main_sha = checked_sha(source_sha), checked_sha(main_sha)
    if source_sha != main_sha:
        raise ReleaseError("Source is no longer the current main commit; never deploy stale code")
    if operation not in ("plan", "pages"):
        raise ReleaseError("This release controller supports plan and pages only; full cloud/paid activation remains separate")
    if operation == "pages" and not reviewed_sha:
        raise ReleaseError("An explicitly reviewed full SHA is required for Pages deployment")
    if reviewed_sha and checked_sha(reviewed_sha) != source_sha:
        raise ReleaseError("Reviewed SHA does not match the exact main commit")
    gateway, preview = checked_pair(gateway, preview, required=operation == "pages")
    blockers = [
        "Backend deployment from immutable images is not wired into this workflow",
        "Paid AI approval and activation are separate one-time security/consent gates",
        "Real child-device Safari/Chrome UAT and cross-site session continuity remain unverified",
    ]
    if not gateway:
        blockers.insert(0, "Existing gateway and preview URLs have not been supplied")
    return {
        "schema": 1,
        "mode": operation,
        "status": "READY_FOR_PAGES_ONLY" if operation == "pages" else "READ_ONLY_PLAN",
        "sourceSha": source_sha,
        "mainSha": main_sha,
        "reviewedSha": reviewed_sha or None,
        "gatewayOrigin": gateway or None,
        "previewOrigin": preview or None,
        "backendMutationAuthorized": False,
        "paidModelActivationAuthorized": False,
        "liveModelTested": False,
        "blockersToFullRelease": blockers,
    }


def automatic_pages_scope(changed_files):
    """Only previously reviewed presentation-only changes may auto-publish to Pages.

    Any backend/API/worker/learning/code changes require the separately
    supervised full-stack release lane, even if the gateway is healthy.
    """
    names=[name.strip() for name in changed_files if name.strip()]
    if not names:
        raise ReleaseError("No changed paths found; automatic release scope cannot be verified")
    allowed={"index.html","src/style.css","src/studio/style.css","public/manifest.webmanifest"}
    art_extensions=(".svg",".png",".webp",".jpg",".jpeg")
    for name in names:
        if name.startswith("/") or ".." in name.split("/") or "\\" in name:
            raise ReleaseError("Unsafe changed file path")
        if (name in allowed or name.startswith("docs/") or
                (name.startswith("public/") and name.endswith(art_extensions)) or
                (name.startswith("src/brand/") and name.endswith(".css"))):
            continue
        raise ReleaseError("Automatic Pages release is presentation-only; code or backend change requires a supervised release")
    return {"schema":1,"status":"PRESENTATION_ONLY_AUTODEPLOY_APPROVED",
            "fileCount":len(names),"backendChangesAllowed":False,
            "paidModelActivationAuthorized":False}


class RejectRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise ReleaseError("Production probe refused an HTTP redirect")


def fetch_json(url):
    """GET only; no credentials; do not forward requests through redirects."""
    try:
        request = Request(url, method="GET", headers={"Cache-Control": "no-store", "Accept": "application/json"})
        with build_opener(RejectRedirect).open(request, timeout=12) as response:
            if response.status != 200:
                raise ReleaseError("Expected HTTP 200 from reviewed service")
            payload = response.read(MAX_BODY + 1)
            if len(payload) > MAX_BODY:
                raise ReleaseError("Production response exceeds bounded size")
            return json.loads(payload)
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise ReleaseError("Production endpoint did not return valid accessible JSON") from exc


def verified_health(gateway, preview, getter=fetch_json):
    gateway, preview = checked_pair(gateway, preview, required=True)
    gateway_status = getter(gateway + "/health")
    preview_status = getter(preview + "/health")
    if (not isinstance(gateway_status, dict) or gateway_status.get("ready") is not True or
            type(gateway_status.get("paidExecution")) is not bool):
        raise ReleaseError("Gateway health is not a verified ready boolean with paid status")
    if (not isinstance(preview_status, dict) or preview_status.get("ready") is not True or
            preview_status.get("paidExecution") is not False):
        raise ReleaseError("Preview must be healthy and must never enable paid execution")
    return {
        "gatewayReady": True,
        "previewReady": True,
        "gatewayReportsPaidExecution": gateway_status["paidExecution"],
        "paidModelCallPerformed": False,
    }


def verify_pages_payload(release, config, source_sha, gateway, preview):
    checked_sha(source_sha)
    gateway, preview = checked_pair(gateway, preview, required=True)
    if (not isinstance(release, dict) or release.get("schema") != 1 or
            release.get("sourceSha") != source_sha or release.get("releaseType") != "pages-only"):
        raise ReleaseError("Published site does not contain the exact reviewed release marker")
    if (not isinstance(config, dict) or config.get("version") != 1 or
            config.get("mode") != "remote" or config.get("apiBaseUrl") != gateway or
            config.get("previewOrigin") != preview):
        raise ReleaseError("Published site has absent, stale or mismatched service URLs")
    return True


def verified_pages(site_base, source_sha, gateway, preview, getter=fetch_json):
    site_base, source_sha = checked_site_base(site_base), checked_sha(source_sha)
    checked_pair(gateway, preview, required=True)
    stamp = "?source=" + source_sha
    release = getter(urljoin(site_base, "jems-release.json") + stamp)
    config = getter(urljoin(site_base, "factory-config.json") + stamp)
    verify_pages_payload(release, config, source_sha, gateway, preview)
    result = verified_health(gateway, preview, getter)
    return {
        "schema": 1, "status": "PAGES_AND_PUBLIC_HEALTH_VERIFIED",
        "sourceSha": source_sha, "siteBase": site_base,
        "gatewayOrigin": gateway, "previewOrigin": preview, **result,
        "backendDeployedByThisRelease": False,
        "paidModelActivatedByThisRelease": False,
        "authenticatedBuildTested": False,
        "childDeviceUATCompleted": False,
    }


def write_evidence(path, payload):
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print("Jems release evidence:", payload.get("status", "RECORDED"))


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    for command in ("plan", "stamp", "precheck", "verify", "auto-scope"):
        p = sub.add_parser(command)
        p.add_argument("--output", required=True)
        if command not in ("precheck", "auto-scope"):
            p.add_argument("--source-sha", required=True)
        if command in ("plan", "precheck", "verify"):
            p.add_argument("--gateway-origin", default="")
            p.add_argument("--preview-origin", default="")
        if command == "plan":
            p.add_argument("--operation", choices=["plan", "pages"], default="plan")
            p.add_argument("--main-sha", required=True)
            p.add_argument("--reviewed-sha", default="")
        if command == "verify":
            p.add_argument("--site-base", required=True)
            p.add_argument("--attempts", type=int, default=6)
    args = parser.parse_args(argv)
    if args.command == "plan":
        result = release_plan(args.operation, args.source_sha, args.reviewed_sha,
                              args.main_sha, args.gateway_origin, args.preview_origin)
    elif args.command == "auto-scope":
        result = automatic_pages_scope(sys.stdin.read().splitlines())
    elif args.command == "stamp":
        result = {"schema": 1, "sourceSha": checked_sha(args.source_sha), "releaseType": "pages-only"}
    elif args.command == "precheck":
        result = {"schema": 1, "status": "EXISTING_SERVICES_HEALTHY",
                  **verified_health(args.gateway_origin, args.preview_origin)}
    else:
        if args.attempts < 1 or args.attempts > 12:
            raise ReleaseError("Probe attempts must be between 1 and 12")
        result = None
        for index in range(args.attempts):
            try:
                result = verified_pages(args.site_base, args.source_sha, args.gateway_origin, args.preview_origin)
                break
            except ReleaseError:
                if index + 1 == args.attempts:
                    raise
                time.sleep(5)
    write_evidence(args.output, result)


if __name__ == "__main__":
    try:
        main()
    except ReleaseError as exc:
        print("Jems release blocked: " + str(exc), file=sys.stderr)
        sys.exit(1)
    except Exception:
        print("Jems release blocked: unexpected probe or runtime failure; no approval implied", file=sys.stderr)
        sys.exit(1)
