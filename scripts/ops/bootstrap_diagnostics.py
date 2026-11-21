#!/usr/bin/env python3
"""Bootstrap one exact Codex OIDC identity for Jems diagnostics; offline plan by default.

Run in an administrator's authenticated environment, using non-secret trust values
copied from the actual Codex environment UI. Never supply a token or private key.
This script installs grants; it does not activate or prove the Codex connection.
"""

import argparse
import json
import re
import subprocess
import sys
from dataclasses import dataclass
from urllib.parse import urlsplit

PROJECT = "family-game-factory-jzw"
PROJECT_NUMBER = "1054529152893"
REGION = "us-east5"
SERVICES = ("factory-gateway", "factory-preview", "factory-coach-private")
ACCOUNT = POOL = "jems-codex-diagnostics"
PROVIDER = "codex-environment"
ROLE_ID = "jemsCodexDiagnostics"
ROLE = f"projects/{PROJECT}/roles/{ROLE_ID}"
EMAIL = f"{ACCOUNT}@{PROJECT}.iam.gserviceaccount.com"
SA_MEMBER = f"serviceAccount:{EMAIL}"
MARKER = "Jems Codex diagnostics bootstrap v1; read-only; exact OIDC trust"
TITLE = "Jems Codex diagnostics"
PERMISSIONS = ("run.services.get", "run.services.getIamPolicy",
               "run.revisions.get", "run.revisions.list")
REQUIRED_APIS = {"iam.googleapis.com", "iamcredentials.googleapis.com",
                 "sts.googleapis.com", "run.googleapis.com"}


class BootstrapError(RuntimeError):
    """No automatic widening or destructive conflict resolution is permitted."""


def exact_value(value, label):
    if (not value or len(value) > 2048 or value != value.strip()
            or any(c.isspace() or ord(c) < 32 for c in value)
            or any(c in value for c in "*?[],") or value.startswith("-")):
        raise BootstrapError(f"{label} must be one exact, nonempty value without wildcards or whitespace")
    if value.count(".") == 2 and value.startswith("eyJ"):
        raise BootstrapError(f"{label} must be a non-secret configuration value, not a JWT")
    return value


@dataclass(frozen=True)
class Trust:
    issuer: str
    audience: str
    subject: str

    def __post_init__(self):
        for label in ("issuer", "audience", "subject"):
            exact_value(getattr(self, label), label)
        try:
            uri = urlsplit(self.issuer)
            valid = (uri.scheme == "https" and uri.hostname and uri.port in (None, 443)
                     and not uri.username and not uri.password and not uri.query
                     and not uri.fragment and "\\" not in self.issuer)
        except ValueError:
            valid = False
        if not valid:
            raise BootstrapError("issuer must be an HTTPS URL without credentials, query or fragment")
        if len(self.subject.encode("utf-8")) > 127:
            raise BootstrapError("subject exceeds Google Workload Identity Federation's 127-byte limit")
        if (not re.fullmatch(r"[A-Za-z0-9_.:/@-]+", self.subject)
                or any(part in (".", "..") for part in self.subject.split("/"))):
            raise BootstrapError("subject contains unsupported URI characters; copy the exact value without encoding or altering it, then review its principal representation")

    @property
    def condition(self):
        return f"assertion.sub == {json.dumps(self.subject)} && assertion.aud == {json.dumps(self.audience)}"

    @property
    def principal(self):
        return (f"principal://iam.googleapis.com/projects/{PROJECT_NUMBER}/locations/global/"
                f"workloadIdentityPools/{POOL}/subject/{self.subject}")

    @property
    def provider_name(self):
        return (f"projects/{PROJECT_NUMBER}/locations/global/"
                f"workloadIdentityPools/{POOL}/providers/{PROVIDER}")


def gcloud(*args, missing_ok=False):
    command = ["gcloud", *args, f"--project={PROJECT}", "--quiet", "--format=json"]
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=60, check=False)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise BootstrapError(f"gcloud unavailable or timed out during {' '.join(args[:3])}") from exc
    if result.returncode:
        codes = re.findall(r"\b(?:NOT_FOUND|PERMISSION_DENIED|UNAUTHENTICATED|SERVICE_DISABLED)\b", result.stderr)
        if missing_ok and "NOT_FOUND" in codes and not set(codes) - {"NOT_FOUND"}:
            return None
        raise BootstrapError(f"gcloud {' '.join(args[:3])} failed ({','.join(sorted(set(codes))) or result.returncode}); check authentication, APIs and administrator access")
    try:
        return json.loads(result.stdout) if result.stdout.strip() else {}
    except json.JSONDecodeError as exc:
        raise BootstrapError("gcloud returned invalid JSON; stopped without trusting that response") from exc


