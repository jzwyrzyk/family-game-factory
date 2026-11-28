#!/usr/bin/env python3
"""Trusted, keyless static DEV/TEST deployment. Never executes application code.

Inputs are verified artifact identities supplied by the trusted controller. All
cloud commands are argument arrays; errors intentionally omit raw CLI output.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import re
import subprocess
import time

PRODUCTION_PROJECT = "family-game-factory-jzw"
PRODUCTION_NUMBER = "1054529152893"
MARKER = "environments-v1"
SHA = re.compile(r"[0-9a-f]{40}")
DIGEST = re.compile(r"[0-9a-f]{64}")
KEYS = {"version", "enabled", "projectId", "projectNumber", "region",
        "runtimeServiceAccount", "deployServiceAccount", "wifProvider", "registry",
        "ownerIapMembers", "previewTtlHours", "maxPreviews", "minInstances", "maxInstances"}
OPTIONAL_KEYS = {"uatServiceAccount", "testRuntimeServiceAccount", "iapAudience", "directoryIssue", "ownerIapBindingSha256"}


class EnvironmentError(Exception):
    pass


def require(condition, message):
    if not condition:
        raise EnvironmentError(message)


def validate_config(config, *, require_enabled=True, public_record=False):
    require(isinstance(config, dict) and KEYS <= set(config) and not set(config) - KEYS - OPTIONAL_KEYS,
            "CONFIG_SCHEMA_INVALID")
    require(config["version"] == 1 and type(config["enabled"]) is bool, "CONFIG_VERSION_INVALID")
    require(config.get("directoryIssue") is None or type(config["directoryIssue"]) is int and
            config["directoryIssue"] > 0, "DIRECTORY_ISSUE_INVALID")
    require(type(config["previewTtlHours"]) is int and 1 <= config["previewTtlHours"] <= 168,
            "PREVIEW_RETENTION_INVALID")
    require(type(config["maxPreviews"]) is int and 1 <= config["maxPreviews"] <= 10,
            "PREVIEW_LIMIT_INVALID")
    require(type(config["minInstances"]) is int and type(config["maxInstances"]) is int and
            config["minInstances"] == 0 and config["maxInstances"] == 1,
            "SCALE_TO_ZERO_REQUIRED")
    require(re.fullmatch(r"[a-z]+-[a-z]+[0-9]", str(config["region"])), "REGION_INVALID")
    binding = config.get("ownerIapBindingSha256")
    require(binding is None or isinstance(binding, str) and DIGEST.fullmatch(binding),
            "IAP_BINDING_DIGEST_INVALID")
    if not config["enabled"] and not require_enabled:
        require(binding is None, "DISABLED_TEMPLATE_MUST_BE_UNBOUND")
        require(all(config[k] is None for k in ("projectId", "projectNumber", "runtimeServiceAccount",
                "deployServiceAccount", "wifProvider", "registry")) and config["ownerIapMembers"] == [] and
                all(config.get(k) is None for k in ("uatServiceAccount", "testRuntimeServiceAccount", "iapAudience")),
                "DISABLED_TEMPLATE_MUST_BE_UNBOUND")
        return config
    require(config["enabled"], "NONPRODUCTION_NOT_ENABLED")
    project, number, region = config["projectId"], str(config["projectNumber"]), config["region"]
    require(isinstance(project, str) and re.fullmatch(r"[a-z][a-z0-9-]{4,28}[a-z0-9]", project)
            and project != PRODUCTION_PROJECT, "ISOLATED_PROJECT_REQUIRED")
    require(re.fullmatch(r"[1-9][0-9]{5,19}", number) and number != PRODUCTION_NUMBER,
            "ISOLATED_PROJECT_NUMBER_REQUIRED")
    for key in ("runtimeServiceAccount", "testRuntimeServiceAccount", "deployServiceAccount", "uatServiceAccount"):
        require(isinstance(config.get(key), str) and re.fullmatch(
            rf"[a-z][a-z0-9-]{{4,28}}@{re.escape(project)}\.iam\.gserviceaccount\.com", config[key]),
            "PROJECT_BOUND_SERVICE_ACCOUNT_REQUIRED")
    require(len({config[k] for k in ("runtimeServiceAccount", "testRuntimeServiceAccount", "deployServiceAccount", "uatServiceAccount")}) == 4,
            "SEPARATE_RUNTIME_REQUIRED")
    require(isinstance(config.get("iapAudience"), str) and re.fullmatch(
        r"[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com", config["iapAudience"]), "IAP_OAUTH_AUDIENCE_REQUIRED")
    require(config["wifProvider"] == f"projects/{number}/locations/global/workloadIdentityPools/"
            "jems-nonproduction/providers/github-main", "NONPRODUCTION_PROVIDER_REQUIRED")
    require(config["registry"] == f"{region}-docker.pkg.dev/{project}/jems-environments",
            "NONPRODUCTION_REGISTRY_REQUIRED")
    members = config["ownerIapMembers"]
    if public_record:
        require(binding and members == [], "PRIVATE_IAP_BINDING_REQUIRED")
        return config
    require(isinstance(members, list) and all(isinstance(m, str) for m in members) and
            1 <= len(members) <= 10 and len(set(members)) == len(members),
            "IAP_ALLOWLIST_REQUIRED")
    for member in members:
        require(isinstance(member, str) and bool(re.fullmatch(
            r"user:[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", member)),
            "EXACT_IAP_USERS_REQUIRED")
    return config


def bind_private_members(config, private_value):
    """Verify the protected secret before rendering a cloud IAM operation."""
    validate_config(config, public_record=True)
    require(isinstance(private_value, str) and 0 < len(private_value) <= 8192,
            "PRIVATE_IAP_BINDING_REQUIRED")
    require(hashlib.sha256(private_value.encode()).hexdigest() == config["ownerIapBindingSha256"],
            "PRIVATE_IAP_BINDING_MISMATCH")
    try:
        record = json.loads(private_value)
    except ValueError:
        raise EnvironmentError("PRIVATE_IAP_BINDING_INVALID") from None
    require(isinstance(record, dict) and set(record) == {"nonce", "members"}
            and isinstance(record["nonce"], str) and DIGEST.fullmatch(record["nonce"]),
            "PRIVATE_IAP_BINDING_INVALID")
    return validate_config({**config, "ownerIapMembers": record["members"]})


class Cloud:
    def __init__(self, config):
        self.config = validate_config(config)

    def run(self, *args):
        command = ["gcloud", *map(str, args), "--project=" + self.config["projectId"],
                   "--quiet", "--format=json"]
        try:
            result = subprocess.run(command, capture_output=True, text=True, timeout=900, check=False)
        except (OSError, subprocess.TimeoutExpired):
            raise EnvironmentError("CLOUD_COMMAND_UNAVAILABLE_OR_UNCERTAIN") from None
        require(result.returncode == 0, "CLOUD_COMMAND_FAILED_OR_UNCERTAIN")
        try:
            return json.loads(result.stdout or "null")
        except ValueError:
            raise EnvironmentError("CLOUD_RESPONSE_INVALID") from None


def runtime_account(config, kind):
    require(kind in ("dev", "test"), "ENVIRONMENT_INVALID")
    return config["testRuntimeServiceAccount" if kind == "test" else "runtimeServiceAccount"]


def account_member(config):
    return "serviceAccount:" + config["runtimeServiceAccount"]


def iap_members(config):
    return [*config["ownerIapMembers"], "serviceAccount:" + config["uatServiceAccount"]]


def no_runtime_grants(policy, config):
    require(isinstance(policy, dict), "IAM_POLICY_UNREADABLE")
    for binding in policy.get("bindings", []):
        members = binding.get("members", [])
        require(isinstance(members, list) and all(isinstance(member, str) for member in members),
                "IAM_MEMBERS_UNREADABLE")
        require(not {"serviceAccount:" + runtime_account(config, kind) for kind in ("dev", "test")}.intersection(members),
                "RUNTIME_MUST_HAVE_NO_ROLES")
        # Unknown membership cannot establish a role-free runtime or a private
        # audience. Require an effective-policy review rather than guessing.
        require(not any(member in ("allUsers", "allAuthenticatedUsers") or
                        member.startswith(("group:", "domain:", "principalSet:")) for member in members),
                "BROAD_OR_GROUP_IAM_REQUIRES_EFFECTIVE_REVIEW")
        if binding.get("role") == "roles/run.invoker":
            allowed = {f"serviceAccount:service-{config['projectNumber']}@gcp-sa-iap.iam.gserviceaccount.com"}
            require(set(members) <= allowed and not binding.get("condition"), "INHERITED_INVOKER_FORBIDDEN")
        if binding.get("role") == "roles/iap.httpsResourceAccessor":
            require(set(members) <= set(iap_members(config)) and not binding.get("condition"),
                    "INHERITED_IAP_ALLOWLIST_DRIFT")


def preflight(config, cloud):
    validate_config(config)
    project = cloud.run("projects", "describe", config["projectId"])
    require(project.get("projectId") == config["projectId"] and
            str(project.get("projectNumber")) == str(config["projectNumber"]) and
            project.get("lifecycleState") == "ACTIVE", "PROJECT_IDENTITY_DRIFT")
    no_runtime_grants(cloud.run("projects", "get-iam-policy", config["projectId"]), config)
    ancestors = cloud.run("projects", "get-ancestors", config["projectId"])
    require(isinstance(ancestors, list), "ANCESTOR_POLICY_UNREADABLE")
    for ancestor in ancestors:
        if ancestor.get("type") in ("folder", "organization"):
            no_runtime_grants(cloud.run(ancestor["type"] + "s", "get-iam-policy", ancestor["id"]), config)
    for kind in ("dev", "test"):
        email = runtime_account(config, kind)
        account = cloud.run("iam", "service-accounts", "describe", email)
        require(account.get("email") == email and not account.get("disabled"), "RUNTIME_IDENTITY_DRIFT")
        require(cloud.run("iam", "service-accounts", "keys", "list",
                         "--iam-account=" + email, "--managed-by=user") == [], "RUNTIME_KEY_FORBIDDEN")
    registry = cloud.run("artifacts", "repositories", "describe", "jems-environments",
                         "--location=" + config["region"])
    require(registry.get("format") == "DOCKER", "REGISTRY_FORMAT_INVALID")


def service_name(kind, pr=None):
    require(kind in ("dev", "test"), "ENVIRONMENT_INVALID")
    if kind == "test":
        require(pr is None, "TEST_PR_FORBIDDEN")
        return "jems-test"
    require(type(pr) is int and 1 <= pr <= 99999999, "PR_NUMBER_INVALID")
    return f"jems-dev-pr-{pr}"


def metadata(service):
    require(isinstance(service, dict) and isinstance(service.get("metadata"), dict), "SERVICE_METADATA_INVALID")
    return service["metadata"]


def owned(service, kind, pr=None):
    meta = metadata(service)
    labels = meta.get("labels", {})
    require(meta.get("name") == service_name(kind, pr) and
            labels.get("jems-managed") == MARKER and labels.get("jems-environment") == kind and
            labels.get("jems-pr", "") == (str(pr) if kind == "dev" else "none"),
            "SERVICE_OWNERSHIP_UNVERIFIED")


def services(config, cloud):
    result = cloud.run("run", "services", "list", "--region=" + config["region"])
    require(isinstance(result, list), "SERVICE_LIST_INVALID")
    return result


def validate_image(config, image):
    require(isinstance(image, str) and re.fullmatch(re.escape(config["registry"]) +
            r"/site@sha256:[a-f0-9]{64}", image), "IMMUTABLE_NONPRODUCTION_SITE_IMAGE_REQUIRED")


def inspect(config, cloud, *, kind, pr, source_sha, bundle_sha256, image):
    name = service_name(kind, pr)
    service = cloud.run("run", "services", "describe", name, "--region=" + config["region"])
    owned(service, kind, pr)
    meta, status = metadata(service), service.get("status", {})
    labels = meta.get("labels", {})
    require(labels.get("jems-source") == source_sha, "SOURCE_LABEL_DRIFT")
    annotations = meta.get("annotations", {})
    require(annotations.get("run.googleapis.com/iap-enabled") == "true", "IAP_REQUIRED")
    require(annotations.get("run.googleapis.com/invoker-iam-disabled", "false") == "false",
            "INVOKER_IAM_CHECK_REQUIRED")
    template = service.get("spec", {}).get("template", {})
    spec, scaling = template.get("spec", {}), template.get("metadata", {}).get("annotations", {})
    require(spec.get("serviceAccountName") == runtime_account(config, kind), "RUNTIME_IDENTITY_DRIFT")
    require(scaling.get("autoscaling.knative.dev/minScale", "0") == "0" and
            scaling.get("autoscaling.knative.dev/maxScale") == "1", "SCALING_DRIFT")
    containers = spec.get("containers", [])
    require(len(containers) == 1 and containers[0].get("image") == image, "DEPLOYED_IMAGE_DRIFT")
    require(not spec.get("volumes") and not containers[0].get("volumeMounts"), "RUNTIME_MOUNTS_FORBIDDEN")
    env = containers[0].get("env", [])
    expected = {"JEMS_ENVIRONMENT": kind, "JEMS_SOURCE_SHA": source_sha,
                "JEMS_BUNDLE_SHA256": bundle_sha256, "JEMS_PR_NUMBER": str(pr or "")}
    # Cloud Run v1 EnvVar.value defaults to the empty string. The PR marker
    # on the permanent TEST site is the only configured empty literal.
    if kind == "test" and pr is None:
        env = [{"name": "JEMS_PR_NUMBER", "value": ""} if item == {"name": "JEMS_PR_NUMBER"} else item
               for item in env]
    require(all(isinstance(item, dict) and set(item) == {"name", "value"} for item in env) and
            {item["name"]: item["value"] for item in env} == expected and len(env) == len(expected),
            "RUNTIME_ENVIRONMENT_DRIFT")
    revision = status.get("latestReadyRevisionName")
    traffic = [entry for entry in status.get("traffic", []) if entry.get("percent", 0)]
    require(any(c.get("type") == "Ready" and c.get("status") == "True"
                for c in status.get("conditions", [])) and revision and
            status.get("latestCreatedRevisionName") == revision and len(traffic) == 1 and
            traffic[0].get("percent") == 100 and traffic[0].get("revisionName") == revision,
            "DEPLOYMENT_NOT_READY")
    url = status.get("url", "")
    require(re.fullmatch(r"https://" + re.escape(name) + r"-[a-z0-9-]+(?:\.[a-z0-9-]+)?\.run\.app", url),
            "SERVICE_URL_UNVERIFIED")
    policy = cloud.run("run", "services", "get-iam-policy", name, "--region=" + config["region"])
    no_runtime_grants(policy, config)
    iap_agent = f"serviceAccount:service-{config['projectNumber']}@gcp-sa-iap.iam.gserviceaccount.com"
    invokers = set()
    for binding in policy.get("bindings", []):
        require(not {"allUsers", "allAuthenticatedUsers"}.intersection(binding.get("members", [])),
                "PUBLIC_ACCESS_FORBIDDEN")
        if binding.get("role") == "roles/run.invoker":
            require(not binding.get("condition"), "INVOKER_POLICY_DRIFT")
            invokers.update(binding.get("members", []))
    require(invokers == {iap_agent}, "IAP_ONLY_INVOKER_REQUIRED")
    iap = cloud.run("iap", "web", "get-iam-policy", "--resource-type=cloud-run",
                    "--service=" + name, "--region=" + config["region"])
    no_runtime_grants(iap, config)
    members = set()
    for binding in iap.get("bindings", []):
        require(not {"allUsers", "allAuthenticatedUsers"}.intersection(binding.get("members", [])),
                "PUBLIC_IAP_ACCESS_FORBIDDEN")
        if binding.get("role") == "roles/iap.httpsResourceAccessor":
            require(not binding.get("condition"), "IAP_POLICY_DRIFT")
            members.update(binding.get("members", []))
    require(members == set(iap_members(config)), "IAP_ALLOWLIST_DRIFT")
    return {"status": "deployed", "environment": kind, "pr": pr, "sourceSha": source_sha,
            "bundleSha256": bundle_sha256, "image": image, "url": url, "service": name,
            "revision": revision, "observedAt": datetime.now(timezone.utc).isoformat()}


def deploy(config, *, kind, source_sha, bundle_sha256, image, pr=None, cloud=None, now=None):
    validate_config(config)
    require(isinstance(source_sha, str) and SHA.fullmatch(source_sha), "SOURCE_SHA_REQUIRED")
    require(isinstance(bundle_sha256, str) and DIGEST.fullmatch(bundle_sha256), "BUNDLE_SHA256_REQUIRED")
    validate_image(config, image)
    name = service_name(kind, pr)
    cloud = cloud or Cloud(config)
    preflight(config, cloud)
    current = services(config, cloud)
    matches = [s for s in current if metadata(s).get("name") == name]
    require(len(matches) <= 1, "SERVICE_LIST_AMBIGUOUS")
    if matches:
        owned(matches[0], kind, pr)
    if kind == "dev" and not matches:
        count = sum(metadata(s).get("labels", {}).get("jems-managed") == MARKER and
                    metadata(s).get("labels", {}).get("jems-environment") == "dev" for s in current)
        require(count < config["maxPreviews"], "PREVIEW_LIMIT_REACHED")
    expires = int(now if now is not None else time.time()) + config["previewTtlHours"] * 3600
    labels = f"jems-managed={MARKER},jems-environment={kind},jems-pr={pr or 'none'},jems-source={source_sha}"
    if kind == "dev":
        labels += f",jems-expires={expires}"
    environment = f"JEMS_ENVIRONMENT={kind},JEMS_SOURCE_SHA={source_sha},JEMS_BUNDLE_SHA256={bundle_sha256},JEMS_PR_NUMBER={pr or ''}"
    cloud.run("run", "deploy", name, "--region=" + config["region"], "--image=" + image,
              "--service-account=" + runtime_account(config, kind), "--iap", "--no-allow-unauthenticated",
              "--min-instances=0", "--max-instances=1", "--cpu=1", "--memory=512Mi", "--concurrency=20",
              "--timeout=60", "--cpu-throttling", "--no-cpu-boost", "--ingress=all", "--port=8080",
              "--clear-secrets", "--clear-volumes", "--set-env-vars=" + environment, "--labels=" + labels)
    cloud.run("run", "services", "add-iam-policy-binding", name, "--region=" + config["region"],
              f"--member=serviceAccount:service-{config['projectNumber']}@gcp-sa-iap.iam.gserviceaccount.com",
              "--role=roles/run.invoker", "--condition=None")
    for member in iap_members(config):
        cloud.run("iap", "web", "add-iam-policy-binding", "--resource-type=cloud-run", "--service=" + name,
                  "--region=" + config["region"], "--member=" + member,
                  "--role=roles/iap.httpsResourceAccessor", "--condition=None")
    return inspect(config, cloud, kind=kind, pr=pr, source_sha=source_sha,
                   bundle_sha256=bundle_sha256, image=image)


def cleanup(config, *, closed_prs=(), cloud=None, now=None):
    validate_config(config)
    require(all(type(pr) is int and 1 <= pr <= 99999999 for pr in closed_prs), "CLOSED_PR_LIST_INVALID")
    cloud = cloud or Cloud(config)
    preflight(config, cloud)
    cutoff = int(now if now is not None else time.time())
    deleted = []
    for service in services(config, cloud):
        meta = metadata(service)
        match = re.fullmatch(r"jems-dev-pr-([1-9][0-9]{0,7})", meta.get("name", ""))
        if not match or meta.get("labels", {}).get("jems-managed") != MARKER:
            continue
        pr = int(match[1])
        owned(service, "dev", pr)
        expiry = meta.get("labels", {}).get("jems-expires", "")
        require(re.fullmatch(r"[1-9][0-9]{8,11}", expiry), "PREVIEW_EXPIRY_UNVERIFIED")
        if pr not in closed_prs and int(expiry) > cutoff:
            continue
        # Re-read immediately before deletion so a refreshed preview is retained.
        fresh = cloud.run("run", "services", "describe", meta["name"], "--region=" + config["region"])
        owned(fresh, "dev", pr)
        require(isinstance(meta.get("uid"), str) and bool(meta["uid"]) and
                metadata(fresh).get("uid") == meta.get("uid") and
                metadata(fresh).get("resourceVersion") == meta.get("resourceVersion"), "CLEANUP_SERVICE_DRIFT")
        require(metadata(fresh).get("labels") == meta.get("labels"), "CLEANUP_PREVIEW_REFRESHED")
        cloud.run("run", "services", "delete", meta["name"], "--region=" + config["region"])
        require(not any(metadata(s).get("name") == meta["name"] for s in services(config, cloud)),
                "CLEANUP_NOT_VERIFIED")
        deleted.append({"service": meta["name"], "pr": pr, "reason": "closed" if pr in closed_prs else "expired"})
    return {"status": "cleanup_verified", "deleted": deleted}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", default="ops/environments.json")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("plan")
    deployment = commands.add_parser("deploy")
    deployment.add_argument("--kind", choices=("dev", "test"), required=True)
    deployment.add_argument("--source-sha", required=True)
    deployment.add_argument("--bundle-sha256", required=True)
    deployment.add_argument("--image", required=True)
    deployment.add_argument("--pr", type=int)
    cleaning = commands.add_parser("cleanup")
    cleaning.add_argument("--closed-prs", default="")
    args = parser.parse_args(argv)
    try:
        with open(args.config, encoding="utf-8") as stream:
            config = json.load(stream)
        if args.command == "plan":
            validate_config(config, require_enabled=False, public_record=config.get("ownerIapBindingSha256") is not None)
            result = {"status": "disabled" if not config["enabled"] else "configured",
                      "mutations": 0, "projectId": config["projectId"], "region": config["region"],
                      "setup": "infra/nonproduction/README.md", "productionAccess": "forbidden",
                      "runtime": "keyless static server; no application or cloud roles",
                      "previewTtlHours": config["previewTtlHours"], "maxPreviews": config["maxPreviews"]}
        elif args.command == "deploy":
            result = deploy(config, kind=args.kind, source_sha=args.source_sha,
                            bundle_sha256=args.bundle_sha256, image=args.image, pr=args.pr)
        else:
            require(not args.closed_prs or re.fullmatch(r"[1-9][0-9]*(?:,[1-9][0-9]*)*", args.closed_prs),
                    "CLOSED_PR_LIST_INVALID")
            result = cleanup(config, closed_prs=[int(x) for x in args.closed_prs.split(",") if x])
        print(json.dumps(result, sort_keys=True))
    except (EnvironmentError, OSError, ValueError) as error:
        raise SystemExit("JEMS_ENVIRONMENT_BLOCKED: " + (str(error) if isinstance(error, EnvironmentError)
                                                     else "INPUT_UNREADABLE")) from None


if __name__ == "__main__":
    main()
