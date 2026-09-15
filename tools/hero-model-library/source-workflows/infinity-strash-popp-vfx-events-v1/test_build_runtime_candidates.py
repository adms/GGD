import importlib.util
import json
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("build_runtime_candidates.py")
SPEC = importlib.util.spec_from_file_location("build_runtime_candidates", SCRIPT)
MOD = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MOD)


class PoppRuntimeCandidateTests(unittest.TestCase):
    def test_generated_outputs_are_current(self):
        result = MOD.build(write=False)
        self.assertEqual(result["summary"]["ggdVfxDocumentsBuilt"], 12)
        self.assertEqual(result["summary"]["identityExcludedRoots"], 2)

    def test_no_candidate_claims_binding_or_acceptance(self):
        result = MOD.build(write=False)
        self.assertEqual(result["summary"]["skillBindingsCreated"], 0)
        self.assertEqual(result["summary"]["visuallyAccepted"], 0)
        self.assertEqual(result["policy"]["textureMaxEdge"], MOD.current_texture_edge_limit())
        self.assertTrue(
            all(
                max(row["textureConversion"]["width"], row["textureConversion"]["height"])
                <= result["policy"]["textureMaxEdge"]
                for row in result["candidates"]
            )
        )
        for row in result["candidates"]:
            self.assertFalse(row["states"]["skillBound"])
            self.assertFalse(row["states"]["visuallyAccepted"])
            self.assertFalse(row["states"]["runtimeSelectable"])

    def test_pn030_roots_never_become_popp_documents(self):
        result = MOD.build(write=False)
        self.assertTrue(all("/PN030/" in row["rootReference"] for row in result["excluded"]))
        self.assertTrue(all("/PN030/" not in row["rootReference"] for row in result["candidates"]))
        for row in result["candidates"]:
            doc = json.loads((MOD.REPO / row["vfxDocument"]["gitPath"]).read_text())
            self.assertEqual(doc["schema"], "vfx@1")
            self.assertTrue(doc["texture"].startswith("assets/"))


if __name__ == "__main__":
    unittest.main()
