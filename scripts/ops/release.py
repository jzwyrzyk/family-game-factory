#!/usr/bin/env python3
"""Apply one reviewed, digest-pinned Cloud Run release transition."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import time
import urllib.error
import urllib.request

PROJECT = "family-game-factory-jzw"
PROJECT_NUMBER = "1054529152893"
LOCATION = f"projects/{PROJECT}/locations/us-east5"
API = "https://run.googleapis.com/v2/"
SERVICES = {
    "factory-preview": "preview",
    "factory-gateway": "gateway",
    "factory-coach-private": "coach",
}
REGISTRY = f"us-east5-docker.pkg.dev/{PROJECT}/jems-release-images"
LEGACY_REGISTRY = f"us-east5-docker.pkg.dev/{PROJECT}/factory-services"
DIGEST = r"sha256:[a-f0-9]{64}"
SHA = r"[a-f0-9]{40}"


class ReleaseError(Exception):
    pass


def require(ok, message):
    if not ok:
        raise ReleaseError(message)


def read_intent(path):
    with open(path, encoding="utf-8") as stream:
        intent = json.load(stream)
    require(isinstance(intent, dict) and set(intent) == {
        "operation", "source", "service", "image", "baseline",
        "baselineImage", "configuration", "compatibility",
    }, "Unexpected release intent fields")
    require(all(isinstance(value, str) for value in intent.values()), "Intent fields must be strings")
    service = intent["service"]
    require(service in SERVICES, "Service outside approved release scope")
    prefix = re.escape(f"{REGISTRY}/{SERVICES[service]}@")
    legacy = re.escape(f"{LEGACY_REGISTRY}/{SERVICES[service]}@")
    for key, pattern in {
        "operation": r"stage|canary|promote|rollback|acceptance-route-add|acceptance-route-remove",
        "source": SHA,
        "image": prefix + DIGEST,
        "baselineImage": f"(?:{prefix}|{legacy})" + DIGEST,
        "baseline": rf"{service}-[a-z0-9-]+",
        "configuration": r"[a-f0-9]{64}",
        "compatibility": r"[a-f0-9]{64}",
    }.items():
        require(re.fullmatch(pattern, intent[key]), f"Invalid {key}")
    require(intent["image"] != intent["baselineImage"], "Candidate and baseline images must differ")
    if intent["operation"].startswith("acceptance-route-"):
        require(service == "factory-gateway", "Acceptance route is Gateway-only")
    if intent["operation"] != "rollback":
        proof = Path(path).with_name("compatibility.json").read_bytes()
        require(hashlib.sha256(proof).hexdigest() == intent["compatibility"], "Missing exact compatibility record")
        record = json.loads(proof)
        require(isinstance(record, dict) and set(record) == {
            "source", "service", "image", "baseline", "baselineImage", "evidence"
        }, "Unexpected compatibility fields")
        require(all(record[key] == intent[key] for key in record if key != "evidence"),
                "Compatibility record is for another release")
        require(isinstance(record["evidence"], str) and re.fullmatch(
            r"https://github.com/jzwyrzyk/family-game-factory/actions/runs/[0-9]+", record["evidence"]),
            "Expected reviewed GitHub Actions compatibility evidence")
    return intent


def revision_name(intent):
    identity = hashlib.sha256(
        f'{intent["source"]}:{intent["image"]}:{intent["baseline"]}'.encode()
    ).hexdigest()[:20]
    return f'{intent["service"]}-r-{identity}'


def fingerprint(resource):
    # Revision-only status and identity fields do not belong to RevisionTemplate.
    ignored = {"name", "uid", "generation", "createTime", "updateTime", "deleteTime",
               "expireTime", "creator", "service", "reconciling", "conditions",
               "observedGeneration", "logUri", "etag", "revision", "containerStatuses",
               "launchStage", "satisfiesPzs", "client", "clientVersion", "scalingStatus"}
    template = {key: value for key, value in resource.items() if key not in ignored}
    containers = template.get("containers", [])
    require(isinstance(containers, list) and len(containers) == 1, "Expected one container")
    template["containers"] = [{key: value for key, value in containers[0].items() if key not in {"image", "name"}}]
    return hashlib.sha256(json.dumps(template, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def image(resource):
    containers = resource.get("containers", [])
    require(isinstance(containers, list) and len(containers) == 1, "Expected one container")
    return containers[0].get("image")


def ready(resource):
    return not resource.get("reconciling", False) and any(
        condition.get("type") == "Ready" and condition.get("state") == "CONDITION_SUCCEEDED"
        for condition in resource.get("conditions", [])
    )


def traffic_target(name, percent):
    return {"type": "TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION", "revision": name, "percent": percent}


def traffic(service):
    observed = service.get("trafficStatuses", [])
    active = [entry for entry in observed if entry.get("percent", 0) > 0]
    require(all(entry.get("revision") for entry in active), "Traffic has no resolved revision")
    allocations = {entry["revision"]: entry["percent"] for entry in active}
    require(len(allocations) == len(active) and sum(allocations.values()) == 100,
            "Traffic allocation is ambiguous")
    return allocations


def pinned_tags(service):
    declared = {}
    observed = {}
    for field, tags in (("traffic", declared), ("trafficStatuses", observed)):
        for entry in service.get(field, []):
            tag = entry.get("tag")
            if not tag:
                continue
            require((field != "traffic" or entry.get("percent", 0) == 0) and entry.get("revision")
                    and entry.get("type") == "TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION"
                    and tag not in tags, "Existing tagged traffic requires separate release review")
            tags[tag] = entry["revision"]
    require(declared == observed, "Declared and effective revision tags differ")
    return [dict(traffic_target(revision, 0), tag=tag) for tag, revision in sorted(declared.items())]


def rollout(intent, api, *, location=LOCATION):
    service = intent["service"]
    candidate = revision_name(intent)
    baseline = intent["baseline"]
    resource = f"{location}/services/{service}"
    current = api("GET", resource)
    require(not current.get("reconciling", False), "Cloud Run service is reconciling")
    serving = traffic(current)
    tags = pinned_tags(current)
    require(current.get("etag"), "Cloud Run did not return an update precondition")
    template = current["template"]
    require(fingerprint(template) == intent["configuration"], "Service configuration changed")

    def verify_revision(name, expected_image):
        revision = api("GET", f"{resource}/revisions/{name}")
        require(revision.get("name") == f"{resource}/revisions/{name}", "Revision identity mismatch")
        require(ready(revision), "Revision is not ready")
        require(image(revision) == expected_image, "Revision image differs from reviewed digest")
        require(fingerprint(revision) == intent["configuration"], "Revision configuration differs")
        return revision

    verify_revision(baseline, intent["baselineImage"])
    operation = intent["operation"]
    original = {baseline: 100}
    staged_canary = {baseline: 95, candidate: 5}
    promoted = {candidate: 100}
    latest_is_candidate = current.get("latestCreatedRevision", "").endswith("/" + candidate)
    if operation in {"acceptance-route-add", "acceptance-route-remove"}:
        require(service == "factory-gateway", "Acceptance route is Gateway-only")
        adding = operation == "acceptance-route-add"
        require(serving in ((staged_canary,) if adding else (staged_canary, promoted, original)),
                "Acceptance route requires an expected serving allocation")
        active = [entry for entry in current.get("traffic", []) if entry.get("percent", 0) > 0]
        declared = {entry.get("revision"): entry["percent"] for entry in active}
        require(len(active) == len(declared) and declared == serving and all(
            entry.get("type") == "TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION" for entry in active),
            "Declared and effective traffic differ")
        if adding:
            require(latest_is_candidate, "Candidate is no longer latest")
            verify_revision(candidate, intent["image"])
        tag_name = "jems-acceptance-" + candidate.rsplit("-r-", 1)[1]
        matching = [entry for entry in tags if entry["tag"] == tag_name]
        require(not matching or matching[0]["revision"] == candidate,
                "Acceptance tag points to another revision")
        expected_tags = [entry for entry in tags if entry["tag"] != tag_name]
        if adding:
            expected_tags.append(dict(traffic_target(candidate, 0), tag=tag_name))
        expected_tags.sort(key=lambda entry: entry["tag"])
        if expected_tags != tags:
            patch = {"traffic": [traffic_target(name, percent) for name, percent in serving.items()]
                     + expected_tags, "etag": current["etag"]}
            api("PATCH", f"{resource}?updateMask=traffic", patch)
            after = api("GET", resource)
            require(not after.get("reconciling", False) and traffic(after) == serving,
                    "Acceptance route changed serving allocation")
            require(pinned_tags(after) == expected_tags, "Acceptance route tag verification failed")
            require(fingerprint(after["template"]) == intent["configuration"],
                    "Post-update configuration changed")
            if adding:
                verify_revision(candidate, intent["image"])
        return "ACCEPTANCE_ROUTE_ADDED" if adding else "ACCEPTANCE_ROUTE_REMOVED"
    statuses = {"stage": "STAGED", "canary": "CANARY", "promote": "PROMOTED",
                "rollback": "ROLLED_BACK"}
    if operation == "stage":
        require(serving == original, "Serving baseline changed")
        if latest_is_candidate:
            verify_revision(candidate, intent["image"])
            return statuses[operation]
        updated = {**template, "revision": candidate, "containers": [
            {**template["containers"][0], "image": intent["image"]}
        ]}
        fields = "template,traffic"
        patch = {"template": updated, "traffic": [traffic_target(baseline, 100)]}
        target = original
    else:
        require(latest_is_candidate, "Candidate is no longer latest")
        if operation != "rollback":
            verify_revision(candidate, intent["image"])
        target, allowed = {
            "canary": (staged_canary, (original,)),
            "promote": (promoted, (staged_canary,)),
            "rollback": (original, (staged_canary, promoted)),
        }[operation]
        removed_acceptance_tag = False
        if operation == "promote" and service == "factory-gateway":
            tag_name = "jems-acceptance-" + candidate.rsplit("-r-", 1)[1]
            matching = [entry for entry in tags if entry["tag"] == tag_name]
            require(not matching or matching[0]["revision"] == candidate,
                    "Acceptance tag points to another revision")
            removed_acceptance_tag = bool(matching)
            tags = [entry for entry in tags if entry["tag"] != tag_name]
        if serving == target and not removed_acceptance_tag:
            return statuses[operation]
        require(serving in allowed or (serving == target and removed_acceptance_tag),
                "Serving allocation differs from the expected predecessor")
        fields = "traffic"
        patch = {"traffic": [traffic_target(name, percent) for name, percent in target.items()]}

    patch["traffic"].extend(tags)
    api("PATCH", f"{resource}?updateMask={fields}", {**patch, "etag": current["etag"]})
    after = api("GET", resource)
    require(not after.get("reconciling", False) and traffic(after) == target, "Traffic verification failed")
    require(pinned_tags(after) == tags, "Post-update revision tags changed")
    require(fingerprint(after["template"]) == intent["configuration"], "Post-update configuration changed")
    if operation != "rollback":
        verify_revision(candidate, intent["image"])
    return statuses[operation]


def cloud_api(token, *, project=PROJECT, project_number=PROJECT_NUMBER):
    def request(method, path, payload=None):
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        body = json.dumps(payload).encode() if payload is not None else None
        req = urllib.request.Request(API + path, data=body, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=20) as response:
                return json.load(response)
        except urllib.error.URLError as error:
            raise ReleaseError(f"Cloud Run {method} failed ({getattr(error, 'code', 'transport')})") from None

    def call(method, path, payload=None):
        result = request(method, path, payload)
        if method != "PATCH":
            return result
        operation = result.get("name", "")
        require(re.fullmatch(rf"projects/(?:{re.escape(project)}|{re.escape(project_number)})/locations/us-east5/operations/[A-Za-z0-9_-]+", operation),
                "Cloud Run returned an unexpected operation resource")
        for _ in range(90):
            if result.get("done"):
                require(not result.get("error"), "Cloud Run operation failed")
                return result
            time.sleep(4)
            result = request("GET", operation)
        raise ReleaseError("Cloud Run operation timed out; inspect actual state before retrying")

    return call


def inspect_service(service, api, *, location=LOCATION):
    resource = f"{location}/services/{service}"
    current = api("GET", resource)
    require(not current.get("reconciling", False), "Cloud Run service is reconciling")
    serving = traffic(current)
    pinned_tags(current)
    require(len(serving) == 1, "Planning requires a single serving baseline")
    baseline = next(iter(serving))
    revision = api("GET", f"{resource}/revisions/{baseline}")
    require(ready(revision), "Baseline revision is not ready")
    return {"service": service, "baseline": baseline, "baselineImage": image(revision),
            "configuration": fingerprint(current["template"]),
            "matchesServingConfiguration": fingerprint(current["template"]) == fingerprint(revision)}


def gcloud_token():
    return subprocess.check_output(
        ["gcloud", "auth", "print-access-token", "--quiet"], text=True, stderr=subprocess.DEVNULL
    ).strip()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("intent", nargs="?")
    parser.add_argument("--inspect-service", choices=SERVICES)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if bool(args.intent) == bool(args.inspect_service) or (args.inspect_service and args.apply):
        parser.error("Select a release intent or one read-only service inspection")
    try:
        if args.inspect_service:
            print(json.dumps(inspect_service(args.inspect_service, cloud_api(gcloud_token()))))
            return
        intent = read_intent(args.intent)
        if not args.apply:
            print(json.dumps({"status": "PLAN_ONLY", "candidate": revision_name(intent), **intent}))
            return
        print(json.dumps({"service": intent["service"], "source": intent["source"],
                          "candidate": revision_name(intent), "baseline": intent["baseline"],
                          "status": rollout(intent, cloud_api(gcloud_token()))}))
    except (ReleaseError, OSError, ValueError, KeyError, subprocess.SubprocessError) as error:
        print(str(error) if isinstance(error, ReleaseError) else "Release input or credential operation failed")
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
