import importlib.util
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("build_inventory.py")
SPEC = importlib.util.spec_from_file_location("fate_assets_build", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class FateInventoryTest(unittest.TestCase):
    def test_platform_boundaries_and_registration_gate(self):
        inventory, _document, _entry = MODULE.build(MODULE.WORKSPACE)
        summary = inventory["summary"]
        self.assertEqual(summary["minecraftServants"], 14)
        self.assertEqual(summary["hardPolicyPass"], 14)
        self.assertEqual(summary["runtimeSelectable"], 0)
        self.assertEqual(summary["pspPayloadBytesRead"], 0)
        self.assertTrue(all(not row["source"]["nativeFucPsp"] for row in inventory["minecraftCommunity"]["servants"]))
        self.assertTrue(all(not row["registration"]["eligible"] for row in inventory["minecraftCommunity"]["servants"]))

    def test_motion_semantics_do_not_invent_six_states(self):
        inventory, _document, _entry = MODULE.build(MODULE.WORKSPACE)
        by_id = {row["characterId"]: row for row in inventory["minecraftCommunity"]["servants"]}
        heracles = by_id["heracles_berserker"]
        self.assertEqual(heracles["motionSemantics"]["death"], ["death"])
        self.assertEqual(heracles["motionSemantics"]["run"], ["run"])
        self.assertIn("idle", heracles["missingRequiredActions"])
        self.assertTrue(all(row["motionSemantics"]["hurt"] == [] for row in by_id.values()))


if __name__ == "__main__":
    unittest.main()
