"""Bounded clients and review-code handling for the Phase 2 owner setup."""

from dataclasses import dataclass, field
import hashlib
import json
import subprocess
import urllib.error
import urllib.request


class SetupError(Exception):
    pass


def require(condition, message):
    if not condition:
        raise SetupError(message)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


class Http:
    def __init__(self, origin, token, headers=None):
        self.origin = origin
        self.headers = {"Authorization": "Bearer " + token, "Accept": "application/json", **(headers or {})}
        self.opener = urllib.request.build_opener(NoRedirect())

    def call(self, method, path, data=None, *, missing=False):
        headers = {**self.headers, "Content-Type": "application/json"}
        request = urllib.request.Request(self.origin + "/" + path.lstrip("/"), method=method,
                                         headers=headers, data=json.dumps(data).encode() if data is not None else None)
        try:
            with self.opener.open(request, timeout=25) as response:
                body = response.read(4_000_001)
                require(len(body) <= 4_000_000, "API response was too large; setup refused to infer state")
                return json.loads(body) if body else {}
        except urllib.error.HTTPError as error:
            if error.code == 404 and missing and method == "GET":
                return None
            raise SetupError(f"{method} {self.origin}/{path.split('?')[0]} returned HTTP {error.code}") from None
        except (urllib.error.URLError, TimeoutError, ValueError):
            raise SetupError(f"{method} {self.origin}/{path.split('?')[0]} failed in transport or decoding") from None


def command(args, *, env=None, timeout=60):
    try:
        result = subprocess.run(args, env=env, text=True, capture_output=True, stdin=subprocess.DEVNULL,
                                timeout=timeout, check=False)
    except (OSError, subprocess.TimeoutExpired):
        raise SetupError(f"{args[0]} was unavailable or timed out") from None
    if result.returncode:
        codes = [code for code in ("NOT_FOUND", "PERMISSION_DENIED", "UNAUTHENTICATED",
                                    "ALREADY_EXISTS", "FAILED_PRECONDITION") if code in result.stderr]
        raise SetupError(f"{' '.join(args[:4])} failed ({', '.join(codes) or result.returncode})")
    return result.stdout.strip()


def gcloud(project, *args, missing=False):
    try:
        output = command(["gcloud", *args, f"--project={project}", "--quiet", "--format=json"], timeout=220)
    except SetupError as error:
        if missing and str(error).endswith("(NOT_FOUND)"):
            return None
        raise
    try:
        return json.loads(output) if output else {}
    except ValueError:
        raise SetupError("gcloud did not return JSON for a configuration read") from None


@dataclass
class Plan:
    phase: str
    evidence: dict
    actions: list = field(default_factory=list)
    work: list = field(default_factory=list)
    notes: list = field(default_factory=list)

    def add(self, description, change, apply):
        self.actions.append({"description": description, "change": change})
        self.work.append(apply)

    def describe(self):
        return {"phase": self.phase, "evidence": self.evidence, "actions": self.actions, "notes": self.notes}

    def review_code(self):
        return hashlib.sha256(json.dumps(self.describe(), sort_keys=True).encode()).hexdigest()

    def verify_code(self, code):
        require(code == self.review_code(), "Review code does not match current state. Run the read-only plan again.")

    def execute(self, code):
        self.verify_code(code)
        evidence = []
        for action, apply in zip(self.actions, self.work):
            print(json.dumps({"applying": action["description"]}), flush=True)
            result = apply()
            if isinstance(result, dict) and "verified" in result:
                evidence.append(result)
        return evidence
