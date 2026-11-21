#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"
for marker in baseline candidate; do
  image="jems-drill-local:$marker"
  docker build --network none --build-arg "DRILL_MARKER=$marker" -t "$image" .
  docker run --rm --network none --entrypoint /bin/sh -e EXPECTED="$marker" "$image" -c '
    test "$(id -u)" != 0 || exit 1
    node /app/server.cjs & child=$!
    trap "kill $child 2>/dev/null || true" EXIT
    node - <<'"'"'JS'"'"'
(async () => {
  for (let i = 0; i < 15; i++) {
    try {
      const url = "http://127.0.0.1:8080";
      const health = await (await fetch(url + "/health")).json();
      if (!health.ready || health.marker !== process.env.EXPECTED) process.exit(1);
      if ((await fetch(url + "/health", {method:"POST"})).status !== 404) process.exit(1);
      console.log(health.marker + " synthetic image is healthy as non-root and rejects POST");
      return;
    } catch { await new Promise(resolve => setTimeout(resolve, 200)); }
  }
  process.exit(1);
})();
JS
  '
done
