#!/usr/bin/env python3
"""Seal TEST evidence and validate exact-release owner approval; never deploy.

Public interface:
  release_identity_sha256(manifest): hash schema/source/frontend/backends/worker/
      configuration, excluding evidence. Deployed UAT and live receipts bind it.
  seal_manifest(manifest): validate v1 and return a canonical digest envelope.
      Missing backend/worker/evidence values must be explicit nulls. They can be
      sealed for review but block approval. A seal is neither a signature nor
      owner acceptance, and always has productionReady=false.
  check_approval(envelope, approval, authenticated_actor=..., allowed_actors=...,
      expected_source_sha=...): verify the seal, complete evidence, exact source
      and exact-manifest acceptance. Returns a gate receipt, never a deployment.
  check_release_intent(gate, manifest, intent): bind the existing ops controller's
      source/service/image/configuration to this gate; leaves compatibility,
      provenance, predecessor, canary and rollback checks to scripts/ops/release.py.

Manifest v1 keys: schemaVersion, sourceSha, frontend {sha256, artifactId}, backends
{gateway, preview, coach}, worker {test, production}; each worker is null or
{repository, sourceSha, executionTag, serviceAccount, sandboxImage, runtimeVersion}.
TEST uses jems-test-execution-SHA and a nonproduction Google service account;
PROD retains factory-execution-SHA and its production-project account. A TEST
worker may never borrow the production identity. Configuration is
{testSha256, productionSha256}; evidence is
{ci, uat, live}. Image refs must include @sha256. CI is {sourceSha, receiptSha256,
checks}; checks maps ALL existing regression shard names to success/failure/
cancelled/skipped. UAT is {sourceSha, releaseIdentitySha256, receiptSha256,
target: deployed-test, providerMode: fixture, journeys}; journeys maps every
REQUIRED_JOURNEYS entry to the same result vocabulary. Live has the same identity,
receipt and target fields, providerMode: live, journeys for LIVE_JOURNEYS, plus
authorizationSha256, limitMicrousd and spendMicrousd. Live limits are positive;
spend cannot exceed them. Production configuration is an approval-specific hash
of canonical {gateway,preview,coach} controller configuration fingerprints.

Approval v1 is {schemaVersion, manifestSha256, decision: approve-production,
actor, runId, runAttempt}. The actor MUST come from independently verified GitHub
approval/audit evidence supplied by a trusted job, and allowed_actors from its
protected policy. Workflow trigger actor or a PR label/comment alone is not owner
approval. This module cannot authenticate those inputs or fetch receipts. The
trusted caller must verify receipt digests, successful jobs, run/source/artifact
bindings, actual approver identity and protected approval environment before use.
Never run this module from untrusted PR code in a privileged job. A gate's JSON
alone grants no authority; validate again immediately before existing promotion.

CLI: seal --manifest FILE --out FILE; check-approval --sealed FILE --approval FILE
--authenticated-actor LOGIN --owner LOGIN [--owner LOGIN] --source-sha SHA
[--out FILE]. Outputs are local JSON only. No Cloud Shell, network or credentials.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re


class ReleaseValidationError(ValueError):
    """A release identity, evidence contract or acceptance did not validate."""


REQUIRED_CI_CHECKS = frozenset(("core", "learning", "gameplay", "browser-security",
                               "generated", "creative", "studio", "coach"))
REQUIRED_JOURNEYS = frozenset((
    "home-navigation", "ready-to-play", "my-creations", "conversation-coaching",
    "ai-generation-modification", "artwork", "coding", "math-language",
    "parent-profiles", "rewards", "adult-workspace", "saving-recovery",
    "accessibility", "responsive-desktop-tablet-phone",
))
LIVE_JOURNEYS = frozenset(("conversation-coaching", "ai-generation-modification"))
RESULTS = frozenset(("success", "failure", "cancelled", "skipped"))
MANIFEST_KEYS = frozenset(("schemaVersion", "sourceSha", "frontend", "backends",
                           "worker", "configuration", "evidence"))
SHA = r"[a-f0-9]{40}"
HASH = r"[a-f0-9]{64}"
IMAGE = r"[a-z0-9][a-z0-9.-]*(?::[0-9]+)?/[a-z0-9][a-z0-9._/-]*@sha256:" + HASH
ACTOR = r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?"
PRODUCTION_PROJECT = "family-game-factory-jzw"


def require(condition, message):
    if not condition:
        raise ReleaseValidationError(message)


def object_keys(value, expected, name):
    require(isinstance(value, dict) and set(value) == set(expected),
            f"Unexpected {name} fields")


def pattern(value, expression, name):
    require(isinstance(value, str) and re.fullmatch(expression, value) is not None,
            f"Invalid {name}")


def canonical(value):
    try:
        return json.dumps(value, sort_keys=True, separators=(",", ":"),
                          ensure_ascii=True, allow_nan=False).encode("utf-8")
    except (ValueError, TypeError):
        raise ReleaseValidationError("Invalid canonical JSON") from None


def digest(value):
    return hashlib.sha256(canonical(value)).hexdigest()


def release_identity_sha256(manifest):
    object_keys(manifest, MANIFEST_KEYS, "manifest")
    return digest({key: manifest[key] for key in MANIFEST_KEYS if key != "evidence"})


def _results(value, names, name, blockers):
    object_keys(value, names, name)
    for check, result in sorted(value.items()):
        require(isinstance(result, str) and result in RESULTS, f"Invalid {name} result")
        if result != "success":
            blockers.append(f"{name}:{check}:{result}")


def validate_manifest(manifest):
    """Return deterministic approval blockers; reject malformed or stale evidence."""
    object_keys(manifest, MANIFEST_KEYS, "manifest")
    require(type(manifest["schemaVersion"]) is int and manifest["schemaVersion"] == 1,
            "Unsupported manifest schema")
    pattern(manifest["sourceSha"], SHA, "source SHA")
    frontend = manifest["frontend"]
    object_keys(frontend, ("sha256", "artifactId"), "frontend")
    pattern(frontend["sha256"], HASH, "frontend digest")
    pattern(frontend["artifactId"], r"[1-9][0-9]*", "GitHub artifact ID")
    blockers = []
    object_keys(manifest["backends"], ("gateway", "preview", "coach"), "backend")
    for name, image in sorted(manifest["backends"].items()):
        if image is None:
            blockers.append(f"backend:{name}:missing")
        else:
            pattern(image, IMAGE, f"{name} immutable image")
    workers = manifest["worker"]
    object_keys(workers, ("test", "production"), "worker environments")
    for environment, worker in workers.items():
        if worker is None:
            blockers.append(f"worker:{environment}:missing")
            continue
        object_keys(worker, ("repository", "sourceSha", "executionTag", "serviceAccount",
                             "sandboxImage", "runtimeVersion"), environment + " worker")
        prefix = "jems-test-execution-" if environment == "test" else "factory-execution-"
        for name, expression in (("sourceSha", SHA), ("executionTag", prefix + SHA),
                                 ("repository", r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+"),
                                 ("serviceAccount", r"[a-z][a-z0-9-]{4,28}@[a-z][a-z0-9-]{4,28}[a-z0-9]\.iam\.gserviceaccount\.com"),
                                 ("sandboxImage", IMAGE), ("runtimeVersion", r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}")):
            pattern(worker[name], expression, f"{environment} worker {name}")
        require(worker["executionTag"] == prefix + worker["sourceSha"],
                "Worker execution tag differs from source")
        production_account = worker["serviceAccount"].endswith("@" + PRODUCTION_PROJECT + ".iam.gserviceaccount.com")
        require(production_account == (environment == "production"), "Worker identity crosses environment boundary")
    object_keys(manifest["configuration"], ("testSha256", "productionSha256"), "configuration")
    for name, value in manifest["configuration"].items():
        pattern(value, HASH, name)
    object_keys(manifest["evidence"], ("ci", "uat", "live"), "evidence")
    identity = release_identity_sha256(manifest)
    for name, evidence in manifest["evidence"].items():
        if evidence is None:
            blockers.append(f"evidence:{name}:missing")
            continue
        common = {"sourceSha", "receiptSha256"}
        fields = common | ({"checks"} if name == "ci" else {
            "releaseIdentitySha256", "target", "providerMode", "journeys"})
        if name == "live":
            fields |= {"authorizationSha256", "limitMicrousd", "spendMicrousd"}
        object_keys(evidence, fields, name + " evidence")
        require(evidence["sourceSha"] == manifest["sourceSha"], f"Stale {name} source")
        pattern(evidence["receiptSha256"], HASH, name + " receipt digest")
        if name == "ci":
            _results(evidence["checks"], REQUIRED_CI_CHECKS, "ci", blockers)
            continue
        require(evidence["releaseIdentitySha256"] == identity, f"Stale {name} release identity")
        require(evidence["target"] == "deployed-test", f"{name} must target deployed TEST")
        require(evidence["providerMode"] == ("live" if name == "live" else "fixture"),
                f"Invalid {name} provider mode")
        _results(evidence["journeys"], LIVE_JOURNEYS if name == "live" else REQUIRED_JOURNEYS,
                 name, blockers)
        if name == "live":
            pattern(evidence["authorizationSha256"], HASH, "live authorization digest")
            limit, spend = evidence["limitMicrousd"], evidence["spendMicrousd"]
            require(type(limit) is int and 0 < limit <= 1_000_000_000,
                    "Invalid live authorized spending limit")
            require(type(spend) is int and 0 <= spend <= limit, "Live spending exceeds authorization")
    return sorted(blockers)


def seal_manifest(manifest):
    blockers = validate_manifest(manifest)
    # Copy through canonical JSON so later caller mutation cannot alter the seal.
    return {"schemaVersion": 1, "manifestSha256": digest(manifest),
            "manifest": json.loads(canonical(manifest)), "approvalEligible": not blockers,
            "productionReady": False, "blockers": blockers}


def check_approval(envelope, approval, *, authenticated_actor, allowed_actors, expected_source_sha):
    object_keys(envelope, ("schemaVersion", "manifestSha256", "manifest", "approvalEligible",
                           "productionReady", "blockers"), "seal")
    expected = seal_manifest(envelope["manifest"])
    require(canonical(envelope) == canonical(expected), "Manifest seal was altered")
    require(expected["approvalEligible"], "Release evidence is incomplete: " + ",".join(expected["blockers"]))
    pattern(expected_source_sha, SHA, "expected source SHA")
    require(expected_source_sha == envelope["manifest"]["sourceSha"], "Approval source is stale")
    object_keys(approval, ("schemaVersion", "manifestSha256", "decision", "actor", "runId", "runAttempt"), "approval")
    require(type(approval["schemaVersion"]) is int and approval["schemaVersion"] == 1,
            "Unsupported approval schema")
    require(approval["manifestSha256"] == expected["manifestSha256"], "Approval is for another manifest")
    require(approval["decision"] == "approve-production", "Explicit production acceptance required")
    pattern(authenticated_actor, ACTOR, "authenticated GitHub actor")
    pattern(approval["actor"], ACTOR, "approval actor")
    require(isinstance(allowed_actors, (tuple, list, set, frozenset)) and bool(allowed_actors),
            "Trusted owner allowlist required")
    for actor in allowed_actors:
        pattern(actor, ACTOR, "allowed owner")
    require(approval["actor"].lower() == authenticated_actor.lower(), "Approval actor is not authenticated actor")
    require(authenticated_actor.lower() in {actor.lower() for actor in allowed_actors}, "Actor is not an allowed owner")
    pattern(approval["runId"], r"[1-9][0-9]*", "approval workflow run")
    require(type(approval["runAttempt"]) is int and approval["runAttempt"] > 0, "Invalid approval run attempt")
    return {"schemaVersion": 1, "status": "APPROVAL_VALIDATED", "productionReady": True,
            "manifestSha256": expected["manifestSha256"], "sourceSha": expected_source_sha,
            "approvalSha256": digest(approval), "actor": authenticated_actor,
            "runId": approval["runId"], "runAttempt": approval["runAttempt"]}


def check_release_intent(gate, manifest, intent, *, production_configuration):
    """Check the existing controller's immutable target after check_approval.

    production_configuration is the trusted map of all three intended controller
    fingerprints. It is hashed into manifest.configuration.productionSha256.
    This function does not authenticate a serialized gate or authorize execution.
    """
    require(not validate_manifest(manifest), "Release evidence is incomplete")
    require(isinstance(gate, dict) and gate.get("status") == "APPROVAL_VALIDATED"
            and gate.get("productionReady") is True and gate.get("manifestSha256") == digest(manifest)
            and gate.get("sourceSha") == manifest["sourceSha"], "Approval gate does not match manifest")
    object_keys(production_configuration, ("gateway", "preview", "coach"), "production configuration")
    for value in production_configuration.values():
        pattern(value, HASH, "production configuration fingerprint")
    require(digest(production_configuration) == manifest["configuration"]["productionSha256"],
            "Production configuration changed")
    names = {"factory-gateway": "gateway", "factory-preview": "preview", "factory-coach-private": "coach"}
    require(isinstance(intent, dict) and intent.get("service") in names, "Unknown release service")
    name = names[intent["service"]]
    require(intent.get("operation") in ("stage", "canary", "promote"), "Not a promotion transition")
    require(intent.get("source") == manifest["sourceSha"] and intent.get("image") == manifest["backends"][name]
            and intent.get("configuration") == production_configuration[name], "Release intent differs from tested approval")
    return {"status": "EXISTING_CONTROLLER_GATE_VALIDATED", "manifestSha256": digest(manifest),
            "service": intent["service"], "operation": intent["operation"]}


def _json(path):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            require(key not in result, "Duplicate JSON field")
            result[key] = value
        return result
    return json.loads(Path(path).read_text(encoding="utf-8"), object_pairs_hook=unique,
                      parse_constant=lambda _: (_ for _ in ()).throw(ReleaseValidationError("Invalid JSON constant")))


def main(argv=None):
    parser = argparse.ArgumentParser(description="Seal TEST evidence or validate authenticated exact-release approval; no deployment")
    commands = parser.add_subparsers(dest="command", required=True)
    seal = commands.add_parser("seal")
    seal.add_argument("--manifest", required=True)
    seal.add_argument("--out", required=True)
    check = commands.add_parser("check-approval")
    check.add_argument("--sealed", required=True)
    check.add_argument("--approval", required=True)
    check.add_argument("--authenticated-actor", required=True)
    check.add_argument("--owner", action="append", required=True)
    check.add_argument("--source-sha", required=True)
    check.add_argument("--out")
    args = parser.parse_args(argv)
    try:
        result = seal_manifest(_json(args.manifest)) if args.command == "seal" else check_approval(
            _json(args.sealed), _json(args.approval), authenticated_actor=args.authenticated_actor,
            allowed_actors=args.owner, expected_source_sha=args.source_sha)
        output = json.dumps(result, sort_keys=True, indent=2) + "\n"
        if args.out:
            Path(args.out).write_text(output, encoding="utf-8")
        else:
            print(output, end="")
        return 0
    except (ReleaseValidationError, ValueError, OSError, TypeError, KeyError):
        # Untrusted receipt paths and input values must not enter operational logs.
        print("RELEASE_GATE_REJECTED: invalid, incomplete, stale, or unauthenticated release evidence")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
