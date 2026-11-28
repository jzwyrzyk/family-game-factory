"""Offline rehearsal with synthetic Actions responses, actual receipt ZIPs and the release validator."""

from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import io
import json
import os
import subprocess
import importlib.util
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts/environments"))
import production_gate as gate
import mirror_images
import verify_website
from test_environment_release import manifest
from test_environment_ci_evidence import API as Arcade, HEAD, MAIN, NOW
from prepare_production import assemble

SOURCE = "a" * 40
SIGNER = "b" * 40
POLICY = hashlib.sha256((ROOT / "ops/pages-delivery.json").read_bytes()).hexdigest()
STAMP = "2026-11-26T02:10:00Z"
TIME = gate.ci_evidence.timestamp(STAMP)
REPO = {"id": gate.gh.REPOSITORY_ID, "full_name": gate.gh.REPOSITORY}
ERROR = gate.manifest.ReleaseValidationError


def sha(data):
    return hashlib.sha256(data).hexdigest()


class API:
    def __init__(self):
        self.runs = {}
        self.jobs = {}
        self.artifacts = {}
        self.data = {}
        self.reviews = []
        self.later = []

    def run(self, n, workflow, source, names):
        self.runs[n] = {
            "id": n,
            "event": "workflow_dispatch",
            "path": workflow,
            "head_sha": source,
            "head_branch": "main",
            "repository": REPO,
            "head_repository": REPO,
            "created_at": "2026-11-26T01:00:00Z",
            "updated_at": STAMP,
            "run_attempt": 1,
            "status": "completed",
            "conclusion": "success",
        }
        self.jobs[n] = [
            {
                "name": name,
                "run_attempt": 1,
                "head_sha": source,
                "run_id": n,
                "status": "completed",
                "conclusion": "success",
                "runner_group_name": "GitHub Actions",
                "labels": ["ubuntu-24.04"],
            }
            for name in names
        ]

    def artifact(self, n, name, member, content):
        raw = content if isinstance(content, bytes) else gate.manifest.canonical(content)
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as archive:
            archive.writestr(member, raw)
        blob = buf.getvalue()
        aid = 50000 + len(self.data)
        self.data[aid] = blob
        row = {
            "id": aid,
            "expired": False,
            "name": name,
            "size_in_bytes": len(blob),
            "digest": "sha256:" + sha(blob),
            "workflow_run": {
                "id": n,
                "head_sha": self.runs[n]["head_sha"],
                "repository_id": REPO["id"],
                "head_repository_id": REPO["id"],
            },
        }
        self.artifacts.setdefault(n, []).append(row)
        return row

    def request(self, path):
        return self.runs[int(path.rsplit("/", 1)[1])]

    def pages(self, path, key=None):
        if "/workflows/" in path:
            return self.later
        n = int(path.split("/runs/")[1].split("/")[0])
        if path.endswith("/jobs"):
            return self.jobs[n]
        if path.endswith("/approvals"):
            return self.reviews
        return self.artifacts[n]

    def download(self, aid, path):
        path.write_bytes(self.data[aid])

    def pages_build(self, n, source):
        self.run(
            n,
            gate.PAGES,
            SIGNER,
            [
                "build",
                "prepare-receipt",
                *["regression (" + s + ")" for s in gate.manifest.REQUIRED_CI_CHECKS],
            ],
        )
        item = self.artifact(n, "github-pages", "artifact.tar", b"archived site " + source.encode())
        receipt = {
            "sourceSha": source,
            "workflowSha": SIGNER,
            "runId": n,
            "artifactId": item["id"],
            "archiveSha256": item["digest"][7:],
            "policySha256": POLICY,
        }
        self.artifact(n, "pages-preparation-" + str(n), "receipt.json", receipt)
        return receipt


