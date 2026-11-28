# Contains metadata for the existing renderer and protected family controller.
# Resolve both immutable Cloud Build records before creating JEMS_FAMILY_TEST_RELEASE.
output "family_descriptor" {
  value = local.services ? merge({
    environment   = "test"
    project       = local.project
    projectNumber = var.project_number
    region        = local.region
    hub           = var.edge.hub
    household     = var.edge.household
    preview       = var.edge.preview
    gatewayImage  = var.release.images.gateway
    previewImage  = var.release.images.preview
    services = { for k in local.family : k => {
      name     = google_cloud_run_v2_service.family[k].name
      identity = google_service_account.runtime[k].email
      secret   = google_secret_manager_secret.settings[k].secret_id
      version  = var.release.versions[k]
    } }
    backends = { for k, b in google_compute_backend_service.family : k => b.name }
  }, !local.funded ? {} : { testTrial = local.funded_env }) : null
}

output "test_bindings" {
  value = local.on ? {
    project               = local.project
    projectNumber         = var.project_number
    stage                 = var.stage
    hosts                 = local.hosts
    iapOAuthAudience      = var.edge.oauth_client_id
    iapAssertionAudiences = { for k in local.guarded : k => "/projects/${var.project_number}/global/backendServices/${google_compute_backend_service.family[k].generated_id}" }
    database              = google_firestore_database.test[0].name
    artifactBucket        = google_storage_bucket.artifacts[0].name
    registry              = "${local.region}-docker.pkg.dev/${local.project}/${google_artifact_registry_repository.services[0].repository_id}"
    builder               = google_service_account.builder[0].email
    coachKeySecret        = google_secret_manager_secret.coach_key[0].secret_id
    runtime               = { for k, s in google_service_account.runtime : k => s.email }
    privateConfigs        = { for k, s in google_secret_manager_secret.settings : k => s.secret_id }
    coachOrigin           = local.coach_uri
    funding = var.funded_trial == null ? null : {
      authorizationSha256  = var.funded_trial.authorization_sha256
      expiresUtc           = var.funded_trial.expires_at
      lineageLimitMicroUsd = 5000000
    }
    worker = {
      principal              = google_service_account.worker_provisioner[0].email
      provider               = google_iam_workload_identity_pool_provider.worker[0].name
      network                = google_compute_network.worker[0].name
      subnetwork             = google_compute_subnetwork.worker[0].name
      activationRequested    = var.enable_worker_federation
      repository             = var.worker.repository
      repositoryId           = var.worker.repository_id
      ownerId                = var.worker.owner_id
      source                 = var.worker.source_sha
      signedSandboxDigestRef = var.worker.sandbox_image
      sandboxSource          = var.worker.sandbox_source
      callback               = "https://${var.edge.hub}"
    }
    edgeAddress = local.route ? google_compute_global_address.family[0].address : null
  } : null
}
