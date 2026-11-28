"""Bind previously observed, byte-identical fixture behavior to the finalized two-lane manifest."""
import hashlib
import os
from pathlib import Path
import re
import zipfile

from ci_evidence import parse_json
from github import GitHub, PREFIX, REPOSITORY, REPOSITORY_ID
from release import canonical, REQUIRED_JOURNEYS
from test_target import need


def retained(prior,bound):
    need(prior.get("target")=="deployed-test-fixture-qualification" and prior.get("providerMode")=="fixture" and
         prior.get("journeys")==dict.fromkeys(REQUIRED_JOURNEYS,"success"),"TEST_FIXTURE_INCOMPLETE")
    need(all(prior[k]==bound[k] for k in ("sourceSha","testBackends","targetSha256","testWorker","observedConfigurationSha256","sandboxSignerSha","sandboxSourceSha","testWorkerRepositoryId")) and
         prior["frontendIdentity"]==bound["frontend"] and prior["testConfigurationSha256"]==bound["observedConfigurationSha256"],
         "TEST_FIXTURE_IDENTITY_CHANGED")
    need(len(prior["workerExecution"])==2 and len(prior["recovery"])==4,"TEST_FIXTURE_PROOF_MISSING")
    return {**prior,"testConfigurationSha256":bound["testConfigurationSha256"],"target":"deployed-test",
            "releaseIdentitySha256":bound["releaseIdentitySha256"]}


def main():
    directory=Path(os.environ["RUNNER_TEMP"])
    ident=os.environ["PRIOR_FIXTURE_RUN"]
    need(os.environ["FAMILY_OPERATION"]=="uat" and re.fullmatch(r"[1-9][0-9]{0,15}",ident),"TEST_FIXTURE_RUN_INVALID")
    bound=parse_json((directory/"test-bound.json").read_bytes())
    observed=parse_json((directory/"test-reuse-frontend.json").read_bytes())
    need(observed["sha256"]==bound["frontend"]["sha256"],"TEST_FRONTEND_CHANGED")
    api=GitHub()
    base=PREFIX+"/actions/runs/"+ident
    r=api.request(base)
    repo=r["repository"]
    need(r["id"]==int(ident) and repo["full_name"]==REPOSITORY and repo["id"]==REPOSITORY_ID and
         r["head_repository"]["id"]==REPOSITORY_ID and r["event"]=="workflow_dispatch" and r["head_branch"]=="main" and
         r["path"]==".github/workflows/jems-environments.yml" and r["head_sha"]==os.environ["GITHUB_SHA"]==bound["sourceSha"] and
         r["status"]=="completed" and r["conclusion"]=="success","TEST_FIXTURE_RUN_UNVERIFIED")
    attempt=r["run_attempt"]
    need(type(attempt)==int and attempt>0,"TEST_FIXTURE_ATTEMPT")
    jobs=api.pages(base+"/attempts/"+str(attempt)+"/jobs","jobs")
    for name in ("integrated-test-serving","integrated-test-uat","integrated-test-final-observation"):
        need([j.get("conclusion") for j in jobs if j.get("name")==name]==["success"],"TEST_FIXTURE_JOB_UNVERIFIED")
    name="integrated-test-fixture-"+ident+"-"+str(attempt)
    rows=[a for a in api.pages(base+"/artifacts","artifacts") if a["name"]==name]
    need(len(rows)==1,"TEST_FIXTURE_ARTIFACT_COUNT")
    a=rows[0]
    need(a.get("expired") is False and a["workflow_run"]["id"]==int(ident) and a["workflow_run"]["head_sha"]==bound["sourceSha"] and
         0<a["size_in_bytes"]<=131072,"TEST_FIXTURE_ARTIFACT_UNVERIFIED")
    archive=directory/"retained-test.zip"
    api.download(a["id"],archive)
    actual=hashlib.sha256(archive.read_bytes()).hexdigest()
    need(a["digest"]=="sha256:"+actual and archive.stat().st_size==a["size_in_bytes"],"TEST_FIXTURE_ARCHIVE_CHANGED")
    with zipfile.ZipFile(archive) as z:
        rows=z.infolist()
        need(len(rows)==1 and rows[0].filename=="receipt.json" and 0<rows[0].file_size<=131072,"TEST_FIXTURE_MEMBER")
        payload=z.read(rows[0])
    receipt=retained(parse_json(payload),bound)
    receipt["retainedFixture"]={"runId":ident,"attempt":attempt,"artifactId":str(a["id"]),"archiveSha256":actual,
                                "receiptSha256":hashlib.sha256(payload).hexdigest()}
    (directory/"receipt.json").write_bytes(canonical(receipt))


if __name__=="__main__":
    try:main()
    except Exception:raise SystemExit("PREVIOUS_TEST_FIXTURE_UNVERIFIED")
