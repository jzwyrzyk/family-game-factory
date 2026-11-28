"""Check the protected integrated TEST binding and observe its serving revision identities."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys


import ci_evidence
from release import canonical, release_identity_sha256, validate_manifest

PROJECT = "jems-jzw-nonprod"
REGION = "us-east5"
OPERATIONS = ("prepare-uat", "qualify-fixture", "uat", "live-uat")
ROLES = ("gateway", "household", "preview", "coach")


def need(ok, code):
    if not ok:
        raise ValueError(code)


def digest(value):
    return hashlib.sha256(canonical(value)).hexdigest()


def checked_target(target, source):
    need(source == target["source"] and re.fullmatch(r"[0-9a-f]{40}", source), "TEST_SOURCE_MISMATCH")
    need(target["project"] == PROJECT and target["region"] == REGION, "TEST_PROJECT_REQUIRED")
    hosts = []
    for k in ("hub", "preview", "household"):
        host = target[k]
        need(re.fullmatch(r"[a-z0-9-]+(?:\.[a-z0-9-]+)+", host) and not host.endswith((".run.app", ".github.io")), "TEST_HOST_INVALID")
        hosts.append(host)
    need(len(set(hosts)) == 3 and not any(a.endswith("." + b) for a in hosts for b in hosts), "TEST_HOSTS_OVERLAP")
    need(set(target["services"]) == set(ROLES), "TEST_SERVICES_REQUIRED")
    for role, service in target["services"].items():
        need(service == "jems-test-" + role, "TEST_SERVICE_NAME_INVALID")
    need(re.fullmatch(r"[1-9][0-9]{5,19}", target["projectNumber"]), "TEST_PROJECT_NUMBER_REQUIRED")
    need(re.fullmatch(r"[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com", target["oauthClient"]), "TEST_OAUTH_CLIENT_REQUIRED")
    uuid=r"[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}"
    need(re.fullmatch(uuid, target["familyId"]) and re.fullmatch(uuid, target["profile"]), "SYNTHETIC_FAMILY_REQUIRED")
    need(re.fullmatch(r"[1-9][0-9]{1,15}",target["workerRepositoryId"]) and target["workerRepositoryId"] != "1458899834", "ISOLATED_WORKER_REPOSITORY_REQUIRED")
    need(all(re.fullmatch(r"[a-f0-9]{40}",target[k]) for k in ("signerSha","sandboxSourceSha")), "TEST_SANDBOX_SIGNING_IDENTITY_REQUIRED")
    need(set(target["images"]) == set(ROLES), "TEST_IMAGE_TUPLE_REQUIRED")
    return target


def serving(target, describe, selected=None):
    """Take metadata from serving revisions. Ignore an idle latest/staged revision."""
    config, images = {}, {}
    for role in ROLES:
        name = target["services"][role]
        service = describe("services", name)
        traffic = [row for row in service["status"]["traffic"] if row.get("percent", 0)]
        need(len(traffic) == 1 and traffic[0]["percent"] == 100, "SPLIT_OR_ABSENT_TEST_TRAFFIC")
        revision = selected[role] if selected else traffic[0].get("revisionName", "")
        need(re.fullmatch(re.escape(name) + r"-[a-z0-9][a-z0-9-]{0,40}",revision), "TEST_REVISION_NAME_MISMATCH")
        actual = describe("revisions", revision)
        meta, spec, status = actual["metadata"], actual["spec"], actual["status"]
        need(meta["name"] == revision and meta["labels"]["serving.knative.dev/service"] == name and
             str(meta["namespace"]) == target["projectNumber"] and
             any(x.get("type") == "Ready" and x.get("status") == "True" for x in status["conditions"]), "TEST_REVISION_UNREADY")
        need(len(spec["containers"]) == 1, "TEST_CONTAINER_COUNT")
        image = status["imageDigest"]
        if image.startswith("sha256:"):
            image = spec["containers"][0]["image"].split("@")[0] + "@" + image
        need(re.fullmatch(REGION + r"-docker\.pkg\.dev/" + PROJECT + r"/[a-z0-9._/-]+@sha256:[a-f0-9]{64}", image), "TEST_PINNED_REGIONAL_IMAGE_REQUIRED")
        need(image == target["images"][role], "SERVING_IMAGE_DIFFERS_FROM_REVIEW")
        images[role] = image
        config[role] = digest({"spec":spec, "revision":revision, "image":image,
                               "ingress":service["metadata"].get("annotations", {}).get("run.googleapis.com/ingress"),
                               "annotations":meta.get("annotations", {})})
    need(images["household"] == images["gateway"], "HOUSEHOLD_GATEWAY_BUILD_DIFFERS")
    return {"sourceSha":target["source"],"targetSha256":digest(target),"testBackends":{k:images[k] for k in ("gateway","coach","preview")},
            "testConfigurationSha256":digest({"target":target,"revisions":config})}


def read_json(value):
    return ci_evidence.parse_json(value)


def compose():
    parser=argparse.ArgumentParser(description="Assemble a TEST UAT target from reviewed private activation records")
    for field in ("release","bindings","coach-image","family","profile","signer","out"):
        parser.add_argument("--"+field,required=True)
    args=parser.parse_args(sys.argv[2:])
    release=read_json(Path(args.release).read_bytes())
    bindings=read_json(Path(args.bindings).read_bytes())
    d=release["descriptor"]
    need(d["environment"]=="test" and bindings["project"]==PROJECT and bindings["projectNumber"]==d["projectNumber"] and
         bindings["worker"]["repository"]=="family-game-factory-lab/family-game-factory-worker-test" and
         bindings["database"]=="jems-test" and bindings["artifactBucket"]==PROJECT+"-jems-test-artifacts","TEST_BINDINGS_REQUIRED")
    need(args.coach_image==release["coachImage"],"TEST_COACH_BUILD_MISMATCH")
    target={k:d[k] for k in ("project","projectNumber","region","hub","preview","household")}
    target.update(source=release["source"],oauthClient=bindings["iapOAuthAudience"],familyId=args.family,profile=args.profile,
                  workerRepositoryId=bindings["worker"]["repositoryId"],sandboxSourceSha=bindings["worker"]["sandboxSource"],signerSha=args.signer,
                  services={**{k:v["name"] for k,v in d["services"].items()},"coach":"jems-test-coach"},
                  images={"gateway":d["gatewayImage"],"household":d["gatewayImage"],"preview":d["previewImage"],"coach":args.coach_image},
                  iapBackends={k:d["backends"][k] for k in ("management","household")})
    checked_target(target,release["source"])
    Path(args.out).write_bytes(canonical(target))


def run():
    p = argparse.ArgumentParser()
    p.add_argument("operation", choices=("preflight","observe","check-target","bind"))
    args = p.parse_args()
    source = os.environ["GITHUB_SHA"]
    need(source == os.environ["FAMILY_SOURCE"] and os.environ["FAMILY_OPERATION"] in OPERATIONS, "TEST_EXACT_DISPATCH_REQUIRED")
    target = checked_target(read_json(os.environ["TEST_TARGET"]), source)
    dest = Path(os.environ["RUNNER_TEMP"])
    if args.operation == "preflight":
        from github import GitHub
        ci_evidence.verify_full_ci(GitHub(), source, "test", None)
        release = read_json(os.environ["REVIEWED_RELEASE"])
        descriptor = release["descriptor"]
        need(release["source"] == source and descriptor["environment"] == "test" and
             all(target[k] == descriptor[k] for k in ("project","projectNumber","region","hub","preview","household")) and
             all(target["services"][k] == descriptor["services"][k]["name"] for k in ("gateway","household","preview")) and
             target["images"]["preview"] == descriptor["previewImage"] and
             target["images"]["gateway"] == descriptor["gatewayImage"] and target["images"]["coach"]==release["coachImage"] and
             all(target["iapBackends"][k]==descriptor["backends"][k] for k in ("household","management")), "TEST_DIRECTORY_BINDING")
        (dest/"test-reviewed.json").write_bytes(canonical(release))
        with open(os.environ["GITHUB_OUTPUT"],"a") as output:
            print("audience="+target["oauthClient"],file=output)
    elif args.operation == "observe":
        def describe(kind, name):
            argv = ["gcloud","run",kind,"describe",name,"--project",PROJECT,"--region",REGION,"--format=json","--quiet"]
            return read_json(subprocess.check_output(argv, timeout=45, stderr=subprocess.DEVNULL))
        for role in ("household","management"):
            name=target["iapBackends"][role]
            need(re.fullmatch(r"jems-test-[a-z0-9-]+",name), "TEST_IAP_BACKEND_NAME_REQUIRED")
            row=read_json(subprocess.check_output(["gcloud","compute","backend-services","describe",name,"--project",PROJECT,
                "--global","--format=json","--quiet"],timeout=45,stderr=subprocess.DEVNULL))
            need(row["name"]==name and row["iap"]["enabled"] is True and row["iap"].get("oauth2ClientId")==target["oauthClient"],
                 "TEST_PROGRAMMATIC_IAP_UNVERIFIED")
        (dest/"test-serving.json").write_bytes(canonical(serving(target,describe)))
        if os.environ["FAMILY_OPERATION"]=="prepare-uat" and os.environ.get("TEST_COMPARISON_REVISIONS"):
            candidates=read_json(os.environ["TEST_COMPARISON_REVISIONS"])
            need(set(candidates)=={"fixture","live"} and all(set(lane)==set(ROLES) for lane in candidates.values()),
                 "TEST_REVIEWED_REVISION_TUPLES_REQUIRED")
            pins={lane:serving(target,describe,revisions)["testConfigurationSha256"] for lane,revisions in candidates.items()}
            need(pins["fixture"]!=pins["live"],"TEST_FUNDED_OVERLAY_REQUIRED")
            (dest/"test-configurations.json").write_bytes(canonical(pins))
    else:
        observed = read_json((dest/"test-serving.json").read_bytes())
        need(observed["sourceSha"] == source and observed["targetSha256"] == digest(target), "TEST_OBSERVATION_SOURCE")
        if args.operation=="check-target":
            return
        manifest = read_json(os.environ["TEST_MANIFEST"])
        validate_manifest(manifest)
        need(source==manifest["sourceSha"],"TEST_MANIFEST_SOURCE_CHANGED")
        if os.environ["FAMILY_OPERATION"]=="qualify-fixture":
            observed_hash=registered_hash=observed["testConfigurationSha256"]
        else:
            lanes=read_json(os.environ["TEST_CONFIGURATION_PINS"])
            need(isinstance(lanes,dict) and set(lanes)=={"fixture","live"} and
                 all(re.fullmatch(r"[a-f0-9]{64}",v) for v in lanes.values()), "TEST_CONFIG_PAIR_REQUIRED")
            mode="live" if os.environ["FAMILY_OPERATION"]=="live-uat" else "fixture"
            observed_hash=lanes[mode]
            registered_hash=digest(lanes)
        need(observed_hash==observed["testConfigurationSha256"] and
             manifest["configuration"]["testSha256"]==registered_hash,"TEST_CONFIG_CHANGED")
        need(all(manifest["backends"][k] and manifest["backends"][k].split("@")[-1] == v.split("@")[-1]
                 for k,v in observed["testBackends"].items()), "TEST_IMAGE_CHANGED")
        need(manifest["worker"]["test"] and manifest["worker"]["test"]["repository"]=="family-game-factory-lab/family-game-factory-worker-test", "TEST_WORKER_REQUIRED")
        bound = {**observed, "sandboxSignerSha":target["signerSha"],"sandboxSourceSha":target["sandboxSourceSha"],
                 "testWorkerRepositoryId":target["workerRepositoryId"], "observedConfigurationSha256":observed_hash, "testConfigurationSha256":registered_hash, "releaseIdentitySha256":release_identity_sha256(manifest),"frontend":manifest["frontend"], "testWorker":manifest["worker"]["test"]}
        (dest/"test-bound.json").write_bytes(canonical(bound))


if __name__ == "__main__":
    try:
        if sys.argv[1:2]==["compose"]:
            compose()
        else:
            run()
    except Exception:
        raise SystemExit("INTEGRATED_TEST_IDENTITY_UNVERIFIED")
