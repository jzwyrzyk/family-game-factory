"""Plan inert production-project resources and an explicitly cost-approved drill."""

import json
import os
import re
import subprocess
import urllib.error
import urllib.request

from admin_api import Http, Plan, SetupError, command, gcloud, require
import drill
import oidc_claims
import release
from activation_review import review_plan

PROJECT = release.PROJECT
NUMBER = release.PROJECT_NUMBER
REGION = "us-east5"
REGISTRY = "jems-release-images"
MARKER = "Jems Phase 2 guarded setup v1"
BUCKET = "jems-diagnostics"
VIEW = "cloud-run-errors"
SINK = "jems-cloud-run-errors"
DIAGNOSTICS = f"jems-codex-diagnostics@{PROJECT}.iam.gserviceaccount.com"
FIELDS = ("httpRequest", "jsonPayload", "labels", "protoPayload", "sourceLocation", "textPayload")
LOG_FILTER = 'resource.type="cloud_run_revision"'
APIS = {"artifactregistry.googleapis.com", "iam.googleapis.com", "iamcredentials.googleapis.com",
        "logging.googleapis.com", "run.googleapis.com", "sts.googleapis.com"}


def egress_status():
    if not os.environ.get("CODEX_ENVIRONMENT_ID"):
        return "Verify in Codex after publishing the saved egress draft. Cloud Shell is a different network."
    status = {}
    for host in ("api.github.com", "logging.googleapis.com", "run.googleapis.com", "us-east5-run.googleapis.com"):
        try:
            with urllib.request.urlopen(f"https://{host}/", timeout=5):
                status[host] = "reachable"
        except urllib.error.HTTPError:
            status[host] = "reachable"
        except (OSError, ValueError):
            status[host] = "unverified"
    return status


def admin_token():
    # gcloud ADC and CLI account are different. Never copy configured tokens or
    # use a protected workload identity to obtain administrator authority.
    return command(["gcloud", "auth", "print-access-token", "--quiet"])


def exact(actual, expected, label):
    require(all(actual.get(k) == v for k, v in expected.items()), f"{label} differs from the reviewed configuration")


def permitted(policy, expected, label):
    """A named new resource may have only explicitly expected unconditioned grants."""
    actual = set()
    for binding in policy.get("bindings", []):
        require(not binding.get("condition"), f"Unexpected conditional grant on {label}")
        actual.update((binding["role"], member) for member in binding["members"])
    require(actual <= set(expected), f"Unknown grants on {label}")
    return actual


def rows(project, *args):
    result = gcloud(project, *args)
    require(isinstance(result, list), "gcloud list did not return a list")
    return result


def add_gcloud(plan, project, description, *args):
    plan.add(description, {"project": project, "gcloud": list(args)},
             lambda: gcloud(project, *args))


def project_check(project, expected_number=None):
    instance = gcloud(project, "projects", "describe", project)
    require(instance.get("projectId") == project and instance.get("lifecycleState") == "ACTIVE",
            "Unexpected project identity or state")
    number = str(instance.get("projectNumber"))
    require(re.fullmatch(r"[0-9]{6,20}", number) and
            (expected_number is None or number == expected_number), "Unexpected project number")
    enabled = {row.get("config", {}).get("name") for row in rows(project, "services", "list", "--enabled")}
    require(APIS <= enabled, "Required APIs are disabled: " + ", ".join(sorted(APIS - enabled)))
    return number


def policy_for_project(project):
    return gcloud(project, "projects", "get-iam-policy", project)


def no_project_grants(policy, members, label):
    require(not any(set(row.get("members", [])).intersection(members) for row in policy.get("bindings", [])),
            f"Unexpected project-level grant for {label}")


def account(plan, project, name, *, expected_bindings=()):
    email = f"{name}@{project}.iam.gserviceaccount.com"
    available = {row["email"]: row for row in rows(project, "iam", "service-accounts", "list")}
    existing = available.get(email)
    if existing is None:
        add_gcloud(plan, project, f"Create keyless identity {name}", "iam", "service-accounts", "create", name,
                   f"--description={MARKER}")
        return email, set()
    exact(existing, {"email": email, "description": MARKER}, email)
    require(not existing.get("disabled"), f"Identity is disabled: {email}")
    require(not rows(project, "iam", "service-accounts", "keys", "list", f"--iam-account={email}", "--managed-by=user"),
            f"Unexpected user-managed key for {email}")
    policy = gcloud(project, "iam", "service-accounts", "get-iam-policy", email)
    return email, permitted(policy, expected_bindings, email)


