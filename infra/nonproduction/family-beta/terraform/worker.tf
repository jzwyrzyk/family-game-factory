resource "google_compute_network" "worker" {
  count                   = local.on ? 1 : 0
  project                 = local.project
  name                    = "jems-test-sandbox"
  auto_create_subnetworks = false
  routing_mode            = "REGIONAL"
  depends_on              = [google_project_service.test]
}
resource "google_compute_subnetwork" "worker" {
  count                    = local.on ? 1 : 0
  name                     = "jems-test-sandbox-${local.region}"
  region                   = local.region
  network                  = google_compute_network.worker[0].id
  ip_cidr_range            = "10.88.0.0/24"
  private_ip_google_access = true
}
resource "google_compute_router" "worker" {
  count   = local.on ? 1 : 0
  name    = "jems-test-sandbox-router"
  region  = local.region
  network = google_compute_network.worker[0].id
}
resource "google_compute_router_nat" "worker" {
  count                              = local.on ? 1 : 0
  name                               = "jems-test-sandbox-nat"
  router                             = google_compute_router.worker[0].name
  region                             = local.region
  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "LIST_OF_SUBNETWORKS"
  subnetwork {
    name                    = google_compute_subnetwork.worker[0].id
    source_ip_ranges_to_nat = ["PRIMARY_IP_RANGE"]
  }
}

resource "google_compute_firewall" "iap_ssh" {
  count         = local.on ? 1 : 0
  name          = "jems-test-sandbox-iap-ssh"
  network       = google_compute_network.worker[0].id
  source_ranges = ["35.235.240.0/20"]
  target_tags   = ["jems-test-sandbox-runner"]
  allow {
    protocol = "tcp"
    ports    = ["22"]
  }
}

resource "google_compute_firewall" "deny_private" {
  count              = local.on ? 1 : 0
  name               = "jems-test-sandbox-egress-deny-private"
  network            = google_compute_network.worker[0].id
  direction          = "EGRESS"
  priority           = 900
  destination_ranges = ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"]
  deny { protocol = "all" }
}
resource "google_compute_firewall" "worker_bootstrap" {
  count              = local.on ? 1 : 0
  name               = "jems-test-sandbox-bootstrap-egress"
  network            = google_compute_network.worker[0].id
  direction          = "EGRESS"
  priority           = 1000
  destination_ranges = ["0.0.0.0/0"]
  target_tags        = ["jems-test-sandbox-runner"]
  allow {
    protocol = "tcp"
    ports    = ["80", "443"]
  }
}
resource "google_compute_firewall" "deny_other" {
  count              = local.on ? 1 : 0
  name               = "jems-test-sandbox-egress-deny-other"
  network            = google_compute_network.worker[0].id
  direction          = "EGRESS"
  priority           = 1100
  destination_ranges = ["0.0.0.0/0"]
  deny { protocol = "all" }
}

