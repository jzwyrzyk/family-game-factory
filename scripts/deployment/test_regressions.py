import copy
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
HELPER = Path(__file__).with_name("regressions.py")
SPEC = importlib.util.spec_from_file_location("release_regressions", HELPER)
r = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(r)


class CompleteRegressionCoverage(unittest.TestCase):
    def setUp(self):
        self.package = json.loads((ROOT / "package.json").read_text())

    def test_actual_application_test_command_is_covered_once(self):
        self.assertEqual(r.verify_coverage(self.package), {"suites": 25, "commands": 39, "shards": 8})

    def test_a_new_top_level_suite_blocks_release_until_assigned(self):
        self.package["scripts"]["test"] += " && npm run test:new-feature"
        self.package["scripts"]["test:new-feature"] = "node tests/new-feature.cjs"
        with self.assertRaisesRegex(r.CoverageError, "COVERAGE_MISMATCH"):
            r.verify_coverage(self.package)

    def test_a_new_nested_browser_suite_cannot_be_silently_omitted(self):
        self.package["scripts"]["test:browser"] += " && node tests/new-browser.cjs"
        with self.assertRaisesRegex(r.CoverageError, "COVERAGE_MISMATCH"):
            r.verify_coverage(self.package)

    def test_missing_and_duplicate_assignments_block_release(self):
        missing = copy.deepcopy(r.SHARDS)
        missing["core"] = missing["core"][1:]
        with self.assertRaisesRegex(r.CoverageError, "COVERAGE_MISMATCH"):
            r.verify_coverage(self.package, missing)
        duplicate = copy.deepcopy(r.SHARDS)
        duplicate["coach"] += (duplicate["core"][0],)
        with self.assertRaisesRegex(r.CoverageError, "DUPLICATE"):
            r.verify_coverage(self.package, duplicate)

    def test_duplicate_source_suite_is_not_accepted_as_extra_coverage(self):
        self.package["scripts"]["test"] += " && npm run test:unit"
        with self.assertRaisesRegex(r.CoverageError, "DUPLICATE"):
            r.verify_coverage(self.package)

    def test_build_must_remain_first_and_present_exactly_once(self):
        for command in (self.package["scripts"]["test"].removeprefix("npm run build && "),
                        self.package["scripts"]["test"] + " && npm run build"):
            with self.subTest(command=command[:40]):
                package = copy.deepcopy(self.package)
                package["scripts"]["test"] = command
                with self.assertRaisesRegex(r.CoverageError, "BUILD_REQUIRED"):
                    r.verify_coverage(package)

    def test_removed_npm_script_fails_before_execution(self):
        del self.package["scripts"]["test:unit"]
        with self.assertRaisesRegex(r.CoverageError, "SCRIPT_MISSING"):
            r.verify_coverage(self.package)

    def test_alternative_shell_control_flow_cannot_look_like_full_coverage(self):
        for suffix in (" || true", "; true", " | cat", " && ", " $(true)"):
            with self.subTest(suffix=suffix):
                package = copy.deepcopy(self.package)
                package["scripts"]["test:browser"] += suffix
                with self.assertRaises(r.CoverageError):
                    r.verify_coverage(package)

    def test_check_mode_works_without_dependencies_or_build_artifact(self):
        result = subprocess.run([sys.executable, str(HELPER), "--source", str(ROOT), "--check"],
                                text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("REGRESSION_COVERAGE_VERIFIED", result.stdout)

    def test_unknown_shard_and_missing_build_fail_without_running_tests(self):
        with tempfile.TemporaryDirectory() as temporary:
            source = Path(temporary)
            (source / "package.json").write_text(json.dumps(self.package))
            for shard in ("unknown", "core"):
                result = subprocess.run([sys.executable, str(HELPER), "--source", str(source), "--shard", shard],
                                        text=True, capture_output=True)
                self.assertNotEqual(result.returncode, 0)
                self.assertNotIn("REGRESSION_START", result.stdout)

    def test_real_child_process_failure_stops_shard_and_preserves_nonzero_exit(self):
        with tempfile.TemporaryDirectory() as temporary:
            source = Path(temporary)
            (source / "package.json").write_text(json.dumps(self.package))
            (source / "dist").mkdir()
            (source / "dist" / "index.html").write_text("fixture build")
            binaries = source / "bin"
            binaries.mkdir()
            executable = binaries / "npm"
            executable.write_text("#!" + sys.executable + "\nimport os, pathlib, sys\n"
                                  "with pathlib.Path(os.environ['JEMS_TEST_COMMAND_LOG']).open('a') as log:\n"
                                  " log.write(' '.join(sys.argv[1:]) + '\\n')\n"
                                  "raise SystemExit(17 if sys.argv[2] == 'test:deployment' else 0)\n")
            executable.chmod(0o755)
            log = source / "commands.log"
            environment = dict(os.environ, PATH=str(binaries) + os.pathsep + os.environ["PATH"],
                               JEMS_TEST_COMMAND_LOG=str(log))
            result = subprocess.run([sys.executable, str(HELPER), "--source", str(source), "--shard", "core"],
                                    env=environment, text=True, capture_output=True)
            self.assertEqual(result.returncode, 17, result.stderr)
            self.assertEqual(log.read_text().splitlines(), ["run test:unit", "run test:deployment"])
            self.assertNotIn("REGRESSION_SHARD_PASSED", result.stdout)


if __name__ == "__main__":
    unittest.main()
