#!/usr/bin/env python3
"""Read-only, opt-in proof of the two production release identities.

The SAME short-lived access token is identified by Google userinfo and used for every
permission probe. These finite probes supplement the operator's IAM policy
review; they are not an exhaustive proof that no other privilege exists.
Unsupported checks, absent identity evidence and HTTP errors fail closed.
Empty workflow values do not distinguish missing GitHub variables from stored
empty values; the operator collector must establish actual variable absence.

API references:
https://developers.google.com/identity/openid-connect/openid-connect#obtaininguserprofileinformation
https://docs.cloud.google.com/artifact-registry/docs/reference/rest/v1/projects.locations.repositories/testIamPermissions
https://docs.cloud.google.com/run/docs/reference/rest/v2/projects.locations.services/testIamPermissions
https://docs.cloud.google.com/iam/docs/reference/rest/v1/projects.serviceAccounts/testIamPermissions
https://docs.cloud.google.com/resource-manager/reference/rest/v3/projects/testIamPermissions
"""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import subprocess
import urllib.error
import urllib.parse
import urllib.request

import oidc_claims

PROJECT = "family-game-factory-jzw"
LOCATION = f"projects/{PROJECT}/locations/us-east5"
REGISTRY = f"{LOCATION}/repositories/jems-release-images"
SCOPES = {"https://www.googleapis.com/auth/cloud-platform",
          "https://www.googleapis.com/auth/userinfo.email"}
ACCOUNTS = {lane: f"{name}@{PROJECT}.iam.gserviceaccount.com" for lane, name in
            (("publish", "jems-image-publisher"), ("release", "jems-cloud-run-release"))}
RUNTIMES = {service: f"{account}@{PROJECT}.iam.gserviceaccount.com" for service, account in
            (("factory-gateway", "factory-gateway"), ("factory-preview", "factory-preview"),
             ("factory-coach-private", "factory-coach"))}
SERVICE_REQUIRED = {"run.services.get", "run.services.update", "run.revisions.get"}
SERVICE_DENIED = {"run.services.delete", "run.services.setIamPolicy"}
REGISTRY_READ = {"artifactregistry.repositories.get", "artifactregistry.repositories.downloadArtifacts"}
REGISTRY_WRITE = "artifactregistry.repositories.uploadArtifacts"
REGISTRY_DENIED = {"artifactregistry.repositories.delete", "artifactregistry.repositories.update",
                   "artifactregistry.repositories.setIamPolicy", "artifactregistry.versions.delete"}
ACCOUNT_DENIED = {"iam.serviceAccounts.getAccessToken", "iam.serviceAccounts.getOpenIdToken",
                  "iam.serviceAccounts.signBlob", "iam.serviceAccounts.signJwt",
                  "iam.serviceAccounts.setIamPolicy", "iam.serviceAccountKeys.create"}
PROJECT_DENIED = {
    "resourcemanager.projects.setIamPolicy", "iam.roles.create", "iam.roles.update",
    "iam.serviceAccounts.create", "iam.serviceAccounts.actAs", "iam.serviceAccounts.getAccessToken",
    "iam.serviceAccounts.setIamPolicy", "iam.serviceAccountKeys.create",
    "run.services.create", "run.services.update", "run.services.delete", "run.services.setIamPolicy",
    "run.jobs.run", "run.routes.invoke", "serviceusage.services.enable",
    "artifactregistry.repositories.create", "artifactregistry.repositories.uploadArtifacts",
    "artifactregistry.repositories.downloadArtifacts", "artifactregistry.repositories.setIamPolicy",
    "secretmanager.versions.access", "datastore.entities.get", "datastore.entities.list",
    "storage.objects.get", "storage.objects.list", "logging.logEntries.list",
}
FLAGS = ("JEMS_IMAGE_PUBLISH_ENABLED", "JEMS_CLOUD_RUN_RELEASE_ENABLED")


class AccessError(Exception):
    """Only fixed, sanitized failure codes may escape to workflow logs."""


