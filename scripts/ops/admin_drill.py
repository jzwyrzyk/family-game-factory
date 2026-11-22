"""Executable synthetic isolation and Logging redaction checks for owner setup."""

import os
import re
import tempfile
import time
import uuid
from datetime import datetime, timezone

import admin_cloud as cloud
from admin_api import Http, Plan, SetupError, command, gcloud, require
import drill
import release

REGION = cloud.REGION
RUNTIME = "jems-release-drill-runtime"
OPERATOR = "jems-release-drill-operator"
DRILL_ROLE = "jemsIsolatedDrill"
POLL_ROLE = "jemsIsolatedOperationReader"
SERVICE_PERMS = ("run.services.get", "run.services.getIamPolicy", "run.services.update", "run.revisions.get")


def custom_role(plan, project, name, permissions):
    full = f"projects/{project}/roles/{name}"
    roles = {entry["name"]: entry for entry in cloud.rows(project, "iam", "roles", "list")}
    role = roles.get(full)
    if role:
        role = gcloud(project, "iam", "roles", "describe", name)
        cloud.exact(role, {"name": full, "description": cloud.MARKER, "stage": "GA"}, name)
        require(set(role.get("includedPermissions", [])) == set(permissions) and not role.get("deleted"),
                f"Unexpected permissions or state for {name}")
    else:
        cloud.add_gcloud(plan, project, f"Create isolated custom role {name}",
                         "iam", "roles", "create", name, f"--title={name}", f"--description={cloud.MARKER}",
                         "--stage=GA", "--permissions=" + ",".join(permissions))
    return full


def impersonated_token(email):
    return command(["gcloud", "auth", "print-access-token", f"--impersonate-service-account={email}", "--quiet"])


def synthetic_registry(plan, project, operator):
    """Plan only the isolated deployer's image-read grant, with guarded readback."""
    require(drill.PROJECT.fullmatch(project) and project != cloud.PROJECT,
            "Synthetic registry access requires the isolated drill project")
    expected_operator = f"{OPERATOR}@{project}.iam.gserviceaccount.com"
    require(operator == expected_operator, "Unexpected synthetic registry reader")
    member = f"serviceAccount:{operator}"
    expected = {("roles/artifactregistry.reader", member)}
    grants = cloud.registry(plan, project, "jems-drill", expected_bindings=expected)
    if grants == expected:
        return

    def apply_reader():
        details = ("artifacts", "repositories", "get-iam-policy", "jems-drill", f"--location={REGION}")
        current = cloud.permitted(gcloud(project, *details), expected, "jems-drill")
        if current != expected:
            gcloud(project, "artifacts", "repositories", "add-iam-policy-binding", "jems-drill",
                   f"--location={REGION}", f"--member={member}",
                   "--role=roles/artifactregistry.reader", "--condition=None")
        require(cloud.permitted(gcloud(project, *details), expected, "jems-drill") == expected,
                "Synthetic registry reader did not read back")

    plan.add("Allow the isolated operator to read only the synthetic image repository",
             {"project": project, "repository": "jems-drill", "location": REGION,
              "member": member, "role": "roles/artifactregistry.reader"}, apply_reader)


