import copy
import hashlib
import io
import json
from pathlib import Path
import sys
import unittest
import zipfile

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"/"environments"))
import test_target as target
import test_worker_evidence as workers


class TestIntegratedUat(unittest.TestCase):
    def setUp(self):
        self.source="a"*40
        self.c={"source":self.source,"project":target.PROJECT,"region":target.REGION,"projectNumber":"123456789",
                "hub":"family.test.example","preview":"games.test.example","household":"adult.test.example",
                "oauthClient":"1234-test.apps.googleusercontent.com","familyId":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","profile":"dddddddd-dddd-4ddd-8ddd-dddddddddddd",
                "services":{k:"jems-test-"+k for k in target.ROLES},"workerRepositoryId":"12345678",
                "signerSha":"b"*40,"sandboxSourceSha":"d"*40}
        self.c["images"]={k:target.REGION+"-docker.pkg.dev/"+target.PROJECT+"/test/"+("gateway" if k=="household" else k)+"@sha256:"+"e"*64 for k in target.ROLES}

    def test_private_application_build_includes_the_same_typescript_settings_as_the_checkout(self):
        root=Path(__file__).resolve().parents[1]
        recipe=(root/"infra/nonproduction/family-beta/Dockerfile").read_text().split("RUN node scripts/beta/build.mjs")[0]
        imports=[line.split()[1:-1] for line in recipe.splitlines() if line.startswith("COPY ")]
        self.assertTrue(any("tsconfig.json" in group for group in imports))
        self.assertIn("!tsconfig.json",(root/"infra/nonproduction/family-beta/Dockerfile.dockerignore").read_text().splitlines())

    def fake(self,kind,name):
        if kind=="services":
            return {"metadata":{},"status":{"traffic":[{"percent":100,"revisionName":name+"-serving"},{"percent":0,"revisionName":name+"-idle"}]}}
        service=name.removesuffix("-serving")
        image=self.c["images"][service.removeprefix("jems-test-")]
        return {"metadata":{"name":name,"labels":{"serving.knative.dev/service":service},"namespace":self.c["projectNumber"]},
                "spec":{"containers":[{"image":image}]},"status":{"conditions":[{"type":"Ready","status":"True"}],"imageDigest":image}}

    def test_only_actual_serving_revisions_qualify(self):
        target.checked_target(self.c,self.source)
        result=target.serving(self.c,self.fake)
        self.assertEqual(set(result["testBackends"]),{"gateway","coach","preview"})
        for change in ("split","image","unready","foreign","wrong-source","rotation"):
            with self.subTest(change=change),self.assertRaises(ValueError):
                if change in ("wrong-source","rotation"):
                    modified=copy.deepcopy(self.c)
                    if change=="rotation":modified["workerRepositoryId"]="1458899834"
                    target.checked_target(modified,"b"*40 if change=="wrong-source" else self.source)
                else:
                    def describe(kind,name):
                        row=self.fake(kind,name)
                        if kind=="services" and change=="split":row["status"]["traffic"][0]["percent"]=50
                        if kind=="revisions":
                            if change=="image":row["status"]["imageDigest"]=row["status"]["imageDigest"][:-1]+"1"
                            if change=="unready":row["status"]["conditions"]=[]
                            if change=="foreign":row["metadata"]["namespace"]="999999"
                        return row
                    target.serving(self.c,describe)

    def test_private_artifact_bound_to_run_project_worker_execution_and_cleanup(self):
        repo={"full_name":workers.REPO,"id":int(self.c["workerRepositoryId"]),"private":True}
        worker={"repository":workers.REPO,"sourceSha":"d"*40,"serviceAccount":"worker@jems-jzw-nonprod.iam.gserviceaccount.com","runtimeVersion":"release-1","sandboxImage":"ghcr.io/sample/sandbox@sha256:"+"a"*64}
        run={"id":17,"run_attempt":1,"repository":repo,"head_repository":repo,"path":workers.WORKFLOW,"head_sha":worker["sourceSha"],"head_branch":"main",
             "event":"workflow_dispatch","status":"completed","conclusion":"success"}
        job={"runId":"17","jobId":"test-job","dispatchAttempt":0}
        proof={"schemaVersion":1,"environment":"test","workerRepository":workers.REPO,"workerRepositoryId":self.c["workerRepositoryId"],"workerSha":worker["sourceSha"],
               "workflowRef":workers.REPO+"/"+workers.WORKFLOW+"@refs/heads/main","runId":"17","runAttempt":1,"jobId":"test-job","generationAttempt":0,
               "mode":"fixture","sourceSha":self.source,"sourceTree":"e"*40,"sandboxImage":worker["sandboxImage"],"sandboxSourceSha":self.c["sandboxSourceSha"],
               "signerSha":self.c["signerSha"],"imageId":"sha256:"+"3"*64,"runscVersion":"runsc version release-1","projectId":target.PROJECT,"projectNumber":self.c["projectNumber"],
               "provisioner":worker["serviceAccount"],"runnerName":"jems-test-jit-17","network":"jems-test-sandbox","sandboxNetwork":"none",
               "vmServiceAccounts":[],"externalAddresses":[],"cleanup":{k:"VERIFIED" for k in ("instances","disks","runners")}}
        for change in (None,"failed","tampered","wrong-commit","wrong-sandbox","wrong-job","vm-privilege","cleanup-missing","wrong-provider","wrong-run"):
            with self.subTest(change=change):
                r=copy.deepcopy(proof);metadata=copy.deepcopy(run)
                if change=="failed":metadata["conclusion"]="failure"
                if change=="wrong-commit":metadata["head_sha"]="b"*40
                if change=="wrong-sandbox":r["sandboxImage"]+="1"
                if change=="wrong-job":r["jobId"]="other"
                if change=="vm-privilege":r["vmServiceAccounts"]=["unexpected"]
                if change=="cleanup-missing":r["cleanup"]["runners"]="PENDING"
                if change=="wrong-provider":r["mode"]="funded"
                buf=io.BytesIO()
                with zipfile.ZipFile(buf,"w") as z:z.writestr("execution.json",json.dumps(r))
                data=buf.getvalue()
                a={"name":"jems-test-execution-17","expired":False,"digest":"sha256:"+hashlib.sha256(data).hexdigest(),
                   "size_in_bytes":len(data),"workflow_run":{"id":18 if change=="wrong-run" else 17,"head_sha":worker["sourceSha"]},"id":48}
                if change=="tampered":data+=b"tamper"
                if change:
                    with self.assertRaises(ValueError):workers.verify(metadata,a,data,job,worker,self.c,"e"*40)
                else:self.assertEqual(workers.verify(metadata,a,data,job,worker,self.c,"e"*40)["artifactId"],"48")

