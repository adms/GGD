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
        inventory, queue, _, current_ref = MODULE.build(MODULE.WORKSPACE)
        self.assertEqual(inventory["summary"]["publicPackages"], 58)
        self.assertEqual(inventory["summary"]["publicCharacterPackages"], 57)
        self.assertEqual(inventory["summary"]["nativeToPublicCharacterMappings"], 32)
        self.assertEqual(queue["counts"]["groups"], 89)
        self.assertEqual(queue["counts"]["approvedForRuntimeBinding"], 0)
        self.assertEqual(len(queue["excluded"]["unresolvedSteamNativeIds"]), 5)
        self.assertFalse(inventory["stages"]["audioSpeakerEventBindingVerified"])
        self.assertFalse(inventory["stages"]["runtimeSelectable"])
        rejected = inventory["dai"]["rejectedV1Candidate"]
        self.assertEqual(rejected["triangles"], 7947)
        self.assertEqual(rejected["ownerDecision"], "rejected")
        self.assertTrue(rejected["priorAutomatedReceiptSuperseded"])
        candidate = inventory["dai"]["formalDecimationCandidate"]
        self.assertEqual(inventory["dai"]["frozenTreeFiles"], 2000)
        self.assertEqual(inventory["dai"]["frozenTreeBytes"], 299020729)
        self.assertEqual(inventory["dai"]["originalReviewGlb"]["bytes"], 76796608)
        self.assertEqual(inventory["dai"]["originalReviewGlb"]["sha256"], "53b3b19eb04e2eb0e6d1827122f5b41a403c2ced188bd3042371c9dec80cd810")
        self.assertEqual(candidate["after"]["triangles"], 7930)
        self.assertEqual(candidate["after"]["maxTextureEdge"], 256)
        self.assertEqual(candidate["after"]["drawPrimitives"], 20)
        self.assertEqual(candidate["after"]["animations"], 0)
        self.assertTrue(candidate["byteIdenticalRebuild"])
        self.assertTrue(candidate["rigPreserved"])
        self.assertTrue(candidate["technicalVisualInspectionPassed"])
        self.assertEqual(candidate["ownerVisualQualityReview"], "pending-new-v2-render-review")
        self.assertTrue(candidate["ownerPublicationAuthorized"])
        self.assertFalse(candidate["drawCallPassed"])
        self.assertFalse(candidate["runtimeRegistered"])
        self.assertFalse(candidate["runtimeSelectable"])
        self.assertFalse(candidate["productionDeployed"])
        self.assertFalse(candidate["s3Backup"]["fullGetVerified"])
        self.assertEqual(len(candidate["evidence"]), 12)
        six_draw = inventory["dai"]["sixDrawCandidate"]
        self.assertEqual(six_draw["after"]["triangles"], 7930)
        self.assertEqual(six_draw["after"]["drawPrimitives"], 6)
        self.assertEqual(six_draw["after"]["maxTextureEdge"], 256)
        self.assertTrue(six_draw["byteIdenticalRebuild"])
        self.assertTrue(six_draw["nonUvVertexAttributesPreserved"])
        self.assertTrue(six_draw["transparentEyeHairLayersKeptSeparate"])
        self.assertTrue(six_draw["drawCallPassed"])
        self.assertTrue(six_draw["gitProductFrozen"])
        self.assertFalse(six_draw["runtimeRegistered"])
        self.assertFalse(six_draw["runtimeSelectable"])
        self.assertFalse(six_draw["productionDeployed"])
        self.assertEqual(len(six_draw["evidence"]), 10)
        self.assertEqual(current_ref["daiCandidateStatus"]["sha256"], six_draw["sha256"])
        self.assertFalse(current_ref["daiCandidateStatus"]["runtimeSelectable"])


if __name__ == "__main__":
    unittest.main()
