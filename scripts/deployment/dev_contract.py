#!/usr/bin/env python3
"""Finite, DEV-only deployment contract. No cloud calls and no secret material.

Unknown installation IDs, adult identities and spending limits are required inputs.
The example manifest is deliberately incomplete; it cannot authorize deployment.
"""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

PRODUCTION_PROJECT = "family-game-factory-jzw"
PRODUCTION_NUMBER = "1054529152893"
PRODUCTION_WORKER_ID = "1458899834"
PRODUCTION_WORKER = "family-game-factory-lab/family-game-factory-worker"
PRODUCTION_HOSTS = {
    "jzwyrzyk.github.io", "factory-gateway-ola734esta-ul.a.run.app",
    "factory-preview-ola734esta-ul.a.run.app", "factory-coach-private-ola734esta-ul.a.run.app",
}
COMPONENTS = ("app", "gateway", "preview", "coach")
IDENTITIES = (*COMPONENTS, "build", "release", "worker-provisioner")
SECRETS = ("app-config", "gateway-config", "preview-config", "github-app-key", "coach-key")
APIS = ("run.googleapis.com", "iap.googleapis.com", "firestore.googleapis.com",
        "secretmanager.googleapis.com", "artifactregistry.googleapis.com", "cloudbuild.googleapis.com",
        "iam.googleapis.com", "iamcredentials.googleapis.com", "storage.googleapis.com",
        "logging.googleapis.com", "sts.googleapis.com", "speech.googleapis.com")
SHA = re.compile(r"[a-f0-9]{40}")
DIGEST = re.compile(r"sha256:[a-f0-9]{64}")
COACH_FIELDS = {"FACTORY_COACH_" + key for key in (
    "APPROVED", "PRIVACY_APPROVED", "SAFEGUARDS_APPROVED", "ZDR_VERIFIED", "PRIVATE_EXECUTION_APPROVED",
    "MODEL", "INPUT_CHARS", "OUTPUT_TOKENS", "INPUT_PRICE", "OUTPUT_PRICE", "PRICES_REVIEWED",
    "AUDIO_APPROVED", "AUDIO_PRIVACY_APPROVED", "AUDIO_PROVIDER_VERIFIED", "AUDIO_PARENT_CONSENT_APPROVED",
    "AUDIO_PROJECT", "AUDIO_MAX_MICRO_USD", "AUDIO_PRICES_REVIEWED")}


class DevError(RuntimeError):
    """Sanitized actionable error; never interpolate arbitrary config or CLI output."""


def require(ok: bool, message: str) -> None:
    if not ok:
        raise DevError(message)


def record(value: object, keys: set[str], label: str) -> dict:
    require(isinstance(value, dict) and set(value) == keys, f"{label}: exact documented keys required")
    return value  # type: ignore[return-value]


def number(value: object, minimum: int, maximum: int, label: str) -> int:
    require(type(value) is int and minimum <= value <= maximum, f"{label}: explicit bounded integer required")
    return value  # type: ignore[return-value]


def numeric_id(value: object) -> bool:
    return isinstance(value, str) and bool(re.fullmatch(r"[1-9][0-9]{0,19}", value)) and int(value) <= 9_007_199_254_740_991


def reject_production(value: object) -> None:
    """Reject production destinations/identities at every nesting depth, before execution."""
    if isinstance(value, dict):
        for key, item in value.items():
            reject_production(key)
            reject_production(item)
    elif isinstance(value, list):
        for item in value:
            reject_production(item)
    elif isinstance(value, str):
        require(not any(re.search(r"(?<![a-z0-9_-])" + re.escape(x) + r"(?![a-z0-9_-])", value.lower())
                for x in (PRODUCTION_PROJECT, PRODUCTION_NUMBER, PRODUCTION_WORKER,
                          PRODUCTION_WORKER_ID, *PRODUCTION_HOSTS)), "PRODUCTION_TARGET_REJECTED")


def service(component: str) -> str:
    require(component in COMPONENTS, "Unknown DEV component")
    return "jems-dev-" + component


def account(manifest: dict, component: str) -> str:
    require(component in (*IDENTITIES, "bootstrap"), "Unknown DEV identity")
    return f"jems-dev-{component}@{manifest['projectId']}.iam.gserviceaccount.com"


