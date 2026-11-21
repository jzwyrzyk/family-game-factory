#!/usr/bin/env python3
"""Read-only activation inventory. Reuses the reviewed continuity.py module.

Never prints configuration, credentials, device identifiers or game content.
Firestore reads retain serialized artifact references instead of fetching games.
"""
import argparse
from datetime import datetime, timezone
import importlib.util
import json
import math
from pathlib import Path
import re
import sys
import time
import urllib.request

PROJECT = "family-game-factory-jzw"
REGION = "us-east5"
REPO = "family-game-factory-lab/family-game-factory-worker"
NEW_P = "52729ad231179d633b2f15fa910aa2b23273a2d6"
OLD_P = "21c1b0ee593a9472395ff8a34ef830050d7e5068"
IMAGE = "ghcr.io/jzwyrzyk/family-game-factory-sandbox@sha256:83be22b96cdd83eaefa80c0ae321208bdff63f4ee926cc5ae28d064f91cee089"
ORIGINS = {
    "factory-gateway": "https://factory-gateway-ola734esta-ul.a.run.app",
    "factory-preview": "https://factory-preview-ola734esta-ul.a.run.app",
}
ADULT_FLAGS = ("FACTORY_ADULT_PILOT_MODE", "FACTORY_ADULT_PILOT_OWNER_APPROVED",
               "FACTORY_ADULT_PILOT_PROFILE_ACCESS_VERIFIED")
DAY = 86400000
MAX_STATE = 3 * 1024 * 1024


class AuditError(Exception):
    pass


def require(condition, code):
    if not condition:
        raise AuditError(code)


def integer(value, minimum=0, maximum=9007199254740991):
    return type(value) is int and minimum <= value <= maximum


def finite(value):
    return type(value) in (int, float) and math.isfinite(value)


def flag(value):
    return value if value in ("true", "false") else "missing_or_unexpected"


