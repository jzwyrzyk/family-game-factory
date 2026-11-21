#!/usr/bin/env python3
"""Run the production controller through a release cycle on one synthetic service."""
import argparse
import json
import re
import subprocess

import release

SERVICE = "jems-release-drill"
PROJECT = re.compile(r"jems-ops-drill-[a-z0-9]{3,12}")
REGION = "us-east5"
OPERATIONS = ("stage", "canary", "promote", "rollback")


def location_for(project, project_number):
    release.require(PROJECT.fullmatch(project), "Expected a dedicated jems-ops-drill project")
    release.require(re.fullmatch(r"[0-9]{6,20}", project_number)
                    and project_number != release.PROJECT_NUMBER, "Expected a nonproduction project number")
    return f"projects/{project}/locations/{REGION}"


def validate_service(service, resource):
    release.require(service.get("name") == resource and service.get("labels", {}).get("jems-isolated-drill") == "true"
                    and service.get("ingress") == "INGRESS_TRAFFIC_INTERNAL_ONLY"
                    and not service.get("invokerIamDisabled", False)
                    and not release.pinned_tags(service), "Isolated service guard failed")


def inspect(project, project_number, candidate, api):
    location = location_for(project, project_number)
    resource = f"{location}/services/{SERVICE}"
    image_pattern = re.escape(f"{REGION}-docker.pkg.dev/{project}/jems-drill/synthetic@") + release.DIGEST
    release.require(re.fullmatch(image_pattern, candidate), "Expected a digest from the isolated synthetic repository")
    service = api("GET", resource)
    validate_service(service, resource)
    policy = api("GET", resource + ":getIamPolicy")
    public = {"allUsers", "allAuthenticatedUsers"}
    release.require(not any(public.intersection(binding.get("members", []))
                            for binding in policy.get("bindings", [])), "Isolated service has a public IAM member")
    observed = release.inspect_service(SERVICE, api, location=location)
    release.require(observed["matchesServingConfiguration"], "Synthetic baseline configuration changed")
    release.require(re.fullmatch(image_pattern, observed["baselineImage"] or "")
                    and observed["baselineImage"] != candidate, "Expected a distinct synthetic baseline digest")
    template = service["template"]
    containers = template.get("containers", [])
    release.require(template.get("serviceAccount") == f"{SERVICE}-runtime@{project}.iam.gserviceaccount.com"
                    and not any(template.get(key) for key in ("volumes", "vpcAccess", "encryptionKey"))
                    and len(containers) == 1
                    and not any(containers[0].get(key) for key in ("env", "volumeMounts", "command", "args")),
                    "Synthetic template has unexpected runtime access or overrides")
    return location, {"service": SERVICE, "baseline": observed["baseline"],
                      "baselineImage": observed["baselineImage"], "configuration": observed["configuration"],
                      "image": candidate, "source": candidate.rsplit(":", 1)[-1][:40]}


def run(project, project_number, candidate, api, *, apply=False, emit=print):
    location, intent = inspect(project, project_number, candidate, api)
    if not apply:
        emit({"status": "PLAN_ONLY", "service": SERVICE, "operations": OPERATIONS})
        return
    # Guard all calls as well as the initial discovery. This lane cannot route
    # to an existing Jems production resource.
    resource = f"{location}/services/{SERVICE}"

    def scoped_api(method, path, payload=None):
        expected = path == resource or path.startswith(resource + "/revisions/")
        if method == "PATCH":
            expected = path in (resource + "?updateMask=template,traffic", resource + "?updateMask=traffic")
        release.require(expected, "Drill controller requested an out-of-scope resource")
        result = api(method, path, payload)
        if method == "GET" and path == resource:
            validate_service(result, resource)
        return result

    armed = False
    try:
        for operation in OPERATIONS:
            if operation == "canary":
                armed = True
            status = release.rollout({**intent, "operation": operation}, scoped_api, location=location)
            emit({"status": status, "service": SERVICE})
        armed = False
    finally:
        if armed:
            # A service update can succeed before the response or verification
            # fails. Attempt only the normal guarded rollback.
            status = release.rollout({**intent, "operation": "rollback"}, scoped_api, location=location)
            emit({"status": status, "service": SERVICE, "recovery": True})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", required=True)
    parser.add_argument("--project-number", required=True)
    parser.add_argument("--candidate", required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    try:
        location_for(args.project, args.project_number)
        api = release.cloud_api(release.gcloud_token(), project=args.project, project_number=args.project_number)
        run(args.project, args.project_number, args.candidate, api, apply=args.apply,
            emit=lambda entry: print(json.dumps(entry), flush=True))
    except (release.ReleaseError, OSError, ValueError, KeyError, subprocess.SubprocessError) as error:
        raise SystemExit(str(error) if isinstance(error, release.ReleaseError)
                         else "Isolated drill could not read its service or credentials") from None


if __name__ == "__main__":
    main()
