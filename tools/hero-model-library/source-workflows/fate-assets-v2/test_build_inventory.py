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
        self.assertEqual(summary["runtimeSelectable"], 4)
        self.assertEqual(summary["backendHeroOptions"], 5)
        self.assertEqual(summary["gitRuntimeComponents"], 14)
        self.assertEqual(summary["eventMapComplete"], 14)
        self.assertEqual(summary["pspPayloadBytesRead"], 0)
        self.assertEqual(summary["fucStandardGlbCandidates"], 13)
        self.assertEqual(summary["fucPspReplacementTextures"], 103)
        self.assertEqual(summary["fucCommunityMotionEntries"], 349)
        self.assertEqual(summary["fucNativeMotionEntries"], 0)
        self.assertEqual(summary["fucNativeVfxEntries"], 0)
        self.assertTrue(all(not row["source"]["nativeFucPsp"] for row in inventory["minecraftCommunity"]["servants"]))
        self.assertEqual(sum(row["registration"]["eligible"] for row in inventory["minecraftCommunity"]["servants"]), 4)

    def test_motion_semantics_label_same_source_fallbacks(self):
        inventory, _document, _entry = MODULE.build(MODULE.WORKSPACE)
        by_id = {row["characterId"]: row for row in inventory["minecraftCommunity"]["servants"]}
        heracles = by_id["heracles_berserker"]
        self.assertEqual(heracles["motionSemantics"]["death"], ["death"])
        self.assertEqual(heracles["motionSemantics"]["run"], ["run"])
        self.assertEqual(heracles["missingRequiredActions"], [])
        self.assertTrue(all(set(row["runtimeClipMap"]) == {"idle", "run", "attack", "cast", "hurt", "death"} for row in by_id.values()))
        self.assertTrue(all(row["runtimeMotionSemanticClass"] == "same-source-semantic-fallback" for row in by_id.values()))


if __name__ == "__main__":
    unittest.main()