def config_summary(config, now_ms):
    require(isinstance(config, dict), "PRIVATE_CONFIG_INVALID")
    exact = {
        "projectId": PROJECT, "appOrigin": "https://jzwyrzyk.github.io",
        "gatewayOrigin": ORIGINS["factory-gateway"],
        "previewOrigin": ORIGINS["factory-preview"],
        "repository": "jzwyrzyk/family-game-factory", "repositoryId": "1458033181",
        "approvedSha": "dcb887e6a51ba000fda1ccc42b9d198f8b9895f9",
        "workerRepository": REPO, "workerRepositoryId": "1458899834",
        "workerWorkflow": "factory-private.yml",
    }
    require(all(config.get(k) == v for k, v in exact.items()), "PRIVATE_CONFIG_IDENTITY_MISMATCH")
    require(config.get("workerApprovedSha") in (OLD_P, NEW_P), "UNKNOWN_GATEWAY_WORKER_PIN")
    require(not config.get("localFile"), "DURABLE_FIRESTORE_REQUIRED")
    for key in ("familyId", "workspace"):
        value = config.get(key)
        require(isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9_-]{1,100}", value)
                and value not in ("__proto__", "constructor", "prototype"), "PERSISTENCE_IDENTITY_INVALID")
    approval = config.get("approval")
    require(type(config.get("active")) is bool and isinstance(approval, dict)
            and type(approval.get("enabled")) is bool, "PAID_CONFIG_INVALID")
    model = approval.get("model")
    require(isinstance(model, str) and re.fullmatch(r"[-a-zA-Z0-9.]{1,100}", model), "MODEL_INVALID")
    require(all(finite(approval.get(k)) and approval[k] > 0
                for k in ("inputUsdPerMillion", "outputUsdPerMillion")), "MODEL_RATES_INVALID")
    require(integer(approval.get("maxInputTokens"), 2000, 64000)
            and integer(approval.get("maxOutputTokens"), 1000, 16000)
            and integer(config.get("maxJobMicroUsd"), 1, 1000000), "MODEL_LIMITS_INVALID")
    date = approval.get("priceReviewedOn")
    require(isinstance(date, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", date), "PRICE_REVIEW_DATE_INVALID")
    try:
        reviewed_ms = datetime.strptime(date, "%Y-%m-%d").replace(tzinfo=timezone.utc).timestamp() * 1000
    except ValueError:
        raise AuditError("PRICE_REVIEW_DATE_INVALID") from None
    require(approval.get("reasoningEffort") in (None, "low", "medium"), "MODEL_REASONING_INVALID")
    return {
        "active": config["active"], "approvalEnabled": approval["enabled"],
        "workerApprovedSha": config["workerApprovedSha"],
        "workerPinMatchesNew": config["workerApprovedSha"] == NEW_P,
        "model": model, "reasoningEffort": approval.get("reasoningEffort"),
        "inputUsdPerMillion": approval["inputUsdPerMillion"],
        "outputUsdPerMillion": approval["outputUsdPerMillion"],
        "maxInputTokens": approval["maxInputTokens"], "maxOutputTokens": approval["maxOutputTokens"],
        "maxJobMicroUsd": config["maxJobMicroUsd"], "priceReviewedOn": date,
        "priceReviewCurrent": -DAY <= now_ms - reviewed_ms <= 31 * DAY,
        "approvalReferencePresent": isinstance(approval.get("approvalId"), str) and bool(approval["approvalId"]),
        "imageGenerationEnabled": (approval.get("images") or {}).get("enabled") is True
            if isinstance(approval.get("images"), (dict, type(None))) else False,
    }


def metadata_parts(records, root):
    require(isinstance(records, list) and len(records) == 1 and isinstance(records[0], dict),
            "PERSISTENCE_METADATA_INVALID")
    row = records[0]
    if row.get("missing") == root and "found" not in row:
        return None
    found = row.get("found")
    require(isinstance(found, dict) and found.get("name") == root, "PERSISTENCE_METADATA_INVALID")
    fields = found.get("fields", {})
    require(isinstance(fields, dict) and fields.get("version", {}).get("integerValue") == "1",
            "PERSISTENCE_SCHEMA_REJECTED")
    raw = fields.get("chunks", {}).get("integerValue")
    require(isinstance(raw, str) and re.fullmatch(r"[0-9]+", raw), "PERSISTENCE_SCHEMA_REJECTED")
    count = int(raw)
    require(1 <= count <= 16 and isinstance(row.get("readTime"), str), "PERSISTENCE_SCHEMA_REJECTED")
    return [f"{root}/chunks/{i}" for i in range(count)], row["readTime"]


def parse_chunks(records, names):
    require(isinstance(records, list) and len(records) == len(names), "PERSISTENCE_CHUNK_MISSING")
    chunks = {}
    for record in records:
        require(isinstance(record, dict) and isinstance(record.get("found"), dict), "PERSISTENCE_CHUNK_INVALID")
        found = record["found"]
        name = found.get("name")
        require(isinstance(name, str) and name in names and name not in chunks, "PERSISTENCE_CHUNK_INVALID")
        value = found.get("fields", {}).get("json", {}).get("stringValue")
        require(isinstance(value, str), "PERSISTENCE_CHUNK_INVALID")
        chunks[name] = value
    serialized = "".join(chunks[name] for name in names)
    require(len(serialized.encode("utf-8")) <= MAX_STATE, "PERSISTENCE_STATE_TOO_LARGE")
    try:
        state = json.loads(serialized)
    except ValueError:
        raise AuditError("PERSISTENCE_STATE_INVALID") from None
    require(isinstance(state, dict) and type(state.get("version")) is int and state["version"] == 1,
            "PERSISTENCE_SCHEMA_REJECTED")
    return state


def read_control_state(config, command, opener=urllib.request.urlopen):
    database = f"projects/{PROJECT}/databases/(default)"
    root = f"{database}/documents/factoryWorkspaces/{config['workspace']}/state/current"
    endpoint = f"https://firestore.googleapis.com/v1/{database}/documents:batchGet"
    token = command(["gcloud", "auth", "print-access-token"])

    def batch(names, fields, read_time=None):
        body = {"documents": names, "mask": {"fieldPaths": fields}}
        if read_time is not None:
            body["readTime"] = read_time
        request = urllib.request.Request(endpoint, data=json.dumps(body).encode(), method="POST",
            headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"})
        # Firestore documents:batchGet is a read operation, despite its POST verb.
        with opener(request, timeout=40) as response:
            raw = response.read(24 * 1024 * 1024 + 1)
        require(len(raw) <= 24 * 1024 * 1024, "PERSISTENCE_RESPONSE_TOO_LARGE")
        result = json.loads(raw)
        return result if isinstance(result, list) else [result]

    metadata = metadata_parts(batch([root], ["version", "chunks"]), root)
    if metadata is None:
        return None
    names, read_time = metadata
    return parse_chunks(batch(names, ["json"], read_time), names)


def state_summary(state, family, max_job, now_ms):
    if state is None:
        return {"workspaceExists": False, "ledger": None, "liveTrustedDevices": 0,
                "eligibleAdultDevices": 0, "parentAuthConfigured": False, "activeJobs": 0}
    for key in ("devices", "adultPilotPermits", "jobs"):
        require(isinstance(state.get(key, []), list) and all(isinstance(x, dict) for x in state.get(key, [])),
                "CONTROL_STATE_INVALID")
    require(isinstance(state.get("ledgers", {}), dict) and isinstance(state.get("parentAuth", {}), dict),
            "CONTROL_STATE_INVALID")
    ledger = state.get("ledgers", {}).get(family)
    ledger_report = None
    if ledger is not None:
        require(isinstance(ledger, dict) and all(integer(ledger.get(k)) for k in ("allowance", "used", "reserved"))
                and type(ledger.get("paidEnabled")) is bool and isinstance(ledger.get("month"), str)
                and re.fullmatch(r"\d{4}-\d{2}", ledger["month"]), "LEDGER_INVALID")
        current_month = datetime.fromtimestamp(now_ms / 1000, timezone.utc).strftime("%Y-%m")
        ledger_report = {k: ledger[k] for k in ("month", "allowance", "used", "reserved", "paidEnabled")}
        ledger_report.update(currentMonth=ledger["month"] == current_month,
                             roomForOneJob=ledger["used"] + ledger["reserved"] + max_job <= ledger["allowance"])
    devices = [d for d in state.get("devices", []) if d.get("familyId") == family]
    live = {d.get("id") for d in devices if isinstance(d.get("id"), str) and "revokedAt" not in d
            and finite(d.get("expiresAt")) and d["expiresAt"] > now_ms
            and finite(d.get("lastSeenAt")) and d["lastSeenAt"] + 90 * DAY > now_ms}
    permits = [p for p in state.get("adultPilotPermits", []) if p.get("familyId") == family]
    eligible = [p for p in permits if p.get("deviceId") in live and "revokedAt" not in p
                and integer(p.get("approvedAt")) and p["approvedAt"] <= now_ms
                and integer(p.get("expiresAt")) and now_ms < p["expiresAt"] <= p["approvedAt"] + 14 * DAY
                and isinstance(p.get("receiptHash"), str) and re.fullmatch(r"[a-f0-9]{64}", p["receiptHash"])]
    auth = state.get("parentAuth", {}).get(family)
    auth_configured = isinstance(auth, dict) and isinstance(auth.get("salt"), str) and isinstance(auth.get("digest"), str)
    auth_configured = bool(auth_configured and re.fullmatch(r"[a-f0-9]{32}", auth["salt"])
                           and re.fullmatch(r"[a-f0-9]{64}", auth["digest"]))
    return {
        "workspaceExists": True, "ledger": ledger_report,
        "liveTrustedDevices": len(live), "eligibleAdultDevices": len({p["deviceId"] for p in eligible}),
        "liveAdultPermits": len(eligible),
        "expiredAdultPermits": sum(finite(p.get("expiresAt")) and p["expiresAt"] <= now_ms for p in permits),
        "parentAuthConfigured": auth_configured,
        "parentAuthLocked": bool(isinstance(auth, dict) and finite(auth.get("lockedUntil")) and auth["lockedUntil"] > now_ms),
        "activeJobs": sum(j.get("familyId") == family and j.get("status") in ("draft", "queued", "building", "testing")
                          for j in state.get("jobs", [])),
    }


def require_consumed_config_mount(service):
    """Prove the mounted secret is the file gateway.ts actually consumes."""
    template = service.get("spec", {}).get("template", {}).get("spec", {})
    containers = template.get("containers", [])
    require(len(containers) == 1, "GATEWAY_CONFIG_CONSUMER_UNVERIFIED")
    container = containers[0]
    environment = container.get("env", [])
    configured = [item for item in environment if item.get("name") == "FACTORY_PRIVATE_CONFIG"]
    require(len(configured) == 1 and configured[0].get("value") == "/var/run/factory-config/config.json"
            and "valueFrom" not in configured[0], "GATEWAY_CONFIG_PATH_UNVERIFIED")
    bootstrap = [item for item in environment if item.get("name") == "FACTORY_BOOTSTRAP"]
    require(not bootstrap or (len(bootstrap) == 1 and isinstance(bootstrap[0].get("value"), str)
            and bootstrap[0]["value"] != "true" and "valueFrom" not in bootstrap[0]),
            "GATEWAY_BOOTSTRAP_BYPASSES_CONFIG")
    mounts = [item for item in container.get("volumeMounts", [])
              if item.get("mountPath") == "/var/run/factory-config"]
    require(len(mounts) == 1 and isinstance(mounts[0].get("name"), str), "GATEWAY_CONFIG_MOUNT_UNVERIFIED")
    volumes = [item for item in template.get("volumes", []) if item.get("name") == mounts[0]["name"]]
    require(len(volumes) == 1, "GATEWAY_CONFIG_MOUNT_UNVERIFIED")
    secret = volumes[0].get("secret", {})
    items = secret.get("items", [])
    require(secret.get("secretName") == "factory-gateway-private-config" and len(items) == 1
            and items[0].get("path") == "config.json", "GATEWAY_CONFIG_SECRET_PATH_UNVERIFIED")


def audit(c):
    services = {}
    service_report = {}
    for name in ("factory-gateway", "factory-preview", "factory-coach-private"):
        service = c.command_json(["gcloud", "run", "services", "describe", name,
                                  "--project=" + PROJECT, "--region=" + REGION, "--format=json"])
        status = service.get("status", {})
        require(service.get("metadata", {}).get("name") == name, "SERVICE_IDENTITY_MISMATCH")
        require(c.ready(service) and status.get("latestCreatedRevisionName") == status.get("latestReadyRevisionName"),
                "SERVICE_NOT_SINGLE_READY_REVISION")
        if name in ORIGINS:
            require(status.get("url") == ORIGINS[name], "SERVICE_ORIGIN_MISMATCH")
        env = c.env_of(service)
        service_report[name] = {"revision": status["latestReadyRevisionName"], "readyAt100Percent": True}
        if name != "factory-preview":
            service_report[name]["adultFlags"] = {k: flag(env.get(k)) for k in ADULT_FLAGS}
        if name == "factory-gateway":
            service_report[name]["paidSwitch"] = flag(env.get("FACTORY_ACTIONS_APPROVED"))
        services[name] = service
    require_consumed_config_mount(services["factory-gateway"])
    mounted = c.mounted_config(services["factory-gateway"])
    require(mounted is not None, "PINNED_PRIVATE_CONFIG_VERSION_UNVERIFIED")
    config = json.loads(c.command(["gcloud", "secrets", "versions", "access", mounted[1],
                                   "--secret=" + mounted[0], "--project=" + PROJECT]))
    now_ms = time.time() * 1000
    sanitized_config = config_summary(config, now_ms)
    sanitized_config["mountedSecretVersion"] = mounted[1]
    require(not config.get("coachPrivateOrigin") or config["coachPrivateOrigin"] == services["factory-coach-private"]["status"].get("url"),
            "PRIVATE_COACH_ORIGIN_MISMATCH")
    def gh(path):
        return c.command_json(["gh", "api", "repos/" + REPO + "/" + path])
    main = gh("git/ref/heads/main")
    tag = gh("git/ref/tags/factory-execution-" + NEW_P)
    values = {name: gh("actions/variables/" + name).get("value") for name in
              ("FACTORY_PRIVATE_WORKER_SHA", "FACTORY_SANDBOX_IMAGE", "FACTORY_ACTIONS_APPROVED", "FACTORY_RUNNER_SMOKE_APPROVED")}
    require(all(ref.get("object", {}).get("type") == "commit" and ref["object"].get("sha") == NEW_P for ref in (main, tag))
            and values["FACTORY_PRIVATE_WORKER_SHA"] == NEW_P, "PRIVATE_WORKER_PIN_MISMATCH")
    require(values["FACTORY_SANDBOX_IMAGE"] == IMAGE, "SANDBOX_IMAGE_PIN_MISMATCH")
    wif = c.command_json(["gcloud", "iam", "workload-identity-pools", "providers", "describe", "private-worker",
                          "--project=" + PROJECT, "--location=global", "--workload-identity-pool=fgf-github", "--format=json"])
    matched = []
    for candidate in (OLD_P, NEW_P):
        try:
            c.check_wif(wif, candidate)
            matched.append(candidate)
        except c.ContinuityError:
            pass
    require(len(matched) == 1, "UNKNOWN_OR_WEAKENED_WIF_PIN")
    state = read_control_state(config, c.command)
    return {
        "result": "READ_ONLY_PREACTIVATION_AUDIT_COMPLETE", "mutations": 0,
        "services": service_report, "gatewayConfig": sanitized_config,
        "worker": {"mainTagVariableSha": NEW_P, "sandboxImageMatched": True,
                   "paidSwitch": flag(values["FACTORY_ACTIONS_APPROVED"]),
                   "smokeSwitch": flag(values["FACTORY_RUNNER_SMOKE_APPROVED"])},
        "wif": {"continuityRestrictionsMatched": True, "workflowSha": matched[0],
                "matchesNewWorker": matched[0] == NEW_P,
                "infrastructureEnvironmentReferenced": "factory-infrastructure" in wif.get("attributeCondition", "")},
        "controlState": state_summary(state, config["familyId"], config["maxJobMicroUsd"], now_ms),
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--continuity", type=Path, default=Path(__file__).with_name("continuity.py"),
                        help="Reviewed continuity.py from pinned public source (default: sibling file)")
    args = parser.parse_args(argv)
    try:
        spec = importlib.util.spec_from_file_location("reviewed_continuity", args.continuity.resolve())
        c = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(c)
        print(json.dumps(audit(c), indent=2, sort_keys=True))
        return 0
    except Exception as error:
        code = str(error) if isinstance(error, AuditError) else "READ_ONLY_AUDIT_UNAVAILABLE"
        if not re.fullmatch(r"[A-Z][A-Z0-9_]{2,80}", code):
            code = "READ_ONLY_AUDIT_UNAVAILABLE"
        print("AUDIT_FAILED=" + code, file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
