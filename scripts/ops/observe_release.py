#!/usr/bin/env python3
"""Read bounded Cloud Run metadata through the existing release identity.

This reader cannot invoke services, query logs, fetch secret payloads or mutate
resources. Configuration is compared in memory; only fingerprints are emitted.
The release identity retains its existing deployment permissions. Read-only is
this workflow mode's behavior, not a claim of a read-only IAM ceiling.
"""
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import subprocess

import oidc_claims
import release
from observe_coach_stage import condition_summary
import verify_release_access as access

ROOT = Path(__file__).resolve().parents[2]
require = access.require


class MetadataGoogle(access.Google):
    def _request(self, url, body=None):
        allowed = url == "https://www.googleapis.com/oauth2/v2/userinfo"
        for service in release.SERVICES:
            resource = release.API + release.LOCATION + "/services/" + service
            allowed = allowed or url == resource or bool(re.fullmatch(
                re.escape(resource + "/revisions/" + service + "-") + r"[a-z0-9-]{1,63}", url))
        require(body is None and allowed, "METADATA_READ_ONLY_BOUNDARY")
        return super()._request(url)


def context(env, claims, head, main):
    expected = oidc_claims.expected_claims("release")
    sha = env.get("GITHUB_SHA", "")
    require(bool(re.fullmatch(release.SHA, sha)) and head == main == sha, "SOURCE_MISMATCH")
    require(env.get("JEMS_OBSERVE") == "true" and env.get("JEMS_VERIFY_ACCESS") == "false"
            and env.get("JEMS_VERIFY_IDENTITY") == "false"
            and env.get("JEMS_CLOUD_RUN_RELEASE_ENABLED") == "true", "OBSERVE_MODE_MISMATCH")
    require(env.get("GITHUB_REPOSITORY") == oidc_claims.REPO
            and env.get("GITHUB_REF") == "refs/heads/main"
            and env.get("GITHUB_REF_PROTECTED") == "true"
            and env.get("GITHUB_EVENT_NAME") == "workflow_dispatch"
            and env.get("RUNNER_ENVIRONMENT") == "github-hosted"
            and env.get("GITHUB_JOB") == "observe", "WORKFLOW_CONTEXT_MISMATCH")
    require(env.get("GITHUB_WORKFLOW_REF") == expected["workflow_ref"]
            and env.get("GITHUB_WORKFLOW_SHA") == sha, "WORKFLOW_SOURCE_MISMATCH")
    for key in ("GITHUB_RUN_ID", "GITHUB_RUN_ATTEMPT"):
        require(bool(re.fullmatch(r"[1-9][0-9]{0,19}", env.get(key, ""))), "RUN_ID_INVALID")
    expected.update(sha=sha, workflow_sha=sha, run_id=env["GITHUB_RUN_ID"],
                    run_attempt=env["GITHUB_RUN_ATTEMPT"])
    require(not oidc_claims.mismatches(expected, claims), "GITHUB_CLAIMS_MISMATCH")
    require(env.get("JEMS_ACCESS_SERVICE_ACCOUNT") == access.ACCOUNTS["release"]
            and env.get("JEMS_ACCESS_PROVIDER") == expected["aud"].removeprefix("https://iam.googleapis.com/"),
            "IDENTITY_CONFIGURATION_MISMATCH")
    return {"source_sha": sha, "run_id": env["GITHUB_RUN_ID"], "run_attempt": env["GITHUB_RUN_ATTEMPT"]}


def reference(value, service, revision=None):
    suffix = "/locations/us-east5/services/" + service
    if revision is not None:
        suffix += "/revisions/" + revision
    return value in {"projects/" + project + suffix for project in (release.PROJECT, release.PROJECT_NUMBER)}


def revision_name(value, service):
    require(isinstance(value, str) and bool(re.fullmatch(re.escape(service) + r"-[a-z0-9-]{1,63}", value)),
            "REVISION_NAME_INVALID")
    return value


