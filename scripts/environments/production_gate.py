#!/usr/bin/env python3
"""Protected release intake. Read-only GitHub lookups; artifacts are data, never code."""

import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import time
import zipfile

import ci_evidence
import github as gh
import release as manifest
import retained_pages

ROOT = Path(__file__).resolve().parents[2]
# The two controllers have separate contracts and both have a release.py.
import importlib.util

_spec = importlib.util.spec_from_file_location("cloud_rollout", ROOT / "scripts/ops/release.py")
cloud = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(cloud)

PREFIX = gh.PREFIX
CLOUD = ".github/workflows/jems-cloud-run-release.yml"
PAGES = ".github/workflows/pages.yml"
TEST = ".github/workflows/jems-environments.yml"
OWNER = ("jzwyrzyk", 356692244)
APPROVAL_ENV = "jems-production-approval"
WORKERS = "family-game-factory-lab/family-game-factory-worker"
TEST_WORKERS = "family-game-factory-lab/family-game-factory-worker-test"
TEST_REGISTRY = "us-east5-docker.pkg.dev/jems-jzw-nonprod/jems-test-services"
ORDER = ("coach", "preview", "gateway")
ROLES = {role: service for service, role in cloud.SERVICES.items()}
RECORD = "ops/release-candidate.json"
require = manifest.require
keys = manifest.object_keys
digest = manifest.digest


def json_bytes(raw):
    def unique(pairs):
        out = {}
        for name, value in pairs:
            require(name not in out, "Duplicate field")
            out[name] = value
        return out

    return json.loads(
        raw, object_pairs_hook=unique, parse_constant=lambda _: require(False, "Invalid JSON")
    )


def positive(value):
    require(type(value) is int and 0 < value < 2**63, "Invalid immutable identifier")
    return value


def matches(value, pattern):
    return isinstance(value, str) and re.fullmatch(pattern, value) is not None


def git(*args):
    return subprocess.check_output(["git", "-C", str(ROOT), *args], stderr=subprocess.DEVNULL)


def run_and_jobs(api, run_id, workflow, source, expected_jobs, *, events=("workflow_dispatch",)):
    run = api.request(f"{PREFIX}/actions/runs/{positive(run_id)}")
    require(
        gh._valid_run(run, source, workflow)
        and run["id"] == run_id
        and run.get("run_attempt") == 1
        and run.get("event") in events
        and run.get("head_branch") == "main",
        "Untrusted, stale or unsuccessful workflow",
    )
    jobs = api.pages(f"{PREFIX}/actions/runs/{run_id}/attempts/1/jobs", "jobs")
    for name in expected_jobs:
        found = [j for j in jobs if j.get("name") == name]
        require(len(found) == 1, "Missing or duplicate acceptance job")
        job = found[0]
        require(
            job.get("run_id") == run_id
            and job.get("run_attempt") == 1
            and job.get("head_sha") == source
            and job.get("status") == "completed"
            and job.get("conclusion") == "success"
            and job.get("runner_group_name") == "GitHub Actions"
            and "ubuntu-24.04" in job.get("labels", [])
            and "self-hosted" not in job["labels"],
            "Acceptance job did not succeed on hosted runner",
        )
    return run


def metadata(api, run_id, name, source):
    rows = api.pages(f"{PREFIX}/actions/runs/{run_id}/artifacts", "artifacts")
    found = [r for r in rows if r.get("name") == name]
    require(len(found) == 1, "Missing or duplicated evidence artifact")
    row = found[0]
    ref = row.get("workflow_run", {})
    require(
        row.get("expired") is False
        and ref.get("id") == run_id
        and ref.get("head_sha") == source
        and ref.get("repository_id") == gh.REPOSITORY_ID
        and ref.get("head_repository_id") == gh.REPOSITORY_ID
        and matches(row.get("digest"), "sha256:" + manifest.HASH),
        "Artifact provenance mismatch",
    )
    positive(row["id"])
    return row


