#!/usr/bin/env python3
"""Owner-reviewed, inert-by-default deployment for dedicated private coach.

This tool NEVER reads or moves model keys, modifies the existing gateway,
sets coach approval flags to true, or runs paid inference.
Plan: python3 scripts/deployment/coach_private.py plan --region REGION --image DIGEST
Read-only: ... verify --region REGION --image DIGEST
Create an INACTIVE dedicated service only after owner review:
 ... deploy-inactive --region REGION --image DIGEST --owner-authorized-inactive

IAM/network and API ZDR requirements are independent; this tool is NOT a
live-chat activation script. The first Cloud Run service can stay at min 0.
"""
import argparse
import json
import re
import subprocess
import sys

PROJECT = "family-game-factory-jzw"
SERVICE = "factory-coach-private"
IDENTITY = f"factory-coach@{PROJECT}.iam.gserviceaccount.com"
GATEWAY_IDENTITY = f"factory-gateway@{PROJECT}.iam.gserviceaccount.com"
GATEWAY_SERVICE = "factory-gateway"
INACTIVE_ENV = "FACTORY_COACH_EXECUTION_ENV=dedicated-cloud-run,FACTORY_COACH_APPROVED=false"
REGION_RE = re.compile(r"[a-z]+-[a-z]+[0-9]")
DIGEST_RE = re.compile(r"sha256:[a-f0-9]{64}")


class GateError(RuntimeError):
    pass


def reviewed_image(region: str, image: str) -> str:
    if not REGION_RE.fullmatch(region or ""):
        raise GateError("A reviewed, exact GCP region is required.")
    prefix = f"{region}-docker.pkg.dev/{PROJECT}/factory-services/coach@"
    if not image.startswith(prefix) or not DIGEST_RE.fullmatch(image[len(prefix):]):
        raise GateError("Only a reviewed immutable coach image in the existing regional factory-services registry is accepted.")
    return image


def command_plan(region: str, image: str) -> dict:
    reviewed_image(region, image)
    scope = ["--project", PROJECT, "--region", region]
    return {
        "project": PROJECT,
        "region": region,
        "source": "exact reviewed source SHA required by separate build approval",
        "image": image,
        "service": SERVICE,
        "dedicatedServiceAccount": IDENTITY,
        "gatewayCallerServiceAccount": GATEWAY_IDENTITY,
        "plannedMutations": [
            ["gcloud", "iam", "service-accounts", "create", "factory-coach",
             "--project", PROJECT, "--display-name", "Private Jems conversational inference"],
            ["gcloud", "run", "deploy", SERVICE, *scope,
             "--image", image, "--service-account", IDENTITY,
             "--no-allow-unauthenticated", "--ingress", "internal",
             "--cpu", "1", "--memory", "512Mi", "--min-instances", "0",
             "--max-instances", "1", "--concurrency", "4", "--timeout", "45s",
             "--port", "8080", "--set-env-vars", INACTIVE_ENV,
             "--labels", "factory-component=private-coach"],
            ["gcloud", "run", "services", "add-iam-policy-binding", SERVICE,
             *scope, "--member", "serviceAccount:" + GATEWAY_IDENTITY,
             "--role", "roles/run.invoker"],
        ],
        "NOT_AUTHORIZED_BY_THIS_SCRIPT": [
            "model key creation, copying, access grants or Secret Manager mounts",
            "existing gateway redeployment, IAM changes or VPC egress changes",
            "paid OpenAI requests, user data processing or ZDR approval",
            "model activation, public/unauthenticated access or min instances above zero",
        ],
        "networkGate": "Gateway -> internal-only Cloud Run requires reviewed Direct VPC egress/connector plus routing and Private Google Access; the new service will not become reachable automatically.",
        "default": "dry-run only; no gcloud calls or cost",
    }


def cloud(*args: str) -> dict:
    cmd = ["gcloud", *args, "--project", PROJECT, "--format=json", "--quiet"]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=False, timeout=75)
    except (OSError, subprocess.TimeoutExpired) as err:
        raise GateError("Cannot verify required Google Cloud metadata; no mutation should occur.") from err
    if result.returncode:
        raise GateError("Google Cloud metadata/operation check did not succeed. Review owner-side CLI logs privately.")
    try:
        return json.loads(result.stdout or "null")
    except ValueError as err:
        raise GateError("Malformed Google Cloud metadata. Do not retry mutations blindly.") from err


def optional_cloud(*args: str) -> dict | None:
    # A failed read could be an IAM/network outage, NOT proof that a resource
    # does not exist. Use explicit existence inspection and fail closed.
    return cloud(*args)


def verify_gateway(region: str) -> None:
    gateway = cloud("run", "services", "describe", GATEWAY_SERVICE, "--region", region)
    actual = gateway.get("spec", {}).get("template", {}).get("spec", {}).get("serviceAccountName")
    if actual != GATEWAY_IDENTITY:
        raise GateError("Existing gateway identity differs from the reviewed service account. No changes allowed.")
    # Internal-only ingress requires explicit network work. No guess that being
    # in the same GCP project makes the gateway's request 'internal'.