class ProductionTests(unittest.TestCase):
    def setUp(self):
        self.api = api = API()
        self.ci = {"sourceHeadSha": SOURCE}
        ci_patch = patch.object(gate.ci_evidence, "verify_full_ci", return_value=self.ci)
        ci_patch.start()
        self.addCleanup(ci_patch.stop)
        self.config = dict.fromkeys(gate.ORDER, "f" * 64)
        m = manifest()
        files = [{"path": "index.html", "sha256": "9" * 64, "bytes": 23}]
        api.run(
            1,
            gate.TEST,
            SOURCE,
            ["integrated-test-serving", "integrated-test-frontend", "integrated-test-final-observation"],
        )
        front = {
            "environment": "test",
            "scope": "iap-household-served-files",
            "schemaVersion": 1,
            "sourceSha": SOURCE,
            "files": files,
            "frontendSha256": gate.digest(files),
        }
        item = api.artifact(1, "integrated-test-frontend-1-1", "frontend.json", front)
        m["frontend"] = {"sha256": front["frontendSha256"], "artifactId": str(item["id"])}
        self.raw_images = {role: ("oci manifest " + role).encode() for role in gate.ORDER}
        m["backends"] = {
            role: gate.cloud.REGISTRY + "/" + role + "@sha256:" + sha(self.raw_images[role])
            for role in gate.ORDER
        }
        m["worker"]["test"]["repository"] = gate.TEST_WORKERS
        for w in m["worker"].values():
            w["sandboxImage"] = "ghcr.io/jzwyrzyk/family-game-factory-sandbox@sha256:" + "d" * 64
        self.images = {k: f"{gate.TEST_REGISTRY}/{k}@" + v.split("@")[1] for k, v in m["backends"].items()}
        self.lanes = {"fixture": "e" * 64, "live": "d" * 64}
        m["configuration"]["testSha256"] = gate.digest(self.lanes)
        for n, scope in ((2, "uat"), (3, "live")):
            job = "integrated-test-" + scope
            api.run(
                n, gate.TEST, SOURCE, ["integrated-test-serving", job, "integrated-test-final-observation"]
            )
            observed = {
                **m["evidence"][scope],
                "releaseIdentitySha256": gate.manifest.release_identity_sha256(m),
                "testBackends": self.images,
                "testConfigurationSha256": m["configuration"]["testSha256"],
                "testWorker": m["worker"]["test"],
                "observedConfigurationSha256": self.lanes["fixture" if scope == "uat" else "live"],
                "targetSha256": "8" * 64,
                "sandboxSourceSha": "d" * 40,
                "sandboxSignerSha": SIGNER,
                "testWorkerRepositoryId": "12345",
                "repairAttempts": 1,
                "settlementSha256": "a" * 64,
                "workerExecution": [
                    {
                        "runId": str(100 + i),
                        "artifactId": str(200 + i),
                        "archiveSha256": str(i) * 64,
                        "executionSha256": str(i) * 64,
                    }
                    for i in (1, 2)
                ],
                "recovery": dict.fromkeys(
                    ("captureSha256", "resetSha256", "restoreSha256", "replayedRevisionSha256"), "9" * 64
                ),
            }
            del observed["receiptSha256"]
            api.artifact(n, job + f"-{n}-1", "receipt.json", observed)
        self.new_pages = api.pages_build(4, SOURCE)
        prior = api.pages_build(5, "c" * 40)
        services = {
            role: {
                "revision": gate.ROLES[role] + "-old",
                "image": gate.cloud.LEGACY_REGISTRY + "/" + role + "@sha256:" + "3" * 64,
                "compatibilitySha256": "8" * 64,
                "configuration": self.config[role],
            }
            for role in gate.ORDER
        }
        self.spec = {
            "manifest": m,
            "productionConfiguration": self.config,
            "expiresAt": "2026-11-28T00:00:00Z",
            "supplyChain": {
                "arcade": self.ci,
                "testWorkerRepositoryId": 12345,
                "sandboxSignerSha": SIGNER,
                "testBuild": "1e439156-0001-411f-9ded-a19de397ec79",
                "testTrigger": "1e439156-0002-411f-9ded-a19de397ec79",
            },
            "runs": {"frontend": 1, "uat": 2, "live": 3},
            "recovery": {
                "services": services,
                "worker": deepcopy(m["worker"]["production"]),
                "pages": prior,
                "snapshotSha256": "b" * 64,
                "readerCompatibilitySha256": "c" * 64,
            },
        }
        self.record = assemble(api, self.spec, self.new_pages)
        api.run(6, gate.CLOUD, SIGNER, ["review-release", "owner-approval"])
        self.approval = {
            "state": "approved",
            "user": {"login": gate.OWNER[0], "id": gate.OWNER[1]},
            "environments": [{"name": gate.APPROVAL_ENV}],
            "comment": "approve-production " + gate.digest(self.record),
        }
        api.reviews = [self.approval]

    def approve(self, now=TIME, recovery=False):
        with patch.object(gate, "git", return_value=gate.manifest.canonical(self.record)):
            return gate.approvals(self.api, self.record, 6, now, recovery=recovery)

    def intent(self, role, op):
        old = self.record["recovery"]["services"][role]
        return {
            "service": gate.ROLES[role],
            "operation": op,
            "source": SOURCE,
            "image": self.record["manifest"]["backends"][role],
            "configuration": old["configuration"],
            "compatibility": old["compatibilitySha256"],
            "baselineImage": old["image"],
            "baseline": old["revision"],
        }

    def test_real_zip_and_exact_approval_each_transition_and_archive(self):
        grant = self.approve()
        for role in gate.ORDER:
            for op in ("stage", "canary", "promote", "rollback"):
                gate.check_intent(self.record, grant, self.intent(role, op))
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp) / "artifact.tar"
            gate.validate_pages(self.api, self.new_pages, POLICY, destination=dest)
            self.assertEqual(dest.read_bytes(), b"archived site " + SOURCE.encode())

    def test_actual_frontend_and_test_lane_producers_seal_through_the_production_controller(self):
        # On the combined candidate these are sibling files. An isolated controller
        # checkout can explicitly select the reviewed UAT worktree for this offline test.
        producer = Path(os.environ.get("JEMS_TEST_PRODUCER_ROOT", ROOT)) / "scripts/environments"

        def load(name):
            spec = importlib.util.spec_from_file_location(name, producer / (name + ".py"))
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            return module

        workers = self.record["manifest"]["worker"]
        source = self.record["manifest"]["sourceSha"]
        target = {
            "source": source,
            "project": "jems-jzw-nonprod",
            "region": "us-east5",
            "projectNumber": "123456789",
            "hub": "hub.test.example",
            "household": "house.test.example",
            "preview": "play.test.example",
            "familyId": "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
            "profile": "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
            "oauthClient": "1234-test.apps.googleusercontent.com",
            "signerSha": SIGNER,
            "sandboxSourceSha": "d" * 40,
            "workerRepositoryId": "12345",
            "images": {**self.images, "household": self.images["gateway"]},
            "services": {
                role: "jems-test-" + role for role in ("gateway", "preview", "household", "coach")
            },
        }
        observer = load("test_target")
        observed = {}
        for lane in ("fixture", "live"):

            def describe(kind, name):
                if kind == "services":
                    return {
                        "metadata": {},
                        "status": {"traffic": [{"revisionName": name + "-" + lane, "percent": 100}]},
                    }
                service = name.removesuffix("-" + lane)
                image = target["images"][service.removeprefix("jems-test-")]
                return {
                    "metadata": {
                        "name": name,
                        "namespace": target["projectNumber"],
                        "labels": {"serving.knative.dev/service": service},
                    },
                    "spec": {"containers": [{"image": image}]},
                    "status": {"conditions": [{"type": "Ready", "status": "True"}], "imageDigest": image},
                }

            observed[lane] = observer.serving(target, describe)
        pins = {k: v["testConfigurationSha256"] for k, v in observed.items()}
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            for name, contents in (
                ("index.html", '<html lang="en"><head></head></html>'),
                ("entry/owner-session.js", "session"),
                ("assets/index-abc.js", "fixture"),
                ("jems-pals/manifest.json", "{}"),
            ):
                file = directory / name
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_text(contents)
            js = """
const fs=require('node:fs/promises'), path=require('node:path');
const {fingerprint,servedIndex}=require(process.argv[1]);
const root=process.argv[2];
fingerprint(root,process.argv[3],async url => {
    if(url==='/'||url==='/index.html') return Buffer.from(servedIndex(await fs.readFile(path.join(root,'index.html'),'utf8')));
    return fs.readFile(path.join(root,url==='/owner-session.js'?'entry/owner-session.js':url.slice(1)));
}).then(r=>process.stdout.write(JSON.stringify(r))).catch(e=>{console.error(e);process.exitCode=1});
"""
            data = subprocess.check_output(
                ["node", "-e", js, str(producer / "test-frontend.cjs"), tmp, source], timeout=20
            )
            self.api.artifacts[1] = []
            frontend = self.api.artifact(1, "integrated-test-frontend-1-1", "frontend.json", data)
            clean = {
                **self.record["manifest"],
                "evidence": dict.fromkeys(("uat", "live", "ci")),
                "frontend": {
                    "artifactId": str(frontend["id"]),
                    "sha256": json.loads(data)["frontendSha256"],
                },
                "configuration": {
                    **self.record["manifest"]["configuration"],
                    "testSha256": gate.digest(pins),
                },
            }
            self.spec["manifest"] = clean
            spec_env = {
                **os.environ,
                "GITHUB_SHA": source,
                "FAMILY_SOURCE": source,
                "RUNNER_TEMP": tmp,
                "TEST_TARGET": json.dumps(target),
                "TEST_CONFIGURATION_PINS": json.dumps(pins),
                "TEST_MANIFEST": json.dumps(clean),
            }
            proofs = {}
            for lane, run, name in (("fixture", 2, "uat"), ("live", 3, "live")):
                (directory / "test-serving.json").write_bytes(gate.manifest.canonical(observed[lane]))
                subprocess.run(
                    [sys.executable, str(producer / "test_target.py"), "bind"],
                    check=True,
                    timeout=10,
                    env={**spec_env, "FAMILY_OPERATION": "uat" if lane == "fixture" else "live-uat"},
                )
                bound = json.loads((directory / "test-bound.json").read_text())
                received, _ = gate.receipt(self.api, self.api.artifacts[run][0])
                fields = (
                    ("journeys", "providerMode", "workerExecution", "recovery")
                    if lane == "fixture"
                    else (
                        "journeys",
                        "providerMode",
                        "spendMicrousd",
                        "limitMicrousd",
                        "authorizationSha256",
                        "repairAttempts",
                        "settlementSha256",
                    )
                )
                proof = {
                    **{k: v for k, v in bound.items() if k != "frontend"},
                    **{k: received[k] for k in fields},
                    "target": "deployed-test",
                }
                if lane == "fixture":
                    provisional = {
                        **proof,
                        "testConfigurationSha256": pins["fixture"],
                        "target": "deployed-test-fixture-qualification",
                        "frontendIdentity": bound["frontend"],
                    }
                    with patch.dict(sys.modules, {"test_target": observer}):
                        proof = load("test_fixture_reuse").retained(provisional, bound)
                proofs[name] = proof

            def seal():
                for run, name in ((2, "uat"), (3, "live")):
                    self.api.artifacts[run] = []
                    self.api.artifact(run, f"integrated-test-{name}-{run}-1", "receipt.json", proofs[name])
                return assemble(self.api, self.spec, self.new_pages)

            sealed = seal()
            self.assertEqual(sealed["manifest"]["configuration"]["testSha256"], gate.digest(pins))
            self.assertEqual(workers["test"], proofs["uat"]["testWorker"])
            for scope, key, val in (
                ("uat", "observedConfigurationSha256", pins["live"]),
                ("live", "targetSha256", "0" * 64),
                ("uat", "testWorkerRepositoryId", "1458899834"),
                ("uat", "sandboxSignerSha", "0" * 40),
                ("uat", "workerExecution", proofs["uat"]["workerExecution"][:1]),
                ("live", "repairAttempts", 0),
            ):
                with self.subTest(scope=scope, key=key), patch.dict(
                    proofs[scope], {key: val}
                ), self.assertRaises(ValueError):
                    seal()

    def test_no_transcribed_source_worker_evidence_or_failed_checks(self):
        for edit in (
            lambda r: r["manifest"].update(sourceSha="b" * 40),
            lambda r: r["manifest"]["worker"]["test"].update(repository=gate.WORKERS),
            lambda r: r["manifest"]["evidence"]["uat"]["journeys"].update(artwork="failure"),
            lambda r: r["recovery"]["services"]["gateway"].update(configuration="4" * 64),
        ):
            bad = deepcopy(self.record)
            edit(bad)
            with self.assertRaises(ERROR):
                gate.validate(bad)
        self.api.jobs[4][-1]["conclusion"] = "skipped"
        with self.assertRaises(ERROR):
            gate.evidence(self.api, self.record)

    def test_foreign_or_stale_grant_rejected_recovery_only(self):
        for key, val in (
            ("state", "rejected"),
            ("user", {"login": gate.OWNER[0], "id": 2}),
            ("comment", "approved"),
            ("environments", [{"name": "github-pages"}]),
        ):
            with self.subTest(key=key), patch.dict(self.approval, {key: val}), self.assertRaises(ERROR):
                self.approve()
        with self.assertRaises(ERROR):
            self.approve(TIME + 3 * 86400)
        with patch.dict(self.approval, comment="approve-recovery " + gate.digest(self.record)):
            self.approve(recovery=True)
            with self.assertRaises(ERROR):
                self.approve()
            with self.assertRaises(ERROR):
                self.approve(TIME + 3700, recovery=True)
        self.api.later = [{"id": 12, "display_title": "Review recovery manifest"}]
        with self.assertRaises(ERROR):
            self.approve()
        self.api.later = []
        self.record["recovery"]["snapshotSha256"] = "1" * 64
        with self.assertRaises(ERROR):
            self.approve()

    def test_artifact_provenance_spend_and_caller_tampering(self):
        for mutation in (
            {"run_attempt": 2},
            {"head_branch": "develop"},
            {"head_repository": {"id": 1}},
            {"event": "pull_request"},
        ):
            with patch.dict(self.api.runs[2], mutation), self.assertRaises(ERROR):
                gate.evidence(self.api, self.record)
        row = self.api.artifacts[2][0]
        with patch.dict(row, expired=True), self.assertRaises(ERROR):
            gate.evidence(self.api, self.record)
        with patch.dict(self.api.data, {row["id"]: b"bad bytes"}), self.assertRaises(ERROR):
            gate.evidence(self.api, self.record)
        with patch.dict(self.record["manifest"]["evidence"]["live"], spendMicrousd=0), self.assertRaises(
            ERROR
        ):
            gate.evidence(self.api, self.record)
        grant = self.approve()
        for key in ("source", "image", "baselineImage", "baseline", "compatibility", "configuration"):
            with self.subTest(key=key), self.assertRaises(ERROR):
                gate.check_intent(self.record, grant, {**self.intent("gateway", "promote"), key: "changed"})

    def test_partial_rollout_blocks_dependents_and_rollback_runs_in_reverse_order(self):
        observed = {}

        def observe(service, _api):
            return observed[service]

        def set_state(role, back):
            old = self.record["recovery"]["services"][role]
            observed[gate.ROLES[role]] = {
                "baseline": old["revision"] if back else gate.expected_revision(self.record, role),
                "baselineImage": old["image"] if back else self.record["manifest"]["backends"][role],
                "configuration": self.config[role],
                "matchesServingConfiguration": True,
            }

        with patch.object(gate.cloud, "inspect_service", side_effect=observe):
            for r in gate.ORDER:
                set_state(r, True)
            with self.assertRaises(ERROR):
                gate.predecessors(self.record, self.intent("gateway", "stage"), {})
            for r in gate.ORDER:
                gate.predecessors(self.record, self.intent(r, "stage"), {})
                set_state(r, False)
            with self.assertRaises(ERROR):
                gate.predecessors(self.record, self.intent("coach", "rollback"), {})
            for r in reversed(gate.ORDER):
                gate.predecessors(self.record, self.intent(r, "rollback"), {})
                set_state(r, True)

    def test_healthy_settled_canary_only(self):
        intent = self.intent("gateway", "promote")
        self.api.run(7, gate.CLOUD, SIGNER, ["transition"])
        self.api.run(8, ".github/workflows/jems-production-diagnostics.yml", SIGNER, ["evidence"])
        report = {
            "query_status": "COMPLETE",
            "project": gate.cloud.PROJECT,
            "region": "us-east5",
            "scope": {
                "service": intent["service"],
                "revision": gate.cloud.revision_name(intent),
                "start_utc": STAMP,
                "end_utc": "2026-11-26T02:20:00Z",
            },
            "workflow": {"run_id": "8", "attempt": "1", "workflow_source_sha": SIGNER},
            "counts": {"http_2xx": 1, "http_5xx": 0},
        }

        def check():
            self.api.artifacts[8] = []
            self.api.artifact(8, "jems-request-evidence-8-1", "report.json", report)
            gate.canary_health(
                self.api,
                intent,
                {"canaryRunId": 7, "diagnosticsRunId": 8, "canaryCommit": SIGNER},
                TIME + 1200,
            )

        with patch.object(
            gate, "git", return_value=gate.manifest.canonical({**intent, "operation": "canary"})
        ):
            check()
            for key, value in (
                ("query_status", "INCOMPLETE"),
                ("counts", {"http_2xx": 0, "http_5xx": 0}),
                ("counts", {"http_2xx": 3, "http_5xx": 1}),
            ):
                with patch.dict(report, {key: value}), self.assertRaises(ERROR):
                    check()

    def test_website_requires_current_complete_ready_order_and_public_marker(self):
        api = self.api
        api.run(9, gate.CLOUD, SIGNER, ["observe"])
        doc = {
            "status": "READ_ONLY_RELEASE_OBSERVATION_COMPLETE",
            "mutations": 0,
            "source_sha": SIGNER,
            "run_id": "9",
            "run_attempt": "1",
            "observed_at_utc": STAMP,
            "services": [],
        }
        for role in gate.ORDER:
            rev = gate.expected_revision(self.record, role)
            doc["services"].append(
                {
                    "service": gate.ROLES[role],
                    "service_reconciled": True,
                    "desired": {rev: 100},
                    "effective": {rev: 100},
                    "matchesServingConfiguration": True,
                    "configuration": self.config[role],
                    "revisions": {rev: {"ready": True, "image": self.record["manifest"]["backends"][role]}},
                }
            )

        def check():
            api.artifacts[9] = []
            api.artifact(9, "serving-observation-9-1", "receipt.json", doc)
            gate.check_observation(api, 9, SIGNER, self.record, TIME)

        check()
        with patch.dict(doc["services"][-1], effective={"old": 100}), self.assertRaises(ERROR):
            check()
        api.later = [{"id": 10}]
        with self.assertRaises(ERROR):
            check()
        verify_website.verify(
            SOURCE, "household", "9", reader=lambda _: {"sourceSha": SOURCE}, pause=lambda _: None
        )
        with self.assertRaises(ValueError):
            verify_website.verify(
                SOURCE, "household", "9", reader=lambda _: {"sourceSha": SIGNER}, pause=lambda _: None
            )

    def test_bootstrap_reads_each_file_and_cannot_substitute_for_forward_qualification(self):
        retained = gate.retained_pages
        historic = {
            "deployments?environment=github-pages&per_page=1": [
                {"id": retained.DEPLOYMENT, "sha": retained.SIGNER, "environment": "github-pages"}
            ],
            f"deployments/{retained.DEPLOYMENT}/statuses?per_page=1": [
                {
                    "state": "success",
                    "environment_url": retained.SITE,
                    "log_url": f"https://github.com/{retained.REPO}/actions/runs/{retained.RUN}/job/138518380833",
                }
            ],
            f"actions/runs/{retained.RUN}": {
                "head_sha": retained.SIGNER,
                "path": gate.PAGES,
                "run_attempt": 2,
                "conclusion": "success",
                "head_branch": "main",
                "repository": REPO,
                "head_repository": REPO,
                "event": "workflow_dispatch",
            },
        }
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            files = {
                "jems-release.json": json.dumps({"sourceSha": retained.SOURCE}).encode(),
                "asset.js": b"original asset",
            }
            for k, v in files.items():
                (folder / k).write_bytes(v)
            inventory = retained.inventory(folder, historic.__getitem__, lambda name, _size: files[name])
            page = {**self.new_pages, "sourceSha": retained.SOURCE, "retainedInventorySha256": inventory}
            gate.pages_ref(page, recovery=True)
            with self.assertRaises(ERROR):
                gate.pages_ref(page)
            with patch.dict(files, {"asset.js": b"modified"}), self.assertRaises(ValueError):
                retained.inventory(folder, historic.__getitem__, lambda name, _size: files[name])
            historic["deployments?environment=github-pages&per_page=1"][0]["sha"] = SOURCE
            with self.assertRaises(ValueError):
                retained.inventory(folder, historic.__getitem__, lambda name, _size: files[name])

    def test_registry_copy_requires_full_provenance_and_identical_raw_digest(self):
        chain = self.record["supplyChain"]
        build = {
            "source": SOURCE,
            "trigger": chain["testTrigger"],
            "build": chain["testBuild"],
            "images": self.images,
        }
        commands = []

        def reader(argv):
            return (
                gate.manifest.canonical(build)
                if argv[0] == "node"
                else self.raw_images[argv[-1].split("/")[-1].split(":")[0]]
            )

        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp)
            mirror_images.copy_images(
                self.record, reader, lambda a, **kw: commands.append(a), target, lambda: None
            )
            self.assertTrue(all("--preserve-digests" in cmd for cmd in commands))
            self.assertEqual(len(commands), 3)
            self.assertEqual(
                json.loads((target / "receipt.json").read_text())["packageSha256"], gate.digest(self.record)
            )
            with patch.dict(build, source=SIGNER), self.assertRaises(ERROR):
                mirror_images.copy_images(self.record, reader, lambda *a, **kw: None, target, lambda: None)
            with patch.dict(self.raw_images, coach=b"wrong"), self.assertRaises(ERROR):
                mirror_images.copy_images(self.record, reader, lambda *a, **kw: None, target, lambda: None)

    def test_production_private_checkout_and_environment_pins_are_observed(self):
        worker = self.record["manifest"]["worker"]["production"]
        body = b"repo: public-app\nref: " + SOURCE.encode() + b"\n"
        template = {"factory-private.yml": (1, sha(body.replace(SOURCE.encode(), b"APPLICATION")))}

        def read(repo, path):
            self.assertEqual(repo, gate.WORKERS)
            if path.startswith("/contents/"):
                return {
                    "type": "file",
                    "path": ".github/workflows/factory-private.yml",
                    "encoding": "base64",
                    "size": len(body),
                    "sha": hashlib.sha1(b"blob " + str(len(body)).encode() + b"\0" + body).hexdigest(),
                    "content": gate.base64.b64encode(body).decode(),
                }
            if path.startswith("/actions/"):
                key = path.rsplit("/", 1)[-1]
                return {
                    "name": key,
                    "value": worker["sandboxImage" if key == "FACTORY_SANDBOX_IMAGE" else "sourceSha"],
                }
            return {"variables": [], "total_count": 0}

        def quiet(repo, path):
            if "/actions/workflows/" in path:
                return {"total_count": 0, "workflow_runs": []}
            if path.endswith(("/FACTORY_ACTIONS_APPROVED", "/FACTORY_RUNNER_SMOKE_APPROVED")):
                return {"name": path.rsplit("/", 1)[-1], "value": "false"}
            return read(repo, path)

        gate.production_worker_binding(worker, SOURCE, quiet, template, rotating=True)
        for status in ("waiting", "in_progress", "queued", "pending", "requested"):

            def busy(repo, path):
                if "status=" + status + "&" in path:
                    return {"total_count": 1, "workflow_runs": [{"id": 4}]}
                return quiet(repo, path)

            with self.subTest(status=status), self.assertRaises(ERROR):
                gate.production_worker_binding(worker, SOURCE, busy, template, rotating=True)

        def enabled(repo, path):
            if path.endswith("/FACTORY_ACTIONS_APPROVED"):
                return {"name": "FACTORY_ACTIONS_APPROVED", "value": "true"}
            return quiet(repo, path)

        with self.assertRaises(ERROR):
            gate.production_worker_binding(worker, SOURCE, enabled, template, rotating=True)
        gate.production_worker_binding(worker, SOURCE, read, template)
        with self.assertRaises(ERROR):
            gate.production_worker_binding(worker, SIGNER, read, template)

        def shadow(repo, path):
            if "/environments/factory-sandbox/" in path:
                return {
                    "total_count": 1,
                    "variables": [{"name": "FACTORY_SANDBOX_IMAGE", "value": "other"}],
                }
            return read(repo, path)

        with self.assertRaises(ERROR):
            gate.production_worker_binding(worker, SOURCE, shadow, template)

    def test_private_tag_change_or_replaced_repository_rejects(self):
        def read(repo, path):
            is_test = repo == gate.TEST_WORKERS
            w = self.record["manifest"]["worker"]["test" if is_test else "production"]
            if path == "":
                return {
                    "full_name": repo,
                    "private": True,
                    "default_branch": "main",
                    "id": 12345 if is_test else 1458899834,
                }
            if path == "/branches/main":
                return {"protected": True, "commit": {"sha": w["sourceSha"]}}
            return {
                "ref": "refs/tags/" + w["executionTag"],
                "object": {"type": "commit", "sha": w["sourceSha"]},
            }

        call = []
        with patch.object(gate, "production_worker_binding") as binding:
            gate.runtime_supply(self.record, read, lambda a, **kw: call.append(a))
            binding.assert_called_once_with(
                self.record["manifest"]["worker"]["production"], SOURCE, read, rotating=False
            )
        self.assertIn("--deny-self-hosted-runners", call[0])

        def moved(repo, path):
            response = read(repo, path)
            if path.startswith("/git/ref/tags/"):
                response["object"]["sha"] = "0" * 40
            return response

        with self.assertRaises(ERROR):
            gate.runtime_supply(self.record, moved, lambda *a, **kw: None)


class ProtectedReleaseCITests(unittest.TestCase):
    def test_original_sha_is_allowed_only_as_protected_ancestor_under_same_policy(self):
        api = Arcade(kind="test")
        api.main = MAIN
        request = api.request
        response = {"status": "ahead", "merge_base_commit": {"sha": HEAD}}
        with patch.object(
            api, "request", side_effect=lambda path: response if "/compare/" in path else request(path)
        ):
            self.assertEqual(
                gate.ci_evidence.verify_full_ci(api, HEAD, "release", now=NOW)["testedSha"], HEAD
            )
            response["status"] = "diverged"
            with self.assertRaises(ValueError):
                gate.ci_evidence.verify_full_ci(api, HEAD, "release", now=NOW)