def download_member(api, row, member, destination, *, max_bytes):
    require(0 < row["size_in_bytes"] <= max_bytes, "Artifact exceeds selected boundary")
    with tempfile.TemporaryDirectory() as tmp:
        archive = Path(tmp) / "receipt.zip"
        api.download(row["id"], archive)
        with archive.open("rb") as stream:
            actual = hashlib.file_digest(stream, "sha256").hexdigest()
        require(
            archive.stat().st_size == row["size_in_bytes"] and "sha256:" + actual == row["digest"],
            "Archive digest mismatch",
        )
        with zipfile.ZipFile(archive) as zipped:
            entries = zipped.infolist()
            require(
                len(entries) == 1
                and entries[0].filename == member
                and 0 < entries[0].file_size <= max_bytes,
                "Unexpected archive member",
            )
            with zipped.open(entries[0]) as src, destination.open("xb") as dest:
                shutil.copyfileobj(src, dest)


def receipt(api, row, name="receipt.json"):
    with tempfile.TemporaryDirectory() as tmp:
        file = Path(tmp) / "receipt"
        download_member(api, row, name, file, max_bytes=4 * 1024 * 1024)
        data = file.read_bytes()
    return json_bytes(data), hashlib.sha256(data).hexdigest()


def pages_ref(record, *, recovery=False):
    extra = ("retainedInventorySha256",) if recovery and "retainedInventorySha256" in record else ()
    if extra:
        require(
            record.get("sourceSha") == retained_pages.SOURCE and matches(record[extra[0]], manifest.HASH),
            "Invalid original household recovery",
        )
    keys(
        record,
        ("sourceSha", "workflowSha", "runId", "artifactId", "archiveSha256", "policySha256", *extra),
        "Pages preparation",
    )
    positive(record["runId"])
    positive(record["artifactId"])
    for name in ("archiveSha256", "policySha256", "sourceSha", "workflowSha"):
        require(
            matches(record[name], manifest.SHA if name in ("sourceSha", "workflowSha") else manifest.HASH),
            "Invalid Pages identity",
        )


def validate(record):
    keys(
        record,
        (
            "version",
            "manifest",
            "productionConfiguration",
            "recovery",
            "pages",
            "runs",
            "expiresAt",
            "supplyChain",
        ),
        "candidate",
    )
    require(type(record["version"]) is int and record["version"] == 1, "Unsupported release package")
    sealed = manifest.seal_manifest(record["manifest"])
    require(sealed["approvalEligible"], "TEST or identity evidence is incomplete")
    m = sealed["manifest"]
    keys(record["productionConfiguration"], ORDER, "serving configuration")
    require(
        all(matches(v, manifest.HASH) for v in record["productionConfiguration"].values())
        and digest(record["productionConfiguration"]) == m["configuration"]["productionSha256"],
        "Configuration changed",
    )
    keys(record["runs"], ("frontend", "uat", "live"), "acceptance runs")
    require(
        len(set(positive(n) for n in record["runs"].values())) == 3, "Distinct proof producers required"
    )
    keys(
        record["recovery"],
        ("services", "worker", "pages", "snapshotSha256", "readerCompatibilitySha256"),
        "recovery tuple",
    )
    recovery = record["recovery"]
    for name in ("snapshotSha256", "readerCompatibilitySha256"):
        require(matches(recovery[name], manifest.HASH), "Missing verified recovery inventory")
    keys(recovery["services"], ORDER, "recovery services")
    for role in ORDER:
        service = ROLES[role]
        r = recovery["services"][role]
        keys(r, ("revision", "image", "configuration", "compatibilitySha256"), "retained revision")
        require(
            matches(r["revision"], service + r"-[a-z0-9-]+")
            and matches(
                r["image"],
                re.escape(cloud.REGISTRY)
                + "/"
                + role
                + "@"
                + cloud.DIGEST
                + "|"
                + re.escape(cloud.LEGACY_REGISTRY)
                + "/"
                + role
                + "@"
                + cloud.DIGEST,
            )
            and r["configuration"] == record["productionConfiguration"][role]
            and matches(r["compatibilitySha256"], manifest.HASH),
            "Invalid retained backend tuple",
        )
        require(
            matches(m["backends"][role], re.escape(cloud.REGISTRY) + "/" + role + "@" + cloud.DIGEST),
            "Invalid release registry",
        )
    # Reuse the full v1 production worker validator for the retained identity.
    old = {
        **m,
        "worker": {**m["worker"], "production": recovery["worker"]},
        "evidence": dict.fromkeys(("ci", "uat", "live")),
    }
    manifest.validate_manifest(old)
    chain = record["supplyChain"]
    keys(
        chain,
        (
            "testWorkerRepositoryId",
            "sandboxSignerSha",
            "sandboxSourceSha",
            "arcade",
            "testBuild",
            "testTrigger",
        ),
        "supply chain",
    )
    positive(chain["testWorkerRepositoryId"])
    for name in ("testBuild", "testTrigger"):
        require(
            matches(chain[name], r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}"),
            "Invalid TEST Cloud Build identity",
        )
    require(
        all(matches(chain[k], manifest.SHA) for k in ("sandboxSignerSha", "sandboxSourceSha")),
        "Invalid sandbox source or signer",
    )
    require(
        isinstance(chain["arcade"], dict) and chain["arcade"].get("sourceHeadSha") == m["sourceSha"],
        "Missing full CI identity",
    )
    for repo, w in (
        (WORKERS, old["worker"]["production"]),
        (WORKERS, m["worker"]["production"]),
        (TEST_WORKERS, m["worker"]["test"]),
    ):
        require(
            w
            and w["repository"] == repo
            and matches(
                w["sandboxImage"], r"ghcr\.io/jzwyrzyk/family-game-factory-sandbox@" + cloud.DIGEST
            ),
            "Unreviewed worker or sandbox",
        )
    require(
        m["worker"]["test"]["sandboxImage"] == m["worker"]["production"]["sandboxImage"],
        "Production sandbox differs from qualified TEST digest",
    )
    pages_ref(recovery["pages"], recovery=True)
    pages_ref(record["pages"])
    require(record["pages"]["sourceSha"] == m["sourceSha"], "Pages release source differs")
    ci_evidence.timestamp(record["expiresAt"])
    return sealed