def require(value, code):
    if not value:
        raise AccessError(code)


def context(lane, env, claims, head):
    expected = oidc_claims.expected_claims(lane)
    sha = env.get("GITHUB_SHA", "")
    require(bool(re.fullmatch(r"[a-f0-9]{40}", sha)) and head == sha, "SOURCE_MISMATCH")
    require(all(env.get(key, "") == "" for key in FLAGS), "RELEASE_FLAGS_NOT_OFF")
    require(env.get("JEMS_VERIFY_ACCESS") == "true" and env.get("JEMS_VERIFY_IDENTITY") == "false",
            "VERIFY_MODE_MISMATCH")
    require(env.get("GITHUB_REPOSITORY") == oidc_claims.REPO and
            env.get("GITHUB_REF") == "refs/heads/main" and
            env.get("GITHUB_REF_PROTECTED") == "true" and
            env.get("GITHUB_EVENT_NAME") == "workflow_dispatch" and
            env.get("RUNNER_ENVIRONMENT") == "github-hosted" and
            env.get("GITHUB_JOB") == "verify-access", "WORKFLOW_CONTEXT_MISMATCH")
    require(env.get("GITHUB_WORKFLOW_REF") == expected["workflow_ref"] and
            env.get("GITHUB_WORKFLOW_SHA") == sha, "WORKFLOW_SOURCE_MISMATCH")
    for key in ("GITHUB_RUN_ID", "GITHUB_RUN_ATTEMPT"):
        require(bool(re.fullmatch(r"[1-9][0-9]{0,19}", env.get(key, ""))), "RUN_ID_INVALID")
    expected.update(sha=sha, workflow_sha=sha, run_id=env["GITHUB_RUN_ID"],
                    run_attempt=env["GITHUB_RUN_ATTEMPT"])
    require(not oidc_claims.mismatches(expected, claims), "GITHUB_CLAIMS_MISMATCH")
    require(env.get("JEMS_ACCESS_SERVICE_ACCOUNT") == ACCOUNTS[lane] and
            env.get("JEMS_ACCESS_PROVIDER") == expected["aud"].removeprefix("https://iam.googleapis.com/"),
            "IDENTITY_CONFIGURATION_MISMATCH")
    return {"repository": oidc_claims.REPO, "source_sha": sha,
            "workflow_ref": expected["workflow_ref"], "workflow_sha": sha,
            "environment": expected["environment"], "job": "verify-access",
            "run_id": env["GITHUB_RUN_ID"], "run_attempt": env["GITHUB_RUN_ATTEMPT"]}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise AccessError("API_REDIRECT_REJECTED")


class Google:
    """No general-purpose mutation client; fixed GET and testIamPermissions only."""
    def __init__(self, token, opener=None):
        require(isinstance(token, str) and 20 <= len(token) <= 16000 and
                not any(ch.isspace() for ch in token), "ACCESS_TOKEN_MISSING")
        self.token = token
        self.opener = opener or urllib.request.build_opener(NoRedirect())

    def _request(self, url, body=None):
        allowed = {"www.googleapis.com", "artifactregistry.googleapis.com", "run.googleapis.com",
                   "iam.googleapis.com", "cloudresourcemanager.googleapis.com"}
        parsed = urllib.parse.urlsplit(url)
        require(parsed.scheme == "https" and parsed.hostname in allowed and
                parsed.port in (None, 443) and not parsed.username and not parsed.fragment,
                "API_DESTINATION_REJECTED")
        require(not parsed.query and (
                    (parsed.hostname == "www.googleapis.com" and parsed.path == "/oauth2/v2/userinfo")
                    or parsed.path.startswith(("/v1/", "/v2/", "/v3/"))),
                "API_PATH_REJECTED")
        require(body is None or url.endswith(":testIamPermissions"), "MUTATION_REJECTED")
        headers = {"Accept": "application/json", "Authorization": "Bearer " + self.token}
        data = None if body is None else json.dumps(body).encode()
        if data is not None:
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(url, data=data, headers=headers,
                                         method="GET" if data is None else "POST")
        try:
            with self.opener.open(request, timeout=20) as response:
                raw = response.read(256 * 1024 + 1)
            require(len(raw) <= 256 * 1024, "API_RESPONSE_TOO_LARGE")
            result = json.loads(raw)
            require(isinstance(result, dict), "API_RESPONSE_INVALID")
            return result
        except AccessError:
            raise
        except (OSError, ValueError, TypeError):
            # Never print the URL, token, raw response/configuration or exception.
            raise AccessError("GOOGLE_READ_OR_PERMISSION_CHECK_FAILED") from None

    def identity(self):
        return self._request("https://www.googleapis.com/oauth2/v2/userinfo")

    def get(self, url):
        return self._request(url)

    def permissions(self, url, requested):
        return self._request(url, {"permissions": sorted(requested)})


