locals {
  hosts             = local.on && var.edge != null ? { hub = var.edge.hub, household = var.edge.household, preview = var.edge.preview } : {}
  certificate_hosts = merge(local.hosts, length(local.hosts) > 0 ? { workshops = "*.${local.hosts.hub}" } : {})
  iap_members = local.on && var.edge != null ? merge(
    { for m in setunion(var.edge.management_users, [local.uat]) : "manage/${m}" => { backend = "management", member = m } },
    { for m in setunion(var.edge.household_users, [local.uat]) : "household/${m}" => { backend = "household", member = m } }
  ) : {}
}

data "google_dns_managed_zone" "test" {
  count      = length(local.hosts) > 0 ? 1 : 0
  project    = local.project
  name       = var.edge.dns_zone
  depends_on = [google_project_service.test]
  lifecycle {
    postcondition {
      condition     = self.visibility == "public" && can(regex("^(test|jems-test)\\.", self.dns_name)) && alltrue([for host in values(local.hosts) : endswith("${host}.", ".${self.dns_name}")])
      error_message = "All certificate and serving records must lie strictly inside the existing dedicated public TEST zone."
    }
  }
}

resource "google_certificate_manager_dns_authorization" "host" {
  for_each   = local.hosts
  project    = local.project
  name       = "jems-test-${each.key}"
  domain     = each.value
  type       = "PER_PROJECT_RECORD"
  depends_on = [data.google_dns_managed_zone.test]
}

resource "google_dns_record_set" "authorization" {
  for_each     = google_certificate_manager_dns_authorization.host
  managed_zone = data.google_dns_managed_zone.test[0].name
  project      = local.project
  name         = each.value.dns_resource_record[0].name
  type         = each.value.dns_resource_record[0].type
  rrdatas      = [each.value.dns_resource_record[0].data]
  ttl          = 300
}

resource "google_certificate_manager_certificate" "test" {
  count   = local.on ? 1 : 0
  name    = "jems-test-origins"
  project = local.project
  managed {
    domains            = values(local.certificate_hosts)
    dns_authorizations = [for a in google_certificate_manager_dns_authorization.host : a.id]
  }
  depends_on = [google_dns_record_set.authorization]
}

resource "google_certificate_manager_certificate_map" "test" {
  count      = local.on ? 1 : 0
  name       = "jems-test-origins"
  project    = local.project
  depends_on = [google_project_service.test]
}

resource "google_certificate_manager_certificate_map_entry" "hosts" {
  for_each     = local.certificate_hosts
  project      = local.project
  name         = "jems-test-${each.key}"
  map          = google_certificate_manager_certificate_map.test[0].name
  hostname     = each.value
  certificates = [google_certificate_manager_certificate.test[0].id]
}

resource "google_compute_region_network_endpoint_group" "family" {
  for_each              = local.services ? local.bindings : {}
  project               = local.project
  region                = local.region
  name                  = "jems-test-${each.key}-neg"
  network_endpoint_type = "SERVERLESS"
  cloud_run { service = google_cloud_run_v2_service.family[each.value].name }
}

resource "google_compute_backend_service" "family" {
  for_each              = local.on ? local.backends : toset([])
  project               = local.project
  name                  = "jems-test-${each.key}"
  protocol              = "HTTP"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  enable_cdn            = false
  # The serverless group uses standard provider defaults, with no user-set
  # balancing rates, timeout or health checks. The fallback has no target.
  dynamic "backend" {
    for_each = local.services && each.key != "deny" ? [each.key] : []
    content { group = google_compute_region_network_endpoint_group.family[backend.value].self_link }
  }
  dynamic "iap" {
    for_each = contains(local.guarded, each.key) ? [1] : []
    content {
      enabled                         = true
      oauth2_client_id                = var.edge.oauth_client_id
      oauth2_client_secret_wo         = var.iap_oauth_secret
      oauth2_client_secret_wo_version = tostring(var.edge.oauth_version)
    }
  }
  depends_on = [google_project_service.test]
}

resource "google_iap_settings" "programmatic" {
  for_each = local.on ? local.guarded : toset([])
  name     = "projects/${var.project_number}/iap_web/compute/services/${google_compute_backend_service.family[each.key].generated_id}"
  access_settings {
    oauth_settings { programmatic_clients = [var.edge.oauth_client_id] }
  }
}

resource "google_iap_web_backend_service_iam_member" "private_access" {
  for_each            = local.iap_members
  project             = local.project
  web_backend_service = google_compute_backend_service.family[each.value.backend].name
  role                = "roles/iap.httpsResourceAccessor"
  member              = each.value.member
}

resource "google_compute_url_map" "family" {
  count           = local.services ? 1 : 0
  project         = local.project
  name            = "jems-test-private-origins"
  default_service = google_compute_backend_service.family["deny"].id
  dynamic "host_rule" {
    for_each = { public-hub = var.edge.hub, workshops = "*.${var.edge.hub}", preview = var.edge.preview, household = var.edge.household }
    content {
      hosts        = [host_rule.value]
      path_matcher = host_rule.key
    }
  }
  dynamic "path_matcher" {
    for_each = {
      public-hub = { backend = "gateway", paths = ["/manage", "/manage/*"], override = "management" }
      workshops  = { backend = "gateway", paths = [], override = "deny" }
      preview    = { backend = "preview", paths = [], override = "deny" }
      household  = { backend = "household", paths = ["/v1/worker/jobs/*", "/v1/internal/dispatch"], override = "machine" }
    }
    content {
      name            = path_matcher.key
      default_service = google_compute_backend_service.family[path_matcher.value.backend].id
      dynamic "path_rule" {
        for_each = length(path_matcher.value.paths) > 0 ? [path_matcher.value] : []
        content {
          paths   = path_rule.value.paths
          service = google_compute_backend_service.family[path_rule.value.override].id
        }
      }
    }
  }
}

resource "google_compute_global_address" "family" {
  count        = local.route ? 1 : 0
  project      = local.project
  name         = "jems-test-private-origins"
  address_type = "EXTERNAL"
  depends_on   = [google_project_service.test]
}

resource "google_compute_target_https_proxy" "family" {
  count           = local.route ? 1 : 0
  project         = local.project
  name            = "jems-test-private-origins"
  url_map         = google_compute_url_map.family[0].id
  certificate_map = "//certificatemanager.googleapis.com/${google_certificate_manager_certificate_map.test[0].id}"
  depends_on      = [google_certificate_manager_certificate_map_entry.hosts, google_iap_web_backend_service_iam_member.private_access, google_iap_settings.programmatic]
}

resource "google_compute_global_forwarding_rule" "https" {
  count                 = local.route ? 1 : 0
  project               = local.project
  name                  = "jems-test-private-origins"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  ip_address            = google_compute_global_address.family[0].address
  ip_protocol           = "TCP"
  port_range            = "443"
  target                = google_compute_target_https_proxy.family[0].id
}

resource "google_dns_record_set" "edge" {
  for_each     = local.route ? local.certificate_hosts : {}
  project      = local.project
  managed_zone = data.google_dns_managed_zone.test[0].name
  name         = "${each.value}."
  type         = "A"
  ttl          = 300
  rrdatas      = [google_compute_global_address.family[0].address]
  depends_on   = [google_compute_global_forwarding_rule.https]
}