def registry(plan, project, name, *, expected_bindings=()):
    available = {row["name"].rsplit("/", 1)[-1]: row for row in
                 rows(project, "artifacts", "repositories", "list", f"--location={REGION}")}
    current = available.get(name)
    if current is None:
        add_gcloud(plan, project, f"Create immutable Docker repository {name}", "artifacts", "repositories", "create",
                   name, f"--location={REGION}", "--repository-format=docker", "--immutable-tags", f"--description={MARKER}")
        return set()
    else:
        exact(current, {"format": "DOCKER", "description": MARKER}, name)
        require(current.get("dockerConfig", {}).get("immutableTags") is True
                and not current.get("cleanupPolicies") and current.get("mode", "STANDARD_REPOSITORY") == "STANDARD_REPOSITORY",
                f"Repository {name} has unexpected tag, retention or mode settings")
        return permitted(gcloud(project, "artifacts", "repositories", "get-iam-policy", name, f"--location={REGION}"),
                         expected_bindings, name)


def lane_condition(lane):
    claims = oidc_claims.expected_claims(lane)
    keys = ("repository_id", "repository_owner_id", "repository", "ref", "runner_environment",
            "environment", "workflow_ref", "sub")
    return " && ".join([f"assertion.{key} == {json.dumps(claims[key])}" for key in keys]
                       + ['assertion.event_name in ["push", "workflow_dispatch"]'])


def inactive_lane(plan, lane, name):
    environment, pool, _workflow = oidc_claims.LANES[lane]
    identity, _ = account(plan, PROJECT, name)
    full = f"projects/{NUMBER}/locations/global/workloadIdentityPools/{pool}"
    providers = []
    pools = {row["name"]: row for row in rows(PROJECT, "iam", "workload-identity-pools", "list", "--location=global")}
    current = pools.get(full)
    if current is None:
        add_gcloud(plan, PROJECT, f"Create dedicated pool {pool}", "iam", "workload-identity-pools", "create", pool,
                   "--location=global", f"--description={MARKER}")
    else:
        exact(current, {"name": full, "state": "ACTIVE", "description": MARKER}, pool)
        require(not current.get("disabled") and current.get("mode") in (None, "MODE_UNSPECIFIED", "FEDERATION_ONLY"),
                f"Unexpected state or mode for {pool}")
        providers = rows(PROJECT, "iam", "workload-identity-pools", "providers", "list",
                         "--location=global", f"--workload-identity-pool={pool}")
    condition = lane_condition(lane)
    provider = full + "/providers/github-main"
    expected = {"name": provider, "disabled": True, "state": "ACTIVE",
                "description": MARKER, "attributeMapping": {"google.subject": "assertion.sub"},
                "attributeCondition": condition}
    if providers:
        require(len(providers) == 1, f"Unexpected additional provider in {pool}")
        current = providers[0]
        exact(current, expected, provider)
        exact(current["oidc"], {"issuerUri": "https://token.actions.githubusercontent.com"}, provider)
        require(not current["oidc"].get("allowedAudiences") and not current["oidc"].get("jwksJson"),
                f"Unexpected OIDC audience or key override for {pool}")
    else:
        add_gcloud(plan, PROJECT, f"Create disabled provider {provider}",
                   "iam", "workload-identity-pools", "providers", "create-oidc", "github-main",
                   "--location=global", f"--workload-identity-pool={pool}", f"--description={MARKER}",
                   "--issuer-uri=https://token.actions.githubusercontent.com",
                   "--attribute-mapping=google.subject=assertion.sub", f"--attribute-condition={condition}", "--disabled")
    return {"environment": environment, "provider": provider, "service_account": identity}


