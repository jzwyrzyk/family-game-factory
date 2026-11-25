#!/usr/bin/env python3
"""Trusted, dependency-free static server for disconnected IAP-protected previews.

IAP and the zero-role runtime identity are deployment controls, not implemented by
this process. Never deploy without those checks. PR files are served as data and
never imported or executed by this Python process. Source: PR106 preview policy.
"""
from __future__ import annotations

import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import mimetypes
import os
from pathlib import Path
import shutil
import stat
from urllib.parse import unquote, urlsplit

CSP = ("default-src 'self'; script-src 'self' 'unsafe-inline' blob:; "
       "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; "
       "media-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; "
       "frame-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
SECURITY_HEADERS = {
    "Content-Security-Policy": CSP,
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    "Permissions-Policy": "microphone=(), camera=(), geolocation=()",
    "Cache-Control": "no-store, max-age=0",
}
MIME = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
        ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
        ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".wasm": "application/wasm"}


def handler(directory: Path) -> type[BaseHTTPRequestHandler]:
    root = directory.resolve(strict=True)
    if not root.is_dir() or directory.is_symlink():
        raise ValueError("STATIC_ROOT_INVALID")

    class StaticHandler(BaseHTTPRequestHandler):
        server_version = "JemsPreview"
        sys_version = ""

        def log_message(self, format: str, *args: object) -> None:
            # Avoid logging URLs, query capabilities, IAP headers or identities.
            return

        def end_headers(self) -> None:
            for name, value in SECURITY_HEADERS.items():
                self.send_header(name, value)
            super().end_headers()

        def fail(self, status: int) -> None:
            self.send_response(status)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", "0")
            self.end_headers()

        def do_POST(self) -> None:
            self.fail(405)

        do_PUT = do_PATCH = do_DELETE = do_OPTIONS = do_POST

        def do_HEAD(self) -> None:
            self.serve(head=True)

        def do_GET(self) -> None:
            self.serve(head=False)

        def serve(self, *, head: bool) -> None:
            try:
                target = urlsplit(self.path)
                if target.scheme or target.netloc or len(self.path) > 2048:
                    return self.fail(400)
                path = unquote(target.path, errors="strict")
                if ("\\" in path or "\x00" in path or "%" in path
                        or any(segment.startswith(".") for segment in path.split("/") if segment)):
                    return self.fail(404)
                if path in {"/arcade", "/arcade/"}:
                    path = "/"
                elif path.startswith("/arcade/"):
                    path = path[len("/arcade"):]
                relative = path.lstrip("/") or "index.html"
                candidate = root / relative
                # Never follow directory or file symlinks even if the target is local.
                if any(part.is_symlink() for part in [candidate, *candidate.parents] if part != root.parent):
                    return self.fail(404)
                if not candidate.is_file() or not candidate.resolve().is_relative_to(root):
                    return self.fail(404)
                if not stat.S_ISREG(candidate.stat().st_mode):
                    return self.fail(404)
                with candidate.open("rb") as content:
                    self.send_response(200)
                    content_type = MIME.get(candidate.suffix.lower()) or mimetypes.guess_type(candidate.name)[0] or "application/octet-stream"
                    self.send_header("Content-Type", content_type)
                    self.send_header("Content-Length", str(os.fstat(content.fileno()).st_size))
                    self.end_headers()
                    if not head:
                        shutil.copyfileobj(content, self.wfile, 64 * 1024)
            except (OSError, ValueError, UnicodeError):
                self.fail(404)

    return StaticHandler


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, default=Path("/site"))
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "8080")))
    args = parser.parse_args()
    # A server with absent identity/config must not masquerade as a preview.
    identity = json.loads((args.directory / "jems-environment.json").read_bytes())
    config = json.loads((args.directory / "factory-config.json").read_bytes())
    if identity.get("environment") not in {"dev", "test"} or config != {"version": 1, "mode": "unavailable"}:
        raise SystemExit("DISCONNECTED_PREVIEW_REQUIRED")
    ThreadingHTTPServer((args.host, args.port), handler(args.directory)).serve_forever()


if __name__ == "__main__":
    main()
