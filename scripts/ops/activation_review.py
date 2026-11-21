"""Describe withheld production privileges without applying or claiming them."""

from admin_api import Plan
import oidc_claims
import release


REGISTRY = f"projects/{release.PROJECT}/locations/us-east5/repositories/jems-release-images"
SERVICE_PERMISSIONS = ("run.services.get", "run.services.update", "run.revisions.get")
POLL_PERMISSIONS = ("run.operations.get",)
DOCS = {
    "cloud_run_deployment": "https://docs.cloud.google.com/run/docs/reference/iam/roles",
    "operation_resource": "https://docs.cloud.google.com/run/docs/reference/rest/v2/projects.locations.operations/get",
    "service_identity": "https://docs.cloud.google.com/run/docs/configuring/services/service-identity",
    "registry_scope": "https://docs.cloud.google.com/artifact-registry/docs/access-control",
    "federation": "https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines",
}


def review_plan(head, services):
    """The caller has read project/service metadata; other gates stay unverified.

    Permission rows are proposals, never Plan actions. In particular, neither an
    empty actions list nor a missing direct binding proves that inherited access
    is absent. This report cannot be submitted to an activation command.
    """
    publisher = f"jems-image-publisher@{release.PROJECT}.iam.gserviceaccount.com"
    rollout = f"jems-cloud-run-release@{release.PROJECT}.iam.gserviceaccount.com"
    lanes = {}
    for lane, email in (("publish", publisher), ("release", rollout)):
        environment, pool, workflow = oidc_claims.LANES[lane]
        claims = oidc_claims.expected_claims(lane)
        lanes[lane] = {
            "service_account": email,
            "provider": f"projects/{release.PROJECT_NUMBER}/locations/global/workloadIdentityPools/{pool}/providers/github-main",
            "workflow": workflow,
            "environment": environment,
            "federation_binding_proposal": {
                "role": "roles/iam.workloadIdentityUser",
                "resource": f"projects/{release.PROJECT}/serviceAccounts/{email}",
                "pool": f"projects/{release.PROJECT_NUMBER}/locations/global/workloadIdentityPools/{pool}",
                "subject": claims["sub"],
                "condition": "Preserve the exact reviewed issuer, audience, repository IDs, main ref, workflow and environment claims.",
            },
            "provider_enablement": "withheld_pending_actual_claim_proof_and_owner_approval",
        }
    proposed = [
        {"purpose": "Publish immutable service images", "member": f"serviceAccount:{publisher}",
         "resource": REGISTRY, "role": "roles/artifactregistry.writer"},
        {"purpose": "Read candidate images and verify their provenance", "member": f"serviceAccount:{rollout}",
         "resource": REGISTRY, "role": "roles/artifactregistry.reader"},
        {"purpose": "Poll Cloud Run update operations", "member": f"serviceAccount:{rollout}",
         "resource": f"projects/{release.PROJECT}", "custom_role_permissions": list(POLL_PERMISSIONS),
         "scope_note": "Separate project-level read-only role; operations are not service child resources. This exposes operation metadata across this project and needs explicit scope review."},
    ]
    enrollment = []
    for service in sorted(release.SERVICES):
        runtime = "factory-coach" if service == "factory-coach-private" else service
        resource = f"{release.LOCATION}/services/{service}"
        proposed.extend([
            {"purpose": f"Release only the enrolled {service} service", "member": f"serviceAccount:{rollout}",
             "resource": resource, "custom_role_permissions": list(SERVICE_PERMISSIONS),
             "scope_note": "IAM update permission is broader than image and traffic changes; the reviewed controller and protected source enforce those narrower operations."},
            {"purpose": f"Attach the existing {service} runtime identity when staging a revision",
             "member": f"serviceAccount:{rollout}",
             "resource": f"projects/{release.PROJECT}/serviceAccounts/{runtime}@{release.PROJECT}.iam.gserviceaccount.com",
             "role": "roles/iam.serviceAccountUser",
             "scope_note": "Separate approval required on this exact runtime account. No token-creator or project-wide actAs grant is proposed."},
        ])
        observed = services.get(service, {})
        enrollment.append({"service": service, "status": "not_enrolled",
                           "serving_configuration": "matches" if observed.get("configuration_matches") is True else "blocked_or_unverified",
                           "requirement": "Approve this service individually using a fresh baseline, immutable digest, configuration fingerprint and compatibility evidence."})
    gates = [
        {"gate": "production_resource_metadata", "status": "observed",
         "scope": "This call checked production project identity/APIs and read named serving revision metadata; it changed no account state."},
        {"gate": "current_reviewed_pr_source_and_checks", "status": "not_verified_by_this_report"},
        {"gate": "github_main_protections_and_exact_main_environments", "status": "not_verified_by_this_report"},
        {"gate": "immutable_registry_and_disabled_unbound_identity_preparation", "status": "not_verified_by_this_report"},
        {"gate": "effective_iam_including_inherited_grants_and_deny_policies", "status": "not_verified_by_this_report"},
        {"gate": "isolated_stage_canary_promote_rollback_receipt", "status": "not_verified_by_this_report"},
        {"gate": "scoped_logging_privacy_and_codex_egress_if_enrolled", "status": "not_verified_by_this_report"},
        {"gate": "reviewed_inert_merge_with_both_release_flags_unset", "status": "not_verified_by_this_report"},
        {"gate": "exact_protected_main_claims_only_runs_for_both_lanes", "status": "not_verified_by_this_report"},
        {"gate": "explicit_owner_approval_of_exact_activation_scope", "status": "required_not_inferred"},
    ]
    plan = Plan("production-activation-withheld", {
        "head": head, "project": release.PROJECT, "project_number": release.PROJECT_NUMBER,
        "activation_ready": False, "services": services, "gates": gates,
        "effective_access": "Unknown. Proposed or absent direct grants do not establish effective access or its absence.",
        "proposed_identity_lanes": lanes, "proposed_permission_scope": proposed,
        "service_enrollment": enrollment,
        "github_variables_after_approval": {
            "JEMS_PUBLISH_WIF_PROVIDER": lanes["publish"]["provider"],
            "JEMS_PUBLISH_SERVICE_ACCOUNT": publisher,
            "JEMS_RELEASE_WIF_PROVIDER": lanes["release"]["provider"],
            "JEMS_RELEASE_SERVICE_ACCOUNT": rollout,
        },
        "enable_flags": {"JEMS_IMAGE_PUBLISH_ENABLED": "keep_unset",
                         "JEMS_CLOUD_RUN_RELEASE_ENABLED": "keep_unset"},
        "permission_references": DOCS,
    })
    plan.notes.extend([
        "Review-only scope, with no executable actions and no production activation mode.",
        "A clean metadata read, empty action list or green fixture tests does not satisfy the unverified gates.",
        "The sole-maintainer ruleset has zero required human reviews. Owner authorization is required before a release-intent merge; this is not a separate enforced GitHub reviewer click.",
        "Do not add broad project deploy, IAM-admin, secret-access, worker, service-delete or provider-spending permissions.",
        "Re-read account state before preparing any future activation commands; use the approved exact source and retain both enable flags unset until that review.",
    ])
    return plan
