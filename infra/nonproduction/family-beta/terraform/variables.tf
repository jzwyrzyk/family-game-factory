terraform {
  required_version = "~> 1.13.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "= 7.46.2"
    }
  }
}

# This directory has its own private state. The recovered static resources stay
# with their original owner. An empty/default invocation has no resources.
variable "stage" {
  type    = string
  default = "off"
  validation {
    condition     = contains(["off", "foundation", "services", "edge"], var.stage)
    error_message = "Select off, foundation, services or edge."
  }
}

variable "project_number" {
  type     = string
  default  = null
  nullable = true
  validation {
    condition     = var.project_number == null ? true : can(regex("^[1-9][0-9]{5,15}$", var.project_number)) && var.project_number != "1054529152893"
    error_message = "Supply the recovered nonproduction project number."
  }
}

variable "edge" {
  description = "Approved private deployment metadata. The Cloud DNS zone must be a delegated TEST zone in jems-jzw-nonprod."
  type = object({
    dns_zone         = string
    hub              = string
    household        = string
    preview          = string
    oauth_client_id  = string
    oauth_version    = number
    management_users = set(string)
    household_users  = set(string)
  })
  default = null
  validation {
    condition = var.edge == null ? true : (
      can(regex("^[0-9]+-[a-z0-9]+\\.apps\\.googleusercontent\\.com$", var.edge.oauth_client_id)) &&
      var.edge.oauth_version >= 1 && floor(var.edge.oauth_version) == var.edge.oauth_version &&
      length(distinct([var.edge.hub, var.edge.household, var.edge.preview])) == 3 &&
      alltrue([for h in [var.edge.hub, var.edge.household, var.edge.preview] : can(regex("^([a-z0-9]+(-[a-z0-9]+)*\\.)+[a-z]{2,}$", h)) && !startswith(h, "f-")]) &&
      alltrue(flatten([for a in [var.edge.hub, var.edge.household, var.edge.preview] : [for b in [var.edge.hub, var.edge.household, var.edge.preview] : !endswith(a, ".${b}")]])) &&
      length(var.edge.household_users) > 0 && length(var.edge.management_users) > 0 &&
      alltrue([for m in setunion(var.edge.management_users, var.edge.household_users) : can(regex("^user:[^@ *]+@[^@ *]+\\.[^@ *]+$", m))])
    )
    error_message = "Require distinct independent hosts, exact private user allowlists and a reviewed OAuth client."
  }
}

variable "iap_oauth_secret" {
  description = "Ephemeral client secret from private administrator input. The provider write-only field omits it from plan and state."
  type        = string
  sensitive   = true
  ephemeral   = true
  default     = null
  validation {
    condition     = var.iap_oauth_secret == null ? var.stage == "off" : length(var.iap_oauth_secret) >= 12
    error_message = "Supply the reviewed OAuth secret in the private session for every enabled plan or apply."
  }
}

variable "release" {
  description = "Existing exact nonproduction registry digests and numeric per-service secret versions."
  type = object({
    images   = map(string)
    versions = map(string)
  })
  default = null
  validation {
    condition = var.release == null ? true : (
      toset(keys(var.release.images)) == toset(["gateway", "preview", "coach"]) &&
      length(distinct(values(var.release.images))) == 3 &&
      alltrue([for k, image in var.release.images : can(regex("^us-east5-docker\\.pkg\\.dev/jems-jzw-nonprod/jems-test-services/${k}@sha256:[a-f0-9]{64}$", image))]) &&
      toset(keys(var.release.versions)) == toset(["gateway", "household", "preview"]) &&
      alltrue([for version in values(var.release.versions) : can(regex("^[1-9][0-9]*$", version))])
    )
    error_message = "Require all three reviewed digest-only images and distinct per-service numeric secret selectors."
  }
}

variable "worker" {
  description = "Recorded private TEST repository identity, reviewed source and signed public sandbox digest."
  type = object({
    repository     = string
    repository_id  = string
    owner_id       = string
    source_sha     = string
    sandbox_image  = string
    sandbox_source = string
  })
  default = null
  validation {
    condition = var.worker == null ? true : (
      var.worker.repository == "family-game-factory-lab/family-game-factory-worker-test" &&
      can(regex("^[1-9][0-9]+$", var.worker.repository_id)) && !contains(["1458899834", "1458033181"], var.worker.repository_id) &&
      can(regex("^[1-9][0-9]+$", var.worker.owner_id)) &&
      can(regex("^[0-9a-f]{40}$", var.worker.source_sha)) && can(regex("^[0-9a-f]{40}$", var.worker.sandbox_source)) &&
      can(regex("^ghcr\\.io/jzwyrzyk/family-game-factory-sandbox@sha256:[a-f0-9]{64}$", var.worker.sandbox_image))
    )
    error_message = "Require a distinct private TEST repo and immutable image and source pins."
  }
}

variable "enable_worker_federation" {
  description = "Separate activation after sandbox signer, exact worker/repository identities and restricted runner group are verified."
  type        = bool
  default     = false
}

locals {
  project   = "jems-jzw-nonprod"
  region    = "us-east5"
  on        = var.stage != "off"
  services  = contains(["services", "edge"], var.stage)
  route     = var.stage == "edge"
  roles     = toset(["gateway", "preview", "household", "coach"])
  family    = toset(["gateway", "preview", "household"])
  backends  = toset(["deny", "gateway", "management", "preview", "household", "machine"])
  guarded   = toset(["management", "household"])
  bindings  = { gateway = "gateway", management = "gateway", preview = "preview", household = "household", machine = "household" }
  deployer  = "serviceAccount:jems-nonprod-deploy@${local.project}.iam.gserviceaccount.com"
  uat       = "serviceAccount:jems-nonprod-uat@${local.project}.iam.gserviceaccount.com"
  coach_uri = "https://jems-test-coach-${coalesce(var.project_number, "0")}.${local.region}.run.app"
}

provider "google" {
  project = local.project
  region  = local.region
}

data "google_project" "target" {
  count      = local.on ? 1 : 0
  project_id = local.project
}

resource "terraform_data" "contract" {
  count = local.on ? 1 : 0
  lifecycle {
    precondition {
      condition     = var.project_number != null && tostring(data.google_project.target[0].number) == var.project_number && var.edge != null && var.worker != null
      error_message = "The protected nonproduction project, reviewed TEST host policy and private worker binding must match."
    }
    precondition {
      condition     = !local.services || var.release != null
      error_message = "Service startup requires reviewed artifacts and numeric private configuration versions."
    }
    precondition {
      condition     = var.funded_trial == null ? true : local.route && var.enable_worker_federation && timecmp(var.funded_trial.expires_at, plantimestamp()) > 0 && timecmp(var.funded_trial.prices_reviewed_at, plantimestamp()) <= 0 && timecmp(timeadd(var.funded_trial.prices_reviewed_at, "744h"), plantimestamp()) > 0
      error_message = "A funded trial requires edge, verified TEST worker trust, current pricing and unexpired approval."
    }
    precondition {
      condition     = !var.enable_worker_federation || local.route
      error_message = "Worker trust requires the edge-stage TEST stack and distinct verified worker evidence."
    }
  }
}