def isolated_plan(plan, root, head, project, number):
    location = drill.location_for(project, number)
    resource = f"{location}/services/{drill.SERVICE}"
    operator = f"{OPERATOR}@{project}.iam.gserviceaccount.com"
    runtime = f"{RUNTIME}@{project}.iam.gserviceaccount.com"
    account_member = f"serviceAccount:{operator}"
    act_as = ("roles/iam.serviceAccountUser", account_member)
    _, runtime_grants = cloud.account(plan, project, RUNTIME, expected_bindings={act_as})
    cloud.account(plan, project, OPERATOR,
                  expected_bindings={("roles/iam.serviceAccountTokenCreator", cloud.isolated_owner())})
    cloud.owner_binding(plan, project, operator)
    if not runtime_grants:
        cloud.add_gcloud(plan, project, "Allow the drill operator to use only the synthetic runtime identity",
                         "iam", "service-accounts", "add-iam-policy-binding", runtime,
                         "--role=roles/iam.serviceAccountUser", f"--member={account_member}", "--condition=None")
    service_role = custom_role(plan, project, DRILL_ROLE, SERVICE_PERMS)
    poll_role = custom_role(plan, project, POLL_ROLE, ("run.operations.get",))
    project_policy = cloud.policy_for_project(project)
    cloud.no_project_grants(project_policy, {f"serviceAccount:{runtime}"}, "isolated runtime")
    grants = {row["role"] for row in project_policy.get("bindings", []) if account_member in row.get("members", [])}
    require(grants <= {poll_role} and not any(row.get("condition") for row in project_policy.get("bindings", [])
            if account_member in row.get("members", [])), "Unexpected isolated operator project binding")
    if not grants:
        cloud.add_gcloud(plan, project, "Allow operation polling only in the isolated project", "projects",
                         "add-iam-policy-binding", project, f"--member={account_member}", f"--role={poll_role}",
                         "--condition=None")
    synthetic_registry(plan, project, operator)
    api = Http("https://run.googleapis.com", cloud.admin_token())
    existing = api.call("GET", "v2/" + resource, missing=True)
    if existing:
        try:
            drill.validate_service(existing, resource)
            evidence = release.inspect_service(drill.SERVICE, release.cloud_api(
                cloud.admin_token(), project=project, project_number=number), location=location)
        except release.ReleaseError as error:
            raise SetupError(str(error)) from None
        require(evidence["matchesServingConfiguration"], "Existing isolated template drifted")
        cloud.permitted(api.call("GET", "v2/" + resource + ":getIamPolicy"), {(service_role, account_member)}, resource)
    else:
        evidence = None

    plan.add("Build synthetic images and run stage, 5% canary, promotion and rollback",
             {"project": project, "region": REGION, "service": drill.SERVICE, "head": head,
              "runtime": runtime, "operator": operator, "existing_baseline": evidence,
              "scope": {"operator_on_service": list(SERVICE_PERMS), "maximum_instances": 1,
                        "ingress": "internal", "service_account_user_on": runtime,
                        "artifact_registry_reader_on": f"projects/{project}/locations/{REGION}/repositories/jems-drill"}},
             lambda: provision_and_run(root, head, project, number, service_role))


def published_digest(api, project, tag):
    path = f"v1/projects/{project}/locations/{REGION}/repositories/jems-drill/packages/synthetic/tags/{tag}"
    item = api.call("GET", path, missing=True)
    if item is None:
        return None
    digest = item["version"].rsplit("/", 1)[-1]
    require(re.fullmatch(release.DIGEST, digest), "Synthetic registry tag has an unexpected digest")
    return digest


def synthetic_images(root, head, project, auth):
    api = Http("https://artifactregistry.googleapis.com", auth)
    host = f"{REGION}-docker.pkg.dev"
    image = f"{host}/{project}/jems-drill/synthetic"
    result = {}
    with tempfile.TemporaryDirectory(prefix="jems-drill-docker-") as config:
        env = {**os.environ, "DOCKER_CONFIG": config}
        command(["gcloud", "auth", "configure-docker", host, "--quiet"], env=env)
        for marker in ("baseline", "candidate"):
            tag = f"{marker}-{head}"
            tagged = image + ":" + tag
            digest = published_digest(api, project, tag)
            if digest is None:
                command(["docker", "build", "--platform", "linux/amd64", "--network", "none",
                         "--label", f"org.opencontainers.image.revision={head}",
                         "--build-arg", f"DRILL_MARKER={marker}", "-t", tagged, str(root / "ops/drill")],
                        env=env, timeout=240)
                command(["docker", "push", tagged], env=env, timeout=400)
                for _ in range(10):
                    digest = published_digest(api, project, tag)
                    if digest:
                        break
                    time.sleep(2)
            require(digest, "Published synthetic image did not resolve to an immutable digest")
            reference = f"{image}@{digest}"
            command(["docker", "pull", "--platform", "linux/amd64", reference], env=env, timeout=240)
            labels = command(["docker", "image", "inspect", "--format",
                              '{{index .Config.Labels "org.opencontainers.image.revision"}}', reference], env=env)
            require(labels == head, "Existing synthetic image is not labeled for the exact reviewed source")
            command(["docker", "run", "--rm", "--network", "none", "--env", f"EXPECTED={marker}",
                     "--entrypoint", "node", reference, "-e",
                     "process.exit(process.getuid() !== 0 && process.env.DRILL_MARKER === process.env.EXPECTED ? 0 : 1)"],
                    env=env, timeout=45)
            result[marker] = reference
    require(result["baseline"] != result["candidate"], "Synthetic images must have different digests")
    return result


