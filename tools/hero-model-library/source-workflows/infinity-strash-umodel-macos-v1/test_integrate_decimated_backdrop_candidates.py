import importlib.util
import unittest
from pathlib import Path


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location(
    "integrate_decimated_backdrop_candidates",
    HERE / "integrate_decimated_backdrop_candidates.py",
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class IntegrationPlanTest(unittest.TestCase):
    def test_current_tree_preserves_predecessors_and_reports_applied_state(self):
        outputs, plan = MODULE.build(MODULE.DEFAULT_REPO)
        self.assertEqual(len(plan["records"]), 3)
        self.assertTrue(plan["boundaries"]["predecessorsRetained"])
        self.assertTrue(plan["boundaries"]["applied"])
        self.assertTrue(plan["boundaries"]["runtimeSelectable"])
        self.assertFalse(plan["boundaries"]["productionDeploymentVerified"])
        self.assertTrue(plan["s3"]["fullGetVerified"])
        self.assertTrue(plan["s3"]["allMemberSha256Verified"])
        self.assertTrue(plan["s3"]["localUnchanged"])

        catalog_path = MODULE.DEFAULT_REPO / "materials/hero-model-library/priority-runtime-options.json"
        candidate_catalog = MODULE.json.loads(outputs[catalog_path])
        ids = {row["id"] for row in candidate_catalog["models"]}
        for row in plan["records"]:
            self.assertIn(row["predecessor"]["runtimeId"], ids)
            self.assertIn(row["candidate"]["runtimeId"], ids)
            self.assertLessEqual(row["candidate"]["modelIdLength"], 64)

    def test_dry_run_is_byte_deterministic(self):
        first_outputs, first_plan = MODULE.build(MODULE.DEFAULT_REPO)
        second_outputs, second_plan = MODULE.build(MODULE.DEFAULT_REPO)
        self.assertEqual(first_outputs, second_outputs)
        self.assertEqual(first_plan, second_plan)


if __name__ == "__main__":
    unittest.main()
