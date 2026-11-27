# Paste this whole block into the original Cloud Shell, or run it with bash.
(
  set -euo pipefail
  umask 077
  work_dir=$(mktemp -d)
  trap 'rm -rf -- "$work_dir"' EXIT
  cd "$work_dir"
  pin=ea971983131c6ee3142918bbdf0f8d17a565a7e5
  for module in recover_nonproduction admin_api setup_nonproduction; do
    curl -fsSL --proto '=https' --proto-redir '=https' \
      "https://raw.githubusercontent.com/jzwyrzyk/family-game-factory/$pin/scripts/ops/$module.py" \
      -o "$module.py"
  done
  sha256sum --check --status <<'HASHES'
64fd87ae76b8543e0899bb19974f28c7881ffb500694c7a3e90e3825e405bc47  recover_nonproduction.py
e5f8008fc8f65194ab6c52935c04d86f851c910b111a8696391e04d976016964  admin_api.py
4de6d5c7367f4790715f05b865396d331e01a0306bff5482b55bf17cc33dee55  setup_nonproduction.py
HASHES
  python3 -IB - <<'PY'
import json
import re
import sys
from pathlib import Path
from urllib.error import HTTPError

sys.path.insert(0, str(Path.cwd()))
import recover_nonproduction as recovery

root = Path.home() / "work/jems-nonprod-state"
result = {"status": "DIAGNOSTIC_BLOCKED", "operation": "local-inputs"}

def operation(host, method, path):
    endpoint = path.partition("?")[0]
    if method == "POST":
        if host == "logging" and endpoint == "v2/entries:list":
            return "logging.entries.list"
        if host in {"cloudresourcemanager", "cloudbilling"} and endpoint.endswith(":testIamPermissions"):
            return host + ".testIamPermissions"
        if host == "cloudresourcemanager" and endpoint.endswith(":getIamPolicy"):
            return "project.getIamPolicy"
    if method == "GET":
        if host == "cloudresourcemanager": return "project.get"
        if host == "cloudbilling":
            return "billing.projectBillingInfo" if endpoint.endswith("/billingInfo") else "billing.account.get"
        if host == "serviceusage": return "serviceusage.get." + endpoint.rsplit("/", 1)[1]
        if host == "iam":
            if "/serviceAccounts/" in endpoint: return "iam.serviceAccount.get"
            if endpoint.endswith("/providers"): return "iam.poolProviders.list"
            return "iam.pool.get"
        if host == "billingbudgets": return "billing.budgets.list"
    raise recovery.Stop("UNEXPECTED_DIAGNOSTIC_OPERATION")

def coded(value):
    return isinstance(value, str) and re.fullmatch(r"[A-Za-z][A-Za-z0-9_.-]{0,110}", value)

def google_error(error):
    while error is not None and not isinstance(error, HTTPError):
        error = error.__context__
    if error is None: return
    result["http"] = error.code
    try:
        with error:
            data = json.loads(error.read(65537))
        for d in data["error"].get("details", []):
            if d.get("@type") != "type.googleapis.com/google.rpc.ErrorInfo": continue
            fields = d.get("metadata", {})
            for name, value in (("reason", d.get("reason")), ("service", fields.get("service")),
                                ("permission", fields.get("permission"))):
                if coded(value): result[name] = value
    except (ValueError, KeyError, TypeError, AttributeError, OSError):
        pass

class DiagnosticReader(recovery.Reader):
    def call(self, host, method, path, body=None, missing=False):
        result["operation"] = operation(host, method, path)
        try:
            reply = super().call(host, method, path, body, missing)
        except recovery.Stop as exc:
            google_error(exc)
            raise
        if result["operation"].endswith(".testIamPermissions"):
            missing_grants = sorted(set(body["permissions"]) - set(reply.get("permissions", [])))
            if missing_grants: result["missing_permissions"] = missing_grants
        return reply

try:
    variables = recovery.read_json(root / "terraform.tfvars.json")
    result["operation"] = "adc"
    reader = DiagnosticReader()
    recovery.audit(reader, root, Path.cwd())
    recovery.reconcile(reader, variables)
    result = {"status": "RECOVERY_READS_PASSED"}
except recovery.Stop as exc:
    result["code"] = str(exc) if coded(str(exc)) else "RECOVERY_CHECK_STOPPED"
except (OSError, ValueError, KeyError, TypeError):
    result["code"] = "DIAGNOSTIC_INPUT_OR_RESPONSE_INVALID"
print(json.dumps(result, sort_keys=True))
PY
)