def wait_create(api, location, project, number, operation):
    name = operation.get("name", "")
    require(re.fullmatch(rf"projects/(?:{re.escape(project)}|{number})/locations/{REGION}/operations/[A-Za-z0-9_-]+", name)
            and location.endswith("/" + REGION), "Unexpected isolated Cloud Run operation")
    for _ in range(90):
        if operation.get("done"):
            require(not operation.get("error"), "Cloud Run could not create the isolated service")
            return
        time.sleep(4)
        operation = api.call("GET", f"v2/{name}")
    raise SetupError("Isolated service creation is still pending; inspect before retrying")


def provision_and_run(root, head, project, number, role):
    location = drill.location_for(project, number)
    path = f"v2/{location}/services/{drill.SERVICE}"
    auth = cloud.admin_token()
    api = Http("https://run.googleapis.com", auth)
    operator = f"{OPERATOR}@{project}.iam.gserviceaccount.com"
    runtime = f"{RUNTIME}@{project}.iam.gserviceaccount.com"
    member = f"serviceAccount:{operator}"
    images = synthetic_images(root, head, project, auth)
    if api.call("GET", path, missing=True) is None:
        operation = api.call("POST", f"v2/{location}/services?serviceId={drill.SERVICE}", {
            "ingress": "INGRESS_TRAFFIC_INTERNAL_ONLY", "labels": {"jems-isolated-drill": "true"},
            "template": {"serviceAccount": runtime, "scaling": {"maxInstanceCount": 1},
                         "containers": [{"image": images["baseline"]}]},
        })
        wait_create(api, location, project, number, operation)

    state = api.call("GET", path)
    try:
        drill.validate_service(state, path.removeprefix("v2/"))
    except release.ReleaseError as error:
        raise SetupError(str(error)) from None
    policy = api.call("GET", path + ":getIamPolicy")
    grants = cloud.permitted(policy, {(role, member)}, drill.SERVICE)
    if not grants:
        gcloud(project, "run", "services", "add-iam-policy-binding", drill.SERVICE, f"--region={REGION}",
               f"--member={member}", f"--role={role}", "--condition=None")
    require(cloud.permitted(api.call("GET", path + ":getIamPolicy"), {(role, member)}, drill.SERVICE) == {(role, member)},
            "Isolated service IAM did not read back")
    token = impersonated_token(operator)
    limited = release.cloud_api(token, project=project, project_number=number)
    try:
        baseline = release.inspect_service(drill.SERVICE, limited, location=location)
        require(baseline["baselineImage"] == images["baseline"], "Synthetic service is not on the reviewed baseline")
        drill.run(project, number, images["candidate"], limited, apply=True,
                  emit=lambda entry: print_json({"isolated_drill": entry}))
        readback = release.inspect_service(drill.SERVICE, release.cloud_api(
            auth, project=project, project_number=number), location=location)
        require(readback == baseline and readback["matchesServingConfiguration"], "Drill did not restore its exact baseline")
    except release.ReleaseError as error:
        raise SetupError(str(error)) from None
    receipt = {"verified": "isolated_rollback", "project": project, "head": head,
               "baseline": baseline["baseline"], "images": images}
    print_json(receipt)
    return receipt


