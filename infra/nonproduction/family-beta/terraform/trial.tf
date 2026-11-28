# Paid TEST is a second, explicit and expiring release. Numeric secret version
# selects the private key. Terraform never takes key bytes as an input.
variable "funded_trial" {
  type = object({
    authorization_sha256 = string
    expires_at           = string
    coach_key_version    = string
    coach_model          = string
    coach_max_micro_usd  = number
    coach_input_price    = number
    coach_output_price   = number
    prices_reviewed_at   = string
  })
  default = null
  validation {
    condition = var.funded_trial == null ? true : (
      can(regex("^[0-9a-f]{64}$", var.funded_trial.authorization_sha256)) &&
      can(regex("^[1-9][0-9]*$", var.funded_trial.coach_key_version)) &&
      can(regex("^[a-zA-Z0-9._-]{1,100}$", var.funded_trial.coach_model)) &&
      can(regex("Z$", var.funded_trial.expires_at)) && can(timeadd(var.funded_trial.expires_at, "0h")) &&
      can(regex("Z$", var.funded_trial.prices_reviewed_at)) && can(timeadd(var.funded_trial.prices_reviewed_at, "0h")) &&
      alltrue([for n in [var.funded_trial.coach_max_micro_usd, var.funded_trial.coach_input_price, var.funded_trial.coach_output_price] : n > 0 && n <= 9007199254740991 && n == floor(n)]) &&
      var.funded_trial.coach_max_micro_usd <= 100000
    )
    error_message = "Require an exact signed spending-approval receipt hash, numeric secret version, UTC timestamps, reviewed rates and a Coach turn bound of at most 100000 micro-USD."
  }
}

locals {
  funded = var.funded_trial != null
  funded_env = !local.funded ? {} : {
    JEMS_TEST_FUNDED_HOUSEHOLD                  = "true"
    JEMS_TEST_TRIAL_EXPIRES_AT                  = var.funded_trial.expires_at
    JEMS_TEST_TRIAL_AUTHORIZATION_SHA256        = var.funded_trial.authorization_sha256
    FACTORY_ADULT_PILOT_MODE                    = "true"
    FACTORY_ADULT_PILOT_OWNER_APPROVED          = "true"
    FACTORY_ADULT_PILOT_PROFILE_ACCESS_VERIFIED = "true"
    FACTORY_COACH_APPROVED                      = "true"
    FACTORY_COACH_PRIVACY_APPROVED              = "true"
    FACTORY_COACH_SAFEGUARDS_APPROVED           = "true"
    FACTORY_COACH_PRIVATE_EXECUTION_APPROVED    = "true"
    FACTORY_COACH_MODEL                         = var.funded_trial.coach_model
    FACTORY_COACH_MAX_MICRO_USD                 = tostring(var.funded_trial.coach_max_micro_usd)
    FACTORY_COACH_INPUT_PRICE                   = tostring(var.funded_trial.coach_input_price)
    FACTORY_COACH_OUTPUT_PRICE                  = tostring(var.funded_trial.coach_output_price)
    FACTORY_COACH_PRICES_REVIEWED               = var.funded_trial.prices_reviewed_at
  }
}

resource "google_secret_manager_secret" "coach_key" {
  count     = local.on ? 1 : 0
  project   = local.project
  secret_id = "jems-test-coach-key"
  replication {
    auto {}
  }
  deletion_protection = true
  depends_on          = [google_project_service.test]
}

resource "google_secret_manager_secret_iam_member" "funded_coach_key" {
  count     = local.services && local.funded ? 1 : 0
  project   = local.project
  secret_id = google_secret_manager_secret.coach_key[0].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime["coach"].email}"
  condition {
    title      = "ExactTrialVersionBeforeExpiry"
    expression = "resource.name == 'projects/${var.project_number}/secrets/jems-test-coach-key/versions/${var.funded_trial.coach_key_version}' && request.time < timestamp('${var.funded_trial.expires_at}')"
  }
}

resource "google_cloud_run_v2_service_iam_member" "funded_household_coach" {
  count    = local.services && local.funded ? 1 : 0
  project  = local.project
  location = local.region
  name     = google_cloud_run_v2_service.coach[0].name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.runtime["household"].email}"
  condition {
    title      = "FundedTrialBeforeExpiry"
    expression = "request.time < timestamp('${var.funded_trial.expires_at}')"
  }
}
