#!/usr/bin/env python3
"""Build a reviewed private-coach image using the EXISTING approved Cloud Build identity.

Default: offline plan only, no credentials, cloud calls, image publication or
infrastructure change. --execute is a SEPARATE explicit owner action. This
script never deploys a service, creates a secret or enables model inference.
"""
import argparse
import json
import re
import sys
import tempfile
import time
from pathlib import Path

from build import PROJECT,BUILDER,preflight,source_archive,run,cloud

REGION=re.compile(r"[a-z]+-[a-z]+[0-9]")
SHA=re.compile(r"[a-f0-9]{40}")
BUILD_ID=re.compile(r"[a-f0-9-]{36}")


def config_for(region: str, sha: str) -> dict:
    if not REGION.fullmatch(region or ""):
        raise RuntimeError("An exact reviewed region is required.")
    if sha!="<REVIEWED_SHA>" and not SHA.fullmatch(sha):
        raise RuntimeError("An exact 40-character reviewed commit SHA is required.")
    image=f"{region}-docker.pkg.dev/{PROJECT}/factory-services/coach:{sha}"
    return {
        "steps":[{"name":"gcr.io/cloud-builders/docker","args":[
            "build","--pull","--label","org.opencontainers.image.revision="+sha,
            "-f","server/Dockerfile.coach","-t",image,"."]}],
        "images":[image],
        "serviceAccount":f"projects/{PROJECT}/serviceAccounts/{BUILDER}",
        "options":{"logging":"CLOUD_LOGGING_ONLY","machineType":"E2_MEDIUM"},
        "timeout":"1200s",
        "tags":["factory-coach-inactive","source-"+sha]
    }


def verify_build(build: dict, expected: dict) -> str:
    for key in ("serviceAccount","images","tags"):
        if build.get(key)!=expected.get(key):
            raise RuntimeError("Cloud Build source, image or identity differs from reviewed private-coach plan.")
    # Cloud Build adds read-only execution metadata to returned BuildStep records.
    # Ignore only those fields, retaining exact comparison of every executable
    # setting (name, args, entrypoint, env, secrets, script, volumes, etc.).
    runtime_metadata = {"status", "pullTiming", "timing", "exitCode"}
    actual_steps = build.get("steps") or []
    planned_steps = expected["steps"]
    if len(actual_steps) != len(planned_steps) or any(
        {k: v for k, v in actual.items() if k not in runtime_metadata} != planned
        for actual, planned in zip(actual_steps, planned_steps)
    ):
        raise RuntimeError("Cloud Build executable steps differ from reviewed private-coach plan.")
    if build.get("status")!="SUCCESS":
        raise RuntimeError("Coach build has not completed successfully; do not deploy.")
    images=build.get("results",{}).get("images") or []
    if len(images)!=1 or images[0].get("name")!=expected["images"][0]:
        raise RuntimeError("Expected exactly one coach image from Cloud Build.")
    digest=images[0].get("digest") or ""
    if not re.fullmatch(r"sha256:[a-f0-9]{64}",digest):
        raise RuntimeError("Image result has no reviewed sha256 digest.")
    immutable=expected["images"][0].rsplit(":",1)[0]+"@"+digest
    metadata=cloud("artifacts","docker","images","describe",immutable)
    if metadata.get("image_summary",{}).get("digest")!=digest:
        raise RuntimeError("Artifact Registry immutable digest verification failed.")
    return immutable


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--region",required=True)
    parser.add_argument("--reviewed-source-sha")
    parser.add_argument("--source-bucket")
    parser.add_argument("--preflight",action="store_true")
    parser.add_argument("--execute",action="store_true")
    parser.add_argument("--build-id",help="Read or resume an EXISTING build; never resubmit")
    args=parser.parse_args(argv)
    region=args.region
    sha=args.reviewed_source_sha or ""
    bucket=args.source_bucket or f"{PROJECT}-service-builds-{region}"
    if not REGION.fullmatch(region):
        raise RuntimeError("Invalid region.")
    if not re.fullmatch(r"[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]",bucket):
        raise RuntimeError("Invalid build source bucket.")
    if args.preflight and (args.execute or args.build_id):
        raise RuntimeError("Read-only preflight cannot submit or resume a build.")
    conf=config_for(region,sha or "<REVIEWED_SHA>")
    if not args.execute and not args.preflight and not args.build_id:
        print(json.dumps({"project":PROJECT,"sourceSha":sha or "REQUIRED",
            "build":conf,"sourceBucket":bucket,
            "deployment":"NOT INCLUDED; inactive Cloud Run creation is a separate authorization",
            "mutations":"none"},indent=2))
        return
    if args.preflight:
        preflight(region,bucket)
        print("Read-only Cloud Build preflight passed; no image was built or published.")
        return
    if not SHA.fullmatch(sha):
        raise RuntimeError("A reviewed immutable commit SHA is required before any build or retrieval.")
    if args.build_id and not BUILD_ID.fullmatch(args.build_id):
        raise RuntimeError("Invalid reviewed Cloud Build ID.")
    root=Path(__file__).resolve().parents[2]
    preflight(region,bucket)
    build_id=args.build_id
    if not build_id:
        if not args.execute:
            raise RuntimeError("Creating a paid Cloud Build requires explicit --execute.")
        run(["git","cat-file","-e",sha+"^{commit}"],root)
        with tempfile.TemporaryDirectory(prefix="factory-coach-build-") as directory:
            archive,archive_hash=source_archive(root,directory,sha)
            cfg=Path(directory)/"coach-cloudbuild.json"
            cfg.write_text(json.dumps(conf))
            print("Submitting reviewed inactive coach source sha256:"+archive_hash,file=sys.stderr)
            response=cloud("builds","submit",str(archive),"--config",str(cfg),
                "--region",region,"--gcs-source-staging-dir","gs://"+bucket+"/source","--async")
            build_id=response.get("id")
            if not isinstance(build_id,str) or not BUILD_ID.fullmatch(build_id):
                raise RuntimeError("Submission response lacks a build ID. Inspect Cloud Build history; do not retry automatically.")
    print("Existing Cloud Build ID: "+build_id+" (do not resubmit)",file=sys.stderr)
    for attempt in range(181):
        result=cloud("builds","describe",build_id,"--region",region)
        if result.get("status") not in ("PENDING","QUEUED","WORKING"):
            break
        if attempt==180:raise RuntimeError("Build is still running. Check the existing build; do not resubmit.")
        time.sleep(10)
    immutable=verify_build(result,conf)
    print(json.dumps({"project":PROJECT,"region":region,
        "sourceSha":sha,"buildId":build_id,"immutableCoachImage":immutable,
        "deployed":False,"modelEnabled":False},indent=2))


if __name__=="__main__":
    try:main()
    except RuntimeError as error:
        print(str(error),file=sys.stderr);sys.exit(1)
    except Exception:
        print("Private coach build stopped. Raw diagnostics are suppressed.",file=sys.stderr);sys.exit(1)