def logging_plan(plan, project, number, bucket_id, view_id, sink_id, log_filter, view_filter, reader, *, apply_reader):
    prefix = f"projects/{project}"
    bucket_name = f"{prefix}/locations/{REGION}/buckets/{bucket_id}"
    dest = "logging.googleapis.com/" + bucket_name
    details = (f"--bucket={bucket_id}", f"--location={REGION}")
    buckets = {row["name"].rsplit("/", 1)[-1]: row for row in rows(project, "logging", "buckets", "list", f"--location={REGION}")}
    bucket = buckets.get(bucket_id)
    view = None
    if bucket:
        exact(bucket, {"description": MARKER, "retentionDays": 7}, bucket_id)
        require(set(bucket.get("restrictedFields", [])) == set(FIELDS) and bucket.get("lifecycleState") == "ACTIVE",
                f"{bucket_id} has unexpected field restrictions or state")
        views = {row["name"].rsplit("/", 1)[-1]: row for row in rows(project, "logging", "views", "list", *details)}
        require(set(views) <= {view_id, "_AllLogs", "_Default"}, f"Unknown views on {bucket_id}")
        view = views.get(view_id)
    else:
        add_gcloud(plan, project, f"Create seven-day restricted bucket {bucket_id}", "logging", "buckets", "create",
                   bucket_id, f"--location={REGION}", "--retention-days=7",
                   "--restricted-fields=" + ",".join(FIELDS), f"--description={MARKER}")
    member = f"serviceAccount:{reader}"
    grants = set()
    if view:
        exact(view, {"description": MARKER, "filter": view_filter}, view_id)
        grants = permitted(gcloud(project, "logging", "views", "get-iam-policy", view_id, *details),
                           {("roles/logging.viewAccessor", member)}, view_id)
    else:
        add_gcloud(plan, project, f"Create restricted view {view_id}", "logging", "views", "create",
                   view_id, *details, f"--log-filter={view_filter}", f"--description={MARKER}")

    sinks = {row["name"]: row for row in rows(project, "logging", "sinks", "list")}
    sink = sinks.get(sink_id)
    if sink:
        exact(sink, {"destination": dest, "description": MARKER}, sink_id)
        require(sink["filter"].strip() == log_filter.strip() and not sink.get("disabled")
                and not sink.get("exclusions") and not sink.get("includeChildren"),
                f"Unexpected filter or state of {sink_id}")
    else:
        add_gcloud(plan, project, f"Create exact sink {sink_id}", "logging", "sinks", "create",
                   sink_id, dest, f"--log-filter={log_filter}", f"--description={MARKER}")

    def scope_writer():
        writer = gcloud(project, "logging", "sinks", "describe", sink_id).get("writerIdentity")
        if not writer:
            return
        require(writer.startswith("serviceAccount:"), "Unexpected Logging writer identity type")
        condition = {"title": f"Jems {bucket_id} destination only", "expression": f'resource.name == "{bucket_name}"'}
        policy = policy_for_project(project)
        matching = [row for row in policy.get("bindings", []) if writer in row.get("members", [])]
        require(all(row["role"] == "roles/logging.bucketWriter" and row.get("condition") == condition for row in matching),
                "Logging sink writer already has a conflicting project binding")
        if not matching:
            # Change only this conditional tuple and preserve policy version, etag and other bindings.
            gcloud(project, "projects", "add-iam-policy-binding", project, f"--member={writer}",
                   "--role=roles/logging.bucketWriter", f'--condition=title={condition["title"]},expression={condition["expression"]}')

    if sink:
        writer = sink.get("writerIdentity")
        if writer:
            condition = {"title": f"Jems {bucket_id} destination only", "expression": f'resource.name == "{bucket_name}"'}
            matching = [row for row in policy_for_project(project).get("bindings", []) if writer in row.get("members", [])]
            require(all(row["role"] == "roles/logging.bucketWriter" and row.get("condition") == condition for row in matching),
                    "Existing Logging writer has an unexpected project binding")
            if matching:
                scope_writer = None
        else:
            scope_writer = None
    if scope_writer:
        plan.add(f"Verify sink writer and grant destination-only access if needed for {sink_id}",
                 {"project": project, "bucket": bucket_name, "role": "roles/logging.bucketWriter",
                  "condition": f'resource.name == "{bucket_name}"'}, scope_writer)
    if apply_reader and reader == DIAGNOSTICS:
        if bucket:
            require_no_broad_logging(admin_token(), project, number, reader, bucket=bucket_id)
        elif ("roles/logging.viewAccessor", member) not in grants:
            plan.add("Verify effective denial of restricted fields on the new bucket before granting access",
                     {"project": project, "bucket": bucket_name, "principal": reader},
                     lambda: require_no_broad_logging(admin_token(), project, number, reader, bucket=bucket_id))
    if apply_reader and ("roles/logging.viewAccessor", member) not in grants:
        add_gcloud(plan, project, f"Grant exact view read on {view_id}", "logging", "views", "add-iam-policy-binding",
                   view_id, *details, f"--member={member}", "--role=roles/logging.viewAccessor")
    return bucket_name + "/views/" + view_id