def validate_pages(api, value, site_policy, *, destination=None):
    source = value["workflowSha"]
    run = value["runId"]
    run_and_jobs(
        api,
        run,
        PAGES,
        source,
        ["build", "prepare-receipt", *["regression (" + s + ")" for s in manifest.REQUIRED_CI_CHECKS]],
    )
    row = metadata(api, run, "github-pages", source)
    require(
        row["id"] == value["artifactId"] and row["digest"] == "sha256:" + value["archiveSha256"],
        "Pages archive changed",
    )
    declared, receipt_hash = receipt(api, metadata(api, run, "pages-preparation-" + str(run), source))
    require(
        declared == value and value["policySha256"] == site_policy,
        "Pages source or public-delivery policy changed",
    )
    if destination:
        download_member(api, row, "artifact.tar", destination, max_bytes=gh.MAX_ARCHIVE)
    return receipt_hash


def evidence(api, record):
    m = record["manifest"]
    source = m["sourceSha"]
    runs = record["runs"]
    verified_ci = ci_evidence.verify_full_ci(api, source, "release")
    require(verified_ci == record["supplyChain"]["arcade"], "Full Arcade evidence changed")
    fp = runs["frontend"]
    run_and_jobs(
        api,
        fp,
        TEST,
        source,
        ["integrated-test-serving", "integrated-test-frontend", "integrated-test-final-observation"],
    )
    row = metadata(api, fp, f"integrated-test-frontend-{fp}-1", source)
    front, _ = receipt(api, row, "frontend.json")
    require(
        str(row["id"]) == m["frontend"]["artifactId"]
        and front["sourceSha"] == source
        and front["environment"] == "test"
        and front["scope"] == "iap-household-served-files"
        and front["schemaVersion"] == 1
        and isinstance(front["files"], list)
        and front["files"]
        and digest(front["files"]) == front["frontendSha256"] == m["frontend"]["sha256"],
        "TEST frontend changed",
    )
    lane_hashes = {}
    targets = set()
    for name, job, prefix in (
        ("uat", "integrated-test-uat", "integrated-test-uat"),
        ("live", "integrated-test-live", "integrated-test-live"),
    ):
        run = runs[name]
        run_and_jobs(
            api, run, TEST, source, ["integrated-test-serving", job, "integrated-test-final-observation"]
        )
        observed, raw_hash = receipt(api, metadata(api, run, f"{prefix}-{run}-1", source))
        expected = m["evidence"][name]
        require(
            expected["receiptSha256"] == raw_hash
            and all(observed.get(k) == v for k, v in expected.items() if k != "receiptSha256"),
            "Deployed acceptance receipt mismatch",
        )
        require(
            observed.get("testConfigurationSha256") == m["configuration"]["testSha256"]
            and observed.get("testBackends")
            == {role: f"{TEST_REGISTRY}/{role}@" + m["backends"][role].split("@")[1] for role in ORDER},
            "TEST serving configuration or runtime image changed",
        )
        lane_hashes["fixture" if name == "uat" else "live"] = observed["observedConfigurationSha256"]
        require(
            matches(observed.get("targetSha256"), manifest.HASH)
            and matches(observed["observedConfigurationSha256"], manifest.HASH),
            "Missing TEST target observation",
        )
        targets.add(observed["targetSha256"])
        chain = record["supplyChain"]
        require(
            observed.get("testWorker") == m["worker"]["test"]
            and observed.get("sandboxSignerSha") == chain["sandboxSignerSha"]
            and observed.get("sandboxSourceSha") == chain["sandboxSourceSha"]
            and observed.get("testWorkerRepositoryId") == str(chain["testWorkerRepositoryId"]),
            "TEST receipt uses a different worker or sandbox provenance",
        )
        if name == "live":
            require(
                matches(observed.get("settlementSha256"), manifest.HASH)
                and type(observed.get("repairAttempts")) is int
                and observed["repairAttempts"] > 0,
                "Live repair or financial settlement absent",
            )
        if name == "uat":
            execution = observed.get("workerExecution")
            require(
                isinstance(execution, list) and len(execution) == 2, "Two private execution proofs required"
            )
            for proof in execution:
                keys(
                    proof,
                    ("runId", "artifactId", "archiveSha256", "executionSha256"),
                    "verified private run",
                )
                require(
                    all(matches(proof[k], r"[1-9][0-9]{0,19}") for k in ("runId", "artifactId"))
                    and all(matches(proof[k], manifest.HASH) for k in ("archiveSha256", "executionSha256")),
                    "Unverified private execution",
                )
            require(
                all(
                    len({p[k] for p in execution}) == 2 for k in ("runId", "artifactId", "executionSha256")
                ),
                "Duplicate private execution",
            )
            recovery = observed.get("recovery")
            keys(
                recovery,
                ("captureSha256", "resetSha256", "restoreSha256", "replayedRevisionSha256"),
                "deployed recovery",
            )
            require(all(matches(v, manifest.HASH) for v in recovery.values()), "Recovery was not exercised")
    require(
        len(targets) == 1
        and lane_hashes["fixture"] != lane_hashes["live"]
        and digest(lane_hashes) == m["configuration"]["testSha256"],
        "TEST fixture and funded configuration pair differs",
    )
    require(
        0 < m["evidence"]["live"]["spendMicrousd"] <= m["evidence"]["live"]["limitMicrousd"] <= 5_000_000,
        "Funded lineage evidence missing or over ceiling",
    )
    policy = hashlib.sha256((ROOT / "ops/pages-delivery.json").read_bytes()).hexdigest()
    validate_pages(api, record["recovery"]["pages"], policy)
    require(
        validate_pages(api, record["pages"], policy) == m["evidence"]["ci"]["receiptSha256"],
        "CI receipt changed",
    )


