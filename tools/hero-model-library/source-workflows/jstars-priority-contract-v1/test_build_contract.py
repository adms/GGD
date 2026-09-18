import importlib.util
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("build_contract.py")
SPEC = importlib.util.spec_from_file_location("jstars_priority_contract", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class ContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.payload = MODULE.build(MODULE.repo_root())

    def test_scope_is_exactly_six_priority_characters(self):
        self.assertEqual(
            [row["slug"] for row in self.payload["characters"]],
            ["gintoki", "nube", "gon", "killua", "luckyman", "hiei"],
        )

    def test_only_evidence_backed_native_id_is_written(self):
        ids = {row["slug"]: row["nativeId"] for row in self.payload["characters"]}
        self.assertEqual(ids["killua"], "018")
        self.assertTrue(all(ids[slug] is None for slug in ids if slug != "killua"))

    def test_policy_is_read_from_current_runtime_sources(self):
        policy = self.payload["runtimePolicy"]
        self.assertEqual(policy["decimateWhenTrianglesAbove"], 10000)
        self.assertEqual(policy["decimatedTargetTrianglesMax"], 8000)
        self.assertEqual(policy["textureEdgeLimit"], 256)
        self.assertEqual(policy["animationChannelWarning"], 300)
        self.assertEqual(policy["animationChannelLimit"], 500)
        self.assertFalse(self.payload["policyConflict"]["exists"])
        self.assertEqual(
            self.payload["ownerAdoptionRule"]["decimatedCandidateMustBeAtMost"],
            8000,
        )
        self.assertEqual(self.payload["ownerAdoptionRule"]["maximumAcceptedTriangles"], 8000)

    def test_path_hits_never_become_completion_claims(self):
        self.assertEqual(self.payload["summary"]["charactersConverted"], 0)
        self.assertEqual(self.payload["summary"]["charactersRegistered"], 0)
        self.assertEqual(self.payload["summary"]["charactersDeployed"], 0)
        for row in self.payload["characters"]:
            self.assertFalse(row["conversionComplete"])
            self.assertFalse(row["registered"])
            self.assertFalse(row["deployVerified"])
            self.assertEqual(set(row["modules"]), set(MODULE.MODULES))
            for module in row["modules"].values():
                self.assertIsInstance(module["containerLocations"], list)


if __name__ == "__main__":
    unittest.main()
