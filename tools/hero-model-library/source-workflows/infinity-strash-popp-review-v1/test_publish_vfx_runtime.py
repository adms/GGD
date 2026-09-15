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
        self.assertEqual(self.receipt["summary"]["candidateRelationshipsBound"], 7)
        self.assertEqual(self.receipt["summary"]["reserveCandidatesReleasedUnbound"], 5)
        self.assertEqual(sum(row["skillBound"] for row in self.receipt["releasedVfx"]), 7)

    def test_q_w_r_bindings_are_bounded_and_resolve(self):
        self.assertEqual([row["abilityId"] for row in self.receipt["abilityBindings"]], [
            "b2-popp.q", "b2-popp.w", "b2-popp.r"
        ])
        by_id = {row["candidateId"]: row for row in self.receipt["releasedVfx"]}
        for binding in self.receipt["abilityBindings"]:
            self.assertLessEqual(len(binding["layers"]), 5)
            for layer in binding["layers"]:
                self.assertIn(layer["vfxKey"], {row["releaseVfxId"] for row in by_id.values()})
                self.assertLessEqual(layer["delayMs"], binding["castTimeSec"] * 1000)

    def test_native_niagara_and_mesh_limits_stay_explicit(self):
        self.assertFalse(self.receipt["states"]["nativeNiagaraTimingRecovered"])
        self.assertFalse(self.receipt["states"]["rootSpecificMeshLayersBound"])
        self.assertEqual(self.receipt["meshLayerBoundary"]["sourceSupportGlbs"], 33)
        self.assertEqual(self.receipt["meshLayerBoundary"]["rootSpecificAttributions"], 0)
        self.assertEqual(self.receipt["meshLayerBoundary"]["runtimeModelFxBindingsCreated"], 0)


if __name__ == "__main__":
    unittest.main()