def require_matches(value, expected, label):
    if any(value.get(key) != wanted for key, wanted in expected.items()):
        raise BootstrapError(f"Conflicting existing {label}; refusing to change or reuse it")


def binding_exists(policy, member, role, label, exclusive=False):
    found = False
    for binding in policy.get("bindings", []):
        members = binding.get("members", [])
        if exclusive or member in members:
            if (binding.get("role") != role or binding.get("condition")
                    or (exclusive and set(members) != {member})):
                raise BootstrapError(f"Unexpected grant on {label}; refusing to widen or repair access")
            found = True
    return found


def preflight(trust, run=gcloud):
    """Read every affected resource before returning a list of additive mutations."""
    project = run("projects", "describe", PROJECT)
    require_matches(project, {"projectId": PROJECT, "projectNumber": PROJECT_NUMBER,
                              "lifecycleState": "ACTIVE"}, "project identity")
    enabled = run("services", "list", "--enabled")
    missing = REQUIRED_APIS - {s.get("config", {}).get("name") for s in enabled}
    if missing:
        raise BootstrapError("Required APIs are not enabled: " + ", ".join(sorted(missing)) + "; this bootstrap never enables APIs")
    project_policy = run("projects", "get-iam-policy", PROJECT)
    if any(SA_MEMBER in b.get("members", []) for b in project_policy.get("bindings", [])):
        raise BootstrapError("Diagnostics identity already has a direct project grant; refusing reuse")

    pending = []
    sa = run("iam", "service-accounts", "describe", EMAIL, missing_ok=True)
    if sa is None:
        pending.append(["iam", "service-accounts", "create", ACCOUNT,
                        f"--display-name={TITLE}", f"--description={MARKER}"])
    else:
        require_matches(sa, {"email": EMAIL, "displayName": TITLE, "description": MARKER}, "service account")
        if sa.get("disabled"):
            raise BootstrapError("Existing diagnostics service account is disabled")
        if run("iam", "service-accounts", "keys", "list", f"--iam-account={EMAIL}", "--managed-by=user"):
            raise BootstrapError("Existing diagnostics service account has user-managed keys")
    policy = run("iam", "service-accounts", "get-iam-policy", EMAIL) if sa else {}
    if not binding_exists(policy, trust.principal, "roles/iam.workloadIdentityUser", "diagnostics service account", exclusive=True):
        pending.append(["iam", "service-accounts", "add-iam-policy-binding", EMAIL,
                        f"--member={trust.principal}", "--role=roles/iam.workloadIdentityUser", "--condition=None"])

    role = run("iam", "roles", "describe", ROLE_ID, missing_ok=True)
    if role is None:
        pending.insert(0, ["iam", "roles", "create", ROLE_ID, f"--title={TITLE}",
                           f"--description={MARKER}", "--stage=GA", "--permissions=" + ",".join(PERMISSIONS)])
    else:
        require_matches(role, {"name": ROLE, "title": TITLE, "description": MARKER, "stage": "GA"}, "custom role")
        if role.get("deleted") or set(role.get("includedPermissions", [])) != set(PERMISSIONS):
            raise BootstrapError("Existing custom role is deleted or has a different permission set")

    pool_args = [f"--workload-identity-pool={POOL}", "--location=global"]
    pool = run("iam", "workload-identity-pools", "describe", POOL, "--location=global", missing_ok=True)
    if pool is None:
        pending.insert(0, ["iam", "workload-identity-pools", "create", POOL, "--location=global",
                           f"--display-name={TITLE}", f"--description={MARKER}"])
    else:
        require_matches(pool, {"name": trust.provider_name.rsplit("/providers/", 1)[0],
                               "displayName": TITLE, "description": MARKER, "state": "ACTIVE"}, "identity pool")
        if (pool.get("disabled") or pool.get("inlineCertificateIssuanceConfig") or pool.get("inlineTrustConfig")
                or pool.get("mode") not in (None, "MODE_UNSPECIFIED", "FEDERATION_ONLY")):
            raise BootstrapError("Existing identity pool has unexpected configuration")
        providers = run("iam", "workload-identity-pools", "providers", "list", *pool_args)
        if any(p.get("name") != trust.provider_name for p in providers):
            raise BootstrapError("Dedicated diagnostics pool contains another provider")
    provider = run("iam", "workload-identity-pools", "providers", "describe", PROVIDER, *pool_args, missing_ok=True) if pool else None
    if provider is None:
        # Create trust before the service-account impersonation grant.
        pending.insert(1 if pool is None else 0, ["iam", "workload-identity-pools", "providers", "create-oidc", PROVIDER,
                       *pool_args, f"--display-name={TITLE}", f"--description={MARKER}",
                       f"--issuer-uri={trust.issuer}", f"--allowed-audiences={trust.audience}",
                       "--attribute-mapping=google.subject=assertion.sub", f"--attribute-condition={trust.condition}"])
    else:
        require_matches(provider, {"name": trust.provider_name, "displayName": TITLE, "description": MARKER,
                        "state": "ACTIVE", "attributeMapping": {"google.subject": "assertion.sub"},
                        "attributeCondition": trust.condition,
                        "oidc": {"issuerUri": trust.issuer, "allowedAudiences": [trust.audience]}}, "OIDC provider")
        if any(provider.get(key) for key in ("disabled", "saml", "aws", "x509", "actorProviders")):
            raise BootstrapError("Existing provider is disabled or has unexpected authentication/delegation settings")

    for service in SERVICES:
        base = [service, f"--region={REGION}"]
        run("run", "services", "describe", *base)
        policy = run("run", "services", "get-iam-policy", *base)
        if not binding_exists(policy, SA_MEMBER, ROLE, service):
            pending.append(["run", "services", "add-iam-policy-binding", *base,
                            f"--member={SA_MEMBER}", f"--role={ROLE}", "--condition=None"])
    return pending