def permission_check(api, label, url, required, denied):
    requested = required | denied
    result = api.permissions(url, requested)
    require(set(result) <= {"permissions"} and isinstance(result.get("permissions", []), list),
            "PERMISSION_RESPONSE_INVALID")
    values = result.get("permissions", [])
    require(all(isinstance(value, str) for value in values) and len(values) == len(set(values)) and
            set(values) <= requested, "PERMISSION_RESPONSE_INVALID")
    require(set(values) == required, "PERMISSION_BOUNDARY_MISMATCH_" + label.upper())
    return {"resource": label, "required_present": sorted(required), "denied_absent": sorted(denied)}


def verified_runtimes(api, service):
    expected = RUNTIMES[service]
    name = f"{LOCATION}/services/{service}"
    state = api.get("https://run.googleapis.com/v2/" + name)
    template = state.get("template")
    require(state.get("name") == name and isinstance(template, dict) and template.get("serviceAccount") == expected,
            "RUNTIME_SERVICE_IDENTITY_MISMATCH")
    traffic = state.get("trafficStatuses")
    require(isinstance(traffic, list) and 1 <= len(traffic) <= 5, "SERVING_REVISIONS_UNVERIFIED")
    # Cloud Run retains historical zero-serving rows with omitted/null percent.
    require(all(isinstance(row, dict) and (row.get("percent") is None or
                type(row["percent"]) is int and 0 <= row["percent"] <= 100) for row in traffic) and
            sum(row.get("percent") or 0 for row in traffic) == 100, "SERVING_REVISIONS_UNVERIFIED")
    names = set()
    for row in traffic:
        if not row.get("percent"):
            continue
        revision = row.get("revision", "")
        require(isinstance(revision, str) and bool(re.fullmatch(re.escape(service) + r"-[a-z0-9-]+", revision)),
                "SERVING_REVISION_NAME_INVALID")
        revision_name = f"{name}/revisions/{revision}"
        actual = api.get("https://run.googleapis.com/v2/" + revision_name)
        require(actual.get("name") == revision_name and actual.get("serviceAccount") == expected,
                "RUNTIME_REVISION_IDENTITY_MISMATCH")
        names.add(revision)
    require(names, "SERVING_REVISIONS_UNVERIFIED")
    return {"service": service, "runtime_service_account": expected, "serving_revisions": sorted(names)}


