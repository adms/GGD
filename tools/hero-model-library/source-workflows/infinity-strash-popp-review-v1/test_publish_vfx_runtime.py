import importlib.util
import unittest
from pathlib import Path


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("publish_popp_vfx", HERE / "publish_vfx_runtime.py")
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class PublishPoppVfxRuntimeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.outputs, cls.receipt = MODULE.expected_outputs()

    def test_all_owner_approved_candidates_are_released(self):
        self.assertEqual(self.receipt["summary"]["ownerApprovedVfxReleased"], 12)
        self.assertEqual(self.receipt["summary"]["ownerApprovedVfxReleasedUnbound"], 12)
        self.assertEqual(self.receipt["summary"]["candidateRelationshipsProposed"], 7)
        self.assertEqual(self.receipt["summary"]["candidateRelationshipsBound"], 0)
        self.assertEqual(self.receipt["summary"]["reserveCandidatesReleasedUnbound"], 5)
        self.assertEqual(sum(row["skillBound"] for row in self.receipt["releasedVfx"]), 0)

    def test_q_w_r_keep_their_preexisting_generic_vfx(self):
        self.assertEqual(self.receipt["abilityBindings"], [])
        self.assertEqual([row["abilityId"] for row in self.receipt["preservedAbilityBindings"]], [
            "b2-popp.q", "b2-popp.w", "b2-popp.r"
        ])
        released_ids = {row["releaseVfxId"] for row in self.receipt["releasedVfx"]}
        for binding in self.receipt["preservedAbilityBindings"]:
            self.assertNotIn(binding["vfxKey"], released_ids)
            self.assertTrue(all(layer["vfxKey"] not in released_ids for layer in binding["vfxLayers"]))
        self.assertFalse(self.receipt["states"]["featureBranchSkillBindingsCreated"])
        self.assertTrue(self.receipt["states"]["candidateOnly"])
        self.assertTrue(self.receipt["states"]["existingAbilityBindingsPreserved"])

    def test_native_niagara_and_mesh_limits_stay_explicit(self):
        self.assertFalse(self.receipt["states"]["nativeNiagaraTimingRecovered"])
        self.assertFalse(self.receipt["states"]["rootSpecificMeshLayersBound"])
        self.assertEqual(self.receipt["meshLayerBoundary"]["sourceSupportGlbs"], 33)
        self.assertEqual(self.receipt["meshLayerBoundary"]["rootSpecificAttributions"], 0)
        self.assertEqual(self.receipt["meshLayerBoundary"]["runtimeModelFxBindingsCreated"], 0)


if __name__ == "__main__":
    unittest.main()
