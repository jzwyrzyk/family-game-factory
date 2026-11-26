mock_provider "google" {
  override_during = plan
  mock_data "google_project" {
    defaults = { number = "123456789876" }
  }
  mock_data "google_dns_managed_zone" {
    defaults = { dns_name = "test.example.net.", visibility = "public", name = "test-zone" }
  }
  mock_resource "google_compute_backend_service" {
    defaults = { generated_id = "123456" }
  }
  mock_resource "google_certificate_manager_dns_authorization" {
    defaults = { dns_resource_record = [{ name = "_acme-challenge.host.test.example.net.", type = "CNAME", data = "challenge.invalid." }] }
  }
}

variables {
  project_number   = "123456789876"
  iap_oauth_secret = "offline-test-oauth-secret"
  edge = {
    dns_zone         = "test-zone"
    hub              = "hub.test.example.net"
    household        = "house.test.example.net"
    preview          = "play.test.example.net"
    oauth_client_id  = "123456789-test.apps.googleusercontent.com"
    oauth_version    = 1
    management_users = ["user:operator@example.invalid"]
    household_users  = ["user:adult@example.invalid"]
  }
  worker = {
    repository     = "family-game-factory-lab/family-game-factory-worker-test"
    repository_id  = "12345"
    owner_id       = "67890"
    source_sha     = "1123456789abcdef0123456789abcdef01234567"
    sandbox_source = "b1169673050a8be83ed5ba69a27b04c23a87903f"
    sandbox_image  = "ghcr.io/jzwyrzyk/family-game-factory-sandbox@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  }
  release = {
    images = {
      gateway = "us-east5-docker.pkg.dev/jems-jzw-nonprod/jems-test-services/gateway@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      preview = "us-east5-docker.pkg.dev/jems-jzw-nonprod/jems-test-services/preview@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      coach   = "us-east5-docker.pkg.dev/jems-jzw-nonprod/jems-test-services/coach@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    }
    versions = { gateway = "2", preview = "3", household = "4" }
  }
}

run "off_by_default" {
  command = plan
  assert {
    condition     = length(google_project_service.test) == 0 && length(google_cloud_run_v2_service.family) == 0 && length(google_project_iam_member.worker_create) == 0 && length(google_compute_global_forwarding_rule.https) == 0
    error_message = "Default configuration must have zero side effects."
  }
}

run "closed_foundation" {
  command = plan
  variables { stage = "foundation" }
  assert {
    condition     = length(google_compute_backend_service.family) == 6 && alltrue([for b in google_compute_backend_service.family : length(b.backend) == 0]) && length(google_compute_global_forwarding_rule.https) == 0 && length(google_cloud_run_v2_service.family) == 0 && google_iam_workload_identity_pool_provider.worker[0].disabled
    error_message = "Create backend IDs for later IAP settings without a reachable service or active worker trust."
  }
}
run "isolated_services" {
  command = plan
  variables { stage = "services" }
  assert {
    condition     = length(google_cloud_run_v2_service.family) == 3 && !google_cloud_run_v2_service.coach[0].invoker_iam_disabled && alltrue([for s in google_cloud_run_v2_service.family : s.default_uri_disabled && s.ingress == "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"]) && length(google_compute_global_forwarding_rule.https) == 0
    error_message = "Require independent family services and IAM-authenticated coach before routing."
  }
  assert {
    condition     = google_storage_bucket.artifacts[0].public_access_prevention == "enforced" && google_storage_bucket.artifacts[0].versioning[0].enabled && google_firestore_database.test[0].delete_protection_state == "DELETE_PROTECTION_ENABLED" && length(google_storage_bucket_iam_member.write_artifacts) == 2 && !contains(keys(google_storage_bucket_iam_member.write_artifacts), "preview")
    error_message = "Originals and the financial database require private storage, read-only preview and recovery protection."
  }
}
run "protected_edge" {
  command = plan
  variables { stage = "edge" }
  assert {
    condition     = length(google_certificate_manager_dns_authorization.host) == 3 && length(google_certificate_manager_certificate_map_entry.hosts) == 4 && google_compute_global_forwarding_rule.https[0].port_range == "443" && google_compute_backend_service.family["management"].iap[0].enabled && google_compute_backend_service.family["household"].iap[0].enabled && length(google_compute_backend_service.family["deny"].backend) == 0
    error_message = "Require wildcard and all independent host certificates, IAP split and empty unknown-host route."
  }
  assert {
    condition     = google_compute_router_nat.worker[0].source_subnetwork_ip_ranges_to_nat == "LIST_OF_SUBNETWORKS" && google_iam_workload_identity_pool.worker[0].disabled && google_iam_workload_identity_pool_provider.worker[0].disabled && !contains(google_project_iam_custom_role.worker_subnet[0].permissions, "compute.subnetworks.useExternalIp") && !contains(google_project_iam_custom_role.worker_manage[0].permissions, "iam.serviceAccounts.actAs")
    error_message = "Reject credential-bearing or externally addressed JIT machines and premature federation."
  }
}
run "separate_worker_activation" {
  command = plan
  variables {
    stage                    = "edge"
    enable_worker_federation = true
  }
  assert {
    condition     = !google_iam_workload_identity_pool_provider.worker[0].disabled && strcontains(google_iam_workload_identity_pool_provider.worker[0].attribute_condition, "assertion.run_attempt=='1'") && strcontains(google_iam_workload_identity_pool_provider.worker[0].attribute_condition, var.worker.source_sha)
    error_message = "Worker trust must bind exact protected private execution."
  }
}
run "reject_wrong_project_number" {
  command = plan
  variables {
    stage          = "foundation"
    project_number = "333456789876"
  }
  expect_failures = [terraform_data.contract]
}
run "reject_premature_federation" {
  command = plan
  variables {
    stage                    = "services"
    enable_worker_federation = true
  }
  expect_failures = [terraform_data.contract]
}
run "reject_nested_origins" {
  command = plan
  variables {
    stage = "foundation"
    edge  = merge(var.edge, { preview = "play.hub.test.example.net" })
  }
  expect_failures = [var.edge]
}
run "reject_production_worker" {
  command = plan
  variables {
    stage  = "foundation"
    worker = merge(var.worker, { repository = "family-game-factory-lab/family-game-factory-worker", repository_id = "1458899834" })
  }
  expect_failures = [var.worker]
}
run "reject_mutable_sandbox" {
  command = plan
  variables {
    stage  = "foundation"
    worker = merge(var.worker, { sandbox_image = "ghcr.io/example/image:latest" })
  }
  expect_failures = [var.worker]
}
run "reject_mutable_service" {
  command = plan
  variables {
    stage   = "services"
    release = merge(var.release, { images = merge(var.release.images, { coach = "us-east5-docker.pkg.dev/jems-jzw-nonprod/jems-test-services/coach:latest" }) })
  }
  expect_failures = [var.release]
}


run "funded_plan_requires_explicit_approval" {
  command = plan
  variables {
    stage                    = "edge"
    enable_worker_federation = true
    funded_trial = {
      authorization_sha256 = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      expires_at           = timeadd(timestamp(), "2h")
      coach_key_version    = "15"
      coach_model          = "synthetic-test-model"
      coach_max_micro_usd  = 10000
      coach_input_price    = 1000
      coach_output_price   = 2000
      prices_reviewed_at   = timeadd(timestamp(), "-2h")
    }
  }
  assert {
    condition = (
      length(google_cloud_run_v2_service_iam_member.funded_household_coach) == 1 &&
      google_secret_manager_secret_iam_member.funded_coach_key[0].condition[0].title == "ExactTrialVersionBeforeExpiry" &&
      alltrue([for role in ["gateway", "preview"] : !contains([for entry in google_cloud_run_v2_service.family[role].template[0].containers[0].env : entry.name], "JEMS_TEST_FUNDED_HOUSEHOLD")]) &&
      contains([for entry in google_cloud_run_v2_service.family["household"].template[0].containers[0].env : entry.name], "JEMS_TEST_FUNDED_HOUSEHOLD") &&
      contains([for entry in google_cloud_run_v2_service.coach[0].template[0].containers[0].env : entry.name], "FACTORY_COACH_PRIVATE_OPENAI_API_KEY")
    )
    error_message = "Only the funded household may invoke paid TEST Coach and only Coach may read the exact expiring secret grant."
  }
}
run "reject_expired_funding" {
  command = plan
  variables {
    stage                    = "edge"
    enable_worker_federation = true
    funded_trial = {
      authorization_sha256 = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      expires_at           = "2024-01-01T00:00:00Z"
      coach_key_version    = "15"
      coach_model          = "synthetic-test-model"
      coach_max_micro_usd  = 10000
      coach_input_price    = 1000
      coach_output_price   = 2000
      prices_reviewed_at   = "2024-01-01T00:00:00Z"
    }
  }
  expect_failures = [terraform_data.contract]
}

# Exercise Google's real plan-time validators and defaults. The two data reads
# receive local fixtures. No provider account or external endpoint is needed.
provider "google" {
  alias        = "offline_schema"
  project      = "jems-jzw-nonprod"
  region       = "us-east5"
  access_token = "offline-fixture-without-cloud-authority"
}
run "actual_provider_edge_plan" {
  command   = plan
  providers = { google = google.offline_schema }
  variables { stage = "edge" }
  override_data {
    target = data.google_project.target
    values = { number = "123456789876" }
  }
  override_data {
    target = data.google_dns_managed_zone.test
    values = { name = "test-zone", dns_name = "test.example.net.", visibility = "public" }
  }
  assert {
    condition     = length(google_compute_backend_service.family) == 6 && google_cloud_run_v2_service.family["gateway"].invoker_iam_disabled && google_cloud_run_v2_service.family["gateway"].default_uri_disabled && !google_cloud_run_v2_service.coach[0].invoker_iam_disabled
    error_message = "Provider-planned service and edge boundaries must match the protected controller."
  }
}

run "reject_wrong_existing_dns_zone" {
  command = plan
  variables { stage = "foundation" }
  override_data {
    target = data.google_dns_managed_zone.test
    values = { name = "test-zone", dns_name = "unrelated.example.net.", visibility = "public" }
  }
  expect_failures = [data.google_dns_managed_zone.test]
}
