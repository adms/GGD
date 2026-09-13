import importlib.util
import unittest
from pathlib import Path


MODULE = Path(__file__).with_name("build_index.py")
SPEC = importlib.util.spec_from_file_location("strash_dai_vearn_av", MODULE)
assert SPEC and SPEC.loader
build = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(build)


class BuildIndexTest(unittest.TestCase):
    def test_identity_scope_is_strict(self):
        self.assertEqual(set(build.IDENTITIES), {"PN010", "EN801"})
        self.assertEqual(set(build.EXCLUDED_IDENTITIES), {"EN653", "EN680", "EN681"})

    def test_event_labels_and_semantics(self):
        paths = ["x/Play_VO_ING_PN010_Skill_IORA.uasset"]
        self.assertEqual(build.event_label(paths[0]), "VO_ING_PN010_Skill_IORA")
        self.assertIn("skill-or-special", build.semantic_labels(paths))

    def test_generated_contracts_remain_runtime_inert(self):
        products = build.build_products()
        audio = __import__("json").loads(products[build.AUDIO_QUEUE])
        vfx = __import__("json").loads(products[build.VFX_INDEX])
        self.assertEqual(audio["summary"]["runtimeBindingsCreated"], 0)
        self.assertFalse(audio["policy"]["automaticRuntimeBindingAllowed"])
        self.assertEqual(sum(row["rowCount"] for row in audio["parts"]), audio["summary"]["candidateCount"])
        self.assertEqual(vfx["summary"]["ggdVfxConverted"], 0)
        self.assertEqual(vfx["summary"]["skillBindingsCreated"], 0)
        self.assertTrue(all(len(value.encode("utf-8")) < 256 * 1024 for path, value in products.items() if path.parent == build.OUTPUT and ".part-" in path.name))


if __name__ == "__main__":
    unittest.main()
