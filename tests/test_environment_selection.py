"""Meaningful coverage checks for conservative DEV test selection."""
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("environment_selection", ROOT / "scripts/environments/selection.py")
selection = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(selection)


class EnvironmentSelectionTests(unittest.TestCase):
    def test_documentation_does_not_create_previews(self):
        result = selection.select(["docs/operations/TEST.md", "AGENTS.md", ".github/PULL_REQUEST_TEMPLATE.md"])
        self.assertFalse(result["previewRequired"])
        self.assertEqual(result["scripts"], ["docs:check"])

    def test_feature_dependencies_are_included_once(self):
        result = selection.select(["src/pals/service.ts", "src/creation/library.ts", "src/pals/service.ts"])
        self.assertEqual(result["mode"], "targeted")
        self.assertTrue(result["previewRequired"])
        self.assertTrue({"build", "test:unit", "test:pals-browser", "test:creation-browser",
                         "test:problem-solving-browser", "test:navigation-continuity"} <= set(result["scripts"]))
        self.assertEqual(len(result["scripts"]), len(set(result["scripts"])))

    def test_sensitive_shared_and_unknown_paths_fail_to_full_suite(self):
        for path in ["server/gateway.ts", "src/builder/session.ts", "src/factory/store.ts",
                     "src/studio/notebook.ts", "public/factory-config.json", "package.json",
                     ".github/workflows/pages.yml", "tests/pals-browser.cjs", "src/new-feature.ts"]:
            with self.subTest(path=path):
                result = selection.select(["src/pals/service.ts", path])
                self.assertEqual(result["mode"], "full")
                self.assertEqual(result["scripts"], ["test", "docs:check"])
                self.assertTrue(result["requiredCiUnchanged"])

    def test_validation_and_release_intent_only_changes_do_not_deploy_application(self):
        for path in ["tests/pals-browser.cjs", ".github/workflows/pages.yml", "ops/release-intent.json", "scripts/ops/release.py"]:
            with self.subTest(path=path):
                result = selection.select([path, "docs/README.md"])
                self.assertEqual(result["mode"], "full")
                self.assertFalse(result["previewRequired"])

    def test_paths_cannot_escape_or_contain_control_characters(self):
        for path in ["../src/pals/a.ts", "/src/pals/a.ts", "src\\pals\\a.ts", "docs/a\nb.md"]:
            with self.subTest(path=path), self.assertRaises(ValueError):
                selection.select([path])

    def test_every_selected_script_exists_in_current_package(self):
        scripts = json.loads((ROOT / "package.json").read_text())["scripts"]
        for prefixes, _ in selection.RULES:
            result = selection.select([prefixes[0] + "example.ts"])
            self.assertTrue(set(result["scripts"]) <= set(scripts))


if __name__ == "__main__":
    unittest.main()
