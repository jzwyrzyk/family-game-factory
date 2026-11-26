# The pre-existing controller recovery owns its API enablements, deployer, UAT,
# project and budget. This root owns only additional TEST resources.
resource "google_project_service" "test" {
  for_each           = local.on ? toset(["compute.googleapis.com", "firestore.googleapis.com", "storage.googleapis.com", "secretmanager.googleapis.com", "certificatemanager.googleapis.com", "dns.googleapis.com", "cloudbuild.googleapis.com"]) : toset([])
  project            = local.project
  service            = each.key
  disable_on_destroy = false
  depends_on         = [terraform_data.contract]
}

resource "google_service_account" "runtime" {
  for_each     = local.on ? local.roles : toset([])
  project      = local.project
  account_id   = "jems-test-${each.key}"
  display_name = "Jems isolated TEST ${each.key}"
  depends_on   = [terraform_data.contract]
}

resource "google_firestore_database" "test" {
  count   = local.on ? 1 : 0
  project = local.project
  name                              = "jems-test"
  location_id                       = local.region
  type                              = "FIRESTORE_NATIVE"
  concurrency_mode                  = "PESSIMISTIC"
  point_in_time_recovery_enablement = "POINT_IN_TIME_RECOVERY_ENABLED"
  delete_protection_state           = "DELETE_PROTECTION_ENABLED"
  deletion_policy                   = "PREVENT"
  depends_on                        = [google_project_service.test]
}

resource "google_project_iam_member" "database" {
  for_each = local.on ? local.family : toset([])
  project  = local.project
  role     = each.key == "preview" ? "roles/datastore.viewer" : "roles/datastore.user"
  member   = "serviceAccount:${google_service_account.runtime[each.key].email}"
  condition {
    title      = "OnlyJemsTestDatabase"
    expression = "resource.name == 'projects/${local.project}/databases/jems-test' || resource.name.startsWith('projects/${local.project}/databases/jems-test/')"
  }
  depends_on = [google_firestore_database.test]
}

resource "google_storage_bucket" "artifacts" {
  count                       = local.on ? 1 : 0
  project                     = local.project
  name                        = "${local.project}-jems-test-artifacts"
  location                    = upper(local.region)
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false
  deletion_policy             = "PREVENT"
  versioning { enabled = true }
  soft_delete_policy { retention_duration_seconds = 604800 }
  depends_on = [google_project_service.test]
}

resource "google_storage_bucket_iam_member" "read_artifacts" {
  for_each = local.on ? local.family : toset([])
  bucket   = google_storage_bucket.artifacts[0].name
  role     = "roles/storage.objectViewer"
  member   = "serviceAccount:${google_service_account.runtime[each.key].email}"
}

resource "google_storage_bucket_iam_member" "write_artifacts" {
  for_each = local.on ? toset(["gateway", "household"]) : toset([])
  bucket   = google_storage_bucket.artifacts[0].name
  role     = "roles/storage.objectCreator"
  member   = "serviceAccount:${google_service_account.runtime[each.key].email}"
}

resource "google_artifact_registry_repository" "services" {
  count         = local.on ? 1 : 0
  project       = local.project
  location      = local.region
  repository_id = "jems-test-services"
  format        = "DOCKER"
  description   = "Immutable service candidates and retained recovery images for isolated TEST"
  docker_config { immutable_tags = true }
  depends_on = [terraform_data.contract]
}

# Secret containers only. Operators supply private version contents directly
# to Secret Manager between the foundation and services plans.
resource "google_secret_manager_secret" "settings" {
  for_each  = local.on ? local.family : toset([])
  project   = local.project
  secret_id = "jems-test-${each.key}-settings"
  replication {
    auto {}
  }
  deletion_protection = true
  depends_on          = [google_project_service.test]
}

resource "google_secret_manager_secret_iam_member" "read_settings" {
  for_each  = google_secret_manager_secret.settings
  project   = local.project
  secret_id = each.value.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime[each.key].email}"
}

