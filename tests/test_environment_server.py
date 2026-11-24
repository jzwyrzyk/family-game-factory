import http.client
from http.server import ThreadingHTTPServer
import importlib.util
from pathlib import Path
import tempfile
import threading
import unittest

MODULE = Path(__file__).parents[1] / "scripts/environments/site_server.py"
SPEC = importlib.util.spec_from_file_location("environment_server", MODULE)
server = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(server)


class ServerTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name) / "site"
        self.root.mkdir()
        (self.root / "index.html").write_text("<html><body>Jems preview</body></html>")
        (self.root / "assets").mkdir()
        (self.root / "assets/app.js").write_text("console.log('served as data')")
        (self.root / "jems-environment.json").write_text('{"version":1}')
        (self.root / "sw.js").write_text("// no cache")
        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.handler(self.root))
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        self.thread.join()
        self.temporary.cleanup()

    def request(self, path, method="GET"):
        connection = http.client.HTTPConnection("127.0.0.1", self.httpd.server_port, timeout=5)
        connection.request(method, path)
        response = connection.getresponse()
        result = response.status, dict(response.getheaders()), response.read()
        connection.close()
        return result

    def test_root_and_arcade_are_the_same_site(self):
        for path in ["/", "/arcade", "/arcade/", "/index.html", "/arcade/index.html"]:
            status, headers, body = self.request(path)
            self.assertEqual(status, 200, path)
            self.assertIn(b"Jems preview", body)
            self.assertEqual(headers["Content-Type"], "text/html; charset=utf-8")

    def test_config_identity_and_scripts_never_cache(self):
        for path in ["/", "/jems-environment.json", "/sw.js", "/assets/app.js"]:
            status, headers, _ = self.request(path)
            self.assertEqual(status, 200)
            self.assertEqual(headers["Cache-Control"], "no-store, max-age=0")
            self.assertIn("connect-src 'self'", headers["Content-Security-Policy"])
            self.assertIn("frame-ancestors 'none'", headers["Content-Security-Policy"])
            self.assertEqual(headers["Referrer-Policy"], "no-referrer")
            self.assertEqual(headers["X-Content-Type-Options"], "nosniff")

    def test_head_has_length_and_no_body(self):
        status, headers, body = self.request("/", "HEAD")
        self.assertEqual(status, 200)
        self.assertGreater(int(headers["Content-Length"]), 0)
        self.assertEqual(body, b"")

    def test_directory_and_unknown_route_are_not_spa_successes(self):
        for path in ["/assets/", "/missing.js", "/v1/jobs", "/arbitrary-route"]:
            self.assertEqual(self.request(path)[0], 404, path)

    def test_traversal_and_encoded_traversal_rejected(self):
        outside = self.root.parent / "private.json"
        outside.write_text('{"private":true}')
        for path in ["/../private.json", "/%2e%2e/private.json", "/%252e%252e/private.json", "/assets/%2f..%2f..%2fprivate.json", "/assets\\..\\private.json", "/%00", "/.hidden"]:
            self.assertEqual(self.request(path)[0], 404, path)

    def test_symlink_files_and_directories_rejected(self):
        (self.root / "link.js").symlink_to(self.root / "assets/app.js")
        (self.root / "linked").symlink_to(self.root / "assets", target_is_directory=True)
        for path in ["/link.js", "/linked/app.js"]:
            self.assertEqual(self.request(path)[0], 404)

    def test_no_mutating_or_proxy_methods(self):
        for method in ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]:
            self.assertEqual(self.request("/", method)[0], 405)
        self.assertEqual(self.request("https://example.com/")[0], 400)


if __name__ == "__main__":
    unittest.main()
