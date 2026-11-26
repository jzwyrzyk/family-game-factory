terraform {
  required_version = ">= 1.6, < 2.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 6.40, < 8.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = ">= 6.40, < 8.0"
    }
  }
}

# Run only in a separately approved, existing nonproduction project. No default
# project, billing account, administrator credential, or production resource.
variable "project_id" {
  type = string
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.project_id)) && var.project_id != "family-game-factory-jzw"
    error_message = "Supply an approved dedicated nonproduction project."
  }
}

variable "region" {
  type    = string
  default = "us-east5"
}

variable "enable_federation" {
  type    = bool
  default = false
}

variable "billing_account" {
  type = string
  validation {
    condition     = can(regex("^[A-F0-9]{6}-[A-F0-9]{6}-[A-F0-9]{6}$", var.billing_account))
    error_message = "Supply the verified existing billing account ID."
  }
}

variable "enable_registry_cleanup" {
  type    = bool
  default = false
}

provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}

data "google_project" "nonproduction" {
  project_id = var.project_id
}

check "separate_project" {
  assert {
    condition     = tostring(data.google_project.nonproduction.number) != "1054529152893"
    error_message = "The production project number is forbidden."
  }
}

locals {
  marker     = "Jems DEV TEST static environments v1"
  repository = "jzwyrzyk/family-game-factory"
  owner_id   = "356692244"
  repo_id    = "1458033181"
  workflow   = "jzwyrzyk/family-game-factory/.github/workflows/jems-environments.yml@refs/heads/main"
  environments = {
    deploy = "jems-nonproduction"
    uat    = "jems-nonproduction-uat"
  }
  subjects = { for key, env in local.environments : key => "repo:jzwyrzyk@${local.owner_id}/family-game-factory@${local.repo_id}:environment:${env}" }
  APIs = toset([
    "run.googleapis.com", "artifactregistry.googleapis.com", "iam.googleapis.com",
    "iamcredentials.googleapis.com", "sts.googleapis.com", "iap.googleapis.com",
    "cloudresourcemanager.googleapis.com", "billingbudgets.googleapis.com"
  ])
}

resource "google_project_service" "api" {
  for_each           = local.APIs
  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

resource "google_service_account" "runtime" {
  account_id   = "jems-static-runtime"
  display_name = "Jems DEV static runtime: no application roles"
  description  = local.marker
  depends_on   = [google_project_service.api]
}

resource "google_service_account" "test_runtime" {
  account_id   = "jems-test-runtime"
  display_name = "Jems TEST static runtime: no application roles"
  description  = local.marker
  depends_on   = [google_project_service.api]
}

resource "google_service_account_iam_member" "test_runtime_act_as" {
  service_account_id = google_service_account.test_runtime.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.deploy.email}"
}

resource "google_service_account_iam_member" "test_runtime_inspect" {
  service_account_id = google_service_account.test_runtime.name
  role               = google_project_iam_custom_role.runtime_inspect.name
  member             = "serviceAccount:${google_service_account.deploy.email}"
}

resource "google_service_account" "deploy" {
  account_id   = "jems-nonprod-deploy"
  display_name = "Jems trusted nonproduction deployer"
  description  = local.marker
  depends_on   = [google_project_service.api]
}

resource "google_service_account" "uat" {
  account_id   = "jems-nonprod-uat"
  display_name = "Jems browser UAT: IAP access only"
  description  = local.marker
  depends_on   = [google_project_service.api]
}

# The runtime and UAT accounts have no project role. The controller grants UAT
# only per-service IAP accessor; it cannot assume the runtime/deployer account.
resource "google_service_account_iam_member" "runtime_act_as" {
  service_account_id = google_service_account.runtime.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.deploy.email}"
}

resource "google_artifact_registry_repository" "static" {
  location      = var.region
  repository_id = "jems-environments"
  description   = local.marker
  format        = "DOCKER"
  depends_on    = [google_project_service.api]

  # Runtime references always use immutable digests. Only obsolete CI versions
  # can expire; mutable keep-test-current/previous retention tags protect the
  # two recovery versions without changing either immutable artifact identity.
  cleanup_policy_dry_run = !var.enable_registry_cleanup
  cleanup_policies {
    id     = "delete-old-ci"
    action = "DELETE"
    condition {
      tag_state    = "TAGGED"
      tag_prefixes = ["ci-"]
      older_than   = "2592000s"
    }
  }
  cleanup_policies {
    id     = "keep-release-and-rollback"
    action = "KEEP"
    condition {
      tag_state    = "TAGGED"
      tag_prefixes = ["keep-"]
    }
  }
}

resource "google_artifact_registry_repository_iam_member" "publisher" {
  location   = var.region
  repository = google_artifact_registry_repository.static.name
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.deploy.email}"
}