class Cloud:
    def __init__(self, root, head):
        self.root = root
        self.head = head

    def serving(self):
        api = release.cloud_api(admin_token())
        evidence = {}
        for name in release.SERVICES:
            path = f"{release.LOCATION}/services/{name}"
            current = api("GET", path)
            observed = release.inspect_service(name, api)
            require(current["name"] == path, "Unexpected Cloud Run service identity")
            expected = {"factory-coach-private": "factory-coach"}.get(name, name)
            require(current["template"]["serviceAccount"] == f"{expected}@{PROJECT}.iam.gserviceaccount.com",
                    "A production runtime identity differs from the reviewed scope")
            evidence[name] = {"baseline": observed["baseline"], "image": observed["baselineImage"],
                              "configuration_matches": observed["matchesServingConfiguration"], "etag": current["etag"]}
        return evidence

    def plan(self, project, approve, log_gib_day):
        project_check(PROJECT, NUMBER)
        members = {f"serviceAccount:{addr}" for addr in (DIAGNOSTICS,
                   f"jems-image-publisher@{PROJECT}.iam.gserviceaccount.com",
                   f"jems-cloud-run-release@{PROJECT}.iam.gserviceaccount.com")}
        no_project_grants(policy_for_project(PROJECT), members, "planned production identities")
        plan = Plan("gcp-prepare", {"head": self.head, "project": PROJECT, "project_number": NUMBER,
                       "region": REGION, "production_serving": self.serving()})
        plan.notes.append("No production federation bindings, deploy roles, traffic changes or release flags.")
        registry(plan, PROJECT, REGISTRY)
        plan.evidence["disabled_lanes"] = [inactive_lane(plan, "publish", "jems-image-publisher"),
                                           inactive_lane(plan, "release", "jems-cloud-run-release")]
        if log_gib_day is None:
            plan.notes.append("Supply --log-gib-day with reviewed projected selected error volume to include Logging.")
        else:
            plan.evidence["logging_cost"] = {"selected_gib_per_day": log_gib_day, "retained_gib_for_7_days": 7 * log_gib_day,
              "upper_bound_monthly_usd_at_0_50_per_gib": round(30 * log_gib_day * .50, 2),
              "basis": "30 days gross ingestion, without free tier; confirm current regional pricing and duplicate routing"}
        if not project:
            plan.notes.append("No live drill or production diagnostics grant without an explicitly approved existing isolated project.")
            return plan
        require(drill.PROJECT.fullmatch(project), "Expected the dedicated isolated project name")
        number = project_check(project)
        drill.location_for(project, number)
        plan.evidence["isolated_project"] = {"project": project, "number": number, "cost_acknowledged": approve}
        if not approve:
            plan.notes.append("Pass --acknowledge-isolated-cost only after approving the existing isolated project and drill cost.")
            return plan
        billing = gcloud(project, "billing", "projects", "describe", project)
        require(billing.get("billingEnabled") is True, "The isolated project does not report active billing")

        from admin_drill import isolated_plan, synthetic_log_check
        isolated_plan(plan, self.root, self.head, project, number)
        if log_gib_day is not None:
            reader, _ = account(plan, project, "jems-log-probe-reader",
                                expected_bindings={("roles/iam.serviceAccountTokenCreator", isolated_owner())})
            require_no_broad_logging(admin_token(), PROJECT, NUMBER, DIAGNOSTICS)
            test_view = logging_plan(plan, project, number, "jems-log-probe", "synthetic", "jems-log-probe",
                'LOG_ID("jems-redaction-probe")', 'LOG_ID("jems-redaction-probe")', reader, apply_reader=True)
            owner_binding(plan, project, reader)
            plan.add("Prove synthetic metadata visibility and payload denial with the scoped reader",
                     {"project": project, "view": test_view, "reader": reader},
                     lambda: synthetic_log_check(project, test_view, reader))
            logging_plan(plan, PROJECT, NUMBER, BUCKET, VIEW, SINK,
                         (self.root / "ops/cloud-run-log-filter.txt").read_text().strip(), LOG_FILTER,
                         DIAGNOSTICS, apply_reader=True)
        return plan

    def verify(self, project, logs=False, expected_production=None):
        check = Plan("gcp-verify", {})
        registry(check, PROJECT, REGISTRY)
        inactive_lane(check, "publish", "jems-image-publisher")
        inactive_lane(check, "release", "jems-cloud-run-release")
        if logs and project:
            require_no_broad_logging(admin_token(), PROJECT, NUMBER, DIAGNOSTICS)
            logging_plan(check, PROJECT, NUMBER, BUCKET, VIEW, SINK,
                         (self.root / "ops/cloud-run-log-filter.txt").read_text().strip(), LOG_FILTER,
                         DIAGNOSTICS, apply_reader=True)
        require(not check.actions, "GCP preparation is incomplete")
        services = self.serving()
        if expected_production is not None:
            require(services == expected_production, "Production service state changed during setup; inspect without mutating")
        result = {"verified": "immutable_registry_and_disabled_unbound_wif", "services": services,
                  "logging_configuration_verified": bool(logs and project)}
        if project:
            from admin_drill import verify_baseline
            result["isolated_service"] = verify_baseline(project, self.head)
        print(json.dumps(result), flush=True)
        return result

    def production_plan(self):
        project_check(PROJECT, NUMBER)
        services = self.serving()
        return review_plan(self.head, services)


