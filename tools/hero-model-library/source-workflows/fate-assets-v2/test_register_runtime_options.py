import importlib.util
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("register_runtime_options.py")
SPEC = importlib.util.spec_from_file_location("fate_runtime_options", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class FateRuntimeOptionsTest(unittest.TestCase):
    def test_plan_covers_all_components_and_complete_six_states(self):
        inventory, plan = MODULE.read(MODULE.INVENTORY), MODULE.read(MODULE.PLAN)
        source = {row["characterId"]: row for row in inventory["minecraftCommunity"]["servants"]}
        self.assertEqual(len(source), 14)
        self.assertEqual({row["characterId"] for row in plan["characters"]}, set(source))
        for row in plan["characters"]:
            self.assertEqual(tuple(row["clipMap"]), MODULE.REQUIRED)
            self.assertFalse(set(row["clipMap"].values()) - set(source[row["characterId"]]["convertedClipNames"]))

    def test_runtime_registration_is_manual_candidate_only(self):
        plan = MODULE.read(MODULE.PLAN)
        self.assertEqual(plan["defaultPolicy"], "candidate-only")
        self.assertEqual(plan["semanticPolicy"], "same-source-semantic-fallback")


if __name__ == "__main__":
    unittest.main()