def allocation(current, field, service):
    rows = current.get(field)
    require(isinstance(rows, list) and 1 <= len(rows) <= 10, "TRAFFIC_INVALID")
    result = {}
    for row in rows:
        require(isinstance(row, dict), "TRAFFIC_INVALID")
        percent = row.get("percent")
        percent = 0 if percent is None else percent
        require(type(percent) is int and 0 <= percent <= 100, "TRAFFIC_INVALID")
        if not percent:
            continue
        require(row.get("type") == "TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION", "TRAFFIC_NOT_PINNED")
        name = revision_name(row.get("revision"), service)
        require(name not in result, "TRAFFIC_AMBIGUOUS")
        result[name] = percent
    require(sum(result.values()) == 100, "TRAFFIC_TOTAL_INVALID")
    return result


def snapshot(api, service, intent):
    resource = release.API + release.LOCATION + "/services/" + service
    current = api.get(resource)
    require(reference(current.get("name"), service), "SERVICE_IDENTITY_CHANGED")
    generation = current.get("generation")
    require(isinstance(generation, str) and bool(re.fullmatch(r"[1-9][0-9]*", generation))
            and current.get("observedGeneration") == generation and not current.get("reconciling", False)
            and current.get("terminalCondition", {}).get("type") == "Ready"
            and current.get("terminalCondition", {}).get("state") == "CONDITION_SUCCEEDED"
            and isinstance(current.get("etag"), str) and bool(current["etag"]), "SERVICE_NOT_RECONCILED")
    effective = allocation(current, "trafficStatuses", service)
    desired = allocation(current, "traffic", service)
    require(desired == effective, "TRAFFIC_NOT_RECONCILED")
    tags = release.pinned_tags(current)
    latest = {}
    for key in ("latestCreatedRevision", "latestReadyRevision"):
        value = current.get(key)
        require(isinstance(value, str), "LATEST_REVISION_INVALID")
        name = revision_name(value.rsplit("/", 1)[-1], service)
        require(reference(value, service, name), "LATEST_REVISION_INVALID")
        latest[key] = name
    names = set(effective) | set(latest.values())
    if service == intent["service"]:
        names.update((intent["baseline"], release.revision_name(intent)))
    require(len(names) <= 6, "REVISION_LIMIT_EXCEEDED")
    configuration = release.fingerprint(current["template"])
    require(current["template"].get("serviceAccount") == access.RUNTIMES[service], "RUNTIME_IDENTITY_CHANGED")
    revisions = {}
    for name in sorted(names):
        item = api.get(resource + "/revisions/" + revision_name(name, service))
        require(reference(item.get("name"), service, name), "REVISION_IDENTITY_CHANGED")
        require(item.get("serviceAccount") == access.RUNTIMES[service], "RUNTIME_IDENTITY_CHANGED")
        image = release.image(item)
        component = release.SERVICES[service]
        require(isinstance(image, str) and any(re.fullmatch(re.escape(registry + "/" + component + "@")
                + release.DIGEST, image) for registry in (release.REGISTRY, release.LEGACY_REGISTRY)), "IMAGE_REFERENCE_INVALID")
        revisions[name] = {"image": image, "configuration": release.fingerprint(item),
                           "ready": release.ready(item), "conditions": condition_summary(item)}
    result = {"service": service, "generation": generation, "service_reconciled": True,
              **latest, "desired": desired, "effective": effective, "preserved_tag_count": len(tags),
              "configuration": configuration, "revisions": revisions,
              "matchesServingConfiguration": all(revisions[name]["configuration"] == configuration for name in effective)}
    if service == intent["service"]:
        baseline, candidate = intent["baseline"], release.revision_name(intent)
        operation = intent["operation"]
        expected = {"stage": ({baseline: 100},), "canary": ({baseline: 95, candidate: 5},),
                    "promote": ({candidate: 100},), "rollback": ({baseline: 100},),
                    "acceptance-route-add": ({baseline: 95, candidate: 5},),
                    "acceptance-route-remove": ({baseline: 95, candidate: 5}, {candidate: 100}, {baseline: 100})}[operation]
        if operation.startswith("acceptance-route-") or (operation == "promote" and service == "factory-gateway"):
            require(service == "factory-gateway", "ACCEPTANCE_ROUTE_SERVICE_INVALID")
            tag_name = "jems-test-" + candidate.rsplit("-r-", 1)[1]
            matching = [entry for entry in tags if entry["tag"] == tag_name]
            require(matching == ([dict(release.traffic_target(candidate, 0), tag=tag_name)]
                    if operation == "acceptance-route-add" else []), "ACCEPTANCE_ROUTE_TAG_MISMATCH")
        require(effective in expected and latest["latestCreatedRevision"] == candidate
                and latest["latestReadyRevision"] in (baseline, candidate), "INTENT_STATE_MISMATCH")
        require(configuration == intent["configuration"], "INTENT_CONFIGURATION_MISMATCH")
        for name, image in ((baseline, intent["baselineImage"]), (candidate, intent["image"])):
            row = revisions[name]
            require(row["image"] == image and row["configuration"] == configuration, "INTENT_REVISION_MISMATCH")
            if name == baseline or operation not in ("rollback", "acceptance-route-remove"):
                require(row["ready"], "INTENT_REVISION_NOT_READY")
        result["intent_state_verified"] = intent["operation"]
    return result, current