resource "google_cloud_run_v2_service" "family" {
  for_each             = local.services ? local.family : toset([])
  name                 = "jems-test-${each.key}"
  location             = local.region
  project              = local.project
  labels               = { "jems-environment" = "test" }
  ingress              = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"
  default_uri_disabled = true
  # The LB routes mix signed IAP user paths and application-authenticated
  # machine or preview paths. Closing run.app prevents bypass of that split.
  invoker_iam_disabled = true
  deletion_protection  = true
  template {
    service_account                  = google_service_account.runtime[each.key].email
    max_instance_request_concurrency = 20
    timeout                          = "60s"
    scaling {
      min_instance_count = 0
      max_instance_count = 1
    }
    volumes {
      name = "config"
      secret {
        secret = google_secret_manager_secret.settings[each.key].secret_id
        items {
          version = var.release.versions[each.key]
          path    = "config.json"
        }
      }
    }
    containers {
      image = var.release.images[each.key == "household" ? "gateway" : each.key]
      ports { container_port = 8080 }
      resources {
        limits = { cpu = "1", memory = "1Gi" }
      }
      dynamic "env" {
        for_each = merge({
          FACTORY_PRIVATE_CONFIG                                     = "/var/run/jems/config.json"
          FACTORY_ACTIONS_APPROVED                                   = tostring(local.funded && each.key == "household")
          FACTORY_PREMIUM_BUILDER_APPROVED                           = tostring(local.funded && each.key == "household")
          }, each.key == "preview" ? {} : { JEMS_TEST_PROJECT_NUMBER = var.project_number }, each.key == "household" ? {
          FACTORY_ADULT_PILOT_MODE                                   = "true"
          FACTORY_ADULT_PILOT_OWNER_APPROVED                         = "true"
          FACTORY_ADULT_PILOT_PROFILE_ACCESS_VERIFIED                = "true"
        } : {}, each.key == "household" ? local.funded_env : {})
        content {
          name  = env.key
          value = env.value
        }
      }
      volume_mounts {
        name       = "config"
        mount_path = "/var/run/jems"
      }
    }
  }
  lifecycle {
    # The protected existing family controller owns candidate image selection
    # and traffic after the first revision. Preserve its immutable predecessors.
    ignore_changes = [client, client_version, template[0].containers[0].image, template[0].revision, traffic]
  }
  depends_on = [google_secret_manager_secret_iam_member.read_settings, google_firestore_database.test, google_storage_bucket.artifacts]
}

resource "google_cloud_run_v2_service" "coach" {
  count    = local.services ? 1 : 0
  project  = local.project
  name     = "jems-test-coach"
  location = local.region
  labels   = { "jems-environment" = "test" }
  # Peer Cloud Run calls use a Google-signed service ID token at the exact
  # deterministic service URL. The invoker IAM check stays enabled.
  ingress              = "INGRESS_TRAFFIC_ALL"
  invoker_iam_disabled = false
  deletion_protection  = true
  template {
    service_account                  = google_service_account.runtime["coach"].email
    timeout                          = "60s"
    max_instance_request_concurrency = 4
    scaling {
      min_instance_count = 0
      max_instance_count = 1
    }
    containers {
      image = var.release.images.coach
      ports { container_port = 8080 }
      resources { limits = { cpu = "1", memory = "1Gi" } }
      dynamic "env" {
        for_each = merge({
          FACTORY_COACH_EXECUTION_ENV           = "dedicated-cloud-run"
          FACTORY_COACH_GATEWAY_SERVICE_ACCOUNT = google_service_account.runtime["gateway"].email
          FACTORY_COACH_PRIVATE_AUDIENCE        = local.coach_uri
          JEMS_TEST_PROJECT_NUMBER              = var.project_number
          FACTORY_COACH_APPROVED                = "false"
          FACTORY_COACH_AUDIO_APPROVED          = "false"
          FACTORY_NARRATION_APPROVED            = "false"
        }, local.funded_env)
        content {
          name  = env.key
          value = env.value
        }
      }
      dynamic "env" {
        for_each = local.funded ? [var.funded_trial.coach_key_version] : []
        content {
          name = "FACTORY_COACH_PRIVATE_OPENAI_API_KEY"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.coach_key[0].secret_id
              version = env.value
            }
          }
        }
      }
    }
  }
  depends_on = [google_project_service.test, google_secret_manager_secret_iam_member.funded_coach_key]
}

resource "google_cloud_run_v2_service_iam_member" "coach_invoker" {
  count    = local.services ? 1 : 0
  project  = local.project
  location = local.region
  name     = google_cloud_run_v2_service.coach[0].name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.runtime["gateway"].email}"
}

resource "google_service_account_iam_member" "stage_family" {
  for_each           = local.services ? local.family : toset([])
  service_account_id = google_service_account.runtime[each.key].name
  role               = "roles/iam.serviceAccountUser"
  member             = local.deployer
}

resource "google_project_iam_custom_role" "family_readback" {
  count       = local.on ? 1 : 0
  project     = local.project
  role_id     = "jemsTestStageReadback"
  title       = "Verify Jems TEST immutable build and routing metadata"
  permissions = ["cloudbuild.builds.get", "cloudbuild.repositories.get", "compute.urlMaps.get", "compute.backendServices.get", "compute.networkEndpointGroups.get", "run.revisions.list"]
  depends_on  = [google_project_service.test]
}

resource "google_project_iam_member" "family_readback" {
  count   = local.on ? 1 : 0
  project = local.project
  role    = google_project_iam_custom_role.family_readback[0].name
  member  = local.deployer
}

# Exact-source builds use the public repository and a dedicated TEST writer.
# The protected administrator selects the build; this identity cannot deploy.
resource "google_service_account" "builder" {
  count        = local.on ? 1 : 0
  project      = local.project
  account_id   = "jems-test-builder"
  display_name = "Jems TEST artifact builder"
  depends_on   = [terraform_data.contract]
}
resource "google_artifact_registry_repository_iam_member" "build_write" {
  count      = local.on ? 1 : 0
  project    = local.project
  location   = local.region
  repository = google_artifact_registry_repository.services[0].name
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.builder[0].email}"
}
resource "google_project_iam_member" "build_logs" {
  count   = local.on ? 1 : 0
  project = local.project
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.builder[0].email}"
}
