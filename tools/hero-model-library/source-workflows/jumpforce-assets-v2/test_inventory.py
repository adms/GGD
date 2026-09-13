import importlib.util
import unittest
from pathlib import Path


PATH = Path(__file__).with_name("build_inventory.py")
SPEC = importlib.util.spec_from_file_location("jumpforce_assets_v2", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class JumpForceInventoryTest(unittest.TestCase):
    def test_catalog_and_review_boundaries(self):
        inventory, queue, _, _ = MODULE.build(MODULE.WORKSPACE)
        self.assertEqual(inventory["summary"]["publicPackages"], 58)
        self.assertEqual(inventory["summary"]["publicCharacterPackages"], 57)
        self.assertEqual(inventory["summary"]["nativeToPublicCharacterMappings"], 32)
        self.assertEqual(queue["counts"]["groups"], 89)
        self.assertEqual(queue["counts"]["approvedForRuntimeBinding"], 0)
        self.assertEqual(len(queue["excluded"]["unresolvedSteamNativeIds"]), 5)
        self.assertFalse(inventory["stages"]["audioSpeakerEventBindingVerified"])
        self.assertFalse(inventory["stages"]["runtimeSelectable"])


if __name__ == "__main__":
    unittest.main()
