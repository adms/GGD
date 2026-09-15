import hashlib
import json
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[4]
EVIDENCE = ROOT / "materials/hero-model-library/priority-evidence/jump-force-dai-six-draw-v3"
SHA = "8be8b64eb20eeaeb4be1be69804dfe4486a11ce50c1ffa42849d16985775c71c"


class SixDrawDaiTest(unittest.TestCase):
    def test_frozen_component_and_bounded_readiness(self):
        validation = json.loads((EVIDENCE / "validation.json").read_text())
        candidate = ROOT / validation["candidate"]["gitPath"]
        self.assertEqual(hashlib.sha256(candidate.read_bytes()).hexdigest(), SHA)
        self.assertEqual(validation["metrics"]["triangles"], 7930)
        self.assertEqual(validation["metrics"]["drawPrimitives"], 6)
        self.assertEqual(validation["metrics"]["maxTextureEdge"], 256)
        self.assertEqual(validation["khronos"]["errors"], 0)
        self.assertTrue(validation["preservation"]["nonUvVertexAttributesByteEquivalentAsMultiset"])
        self.assertTrue(validation["states"]["drawCallLimitPassed"])
        self.assertEqual(validation["states"]["visualReview"], "pending-owner-review")
        self.assertEqual(validation["states"]["motionReview"], "blocked-no-reviewed-motion-binding")
        self.assertFalse(validation["states"]["backendOptionRegistered"])
        self.assertFalse(validation["states"]["runtimeSelectable"])
        self.assertFalse(validation["states"]["productionDeployed"])


if __name__ == "__main__":
    unittest.main()
