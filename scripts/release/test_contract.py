"""Offline release-contract regression tests. No cloud calls, no paid requests."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("jems_release_contract", Path(__file__).with_name("contract.py"))
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)

SHA = "a" * 40
OTHER = "b" * 40
GATEWAY = "https://factory-gateway-123.us-central1.run.app"
PREVIEW = "https://factory-preview-123.us-central1.run.app"
SITE = "https://jems.example/family-game-factory/"


class ReleaseContractTests(unittest.TestCase):
    def test_plan_is_read_only_and_reports_remaining_gates(self):
        result = release.release_plan("plan", SHA, "", SHA)
        self.assertEqual(result["status"], "READ_ONLY_PLAN")
        self.assertFalse(result["backendMutationAuthorized"])
        self.assertFalse(result["paidModelActivationAuthorized"])
        self.assertIsNone(result["gatewayOrigin"])
        self.assertTrue(result["blockersToFullRelease"])

    def test_pages_requires_reviewed_main_sha_and_both_origins(self):
        with self.assertRaises(release.ReleaseError):
            release.release_plan("pages", SHA, "", SHA, GATEWAY, PREVIEW)
        with self.assertRaises(release.ReleaseError):
            release.release_plan("pages", SHA, OTHER, SHA, GATEWAY, PREVIEW)
        with self.assertRaises(release.ReleaseError):
            release.release_plan("pages", SHA, SHA, OTHER, GATEWAY, PREVIEW)
        with self.assertRaises(release.ReleaseError):
            release.release_plan("pages", SHA, SHA, SHA, GATEWAY, "")
        self.assertEqual(release.release_plan("pages", SHA, SHA, SHA, GATEWAY, PREVIEW)["status"],
                         "READY_FOR_PAGES_ONLY")

    def test_rejects_mutating_full_release_and_unpinned_source(self):
        with self.assertRaises(release.ReleaseError):
            release.release_plan("full", SHA, SHA, SHA)
        for bad in ("main", "latest", "A" * 40, "a" * 39, "a" * 41):
            with self.assertRaises(release.ReleaseError):
                release.checked_sha(bad)

    def test_rejects_unsafe_network_destinations(self):
        for bad in ("http://api.example", "https://localhost", "https://127.0.0.1",
                    "https://api.example:443", "https://api.example/x", "https://api.example?key=x",
                    "https://a:b@api.example", "https://api.example#fragment",
                    "https://api.example/../evil", "https://api.example.evil/anything"):
            with self.subTest(url=bad), self.assertRaises(release.ReleaseError):
                release.checked_origin(bad)
        with self.assertRaises(release.ReleaseError):
            release.checked_pair(GATEWAY, GATEWAY, True)
        self.assertEqual(release.checked_pair(GATEWAY, PREVIEW, True), (GATEWAY, PREVIEW))
        for bad in ("http://jems.example/site/", "https://jems.example/site",
                    "https://jems.example/../admin/", "https://jems.example/site/?token=a",
                    "https://jems.example:443/site/"):
            with self.subTest(site=bad), self.assertRaises(release.ReleaseError):
                release.checked_site_base(bad)

    def test_health_requires_verified_boolean_flags(self):
        def fixture(url):
            return {"ready": True, "paidExecution": url.startswith(GATEWAY)}
        result = release.verified_health(GATEWAY, PREVIEW, fixture)
        self.assertTrue(result["gatewayReportsPaidExecution"])
        self.assertFalse(result["paidModelCallPerformed"])
        for bad_health in ({"ready": "true", "paidExecution": True},
                           {"ready": True, "paidExecution": "false"},
                           {"ready": False, "paidExecution": False}, {}, [], None):
            with self.subTest(health=bad_health), self.assertRaises(release.ReleaseError):
                release.verified_health(GATEWAY, PREVIEW, lambda url: bad_health)
        with self.assertRaises(release.ReleaseError):
            release.verified_health(GATEWAY, PREVIEW,
                                    lambda url: {"ready": True, "paidExecution": True})

    def test_published_site_must_match_exact_commit_and_service_origins(self):
        marker = {"schema": 1, "sourceSha": SHA, "releaseType": "pages-only"}
        config = {"version": 1, "mode": "remote", "apiBaseUrl": GATEWAY, "previewOrigin": PREVIEW}
        calls = []
        def fixture(url):
            calls.append(url)
            if "jems-release.json" in url:
                return marker
            if "factory-config.json" in url:
                return config
            return {"ready": True, "paidExecution": url.startswith(GATEWAY)}
        result = release.verified_pages(SITE, SHA, GATEWAY, PREVIEW, fixture)
        self.assertEqual(result["status"], "PAGES_AND_PUBLIC_HEALTH_VERIFIED")
        self.assertEqual(result["sourceSha"], SHA)
        self.assertTrue(result["gatewayReportsPaidExecution"])
        self.assertFalse(result["backendDeployedByThisRelease"])
        self.assertFalse(result["paidModelActivatedByThisRelease"])
        self.assertFalse(result["authenticatedBuildTested"])
        self.assertFalse(result["childDeviceUATCompleted"])
        self.assertTrue(all(call.startswith(("https://",)) for call in calls))
        self.assertTrue(calls[0].endswith("jems-release.json?source=" + SHA))
        self.assertTrue(calls[1].endswith("factory-config.json?source=" + SHA))
        for broken_marker in ({**marker, "sourceSha": OTHER}, {**marker, "releaseType": "full"}, {}):
            with self.subTest(marker=broken_marker), self.assertRaises(release.ReleaseError):
                release.verify_pages_payload(broken_marker, config, SHA, GATEWAY, PREVIEW)
        for broken_config in ({**config, "apiBaseUrl": "https://other.example"},
                              {**config, "mode": "unavailable"}, {}, {"mode": "remote"}):
            with self.subTest(config=broken_config), self.assertRaises(release.ReleaseError):
                release.verify_pages_payload(marker, broken_config, SHA, GATEWAY, PREVIEW)

    def test_stamp_and_plan_can_be_generated_offline(self):
        with tempfile.TemporaryDirectory() as temp:
            marker = Path(temp) / "dist" / "jems-release.json"
            release.main(["stamp", "--source-sha", SHA, "--output", str(marker)])
            self.assertEqual(json.loads(marker.read_text())["sourceSha"], SHA)
            plan = Path(temp) / "evidence" / "plan.json"
            release.main(["plan", "--operation", "pages", "--source-sha", SHA,
                          "--reviewed-sha", SHA, "--main-sha", SHA, "--gateway-origin", GATEWAY,
                          "--preview-origin", PREVIEW, "--output", str(plan)])
            self.assertEqual(json.loads(plan.read_text())["status"], "READY_FOR_PAGES_ONLY")


    def test_opt_in_automatic_pages_restricts_changes_to_static_presentation(self):
        valid = ["public/jems-logo.svg", "src/brand/jems.css", "src/style.css",
                 "src/studio/style.css", "index.html", "docs/release/README.md"]
        result = release.automatic_pages_scope(valid)
        self.assertEqual(result["status"], "PRESENTATION_ONLY_AUTODEPLOY_APPROVED")
        self.assertFalse(result["backendChangesAllowed"])
        self.assertEqual(result["fileCount"], len(valid))
        for unsafe in ("server/gateway.ts", "src/studio/ui.ts", "src/builder/session.ts",
                       "package-lock.json", "src/learning/policy.ts",
                       ".github/workflows/pages.yml", "scripts/deployment/build.py",
                       "public/new-game.js", "../../.env"):
            with self.subTest(path=unsafe), self.assertRaises(release.ReleaseError):
                release.automatic_pages_scope(["docs/brand/README.md", unsafe])
        with self.assertRaises(release.ReleaseError):
            release.automatic_pages_scope([])

    def test_final_release_verdict_requires_matching_http_and_real_browser_proof(self):
        http = {"schema":1,"status":"PAGES_AND_PUBLIC_HEALTH_VERIFIED",
                "sourceSha":SHA,"siteBase":SITE,
                "gatewayOrigin":GATEWAY,"previewOrigin":PREVIEW}
        def good(device):
            return {"device":device,"homepage":True,"sixFavorites":True,
                    "logo":True,"localGame":True,"uncaughtPageErrors":0,
                    "failedPublicAssets":0}
        browser = {"kind":"public-browser-smoke","siteBase":SITE,"releaseSuccess":True,
                   "paidRequestsStarted":0,"realProviderInferenceTested":False,
                   "parentDeviceUAT":False,"tested":[good("desktop"),good("mobile")]}
        result = release.final_pages_verdict(http,browser)
        self.assertEqual(result["status"],"PAGES_BROWSER_VERIFIED")
        self.assertFalse(result["paidModelActivatedByThisRelease"])
        self.assertFalse(result["realProviderInferenceTested"])
        for wrong in (
            {**browser, "siteBase":"https://other.example/"},
            {**browser, "releaseSuccess":False},
            {**browser, "paidRequestsStarted":1},
            {**browser, "realProviderInferenceTested":True},
            {**browser, "tested":[good("desktop")]},
            {**browser, "tested":[good("desktop"),{**good("mobile"),"localGame":False}]},
            {**browser, "tested":[good("desktop"),{**good("mobile"),"uncaughtPageErrors":1}]},
        ):
            with self.subTest(bad=wrong),self.assertRaises(release.ReleaseError):
                release.final_pages_verdict(http,wrong)
        with self.assertRaises(release.ReleaseError):
            release.final_pages_verdict({**http,"status":"READ_ONLY_PLAN"},browser)
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            good_http=root/"http.json"
            good_browser=root/"browser.json"
            verdict=root/"verdict.json"
            good_http.write_text(json.dumps(http))
            good_browser.write_text(json.dumps(browser))
            release.main(["finalize","--http-evidence",str(good_http),
                          "--browser-evidence",str(good_browser),
                          "--output",str(verdict)])
            self.assertEqual(json.loads(verdict.read_text())["status"],"PAGES_BROWSER_VERIFIED")

    def test_release_workflow_keeps_cloud_mutation_and_provider_secrets_out(self):
        root = Path(__file__).resolve().parents[2]
        workflow = (root / ".github/workflows/jems-release.yml").read_text()
        legacy = (root / ".github/workflows/pages.yml").read_text()
        self.assertIn("JEMS_AUTODEPLOY_PAGES", workflow)
        self.assertIn("on:\n  push:", workflow)
        self.assertIn("workflow_dispatch:", workflow)
        self.assertIn("run: npm test", workflow)
        self.assertIn("scripts/release/contract.py precheck", workflow)
        self.assertIn("scripts/release/contract.py verify", workflow)
        self.assertIn("npm audit --omit=dev --audit-level=high", workflow)
        self.assertIn("scripts/release/contract.py auto-scope", workflow)
        self.assertIn("tests/release-live-browser.cjs", workflow)
        self.assertIn("scripts/release/contract.py finalize", workflow)
        self.assertIn("release-evidence/final-verdict.json", workflow)
        self.assertIn("sourceSha", (root / "scripts/release/contract.py").read_text())
        self.assertIn("node --check tests/release-live-browser.cjs", workflow)
        self.assertIn("actions/deploy-pages@v4", workflow)
        self.assertIn("  pages_build:\n", workflow)
        self.assertIn("    needs: [plan, pages_build]", workflow)
        build_job = workflow.split("  pages_build:\n",1)[1].split("  pages_deploy:\n",1)[0]
        deploy_job = workflow.split("  pages_deploy:\n",1)[1].split("  pages_verify:\n",1)[0]
        self.assertIn("run: npm run build", build_job)
        self.assertIn("actions/upload-pages-artifact", build_job)
        self.assertNotIn("pages: write", build_job)
        self.assertNotIn("id-token: write", build_job)
        self.assertIn("pages: write", deploy_job)
        self.assertIn("id-token: write", deploy_job)
        self.assertIn("actions/deploy-pages@v4", deploy_job)
        for dangerous in ("npm ci", "npm run build", "actions/setup-node", "actions/checkout", "scripts/deployment/site-config.ts"):
            self.assertNotIn(dangerous, deploy_job,"No executable source build in privileged Pages publish step")
        self.assertIn("group: jems-pages-publish", workflow)
        self.assertIn("group: jems-pages-publish", legacy)
        # The only production endpoints come from pre-approved repo variables.
        self.assertIn("vars.JEMS_GATEWAY_ORIGIN", workflow)
        self.assertIn("vars.JEMS_PREVIEW_ORIGIN", workflow)
        self.assertNotIn("inputs.gateway_origin", workflow)
        self.assertNotIn("inputs.preview_origin", workflow)
        for forbidden in ("FACTORY_OPENAI_API_KEY", "FACTORY_ACTIONS_APPROVED=true",
                          "gcloud run deploy", "gcloud run services update",
                          "roles/owner", "secretmanager.versions.access"):
            self.assertNotIn(forbidden, workflow)


if __name__ == "__main__":
    unittest.main()