def execute(trust, apply=False, run=gcloud):
    pending = preflight(trust, run)
    if not apply:
        return {"status": "NEEDS_BOOTSTRAP" if pending else "BOOTSTRAP_VERIFIED",
                "pending_changes": len(pending), "oidc_connection": "NOT_VERIFIED"}
    for command in pending:
        run(*command)
    if preflight(trust, run):
        raise BootstrapError("Post-apply verification is incomplete; connection not activated")
    return {"status": "BOOTSTRAP_VERIFIED", "applied_changes": len(pending), "oidc_connection": "NOT_VERIFIED"}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--issuer", required=True)
    parser.add_argument("--audience", required=True)
    parser.add_argument("--subject", required=True)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--check", action="store_true", help="Read-only cloud preflight")
    mode.add_argument("--apply", action="store_true", help="Run the one-time additive bootstrap after all preflight checks")
    args = parser.parse_args(argv)
    try:
        trust = Trust(args.issuer, args.audience, args.subject)
        print(json.dumps({"mode": "APPLY" if args.apply else "CHECK" if args.check else "PLAN_ONLY",
                          "project": PROJECT, "region": REGION, "service_account": EMAIL,
                          "provider": trust.provider_name, "issuer": trust.issuer,
                          "audience": trust.audience, "subject": trust.subject,
                          "trust_condition": trust.condition, "impersonation_principal": trust.principal,
                          "read_permissions": PERMISSIONS, "service_grants": SERVICES,
                          "log_access": "NOT_GRANTED",
                          "plan": ["Validate all existing resources and grants before any mutation",
                                   "Create missing isolated diagnostics role, pool, provider and service account",
                                   "Add exact-subject impersonation and named-service read grants",
                                   "Verify installed configuration; environment OIDC activation remains unverified"],
                          "limitations": ["No inherited/group/all-resource permission audit",
                                          "Service/revision metadata may include plain-text environment values; diagnostics output must redact them",
                                          "Log access is outside this bootstrap and requires separately reviewed scope",
                                          "Subject and audience must be exact string claims from the actual environment UI; array audiences are unsupported"]}, indent=2))
        if args.apply or args.check:
            print(json.dumps(execute(trust, apply=args.apply), indent=2))
        else:
            print("PLAN_ONLY: no cloud calls or changes; live configuration and connection are unverified.")
        return 0
    except BootstrapError as exc:
        print(f"STOPPED: {exc}. No permissions are widened automatically. If apply was in progress, earlier additive changes may remain; rerun after resolving the cause.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
