import importlib.util
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("build_inventory.py")
SPEC = importlib.util.spec_from_file_location("smash_cross_generation_readiness", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(MODULE)
WORKSPACE = Path("/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT")


class SmashCrossGenerationReadinessTest(unittest.TestCase):
    def test_source_stages_remain_separate(self):
        data = MODULE.build(WORKSPACE, Path("/Applications/Blender.app/Contents/MacOS/Blender"))
        by_generation = {row["generation"]: row for row in data["generations"]}
        self.assertEqual(by_generation["Nintendo 64"]["sourcePayloadsReadableNow"], 0)
        self.assertEqual(by_generation["Nintendo Switch game containers"]["sourcePayloadBytesRead"], 0)
        self.assertEqual(by_generation["GameCube"]["modelsReadyForConversion"], 0)
        self.assertEqual(by_generation["Wii"]["motionsReadyForConversion"], 0)
        self.assertGreater(data["summary"]["switchCommunityModelCandidates"], 0)
        self.assertIn(data["inputConsistency"]["status"], {"current", "stale-upstream-reconciliation-rebuild-required"})
        self.assertEqual(data["summary"]["newConvertedCandidatesThisAudit"], 0)
        self.assertEqual(data["summary"]["macosBlenderToolInitBlockers"], 1)
        blocker = data["tooling"]["samusMacosBlender522Blocker"]
        self.assertEqual(blocker["status"], "blocked-tool-init-crash")
        self.assertFalse(blocker["converted"])
        self.assertFalse(blocker["runtimeSelectable"])
        self.assertFalse(data["summary"]["productionDeploymentVerified"])


if __name__ == "__main__":
    unittest.main()