def verify_baseline(project, head):
    number = cloud.project_check(project)
    location = drill.location_for(project, number)
    check = Plan("isolated-registry-verify", {})
    synthetic_registry(check, project, f"{OPERATOR}@{project}.iam.gserviceaccount.com")
    require(not check.actions, "Synthetic registry reader is missing or unverified")
    token = cloud.admin_token()
    api = release.cloud_api(token, project=project, project_number=number)
    resource = f"{location}/services/{drill.SERVICE}"
    state = api("GET", resource)
    drill.validate_service(state, resource)
    observed = release.inspect_service(drill.SERVICE, api, location=location)
    tags = Http("https://artifactregistry.googleapis.com", token)
    baseline = published_digest(tags, project, f"baseline-{head}")
    require(baseline and observed["matchesServingConfiguration"] and
            observed["baselineImage"] == f"{REGION}-docker.pkg.dev/{project}/jems-drill/synthetic@{baseline}",
            "Isolated service does not have the reviewed baseline at 100%")
    return {"project": project, "baseline": observed["baseline"], "image": observed["baselineImage"]}


def print_json(data):
    import json
    print(json.dumps(data, sort_keys=True), flush=True)


def synthetic_log_check(project, view, reader):
    auth = cloud.admin_token()
    admin = Http("https://logging.googleapis.com", auth)
    limited = Http("https://logging.googleapis.com", impersonated_token(reader))
    marker = "jems-synthetic-" + uuid.uuid4().hex
    before = datetime.now(timezone.utc).isoformat(timespec="seconds")
    log = f"projects/{project}/logs/jems-redaction-probe"
    common = {"logName": log, "resource": {"type": "global", "labels": {"project_id": project}},
              "severity": "ERROR", "labels": {"canary": marker}, "httpRequest": {"requestUrl": f"https://example.invalid/{marker}"}}
    admin.call("POST", "v2/entries:write", {"entries": [
        {**common, "insertId": marker + "-text", "textPayload": marker},
        {**common, "insertId": marker + "-json", "jsonPayload": {"canary": marker}},
    ]})
    evidence_ids = {marker + "-text", marker + "-json"}
    query = {"resourceNames": [view],
             "filter": f'logName="{log}" AND timestamp >= "{before}"', "pageSize": 100}

    def matching(api):
        result = api.call("POST", "v2/entries:list", query)
        return [entry for entry in result.get("entries", []) if entry.get("insertId") in evidence_ids]

    for _ in range(45):
        raw = matching(admin)
        if {entry["insertId"] for entry in raw} == evidence_ids:
            break
        time.sleep(4)
    require({entry["insertId"] for entry in raw} == evidence_ids
            and {entry.get("textPayload") for entry in raw if "textPayload" in entry} == {marker}
            and any(entry.get("jsonPayload", {}).get("canary") == marker for entry in raw)
            and all(entry.get("labels", {}).get("canary") == marker
                    and marker in entry.get("httpRequest", {}).get("requestUrl", "") for entry in raw),
            "Synthetic logs did not arrive with all control fields")
    view_rows = matching(limited)
    require({entry["insertId"] for entry in view_rows} == evidence_ids and
            all(entry.get("severity") == "ERROR" and entry.get("timestamp") and entry.get("resource")
                and not set(cloud.FIELDS).intersection(entry) for entry in view_rows),
            "Scoped reader lost metadata or returned a restricted payload")
    try:
        limited.call("POST", "v2/entries:list", {**query, "resourceNames": [f"projects/{project}"]})
    except SetupError as error:
        require(str(error).endswith("HTTP 403"), "Unexpected result for project-wide Logging denial check")
    else:
        raise SetupError("Synthetic reader can read project-wide logs")
    receipt = {"verified": "synthetic_log_redaction", "project": project, "view": view,
               "entries": len(view_rows), "restricted_fields": list(cloud.FIELDS)}
    print_json(receipt)
    return receipt
