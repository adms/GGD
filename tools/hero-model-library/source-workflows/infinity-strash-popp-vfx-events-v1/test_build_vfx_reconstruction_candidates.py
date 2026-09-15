import importlib.util
import pathlib
import unittest


MODULE_PATH = pathlib.Path(__file__).with_name("build_vfx_reconstruction_candidates.py")
SPEC = importlib.util.spec_from_file_location("build_vfx_reconstruction_candidates", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class CandidateTests(unittest.TestCase):
    def test_family_is_only_name_token_inference(self):
        self.assertEqual(MODULE.family("/Game/NPS_Hyadaruko_Hit"), {"family": "ice", "phase": "hit"})
        self.assertEqual(MODULE.family("/Game/NPS_Raidein_Charge_Core"), {"family": "lightning", "phase": "charge"})

    def test_category(self):
        self.assertEqual(MODULE.category("/Game/VFX/Staticmesh/SM_A"), "staticMesh")
        self.assertEqual(MODULE.category("/Game/VFX/Material/MI_A"), "material")
        self.assertEqual(MODULE.category("/Game/VFX/Texture/T_A"), "texture")

    def test_reachable_records_shortest_distance_and_handles_cycle(self):
        packages = {
            "root": {"dependencies": ["a", "b"]},
            "a": {"dependencies": ["b", "root"]},
            "b": {"dependencies": []},
        }
        refs, distances = MODULE.reachable("root", packages)
        self.assertEqual(set(refs), {"root", "a", "b"})
        self.assertEqual(distances, {"root": 0, "a": 1, "b": 1})


if __name__ == "__main__":
    unittest.main()
