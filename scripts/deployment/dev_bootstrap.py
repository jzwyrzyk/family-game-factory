#!/usr/bin/env python3
"""Plan or provision only Jems DEV foundations, with an explicit isolated identity.

Default: offline plan. --check is read-only. --apply creates missing resources and
adds only declared grants after target validation. It never supplies secret
payloads, creates a GitHub repository, deploys services, starts VMs or calls AI.

One-time prerequisite: a separately provisioned, labelled DEV project and
jems-dev-bootstrap identity. Every command impersonates that DEV-only identity;
there is no fallback to the owner's or a production runtime identity.

Authoritative command references (reviewed 2026-11-20):
https://docs.cloud.google.com/sdk/gcloud/reference/storage/buckets/create
https://docs.cloud.google.com/firestore/native/docs/manage-databases
https://docs.cloud.google.com/sdk/gcloud/reference/artifacts/repositories/create
https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines
https://docs.cloud.google.com/run/docs/securing/identity-aware-proxy-cloud-run
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from dev_contract import (APIS, COMPONENTS, IDENTITIES, SECRETS, DevError, account,
                          read_manifest, require, resource_summary)

# These are metadata reads plus Cloud Run revision/traffic updates. No IAM writes,
# secret payload access, key creation, VM provisioning or resource deletion.
RELEASE_ROLE = "jemsDevRelease"
RELEASE_PERMISSIONS = {
    "resourcemanager.projects.get", "serviceusage.services.get", "serviceusage.services.use",
    "iam.serviceAccounts.get", "iam.serviceAccountKeys.list", "iap.webServices.getIamPolicy", "cloudbuild.builds.get",
    "run.services.get", "run.services.list", "run.services.update", "run.services.getIamPolicy",
    "run.revisions.get", "run.revisions.list", "run.operations.get", "run.operations.list",
}
WORKER_PERMISSIONS = {
    "compute.instances.create", "compute.instances.delete", "compute.instances.get", "compute.instances.list",
    "compute.instances.setMetadata", "compute.instances.setLabels", "compute.instances.setTags", "compute.disks.create", "compute.disks.delete",
    "compute.disks.get", "compute.disks.list", "compute.disks.use", "compute.disks.setLabels", "compute.zoneOperations.get",
    "compute.regionOperations.get", "compute.globalOperations.get", "compute.subnetworks.get", "compute.subnetworks.use",
    "compute.networks.get", "compute.networks.use", "compute.projects.get", "compute.images.useReadOnly", "compute.zones.get",
}


def release_role(m: dict) -> str:
    return f"projects/{m['projectId']}/roles/{RELEASE_ROLE}"


class Cloud:
    def __init__(self, manifest: dict, identity: str = "bootstrap"):
        self.manifest = manifest
        self.identity = account(manifest, identity)

    def command(self, args: list[str]) -> list[str]:
        return ["gcloud", *args, "--project", self.manifest["projectId"],
                "--billing-project", self.manifest["projectId"],
                "--impersonate-service-account", self.identity, "--format=json", "--quiet"]

    def run(self, *args: str) -> object:
        try:
            result = subprocess.run(self.command(list(args)), text=True, capture_output=True,
                                    timeout=55, check=False)
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise DevError("DEV_CLOUD_UNAVAILABLE: inspect the selected identity and network; no automatic retry") from exc
        require(result.returncode == 0, "DEV_CLOUD_OPERATION_FAILED: raw output suppressed; inspect the named DEV resource privately")
        try:
            return json.loads(result.stdout or "null")
        except ValueError as exc:
            raise DevError("DEV_CLOUD_RESPONSE_INVALID") from exc


def verify_project(m: dict, cloud: Cloud) -> None:
    p = cloud.run("projects", "describe", m["projectId"])
    require(isinstance(p, dict) and p.get("projectId") == m["projectId"] and
            str(p.get("projectNumber")) == m["projectNumber"] and p.get("lifecycleState") == "ACTIVE",
            "DEV_PROJECT_IDENTITY_MISMATCH")
    require(p.get("labels", {}).get("environment") == "development" and
            p.get("labels", {}).get("application") == "jems", "DEV_PROJECT_LABELS_REQUIRED")
    a = cloud.run("iam", "service-accounts", "describe", cloud.identity)
    require(isinstance(a, dict) and a.get("email") == cloud.identity and a.get("projectId") == m["projectId"]
            and not a.get("disabled"), "DEV_OPERATOR_IDENTITY_REQUIRED")
    keys = cloud.run("iam", "service-accounts", "keys", "list", "--iam-account", cloud.identity, "--managed-by", "user")
    require(keys == [], "DEV_OPERATOR_MUST_BE_KEYLESS")


def worker_condition(m: dict) -> str:
    w = m["worker"]
    owner = w["repository"].split("/")[0]
    return " && ".join((f"assertion.repository=='{w['repository']}'", f"assertion.repository_id=='{w['repositoryId']}'",
        f"assertion.repository_owner=='{owner}'", f"assertion.repository_owner_id=='{w['ownerId']}'",
        "assertion.repository_visibility=='private'", "assertion.ref=='refs/heads/main'",
        f"assertion.sha=='{w['sha']}'", f"assertion.workflow_sha=='{w['sha']}'",
        f"assertion.workflow_ref=='{w['repository']}/.github/workflows/{w['workflow']}@refs/heads/main'",
        "assertion.environment=='jems-dev-infrastructure'", "assertion.event_name=='workflow_dispatch'"))


def wanted_project_roles(m: dict) -> dict[str, set[str]]:
    return {account(m, "gateway"): {"roles/datastore.user"}, account(m, "preview"): {"roles/datastore.viewer"},
            account(m, "build"): {"roles/logging.logWriter"},
            account(m, "release"): {release_role(m)},
            account(m, "app"): set(), account(m, "coach"): {"roles/speech.client"}}


def verify_companion_roles(m: dict, cloud: Cloud, policy: dict) -> None:
    """The separately reviewed private companion owns worker provisioning grants."""
    member = "serviceAccount:" + account(m, "worker-provisioner")
    role_name = f"projects/{m['projectId']}/roles/jemsDevWorkerProvisioner"
    found = False
    for binding in policy.get("bindings", []):
        if member not in binding.get("members", []):
            continue
        if binding.get("role") == role_name:
            require(not binding.get("condition"), "Unexpected conditional DEV worker role")
            found = True
        else:
            require(binding.get("role") == "roles/iap.tunnelResourceAccessor" and
                    binding.get("condition", {}).get("expression") == "destination.port == 22",
                    "Unexpected DEV worker privilege; companion review required")
    if found:
        role = cloud.run("iam", "roles", "describe", "jemsDevWorkerProvisioner")
        require(isinstance(role, dict) and role.get("name") == role_name and not role.get("deleted") and
                set(role.get("includedPermissions", [])) == WORKER_PERMISSIONS, "DEV companion worker role changed")


def roles_for(policy: dict, member: str) -> set[str]:
    roles = set()
    for binding in policy.get("bindings", []):
        if member in binding.get("members", []):
            require(not binding.get("condition"), "Unexpected conditional DEV binding requires review")
            roles.add(binding["role"])
    return roles


def inventory(m: dict, cloud: Cloud) -> dict:
    verify_project(m, cloud)
    enabled = cloud.run("services", "list", "--enabled")
    require(isinstance(enabled, list), "API inventory unavailable")
    missing = set(APIS) - {x.get("config", {}).get("name") for x in enabled}
    result: dict = {"missingApis": sorted(missing)}
    if missing:
        return result  # Cannot interpret an unavailable API as an absent resource.
    project_policy = cloud.run("projects", "get-iam-policy", m["projectId"])
    require(isinstance(project_policy, dict), "Project policy unavailable")
    for identity, allowed in wanted_project_roles(m).items():
        require(roles_for(project_policy, "serviceAccount:" + identity) <= allowed,
                "Unexpected DEV runtime/project grant; refuse privilege inheritance")
    verify_companion_roles(m, cloud, project_policy)
    result["projectPolicy"] = project_policy
    result["accounts"] = cloud.run("iam", "service-accounts", "list")
    result["databases"] = cloud.run("firestore", "databases", "list")
    result["buckets"] = cloud.run("storage", "buckets", "list")
    result["registries"] = cloud.run("artifacts", "repositories", "list", "--location", m["region"])
    result["secrets"] = cloud.run("secrets", "list")
    result["pools"] = cloud.run("iam", "workload-identity-pools", "list", "--location", "global")
    result["roles"] = cloud.run("iam", "roles", "list", "--show-deleted")
    for key in ("accounts", "databases", "buckets", "registries", "secrets", "pools", "roles"):
        require(isinstance(result[key], list), "Malformed DEV inventory")
    if any(x.get("name") == release_role(m) for x in result["roles"]):
        role = cloud.run("iam", "roles", "describe", RELEASE_ROLE)
        require(isinstance(role, dict) and role.get("name") == release_role(m), "DEV role metadata unavailable")
        result["roles"] = [role if x.get("name") == release_role(m) else x for x in result["roles"]]
    return result


def mutations(m: dict, existing: dict | None = None) -> list[list[str]]:
    """Return only missing/reviewed additive operations; never reset a configuration."""
    i = existing or {"missingApis": list(APIS)}
    commands: list[list[str]] = []
    if i.get("missingApis"):
        commands.append(["services", "enable", *i["missingApis"]])
        if existing is not None:
            return commands  # Re-inventory after API enablement before resource writes.
    by_email = {x.get("email"): x for x in i.get("accounts", [])}
    for name in IDENTITIES:
        email = account(m, name)
        found = by_email.get(email)
        if found:
            require(not found.get("disabled") and found.get("projectId") == m["projectId"], "DEV identity conflict")
        else:
            commands.append(["iam", "service-accounts", "create", "jems-dev-" + name,
                             "--display-name", "Jems development " + name])
    roles = {x.get("name"): x for x in i.get("roles", [])}
    if release_role(m) in roles:
        role = roles[release_role(m)]
        require(not role.get("deleted") and role.get("stage") == "GA" and
                set(role.get("includedPermissions", [])) == RELEASE_PERMISSIONS, "Existing DEV release role differs from contract")
    else:
        commands.append(["iam", "roles", "create", RELEASE_ROLE, "--title", "Jems DEV release controller",
                         "--stage", "GA", "--permissions", ",".join(sorted(RELEASE_PERMISSIONS))])
    databases = {x["name"].split("/")[-1]: x for x in i.get("databases", [])}
    database = databases.get("(default)")
    if database:
        require(database.get("type") == "FIRESTORE_NATIVE" and database.get("locationId") == m["region"]
                and database.get("deleteProtectionState") == "DELETE_PROTECTION_ENABLED", "Existing DEV database differs from contract")
    else:
        commands.append(["firestore", "databases", "create", "--database", "(default)", "--location", m["region"],
                         "--type", "firestore-native", "--delete-protection"])
    buckets = {str(x.get("name", "")).removeprefix("gs://").rstrip("/"): x for x in i.get("buckets", [])}
    for suffix in ("-artifacts", "-build-source"):
        name = m["projectId"] + suffix
        bucket = buckets.get(name)
        if bucket:
            # gcloud storage returns snake_case metadata; accept the documented JSON API shape too.
            iam = bucket.get("iamConfiguration", {})
            uniform = bucket.get("uniform_bucket_level_access", iam.get("uniformBucketLevelAccess", {}).get("enabled"))
            pap = bucket.get("public_access_prevention", iam.get("publicAccessPrevention"))
            require(str(bucket.get("project_number", bucket.get("projectNumber"))) == m["projectNumber"]
                    and uniform is True and pap == "enforced" and str(bucket.get("location", "")).lower() == m["region"],
                    "Existing DEV bucket identity/access differs from contract")
        else:
            commands.append(["storage", "buckets", "create", "gs://" + name, "--location", m["region"],
                             "--uniform-bucket-level-access", "--public-access-prevention",
                             "--labels", "environment=development,application=jems"])
    regs = {x.get("name", "").split("/")[-1]: x for x in i.get("registries", [])}
    for name in ("jems-dev-images", "jems-dev-sandbox"):
        reg = regs.get(name)
        if reg:
            require(reg.get("format") == "DOCKER" and reg.get("name") ==
                    f"projects/{m['projectId']}/locations/{m['region']}/repositories/{name}" and
                    reg.get("dockerConfig", {}).get("immutableTags") is True, "DEV registry conflict")
        else:
            commands.append(["artifacts", "repositories", "create", name, "--location", m["region"],
                             "--repository-format", "docker", "--immutable-tags", "--labels", "environment=development,application=jems"])
    secrets = {x.get("name", "").split("/")[-1]: x for x in i.get("secrets", [])}
    for suffix in SECRETS:
        name = "jems-dev-" + suffix
        if name in secrets:
            require(secrets[name].get("labels", {}).get("environment") == "development", "Existing secret is not managed DEV configuration")
        else:
            commands.append(["secrets", "create", name, "--replication-policy", "automatic",
                             "--labels", "environment=development,application=jems"])
    policy = i.get("projectPolicy", {})
    for identity, roles in wanted_project_roles(m).items():
        member = "serviceAccount:" + identity
        for role in sorted(roles - roles_for(policy, member)):
            commands.append(["projects", "add-iam-policy-binding", m["projectId"], "--member", member,
                             "--role", role, "--condition=None"])
    # Per-resource grants; never give runtime identities project-wide secret/storage access.
    secret_readers = {"app-config": ("app",), "gateway-config": ("gateway",),
                      "preview-config": ("preview",), "github-app-key": ("gateway",), "coach-key": ("coach",)}
    for suffix, readers in secret_readers.items():
        for reader in readers:
            commands.append(["secrets", "add-iam-policy-binding", "jems-dev-" + suffix,
                "--member", "serviceAccount:" + account(m, reader), "--role", "roles/secretmanager.secretAccessor", "--condition=None"])
        commands.append(["secrets", "add-iam-policy-binding", "jems-dev-" + suffix,
            "--member", "serviceAccount:" + account(m, "release"), "--role", "roles/secretmanager.viewer", "--condition=None"])
    for target, reader, role in (("-artifacts", "gateway", "roles/storage.objectCreator"),
                                 ("-artifacts", "gateway", "roles/storage.objectViewer"),
                                 ("-artifacts", "preview", "roles/storage.objectViewer"),
                                 ("-build-source", "build", "roles/storage.objectViewer")):
        commands.append(["storage", "buckets", "add-iam-policy-binding", "gs://" + m["projectId"] + target,
            "--member", "serviceAccount:" + account(m, reader), "--role", role])
    for registry in ("jems-dev-images", "jems-dev-sandbox"):
        for reader, role in (("build", "roles/artifactregistry.writer"), ("release", "roles/artifactregistry.reader")):
            commands.append(["artifacts", "repositories", "add-iam-policy-binding", registry, "--location", m["region"],
                "--member", "serviceAccount:" + account(m, reader), "--role", role, "--condition=None"])
    for runtime in COMPONENTS:
        commands.append(["iam", "service-accounts", "add-iam-policy-binding", account(m, runtime),
            "--member", "serviceAccount:" + account(m, "release"), "--role", "roles/iam.serviceAccountUser", "--condition=None"])
    for target in (*COMPONENTS, "build"):
        commands.append(["iam", "service-accounts", "add-iam-policy-binding", account(m, target),
            "--member", "serviceAccount:" + account(m, "bootstrap"), "--role", "roles/iam.serviceAccountUser", "--condition=None"])
    return commands


def check_resource_grants(policy: object, expected: dict[str, set[str]], *, complete: bool, public_role: str | None = None) -> None:
    require(isinstance(policy, dict), "DEV resource policy unavailable")
    for binding in policy.get("bindings", []):
        public = {"allUsers", "allAuthenticatedUsers"} & set(binding.get("members", []))
        require(not public or (public == {"allUsers"} and binding.get("role") == public_role and not binding.get("condition")),
                "Public DEV data access forbidden outside the reviewed code-only sandbox registry")
        for member in binding.get("members", []):
            if member.startswith("serviceAccount:"):
                require(member in expected and binding.get("role") in expected[member] and not binding.get("condition"),
                        "Unexpected DEV resource identity grant")
    for member, roles in expected.items():
        found = roles_for(policy, member)
        require(found == roles if complete else found <= roles, "DEV resource grant incomplete or unexpected")


def validate_resource_policies(m: dict, cloud: Cloud, i: dict, *, complete: bool = False) -> None:
    """Existing unexpected access aborts before additive changes; never silently rewrites policies."""
    accounts = {x.get("email") for x in i.get("accounts", [])}
    for identity in IDENTITIES:
        email = account(m, identity)
        if email not in accounts:
            continue
        keys = cloud.run("iam", "service-accounts", "keys", "list", "--iam-account", email, "--managed-by", "user")
        require(keys == [], "DEV runtime identities must not have downloadable keys")
    secret_readers = {"app-config": "app", "gateway-config": "gateway", "preview-config": "preview",
                      "github-app-key": "gateway", "coach-key": "coach"}
    names = {x.get("name", "").split("/")[-1] for x in i.get("secrets", [])}
    for suffix, reader in secret_readers.items():
        name = "jems-dev-" + suffix
        if name not in names:
            continue
        policy = cloud.run("secrets", "get-iam-policy", name)
        require(isinstance(policy, dict), "DEV secret policy unavailable")
        for binding in policy.get("bindings", []):
            if binding.get("role") == "roles/secretmanager.secretAccessor":
                require(not binding.get("condition") and set(binding.get("members", [])) <=
                        {"serviceAccount:" + account(m, reader)}, "Unexpected DEV secret accessor")
        check_resource_grants(policy, {"serviceAccount:" + account(m, reader): {"roles/secretmanager.secretAccessor"},
            "serviceAccount:" + account(m, "release"): {"roles/secretmanager.viewer"}}, complete=complete)
    buckets = {str(x.get("name", "")).removeprefix("gs://").rstrip("/") for x in i.get("buckets", [])}
    for suffix, expected in (("-artifacts", {"gateway": {"roles/storage.objectCreator", "roles/storage.objectViewer"},
                                            "preview": {"roles/storage.objectViewer"}}),
                             ("-build-source", {"build": {"roles/storage.objectViewer"}})):
        if m["projectId"] + suffix in buckets:
            policy = cloud.run("storage", "buckets", "get-iam-policy", "gs://" + m["projectId"] + suffix)
            check_resource_grants(policy, {"serviceAccount:" + account(m, k): v for k, v in expected.items()}, complete=complete)
    for registry in ("jems-dev-images", "jems-dev-sandbox"):
        if any(x.get("name", "").endswith("/repositories/" + registry) for x in i.get("registries", [])):
            policy = cloud.run("artifacts", "repositories", "get-iam-policy", registry, "--location", m["region"])
            check_resource_grants(policy, {"serviceAccount:" + account(m, "build"): {"roles/artifactregistry.writer"},
                "serviceAccount:" + account(m, "release"): {"roles/artifactregistry.reader"}}, complete=complete,
                public_role="roles/artifactregistry.reader" if registry == "jems-dev-sandbox" and m["images"]["sandbox"] else None)
    if complete:
        for email, roles in wanted_project_roles(m).items():
            require(roles_for(i["projectPolicy"], "serviceAccount:" + email) == roles, "DEV project grant incomplete")


def run_bootstrap(m: dict, cloud: Cloud, apply: bool) -> dict:
    i = inventory(m, cloud)
    if apply and i.get("missingApis"):
        for args in mutations(m, i):
            cloud.run(*args)
        i = inventory(m, cloud)
        require(not i.get("missingApis"), "Required DEV APIs not yet available; recheck before continuing")
    if not i.get("missingApis"):
        validate_resource_policies(m, cloud, i)
    planned = mutations(m, i)
    if apply:
        for args in planned:
            cloud.run(*args)
        final = inventory(m, cloud)
        require(not final.get("missingApis"), "DEV foundation verification incomplete")
        validate_resource_policies(m, cloud, final, complete=True)
        remaining = [x for x in mutations(m, final) if x[0:2] in (["firestore", "databases"], ["services", "enable"])
                     or "create" in x]
        require(not remaining, "DEV foundation verification incomplete")
    return {**resource_summary(m), "mode": "apply" if apply else "read-only-check", "mutationCount": len(planned) if apply else 0,
            "foundationVerified": bool(apply), "pendingCommands": [] if apply else [cloud.command(x) for x in planned],
            "liveServicesDeployed": False, "paidAIActivated": False,
            "remaining": ["Populate only DEV secret payloads and pin numeric versions",
                "Publish verified DEV images by digest", "Create and protect the separate private DEV worker repository",
                "Install reviewed worker runner/WIF provisioning in DEV only; no VM permission was granted here",
                "Complete personal-project OAuth/IAP setup and observe exact audiences",
                "Use the DEV release controller, then verify actual login and end-to-end synthetic journeys"]}


def publish_sandbox(m: dict, cloud: Cloud, receipt: dict) -> dict:
    """Only this separate phase makes reviewed, source-built sandbox code public."""
    from dev_images import verify_existing_build
    require(m["images"]["sandbox"] is not None and isinstance(receipt, dict) and
            receipt.get("images", {}).get("sandbox") == m["images"]["sandbox"], "Exact DEV sandbox build receipt required")
    verify_project(m, cloud)
    # Re-read actual Cloud Build provenance/source generation rather than trust
    # a local JSON flag. The builder helper also verifies the DEV source SHA.
    verify_existing_build(m, cloud, receipt)
    current = inventory(m, cloud)
    require(not current.get("missingApis"), "DEV foundation unavailable")
    mutations(m, current)  # Validate all existing resource metadata before IAM write.
    validate_resource_policies(m, cloud, current, complete=True)
    cloud.run("artifacts", "repositories", "add-iam-policy-binding", "jems-dev-sandbox", "--location", m["region"],
              "--member", "allUsers", "--role", "roles/artifactregistry.reader", "--condition=None")
    policy = cloud.run("artifacts", "repositories", "get-iam-policy", "jems-dev-sandbox", "--location", m["region"])
    require(roles_for(policy, "allUsers") == {"roles/artifactregistry.reader"}, "Public sandbox read grant not verified")
    return {**resource_summary(m), "mode": "publish-code-only-sandbox", "sandboxImage": m["images"]["sandbox"],
            "publicSandboxReadVerified": True, "applicationRegistriesPublic": False, "paidAIVerified": False}


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--manifest", required=True)
    g = p.add_mutually_exclusive_group()
    g.add_argument("--check", action="store_true")
    g.add_argument("--apply", action="store_true")
    g.add_argument("--publish-sandbox", action="store_true")
    p.add_argument("--build-receipt", help="Cloud-verified DEV sandbox image build receipt")
    args = p.parse_args()
    try:
        m = read_manifest(args.manifest)
        cloud = Cloud(m)
        if args.publish_sandbox:
            from pathlib import Path
            require(bool(args.build_receipt), "Sandbox publication requires an exact build receipt")
            result = publish_sandbox(m, cloud, json.loads(Path(args.build_receipt).read_text()))
        elif args.check or args.apply:
            result = run_bootstrap(m, cloud, args.apply)
        else:
            result = {**resource_summary(m), "mode": "offline-plan", "commands": [cloud.command(x) for x in mutations(m)],
                "prerequisites": ["Separate billed DEV project labelled environment=development and application=jems",
                    "Keyless jems-dev-bootstrap identity with provisioning rights confined to that DEV project",
                    "Actual private DEV repository/installation IDs, reviewed SHAs, adult identities and independent spend cap"],
                "workerTrustCondition": worker_condition(m), "workerTrustInstalled": False,
                "liveServicesDeployed": False, "paidAIActivated": False}
        print(json.dumps(result, indent=2, sort_keys=True))
        return 0
    except (DevError, OSError, ValueError, TypeError, KeyError) as exc:
        print(str(exc) if isinstance(exc, DevError) else "DEV_INPUT_INVALID: inspect the private manifest/receipt", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
