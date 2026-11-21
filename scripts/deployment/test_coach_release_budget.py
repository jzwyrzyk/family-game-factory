"""Run the five no-cloud coach budget fixtures in the existing deployment gate."""
import os
from pathlib import Path
import subprocess
import unittest


class CoachReleaseBudgetTests(unittest.TestCase):
    def test_selected_source_budget_boundaries(self):
        root = Path(__file__).resolve().parents[2]
        scripts = root / "scripts" / "deployment"
        environment = dict(os.environ)
        environment["JEMS_COACH_BUDGET_SOURCE_ROOT"] = str(root)
        environment["JEMS_COACH_BUDGET_HELPER"] = str(scripts / "coach_release_budget.cjs")
        result = subprocess.run(
            ["node", "--import", "tsx", "--test", str(scripts / "coach_release_budget.test.cjs")],
            cwd=root, env=environment, capture_output=True, text=True, timeout=60,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