def private_get(repo, path):
    require(repo in (WORKERS, TEST_WORKERS), "Unknown worker repository")
    token = os.environ.get("JEMS_WORKER_REFS_READ_TOKEN")
    require(token, "Missing private worker reference reader")
    raw = subprocess.check_output(
        ["gh", "api", "--hostname", "github.com", f"repos/{repo}" + path],
        env={**os.environ, "GH_TOKEN": token, "GH_DEBUG": "", "GH_PROMPT_DISABLED": "1"},
        stderr=subprocess.DEVNULL,
        timeout=45,
    )
    return json_bytes(raw)


# Independently reviewed private workflow templates from the retained production
# overlay. Only the exact application SHA substitutions may vary.
WORKER_TEMPLATES = {
    "factory-private.yml": (7, "a5bbf37a413ca5dcb9e22373b8b11ea452aa02aed20079ecec9173cafbcf4193"),
    "factory-smoke.yml": (3, "0434501a160be9b62556e9e0d898c1c002ed73f85f9e2db276c1a58645574bcb"),
}


def production_worker_binding(worker, source, read, templates=WORKER_TEMPLATES, *, rotating=False):
    for file, (count, checksum) in templates.items():
        result = read(WORKERS, "/contents/.github/workflows/" + file + "?ref=" + worker["sourceSha"])
        require(
            result["type"] == "file"
            and result["path"] == ".github/workflows/" + file
            and result["encoding"] == "base64"
            and type(result["size"]) is int
            and 0 < result["size"] <= 131072,
            "Invalid private workflow metadata",
        )
        body = base64.b64decode("".join(result["content"].split()), validate=True)
        blob = hashlib.sha1(b"blob " + str(len(body)).encode() + b"\0" + body).hexdigest()
        require(
            len(body) == result["size"]
            and blob == result["sha"]
            and body.count(source.encode()) == count
            and hashlib.sha256(body.replace(source.encode(), b"APPLICATION")).hexdigest() == checksum,
            "Private workflow or selected application checkout changed",
        )
    pins = {
        "FACTORY_PRIVATE_WORKER_SHA": worker["sourceSha"],
        "FACTORY_SANDBOX_IMAGE": worker["sandboxImage"],
    }
    if rotating:
        pins.update(FACTORY_ACTIONS_APPROVED="false", FACTORY_RUNNER_SMOKE_APPROVED="false")
        for workflow in WORKER_TEMPLATES:
            for status in ("requested", "waiting", "pending", "queued", "in_progress"):
                runs = read(WORKERS, f"/actions/workflows/{workflow}/runs?status={status}&per_page=1")
                require(
                    runs["total_count"] == 0 and runs["workflow_runs"] == [],
                    "Private worker has in-flight execution",
                )
    for name, value in pins.items():
        result = read(WORKERS, "/actions/variables/" + name)
        require(
            result.get("name") == name and result.get("value") == value, "Private worker settings drifted"
        )
    for environment in (
        "factory-generation",
        "factory-sandbox",
        "factory-quality",
        "factory-infrastructure",
    ):
        rows = read(WORKERS, "/environments/" + environment + "/variables?per_page=100")
        require(
            len(rows["variables"]) == rows["total_count"]
            and all(r["value"] == pins[r["name"]] for r in rows["variables"] if r["name"] in pins),
            "Environment overrides the reviewed worker setting",
        )


