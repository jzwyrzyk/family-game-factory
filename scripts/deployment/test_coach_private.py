"""Offline/metadata-mock acceptance for private coach Cloud Run preparation."""
import argparse
import contextlib
import io
import json
import unittest
from unittest.mock import patch

import coach_private as coach
import build_coach as builder

REGION="us-central1"
DIGEST=f"{REGION}-docker.pkg.dev/{coach.PROJECT}/factory-services/coach@sha256:"+"a"*64
SOURCE="b"*40


def service():
    return {
        "metadata":{"name":coach.SERVICE,"labels":{"factory-component":"private-coach"},
                    "annotations":{"run.googleapis.com/ingress":"internal"}},
        "spec":{"template":{
            "metadata":{"annotations":{"autoscaling.knative.dev/minScale":"0",
                                       "autoscaling.knative.dev/maxScale":"1"}},
            "spec":{"serviceAccountName":coach.IDENTITY,
                    "containers":[{"image":DIGEST,"env":[
                        {"name":"FACTORY_COACH_EXECUTION_ENV","value":"dedicated-cloud-run"},
                        {"name":"FACTORY_COACH_APPROVED","value":"false"}]}]}}},
        "status":{"url":"https://factory-coach-private-demo-uc.a.run.app","conditions":[{"type":"Ready","status":"True"}]}
    }


def mock_metadata(*args):
    if args[:3]==("run","services","describe"):
        if args[3]==coach.GATEWAY_SERVICE:
            return {"spec":{"template":{"spec":{"serviceAccountName":coach.GATEWAY_IDENTITY}}}}
        return service()
    if args[:3]==("run","services","get-iam-policy"):
        return {"bindings":[{"role":"roles/run.invoker","members":[
            "serviceAccount:"+coach.GATEWAY_IDENTITY]}]}
    if args[:3]==("iam","service-accounts","describe"):
        return {"email":coach.IDENTITY,"disabled":False}
    if args[:2]==("projects","get-iam-policy"):
        return {"bindings":[]}
    if args[:3]==("run","services","list"):
        return []
    raise AssertionError("Unexpected command "+repr(args))


