#!/usr/bin/env python3
"""DEV-only first deployment, image staging, promotion and compatible rollback.

Default is an offline command plan. First deployment uses the separate DEV
bootstrap identity; routine image/traffic operations use jems-dev-release only.
No invocation accesses production, copies secrets, rotates worker trust, resets
stored data or issues a model call. Services and runtime payloads must implement
the committed DEV access contract before this tool is used.

References:
https://docs.cloud.google.com/run/docs/securing/identity-aware-proxy-cloud-run
https://docs.cloud.google.com/run/docs/reference/yaml/v1
https://docs.cloud.google.com/run/docs/rollouts-rollbacks-traffic-migration
https://docs.cloud.google.com/run/docs/configuring/services/secrets
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from dev_bootstrap import Cloud, verify_project
from dev_contract import (COMPONENTS, SECRETS, DevError, account, fingerprint, native_origin,
                          read_manifest, require, required_secrets, resource_summary, service, valid_image)

ORDER = ("coach", "preview", "gateway", "app")


def environment(m: dict, component: str) -> dict[str, str]:
    env = {"FACTORY_ENVIRONMENT": "development", "FACTORY_DEV_PROJECT_ID": m["projectId"],
           "FACTORY_DEV_PROJECT_NUMBER": m["projectNumber"], "FACTORY_DEV_REGION": m["region"]}
    if component == "app":
        return {**env, "JEMS_DEV_SITE_CONFIG": "/var/run/jems-dev/config.json"}
    if component in ("gateway", "preview"):
        env["FACTORY_PRIVATE_CONFIG"] = "/var/run/factory-config/config.json"
    if component in ("gateway", "coach"):
        env.update(m["coachEnvironment"])
        env.update({"FACTORY_ADULT_PILOT_MODE": "true", "FACTORY_ADULT_PILOT_OWNER_APPROVED": "true",
                    "FACTORY_ADULT_PILOT_PROFILE_ACCESS_VERIFIED": "true",
                    "FACTORY_COACH_MAX_MICRO_USD": str(m["budget"]["maxCoachTurnMicroUsd"])})
    if component == "gateway":
        env["FACTORY_ACTIONS_APPROVED"] = str(m["generationEnabled"]).lower()
    if component == "coach":
        env.update({"FACTORY_COACH_EXECUTION_ENV": "dedicated-cloud-run",
                    "FACTORY_COACH_PRIVATE_AUDIENCE": native_origin(m, "coach"),
                    "FACTORY_COACH_GATEWAY_SERVICE_ACCOUNT": account(m, "gateway")})
    return env


def mounts(m: dict, component: str) -> dict[str, str]:
    def ref(suffix: str) -> str:
        return "jems-dev-" + suffix + ":" + m["secretVersions"][suffix]
    if component == "app":
        return {"/var/run/jems-dev/config.json": ref("app-config")}
    if component == "gateway":
        return {"/var/run/factory-config/config.json": ref("gateway-config"),
                "/var/run/factory-github/key.pem": ref("github-app-key")}
    if component == "preview":
        return {"/var/run/factory-config/config.json": ref("preview-config")}
    return {"FACTORY_COACH_PRIVATE_OPENAI_API_KEY": ref("coach-key")} if m["coachEnvironment"].get("FACTORY_COACH_APPROVED") == "true" else {}


def secret_arguments(values: dict[str, str]) -> list[str]:
    return ["--set-secrets", ",".join(f"{k}={v}" for k, v in sorted(values.items()))] if values else ["--clear-secrets"]


def first_deploy_commands(m: dict, component: str) -> list[list[str]]:
    name = service(component)
    env, secret_mounts = environment(m, component), mounts(m, component)
    args = ["run", "deploy", name, "--region", m["region"], "--image", m["images"][component],
        "--service-account", account(m, component), "--execution-environment", "gen2", "--port", "8080",
        "--min-instances", "0", "--max-instances", "1", "--max", "1", "--concurrency", "1" if component == "coach" else "8",
        "--cpu", "1", "--memory", "512Mi", "--timeout", "60s", "--cpu-throttling", "--no-cpu-boost",
        "--ingress", "all", "--no-allow-unauthenticated", "--invoker-iam-check",
        "--set-env-vars", ",".join(f"{k}={v}" for k, v in sorted(env.items())),
        "--labels", "environment=development,application=jems,component=" + component]
    args.extend(secret_arguments(secret_mounts))
    if component in ("app", "preview"):
        args.append("--iap")
    commands = [args]
    if component in ("app", "preview"):
        member = f"serviceAccount:service-{m['projectNumber']}@gcp-sa-iap.iam.gserviceaccount.com"
    elif component == "coach":
        member = "serviceAccount:" + account(m, "gateway")
    else:
        # Cloud Run transport admits GitHub OIDC callbacks. Browser routes still
        # require verified signed IAP + ordinary device/session/CSRF checks.
        member = "allUsers"
    commands.append(["run", "services", "add-iam-policy-binding", name, "--region", m["region"],
                     "--member", member, "--role", "roles/run.invoker", "--condition=None"])
    if component in ("app", "preview"):
        for adult in m["allowedAdults"]:
            commands.append(["iap", "web", "add-iam-policy-binding", "--region", m["region"],
                "--resource-type", "cloud-run", "--service", name,
                "--member", "user:" + adult["email"], "--role", "roles/iap.httpsResourceAccessor"])
    return commands


def describe(m: dict, cloud: Cloud, component: str) -> dict:
    raw = cloud.run("run", "services", "describe", service(component), "--region", m["region"])
    require(isinstance(raw, dict), "DEV service metadata unavailable")
    return raw


def positive_traffic(raw: dict) -> dict[str, int]:
    result: dict[str, int] = {}
    for entry in raw.get("status", {}).get("traffic", []):
        percent = entry.get("percent", 0) or 0
        if percent:
            require(type(percent) is int and 1 <= percent <= 100 and bool(entry.get("revisionName")), "Ambiguous DEV traffic")
            name = entry["revisionName"]
            require(name not in result, "Duplicate serving DEV revision")
            result[name] = percent
    require(sum(result.values()) == 100, "DEV traffic must resolve to concrete revisions totaling 100")
    return result


def configured_mounts(spec: dict, container: dict) -> dict[str, str]:
    result = {}
    volumes = {v["name"]: v for v in spec.get("volumes", [])}
    for mount in container.get("volumeMounts", []):
        volume = volumes.get(mount.get("name"), {})
        secret = volume.get("secret", {})
        require(bool(secret.get("secretName")), "DEV unexpected volume")
        for item in secret.get("items", []):
            path = mount["mountPath"].rstrip("/") + "/" + item["path"]
            require(path not in result, "Duplicate DEV secret mount")
            result[path] = secret["secretName"] + ":" + item["key"]
    for item in container.get("env", []):
        source = item.get("valueFrom", {}).get("secretKeyRef")
        if source:
            result[item["name"]] = source["name"] + ":" + source["key"]
    return result


def verify_runtime(m: dict, component: str, template: dict, *, exact_image: bool) -> dict:
    spec = template.get("spec", {})
    require(spec.get("serviceAccountName") == account(m, component), "DEV runtime identity mismatch")
    require(spec.get("containerConcurrency") == (1 if component == "coach" else 8)
            and spec.get("timeoutSeconds") == 60, "DEV request limits changed")
    containers = spec.get("containers", [])
    require(len(containers) == 1, "DEV expects one reviewed container")
    c = containers[0]
    require(valid_image(m, component, c.get("image")), "DEV runtime image must be an isolated immutable digest")
    if exact_image:
        require(c.get("image") == m["images"][component], "DEV image differs from reviewed digest")
    require(not c.get("command") and not c.get("args"), "DEV image entrypoint override forbidden")
    limits = c.get("resources", {}).get("limits", {})
    require(limits.get("cpu") in ("1", "1000m") and limits.get("memory") == "512Mi", "DEV resource limits changed")
    require(len(c.get("ports", [])) == 1 and c["ports"][0].get("containerPort") == 8080, "DEV container port changed")
    actual_env = {v["name"]: v["value"] for v in c.get("env", []) if "value" in v}
    require(actual_env == environment(m, component), "DEV config drift: exact expected environment required")
    require(configured_mounts(spec, c) == mounts(m, component), "DEV mounted secret/version drift")
    scales = template.get("metadata", {}).get("annotations", {})
    require(scales.get("autoscaling.knative.dev/minScale", "0") == "0" and
            scales.get("autoscaling.knative.dev/maxScale") == "1", "DEV scaling limits changed")
    require(scales.get("run.googleapis.com/execution-environment") == "gen2" and
            scales.get("run.googleapis.com/cpu-throttling", "true") == "true" and
            scales.get("run.googleapis.com/startup-cpu-boost", "false") == "false", "DEV execution limits changed")
    require(not any("vpc-access" in key or "network-interface" in key for key in scales), "Unexpected DEV network attachment")
    return {"image": c["image"], "runtimeSha256": fingerprint({"identity": account(m, component),
        "environment": actual_env, "mounts": configured_mounts(spec, c), "concurrency": spec["containerConcurrency"],
        "timeoutSeconds": 60, "cpu": 1, "memory": "512Mi", "maxInstances": 1})}


def verify_service(m: dict, component: str, raw: dict, *, exact_image: bool = True) -> dict:
    metadata = raw.get("metadata", {})
    require(metadata.get("name") == service(component), "DEV service name mismatch")
    require(str(metadata.get("namespace")) == m["projectNumber"], "DEV service project mismatch")
    labels = metadata.get("labels", {})
    require(labels.get("environment") == "development" and labels.get("application") == "jems"
            and labels.get("component") == component, "DEV managed service labels required")
    annotations = metadata.get("annotations", {})
    require(annotations.get("run.googleapis.com/minScale", "0") == "0" and
            annotations.get("run.googleapis.com/maxScale") == "1", "DEV service scaling limits changed")
    require(annotations.get("run.googleapis.com/invoker-iam-disabled", "false") == "false", "DEV invoker IAM enforcement disabled")
    require(annotations.get("run.googleapis.com/ingress") == "all", "DEV ingress differs from reviewed contract")
    iap = annotations.get("run.googleapis.com/iap-enabled", "false")
    require(iap == ("true" if component in ("app", "preview") else "false"), "DEV IAP service policy mismatch")
    runtime = verify_runtime(m, component, raw.get("spec", {}).get("template", {}), exact_image=exact_image)
    status = raw.get("status", {})
    require(any(x.get("type") == "Ready" and x.get("status") == "True" for x in status.get("conditions", [])), "DEV service not ready")
    require(str(status.get("observedGeneration")) == str(metadata.get("generation")), "DEV reconciliation is incomplete")
    # gcloud may report the older hashed alias as status.url; the deterministic
    # hostname must be present among observed serving URLs, not merely computed.
    urls = {status.get("url")}
    reported = annotations.get("run.googleapis.com/urls")
    if reported:
        try:
            urls.update(json.loads(reported))
        except (TypeError, ValueError) as exc:
            raise DevError("Malformed DEV service URL metadata") from exc
    require(native_origin(m, component) in urls, "DEV native origin was not observed in service metadata")
    revision = status.get("latestReadyRevisionName", "")
    require(bool(re.fullmatch(re.escape(service(component)) + r"-[a-z0-9-]{1,45}", revision)), "Concrete ready DEV revision required")
    return {"service": service(component), "revision": revision, **runtime,
            "generation": str(metadata.get("generation")), "origin": native_origin(m, component), "traffic": positive_traffic(raw)}


def inspect_revision(m: dict, cloud: Cloud, component: str, revision: str, *, exact_image: bool = False) -> dict:
    require(bool(re.fullmatch(re.escape(service(component)) + r"-[a-z0-9-]{1,45}", revision)), "Concrete DEV revision required")
    raw = cloud.run("run", "revisions", "describe", revision, "--region", m["region"])
    require(isinstance(raw, dict), "DEV revision metadata unavailable")
    metadata = raw.get("metadata", {})
    require(metadata.get("name") == revision and str(metadata.get("namespace")) == m["projectNumber"] and
            metadata.get("labels", {}).get("serving.knative.dev/service") == service(component), "DEV revision identity mismatch")
    require(any(x.get("type") == "Ready" and x.get("status") == "True" for x in raw.get("status", {}).get("conditions", [])),
            "DEV prior revision no longer ready")
    runtime = verify_runtime(m, component, raw, exact_image=exact_image)
    return {"revision": revision, **runtime}


def verify_access(m: dict, cloud: Cloud, component: str, *, allow_missing: bool = False) -> None:
    policy = cloud.run("run", "services", "get-iam-policy", service(component), "--region", m["region"])
    expected = {"allUsers"} if component == "gateway" else {"serviceAccount:" + account(m, "gateway")} if component == "coach" else {
        f"serviceAccount:service-{m['projectNumber']}@gcp-sa-iap.iam.gserviceaccount.com"}
    found = set()
    for binding in policy.get("bindings", []):
        if binding.get("role") == "roles/run.invoker":
            require(not binding.get("condition"), "Unexpected conditional DEV invoker")
            found.update(binding.get("members", []))
    require(found <= expected if allow_missing else found == expected, "DEV invoker policy mismatch")
    if component in ("app", "preview"):
        iap = cloud.run("iap", "web", "get-iam-policy", "--region", m["region"],
                        "--resource-type", "cloud-run", "--service", service(component))
        allowed = {"user:" + adult["email"] for adult in m["allowedAdults"]}
        found = set()
        for binding in iap.get("bindings", []):
            if binding.get("role") == "roles/iap.httpsResourceAccessor":
                require(not binding.get("condition"), "Unexpected conditional adult DEV access")
                found.update(binding.get("members", []))
        require(found <= allowed if allow_missing else found == allowed, "DEV IAP adult allowlist mismatch")


def verify_build_receipts(m: dict, cloud: Cloud, receipts: list[dict] | None) -> None:
    require(isinstance(receipts, list) and 1 <= len(receipts) <= 5, "Verified image build receipts are required for every DEV release component")
    from dev_images import verify_release_images
    verified = verify_release_images(m, cloud, receipts)
    require(isinstance(verified, dict) and verified.get("images") == m["images"] and
            verified.get("selectedSourceSha") == m["sourceSha"], "DEV build receipts do not prove every selected source/image digest")


def preflight(m: dict, cloud: Cloud, receipts: list[dict] | None = None, *, verify_source: bool = True) -> dict[str, dict]:
    verify_project(m, cloud)
    if verify_source:
        verify_build_receipts(m, cloud, receipts)
    for suffix in required_secrets(m):
        meta = cloud.run("secrets", "versions", "describe", m["secretVersions"][suffix], "--secret", "jems-dev-" + suffix)
        expected = f"projects/{m['projectNumber']}/secrets/jems-dev-{suffix}/versions/{m['secretVersions'][suffix]}"
        require(isinstance(meta, dict) and meta.get("name") == expected and meta.get("state") == "ENABLED", "DEV exact secret version unavailable")
    for image in m["images"].values():
        meta = cloud.run("artifacts", "docker", "images", "describe", image)
        require(isinstance(meta, dict), "DEV image metadata unavailable")
        summary = meta.get("image_summary", meta.get("imageSummary", {}))
        require(summary.get("digest") == image.rsplit("@", 1)[1] and summary.get("fully_qualified_digest", summary.get("fullyQualifiedDigest")) == image,
                "DEV immutable image could not be independently verified")
    existing = cloud.run("run", "services", "list", "--region", m["region"])
    require(isinstance(existing, list), "DEV service inventory unavailable")
    return {x.get("metadata", {}).get("name"): x for x in existing}


def create(m: dict, cloud: Cloud, receipts: list[dict] | None = None) -> dict:
    existing = preflight(m, cloud, receipts)
    # Validate all pre-existing targets before writing any new service.
    for component in ORDER:
        if service(component) in existing:
            verify_service(m, component, describe(m, cloud, component))
            verify_access(m, cloud, component, allow_missing=True)
    states = {}
    for component in ORDER:
        commands = first_deploy_commands(m, component)
        if service(component) not in existing:
            cloud.run(*commands[0])
        # Runtime is ready and precisely configured before transport access is granted.
        verify_service(m, component, describe(m, cloud, component))
        verify_access(m, cloud, component, allow_missing=True)
        for command in commands[1:]:
            cloud.run(*command)
        states[component] = verify_service(m, component, describe(m, cloud, component))
        verify_access(m, cloud, component)
    return {**resource_summary(m), "mode": "first-deployment", "services": states, "cloudConfigurationVerified": True,
            "adultLoginVerified": False, "workerVerified": False, "paidAIVerified": False,
            "next": "Verify anonymous/unauthorized denial, allowed-adult login, separate preview login and bounded real synthetic journeys"}


def transition(m: dict, previous: dict | None) -> bool:
    if previous is None:
        return False
    # Identity, adult access and the lifetime ceiling do not change during an
    # application/config release. They require an explicit infrastructure review.
    for key in ("version", "environment", "projectId", "projectNumber", "region", "allowedAdults", "iap"):
        require(previous[key] == m[key], "DEV config stage cannot change isolation or adult-access scope")
    require(previous["budget"]["totalMicroUsd"] == m["budget"]["totalMicroUsd"], "DEV lifetime budget cannot be topped up by deployment")
    require({k: v for k, v in previous["worker"].items() if k != "sha"} ==
            {k: v for k, v in m["worker"].items() if k != "sha"}, "DEV worker identity migration needs a separate bootstrap review")
    if previous["worker"]["sha"] != m["worker"]["sha"] or previous["budget"]["maxJobMicroUsd"] != m["budget"]["maxJobMicroUsd"]:
        require(previous["secretVersions"]["gateway-config"] != m["secretVersions"]["gateway-config"],
                "DEV worker/job-cap change requires a new immutable gateway config version")
    return any(environment(previous, c) != environment(m, c) or mounts(previous, c) != mounts(m, c) for c in COMPONENTS)


def stage(m: dict, cloud: Cloud, previous: dict | None = None, receipts: list[dict] | None = None) -> dict:
    config_change = transition(m, previous)
    old_manifest = previous or m
    existing = preflight(m, cloud, receipts)
    require(all(service(c) in existing for c in COMPONENTS), "Use first-deployment before image staging")
    before = {}
    staged = set()
    expected_revision = "d" + m["sourceSha"][:8] + fingerprint(m)[:8]
    for component in ORDER:
        raw = describe(m, cloud, component)
        try:
            before[component] = verify_service(old_manifest, component, raw, exact_image=previous is not None)
        except DevError:
            require(config_change, "DEV prior configuration differs; explicit previous manifest required")
            before[component] = verify_service(m, component, raw)
            require(before[component]["revision"] == service(component) + "-" + expected_revision,
                    "DEV partial stage cannot adopt an unrelated revision")
            staged.add(component)
        verify_access(m, cloud, component)
        before[component]["servingRevisions"] = {revision: inspect_revision(old_manifest, cloud, component, revision, exact_image=previous is not None)
            for revision in before[component]["traffic"]}
    after = {}
    for component in ORDER:
        # Fail before changing another component if a concurrent writer changed
        # either its config, current revision or traffic since the snapshot.
        current = verify_service(m if component in staged else old_manifest, component, describe(m, cloud, component), exact_image=previous is not None)
        require(all(current[k] == before[component][k] for k in ("revision", "image", "runtimeSha256", "traffic")),
                "DEV service changed while staging")
        component_config_change = environment(old_manifest, component) != environment(m, component) or mounts(old_manifest, component) != mounts(m, component)
        if component not in staged and (before[component]["image"] != m["images"][component] or component_config_change):
            args = ["run", "services", "update", service(component), "--region", m["region"],
                "--image", m["images"][component], "--no-traffic",
                "--revision-suffix", expected_revision]
            if config_change:
                args.extend(["--set-env-vars", ",".join(f"{k}={v}" for k, v in sorted(environment(m, component).items()))])
                args.extend(secret_arguments(mounts(m, component)))
            cloud.run(*args)
        after[component] = verify_service(m, component, describe(m, cloud, component))
        require(after[component]["traffic"] == before[component]["traffic"], "DEV traffic changed while staging")
        after[component]["candidateRevision"] = inspect_revision(m, cloud, component, after[component]["revision"], exact_image=True)
    return {"version": 1, "environment": "development", "projectId": m["projectId"], "projectNumber": m["projectNumber"],
            "manifestSha256": fingerprint(m), "sourceSha": m["sourceSha"], "before": before, "candidate": after,
            "previousManifestSha256": fingerprint(old_manifest), "configChange": config_change,
            "rollbackSupported": not config_change, "status": "staged-no-traffic", "paidAIVerified": False,
            "recovery": "Reviewed forward config stage required" if config_change else "Exact prior serving revisions may be restored"}


def validate_receipt(m: dict, receipt: object) -> dict:
    require(isinstance(receipt, dict) and receipt.get("version") == 1 and receipt.get("environment") == "development"
            and receipt.get("projectId") == m["projectId"] and receipt.get("projectNumber") == m["projectNumber"]
            and receipt.get("manifestSha256") == fingerprint(m) and receipt.get("sourceSha") == m["sourceSha"]
            and receipt.get("status") == "staged-no-traffic", "Exact DEV staged receipt required")
    require(type(receipt.get("configChange")) is bool and receipt.get("rollbackSupported") is (not receipt["configChange"])
            and bool(re.fullmatch(r"[a-f0-9]{64}", receipt.get("previousManifestSha256", ""))), "DEV receipt config identity required")
    for group in ("before", "candidate"):
        require(isinstance(receipt.get(group), dict) and set(receipt[group]) == set(COMPONENTS), "Complete DEV revision receipt required")
        for component, state in receipt[group].items():
            prefix = service(component) + "-"
            require(isinstance(state, dict) and state.get("service") == service(component) and
                    bool(re.fullmatch(re.escape(prefix) + r"[a-z0-9-]{1,45}", state.get("revision", ""))), "DEV receipt revision mismatch")
            traffic = state.get("traffic", {})
            require(isinstance(traffic, dict) and all(type(v) is int and 1 <= v <= 100 and isinstance(k, str) and
                    re.fullmatch(re.escape(prefix) + r"[a-z0-9-]{1,45}", k) for k, v in traffic.items()) and
                    sum(traffic.values()) == 100, "DEV receipt traffic invalid")
            require(valid_image(m, component, state.get("image")) and
                    bool(re.fullmatch(r"[a-f0-9]{64}", state.get("runtimeSha256", ""))), "DEV receipt runtime identity invalid")
            if group == "candidate":
                require(state.get("image") == m["images"][component], "DEV receipt digest mismatch")
                require(state.get("candidateRevision") == {"revision": state["revision"], "image": state["image"],
                    "runtimeSha256": state["runtimeSha256"]}, "DEV candidate receipt is not bound to the actual revision")
            else:
                revisions = state.get("servingRevisions")
                require(isinstance(revisions, dict) and set(revisions) == set(traffic), "DEV serving revision evidence required")
                for revision, evidence in revisions.items():
                    require(isinstance(evidence, dict) and evidence.get("revision") == revision and
                        valid_image(m, component, evidence.get("image")) and
                        bool(re.fullmatch(r"[a-f0-9]{64}", evidence.get("runtimeSha256", ""))), "DEV serving revision receipt invalid")
    return receipt


def traffic(m: dict, cloud: Cloud, receipt: dict, rollback: bool, previous: dict | None = None, receipts: list[dict] | None = None) -> dict:
    validate_receipt(m, receipt)
    if receipt["configChange"]:
        require(not rollback, "DEV_CONFIG_ROLLBACK_REJECTED: review a forward config stage so revoked approvals cannot return")
        require(previous is not None and transition(m, previous) and fingerprint(previous) == receipt["previousManifestSha256"],
                "Exact previous DEV manifest required for config promotion")
    old_manifest = previous or m
    preflight(m, cloud, receipts, verify_source=not rollback)
    targets = {}
    for component in ORDER:
        current = verify_service(m, component, describe(m, cloud, component))
        verify_access(m, cloud, component)
        candidate = receipt["candidate"][component]
        old = receipt["before"][component]["traffic"]
        require(current["revision"] == candidate["revision"], "DEV candidate superseded; refuse stale traffic change")
        require(inspect_revision(m, cloud, component, candidate["revision"], exact_image=True) == candidate["candidateRevision"],
                "DEV candidate revision receipt mismatch")
        for revision, evidence in receipt["before"][component]["servingRevisions"].items():
            require(inspect_revision(old_manifest, cloud, component, revision) == evidence, "DEV prior serving revision receipt mismatch")
        allowed = [old, {candidate["revision"]: 100}]
        require(current["traffic"] in allowed, "Concurrent DEV traffic change; inspect before continuing")
        targets[component] = old if rollback else {candidate["revision"]: 100}
    # Jobs must use one protected environment concurrency group. Recheck each
    # service before mutation; no automatic retry of an uncertain traffic update.
    for component in (tuple(reversed(ORDER)) if rollback else ORDER):
        current = verify_service(m, component, describe(m, cloud, component))
        require(current["revision"] == receipt["candidate"][component]["revision"], "DEV candidate changed during promotion")
        allowed = [receipt["before"][component]["traffic"], {receipt["candidate"][component]["revision"]: 100}]
        require(current["traffic"] in allowed, "DEV traffic changed during promotion")
        if current["traffic"] != targets[component]:
            cloud.run("run", "services", "update-traffic", service(component), "--region", m["region"],
                      "--to-revisions", ",".join(f"{k}={v}" for k, v in sorted(targets[component].items())))
        observed = verify_service(m, component, describe(m, cloud, component))
        require(observed["traffic"] == targets[component], "DEV traffic update not verified; retain receipt and inspect")
    return {**resource_summary(m), "mode": "rollback" if rollback else "promote", "traffic": targets,
            "status": "prior-traffic-restored" if rollback else "candidate-serving-awaiting-acceptance",
            "adultLoginVerified": False, "paidAIVerified": False,
            "limitation": "Cloud metadata verification is not authenticated browser/provider acceptance"}


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--manifest", required=True)
    p.add_argument("--mode", choices=("plan", "check", "create", "stage", "promote", "rollback"), default="plan")
    p.add_argument("--receipt", help="Exact saved stage receipt, required for promotion or rollback")
    p.add_argument("--previous-manifest", help="Exact previously deployed manifest; required to stage/promote config changes")
    p.add_argument("--build-receipt", action="append", default=[], help="Verified image build receipt; repeat to cover all five component digests")
    args = p.parse_args()
    try:
        m = read_manifest(args.manifest, release=True)
        previous = read_manifest(args.previous_manifest, release=True) if args.previous_manifest else None
        receipts = []
        for path in args.build_receipt:
            data = Path(path).read_bytes()
            require(len(data) < 100_000, "DEV image build receipt too large")
            receipt = json.loads(data)
            require(isinstance(receipt, dict), "DEV image build receipt object required")
            receipts.append(receipt)
        require(previous is None or args.mode in ("stage", "promote"), "Previous manifest is only used for explicit config stage/promotion")
        cloud = Cloud(m, "bootstrap" if args.mode in ("plan", "create") else "release")
        if args.mode == "plan":
            result = {**resource_summary(m), "mode": "offline-release-plan", "commands": [cloud.command(command)
                for component in ORDER for command in first_deploy_commands(m, component)],
                "sourceVerification": "Live create/check/stage/promote require --build-receipt coverage of all five image digests",
                "next": "create, authenticate/smoke; subsequent releases: stage → promote → smoke, rollback to saved receipt on image-only failure"}
        elif args.mode == "check":
            preflight(m, cloud, receipts)
            states = {}
            for c in ORDER:
                states[c] = verify_service(m, c, describe(m, cloud, c))
                verify_access(m, cloud, c)
            result = {**resource_summary(m), "mode": "read-only-check", "services": states, "paidAIVerified": False}
        elif args.mode == "create":
            result = create(m, cloud, receipts)
        elif args.mode == "stage":
            result = stage(m, cloud, previous, receipts)
        else:
            require(bool(args.receipt), "A saved stage receipt is required")
            result = traffic(m, cloud, json.loads(Path(args.receipt).read_text()), args.mode == "rollback", previous, receipts)
        print(json.dumps(result, indent=2, sort_keys=True))
        return 0
    except (OSError, ValueError, TypeError, KeyError, DevError) as exc:
        print(str(exc) if isinstance(exc, DevError) else "DEV_INPUT_INVALID: inspect the private manifest/receipt", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