def runtime_supply(record, read=private_get, execute=subprocess.run):
    m = record["manifest"]
    for lane, repo_id in (
        ("production", 1458899834),
        ("test", record["supplyChain"]["testWorkerRepositoryId"]),
    ):
        w = m["worker"][lane]
        repo = w["repository"]
        info = read(repo, "")
        branch = read(repo, "/branches/main")
        ref = read(repo, "/git/ref/tags/" + w["executionTag"])
        require(
            info.get("id") == repo_id
            and info.get("private") is True
            and info.get("full_name") == repo
            and info.get("default_branch") == "main"
            and branch.get("protected") is True
            and branch["commit"]["sha"] == w["sourceSha"]
            and ref["ref"] == "refs/tags/" + w["executionTag"]
            and ref["object"]["type"] == "commit"
            and ref["object"]["sha"] == w["sourceSha"],
            "Worker main or execution tag changed",
        )
    production_worker_binding(
        m["worker"]["production"],
        m["sourceSha"],
        read,
        rotating=m["worker"]["production"] != record["recovery"]["worker"],
    )
    retained = record["recovery"]["worker"]
    ref = read(retained["repository"], "/git/ref/tags/" + retained["executionTag"])
    require(
        ref["ref"] == "refs/tags/" + retained["executionTag"]
        and ref["object"]["type"] == "commit"
        and ref["object"]["sha"] == retained["sourceSha"],
        "Retained execution tag changed",
    )
    execute(
        [
            "gh",
            "attestation",
            "verify",
            "oci://" + m["worker"]["production"]["sandboxImage"],
            "--repo",
            gh.REPOSITORY,
            "--signer-workflow",
            gh.REPOSITORY + "/.github/workflows/sandbox-publish.yml",
            "--source-ref",
            "refs/heads/main",
            "--source-digest",
            record["supplyChain"]["sandboxSignerSha"],
            "--signer-digest",
            record["supplyChain"]["sandboxSignerSha"],
            "--deny-self-hosted-runners",
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        timeout=120,
    )


def approvals(api, record, run_id, now, *, recovery=False):
    sealed = validate(record)
    run = api.request(f"{PREFIX}/actions/runs/{positive(run_id)}")
    approval_source = run["head_sha"]
    require(matches(approval_source, manifest.SHA), "Invalid approval source")
    run_and_jobs(api, run_id, CLOUD, approval_source, ["review-release", "owner-approval"])
    require(json_bytes(git("show", approval_source + ":" + RECORD)) == record, "Approved package changed")
    cutoff = ci_evidence.timestamp(record["expiresAt"])
    created = ci_evidence.timestamp(run["created_at"])
    rows = api.pages(f"{PREFIX}/actions/runs/{run_id}/approvals")
    matches_env = [r for r in rows if any(e.get("name") == APPROVAL_ENV for e in r.get("environments", []))]
    recent = api.pages(
        f"{PREFIX}/actions/workflows/jems-cloud-run-release.yml/runs?event=workflow_dispatch&branch=main&created=%3E%3D"
        + run["created_at"].split("T")[0],
        "workflow_runs",
    )
    require(
        all(
            r["id"] <= run_id
            or r.get("display_title") not in ("Review production manifest", "Review recovery manifest")
            for r in recent
        ),
        "A newer owner decision was requested",
    )
    require(len(matches_env) == 1, "Missing or ambiguous owner review")
    review = matches_env[0]
    scope = "approve-production"
    if recovery and review.get("comment") == "approve-recovery " + digest(record):
        scope = "approve-recovery"
        require(0 <= now - ci_evidence.timestamp(run["updated_at"]) < 3600, "Recovery approval expired")
    else:
        require(created <= now < cutoff <= created + 14 * 86400, "Expired approval")
    require(
        review.get("state") == "approved"
        and (review.get("user", {}).get("login"), review.get("user", {}).get("id")) == OWNER
        and review.get("comment") == scope + " " + digest(record),
        "Owner did not approve this release",
    )
    approval = {
        "schemaVersion": 1,
        "decision": "approve-production",
        "manifestSha256": sealed["manifestSha256"],
        "actor": OWNER[0],
        "runId": str(run_id),
        "runAttempt": 1,
    }
    return manifest.check_approval(
        sealed,
        approval,
        authenticated_actor=review["user"]["login"],
        allowed_actors=[OWNER[0]],
        expected_source_sha=record["manifest"]["sourceSha"],
    )


def verify_mirror(api, record):
    pointer = json_bytes((ROOT / "ops/release-mirror.json").read_bytes())
    keys(pointer, ("runId", "signerSha"), "registry promotion receipt")
    run = positive(pointer["runId"])
    sha = pointer["signerSha"]
    require(matches(sha, manifest.SHA), "Invalid signing commit")
    run_and_jobs(api, run, ".github/workflows/jems-service-images.yml", sha, ["mirror"])
    require(json_bytes(git("show", sha + ":" + RECORD)) == record, "Different registry promotion package")
    r, _ = receipt(api, metadata(api, run, "registry-promotion-" + str(run), sha))
    require(
        r
        == {
            "packageSha256": digest(record),
            "source": record["manifest"]["sourceSha"],
            "images": record["manifest"]["backends"],
            "testBuild": record["supplyChain"]["testBuild"],
            "testTrigger": record["supplyChain"]["testTrigger"],
        },
        "Registry promotion differs",
    )
    return sha


def expected_revision(record, role):
    m = record["manifest"]
    old = record["recovery"]["services"][role]
    if old["image"] == m["backends"][role]:
        return old["revision"]
    return cloud.revision_name(
        {
            "source": m["sourceSha"],
            "image": m["backends"][role],
            "service": ROLES[role],
            "baseline": old["revision"],
        }
    )


def check_intent(record, gate, intent):
    role = cloud.SERVICES[intent["service"]]
    r = record["recovery"]["services"][role]
    m = record["manifest"]
    require(
        intent["source"] == m["sourceSha"]
        and intent["image"] == m["backends"][role]
        and intent["baseline"] == r["revision"]
        and intent["baselineImage"] == r["image"]
        and intent["compatibility"] == r["compatibilitySha256"]
        and intent["configuration"] == r["configuration"],
        "Release or recovery intent changed",
    )
    if intent["operation"] in ("stage", "canary", "promote"):
        manifest.check_release_intent(
            gate, m, intent, production_configuration=record["productionConfiguration"]
        )


def predecessors(record, intent, api):
    role = cloud.SERVICES[intent["service"]]
    rollback = intent["operation"] == "rollback"
    required = ORDER[ORDER.index(role) + 1 :] if rollback else ORDER[: ORDER.index(role)]
    for key in required:
        r = record["recovery"]["services"][key]
        observed = cloud.inspect_service(ROLES[key], api)
        revision = r["revision"] if rollback else expected_revision(record, key)
        image = r["image"] if rollback else record["manifest"]["backends"][key]
        require(
            observed["baseline"] == revision
            and observed["baselineImage"] == image
            and observed["matchesServingConfiguration"]
            and observed["configuration"] == r["configuration"],
            "Dependency is not at the approved revision",
        )


def canary_health(api, intent, reference, now):
    """An actual healthy, settled interval on this precise 5% candidate precedes promotion."""
    keys(reference, ("canaryRunId", "diagnosticsRunId", "canaryCommit"), "canary evidence")
    sha = reference["canaryCommit"]
    require(matches(sha, manifest.SHA), "Invalid canary commit")
    require(
        json_bytes(git("show", sha + ":ops/release.json")) == {**intent, "operation": "canary"},
        "Health interval belongs to a different rollout",
    )
    canary = run_and_jobs(
        api, reference["canaryRunId"], CLOUD, sha, ["transition"], events=("push", "workflow_dispatch")
    )
    run = reference["diagnosticsRunId"]
    run_and_jobs(api, run, ".github/workflows/jems-production-diagnostics.yml", sha, ["evidence"])
    report, _ = receipt(api, metadata(api, run, f"jems-request-evidence-{run}-1", sha), "report.json")
    scope = report["scope"]
    require(
        report.get("query_status") == "COMPLETE"
        and report.get("project") == cloud.PROJECT
        and report.get("region") == "us-east5"
        and scope.get("service") == intent["service"]
        and scope.get("revision") == cloud.revision_name(intent)
        and report.get("workflow") == {"run_id": str(run), "attempt": "1", "workflow_source_sha": sha},
        "Canary diagnostics lack verified coverage",
    )
    start = ci_evidence.timestamp(scope["start_utc"])
    end = ci_evidence.timestamp(scope["end_utc"])
    require(
        ci_evidence.timestamp(canary["updated_at"]) <= start < end <= now
        and now - end <= 86400
        and end - start <= 3600,
        "Canary evidence interval is stale or precedes the transition",
    )
    counts = report["counts"]
    require(
        type(counts["http_2xx"]) is int
        and counts["http_2xx"] > 0
        and type(counts["http_5xx"]) is int
        and counts["http_5xx"] == 0,
        "Canary requires observed success without 5xx",
    )


def check_observation(api, run, head, record, now, *, recovery=False):
    source = run_and_jobs(api, run, CLOUD, head, ["observe"])
    require(0 <= now - ci_evidence.timestamp(source["updated_at"]) <= 900, "Serving observation expired")
    document, _ = receipt(api, metadata(api, run, f"serving-observation-{run}-1", head))
    require(
        document.get("status") == "READ_ONLY_RELEASE_OBSERVATION_COMPLETE"
        and document.get("mutations") == 0
        and document["source_sha"] == head
        and document["run_id"] == str(run)
        and document["run_attempt"] == "1"
        and 0 <= now - ci_evidence.timestamp(document["observed_at_utc"]) <= 900,
        "Stale or incomplete readback",
    )
    services = {r["service"]: r for r in document["services"]}
    require(set(services) == set(ROLES.values()) and len(document["services"]) == 3, "Missing service")
    for role, service in ROLES.items():
        r = services[service]
        old = record["recovery"]["services"][role]
        revision = old["revision"] if recovery else expected_revision(record, role)
        img = old["image"] if recovery else record["manifest"]["backends"][role]
        require(
            r["service_reconciled"]
            and r["desired"] == r["effective"] == {revision: 100}
            and r["matchesServingConfiguration"]
            and r["configuration"] == record["productionConfiguration"][role]
            and r["revisions"][revision]["ready"]
            and r["revisions"][revision]["image"] == img,
            "Website blocked by incomplete service transition",
        )
    # Cloud Run and Pages commits can be dispatched without a new main commit.
    # Both serialize their final actions; a subsequent transition invalidates this snapshot.
    subsequent = api.pages(
        f"{PREFIX}/actions/workflows/jems-cloud-run-release.yml/runs?head_sha={head}", "workflow_runs"
    )
    require(all(r["id"] <= run for r in subsequent), "Newer Cloud Run operation requires fresh readback")


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "mode",
        choices=[
            "review",
            "review-recovery",
            "transition",
            "dependencies",
            "mirror",
            "website",
            "website-rollback",
        ],
    )
    p.add_argument("--observation", type=int)
    p.add_argument("--website-source")
    p.add_argument("--out", type=Path)
    a = p.parse_args()
    api = gh.GitHub()
    head = git("rev-parse", "HEAD").decode().strip()
    require(
        os.environ.get("GITHUB_REF") == "refs/heads/main"
        and os.environ.get("GITHUB_REF_PROTECTED") == "true"
        and os.environ.get("GITHUB_REPOSITORY") == gh.REPOSITORY
        and os.environ.get("GITHUB_SHA") == head,
        "Protected main required",
    )
    branch = api.request(PREFIX + "/branches/main")
    require(branch.get("protected") is True and branch["commit"]["sha"] == head, "Protected main changed")
    record = json_bytes((ROOT / RECORD).read_bytes())
    sealed = validate(record)
    now = time.time()
    if a.mode in ("review", "review-recovery"):
        if a.mode == "review":
            require(
                now < ci_evidence.timestamp(record["expiresAt"]) <= now + 14 * 86400,
                "Invalid approval expiry",
            )
            evidence(api, record)
            runtime_supply(record)
        print("Review exact package", digest(record), "and sealed manifest", sealed["manifestSha256"])
        return
    grant = json_bytes((ROOT / "ops/release-approval.json").read_bytes())
    keys(grant, ("runId", "packageSha256"), "release authorization")
    require(grant["packageSha256"] == digest(record), "Approval points to a different candidate")
    intent = (
        cloud.read_intent(ROOT / "ops/release.json") if a.mode in ("transition", "dependencies") else None
    )
    recovery = a.mode == "website-rollback" or bool(intent and intent["operation"] == "rollback")
    gate = approvals(api, record, grant["runId"], now, recovery=recovery)
    if not recovery:
        runtime_supply(record)
    if a.mode == "mirror":
        evidence(api, record)
    elif intent:
        check_intent(record, gate, intent)
        # An exact traffic reversal remains available when the failed candidate's
        # CI/TEST artifacts have expired. Its retained baseline remains mandatory.
        if intent["operation"] != "rollback":
            evidence(api, record)
            verify_mirror(api, record)
        if intent["operation"] == "promote":
            canary_health(api, intent, json_bytes((ROOT / "ops/release-canary.json").read_bytes()), now)
        if a.mode == "dependencies":
            predecessors(record, intent, cloud.cloud_api(cloud.gcloud_token()))
    else:
        recovery = a.mode == "website-rollback"
        selected = record["recovery"]["pages"] if recovery else record["pages"]
        require(a.website_source == selected["sourceSha"], "Requested website source differs")
        if not recovery:
            evidence(api, record)
            verify_mirror(api, record)
        check_observation(api, positive(a.observation), head, record, now, recovery=recovery)
        validate_pages(
            api,
            selected,
            hashlib.sha256((ROOT / "ops/pages-delivery.json").read_bytes()).hexdigest(),
            destination=a.out,
        )
    require(api.request(PREFIX + "/git/ref/heads/main")["object"]["sha"] == head, "Main moved")
    print("Exact release authorization verified", digest(record))


if __name__ == "__main__":
    try:
        main()
    except (
        OSError,
        ValueError,
        KeyError,
        TypeError,
        AttributeError,
        subprocess.SubprocessError,
        zipfile.BadZipFile,
        cloud.ReleaseError,
    ):
        sys.exit("PRODUCTION_RELEASE_GATE_REJECTED")