def isolated_owner():
    email = command(["gcloud", "config", "get-value", "account", "--quiet"])
    require(re.fullmatch(r"[A-Za-z0-9_.+-]+@[A-Za-z0-9.-]+", email) and not email.endswith(".gserviceaccount.com"),
            "Expected an authenticated human administrator for isolated setup")
    return "user:" + email


def owner_binding(plan, project, email):
    owner = isolated_owner()
    accounts = {row["email"] for row in rows(project, "iam", "service-accounts", "list")}
    grants = set()
    if email in accounts:
        grants = permitted(gcloud(project, "iam", "service-accounts", "get-iam-policy", email),
                           {("roles/iam.serviceAccountTokenCreator", owner)}, email)
    if not grants:
        add_gcloud(plan, project, f"Allow administrator to impersonate {email.split('@')[0]} in isolated project",
                   "iam", "service-accounts", "add-iam-policy-binding", email, f"--member={owner}",
                   "--role=roles/iam.serviceAccountTokenCreator", "--condition=None")


def require_no_broad_logging(token, project, number, email, *, bucket=None):
    troubleshoot = Http("https://policytroubleshooter.googleapis.com", token)
    targets = [
        (f"//cloudresourcemanager.googleapis.com/projects/{number}", "logging.logEntries.list"),
        (f"//cloudresourcemanager.googleapis.com/projects/{number}", "logging.privateLogEntries.list"),
    ]
    if bucket:
        targets.append((f"//logging.googleapis.com/projects/{project}/locations/{REGION}/buckets/{bucket}",
                        "logging.fields.access"))
    for resource, permission in targets:
        result = troubleshoot.call("POST", "v1/iam:troubleshoot", {"accessTuple": {
            "principal": email, "fullResourceName": resource, "permission": permission,
        }})
        require(result.get("access") == "NOT_GRANTED", f"Could not establish diagnostics denial for {permission}")
