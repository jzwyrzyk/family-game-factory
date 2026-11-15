#!/usr/bin/env bash
# Run only on a freshly provisioned, credential-free Ubuntu 24.04 worker VM.
set -Eeuo pipefail
export DEBIAN_FRONTEND=noninteractive
test "$(id -u)" -eq 0 || { echo "root required" >&2; exit 1; }
apt-get update
apt-get install -y docker.io curl ca-certificates gnupg git jq python3
curl -fsSL https://gvisor.dev/archive.key | gpg --dearmor -o /usr/share/keyrings/gvisor-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/gvisor-archive-keyring.gpg] https://storage.googleapis.com/gvisor/releases release main" >/etc/apt/sources.list.d/gvisor.list
apt-get update
apt-get install -y runsc
runsc install
systemctl enable --now docker
systemctl restart docker
docker info --format '{{json .Runtimes}}' | jq -e 'has("runsc")'
test "$(df -BG /var/lib/docker | awk 'NR==2 {gsub(/G/,"",$4);print $4}')" -ge 20 || { echo "FAIL: less than 20 GiB free Docker storage" >&2; exit 1; }
test "$(docker info --format '{{.Driver}}')" = overlay2 || { echo "FAIL: overlay2 required" >&2; exit 1; }
test -z "$(curl -sSf -m 2 -H 'Metadata-Flavor: Google' http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/ 2>/dev/null || true)" || { echo "FAIL: VM exposes cloud identity" >&2; exit 1; }
echo "BOOTSTRAP_READY: no runner registered; no source executed"
