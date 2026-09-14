import importlib.util
import json
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("build_review_candidates.py")
SPEC = importlib.util.spec_from_file_location("build_review_candidates", SCRIPT)
MOD = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MOD)


class DaiVfxReviewCandidateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.result = MOD.build(write=False)

    def test_every_admitted_component_has_a_review_role(self):
        texture_ids = {
            item
            for candidate in self.result["candidates"]
            for item in candidate["sourceComponents"]["textureIds"]
        }
        texture_roles = {
            row["componentId"]
            for candidate in self.result["candidates"]
            for row in candidate["sourceComponents"]["textureUses"]
        }
        mesh_ids = {
            item
            for candidate in self.result["candidates"]
            for item in candidate["sourceComponents"]["meshIds"]
        }
        mesh_roles = {
            row["componentId"]
            for candidate in self.result["candidates"]
            for row in candidate["sourceComponents"]["meshUses"]
        }
        self.assertEqual(len(texture_ids), 18)
        self.assertEqual(texture_roles, texture_ids)
        self.assertEqual(len(mesh_ids), 8)
        self.assertEqual(mesh_roles, mesh_ids)

    def test_six_candidates_have_three_fixed_views_each(self):
        self.assertEqual(self.result["summary"]["reviewCandidatesBuilt"], 6)
        self.assertEqual(self.result["summary"]["fixedPreviewFrames"], 18)
        for candidate in self.result["candidates"]:
            self.assertEqual([row["time"] for row in candidate["previewEvidence"]], [0.0, 0.5, 1.0])
            self.assertTrue(all((MOD.REPO / row["gitPath"]).is_file() for row in candidate["previewEvidence"]))

    def test_all_decisions_and_bindings_remain_pending_or_empty(self):
        self.assertEqual(self.result["approvedBindings"], [])
        self.assertEqual(self.result["summary"]["ownerApproved"], 0)
        self.assertEqual(self.result["summary"]["approvedBindings"], 0)
        self.assertEqual(self.result["summary"]["runtimeMutations"], 0)
        self.assertFalse(self.result["boundary"]["runtimeMutationAllowed"])
        for candidate in self.result["candidates"]:
            self.assertEqual(candidate["ownerDecision"], "pending")
            self.assertEqual(candidate["approvedBindings"], [])
            self.assertFalse(candidate["states"]["niagaraTimingRecovered"])
            self.assertFalse(candidate["states"]["skillEventIdentified"])
            self.assertFalse(candidate["states"]["skeletonAttachmentIdentified"])
            self.assertFalse(candidate["states"]["visuallyApproved"])
            self.assertFalse(candidate["states"]["runtimeBindingCreated"])
            self.assertFalse(candidate["states"]["runtimeSelectable"])

    def test_no_runtime_content_is_generated(self):
        self.assertEqual(list((MOD.REPO / "content/vfx").glob("fx.strash.dai.*candidate*.json")), [])

    def test_unbound_inventory_matches_the_candidate_boundary(self):
        path = MOD.OUTPUT / "unused-assets.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        self.assertEqual(data["summary"]["unboundTextureComponents"], 18)
        self.assertEqual(data["summary"]["unboundMeshComponents"], 8)
        self.assertEqual(data["summary"]["runtimeBindings"], 0)
        self.assertEqual(len(data["components"]), 26)
        self.assertTrue(all(row["runtimeState"] == "unbound-reserve" for row in data["components"]))

    def test_receipt_pins_every_generated_review_artifact(self):
        receipt = json.loads((MOD.OUTPUT / "receipt.json").read_text(encoding="utf-8"))
        self.assertTrue(receipt["allGeneratedBytesVerified"])
        self.assertFalse(receipt["runtimeMutationAllowed"])
        rows = [receipt[key] for key in ("manifest", "unusedAssets", "document", "reviewPage", "contactSheet")]
        rows.extend(receipt["previewFiles"])
        self.assertEqual(len(receipt["previewFiles"]), 18)
        for row in rows:
            path = MOD.REPO / row["gitPath"]
            self.assertEqual(path.stat().st_size, row["bytes"])
            self.assertEqual(MOD.sha256(path), row["sha256"])

    def test_four_day_report_uses_the_authority(self):
        report = (MOD.REPO / "materials/hero-model-library/近四日新增模型動作特效清單.md").read_text(encoding="utf-8")
        self.assertIn("generated:infinity-strash-dai-vfx-review-candidates-v1:start", report)
        self.assertIn("owner 核准 0", report)


if __name__ == "__main__":
    unittest.main()