class TestFixtureReuse(unittest.TestCase):
    def test_provisional_real_receipt_requires_identical_lanes_and_complete_journeys(self):
        from test_fixture_reuse import retained
        from release import REQUIRED_JOURNEYS
        known={"sourceSha":"a"*40,"testBackends":{"coach":"image"},"targetSha256":"1"*64,"testWorker":{"sourceSha":"b"*40},
               "observedConfigurationSha256":"2"*64,"sandboxSignerSha":"c"*40,"sandboxSourceSha":"d"*40,"testWorkerRepositoryId":"12345678"}
        prior={**known,"target":"deployed-test-fixture-qualification","providerMode":"fixture","journeys":dict.fromkeys(REQUIRED_JOURNEYS,"success"),
               "frontendIdentity":{"artifactId":"123","sha256":"9"*64},"testConfigurationSha256":"2"*64,"workerExecution":[{},{}],"recovery":dict.fromkeys(range(4),True)}
        bound={**known,"frontend":prior["frontendIdentity"],"testConfigurationSha256":"8"*64,"releaseIdentitySha256":"7"*64}
        self.assertEqual(retained(prior,bound)["target"],"deployed-test")
        for key in known:
            with self.subTest(key=key),self.assertRaises(ValueError):retained({**prior,key:"changed"},bound)
        for removed in ("workerExecution","journeys","recovery"):
            with self.subTest(removed=removed),self.assertRaises(ValueError):retained({**prior,removed:{}},bound)