def native_origin(manifest: dict, component: str) -> str:
    # Google documents this deterministic Cloud Run URL. Live verification remains required.
    return f"https://{service(component)}-{manifest['projectNumber']}.{manifest['region']}.run.app"


def fingerprint(manifest: dict) -> str:
    return hashlib.sha256(json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def valid_image(m: dict, component: str, value: object) -> bool:
    registry = "jems-dev-sandbox" if component == "sandbox" else "jems-dev-images"
    prefix = f"{m['region']}-docker.pkg.dev/{m['projectId']}/{registry}/{component}@"
    return isinstance(value, str) and value.startswith(prefix) and bool(DIGEST.fullmatch(value[len(prefix):]))


def required_secrets(m: dict) -> tuple[str, ...]:
    return tuple(name for name in SECRETS if name != "coach-key" or m["coachEnvironment"].get("FACTORY_COACH_APPROVED") == "true")


def validate(raw: object, *, release: bool = False) -> dict:
    m = record(raw, {"version", "environment", "projectId", "projectNumber", "region", "sourceSha",
        "allowedAdults", "worker", "budget", "images", "secretVersions", "iap", "coachEnvironment", "generationEnabled"}, "manifest")
    reject_production(m)
    require(m["version"] == 1 and type(m["version"]) is int and m["environment"] == "development", "DEV_MANIFEST_REQUIRED")
    require(type(m["generationEnabled"]) is bool, "Explicit DEV generation activation boolean required")
    require(isinstance(m["projectId"], str) and bool(re.fullmatch(r"[a-z][a-z0-9-]{4,28}[a-z0-9]", m["projectId"]))
            and ("-dev-" in m["projectId"] or m["projectId"].endswith("-dev")), "Explicit separate DEV project ID required")
    require(numeric_id(m["projectNumber"]), "Actual DEV project number required")
    require(isinstance(m["region"], str) and bool(re.fullmatch(r"[a-z]+-[a-z]+[0-9]", m["region"])), "Exact GCP region required")
    require(isinstance(m["sourceSha"], str) and bool(SHA.fullmatch(m["sourceSha"])), "Exact reviewed application source SHA required")
    adults = m["allowedAdults"]
    require(isinstance(adults, list) and 1 <= len(adults) <= 10, "One to ten explicitly verified adults required")
    seen: set[str] = set()
    emails: set[str] = set()
    for adult in adults:
        record(adult, {"subject", "email", "operatorConfirmedAdult"}, "adult")
        require(isinstance(adult["subject"], str) and bool(re.fullmatch(r"accounts\.google\.com:[0-9]{6,30}", adult["subject"])), "Actual Google adult subject required")
        require(isinstance(adult["email"], str) and bool(re.fullmatch(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,63}", adult["email"]))
                and len(adult["email"]) <= 254 and adult["email"] == adult["email"].lower(), "Exact lowercase adult email required")
        require(adult["operatorConfirmedAdult"] is True and adult["subject"] not in seen and adult["email"] not in emails, "Adult confirmation and unique identities required")
        seen.add(adult["subject"])
        emails.add(adult["email"])
    w = record(m["worker"], {"repository", "repositoryId", "ownerId", "workflow", "sha", "runnerGroupId", "githubAppId", "githubInstallationId"}, "worker")
    require(isinstance(w["repository"], str) and bool(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9-]{0,38}/[A-Za-z0-9_.-]+-dev", w["repository"])), "Separate private DEV worker repository required")
    for key in ("repositoryId", "ownerId", "runnerGroupId", "githubAppId", "githubInstallationId"):
        require(numeric_id(w[key]), f"worker.{key}: actual verified ID required")
    require(w["githubAppId"] != "5765875" and w["githubInstallationId"] != "182105358",
            "Separate DEV GitHub App/installation required; documented production dispatch identities are forbidden")
    require(w["workflow"] == "factory-private-dev.yml" and isinstance(w["sha"], str) and bool(SHA.fullmatch(w["sha"])), "Exact DEV workflow and SHA required")
    b = record(m["budget"], {"totalMicroUsd", "maxJobMicroUsd", "maxCoachTurnMicroUsd"}, "budget")
    number(b["totalMicroUsd"], 1, 50_000_000, "budget.totalMicroUsd")
    number(b["maxJobMicroUsd"], 1, min(1_000_000, b["totalMicroUsd"]), "budget.maxJobMicroUsd")
    number(b["maxCoachTurnMicroUsd"], 1, min(100_000, b["totalMicroUsd"]), "budget.maxCoachTurnMicroUsd")
    images = record(m["images"], set(COMPONENTS) | {"sandbox"}, "images")
    for component, image in images.items():
        if image is None and not release:
            continue
        require(valid_image(m, component, image), "Each image must use an immutable digest in the DEV registry")
    versions = record(m["secretVersions"], set(SECRETS), "secretVersions")
    require(isinstance(m["coachEnvironment"], dict), "coachEnvironment object required")
    for name, value in versions.items():
        if value is None and (not release or (name == "coach-key" and m["coachEnvironment"].get("FACTORY_COACH_APPROVED") != "true")):
            continue
        require(isinstance(value, str) and bool(re.fullmatch(r"[1-9][0-9]*", value)), "Numeric DEV secret versions required; latest is forbidden")
    iap = record(m["iap"], {"oauthConfigured", "appAudience", "previewAudience"}, "iap")
    require(type(iap["oauthConfigured"]) is bool, "iap.oauthConfigured must be boolean")
    for component in ("app", "preview"):
        value = iap[component + "Audience"]
        if value is None and not release:
            continue
        expected = f"/projects/{m['projectNumber']}/locations/{m['region']}/services/{service(component)}"
        require(value == expected, "Exact observed DEV Cloud Run IAP audience required")
    if release:
        require(iap["oauthConfigured"], "IAP_OAUTH_SETUP_REQUIRED: complete and verify the DEV project's OAuth setup first")
    require(isinstance(m["coachEnvironment"], dict), "coachEnvironment object required")
    # Model identity/pricing/approval entries are private operator choices, never inferred.
    for key, value in m["coachEnvironment"].items():
        require(key in COACH_FIELDS and
                isinstance(value, str) and 1 <= len(value) <= 256 and "\n" not in value and "," not in value,
                "Only documented non-secret coach provider/approval values are accepted")
        if key.endswith(("APPROVED", "VERIFIED")):
            require(value in ("true", "false"), "Explicit coach approval boolean required")
        if key == "FACTORY_COACH_AUDIO_PROJECT":
            require(value == m["projectId"], "Speech must use the separate DEV project")
        if key == "FACTORY_COACH_AUDIO_MAX_MICRO_USD":
            require(bool(re.fullmatch(r"[0-9]+", value)) and 1000 <= int(value) <= min(100_000, b["totalMicroUsd"]), "Bounded DEV speech cap required")
    return m


def read_manifest(path: str, *, release: bool = False) -> dict:
    try:
        data = Path(path).read_bytes()
        require(len(data) < 100_000, "Manifest too large")
        return validate(json.loads(data), release=release)
    except (OSError, ValueError, TypeError) as exc:
        raise DevError("Cannot read a valid DEV manifest") from exc


def resource_summary(m: dict) -> dict:
    return {"environment": "development", "projectId": m["projectId"], "projectNumber": m["projectNumber"],
        "region": m["region"], "manifestSha256": fingerprint(m),
        "services": {c: service(c) for c in COMPONENTS},
        "identities": {c: account(m, c) for c in IDENTITIES},
        "artifactBucket": m["projectId"] + "-artifacts", "database": "(default)",
        "workspace": "dev-synthetic", "familyId": "dev-synthetic",
        "registry": "jems-dev-images", "sandboxRegistry": "jems-dev-sandbox", "secretNames": ["jems-dev-" + s for s in SECRETS],
        "workerRepository": m["worker"]["repository"], "workerSha": m["worker"]["sha"],
        "applicationSha": m["sourceSha"], "budget": m["budget"], "budgetScope": "Model admission only; cloud/registry/storage/NAT/VM charges are separate",
        "acceptance": "Configuration plan only; live login, provider behavior, sandbox and browser journeys require separate evidence"}