resource "google_service_account" "worker_provisioner" {
  count        = local.on ? 1 : 0
  account_id   = "jems-test-worker-provisioner"
  display_name = "Jems TEST keyless JIT worker provisioner"
  depends_on   = [terraform_data.contract]
}
# Split project creation/metadata reads from scoped mutation, subnet usage and IAP.
# No runtime identity is attached to JIT VMs and no actAs is granted.
resource "google_project_iam_custom_role" "worker_create" {
  count       = local.on ? 1 : 0
  project     = local.project
  role_id     = "jemsTestWorkerProvisioner"
  title       = "Create and inspect TEST JIT workers"
  permissions = ["compute.instances.create", "compute.instances.get", "compute.instances.list", "compute.disks.create", "compute.disks.get", "compute.disks.list", "compute.projects.get", "compute.zones.get", "compute.zoneOperations.get", "compute.regionOperations.get", "compute.globalOperations.get", "compute.networks.get", "compute.subnetworks.get"]
  depends_on  = [google_project_service.test]
}
resource "google_project_iam_member" "worker_create" {
  count   = local.on ? 1 : 0
  project = local.project
  role    = google_project_iam_custom_role.worker_create[0].name
  member  = "serviceAccount:${google_service_account.worker_provisioner[0].email}"
}
resource "google_project_iam_custom_role" "worker_manage" {
  count       = local.on ? 1 : 0
  project     = local.project
  role_id     = "jemsTestWorkerLifecycle"
  title       = "Manage named TEST JIT instances and disks"
  permissions = ["compute.instances.delete", "compute.instances.setMetadata", "compute.instances.setLabels", "compute.instances.setTags", "compute.disks.use", "compute.disks.delete", "compute.disks.setLabels"]
  depends_on  = [google_project_service.test]
}
resource "google_project_iam_member" "worker_manage" {
  count   = local.on ? 1 : 0
  project = local.project
  role    = google_project_iam_custom_role.worker_manage[0].name
  member  = "serviceAccount:${google_service_account.worker_provisioner[0].email}"
  condition {
    title      = "TestJitNameAndZone"
    expression = join(" || ", flatten([for zone in ["a", "b", "c"] : [for kind in ["instances", "disks"] : "resource.name.startsWith('projects/${local.project}/zones/${local.region}-${zone}/${kind}/jems-test-jit-')"]]))
  }
}
resource "google_project_iam_custom_role" "worker_subnet" {
  count       = local.on ? 1 : 0
  project     = local.project
  role_id     = "jemsTestWorkerPrivateNic"
  title       = "Attach private NICs on one TEST subnet"
  permissions = ["compute.subnetworks.use"]
  depends_on  = [google_project_service.test]
}
resource "google_compute_subnetwork_iam_member" "worker_use" {
  count      = local.on ? 1 : 0
  project    = local.project
  region     = local.region
  subnetwork = google_compute_subnetwork.worker[0].name
  role       = google_project_iam_custom_role.worker_subnet[0].name
  member     = "serviceAccount:${google_service_account.worker_provisioner[0].email}"
}
resource "google_project_iam_member" "iap_ssh" {
  count   = local.on ? 1 : 0
  project = local.project
  role    = "roles/iap.tunnelResourceAccessor"
  member  = "serviceAccount:${google_service_account.worker_provisioner[0].email}"
  condition {
    title      = "TestJitNetworkSSH"
    expression = "destination.port == 22 && destination.ip.startsWith('10.88.0.')"
  }
}
resource "google_iam_workload_identity_pool" "worker" {
  count                     = local.on ? 1 : 0
  workload_identity_pool_id = "jems-test-worker"
  display_name              = "Jems TEST isolated worker"
  disabled                  = !var.enable_worker_federation
  depends_on                = [terraform_data.contract]
}
resource "google_iam_workload_identity_pool_provider" "worker" {
  count                              = local.on && var.worker != null ? 1 : 0
  workload_identity_pool_id          = google_iam_workload_identity_pool.worker[0].workload_identity_pool_id
  workload_identity_pool_provider_id = "github"
  display_name                       = "Jems TEST protected execution"
  disabled                           = !var.enable_worker_federation
  attribute_mapping                  = { "google.subject" = "assertion.sub", "attribute.repository_id" = "assertion.repository_id" }
  attribute_condition = join(" && ", [
    "assertion.repository=='${var.worker.repository}'",
    "assertion.repository_id=='${var.worker.repository_id}'",
    "assertion.repository_owner=='${split("/", var.worker.repository)[0]}'",
    "assertion.repository_owner_id=='${var.worker.owner_id}'",
    "assertion.repository_visibility=='private'",
    "assertion.ref=='refs/heads/main'",
    "assertion.sha=='${var.worker.source_sha}'",
    "assertion.workflow_sha=='${var.worker.source_sha}'",
    "assertion.workflow_ref=='${var.worker.repository}/.github/workflows/factory-private-test.yml@refs/heads/main'",
    "assertion.environment=='jems-test-infrastructure'",
    "assertion.event_name=='workflow_dispatch'",
    "assertion.ref_type=='branch'",
    "assertion.runner_environment=='github-hosted'",
    "assertion.run_attempt=='1'"
  ])
  oidc { issuer_uri = "https://token.actions.githubusercontent.com" }
}
resource "google_service_account_iam_member" "worker_exchange" {
  count              = local.on && var.worker != null ? 1 : 0
  service_account_id = google_service_account.worker_provisioner[0].name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.worker[0].name}/attribute.repository_id/${var.worker.repository_id}"
  depends_on         = [google_iam_workload_identity_pool_provider.worker]
}
