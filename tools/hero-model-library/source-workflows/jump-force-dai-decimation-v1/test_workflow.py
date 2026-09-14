import hashlib
import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
EVIDENCE = ROOT / "materials/hero-model-library/priority-evidence/jump-force-dai-decimation-v1"
INTEGRATE_PATH = Path(__file__).with_name("integrate.py")
SPEC = importlib.util.spec_from_file_location("jump_force_dai_decimation_integrate", INTEGRATE_PATH)
INTEGRATE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(INTEGRATE)


class DaiDecimationWorkflowTest(unittest.TestCase):
    def test_frozen_evidence_and_non_promotion(self):
        conversion = json.loads((EVIDENCE / "conversion.json").read_text())
        validation = json.loads((EVIDENCE / "validation.json").read_text())
        draw = json.loads((EVIDENCE / "draw-call-audit.json").read_text())
        visual = json.loads((EVIDENCE / "visual-comparison.json").read_text())
        self.assertEqual(conversion["input"]["sha256"], "53b3b19eb04e2eb0e6d1827122f5b41a403c2ced188bd3042371c9dec80cd810")
        self.assertEqual(conversion["output"]["sha256"], "f8f3f1c025b50c76f0c31beddd2876733215bc48dc0a47238cb35c58016d1b23")
        self.assertTrue(conversion["byteIdenticalRebuild"])
        self.assertEqual(validation["metrics"]["after"]["triangles"], 7947)
        self.assertEqual(validation["metrics"]["after"]["maxTextureEdge"], 256)
        self.assertEqual(validation["metrics"]["after"]["drawPrimitives"], 20)
        self.assertEqual(validation["metrics"]["after"]["joints"], 159)
        self.assertTrue(validation["preservation"]["rig"]["ok"])
        self.assertEqual(validation["khronos"]["errors"], 0)
        self.assertTrue(validation["finiteFloatAccessors"]["passed"])
        self.assertFalse(validation["currentPolicy"]["drawCallPassed"])
        self.assertFalse(validation["componentAcceptedForGitRuntime"])
        self.assertEqual(draw["observed"]["exactSemanticMaterialGroups"], 11)
        self.assertEqual(draw["observed"]["atlasEligiblePrimitives"], 2)
        self.assertFalse(draw["decision"]["safeCurrentAutomationCanReachSix"])
        self.assertLessEqual(visual["maxLitClassificationXorPctAtLuma128"], 5)
        self.assertEqual(visual["humanReview"]["result"], "accepted")
        for name, record in (("ab-contact-sheet.png", visual["contactSheet"]), ("worst-difference-overview.png", visual["worstDifferenceOverview"])):
            path = EVIDENCE / name
            self.assertEqual(path.stat().st_size, record["bytes"])
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), record["sha256"])

    def test_central_source_record_is_reproducible(self):
        current = json.loads(INTEGRATE.DOWNLOADS.read_text())
        self.assertEqual(INTEGRATE.build(current), current)
        source = next(row for row in current["publicSources"] if row["id"] == INTEGRATE.SOURCE_ID)
        candidates = [row for row in source["modelCandidates"] if row["candidateId"] == INTEGRATE.CANDIDATE_ID]
        self.assertEqual(len(candidates), 1)
        self.assertFalse(candidates[0]["ggdHardPolicyPassed"])
        self.assertFalse(candidates[0]["runtimeSelectable"])


if __name__ == "__main__":
    unittest.main()