class CloudRunPrivateCoachPlan(unittest.TestCase):
    def test_digest_is_immutable_and_reviewed(self):
        self.assertEqual(coach.reviewed_image(REGION,DIGEST),DIGEST)
        for bad in [DIGEST.replace("@sha256:",":"),
                    DIGEST.replace("factory-services/coach","factory-services/gateway"),
                    DIGEST.replace("a"*64,"bad"),"https://example.com/coach"]:
            with self.assertRaises(coach.GateError):coach.reviewed_image(REGION,bad)
        with self.assertRaises(coach.GateError):coach.reviewed_image("region-unknown",DIGEST)

    def test_plan_does_not_touch_cloud_or_secrets(self):
        with patch.object(coach,"cloud",side_effect=AssertionError("unexpected cloud access")):
            plan=coach.command_plan(REGION,DIGEST)
        self.assertEqual(plan["service"],coach.SERVICE)
        cmds=json.dumps(plan["plannedMutations"])
        for required in ("--no-allow-unauthenticated","--ingress","internal",
                         "--min-instances","0","--max-instances","1",
                         "FACTORY_COACH_APPROVED=false"):
            self.assertIn(required,cmds)
        for forbidden in ("FACTORY_OPENAI_API_KEY","--update-secrets","--allow-unauthenticated",
                          "FACTORY_COACH_APPROVED=true","factory-preview"):
            self.assertNotIn(forbidden,cmds)

    def test_inactive_verification_requires_exact_gateway_and_only_invoker(self):
        with patch.object(coach,"cloud",side_effect=mock_metadata):
            coach.verify_gateway(REGION)
            outcome=coach.verify_inactive_service(REGION,DIGEST)
        self.assertTrue(outcome["inactive"])
        self.assertFalse(outcome["paidModelEnabled"])
        self.assertFalse(outcome["networkRouteVerified"])
        def public_policy(*args):
            if args[:3]==("run","services","get-iam-policy"):
                return {"bindings":[{"role":"roles/run.invoker","members":["allUsers"]}]}
            return mock_metadata(*args)
        with patch.object(coach,"cloud",side_effect=public_policy):
            with self.assertRaises(coach.GateError):coach.verify_inactive_service(REGION,DIGEST)
        def secret_mount(*args):
            if args[:3]==("run","services","describe") and args[3]==coach.SERVICE:
                v=service();v["spec"]["template"]["spec"]["volumes"]=[{"name":"secret"}]
                return v
            return mock_metadata(*args)
        with patch.object(coach,"cloud",side_effect=secret_mount):
            with self.assertRaises(coach.GateError):coach.verify_inactive_service(REGION,DIGEST)

    def test_existing_service_never_overwritten(self):
        operations=[]
        def inspect(*args):
            operations.append(args)
            if args[:3]==("run","services","list"):
                return [{"metadata":{"name":coach.SERVICE}}]
            return mock_metadata(*args)
        with patch.object(coach,"cloud",side_effect=inspect):
            with self.assertRaises(coach.GateError):coach.execute_inactive(REGION,DIGEST)
        self.assertFalse(any(args[:2]==("run","deploy") for args in operations))

    def test_overprivileged_coach_identity_refuses_first_deployment(self):
        operations=[]
        def broad_grant(*args):
            operations.append(args)
            if args[:2]==("projects","get-iam-policy"):
                return {"bindings":[{"role":"roles/editor","members":[
                    "serviceAccount:"+coach.IDENTITY]}]}
            return mock_metadata(*args)
        with patch.object(coach,"cloud",side_effect=broad_grant):
            with self.assertRaises(coach.GateError):
                coach.execute_inactive(REGION,DIGEST)
        self.assertFalse(any(args[:2]==("run","deploy") for args in operations))

    def test_read_only_verify_cannot_grant_permission(self):
        with patch.object(coach,"cloud",side_effect=AssertionError("do not execute")):
            with contextlib.redirect_stdout(io.StringIO()) as capture:
                coach.main(["plan","--region",REGION,"--image",DIGEST])
            self.assertIn('"mutations":',capture.getvalue()) if '"mutations":' in capture.getvalue() else self.assertIn('"plannedMutations":',capture.getvalue())
        with self.assertRaises(coach.GateError):
            coach.main(["deploy-inactive","--region",REGION,"--image",DIGEST])


class ReviewedCoachBuild(unittest.TestCase):
    def test_build_one_image_from_reviewed_sha(self):
        cfg=builder.config_for(REGION,SOURCE)
        self.assertEqual(len(cfg["images"]),1)
        self.assertEqual(len(cfg["steps"]),1)
        self.assertEqual(cfg["serviceAccount"].split("/")[-1],builder.BUILDER)
        self.assertIn("server/Dockerfile.coach",cfg["steps"][0]["args"])
        self.assertIn(SOURCE,cfg["images"][0])
        with self.assertRaises(RuntimeError):builder.config_for(REGION,"main")

    def test_verified_image_digest_exact(self):
        cfg=builder.config_for(REGION,SOURCE)
        result={"serviceAccount":cfg["serviceAccount"],"steps":cfg["steps"],
                "images":cfg["images"],"tags":cfg["tags"],"status":"SUCCESS",
                "results":{"images":[{"name":cfg["images"][0],"digest":"sha256:"+"a"*64}]}}
        with patch.object(builder,"cloud",return_value={"image_summary":{"digest":"sha256:"+"a"*64}}):
            self.assertEqual(builder.verify_build(result,cfg),DIGEST)
        with patch.object(builder,"cloud",side_effect=AssertionError("no cloud access")):
            with self.assertRaises(RuntimeError):builder.verify_build({**result,"steps":[]},cfg)


if __name__=="__main__":
    unittest.main()
