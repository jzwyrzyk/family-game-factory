"""Verify the private workflow result, archive and actual execution identity of each observed TEST job."""
import hashlib
import io
import os
from pathlib import Path
import re
import subprocess
import time
import zipfile

from ci_evidence import parse_json
from release import canonical
from test_target import need, PROJECT

REPO = "family-game-factory-lab/family-game-factory-worker-test"
PREFIX = "repos/"+REPO+"/"
WORKFLOW = ".github/workflows/factory-private-test.yml"


def raw(endpoint):
    return subprocess.check_output(["gh","api",PREFIX+endpoint],stderr=subprocess.DEVNULL,timeout=45)


def verify(run,artifact,archive,job,worker,target,tree):
    run_id = int(job["runId"])
    need(run["id"] == run_id and run["repository"]["id"] == int(target["workerRepositoryId"]) and
         run["repository"]["full_name"] == REPO == worker["repository"] and run["head_repository"]["id"] == run["repository"]["id"] and
         run["repository"]["private"] is True and run["path"] == WORKFLOW and run["run_attempt"] == 1 and
         run["head_branch"] == "main" and run["head_sha"] == worker["sourceSha"] and run["event"] == "workflow_dispatch" and
         run["status"] == "completed" and run["conclusion"] == "success", "TEST_WORKER_RUN_UNVERIFIED")
    need(not artifact["expired"] and artifact["name"] == "jems-test-execution-"+str(run_id) and
         artifact["workflow_run"]["id"] == run_id and artifact["workflow_run"]["head_sha"] == worker["sourceSha"] and
         len(archive) == artifact["size_in_bytes"] <= 65536 and artifact["digest"] == "sha256:"+hashlib.sha256(archive).hexdigest(),
         "TEST_WORKER_ARTIFACT_UNVERIFIED")
    with zipfile.ZipFile(io.BytesIO(archive)) as z:
        rows=z.infolist()
        need(len(rows)==1 and rows[0].filename=="execution.json" and 0<rows[0].file_size<=32768, "TEST_WORKER_RECEIPT_MEMBER")
        data=z.read(rows[0])
    r=parse_json(data)
    expected={"schemaVersion":1,"environment":"test","jobId":job["jobId"],"runId":str(run_id),"runAttempt":1,
              "generationAttempt":job["dispatchAttempt"],"mode":"fixture","workerRepository":REPO,"workerRepositoryId":target["workerRepositoryId"],
              "workerSha":worker["sourceSha"],"workflowRef":REPO+"/"+WORKFLOW+"@refs/heads/main","sourceSha":target["source"],
              "sourceTree":tree,"sandboxImage":worker["sandboxImage"],"runscVersion":"runsc version "+worker["runtimeVersion"],
              "projectId":PROJECT,"projectNumber":target["projectNumber"],"provisioner":worker["serviceAccount"],
              "runnerName":"jems-test-jit-"+str(run_id),"vmServiceAccounts":[],"externalAddresses":[],"network":"jems-test-sandbox",
              "sandboxNetwork":"none","cleanup":{"instances":"VERIFIED","disks":"VERIFIED","runners":"VERIFIED"}}
    need(all(r[k]==v for k,v in expected.items()) and re.fullmatch(r"sha256:[a-f0-9]{64}",r["imageId"]) and
         r["signerSha"]==target["signerSha"] and r["sandboxSourceSha"]==target["sandboxSourceSha"], "TEST_WORKER_RUNTIME_MISMATCH")
    return {"runId":str(run_id),"artifactId":str(artifact["id"]),"archiveSha256":artifact["digest"][7:],
            "executionSha256":hashlib.sha256(data).hexdigest()}


def main():
    directory=Path(os.environ["RUNNER_TEMP"])
    proof=parse_json((directory/"test-browser.json").read_bytes())
    target=parse_json(os.environ["TEST_TARGET"])
    tree=subprocess.check_output(["git","rev-parse",target["source"]+"^{tree}"],text=True,timeout=10).strip()
    jobs=proof.pop("workerRuns")
    need(len(jobs)==2 and len({j["jobId"] for j in jobs})==2 and len({j["runId"] for j in jobs})==2,"TEST_DISTINCT_RUNS_REQUIRED")
    worker=proof["testWorker"]
    ref=parse_json(raw("git/ref/tags/"+worker["executionTag"]))
    need(ref["ref"]=="refs/tags/"+worker["executionTag"] and ref["object"]=={**ref["object"],"type":"commit","sha":worker["sourceSha"]}, "TEST_EXECUTION_TAG_UNVERIFIED")
    artifacts=[]
    for job in jobs:
        number=str(job["runId"])
        need(re.fullmatch(r"[1-9][0-9]{0,15}",number),"TEST_RUN_ID_REQUIRED")
        endpoint="actions/runs/"+number
        for _ in range(60):
            run=parse_json(raw(endpoint))
            if run["status"]=="completed":break
            time.sleep(5)
        rows=parse_json(raw(endpoint+"/artifacts?per_page=100&name=jems-test-execution-"+number))
        need(rows["total_count"]==len(rows["artifacts"])==1,"TEST_EXECUTION_RECEIPT_MISSING")
        a=rows["artifacts"][0]
        need(type(a["id"])==int and 0<a["size_in_bytes"]<=65536,"TEST_EXECUTION_SIZE")
        artifacts.append(verify(run,a,raw("actions/artifacts/"+str(a["id"])+"/zip"),job,proof["testWorker"],target,tree))
    proof["workerExecution"]=artifacts
    (directory/"receipt.json").write_bytes(canonical(proof))


if __name__=="__main__":
    try:main()
    except Exception:raise SystemExit("PRIVATE_TEST_EXECUTION_UNVERIFIED")
