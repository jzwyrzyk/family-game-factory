#!/usr/bin/env python3
"""Bounded, data-only preview packages; never execute artifact contents.

Consolidates PR106 (8734e9b2) preview-contract.ts's disconnected configuration,
file allowlist, limits, source identity, banner and content inventory. The trusted
controller must separately bind the producing Actions run and PR head: hashes do
not establish provenance. frontendSha256 hashes the canonical sorted inventory
of every served file except jems-environment.json, avoiding a self-reference.
The complete gzip archive has a second SHA-256 for transport/approval identity.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import tarfile
import tempfile

IDENTITY = "jems-environment.json"
MAX_FILES = 12000
MAX_BYTES = 512 * 1024 * 1024
MAX_FILE_BYTES = 32 * 1024 * 1024
MAX_IDENTITY_BYTES = 4 * 1024 * 1024
EXTENSIONS = {".html", ".js", ".mjs", ".css", ".json", ".webmanifest", ".svg",
              ".png", ".webp", ".jpg", ".jpeg", ".gif", ".ico", ".woff", ".woff2",
              ".ttf", ".mp3", ".wav", ".ogg", ".mp4", ".webm", ".txt", ".md", ".wasm"}
DISCONNECTED_CONFIG = {"version": 1, "mode": "unavailable"}
SW_DISABLED = b"""// Nonproduction previews never serve an offline previous release.
self.addEventListener('install', e => e.waitUntil(self.skipWaiting()));
self.addEventListener('activate', e => e.waitUntil(Promise.all([
  caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('family-arcade:')).map(k => caches.delete(k)))),
  self.registration.unregister()
])));
"""
SOURCE_RE = re.compile(r"[0-9a-f]{40}")
DIGEST_RE = re.compile(r"[0-9a-f]{64}")


class BundleError(ValueError):
    pass


def canonical(value: object) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode()


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def file_digest(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def validate_identity_inputs(source: str, environment: str, pr: int | None) -> None:
    if not isinstance(source, str) or not SOURCE_RE.fullmatch(source):
        raise BundleError("SOURCE_INVALID")
    if environment not in {"dev", "test"}:
        raise BundleError("ENVIRONMENT_INVALID")
    if environment == "dev" and (type(pr) is not int or not 1 <= pr <= 99999999):
        raise BundleError("PR_INVALID")
    if environment == "test" and pr is not None:
        raise BundleError("TEST_MUST_NOT_HAVE_PR")


def safe_path(name: str) -> None:
    parts = name.split("/")
    # USTAR's name/prefix fields are bounded; avoid GNU/PAX long-name records.
    if (not name or len(name) > 240 or not re.fullmatch(r"[A-Za-z0-9_./ @+\-]+", name)
            or any(not part or len(part) > 100 or part.startswith(".") for part in parts)
            or PurePosixPath(name).is_absolute()):
        raise BundleError("ARTIFACT_PATH_INVALID")
    if PurePosixPath(name).suffix.lower() not in EXTENSIONS:
        raise BundleError("ARTIFACT_FILE_TYPE_REJECTED")
    if re.search(r"(?:^|/)(?:package(?:-lock)?\.json|firebase\.json|credentials[^/]*|service-account[^/]*|gha-creds-[^/]*)$", name, re.I):
        raise BundleError("ARTIFACT_SENSITIVE_FILE_REJECTED")


def inspect_bytes(name: str, data: bytes) -> dict:
    safe_path(name)
    if len(data) > MAX_FILE_BYTES:
        raise BundleError("ARTIFACT_FILE_TOO_LARGE")
    if PurePosixPath(name).suffix.lower() in {".html", ".js", ".mjs", ".json", ".webmanifest", ".txt", ".md"}:
        if re.search(rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\"type\"\s*:\s*\"service_account\"", data):
            raise BundleError("ARTIFACT_CREDENTIAL_MATERIAL_REJECTED")
    return {"path": name, "bytes": len(data), "sha256": digest(data)}


def inventory(root: Path, *, exclude_identity: bool = True) -> list[dict]:
    if root.is_symlink() or not root.is_dir():
        raise BundleError("ARTIFACT_ROOT_INVALID")
    result = []
    total = 0
    for directory, dirs, files in os.walk(root, followlinks=False):
        for name in dirs:
            path = Path(directory) / name
            if path.is_symlink() or name.startswith(".") or "\\" in name:
                raise BundleError("ARTIFACT_DIRECTORY_REJECTED")
        for name in files:
            path = Path(directory) / name
            relative = path.relative_to(root).as_posix()
            entry = path.lstat()
            if not stat.S_ISREG(entry.st_mode) or entry.st_nlink != 1:
                raise BundleError("ARTIFACT_LINK_OR_TYPE_REJECTED")
            if entry.st_size > MAX_FILE_BYTES:
                raise BundleError("ARTIFACT_FILE_TOO_LARGE")
            if exclude_identity and relative == IDENTITY:
                continue
            data = path.read_bytes()
            if len(data) != entry.st_size:
                raise BundleError("ARTIFACT_CHANGED_DURING_READ")
            result.append(inspect_bytes(relative, data))
            total += len(data)
            if len(result) > MAX_FILES or total > MAX_BYTES:
                raise BundleError("ARTIFACT_LIMIT_EXCEEDED")
    return sorted(result, key=lambda item: item["path"])


def banner(source: str, environment: str, pr: int | None) -> str:
    label = f"DEV · PR #{pr}" if environment == "dev" else "TEST"
    # Play owns a fixed/fullscreen viewport. Reserve an actual grid row inside
    # that viewport; a high-z-index global banner would cover My Games/Exit.
    # Keep this preview-only adaptation outside the production application.
    play_label = f"{label} · {source[:12]} · AI disconnected"
    return ('<style id="jemsEnvironmentLayout">'
            'body.studio-review #page-studio.studio-play-mode{'
            'grid-template-rows:auto auto auto minmax(0,1fr);'
            'grid-template-areas:"environment" "heading" "tools" "game";}'
            'body.studio-review #page-studio.studio-play-mode::before{'
            f'content:"{play_label}";'
            'grid-area:environment;display:block;min-width:0;padding:4px 8px;'
            'background:#fff2c6;color:#332807;font:600 18px/1.35 system-ui,sans-serif;'
            'overflow-wrap:anywhere;pointer-events:none;}'
            '@media(max-height:600px) and (min-width:600px){'
            'body.studio-review #page-studio.studio-play-mode{'
            'grid-template-rows:auto auto minmax(0,1fr);'
            'grid-template-areas:"environment environment" "heading tools" "game game";}}'
            '</style>'
            f'<aside id="jemsEnvironmentBanner" aria-label="Testing environment" '
            'style="position:relative;background:#fff2c6;color:#332807;'
            'padding:8px 16px;font:600 18px/1.4 system-ui,sans-serif;overflow-wrap:anywhere">'
            f'<strong>{label}</strong> · {source[:12]} · AI disconnected · Disposable test work '
            f'<a href="./{IDENTITY}" style="color:#332807;text-decoration:underline">Build details</a></aside>')


def prepare(root: Path, source: str, environment: str, pr: int | None) -> dict:
    validate_identity_inputs(source, environment, pr)
    inventory(root, exclude_identity=False)
    try:
        info = json.loads((root / "build-info.json").read_bytes())
        html = (root / "index.html").read_text(encoding="utf-8")
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise BundleError("ARTIFACT_BUILD_INFO_REQUIRED") from exc
    if not isinstance(info, dict) or info.get("sha") != source or info.get("dirty") is not False:
        raise BundleError("ARTIFACT_BUILD_SOURCE_MISMATCH")
    if (not re.search(r"<body(?:\s[^>]*)?>", html, re.I) or re.search(r"<base\b", html, re.I)
            or "jemsEnvironmentBanner" in html):
        raise BundleError("ARTIFACT_INDEX_INVALID")
    html = re.sub(r"<body(?:\s[^>]*)?>", lambda m: m.group() + banner(source, environment, pr), html, count=1, flags=re.I)
    (root / "index.html").write_text(html, encoding="utf-8")
    (root / "factory-config.json").write_bytes(canonical(DISCONNECTED_CONFIG))
    (root / "sw.js").write_bytes(SW_DISABLED)
    files = inventory(root)
    identity = {"version": 1, "environment": environment, "sourceSha": source, "prNumber": pr,
                "frontendSha256": digest(canonical(files)), "backendPolicy": "disconnected", "files": files}
    (root / IDENTITY).write_bytes(canonical(identity))
    return identity


def verify_directory(root: Path, source: str, environment: str, pr: int | None) -> dict:
    validate_identity_inputs(source, environment, pr)
    try:
        identity_path = root / IDENTITY
        if identity_path.is_symlink() or identity_path.stat().st_size > MAX_IDENTITY_BYTES:
            raise BundleError("IDENTITY_FILE_INVALID")
        identity = json.loads(identity_path.read_bytes())
        if not isinstance(identity, dict) or set(identity) != {"version", "environment", "sourceSha", "prNumber", "frontendSha256", "backendPolicy", "files"}:
            raise BundleError("IDENTITY_INVALID")
        if (type(identity["version"]) is not int or identity["version"] != 1 or identity["environment"] != environment or identity["sourceSha"] != source
                or identity["prNumber"] != pr or identity["backendPolicy"] != "disconnected"):
            raise BundleError("IDENTITY_MISMATCH")
        files = inventory(root)
        if files != identity["files"] or digest(canonical(files)) != identity["frontendSha256"]:
            raise BundleError("ARTIFACT_DIGEST_MISMATCH")
        if json.loads((root / "factory-config.json").read_bytes()) != DISCONNECTED_CONFIG:
            raise BundleError("REMOTE_CONFIGURATION_REJECTED")
        info = json.loads((root / "build-info.json").read_bytes())
        if info.get("sha") != source or info.get("dirty") is not False:
            raise BundleError("ARTIFACT_BUILD_SOURCE_MISMATCH")
        if (root / "sw.js").read_bytes() != SW_DISABLED:
            raise BundleError("OFFLINE_CACHE_REJECTED")
        if banner(source, environment, pr) not in (root / "index.html").read_text(encoding="utf-8"):
            raise BundleError("ENVIRONMENT_BANNER_REQUIRED")
    except (OSError, UnicodeError, json.JSONDecodeError, AttributeError) as exc:
        raise BundleError("ARTIFACT_INCOMPLETE") from exc
    return identity


def pack(dist: Path, source: str, pr: int | None, out: Path, environment: str = "dev") -> dict:
    validate_identity_inputs(source, environment, pr)
    # Validate before copying: copytree must never follow PR-created symlinks.
    inventory(dist, exclude_identity=False)
    with tempfile.TemporaryDirectory(prefix="jems-bundle-") as temporary:
        root = Path(temporary) / "site"
        shutil.copytree(dist, root, symlinks=True)
        identity = prepare(root, source, environment, pr)
        out.parent.mkdir(parents=True, exist_ok=True)
        with out.open("wb") as raw:
            with gzip.GzipFile(filename="", mode="wb", fileobj=raw, mtime=0) as compressed:
                with tarfile.open(fileobj=compressed, mode="w|", format=tarfile.USTAR_FORMAT) as archive:
                    for entry in inventory(root, exclude_identity=False):
                        metadata = tarfile.TarInfo(entry["path"])
                        metadata.size = entry["bytes"]
                        metadata.mode = 0o644
                        metadata.mtime = 0
                        with (root / entry["path"]).open("rb") as data:
                            archive.addfile(metadata, data)
        return {**identity, "archiveSha256": file_digest(out)}


def extract(archive: Path, destination: Path, source: str, pr: int | None, environment: str = "dev") -> dict:
    validate_identity_inputs(source, environment, pr)
    if archive.is_symlink() or not archive.is_file() or archive.stat().st_size > MAX_BYTES:
        raise BundleError("ARCHIVE_INVALID")
    if destination.exists() or destination.is_symlink():
        raise BundleError("DESTINATION_MUST_NOT_EXIST")
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="jems-extract-", dir=destination.parent) as temporary:
        root = Path(temporary) / "site"
        root.mkdir()
        names = set()
        total = 0
        try:
            with tarfile.open(archive, mode="r|gz") as packaged:
                for member in packaged:
                    safe_path(member.name)
                    if (not member.isfile() or member.linkname or member.pax_headers or member.sparse
                            or member.name in names or member.size < 0):
                        raise BundleError("ARCHIVE_ENTRY_REJECTED")
                    if member.size > MAX_FILE_BYTES:
                        raise BundleError("ARTIFACT_FILE_TOO_LARGE")
                    names.add(member.name)
                    total += member.size
                    if len(names) > MAX_FILES + 1 or total > MAX_BYTES + MAX_IDENTITY_BYTES:
                        raise BundleError("ARTIFACT_LIMIT_EXCEEDED")
                    stream = packaged.extractfile(member)
                    if stream is None:
                        raise BundleError("ARCHIVE_ENTRY_REJECTED")
                    data = stream.read(MAX_FILE_BYTES + 1)
                    if len(data) != member.size:
                        raise BundleError("ARCHIVE_TRUNCATED")
                    inspect_bytes(member.name, data)
                    path = root / member.name
                    path.parent.mkdir(parents=True, exist_ok=True)
                    with path.open("xb") as output:
                        output.write(data)
                    path.chmod(0o644)
        except (tarfile.TarError, EOFError, OSError) as exc:
            raise BundleError("ARCHIVE_INVALID") from exc
        identity = verify_directory(root, source, environment, pr)
        root.rename(destination)
    return {**identity, "archiveSha256": file_digest(archive)}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    for name in ("pack", "verify", "extract"):
        command = commands.add_parser(name)
        command.add_argument("--source", required=True)
        command.add_argument("--environment", choices=("dev", "test"), default="dev")
        command.add_argument("--pr", type=int)
        if name == "pack":
            command.add_argument("--dist", type=Path, required=True)
            command.add_argument("--out", type=Path, required=True)
        else:
            command.add_argument("--archive", type=Path, required=True)
            if name == "extract":
                command.add_argument("--dest", type=Path, required=True)
    args = parser.parse_args()
    try:
        if args.command == "pack":
            result = pack(args.dist, args.source, args.pr, args.out, args.environment)
        elif args.command == "extract":
            result = extract(args.archive, args.dest, args.source, args.pr, args.environment)
        else:
            with tempfile.TemporaryDirectory(prefix="jems-verify-") as temp:
                result = extract(args.archive, Path(temp) / "site", args.source, args.pr, args.environment)
        print(json.dumps({key: value for key, value in result.items() if key != "files"}, sort_keys=True))
        return 0
    except BundleError as error:
        print(str(error), file=__import__("sys").stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