def verify(lane, env, claims, head, api):
    receipt = context(lane, env, claims, head)
    info = api.identity()
    require(info.get("email") == ACCOUNTS[lane] and info.get("verified_email") is True and
            isinstance(info.get("id"), str) and bool(re.fullmatch(r"[0-9]{6,30}", info["id"])),
            "GOOGLE_EFFECTIVE_IDENTITY_UNVERIFIED")
    # Google validates the access token when serving userinfo. No token is put
    # in a URL; no requested-auth-input or local credential file is identity proof.
    checks = []
    required = REGISTRY_READ | ({REGISTRY_WRITE} if lane == "publish" else set())
    denied = REGISTRY_DENIED | ({REGISTRY_WRITE} if lane == "release" else set())
    registry = api.get("https://artifactregistry.googleapis.com/v1/" + REGISTRY)
    config = registry.get("dockerConfig")
    require(registry.get("name") == REGISTRY and registry.get("format") == "DOCKER" and
            isinstance(config, dict) and config.get("immutableTags") is True, "REGISTRY_CONFIGURATION_MISMATCH")
    checks.append(permission_check(api, "registry", "https://artifactregistry.googleapis.com/v1/" +
                                   REGISTRY + ":testIamPermissions", required, denied))
    runtimes = []
    for service in sorted(RUNTIMES):
        needed = SERVICE_REQUIRED if lane == "release" else set()
        forbidden = SERVICE_DENIED | (SERVICE_REQUIRED if lane == "publish" else set())
        # Gateway/preview already have public invoker bindings; their existing
        # public ingress is not an excessive grant to this release identity.
        if service == "factory-coach-private":
            forbidden = forbidden | {"run.routes.invoke"}
        checks.append(permission_check(api, service, "https://run.googleapis.com/v2/" + LOCATION +
                                       f"/services/{service}:testIamPermissions", needed, forbidden))
        if lane == "release":
            runtimes.append(verified_runtimes(api, service))
        # On release, positive actAs follows actual template + serving readback.
        account = RUNTIMES[service]
        needed = {"iam.serviceAccounts.actAs"} if lane == "release" else set()
        forbidden = ACCOUNT_DENIED | ({"iam.serviceAccounts.actAs"} if lane == "publish" else set())
        checks.append(permission_check(api, service + "-runtime", "https://iam.googleapis.com/v1/projects/" +
                                       PROJECT + f"/serviceAccounts/{account}:testIamPermissions", needed, forbidden))
    for label, account in sorted(ACCOUNTS.items()):
        checks.append(permission_check(api, label + "-identity", "https://iam.googleapis.com/v1/projects/" +
                                       PROJECT + f"/serviceAccounts/{account}:testIamPermissions", set(),
                                       ACCOUNT_DENIED | {"iam.serviceAccounts.actAs"}))
    needed = {"run.operations.get"} if lane == "release" else set()
    forbidden = PROJECT_DENIED | ({"run.operations.get"} if lane == "publish" else set())
    checks.append(permission_check(api, "project", "https://cloudresourcemanager.googleapis.com/v3/projects/" +
                                   PROJECT + ":testIamPermissions", needed, forbidden))
    return {"schema": "jems-federated-access-v1", "status": "VERIFIED", "lane": lane,
            "observed_at_utc": datetime.now(timezone.utc).isoformat(),
            **receipt, "effective_service_account": ACCOUNTS[lane], "checks": checks, "runtimes": runtimes,
            "flag_gate": "Both flag values resolved empty; actual variable absence requires the operator collector.",
            "operation_poll": "Project run.operations.get permission checked; no named operation was read.",
            "scope": "Named permissions on exact resources at observation time only; unprobed inherited/group/deny boundaries remain subject to operator IAM review.",
            "production_mutations": False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("lane", choices=oidc_claims.LANES)
    args = parser.parse_args()
    try:
        env = os.environ
        # Read only the token minted by this workflow's pinned auth action.
        api = Google(env.get("JEMS_GOOGLE_ACCESS_TOKEN", ""))
        claims = oidc_claims.read_claims(oidc_claims.expected_claims(args.lane)["aud"], env)
        head = subprocess.run(["git", "rev-parse", "HEAD"], cwd=Path(__file__).resolve().parents[2],
                              check=True, capture_output=True, text=True, timeout=10).stdout.strip()
        result = verify(args.lane, env, claims, head, api)
    except AccessError as error:
        raise SystemExit(str(error)) from None
    except (OSError, ValueError, KeyError, IndexError, TypeError, subprocess.SubprocessError):
        raise SystemExit("FEDERATED_ACCESS_VERIFICATION_FAILED") from None
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
