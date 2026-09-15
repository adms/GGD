import hashlib
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
EVIDENCE = ROOT / "materials/hero-model-library/priority-evidence/jump-force-dai-decimation-v2"
OLD_OWNER_REVIEW = ROOT / "materials/hero-model-library/priority-evidence/jump-force-dai-decimation-v1/owner-review.json"
EXPECTED_SHA = "2b3030a97ff3add18e8addbc5d0ab39153e66d2da45a0d5ccf1dc10ff0fc55ba"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


class JumpForceDaiV2WorkflowTest(unittest.TestCase):
    def test_frozen_conversion_and_validation(self):
        conversion = json.loads((EVIDENCE / "conversion.json").read_text())
        validation = json.loads((EVIDENCE / "validation.json").read_text())
        guard = json.loads((EVIDENCE / "guard.json").read_text())
        draw = json.loads((EVIDENCE / "draw-call-audit.json").read_text())
        self.assertEqual(conversion["schema"], "ggd.jump-force-dai-decimation@2")
        self.assertEqual(conversion["output"]["sha256"], EXPECTED_SHA)
        self.assertEqual(conversion["rebuild"]["sha256"], EXPECTED_SHA)
        self.assertTrue(conversion["byteIdenticalRebuild"])
        self.assertEqual(conversion["observed"]["triangles"], 7930)
        self.assertEqual(conversion["observed"]["maxTextureEdge"], 256)
        self.assertEqual(validation["candidate"]["sha256"], EXPECTED_SHA)
        self.assertEqual(validation["metrics"], {"triangles": 7930, "draws": 20, "textureEdge": 256, "skins": 1, "joints": 159, "textures": 24, "animations": 0})
        self.assertEqual(validation["khronos"]["errors"], 0)
        self.assertTrue(validation["finiteFloatAccessors"]["passed"])
        self.assertTrue(validation["preservation"]["jointNamesAndHierarchyEquivalent"])
        self.assertTrue(validation["preservation"]["materialAndTextureSlotMultisetEquivalent"])
        self.assertTrue(validation["eyeOverlayRepair"]["underlyingEyeTextureRetained"])
        for overlay in validation["eyeOverlayRepair"]["transparentOverlays"].values():
            self.assertEqual(overlay["size"], [256, 256])
            self.assertEqual(overlay["alphaExtrema"], [0, 0])
        result = guard["results"][0]
        axes = {row["key"]: row for row in result["axes"]}
        self.assertEqual(result["adoption"]["status"], "eligible")
        self.assertEqual(result["adoption"]["triggerTrianglesAbove"], 10000)
        self.assertEqual(result["adoption"]["targetTrianglesMax"], 8000)
        self.assertEqual(axes["drawCalls"]["limit"], 6)
        self.assertEqual(axes["drawCalls"]["verdict"], "over")
        self.assertEqual(draw["observed"]["drawPrimitives"], 20)
        self.assertFalse(validation["runtimeSelectable"])

    def test_tool_pins_are_repo_relative_and_current(self):
        conversion = json.loads((EVIDENCE / "conversion.json").read_text())
        for key in ("workflow", "eyeRepair", "textureReplacement", "textureOptimizer"):
            record = conversion["tools"][key]
            self.assertFalse(Path(record["gitPath"]).is_absolute())
            path = ROOT / record["gitPath"]
            self.assertEqual(path.stat().st_size, record["bytes"])
            self.assertEqual(sha(path), record["sha256"])

    def test_owner_decisions_do_not_override_runtime_gate(self):
        old = json.loads(OLD_OWNER_REVIEW.read_text())
        current = json.loads((EVIDENCE / "owner-review.json").read_text())
        self.assertEqual(old["decision"], "rejected")
        self.assertEqual(old["supersedes"]["priorValue"], "accepted")
        self.assertEqual(current["decision"], "publication-authorized-when-technical-gates-pass")
        self.assertTrue(current["technicalGatesStillApply"])
        self.assertTrue(current["states"]["backendRegistrationAuthorized"])
        self.assertFalse(current["states"]["runtimeSelectable"])

    def test_visual_files_are_pinned(self):
        visual = json.loads((EVIDENCE / "visual-review.json").read_text())
        self.assertEqual(visual["candidateSha256"], EXPECTED_SHA)
        self.assertTrue(visual["webglLoadComplete"])
        self.assertEqual(visual["ownerVisualQualityReview"], "pending-new-v2-render-review")
        records = [*visual["views"].values(), *visual["faceComparisons"].values()]
        for record in records:
            path = ROOT / record["gitPath"]
            self.assertEqual(path.stat().st_size, record["bytes"])
            self.assertEqual(sha(path), record["sha256"])


if __name__ == "__main__":
    unittest.main()