def observe(api, intent):
    identity = api.identity()
    require(identity.get("email") == access.ACCOUNTS["release"] and identity.get("verified_email") is True
            and isinstance(identity.get("id"), str) and bool(re.fullmatch(r"[0-9]{6,30}", identity["id"])),
            "GOOGLE_EFFECTIVE_IDENTITY_UNVERIFIED")
    services, states = [], {}
    for service in sorted(release.SERVICES):
        row, states[service] = snapshot(api, service, intent)
        services.append(row)
    # Detect interleaving changes across the three sequential service reads.
    for service, before in states.items():
        after = api.get(release.API + release.LOCATION + "/services/" + service)
        require(after == before, "SERVICE_CHANGED_DURING_READ")
    return services


def command(args):
    result = subprocess.run(args, cwd=ROOT, stdin=subprocess.DEVNULL, capture_output=True, timeout=30)
    require(result.returncode == 0 and len(result.stdout) <= 4096, "SOURCE_READ_FAILED")
    return result.stdout.decode().strip()


def current_main():
    return command(["gh", "api", "--hostname", "github.com", "repos/" + oidc_claims.REPO
                    + "/git/ref/heads/main", "--jq", ".object.sha"])


def main():
    report = {"status": "READ_ONLY_RELEASE_OBSERVATION_BLOCKED", "mutations": 0,
              "limits": "Cloud Run metadata only. No logs, request bodies, secret payloads, paid calls, data inventory or gameplay acceptance. Lifecycle readiness is not functional success."}
    try:
        env = os.environ
        claims = oidc_claims.read_claims(oidc_claims.expected_claims("release")["aud"], env)
        report.update(context(env, claims, command(["git", "rev-parse", "HEAD"]), current_main()))
        intent = release.read_intent(ROOT / "ops/release.json")
        api = MetadataGoogle(env.get("JEMS_GOOGLE_ACCESS_TOKEN", ""))
        services = observe(api, intent)
        require(current_main() == report["source_sha"], "MAIN_CHANGED_DURING_READ")
        report.update(status="READ_ONLY_RELEASE_OBSERVATION_COMPLETE", services=services,
                      observed_at_utc=datetime.now(timezone.utc).isoformat(),
                      effective_service_account=access.ACCOUNTS["release"],
                      publication_source=intent["source"])
    except access.AccessError as exc:
        report["error_code"] = str(exc)
    except Exception:
        # Upstream API fields and parser errors must never escape to public logs.
        report["error_code"] = "METADATA_OBSERVATION_FAILED"
    print(json.dumps(report, sort_keys=True))
    return 0 if report["status"] == "READ_ONLY_RELEASE_OBSERVATION_COMPLETE" else 1


if __name__ == "__main__":
    raise SystemExit(main())
