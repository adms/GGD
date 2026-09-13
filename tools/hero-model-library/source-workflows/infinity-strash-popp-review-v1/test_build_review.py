import importlib.util
import json
import unittest
from pathlib import Path


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("popp_review", HERE / "build_review.py")
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class PoppReviewTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.contract = MODULE.build_contract()

    def test_three_independent_weapon_options_are_verified_and_owner_selection_is_applied(self):
        review = self.contract["weaponReview"]
        self.assertEqual([row["staff"] for row in review["candidates"]], ["Magikaru", "Mahouno", "Kagayaki"])
        self.assertEqual(review["selectedCandidateId"], "infinity-strash-popp-pn020-02-kagayaki-native-v1")
        self.assertEqual(review["status"], "owner-selection-applied")
        self.assertFalse(review["automaticDefaultChangeAllowed"])
        self.assertTrue(all(row["backendDropdownOptionPresentOnFeatureBranch"] for row in review["candidates"]))
        self.assertEqual(len({row["glb"]["sha256"] for row in review["candidates"]}), 3)

    def test_five_gaps_preserve_review_and_readiness_boundaries(self):
        gaps = self.contract["fiveOpenIntegrationGaps"]
        self.assertEqual(len(gaps), 5)
        death = next(row for row in gaps if row["id"] == "distinct-death-presentation")
        self.assertEqual(death["candidate"]["motionProvenance"], "native PN020 down loop")
        self.assertFalse(death["candidate"]["borrowedMotion"])
        self.assertTrue(death["candidate"]["reviewRequired"])
        self.assertTrue(death["candidate"]["runtimeImplemented"])
        self.assertEqual(death["status"], "owner-approved-existing-runtime-bound")
        self.assertEqual(self.contract["remainingOpenIntegrationGapCount"], 4)
        events = next(row for row in gaps if row["id"] == "animation-events-and-sfx-binding")
        self.assertEqual(events["status"], "pending-user-listening-review")
        audio = self.contract["audioReviewEvidence"]
        self.assertEqual(audio["fileCount"], 311)
        self.assertFalse(audio["allListeningReviewComplete"])
        self.assertFalse(audio["allSpeakerVerified"])
        self.assertEqual(self.contract["sourceDependencyEvidence"]["vfxReferenceCount"], 17)
        self.assertTrue(self.contract["sourceDependencyEvidence"]["rawPackageNamesAreNotAssetAcquisition"])
        vfx = self.contract["vfxRuntimeCandidates"]
        self.assertEqual(vfx["summary"]["ggdVfxDocumentsBuilt"], 12)
        self.assertEqual(vfx["summary"]["identityExcludedRoots"], 2)
        self.assertEqual(vfx["summary"]["skillBindingsCreated"], 0)
        gate = self.contract["eventAudioReviewGate"]
        self.assertEqual(gate["candidateCount"], 36)
        self.assertEqual(gate["reviewedCount"], 0)
        self.assertFalse(gate["automaticBindingAllowed"])
        self.assertFalse(gate["runtimeSelectable"])

    def test_html_has_visible_state_controls_and_applied_owner_receipt(self):
        page = MODULE.build_html(self.contract)
        self.assertIn("reviewContactSheet", page)
        self.assertIn("實際 WebGL：0%／50%／100%", page)
        self.assertNotIn("<iframe", page)
        self.assertIn("popp-native-down-rise-fade-v1", page)
        self.assertIn("weaponCandidateId:D.weaponReview.selectedCandidateId", page)
        self.assertIn("下載裁決 JSON", page)

    def test_every_candidate_has_a_pinned_visible_contact_sheet(self):
        for row in self.contract["weaponReview"]["candidates"]:
            sheet = row["validation"]["reviewContactSheet"]
            source = MODULE.ROOT / sheet["gitPath"]
            self.assertEqual(MODULE.sha256(source), sheet["sha256"])
            self.assertEqual(sheet["states"], ["idle", "run", "attack", "cast", "hurt", "death"])
            self.assertEqual(sheet["samplesPerState"], [0, 50, 100])


if __name__ == "__main__":
    unittest.main()