def verify_inactive_service(region: str, image: str) -> dict:
    service = cloud("run", "services", "describe", SERVICE, "--region", region)
    service_url=service.get("status",{}).get("url","")
    if not isinstance(service_url,str) or not re.fullmatch(r"https://factory-coach-private-[a-z0-9.-]+\\.run\\.app",service_url):
        raise GateError("Private coach URL is not the reviewed canonical Cloud Run host; do not connect the gateway.")
    metadata = service.get("metadata", {})
    if metadata.get("labels", {}).get("factory-component") != "private-coach":
        raise GateError("Service is not owned by the reviewed private-coach deployment.")
    spec = service.get("spec", {}).get("template", {}).get("spec", {})
    if spec.get("serviceAccountName") != IDENTITY:
        raise GateError("Dedicated coach service identity mismatch.")
    container = (spec.get("containers") or [{}])[0]
    if container.get("image") != image:
        raise GateError("Running coach image differs from reviewed immutable digest.")
    env = {value.get("name"):value.get("value") for value in container.get("env", [])}
    if env != dict(item.split("=",1) for item in INACTIVE_ENV.split(",")):
        raise GateError("Coach is not demonstrably inactive or unexpected environment variables are set.")
    if spec.get("volumes") or any(item.get("valueFrom") for item in container.get("env", [])):
        raise GateError("Inactive coach service unexpectedly exposes secrets or volumes.")
    service_ingress = metadata.get("annotations", {}).get("run.googleapis.com/ingress")
    if service_ingress != "internal":
        raise GateError("Dedicated coach must have internal-only ingress.")
    if metadata.get("annotations", {}).get("run.googleapis.com/invoker-iam-disabled") == "true":
        raise GateError("Cloud Run invoker IAM enforcement must be enabled.")
    annotations=service.get("spec", {}).get("template", {}).get("metadata", {}).get("annotations", {})
    if annotations.get("autoscaling.knative.dev/minScale", "0") != "0" or annotations.get("autoscaling.knative.dev/maxScale") != "1":
        raise GateError("Inactive coach min/max instance policy differs from the approved plan.")
    policy = cloud("run", "services", "get-iam-policy", SERVICE, "--region", region)
    invokers = set()
    for item in policy.get("bindings", []):
        if item.get("role")=="roles/run.invoker":
            if item.get("condition"):
                raise GateError("Unexpected conditional invoker binding on coach service.")
            invokers.update(item.get("members") or [])
    if invokers != {"serviceAccount:" + GATEWAY_IDENTITY}:
        raise GateError("Coach invokers must include ONLY the exact existing gateway service account.")
    if not any(c.get("type")=="Ready" and c.get("status")=="True" for c in service.get("status", {}).get("conditions", [])):
        raise GateError("Inactive coach revision is not ready.")
    return {"reviewedImage": image, "inactive": True, "gatewayIdentityVerified": True,
            "coachPrivateOrigin":service_url,
            "ingress": "internal", "invokers": ["serviceAccount:" + GATEWAY_IDENTITY],
            "networkRouteVerified": False, "paidModelEnabled": False}


def execute_inactive(region: str, image: str) -> dict:
    # Read every existing identity before any cloud mutation. New resource
    # creation must never overwrite the original gateway, preview or worker.
    verify_gateway(region)
    # Require a fresh operator-approved coach identity already created by a
    # separate bounded owner step. Its permissions must be reviewed privately.
    account = cloud("iam", "service-accounts", "describe", IDENTITY)
    if account.get("disabled") or account.get("email")!=IDENTITY:
        raise GateError("Dedicated coach service identity is missing or disabled. No deployment attempted.")
    # A private inference service should have NO project-wide permissions:
    # the only future privilege is a scoped read on its own model-key secret.
    project_policy=cloud("projects","get-iam-policy",PROJECT)
    principal="serviceAccount:"+IDENTITY
    if any(principal in binding.get("members",[]) for binding in project_policy.get("bindings",[])):
        raise GateError("Coach identity has project-wide grants; remove/review them before deploying.")
    # Inherited organization/group permissions are NOT established by this
    # check; the owner must review those independently before activation.
    # This command is permitted ONLY for a new, inactive service. It refuses
    # to replace an existing service, even if the prior request timed out.
    services = cloud("run", "services", "list", "--region", region)
    if not isinstance(services, list):
        raise GateError("Cannot inspect existing Cloud Run services.")
    if any(item.get("metadata",{}).get("name")==SERVICE for item in services):
        raise GateError("Coach service exists. Refuse implicit replacement; run read-only verify.")
    args=command_plan(region,image)["plannedMutations"][1]
    cloud(*args[1:])
    cloud("run", "services", "add-iam-policy-binding", SERVICE,
          "--region", region, "--member", "serviceAccount:"+GATEWAY_IDENTITY,
          "--role", "roles/run.invoker")
    return verify_inactive_service(region,image)


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=["plan","verify","deploy-inactive"], default="plan")
    parser.add_argument("--region", required=True)
    parser.add_argument("--image", required=True)
    parser.add_argument("--owner-authorized-inactive", action="store_true")
    args=parser.parse_args(argv)
    reviewed_image(args.region,args.image)
    if args.operation=="plan":
        if args.owner_authorized_inactive:
            raise GateError("Plan does not accept mutation approval.")
        print(json.dumps(command_plan(args.region,args.image),indent=2))
        return
    if args.operation=="verify":
        if args.owner_authorized_inactive:
            raise GateError("Verify does not mutate cloud state.")
        verify_gateway(args.region)
        print(json.dumps(verify_inactive_service(args.region,args.image),indent=2))
        return
    if not args.owner_authorized_inactive:
        raise GateError("Inactive creation requires explicit --owner-authorized-inactive after review of the cloud plan, image, service identity and route.")
    print(json.dumps(execute_inactive(args.region,args.image),indent=2))


if __name__=="__main__":
    try:
        main()
    except GateError as error:
        print(str(error),file=sys.stderr)
        sys.exit(1)
    except Exception:
        print("Coach deployment stopped; sensitive cloud diagnostics suppressed.",file=sys.stderr)
        sys.exit(1)
