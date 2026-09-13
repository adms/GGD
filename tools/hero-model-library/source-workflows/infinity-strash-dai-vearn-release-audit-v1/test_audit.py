import importlib.util
import unittest
from pathlib import Path


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("strash_release_audit", HERE / "audit.py")
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class StrashReleaseAuditTest(unittest.TestCase):
    def test_current_checkout_has_three_byte_backed_candidates(self):
        report = MODULE.build(MODULE.DEFAULT_REPO)
        self.assertEqual(report["summary"]["acceptedAndDropdownRegistered"], 3)
        self.assertEqual(report["summary"]["activeDefaults"], 2)
        self.assertEqual(report["summary"]["nativeRuntimeClips"], 15)
        self.assertFalse(report["summary"]["productionDeploymentVerifiedThisRun"])
        for row in report["releaseCandidates"]:
            self.assertTrue(row["formalAdoption"]["eligible"])
            self.assertTrue(row["formalAdoption"]["visualGatePassed"])
            self.assertEqual(row["formalAdoption"]["humanVisualReview"], "accepted")
            self.assertTrue(row["registration"]["runtimeDropdownRegistered"])
            self.assertTrue(row["registration"]["retainedHighPolyOptionPresent"])
            self.assertLessEqual(row["metrics"]["triangles"], 8000)
            self.assertLessEqual(row["metrics"]["maxTextureEdge"], 256)
            self.assertEqual(set(row["clipMap"]), {"idle", "run", "attack", "cast", "hurt", "death"})

    def test_vearn_and_baran_boundaries_are_explicit(self):
        report = MODULE.build(MODULE.DEFAULT_REPO)
        forms = report["vearnForms"]
        self.assertEqual(forms["preTransformation"]["nativeId"], "EN801")
        self.assertFalse(forms["postTransformation"]["fullBodyLocated"])
        self.assertEqual(forms["postTransformation"]["candidatePayloadCount"], 0)
        excluded = {row["nativeId"]: row["identity"] for row in forms["identityExclusions"]}
        self.assertEqual(excluded["EN653"], "MystVearn")
        self.assertEqual(excluded["EN680"], "Baran")
        self.assertEqual(excluded["EN681"], "Baran form")

    def test_raw_vfx_and_audio_stay_honestly_separated(self):
        report = MODULE.build(MODULE.DEFAULT_REPO)
        materials = report["sourceMaterials"]
        self.assertEqual(materials["rawPackages"]["verifiedFilesThisRun"], 4740)
        self.assertEqual(materials["vfx"]["PN010"]["rawPackageFiles"], 182)
        self.assertEqual(materials["vfx"]["EN801"]["rawPackageFiles"], 169)
        self.assertEqual(materials["vfx"]["PN010"]["ggdVfxConverted"], 0)
        self.assertEqual(materials["audio"]["identities"]["PN010"]["decodedMedia"], 359)
        self.assertEqual(materials["audio"]["identities"]["EN801"]["decodedMedia"], 140)
        self.assertFalse(materials["audio"]["listeningReviewComplete"])
        self.assertEqual(materials["audio"]["runtimeBindingsCreated"], 0)

    def test_output_is_deterministic(self):
        first = MODULE.build(MODULE.DEFAULT_REPO)
        second = MODULE.build(MODULE.DEFAULT_REPO)
        self.assertEqual(first, second)
        self.assertEqual(MODULE.render_markdown(first), MODULE.render_markdown(second))


if __name__ == "__main__":
    unittest.main()