resource "google_project_iam_custom_role" "deploy" {
  role_id     = "jemsStaticEnvironmentController"
  title       = "Jems static nonproduction controller"
  description = local.marker
  permissions = [
    "resourcemanager.projects.get", "resourcemanager.projects.getIamPolicy",
    "run.services.create", "run.services.get", "run.services.list", "run.services.update",
    "run.services.delete", "run.services.getIamPolicy", "run.services.setIamPolicy",
    "run.revisions.get", "run.operations.get", "iap.webServices.getIamPolicy",
    "iap.webServices.setIamPolicy", "serviceusage.services.use"
  ]
}

resource "google_project_iam_member" "deploy" {
  project = var.project_id
  role    = google_project_iam_custom_role.deploy.name
  member  = "serviceAccount:${google_service_account.deploy.email}"
}

# Read only the keyless runtime's identity/key metadata for deployment preflight.
resource "google_project_iam_custom_role" "runtime_inspect" {
  role_id     = "jemsStaticRuntimeInspector"
  title       = "Inspect Jems static runtime identity"
  permissions = ["iam.serviceAccounts.get", "iam.serviceAccountKeys.list"]
}

resource "google_service_account_iam_member" "runtime_inspect" {
  service_account_id = google_service_account.runtime.name
  role               = google_project_iam_custom_role.runtime_inspect.name
  member             = "serviceAccount:${google_service_account.deploy.email}"
}

resource "google_project_service_identity" "iap" {
  provider   = google-beta
  project    = var.project_id
  service    = "iap.googleapis.com"
  depends_on = [google_project_service.api]
}

resource "google_project_iam_member" "iap_agent" {
  project = var.project_id
  role    = "roles/iap.serviceAgent"
  member  = "serviceAccount:${google_project_service_identity.iap.email}"
}

resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "jems-nonproduction"
  display_name              = "Jems nonproduction controller"
  description               = local.marker
  disabled                  = !var.enable_federation
  depends_on                = [google_project_service.api]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-main"
  display_name                       = "Protected main environment controller"
  disabled                           = !var.enable_federation
  attribute_mapping = {
    "google.subject"        = "assertion.sub"
    "attribute.environment" = "assertion.environment"
  }
  attribute_condition = join(" && ", [
    "assertion.repository == '${local.repository}'",
    "assertion.repository_id == '${local.repo_id}'",
    "assertion.repository_owner_id == '${local.owner_id}'",
    "assertion.ref == 'refs/heads/main'",
    "assertion.workflow_ref == '${local.workflow}'",
    "assertion.runner_environment == 'github-hosted'",
    "assertion.event_name in ['workflow_run', 'workflow_dispatch', 'schedule']",
    "assertion.environment in ['jems-nonproduction', 'jems-nonproduction-uat']"
  ])
  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
    allowed_audiences = [
      "https://iam.googleapis.com/projects/${data.google_project.nonproduction.number}/locations/global/workloadIdentityPools/jems-nonproduction/providers/github-main"
    ]
  }
}

resource "google_service_account_iam_member" "deploy_federation" {
  service_account_id = google_service_account.deploy.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principal://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/subject/${local.subjects.deploy}"
}

resource "google_service_account_iam_member" "uat_federation" {
  service_account_id = google_service_account.uat.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principal://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/subject/${local.subjects.uat}"
}

output "configuration_identifiers" {
  value = {
    projectId                 = var.project_id
    projectNumber             = tostring(data.google_project.nonproduction.number)
    region                    = var.region
    registry                  = "${var.region}-docker.pkg.dev/${var.project_id}/jems-environments"
    runtimeServiceAccount     = google_service_account.runtime.email
    testRuntimeServiceAccount = google_service_account.test_runtime.email
    deployServiceAccount      = google_service_account.deploy.email
    uatServiceAccount         = google_service_account.uat.email
    wifProvider               = google_iam_workload_identity_pool_provider.github.name
  }
}

# Notification only: never disable billing or production as a budget response.
resource "google_billing_budget" "nonproduction" {
  billing_account = var.billing_account
  display_name    = "Jems nonproduction monthly USD 15"
  budget_filter {
    projects               = ["projects/${data.google_project.nonproduction.number}"]
    calendar_period        = "MONTH"
    credit_types_treatment = "INCLUDE_ALL_CREDITS"
  }
  amount {
    specified_amount {
      currency_code = "USD"
      units         = "15"
    }
  }
  threshold_rules {
    threshold_percent = 0.5
    spend_basis       = "CURRENT_SPEND"
  }
  threshold_rules {
    threshold_percent = 0.8
    spend_basis       = "CURRENT_SPEND"
  }
  threshold_rules {
    threshold_percent = 1.0
    spend_basis       = "FORECASTED_SPEND"
  }
  depends_on = [google_project_service.api]
}
